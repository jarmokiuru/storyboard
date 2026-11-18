// Plain clothes on the figures (Jarmo, 2026-11-18): shirt, trousers and shoes, no detail. Made from the body itself — no
// extra models or triangles. Every vertex is sorted by the bone that moves it most (torso and arms → shirt, hips and
// legs → trousers, feet → shoes; head, neck and hands stay skin); on the torso a level waist and collar decide instead.
// The clothed parts are pushed out a little along the surface. The colours are chosen per pixel in the shader, from
// those parts blended across each triangle, so the edges run straight instead of following the body's long triangles.
// The shirt wears the character's colour; trousers and shoes are clay greys.

import * as THREE from "three";

export const CLOTH = { skin: "#d6d1c9", trousers: "#62666d", shoes: "#2f3135" };

// How far each part stands off the body, as a share of the figure's height (1.8 m figure: 9 mm; shoes 22 mm).
const OUT = [0, 0.005, 0.005, 0.012];   // skin, shirt, trousers, shoes

function partOf(bone) {
  if (/Foot|ToeBase|^leaf01[12]$/.test(bone)) return 3;
  if (/Hips|UpLeg|Leg/.test(bone)) return 2;
  if (/Spine|Shoulder|Arm/.test(bone)) return 1;   // Arm also matches ForeArm: long sleeves to the wrist
  return 0;   // Head, Neck, eyes, Hand and fingers
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
    if (!nor || !si || !sw) return;
    g.computeBoundingBox();
    const height = g.boundingBox.max.y - g.boundingBox.min.y || 1;
    const names = m.skeleton.bones.map((b) => b.name);
    // Where a bone sits in the body at rest, in the mesh's own space.
    const boneY = (name) => {
      const i = names.indexOf(name);
      if (i < 0) return null;
      const at = new THREE.Matrix4().copy(m.skeleton.boneInverses[i]).invert().premultiply(m.bindMatrixInverse);
      return new THREE.Vector3().setFromMatrixPosition(at).y;
    };
    const [hips, spine, neck, head] = ["Hips", "Spine", "Neck", "Head"].map(boneY);
    const waist = hips != null && spine != null ? spine + (spine - hips) * 0.2 : g.boundingBox.min.y + height * 0.55;
    const collar = neck != null && head != null ? neck + (head - neck) * 0.05 : g.boundingBox.min.y + height * 0.83;

    const parts = new Float32Array(pos.count * 4);   // one-hot: skin, shirt, trousers, shoes
    const torso = new Float32Array(pos.count);
    const restY = new Float32Array(pos.count);
    for (let v = 0; v < pos.count; v++) {
      const w = [0, 0, 0, 0];
      let t = 0;
      for (let k = 0; k < 4; k++) {
        const name = names[si.getComponent(v, k)] || "";
        const weight = sw.getComponent(v, k);
        w[partOf(name)] += weight;
        if (/^(Hips|Spine|Spine1|Spine2|Neck)$/.test(name)) t += weight;
      }
      let p = w.indexOf(Math.max(...w));
      const y = pos.getY(v);
      restY[v] = y;
      torso[v] = t > 0.5 && p !== 3 ? 1 : 0;
      if (torso[v]) p = y < waist ? 2 : y > collar ? 0 : 1;
      parts[v * 4 + p] = 1;
      const out = OUT[p] * height;
      if (out) pos.setXYZ(v, pos.getX(v) + nor.getX(v) * out, y + nor.getY(v) * out, pos.getZ(v) + nor.getZ(v) * out);
    }
    pos.needsUpdate = true;
    g.setAttribute("clothPart", new THREE.BufferAttribute(parts, 4));
    g.setAttribute("clothTorso", new THREE.BufferAttribute(torso, 1));
    g.setAttribute("clothY", new THREE.BufferAttribute(restY, 1));
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
varying vec4 vClothPart;
varying float vClothTorso;
varying float vClothY;`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>
vClothPart = clothPart;
vClothTorso = clothTorso;
vClothY = clothY;`);
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
varying float vClothY;`)
      .replace("#include <color_fragment>", `#include <color_fragment>
{
  vec4 p = vClothPart;
  if (vClothTorso > 0.5 && p.w < 0.5) p = vClothY < clothWaist ? vec4(0., 0., 1., 0.) : vClothY > clothCollar ? vec4(1., 0., 0., 0.) : vec4(0., 1., 0., 0.);
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
