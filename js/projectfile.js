// The .storyboard project file: a zip of project.json + one PNG per drawn layer + thumbnails. SPEC §2.

import * as db from "./db.js";
import { LAYERS, uid } from "./model.js";
import { makeZip, readZip } from "./zip.js";

export async function exportProject(project) {
  const json = JSON.stringify({ app: "storyboard", format: 1, project }, null, 1);
  const entries = [{ name: "project.json", data: new TextEncoder().encode(json) }];
  for (const b of project.boards) {
    for (const n of LAYERS) {
      if (!b.layers[n].hasData) continue;
      const blob = await db.getLayer(b.id, n);
      if (blob) entries.push({ name: `layers/${b.id}/${n}.png`, data: blob });
    }
    const thumb = await db.getThumb(b.id);
    if (thumb) entries.push({ name: `thumbs/${b.id}.jpg`, data: thumb });
  }
  return makeZip(entries);
}

export async function readProjectFile(file) {
  const files = await readZip(file);
  const entry = files.get("project.json");
  if (!entry) throw new Error("No project.json");
  const data = JSON.parse(await entry.text());
  if (data.app !== "storyboard" || !data.project) throw new Error("Not a Storyboard project");
  return { project: data.project, files };
}

// mode "replace": same project id, overwrites the copy on this device. "copy": new ids, kept alongside.
export async function installProject({ project, files }, mode) {
  const p = structuredClone(project);
  const source = new Map();   // new board id → board id inside the file

  if (mode === "copy") {
    p.id = uid();
    p.title += " (copy)";
    const scenes = new Map();
    for (const s of p.scenes) {
      const id = uid();
      scenes.set(s.id, id);
      s.id = id;
    }
    for (const b of p.boards) {
      const id = uid();
      source.set(id, b.id);
      b.id = id;
      b.sceneId = scenes.get(b.sceneId);
    }
  } else {
    const existing = await db.getProject(p.id);
    if (existing) await db.deleteProject(existing);
    for (const b of p.boards) source.set(b.id, b.id);
  }

  for (const b of p.boards) {
    const src = source.get(b.id);
    for (const n of LAYERS) {
      const f = files.get(`layers/${src}/${n}.png`);
      if (f) await db.putLayer(b.id, n, new Blob([f], { type: "image/png" }));
      else b.layers[n].hasData = false;
    }
    const t = files.get(`thumbs/${src}.jpg`);
    if (t) await db.putThumb(b.id, new Blob([t], { type: "image/jpeg" }));
  }
  await db.putProject(p);
  return p;
}
