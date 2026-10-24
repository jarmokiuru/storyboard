// Adding and editing furniture and figures in the Shot Generator.
// Furniture belongs to the set, so every scene at the location shares it (SPEC §8.1).
// Figures belong to the board; a new board starts with the figures of the previous board in its scene.

import { OBJECTS, FIGURES, FIGURE_COLOURS, byId } from "./catalog.js";
import { openMenu, formDialog } from "../ui.js";
import { uid, sceneOf, orderedBoards } from "../model.js";

const $ = (id) => document.getElementById(id);
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const num = (s, fallback) => {
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? fallback : n;
};

// ctx: { project, board, loc, figures, things, shot(), setChanged(), redraw() }
let ctx = null;
let selected = null;

export function figuresFor(project, board) {
  if (board.shot3d?.figures) return structuredClone(board.shot3d.figures);
  const scene = orderedBoards(project).filter((b) => b.sceneId === board.sceneId);
  for (let i = scene.indexOf(board) - 1; i >= 0; i--) {
    if (scene[i].shot3d?.figures) return structuredClone(scene[i].shot3d.figures);
  }
  return [];
}

export function startPlacing(c) {
  ctx = c;
  ctx.loc.objects = ctx.loc.objects || [];
  selected = null;
  ctx.things.clear();
  for (const item of [...ctx.loc.objects, ...ctx.figures]) ctx.things.put(item).then(() => item.kind === "object" && ctx.setChanged());
  showSelected();
}

const all = () => [...ctx.loc.objects, ...ctx.figures];
export const selectedItem = () => all().find((i) => i.id === selected) || null;

export function select(id) {
  selected = id;
  ctx.things.select(id);
  showSelected();
  ctx.redraw();
}

// ---------- adding ----------

// 2 m in front of the camera, kept inside the room; if something is already there, the nearest free place
// to its left or right.
function spot() {
  const s = ctx.shot();
  const a = rad(s.pan);
  const r = ctx.loc.room;
  const inRoom = (x, z) => (r.exterior ? { x, z } : {
    x: Math.max(-r.w / 2 + 0.3, Math.min(r.w / 2 - 0.3, x)),
    z: Math.max(-r.d / 2 + 0.3, Math.min(r.d / 2 - 0.3, z)),
  });
  let first = null;
  for (let k = 0; k < 9; k++) {
    const side = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.5;
    const p = inRoom(s.x + Math.sin(a) * 2 + Math.cos(a) * side, s.z - Math.cos(a) * 2 + Math.sin(a) * side);
    first = first || p;
    if (!ctx.things.hitPlan(p.x, p.z, 0.15)) return { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
  }
  return first;
}

// The rotation that turns something at (x, z) to face the camera.
function faceCamera(x, z) {
  const s = ctx.shot();
  return Math.round(deg(Math.atan2(s.x - x, s.z - z)));
}

export function addMenu(anchor) {
  const scene = sceneOf(ctx.project, ctx.board);
  const cast = (scene.henkilot || "").split(/[,;\n]/).map((n) => n.trim()).filter(Boolean).filter((n) => !ctx.figures.some((f) => f.name === n));
  const items = [{ type: "note", label: "Figures" }];
  for (const name of cast) items.push({ label: `Figure ${name}`, action: () => figureDialog(name) });
  items.push({ label: "Figure…", action: () => figureDialog("") });
  let group = null;
  for (const entry of OBJECTS) {
    if (entry.group !== group) {
      group = entry.group;
      items.push({ type: "sep" }, { type: "note", label: group });
    }
    items.push({ label: entry.label, action: () => addObject(entry) });
  }
  openMenu(anchor, items);
}

async function figureDialog(name) {
  const v = await formDialog("Add figure", [
    { name: "name", label: "Name (from Henkilöt)", value: name },
    { name: "model", label: "Body", type: "select", value: "adult-male", options: FIGURES.map((f) => [f.id, f.label]) },
    { name: "height", label: "Height (cm) — leave empty for the body's own height", value: "" },
  ], { ok: "Add" });
  if (!v) return;
  const entry = byId(v.model);
  const at = spot();
  const fig = {
    id: uid(), kind: "figure", model: v.model, name: v.name.trim() || "?",
    height: Math.max(30, Math.min(230, num(v.height, entry.height))),
    colour: FIGURE_COLOURS[ctx.figures.length % FIGURE_COLOURS.length],
    ...at, rot: faceCamera(at.x, at.z),
  };
  ctx.figures.push(fig);
  await ctx.things.put(fig);
  select(fig.id);
}

async function addObject(entry) {
  const at = spot();
  const item = { id: uid(), kind: "object", model: entry.id, ...at, rot: 0 };   // size comes from the model once loaded
  ctx.loc.objects.push(item);
  await ctx.things.put(item);
  ctx.setChanged();
  select(item.id);
}

// ---------- editing the selected item ----------

export function moveSelected(x, z) {
  const it = selectedItem();
  if (!it) return;
  it.x = Math.round(x * 100) / 100;
  it.z = Math.round(z * 100) / 100;
  ctx.things.put(it);
  if (it.kind === "object") ctx.setChanged();
  ctx.redraw();
}

export function deleteSelected() {
  const it = selectedItem();
  if (!it) return;
  const list = it.kind === "object" ? ctx.loc.objects : ctx.figures;
  list.splice(list.indexOf(it), 1);
  ctx.things.remove(it.id);
  if (it.kind === "object") ctx.setChanged();
  select(null);
}

// Camera to the selected figure's eyes, in metres.
export function subjectDistance() {
  const it = selectedItem();
  if (!it || it.kind !== "figure") return null;
  const s = ctx.shot();
  const eye = (it.height * 0.93) / 100;
  return Math.hypot(it.x - s.x, eye - s.height / 100, it.z - s.z);
}

function showSelected() {
  const box = $("sg-selected");
  const it = selectedItem();
  box.hidden = !it;
  if (!it) return;
  const isFig = it.kind === "figure";
  box.innerHTML = `
    <h3>${isFig ? "Figure" : "Selected"}</h3>
    ${isFig ? `<label><span>Name</span><input data-f="name" autocomplete="off"></label>
               <label><span>Height (cm)</span><input data-f="height" inputmode="decimal"></label>`
            : `<p class="muted sg-what"></p>
               <div class="sg-dims">
                 <label><span>Width</span><input data-f="w" inputmode="decimal"></label>
                 <label><span>Depth</span><input data-f="d" inputmode="decimal"></label>
                 <label><span>Height</span><input data-f="h" inputmode="decimal"></label>
               </div><p class="muted sg-unit">cm · shared by every scene in this set</p>`}
    <label class="sg-slider"><span>Turn</span><input type="range" min="-180" max="180" step="5" data-f="rot"><output></output></label>
    <div class="sg-sel-buttons"><button data-act="delete" class="danger">Delete</button><button data-act="done">Done</button></div>`;
  if (!isFig) box.querySelector(".sg-what").textContent = byId(it.model)?.label || it.model;
  for (const input of box.querySelectorAll("[data-f]")) input.value = it[input.dataset.f] ?? "";
  box.querySelector("output").textContent = it.rot + "°";

  box.oninput = (e) => {
    const f = e.target.dataset.f;
    if (!f) return;
    it[f] = f === "name" ? e.target.value : num(e.target.value, it[f]);
    if (f === "rot") box.querySelector("output").textContent = it.rot + "°";
    if (["w", "d", "h"].includes(f)) it[f] = Math.max(5, it[f]);
    if (f === "height") it.height = Math.max(30, Math.min(230, it.height));
    ctx.things.put(it);
    if (!isFig) ctx.setChanged();
    ctx.redraw();
  };
  box.onclick = (e) => {
    const act = e.target.dataset?.act;
    if (act === "delete") deleteSelected();
    if (act === "done") select(null);
  };
}

// Called after an object's model loads, so the panel shows its real size.
export function refreshSelected() {
  if (selectedItem()) showSelected();
}
