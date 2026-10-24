// The .storyboard project file: a zip of project.json + one PNG per drawn layer + thumbnails. SPEC §2.

import * as db from "./db.js";
import { LAYERS, uid, newScene, newBoard, defaultRoom } from "./model.js";
import { makeZip, readZip } from "./zip.js";

// The project file format this app reads and writes (docs/project-format.md). Raise only for breaking changes.
export const FORMAT = 1;

export async function exportProject(project) {
  const json = JSON.stringify({ app: "storyboard", format: FORMAT, project }, null, 1);
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
  if (Number(data.format) > FORMAT) {
    const err = new Error("This file is from a newer version of Storyboard — reload the app to update it.");
    err.newer = true;
    throw err;
  }
  return { project: normalizeProject(data.project), files };
}

const sameNumber = (a, b) => String(a ?? "").replace(/\s+/g, "").toLowerCase() === String(b ?? "").replace(/\s+/g, "").toLowerCase();

// Fill in everything a starter file may leave out (docs/project-format.md, "Starter files"): ids, defaults,
// boards linked to scenes by Kohtaus #, a blank board for any scene without one.
export function normalizeProject(raw) {
  const p = structuredClone(raw);
  const now = Date.now();
  p.format = FORMAT;
  p.id = p.id || uid();
  p.title = String(p.title || "Untitled");
  p.ratio = Number(p.ratio) > 0 ? Number(p.ratio) : 2.39;
  p.created = p.created || now;
  p.modified = p.modified || now;
  if (p.exported === undefined) p.exported = null;
  p.editedSinceExport = !!p.editedSinceExport;
  p.firstEditSinceExport = p.firstEditSinceExport ?? null;

  p.scenes = (p.scenes || []).map((s) => ({ ...newScene(), ...s, id: s.id || uid(), kohtaus: String(s.kohtaus ?? "") }));
  const boards = [];
  for (const b of p.boards || []) {
    const scene = p.scenes.find((s) => s.id === b.sceneId) || p.scenes.find((s) => sameNumber(s.kohtaus, b.kohtaus));
    if (!scene) continue;   // a board for a scene that isn't in the file
    const base = newBoard(scene.id, b.kuva ?? 1, b.newShot ?? true);
    const board = { ...base, ...b, id: b.id || uid(), sceneId: scene.id, kuva: String(b.kuva ?? base.kuva), newShot: b.newShot ?? true };
    delete board.kohtaus;
    board.layers = Object.fromEntries(LAYERS.map((n) => [n, { ...base.layers[n], ...(b.layers?.[n] || {}) }]));
    boards.push(board);
  }
  for (const s of p.scenes) if (!boards.some((b) => b.sceneId === s.id)) boards.push(newBoard(s.id, 1, true));
  p.boards = p.scenes.flatMap((s) => boards.filter((b) => b.sceneId === s.id));

  p.locations = (p.locations || []).map((l) => ({
    tag: "assumed", objects: [], ...l, id: l.id || uid(), name: String(l.name || "Set"),
    room: { ...defaultRoom(!!l.room?.exterior), ...(l.room || {}) },
  }));
  p.characters = (p.characters || []).filter((c) => c && c.name).map((c) => ({
    name: String(c.name), model: c.model || "adult-male", height: Number(c.height) || null,
  }));
  if (Array.isArray(p.lenses)) p.lenses = p.lenses.map(Number).filter((n) => n > 0);
  else delete p.lenses;
  return p;
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
