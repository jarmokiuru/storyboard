// On-device storage (IndexedDB). Projects are JSON; layer drawings and thumbnails are PNG/JPEG blobs.

import { LAYERS } from "./model.js";

let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open("storyboard", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore("projects", { keyPath: "id" });
        db.createObjectStore("layers");
        db.createObjectStore("thumbs");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

const layerKey = (boardId, name) => boardId + "/" + name;

export const listProjects = () => run("projects", "readonly", (s) => s.getAll());
export const getProject = (id) => run("projects", "readonly", (s) => s.get(id));
export const putProject = (p) => run("projects", "readwrite", (s) => s.put(p));

export const getLayer = (boardId, name) => run("layers", "readonly", (s) => s.get(layerKey(boardId, name)));
export const putLayer = (boardId, name, blob) => run("layers", "readwrite", (s) => s.put(blob, layerKey(boardId, name)));
export const deleteLayer = (boardId, name) => run("layers", "readwrite", (s) => s.delete(layerKey(boardId, name)));

export const getThumb = (boardId) => run("thumbs", "readonly", (s) => s.get(boardId));
export const putThumb = (boardId, blob) => run("thumbs", "readwrite", (s) => s.put(blob, boardId));

// A location's floor-plan picture, kept in the layers store under its project and location
// (copies of a project get new ids, so they never share or delete each other's plans).
const planKey = (projectId, locationId) => `plan:${projectId}/${locationId}`;
export const getPlan = (projectId, locationId) => run("layers", "readonly", (s) => s.get(planKey(projectId, locationId)));
export const putPlan = (projectId, locationId, blob) => run("layers", "readwrite", (s) => s.put(blob, planKey(projectId, locationId)));
export const deletePlan = (projectId, locationId) => run("layers", "readwrite", (s) => s.delete(planKey(projectId, locationId)));

export async function deleteBoardData(boardId) {
  await run("layers", "readwrite", (s) => {
    for (const name of LAYERS) s.delete(layerKey(boardId, name));
  });
  await run("thumbs", "readwrite", (s) => s.delete(boardId));
}

export async function deleteProject(project) {
  for (const b of project.boards) await deleteBoardData(b.id);
  for (const l of project.locations || []) if (l.plan) await deletePlan(project.id, l.id);
  await run("projects", "readwrite", (s) => s.delete(project.id));
}
