// Neutral bodies (Jarmo, 2026-11-18): the figures keep the library's original shape, except a small patch at the
// front of the crotch, which is smoothed flat so there is no bulge. Thighs, legs and feet are untouched, so the stance
// stays as modelled. (v0.23 clothes and v0.24's wider smoothing, which spread the thighs apart, are gone.)

import * as THREE from "three";

const PASSES = 40;   // Taubin passes over the patch (in and out steps, so it flattens without shrinking)

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

// Smooth the crotch patch of every skinned mesh of a loaded figure once (the geometry is shared by its copies).
export function neutralise(root) {
  root.traverse((m) => {
    if (!m.isSkinnedMesh || m.userData.neutral) return;
    m.userData.neutral = true;
    const g = m.geometry;
    const pos = g.attributes.position;
    const nor = g.attributes.normal;
    if (!nor || !g.index) return;
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
    const legL = boneAt("LeftUpLeg"), legR = boneAt("RightUpLeg"), hips = boneAt("Hips");
    if (!legL || !legR || !hips) return;
    // The patch: between the hip joints, from a little above them down to the top of the thigh gap, front-facing only.
    const midX = (legL.x + legR.x) / 2;
    const midY = (legL.y + legR.y) / 2 - height * 0.035;
    const frontZ = hips.z;
    const weightAt = (x, y, z, nz) => {
      if (z < frontZ) return 0;
      const ax = Math.abs(x - midX) / (height * 0.06);
      const ay = (y - midY) / (height * 0.055);
      const r = ax * ax + ay * ay;
      if (r >= 1) return 0;
      const facing = Math.min(1, Math.max(0, (nz - 0.1) / 0.4));   // fades out where the surface turns to the inner thigh
      return (1 - r) * (1 - r) * facing;
    };

    const { id, count } = weld(pos);
    const P = new Float32Array(count * 3);
    const w = new Float32Array(count);
    for (let v = 0; v < pos.count; v++) {
      const u = id[v];
      const [x, y, z] = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      P[u * 3] = x; P[u * 3 + 1] = y; P[u * 3 + 2] = z;
      w[u] = Math.max(w[u], weightAt(x, y, z, nor.getZ(v)));
    }
    if (!w.some((x) => x > 0)) return;
    const near = Array.from({ length: count }, () => new Set());
    const idx = g.index.array;
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]];
      near[a].add(b).add(c); near[b].add(a).add(c); near[c].add(a).add(b);
    }
    const step = (factor) => {
      const next = P.slice();
      for (let u = 0; u < count; u++) {
        if (!w[u] || !near[u].size) continue;
        let x = 0, y = 0, z = 0;
        for (const n of near[u]) { x += P[n * 3]; y += P[n * 3 + 1]; z += P[n * 3 + 2]; }
        const k = near[u].size, f = factor * w[u];
        next[u * 3] += f * (x / k - P[u * 3]);
        next[u * 3 + 1] += f * (y / k - P[u * 3 + 1]);
        next[u * 3 + 2] += f * (z / k - P[u * 3 + 2]);
      }
      P.set(next);
    };
    for (let pass = 0; pass < PASSES; pass++) { step(0.6); step(-0.63); }

    // Shading follows the new shape in the patch: normals from the faces, shared by the welded copies.
    const N = new Float32Array(count * 3);
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), fn = new THREE.Vector3();
    for (let t = 0; t < idx.length; t += 3) {
      const [a, b, c] = [id[idx[t]], id[idx[t + 1]], id[idx[t + 2]]];
      if (!w[a] && !w[b] && !w[c]) continue;
      e1.set(P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]);
      e2.set(P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]);
      fn.crossVectors(e1, e2);
      for (const u of [a, b, c]) { N[u * 3] += fn.x; N[u * 3 + 1] += fn.y; N[u * 3 + 2] += fn.z; }
    }
    const n = new THREE.Vector3();
    const old = new THREE.Vector3();
    for (let v = 0; v < pos.count; v++) {
      const u = id[v];
      if (!w[u]) continue;
      pos.setXYZ(v, P[u * 3], P[u * 3 + 1], P[u * 3 + 2]);
      // Blend towards the new normal by the patch weight, so the patch's edge shades like the body around it.
      n.set(N[u * 3], N[u * 3 + 1], N[u * 3 + 2]).normalize();
      old.set(nor.getX(v), nor.getY(v), nor.getZ(v));
      old.lerp(n, Math.min(1, w[u] * 2)).normalize();
      nor.setXYZ(v, old.x, old.y, old.z);
    }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
  });
}
