// Adding and editing furniture and figures in the Shot Generator.
// Furniture belongs to the set, so every scene at the location shares it (SPEC §8.1).
// Figures belong to the scene (blocking.js): every board of the scene sees them, unless a board has its own version
// of a figure ("This board only"). Only the cast has colours; extras are plain unless picked by hand.

import { OBJECTS, FIGURES, FIGURE_COLOURS, byId } from "./catalog.js";
import { POSES, POSE_ORDER, JOINTS } from "./poses.js";
import { openMenu, formDialog } from "../ui.js";
import { uid, sceneOf } from "../model.js";
import { sceneBlocking, isOwn, setOwn, removeFigure, colourFor, pickColour, syncColours, named, isCast, PLAIN } from "./blocking.js";

const $ = (id) => document.getElementById(id);
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const num = (s, fallback) => {
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? fallback : n;
};

// ctx: { project, board, scene, loc, figures (as this board sees them), things, shot(), setChanged(), redraw() }
let ctx = null;
let selected = null;           // the chosen piece or figure (with several chosen: the one last tapped)
let chosen = new Set();        // every chosen id (Jarmo, 2026-11-18: change eye lines and more in one go)
let several = false;           // "Several" switched on: taps add to the choice (Shift-click does the same)
let selectedJoint = null;   // remembered between figures, so posing several hands in a row is quick

export function startPlacing(c) {
  ctx = c;
  ctx.loc.objects = ctx.loc.objects || [];
  selected = null;
  chosen = new Set();
  ctx.things.clear();
  for (const item of [...ctx.loc.objects, ...ctx.figures]) ctx.things.put(item).then(() => item.kind === "object" && ctx.setChanged());
  showSelected();
}

const all = () => [...ctx.loc.objects, ...ctx.figures];

// Another board of the same scene: its view of the figures goes into the 3D scene (same ids, so nothing reloads).
export function setBoard(board, figures) {
  ctx.board = board;
  ctx.figures = figures;
  for (const f of figures) ctx.things.put(f);
  showSelected();
}

// Put a figure object in place of another with the same id (a board's own copy ↔ the shared one).
function swapFigure(next) {
  const i = ctx.figures.findIndex((f) => f.id === next.id);
  if (i >= 0) ctx.figures[i] = next;
  ctx.things.put(next);
}
export const selectedItem = () => all().find((i) => i.id === selected) || null;
export const chosenItems = () => all().filter((i) => chosen.has(i.id));
export const isChosen = (id) => chosen.has(id);
export const severalOn = () => several;

// Choose one piece or figure (id null: none). add: put it into the choice, or take it out if it is already there.
export function select(id, add = false) {
  chosen = new Set([...chosen].filter((x) => all().some((i) => i.id === x)));   // forget anything deleted
  if (add) {
    if (!id) return;
    if (chosen.has(id)) {
      chosen.delete(id);
      if (selected === id) selected = [...chosen].pop() || null;
    } else {
      chosen.add(id);
      selected = id;
    }
  } else {
    selected = id;
    chosen = new Set(id ? [id] : []);
  }
  showChoice();
}

// Several chosen and one of them pressed: it leads (for dragging and shot sizes), the rest stay chosen.
export function lead(id) {
  if (chosen.has(id)) selected = id;
}

export function chooseAllFigures() {
  chosen = new Set(ctx.figures.map((f) => f.id));
  selected = ctx.figures.at(-1)?.id ?? null;
  showChoice();
}

export function setSeveral(on) {
  several = on;
}

function showChoice() {
  ctx.things.select(chosen.size === 1 ? selected : null, chosen);   // joint dots only with one figure chosen
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

// What the colour swatches change, in the panel's words.
function colourNote(it) {
  if (!named(it.name)) return "Colour for this figure only. Extras stay plain unless you pick one.";
  const who = it.name.trim();
  return isCast(ctx.project, who) ? `Colour (every ${who} in the project)` : `Colour for every ${who} in the project. Extras stay plain unless you pick one.`;
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
  const id = uid();
  const fig = {
    id, kind: "figure", model: v.model, name: v.name.trim() || "?",
    height: Math.max(30, Math.min(230, num(v.height, entry.height))),
    colour: colourFor(ctx.project, v.name),
    ...at, rot: faceCamera(at.x, at.z),
  };
  sceneBlocking(ctx.project, ctx.scene).figures.push(fig);   // the scene's, so every board has it
  ctx.figures.push(fig);
  ctx.setChanged();
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

// Dragging the leading piece moves every chosen one by the same amount.
export function moveSelected(x, z) {
  const it = selectedItem();
  if (!it) return;
  const dx = Math.round(x * 100) / 100 - it.x;
  const dz = Math.round(z * 100) / 100 - it.z;
  for (const i of chosenItems()) {
    i.x = Math.round((i.x + dx) * 100) / 100;
    i.z = Math.round((i.z + dz) * 100) / 100;
    ctx.things.put(i);
  }
  ctx.setChanged();
  ctx.redraw();
}

// A figure leaves the whole scene (every board); a piece of furniture leaves the set.
export function deleteSelected() {
  const items = chosenItems();
  if (!items.length) return;
  for (const it of items) {
    if (it.kind === "object") ctx.loc.objects.splice(ctx.loc.objects.indexOf(it), 1);
    else {
      removeFigure(ctx.project, ctx.scene, it.id);
      ctx.figures.splice(ctx.figures.indexOf(it), 1);
    }
    ctx.things.remove(it.id);
  }
  ctx.setChanged();
  select(null);
}

// Cmd-D, as in Storyboarder: a copy of the chosen piece or figure, half a metre to the east, then chosen.
// With several chosen, every one is copied and the copies become the choice.
export async function duplicateSelected() {
  const items = chosenItems();
  if (!items.length) return;
  const copies = [];
  for (const it of items) {
    const copy = JSON.parse(JSON.stringify(it));
    copy.id = uid();
    copy.x = Math.round((it.x + 0.5) * 100) / 100;
    if (it.kind === "figure") {
      sceneBlocking(ctx.project, ctx.scene).figures.push(copy);
      ctx.figures.push(copy);
    } else ctx.loc.objects.push(copy);
    copies.push(copy);
  }
  ctx.setChanged();
  await Promise.all(copies.map((c) => ctx.things.put(c)));
  chosen = new Set(copies.map((c) => c.id));
  selected = copies.at(-1).id;
  showChoice();
}

// Cmd-B, Storyboarder's "drop": the chosen piece or figure back down to the floor (elevation 0).
export function dropSelected() {
  const items = chosenItems().filter((i) => i.y);
  if (!items.length) return;
  for (const it of items) {
    it.y = 0;
    ctx.things.put(it);
  }
  ctx.setChanged();
  showSelected();
  ctx.redraw();
}

// Camera to the selected figure's eyes, in metres.
export function subjectDistance() {
  const it = selectedItem();
  if (!it || it.kind !== "figure") return null;
  const s = ctx.shot();
  const eye = (it.height * 0.93) / 100;
  return Math.hypot(it.x - s.x, eye - s.height / 100, it.z - s.z);
}

// A number with its own slider: drag the slider, type in the box, or use ↑/↓ in the box (Shift = ×10).
// Scrolling doesn't change it (scrolling only scrolls the panel).
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
  if (chosen.size > 1) return showGroup(box);
  const isFig = it.kind === "figure";
  const own = ctx.things.sizeOf(it.id);   // the model's own size, for ↺
  const ownCm = (v, fallback) => (own ? Math.round(v * 100) : fallback);
  const others = ctx.figures.filter((f) => f.id !== it.id);
  box.innerHTML = `
    <h3>${isFig ? "Figure" : "Selected"}</h3>
    ${isFig
      ? `<label class="sg-own" title="On: this board keeps its own position and pose for this figure; the other boards don't follow. Off: shared with every board of the scene."><input type="checkbox" data-f="own"> This board only</label>
         <label><span>Name</span><input data-f="name" autocomplete="off"></label>
         <div><span class="muted sg-unit">${colourNote(it)}</span><div class="sg-colours">${[PLAIN, ...FIGURE_COLOURS].map((c) => `<button data-colour="${c}" style="background:${c}" aria-label="${c === PLAIN ? "Plain" : c}" title="${c === PLAIN ? "Plain (no colour)" : c}"></button>`).join("")}</div></div>${numberRow("Height", "height", 30, 230, 1, "cm", byId(it.model).height)}
         <label><span>Pose</span><select data-f="pose">${POSE_ORDER.map((k) => `<option value="${k}">${POSES[k].label}</option>`).join("")}</select></label>
         <label><span>Looks at</span><select data-f="lookAt"><option value="">Where the pose looks</option><option value="camera">The lens</option>${it.lookAt === "point" ? '<option value="point">Where the head was dragged</option>' : ""}${others.map((f) => `<option value="${f.id}">${f.name}</option>`).join("")}</select></label>
         <p class="muted sg-unit">Drag the dots on the figure to pose it: hands and feet move the whole limb, the blue dot raises or lowers the hips, the white one turns the head.</p>
         <details class="sg-joints"${selectedJoint ? " open" : ""}><summary>Pose by hand</summary>
           <label><span>Joint</span><select data-f="joint">${JOINTS.map(([b, l]) => `<option value="${b}">${l}</option>`).join("")}</select></label>
           ${numberRow("Forward", "jx", -120, 120, 5, "°", 0)}
           ${numberRow("Turn", "jy", -120, 120, 5, "°", 0)}
           ${numberRow("Side", "jz", -120, 120, 5, "°", 0)}
           <button data-act="clear-joints">Undo all hand posing and dragging</button>
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
    ctx.setChanged();
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
  }
  if (name) {
    name.oninput = () => { it.name = name.value; ctx.things.put(it); ctx.setChanged(); ctx.redraw(); };
    // A finished name takes its character's colour; a name cleared back to nothing makes the figure plain again.
    name.onchange = () => {
      it.colour = colourFor(ctx.project, it.name, it);
      syncColours(ctx.project);
      ctx.things.put(it);
      ctx.setChanged();
      showSelected();
    };
  }
  const ownBox = box.querySelector("[data-f=own]");
  if (ownBox) {
    ownBox.checked = isOwn(ctx.board, it.id);
    ownBox.onchange = () => {
      const next = setOwn(ctx.project, ctx.scene, ctx.board, it.id, ownBox.checked);
      if (next) swapFigure(next);
      ctx.setChanged();
      ctx.redraw();
      showSelected();
    };
  }
  box.querySelectorAll("[data-colour]").forEach((b) => {
    b.classList.toggle("on", b.dataset.colour === it.colour);
    b.onclick = () => {
      pickColour(ctx.project, it, b.dataset.colour);
      syncColours(ctx.project);
      for (const f of ctx.figures) ctx.things.put(f);
      ctx.setChanged();
      ctx.redraw();
      showSelected();
    };
  });
  const repose = () => { ctx.things.put(it); ctx.setChanged(); ctx.redraw(); };
  // A new pose starts clean: dragged limbs, hip shift and joint turns belong to the old one.
  if (poseSel) poseSel.onchange = () => {
    it.pose = poseSel.value;
    delete it.manual;
    delete it.hipsShift;
    it.joints = {};
    if (it.lookAt === "point") it.lookAt = "";
    repose();
    showSelected();
  };
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
      delete it.manual;
      delete it.hipsShift;
      if (it.lookAt === "point") it.lookAt = "";
      rows.filter((r) => axis(r.dataset.key) >= 0).forEach(show);
      repose();
    }
  };
}

// Several chosen: what they can all change at once — eye line and pose for the figures; drop, delete, let go.
function showGroup(box) {
  const items = chosenItems();
  const figs = items.filter((i) => i.kind === "figure");
  const pieces = items.length - figs.length;
  const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;
  const same = (key, fallback = "") => {
    const vals = new Set(figs.map((f) => f[key] || fallback));
    return vals.size === 1 ? [...vals][0] : "mixed";
  };
  const mixed = '<option value="mixed" disabled>— not all the same —</option>';
  const names = ctx.figures.map((f) => `<option value="${f.id}">${f.name}</option>`).join("");
  box.innerHTML = `
    <h3>${items.length} chosen</h3>
    <p class="muted sg-unit">${[figs.length ? count(figs.length, "figure", "figures") : "", pieces ? count(pieces, "piece", "pieces") : ""].filter(Boolean).join(", ")}. Drag one in the top view to move them all.</p>
    ${figs.length ? `<label><span>Looks at</span><select data-g="lookAt">${mixed}<option value="">Where the pose looks</option><option value="camera">The lens</option>${names}</select></label>
    <p class="muted sg-unit">A figure chosen as the one to look at keeps its own eye line.</p>
    <label><span>Pose</span><select data-g="pose">${mixed}${POSE_ORDER.map((k) => `<option value="${k}">${POSES[k].label}</option>`).join("")}</select></label>` : ""}
    <div class="sg-sel-buttons"><button data-act="drop">Drop to floor</button><button data-act="delete" class="danger">Delete ${items.length}</button><button data-act="done">Let go</button></div>`;
  const lookSel = box.querySelector("[data-g=lookAt]");
  const poseSel = box.querySelector("[data-g=pose]");
  if (lookSel) lookSel.value = same("lookAt") === "point" ? "mixed" : same("lookAt");
  if (poseSel) poseSel.value = same("pose", "stand");
  const done = () => { for (const f of figs) ctx.things.put(f); ctx.setChanged(); ctx.redraw(); showSelected(); };
  if (lookSel) lookSel.onchange = () => {
    for (const f of figs) if (f.id !== lookSel.value) f.lookAt = lookSel.value;
    done();
  };
  if (poseSel) poseSel.onchange = () => {
    for (const f of figs) {
      f.pose = poseSel.value;
      delete f.manual;
      delete f.hipsShift;
      f.joints = {};
      if (f.lookAt === "point") f.lookAt = "";
    }
    done();
  };
  box.onclick = (e) => {
    const act = e.target.dataset?.act;
    if (act === "drop") dropSelected();
    if (act === "delete") deleteSelected();
    if (act === "done") select(null);
  };
}

// Called after an object's model loads, so the panel shows its real size.
export function refreshSelected() {
  if (selectedItem()) showSelected();
}
