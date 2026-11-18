// Loads the model files once and hands out clay-coloured copies. Figures can be posed, so each copy gets its own skeleton.

import * as THREE from "three";
import { GLTFLoader } from "../../vendor/three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "../../vendor/three/examples/jsm/utils/SkeletonUtils.js";
import { dress, outfit } from "./clothes.js";

const loader = new GLTFLoader();
const cache = new Map();   // path → Promise<{ scene, size }>

// The 2017 MacBook Pro gets a lighter version of each figure (SPEC §8.2); the iPad gets full detail.
const MAC = /Macintosh/.test(navigator.userAgent) && !("ontouchend" in document);
export const FIGURE_DETAIL = MAC ? 2 : 0;

function load(path) {
  if (!cache.has(path)) {
    cache.set(path, loader.loadAsync(path).then((gltf) => {
      const scene = gltf.scene;
      // Stand every model on the floor, centred on its footprint, whatever its file says.
      const box = new THREE.Box3().setFromObject(scene);
      const centre = box.getCenter(new THREE.Vector3());
      const holder = new THREE.Group();
      scene.position.set(-centre.x, -box.min.y, -centre.z);
      holder.add(scene);
      const size = box.getSize(new THREE.Vector3());
      return { scene: holder, size };
    }));
  }
  return cache.get(path);
}

const clay = (hex) => new THREE.MeshLambertMaterial({ color: new THREE.Color(hex) });

// An object (table, chair…) as a fresh copy in a flat clay colour.
export async function makeObject(entry, colour = "#b7b2a8") {
  const { scene, size } = await load(entry.path);
  const copy = scene.clone(true);
  const mat = clay(colour);
  copy.traverse((m) => {
    if (m.isMesh) {
      m.material = mat;
      m.castShadow = m.receiveShadow = true;
    }
  });
  return { node: copy, size };
}

// A figure: one level of detail shown, the others hidden; the head keeps its size when the body is scaled. Dressed in
// plain clothes, the shirt in the figure's colour.
export async function makeFigure(entry, colour) {
  const { scene, size } = await load(entry.path);
  dress(scene);   // shirt, trousers, shoes (clothes.js), once per body
  const copy = cloneSkinned(scene);
  let shown = null;
  copy.traverse((m) => {
    if (m.isMesh || m.isSkinnedMesh) {
      const lod = (m.name.match(/[_-]LOD(\d)/i) || [])[1];   // the files use both "_LOD2" and "-LOD2"
      m.visible = lod === undefined || Number(lod) === FIGURE_DETAIL;
      if (m.visible && !shown) shown = m;
    }
  });
  const mat = outfit(colour, shown?.geometry.userData.cloth);
  copy.traverse((m) => {
    if (m.isMesh || m.isSkinnedMesh) {
      m.material = mat;
      m.castShadow = m.receiveShadow = true;
      m.frustumCulled = false;   // posed limbs can leave the bind-pose bounds
    }
  });
  const head = copy.getObjectByName("Head");
  const fig = { node: copy, size, head, colour };
  fig.paint = (c) => { mat.paint(c); fig.colour = c; };   // the shirt
  return fig;
}

// Scale a figure to a real height in cm (measured from the model itself); the library's rule: the head bone doesn't scale.
export function setFigureHeight(fig, heightCm) {
  const s = heightCm / (fig.size.y * 100);
  fig.node.scale.setScalar(s);
  if (fig.head) fig.head.scale.setScalar(1 / s);
}
