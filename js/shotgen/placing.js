// Adding and editing furniture and figures in the Shot Generator.
// Furniture belongs to the set, so every scene at the location shares it (SPEC §8.1).
// Figures belong to the board; a new board starts with the figures of the previous board in its scene.

import { OBJECTS, FIGURES, FIGURE_COLOURS, byId } from "./catalog.js";
import { POSES, POSE_ORDER, JOINTS } from "./poses.js";
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
let selectedJoint = null;   // remembered between figures, so posing several hands in a row is quick

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
  const named = (scene.henkilot || "").split(/[,;\n]/).map((n) => n.trim()).filter(Boolean);
  const cast = [...new Set([...named, ...(ctx.project.characters || []).map((c) => c.name)])].filter((n) => !ctx.figures.some((f) => f.name === n));
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
  // The project's character list (from a starter file) gives body and height, e.g. A: adult male, 182 cm.
  const known = (ctx.project.characters || []).find((c) => c.name === name);
  const v = await formDialog("Add figure", [
    { name: "name", label: "Name (from Henkilöt)", value: name },
    { name: "model", label: "Body", type: "select", value: known?.model || "adult-male", options: FIGURES.map((f) => [f.id, f.label]) },
    { name: "height", label: "Height (cm) — leave empty for the body's own height", value: known?.height ?? "" },
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

// A number with its own slider: drag the slider, type in the box, use ↑/↓ in the box (Shift = ×10),
// or scroll over either.
// reset: the value ↺ goes back to.
function numberRow(label, key, min, max, step, unit, reset) {
  return `<div class="sg-num" data-key="${key}" data-min="${min}" data-max="${max}" data-step="${step}" data-reset="${reset}">
    <span>${label}</span>
    <input type="range" min="${min}" max="${max}" step="${step}" aria-label="${label}">
    <input class="num" inputmode="decimal" autocomplete="off" aria-label="${label} (${unit})"><em>${unit}</em>
    <button class="sg-zero" title="Back to ${reset} ${unit}">↺</button>
  </div>`;
}

function showSelected() {
  const box = $("sg-selected");
  const it = selectedItem();
  box.hidden = !it;
  if (!it) return;
  const isFig = it.kind === "figure";
  const own = ctx.things.sizeOf(it.id);   // the model's own size, for ↺
  const ownCm = (v, fallback) => (own ? Math.round(v * 100) : fallback);
  const others = ctx.figures.filter((f) => f.id !== it.id);
  box.innerHTML = `
    <h3>${isFig ? "Figure" : "Selected"}</h3>
    ${isFig
      ? `<label><span>Name</span><input data-f="name" autocomplete="off"></label>${numberRow("Height", "height", 30, 230, 1, "cm", byId(it.model).height)}
         <label><span>Pose</span><select data-f="pose">${POSE_ORDER.map((k) => `<option value="${k}">${POSES[k].label}</option>`).join("")}</select></label>
         <label><span>Looks at</span><select data-f="lookAt"><option value="">Where the pose looks</option><option value="camera">The lens</option>${others.map((f) => `<option value="${f.id}">${f.name}</option>`).join("")}</select></label>
         <details class="sg-joints"${selectedJoint ? " open" : ""}><summary>Pose by hand</summary>
           <label><span>Joint</span><select data-f="joint">${JOINTS.map(([b, l]) => `<option value="${b}">${l}</option>`).join("")}</select></label>
           ${numberRow("Forward", "jx", -120, 120, 5, "°", 0)}
           ${numberRow("Turn", "jy", -120, 120, 5, "°", 0)}
           ${numberRow("Side", "jz", -120, 120, 5, "°", 0)}
           <button data-act="clear-joints">Undo all hand posing</button>
         </details>`
      : `<p class="muted sg-what"></p>
         ${numberRow("Width", "w", 5, 800, 1, "cm", ownCm(own?.x, it.w))}
         ${numberRow("Depth", "d", 5, 800, 1, "cm", ownCm(own?.z, it.d))}
         ${numberRow("Height", "h", 5, 400, 1, "cm", ownCm(own?.y, it.h))}
         <p class="muted sg-unit">Shared by every scene in this set</p>`}
    ${numberRow("Elevation", "y", -100, 300, 1, "cm", 0)}
    ${numberRow("Turn", "rot", -180, 180, 5, "°", 0)}
    <div class="sg-sel-buttons"><button data-act="delete" class="danger">Delete</button><button data-act="done">Done</button></div>`;
  if (!isFig) box.querySelector(".sg-what").textContent = byId(it.model)?.label || it.model;
  const name = box.querySelector("[data-f=name]");
  if (name) name.value = it.name;
  const poseSel = box.querySelector("[data-f=pose]");
  const lookSel = box.querySelector("[data-f=lookAt]");
  const jointSel = box.querySelector("[data-f=joint]");
  if (poseSel) poseSel.value = it.pose || "stand";
  if (lookSel) lookSel.value = it.lookAt || "";
  if (jointSel) jointSel.value = selectedJoint || "Head";

  // Hand-posing rows (jx, jy, jz) read and write the chosen joint's three angles.
  const axis = (key) => ["jx", "jy", "jz"].indexOf(key);
  const read = (key) => (axis(key) >= 0 ? it.joints?.[jointSel.value]?.[axis(key)] ?? 0 : it[key] ?? 0);
  const write = (key, value) => {
    if (axis(key) < 0) return (it[key] = value);
    it.joints = it.joints || {};
    const angles = it.joints[jointSel.value] || [0, 0, 0];
    angles[axis(key)] = value;
    it.joints[jointSel.value] = angles;
  };

  const rows = [...box.querySelectorAll(".sg-num")];
  const show = (row) => {
    const v = read(row.dataset.key);
    row.querySelector("input[type=range]").value = v;
    const text = row.querySelector(".num");
    if (document.activeElement !== text) text.value = v;
  };
  rows.forEach(show);

  // Every change goes through here: clamp, store, redraw. The panel itself is never rebuilt.
  const setValue = (row, v) => {
    const { key } = row.dataset;
    const min = Number(row.dataset.min);
    const max = Number(row.dataset.max);
    if (!Number.isFinite(v)) return;
    write(key, Math.round(Math.min(max, Math.max(min, v)) * 10) / 10);
    show(row);
    ctx.things.put(it);
    if (!isFig) ctx.setChanged();
    ctx.redraw();
  };
  const stepBy = (row, dir, big) => setValue(row, read(row.dataset.key) + dir * Number(row.dataset.step) * (big ? 10 : 1));

  for (const row of rows) {
    const range = row.querySelector("input[type=range]");
    const text = row.querySelector(".num");
    range.oninput = () => { setValue(row, Number(range.value)); text.value = read(row.dataset.key); };
    text.oninput = () => { if (text.value.trim() !== "") setValue(row, num(text.value, NaN)); };
    text.onchange = () => { text.value = read(row.dataset.key); };
    text.onkeydown = (e) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        stepBy(row, e.key === "ArrowUp" ? 1 : -1, e.shiftKey);
        text.value = read(row.dataset.key);
      }
      if (e.key === "Enter") text.blur();
    };
    row.querySelector(".sg-zero").onclick = () => { setValue(row, Number(row.dataset.reset)); text.value = read(row.dataset.key); };
    row.addEventListener("wheel", (e) => {
      e.preventDefault();
      stepBy(row, e.deltaY < 0 ? 1 : -1, e.shiftKey);
      text.value = read(row.dataset.key);
    }, { passive: false });
  }
  if (name) name.oninput = () => { it.name = name.value; ctx.things.put(it); ctx.redraw(); };
  const repose = () => { ctx.things.put(it); ctx.redraw(); };
  if (poseSel) poseSel.onchange = () => { it.pose = poseSel.value; repose(); };
  if (lookSel) lookSel.onchange = () => { it.lookAt = lookSel.value; repose(); };
  if (jointSel) jointSel.onchange = () => {
    selectedJoint = jointSel.value;
    rows.filter((r) => axis(r.dataset.key) >= 0).forEach(show);
  };
  box.querySelector(".sg-joints")?.addEventListener("toggle", (e) => { if (e.target.open && !selectedJoint) selectedJoint = jointSel.value; });

  box.onclick = (e) => {
    const act = e.target.dataset?.act;
    if (act === "delete") deleteSelected();
    if (act === "done") select(null);
    if (act === "clear-joints") {
      it.joints = {};
      rows.filter((r) => axis(r.dataset.key) >= 0).forEach(show);
      repose();
    }
  };
}

// Called after an object's model loads, so the panel shows its real size.
export function refreshSelected() {
  if (selectedItem()) showSelected();
}
