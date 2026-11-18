// Neutral bodies (Jarmo, 2026-11-18): the figures are one colour all over, and the body is smoothed so nothing
// anatomical shows — a little everywhere on the torso, arms and legs, and the crotch filled in like a stretched sheet
// (no fold between the thighs, the same shape on every body). Head, hands and feet keep their shape.
// Replaces the clothes of v0.23.0–v0.23.4 (shirt, trousers, shoes), dropped at Jarmo's request.

import * as THREE from "three";

const SMOOTH = 4;           // Taubin passes on the torso, arms and legs
const SMOOTH_CROTCH = 24;   // around the crotch and seat
const SHEET = 120;          // plain smoothing passes that fill the fold between the thighs

// Head, neck, eyes, hands and fingers, feet and toes stay as modelled.
const keepsShape = (bone) => /Foot|ToeBase|^leaf01[12]$|Head|Neck|Eye|Hand/.test(bone) && !/UpLeg/.test(bone);

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

// Smooth every skinned mesh of a loaded figure once (the geometry is shared by every copy of that body).
export function neutralise(root) {
  root.traverse((m) => {
    if (!m.isSkinnedMesh || m.userData.neutral) return;
    m.userData.neutral = true;
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
    const hips = boneAt("Hips")?.y ?? g.boundingBox.min.y + height * 0.5;
    const spine = boneAt("Spine")?.y ?? hips + height * 0.06;
    const waist = spine + (spine - hips) * 0.2;
    const crotchLow = hips - height * 0.12;
    // The sheet zone: centred between the hip joints, from the crotch down the inner thighs, front to back.
    const legL = boneAt("LeftUpLeg"), legR = boneAt("RightUpLeg");
    const midX = legL && legR ? (legL.x + legR.x) / 2 : 0;
    const legY = legL && legR ? (legL.y + legR.y) / 2 : hips;
    const sheetAt = (x, y) => {
      const ax = Math.abs(x - midX) / (height * 0.085);
      const ay = (y - (legY - height * 0.05)) / (height * (y < legY - height * 0.05 ? 0.07 : 0.09));
      const r = ax * ax + ay * ay;
      return r >= 1 ? 0 : (1 - r) * (1 - r);
    };

    const { id, count } = weld(pos);
    const P = new Float32Array(count * 3);
    const passes = new Uint8Array(count);
    const fixed = new Uint8Array(count);
    const sheet = new Float32Array(count);
    for (let v = 0; v < pos.count; v++) {
      let top = "", topW = 0;
      for (let k = 0; k < 4; k++) {
        const weight = sw.getComponent(v, k);
        if (weight > topW) { topW = weight; top = names[si.getComponent(v, k)] || ""; }
      }
      const u = id[v];
      const [x, y, z] = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      P[u * 3] = x; P[u * 3 + 1] = y; P[u * 3 + 2] = z;
      if (keepsShape(top)) { fixed[u] = 1; continue; }
      passes[u] = Math.max(passes[u], y > crotchLow && y < waist ? SMOOTH_CROTCH : SMOOTH);
      sheet[u] = Math.max(sheet[u], sheetAt(x, y));
    }
    const near = Array.from({ length: count }, () => new Set());
    const idx = g.index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]];
      near[a].add(b).add(c); near[b].add(a).add(c); near[c].add(a).add(b);
    }
    // One smoothing step: each point moves `factor(u)` of the way to its neighbours' average.
    const step = (factor) => {
      const next = P.slice();
      for (let u = 0; u < count; u++) {
        const f = fixed[u] || !near[u].size ? 0 : factor(u);
        if (!f) continue;
        let x = 0, y = 0, z = 0;
        for (const n of near[u]) { x += P[n * 3]; y += P[n * 3 + 1]; z += P[n * 3 + 2]; }
        const k = near[u].size;
        next[u * 3] += f * (x / k - P[u * 3]);
        next[u * 3 + 1] += f * (y / k - P[u * 3 + 1]);
        next[u * 3 + 2] += f * (z / k - P[u * 3 + 2]);
      }
      P.set(next);
    };
    // The sheet first: plain smoothing (no step back out), so the fold between the thighs fills in.
    for (let pass = 0; pass < SHEET; pass++) step((u) => 0.6 * sheet[u]);
    // Then Taubin smoothing (alternate in and out steps, so the body doesn't shrink).
    for (let pass = 0; pass < SMOOTH_CROTCH; pass++) {
      step((u) => (passes[u] > pass ? 0.5 : 0));
      step((u) => (passes[u] > pass ? -0.53 : 0));
    }

    // Shading follows the smoothed shape: normals from the faces, shared by the welded copies.
    const N = new Float32Array(count * 3);
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]];
      e1.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]);
      e2.set(P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]);
      fn.crossVectors(e1, e2);
      for (const u of [a, b, c]) { N[u * 3] += fn.x; N[u * 3 + 1] += fn.y; N[u * 3 + 2] += fn.z; }
    }
    const n = new THREE.Vector3();
    for (let v = 0; v < pos.count; v++) {
      const u = id[v];
      pos.setXYZ(v, P[u * 3], P[u * 3 + 1], P[u * 3 + 2]);
      if (fixed[u]) continue;
      n.set(N[u * 3], N[u * 3 + 1], N[u * 3 + 2]).normalize();
      nor.setXYZ(v, n.x, n.y, n.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    g.computeBoundingSphere();
  });
}
