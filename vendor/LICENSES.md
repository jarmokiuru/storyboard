# Vendored libraries and assets

Everything the app needs at runtime lives here, so it works with no signal. Nothing is loaded from the network.

| What | Version / date | Source | Licence | Licence file |
|---|---|---|---|---|
| three.js (3D) — `build/three.module.js`, `build/three.core.js`, `examples/jsm/loaders/GLTFLoader.js`, `examples/jsm/utils/BufferGeometryUtils.js`, `examples/jsm/utils/SkeletonUtils.js` | 0.186.1 (published 2026-09-24), unmodified | npm package `three`, via cdn.jsdelivr.net/npm/three@0.186.1 | MIT | `three/LICENSE` |
| Shot Generator models — `characters/essential/*-lod.glb` (6 figures, 67-joint skeletons, LOD0–LOD4) and `objects/essential/**.glb` (37 objects) | last commit 2019-08-31, unmodified | github.com/wonderunit/shot-generator-models | MIT, © 2019 Wonder Unit | `models/LICENSE` |

Not used: Storyboarder's main repository has no licence file, so none of its code, poses or data are copied.
