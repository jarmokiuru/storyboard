// Plain clothes on the figures (Jarmo, 2026-11-18): shirt, trousers and shoes, no detail. Made from the body itself — no
// extra models or triangles. Every vertex is sorted by the bone that moves it most (torso and arms → shirt, hips and
// legs → trousers, feet → shoes; head, neck and hands stay skin); on the torso a level waist and collar decide instead.
// Under the clothes the body is smoothed (strongly around the crotch) and the clothes sit loose. The colours are chosen per pixel in the shader, from
// those parts blended across each triangle, so the edges run straight instead of following the body's long triangles.
// The shirt wears the character's colour; trousers and shoes are clay greys.

import * as THREE from "three";

export const CLOTH = { skin: "#d6d1c9", trousers: "#62666d", shoes: "#2f3135" };

// How far each part stands off the body, as a share of the figure's height (1.8 m figure: about 2 cm), so the
// clothes sit a little loose rather than skin-tight (Jarmo, 2026-11-18).
const OUT = [0, 0.011, 0.012, 0.02];   // skin, shirt, trousers, shoes (shoes stand proud of the trouser hems)

// Smoothing passes under the clothes: a few everywhere (loose cloth hides the body's detail), many more around the
// crotch and seat so nothing anatomical shows through.
const SMOOTH = 4;
const SMOOTH_CROTCH = 24;
// The crotch is then filled in like a stretched sheet: no fold between the thighs, the same neutral shape on every
// body (Jarmo, 2026-11-18). Passes of plain smoothing, strongest at the middle of the zone.
const SHEET = 120;

function partOf(bone) {
  if (/Foot|ToeBase|^leaf01[12]$/.test(bone)) return 3;
  if (/Hips|UpLeg|Leg/.test(bone)) return 2;
  if (/Spine|Shoulder|Arm/.test(bone)) return 1;   // Arm also matches ForeArm: long sleeves to the wrist
  return 0;   // Head, Neck, eyes, Hand and fingers
}

// The files split vertices along texture seams; these ids join copies at the same spot, so smoothing and shading
// treat them as one point.
function weld(pos) {
  const key = new Map();
  const id = new Uint32Array(pos.count);
  for (let v = 0; v < pos.count; v++) {
    const k = `${Math.round(pos.getX(v) * 1e4)},${Math.round(pos.getY(v) * 1e4)},${Math.round(pos.getZ(v) * 1e4)}`;
    if (!key.has(k)) key.set(k, key.size);
    id[v] = key.get(k);
  }
  return { id, count: key.size };
}

// Dress every skinned mesh of a loaded figure once (the geometry is shared by every copy of that body).
export function dress(root) {
  root.traverse((m) => {
    if (!m.isSkinnedMesh || m.userData.dressed) return;
    m.userData.dressed = true;
    const g = m.geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    if (!nor || !si || !sw || !g.index) return;
    g.computeBoundingBox();
    const height = g.boundingBox.max.y - g.boundingBox.min.y || 1;
    const names = m.skeleton.bones.map((b) => b.name);
    // Where a bone sits in the body at rest, in the mesh's own space.
    const boneAt = (name) => {
      const i = names.indexOf(name);
      if (i < 0) return null;
      const at = new THREE.Matrix4().copy(m.skeleton.boneInverses[i]).invert().premultiply(m.bindMatrixInverse);
      return new THREE.Vector3().setFromMatrixPosition(at);
    };
    const boneY = (name) => boneAt(name)?.y ?? null;
    // Cuffs and hems: a flat cut across the limb, near the wrist (sleeve → skin) and above the ankle (trousers → shoes).
    // d > 0 is the hand or shoe side.
    const cut = (from, to, shift) => {
      const a = boneAt(from), b = boneAt(to);
      if (!a || !b) return null;
      const axis = b.clone().sub(a).normalize();
      return (x, y, z) => (x - b.x) * axis.x + (y - b.y) * axis.y + (z - b.z) * axis.z + shift * height;
    };
    const cuts = {
      Left: { arm: cut("LeftForeArm", "LeftHand", 0.012), leg: cut("LeftLeg", "LeftFoot", 0.03) },
      Right: { arm: cut("RightForeArm", "RightHand", 0.012), leg: cut("RightLeg", "RightFoot", 0.03) },
    };
    const [hips, spine, neck, head] = ["Hips", "Spine", "Neck", "Head"].map(boneY);
    const waist = hips != null && spine != null ? spine + (spine - hips) * 0.2 : g.boundingBox.min.y + height * 0.55;
    const collar = neck != null && head != null ? neck + (head - neck) * 0.05 : g.boundingBox.min.y + height * 0.83;
    const crotchLow = (hips ?? g.boundingBox.min.y + height * 0.5) - height * 0.12;
    // The sheet zone: centred between the hip joints, from the crotch down the inner thighs, front to back.
    const legL = boneAt("LeftUpLeg"), legR = boneAt("RightUpLeg");
    const midX = legL && legR ? (legL.x + legR.x) / 2 : 0;
    const legY = legL && legR ? (legL.y + legR.y) / 2 : (hips ?? g.boundingBox.min.y + height * 0.5);
    const sheetAt = (x, y) => {
      const ax = Math.abs(x - midX) / (height * 0.085);
      const ay = (y - (legY - height * 0.05)) / (height * (y < legY - height * 0.05 ? 0.07 : 0.09));
      const r = ax * ax + ay * ay;
      return r >= 1 ? 0 : (1 - r) * (1 - r);
    };

    // 1. Which part each vertex belongs to.
    const part = new Uint8Array(pos.count);
    const parts = new Float32Array(pos.count * 4);   // one-hot: skin, shirt, trousers, shoes
    const torso = new Float32Array(pos.count);
    const restY = new Float32Array(pos.count);
    const limb = new Float32Array(pos.count * 2);   // [kind (−1 arm, 0 none, +1 leg: blends never cross), distance past the cut]
    for (let v = 0; v < pos.count; v++) {
      const w = [0, 0, 0, 0];
      let t = 0;
      let top = "", topW = 0;
      for (let k = 0; k < 4; k++) {
        const name = names[si.getComponent(v, k)] || "";
        const weight = sw.getComponent(v, k);
        w[partOf(name)] += weight;
        if (/^(Hips|Spine|Spine1|Spine2|Neck)$/.test(name)) t += weight;
        if (weight > topW) { topW = weight; top = name; }
      }
      let p = w.indexOf(Math.max(...w));
      const [x, y, z] = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      restY[v] = y;
      torso[v] = t > 0.5 && p !== 3 ? 1 : 0;
      if (torso[v]) p = y < waist ? 2 : y > collar ? 0 : 1;
      const side = /^Left/.test(top) ? "Left" : /^Right/.test(top) ? "Right" : null;
      if (side && /(ForeArm|Hand)/.test(top) && cuts[side].arm) {
        const d = cuts[side].arm(x, y, z);
        limb[v * 2] = -1; limb[v * 2 + 1] = d;
        p = d > 0 ? 0 : 1;
      } else if (side && /(Leg|Foot|ToeBase)$/.test(top) && !/UpLeg/.test(top) && cuts[side].leg) {
        const d = cuts[side].leg(x, y, z);
        limb[v * 2] = 1; limb[v * 2 + 1] = d;
        p = d > 0 ? 3 : 2;
      }
      part[v] = p;
      parts[v * 4 + p] = 1;
    }

    // 2. Smooth the body under the shirt and trousers (Taubin smoothing: alternate in and out steps so it doesn't
    // shrink). Skin and shoes stay as they are.
    const { id, count } = weld(pos);
    const P = new Float32Array(count * 3);
    const passes = new Uint8Array(count);
    const fixed = new Uint8Array(count);
    const sheet = new Float32Array(count);
    for (let v = 0; v < pos.count; v++) {
      const u = id[v];
      P[u * 3] = pos.getX(v); P[u * 3 + 1] = pos.getY(v); P[u * 3 + 2] = pos.getZ(v);
      if (part[v] === 0 || part[v] === 3) fixed[u] = 1;
      else passes[u] = Math.max(passes[u], part[v] === 2 && restY[v] > crotchLow && restY[v] < waist ? SMOOTH_CROTCH : SMOOTH);
      if (part[v] === 2) sheet[u] = Math.max(sheet[u], sheetAt(pos.getX(v), restY[v]));
    }
    const near = Array.from({ length: count }, () => new Set());
    const idx = g.index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]];
      near[a].add(b).add(c); near[b].add(a).add(c); near[c].add(a).add(b);
    }
    const step = (factor, pass) => {
      const next = P.slice();
      for (let u = 0; u < count; u++) {
        if (fixed[u] || passes[u] <= pass || !near[u].size) continue;
        let x = 0, y = 0, z = 0;
        for (const n of near[u]) { x += P[n * 3]; y += P[n * 3 + 1]; z += P[n * 3 + 2]; }
        const k = near[u].size;
        next[u * 3] += factor * (x / k - P[u * 3]);
        next[u * 3 + 1] += factor * (y / k - P[u * 3 + 1]);
        next[u * 3 + 2] += factor * (z / k - P[u * 3 + 2]);
      }
      P.set(next);
    };
    // The sheet first: plain smoothing (no step back out), so the fold between the thighs fills in.
    for (let pass = 0; pass < SHEET; pass++) {
      const next = P.slice();
      for (let u = 0; u < count; u++) {
        if (!sheet[u] || fixed[u]) continue;
        let x = 0, y = 0, z = 0;
        for (const n of near[u]) { x += P[n * 3]; y += P[n * 3 + 1]; z += P[n * 3 + 2]; }
        const k = near[u].size, f = 0.6 * sheet[u];
        next[u * 3] += f * (x / k - P[u * 3]);
        next[u * 3 + 1] += f * (y / k - P[u * 3 + 1]);
        next[u * 3 + 2] += f * (z / k - P[u * 3 + 2]);
      }
      P.set(next);
    }
    for (let pass = 0; pass < SMOOTH_CROTCH; pass++) { step(0.5, pass); step(-0.53, pass); }

    // 3. Shading follows the smoothed shape: normals from the faces, shared by the welded copies.
    const N = new Float32Array(count * 3);
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]];
      e1.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]);
      e2.set(P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]);
      fn.crossVectors(e1, e2);
      for (const u of [a, b, c]) { N[u * 3] += fn.x; N[u * 3 + 1] += fn.y; N[u * 3 + 2] += fn.z; }
    }

    // 4. Write back: clothed points pushed out along the new normals.
    const n = new THREE.Vector3();
    for (let v = 0; v < pos.count; v++) {
      const u = id[v];
      n.set(N[u * 3], N[u * 3 + 1], N[u * 3 + 2]).normalize();
      const out = OUT[part[v]] * height;
      pos.setXYZ(v, P[u * 3] + n.x * out, P[u * 3 + 1] + n.y * out, P[u * 3 + 2] + n.z * out);
      if (!fixed[u]) nor.setXYZ(v, n.x, n.y, n.z);
      restY[v] = P[u * 3 + 1];   // the waist and collar are level on the smoothed shape
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    g.setAttribute("clothPart", new THREE.BufferAttribute(parts, 4));
    g.setAttribute("clothTorso", new THREE.BufferAttribute(torso, 1));
    g.setAttribute("clothY", new THREE.BufferAttribute(restY, 1));
    g.setAttribute("clothLimb", new THREE.BufferAttribute(limb, 2));
    g.userData.cloth = { waist, collar };
    g.computeBoundingSphere();
  });
}

// One material per figure: clay shading, coloured per pixel as skin, shirt (the character's colour), trousers, shoes.
// paint(colour) changes the shirt. cut = { waist, collar } of the body (dress()).
export function outfit(colour, cut) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const uniforms = {
    clothSkin: { value: new THREE.Color(CLOTH.skin) },
    clothShirt: { value: new THREE.Color(colour) },
    clothTrousers: { value: new THREE.Color(CLOTH.trousers) },
    clothShoes: { value: new THREE.Color(CLOTH.shoes) },
    clothWaist: { value: cut?.waist ?? 0 },
    clothCollar: { value: cut?.collar ?? 1e9 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>
attribute vec4 clothPart;
attribute float clothTorso;
attribute float clothY;
attribute vec2 clothLimb;
varying vec4 vClothPart;
varying float vClothTorso;
varying float vClothY;
varying vec2 vClothLimb;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vClothPart = clothPart;
vClothTorso = clothTorso;
vClothY = clothY;
vClothLimb = clothLimb;`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>
uniform vec3 clothSkin;
uniform vec3 clothShirt;
uniform vec3 clothTrousers;
uniform vec3 clothShoes;
uniform float clothWaist;
uniform float clothCollar;
varying vec4 vClothPart;
varying float vClothTorso;
varying float vClothY;
varying vec2 vClothLimb;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec4 p = vClothPart;
  if (vClothTorso > 0.5 && p.w < 0.5) p = vClothY < clothWaist ? vec4(0., 0., 1., 0.) : vClothY > clothCollar ? vec4(1., 0., 0., 0.) : vec4(0., 1., 0., 0.);
  // Cuffs and hems: a straight cut across the forearm (skin beyond) and the lower leg (shoe beyond).
  if (vClothLimb.x < -0.5) p = vClothLimb.y > 0. ? vec4(1., 0., 0., 0.) : vec4(0., 1., 0., 0.);
  else if (vClothLimb.x > 0.5) p = vClothLimb.y > 0. ? vec4(0., 0., 0., 1.) : vec4(0., 0., 1., 0.);
  vec3 c = clothSkin;
  float best = p.x;
  if (p.y > best) { best = p.y; c = clothShirt; }
  if (p.z > best) { best = p.z; c = clothTrousers; }
  if (p.w > best) { best = p.w; c = clothShoes; }
  diffuseColor.rgb *= c;
}`);
  };
  mat.customProgramCacheKey = () => "storyboard-clothes";
  mat.paint = (c) => uniforms.clothShirt.value.set(c);
  return mat;
}
