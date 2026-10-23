// The board editor screen: wires the canvas, tool column, panel, board strip, menus and saving together.

import * as db from "./db.js";
import {
  LAYER_LABELS, BOARD_WIDTH, boardHeight, heading, boardLabel, orderedBoards, sceneBoards, sceneOf, ago,
  insertBoardAfter, duplicateBoard, removeBoard, moveBoard, moveBoardToScene, addScene, removeScene, newScene, nextSceneNumber,
} from "./model.js";
import { TOOLS, MOVE, loadToolSettings, saveToolSettings } from "./brush.js";
import { BoardView } from "./board-view.js";
import { initStrip, renderStrip, setCurrent, setThumb, scrollToBoard } from "./strip.js";
import { initPanel, fillPanel, updateLabel, renderLayers, togglePanel } from "./panel.js";
import * as store from "./board-store.js";
import { toast, confirmBox, formDialog, openMenu, shareFile, banner, pickFile } from "./ui.js";
import { exportProject } from "./projectfile.js";
import { VERSION } from "./version.js";

const $ = (id) => document.getElementById(id);
const GUIDES_KEY = "storyboard.guides";
const NUDGE_DAYS = 3;

let project = null;
let board = null;
let view = null;
let leave = null;
let toolId = "pencil";
let fitMode = "fit";
let loadToken = 0;
let saveTimer = null;
let metaDirty = false;
const settings = loadToolSettings();
const thumbs = new Map();   // board id → image address for the strip
const dirty = new Set();    // layers of the current board not yet saved

export function initEditor({ exit }) {
  leave = exit;
  view = new BoardView({
    view: $("view"), stack: $("stack"), cursor: $("cursor"),
    hooks: { onChange: layerChanged, onPick: pickedColour, onActive: () => board && renderLayers(board, view.activeLayer) },
  });
  try { Object.assign(view.guides, JSON.parse(localStorage.getItem(GUIDES_KEY)) || {}); } catch { /* defaults */ }

  buildTools();
  initPanel({
    edit: editField, changeScene, newBoard, duplicate: duplicateCurrent, remove: deleteCurrent,
    toggleLayer, setActive: (n) => view.setActive(n), setOpacity, clearLayer: () => clearLayer(true),
    addPhoto, setFitMode: (m) => (fitMode = m),
  });
  initStrip($("strip"), {
    select: (id) => selectBoard(byId(id)),
    reorder, toggleScene, editScene, addScene: addSceneDialog,
  });

  $("back").onclick = async () => { await flush(); leave(); };
  $("undo").onclick = () => view.undo();
  $("redo").onclick = () => view.redo();
  $("guides-btn").onclick = (e) => guidesMenu(e.currentTarget);
  $("export-btn").onclick = (e) => exportMenu(e.currentTarget);
  $("info-btn").onclick = () => togglePanel();
  $("fit").onclick = () => view.fit();
  $("scene-jump").onchange = (e) => selectBoard(sceneBoards(project, e.target.value)[0], true);

  window.addEventListener("resize", () => project && view.fit());
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  window.addEventListener("pagehide", () => flush());
  document.addEventListener("keydown", keyDown);
  document.addEventListener("keyup", (e) => { if (e.key === " ") view.spaceHeld = false; });
  document.addEventListener("paste", pastePhoto);
}

export async function openProject(p) {
  project = p;
  board = null;
  $("project-title").textContent = p.title;
  view.setSize(BOARD_WIDTH, boardHeight(p.ratio));
  for (const url of thumbs.values()) URL.revokeObjectURL(url);
  thumbs.clear();
  await Promise.all(p.boards.map(async (b) => {
    const blob = await db.getThumb(b.id);
    if (blob) thumbs.set(b.id, URL.createObjectURL(blob));
  }));
  refreshStrip();
  view.fit();
  await selectBoard(orderedBoards(p)[0], true);
  exportNote();
  nudge();
}

export const flushEditor = () => flush();

const byId = (id) => project.boards.find((b) => b.id === id);

// ---------- boards ----------

async function selectBoard(b, scroll = false) {
  if (!b) return;
  await flush();
  const token = ++loadToken;
  const images = await store.loadImages(b);
  if (token !== loadToken) return;
  board = b;
  view.showBoard(b, images);
  fillPanel(project, b);
  renderLayers(b, view.activeLayer);
  setCurrent($("strip"), b.id);
  if (scroll) scrollToBoard($("strip"), b.id);
  $("scene-jump").value = b.sceneId;
  updateOnion();
}

function step(delta) {
  const list = orderedBoards(project);
  selectBoard(list[list.indexOf(board) + delta], true);
}

async function newBoard(newShot) {
  await flush();
  const b = insertBoardAfter(project, board, newShot);
  edited();
  refreshStrip();
  await selectBoard(b, true);
}

async function duplicateCurrent() {
  await flush();
  const src = board;
  const b = duplicateBoard(project, src);
  for (const [name, st] of Object.entries(src.layers)) {
    if (!st.hasData) continue;
    const blob = await db.getLayer(src.id, name);
    if (blob) await db.putLayer(b.id, name, blob);
  }
  const thumb = await db.getThumb(src.id);
  if (thumb) {
    await db.putThumb(b.id, thumb);
    thumbs.set(b.id, URL.createObjectURL(thumb));
  }
  edited();
  refreshStrip();
  await selectBoard(b, true);
}

async function deleteCurrent() {
  if (sceneBoards(project, board.sceneId).length === 1) {
    return toast("This is the scene's only board. To remove it, delete the scene (Edit on the scene heading).");
  }
  const ok = await confirmBox(`Delete board ${boardLabel(project, board)}? Its drawings go with it.`, { ok: "Delete", danger: true });
  if (!ok) return;
  const list = orderedBoards(project);
  const i = list.indexOf(board);
  const next = list[i + 1] && list[i + 1].sceneId === board.sceneId ? list[i + 1] : list[i - 1];
  const gone = board;
  dirty.clear();
  board = null;
  removeBoard(project, gone);
  await db.deleteBoardData(gone.id);
  dropThumb(gone.id);
  edited();
  refreshStrip();
  await selectBoard(next, true);
}

function reorder(id, targetId, after) {
  moveBoard(project, byId(id), byId(targetId), after);
  edited();
  saveSoon();
  refreshStrip();
  if (board) updateLabel(project, board);
}

async function changeScene(sceneId) {
  if (sceneId === board.sceneId) return;
  const target = project.scenes.find((s) => s.id === sceneId);
  const ok = await confirmBox(`Move this board to ${heading(target)}? It keeps Kuva # ${board.kuva}.`, { ok: "Move" });
  if (ok) {
    moveBoardToScene(project, board, sceneId);
    edited();
    saveSoon();
    refreshStrip();
    scrollToBoard($("strip"), board.id);
  }
  fillPanel(project, board);
}

function editField(field, value) {
  board[field] = value;
  edited();
  saveSoon();
  if (field === "kuva") {
    refreshStrip();
    updateLabel(project, board);
  }
}

// ---------- scenes ----------

function sceneDialog(title, s, extra) {
  return formDialog(title, [
    { name: "kohtaus", label: "Kohtaus #", value: s.kohtaus },
    { name: "intExt", label: "INT/EXT", type: "select", options: ["INT", "EXT", "INT/EXT"], value: s.intExt },
    { name: "lokaatio", label: "Lokaatio", value: s.lokaatio },
    { name: "aika", label: "Vuorokaudenaika", value: s.aika },
    { name: "synopsis", label: "Synopsis", type: "textarea", value: s.synopsis },
    { name: "henkilot", label: "Henkilöt", value: s.henkilot },
  ], { ok: "Save", extra });
}

async function addSceneDialog() {
  const s = newScene({ kohtaus: String(nextSceneNumber(project)) });
  const v = await sceneDialog("New scene", s);
  if (!v) return;
  Object.assign(s, v);
  const b = addScene(project, s);
  edited();
  refreshStrip();
  await selectBoard(b, true);
}

async function editScene(id) {
  const s = project.scenes.find((x) => x.id === id);
  const v = await sceneDialog("Edit scene", s, [{ label: "Delete scene", value: "delete" }]);
  if (!v) return;
  if (v.__action === "delete") return deleteScene(s);
  Object.assign(s, v);
  edited();
  saveSoon();
  refreshStrip();
  if (board) fillPanel(project, board);
}

async function deleteScene(s) {
  if (project.scenes.length === 1) return toast("A project needs at least one scene.");
  const n = sceneBoards(project, s.id).length;
  const ok = await confirmBox(`Delete ${heading(s)} and its ${n} ${n === 1 ? "board" : "boards"}? Their drawings go with them.`, { ok: "Delete scene", danger: true });
  if (!ok) return;
  const wasCurrent = board && board.sceneId === s.id;
  if (wasCurrent) {
    dirty.clear();
    board = null;
  }
  for (const b of removeScene(project, s)) {
    await db.deleteBoardData(b.id);
    dropThumb(b.id);
  }
  edited();
  refreshStrip();
  if (wasCurrent) await selectBoard(orderedBoards(project)[0], true);
  else await flush();
}

function toggleScene(id) {
  const s = project.scenes.find((x) => x.id === id);
  s.collapsed = !s.collapsed;
  metaDirty = true;
  saveSoon();
  refreshStrip();
}

function refreshStrip() {
  renderStrip($("strip"), project, board?.id, thumbs);
  const jump = $("scene-jump");
  jump.innerHTML = "";
  for (const s of project.scenes) jump.append(new Option(heading(s), s.id));
  if (board) jump.value = board.sceneId;
}

// ---------- layers ----------

function toggleLayer(name) {
  const st = board.layers[name];
  st.visible = !st.visible;
  view.applyLayerState(name);
  renderLayers(board, view.activeLayer);
  metaDirty = true;
  saveSoon();
}

function setOpacity(name, value) {
  board.layers[name].opacity = value;
  view.applyLayerState(name);
  metaDirty = true;
  saveSoon();
}

async function clearLayer(ask) {
  const name = view.activeLayer;
  if (ask && !(await confirmBox(`Clear the ${LAYER_LABELS[name]} layer on this board?`, { ok: "Clear", danger: true }))) return;
  view.clearLayer(name);
}

async function addPhoto() {
  const file = await pickFile("image/*");
  if (file) placePhoto(file);
}

async function placePhoto(file) {
  try {
    view.drawReference(await store.loadPhoto(file), fitMode);
    renderLayers(board, view.activeLayer);
  } catch {
    toast("Couldn't open that picture.");
  }
}

function pastePhoto(e) {
  if ($("editor-screen").hidden || !board || e.target.matches?.("input, textarea")) return;
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
  if (!item) return;
  e.preventDefault();
  placePhoto(item.getAsFile());
}

async function updateOnion() {
  const b = board;
  if (!view.guides.onion || !b) return view.setOnion(null, null);
  const list = orderedBoards(project);
  const i = list.indexOf(b);
  const [prev, next] = await Promise.all([list[i - 1], list[i + 1]].map((x) => (x ? store.flattenStored(x, view.w / 2, view.h / 2, { skipReference: true }) : null)));
  if (b === board) view.setOnion(prev, next);
}

// ---------- saving ----------

function layerChanged(name, { cleared = false } = {}) {
  board.layers[name].hasData = !cleared;
  dirty.add(name);
  edited();
  saveSoon(800);
}

function edited() {
  project.modified = Date.now();
  if (!project.editedSinceExport) {
    project.editedSinceExport = true;
    project.firstEditSinceExport = Date.now();
  }
  metaDirty = true;
}

function saveSoon(ms = 600) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, ms);
}

async function flush() {
  clearTimeout(saveTimer);
  if (!project) return;
  if (board && dirty.size) {
    const b = board;
    const names = [...dirty];
    dirty.clear();
    // Take every picture now, before anything else can draw on the canvases.
    const layerJobs = names.map((n) => (b.layers[n].hasData ? store.canvasBlob(view.layers[n]) : null));
    const thumbJob = store.canvasBlob(view.flatten(320), "image/jpeg", 0.8);
    for (let i = 0; i < names.length; i++) {
      const blob = await layerJobs[i];
      if (blob) await db.putLayer(b.id, names[i], blob);
      else await db.deleteLayer(b.id, names[i]);
    }
    const thumb = await thumbJob;
    await db.putThumb(b.id, thumb);
    dropThumb(b.id);
    thumbs.set(b.id, URL.createObjectURL(thumb));
    setThumb($("strip"), b.id, thumbs.get(b.id));
    metaDirty = true;
  }
  if (metaDirty) {
    metaDirty = false;
    await db.putProject(project);
  }
}

function dropThumb(id) {
  if (thumbs.has(id)) URL.revokeObjectURL(thumbs.get(id));
  thumbs.delete(id);
}

// ---------- tools ----------

function buildTools() {
  const el = $("tools");
  el.innerHTML = `<div class="tool-grid"></div>
    <button id="straight" class="toggle" title="Straight lines (or hold Shift)">Straight</button>
    <div class="move-modes"><button data-mode="move" class="on">Move</button><button data-mode="scale">Scale</button></div>
    <div class="sizes"></div><div class="colors"></div>`;
  const grid = el.querySelector(".tool-grid");
  for (const def of [...TOOLS, MOVE]) {
    const b = document.createElement("button");
    b.dataset.tool = def.id;
    b.textContent = def.short;
    b.title = `${def.label} (${def.key.toUpperCase()})`;
    b.onclick = () => setTool(def.id);
    grid.append(b);
  }
  $("straight").onclick = () => {
    view.straight = !view.straight;
    $("straight").classList.toggle("on", view.straight);
  };
  el.querySelectorAll("[data-mode]").forEach((b) => {
    b.onclick = () => {
      view.moveMode = b.dataset.mode;
      el.querySelectorAll("[data-mode]").forEach((x) => x.classList.toggle("on", x === b));
    };
  });
  setTool(toolId);
}

function setTool(id) {
  toolId = id;
  const el = $("tools");
  el.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("on", b.dataset.tool === id));
  el.querySelector(".move-modes").hidden = id !== "move";
  $("straight").hidden = id === "move";
  const sizes = el.querySelector(".sizes");
  const colors = el.querySelector(".colors");
  sizes.innerHTML = "";
  colors.innerHTML = "";

  const def = TOOLS.find((t) => t.id === id);
  if (def) {
    const s = settings[id];
    def.sizes.forEach((_, i) => {
      const b = document.createElement("button");
      b.className = "size" + (s.size === i ? " on" : "");
      b.title = ["Small", "Medium", "Large"][i];
      b.innerHTML = `<span style="width:${5 + i * 5}px;height:${5 + i * 5}px"></span>`;
      b.onclick = () => { s.size = i; saveToolSettings(settings); setTool(id); };
      sizes.append(b);
    });
    const swatches = !def.colors.length || def.colors.includes(s.color) ? def.colors : [...def.colors, s.color];
    for (const c of swatches) {
      const b = document.createElement("button");
      b.className = "swatch" + (c === s.color ? " on" : "");
      b.style.background = c;
      b.title = c;
      b.onclick = () => { s.color = c; saveToolSettings(settings); setTool(id); };
      colors.append(b);
    }
  }
  view.tool = def ? { def, size: def.sizes[settings[id].size], color: settings[id].color } : { def: MOVE };
}

function changeSize(delta) {
  const s = settings[toolId];
  if (!s) return;
  s.size = Math.min(2, Math.max(0, s.size + delta));
  saveToolSettings(settings);
  setTool(toolId);
}

function pickedColour(hex) {
  const def = TOOLS.find((t) => t.id === toolId);
  if (!def || !def.colors.length) return toast("Pick a drawing tool first, then Option-click a colour.");
  settings[toolId].color = hex;
  saveToolSettings(settings);
  setTool(toolId);
}

// Mac keyboard shortcuts (SPEC §6.2).
function keyDown(e) {
  if ($("editor-screen").hidden || !board) return;
  if (e.target.matches?.("input, textarea, select") || document.querySelector("dialog[open]")) return;
  const key = e.key.toLowerCase();
  if (e.metaKey || e.ctrlKey) {
    if (key === "z") { e.preventDefault(); e.shiftKey ? view.redo() : view.undo(); }
    else if (key === "y") { e.preventDefault(); view.redo(); }
    return;
  }
  const tool = [...TOOLS, MOVE].find((t) => t.key === key);
  if (tool) return setTool(tool.id);
  if (e.key === "[") changeSize(-1);
  else if (e.key === "]") changeSize(1);
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "ArrowRight") step(1);
  else if (key === "n") newBoard(!e.shiftKey);
  else if (e.key === "Backspace" || e.key === "Delete") clearLayer(false);
  else if (e.key === " ") { e.preventDefault(); view.spaceHeld = true; }
  else return;
  e.preventDefault();
}

// ---------- menus ----------

function saveGuides() {
  try { localStorage.setItem(GUIDES_KEY, JSON.stringify(view.guides)); } catch { /* not essential */ }
}

function guidesMenu(anchor) {
  const toggle = (key, label) => ({
    type: "toggle", label, value: view.guides[key],
    onChange: (v) => {
      view.guides[key] = v;
      saveGuides();
      if (key === "onion") updateOnion();
      view.drawGuides();
    },
  });
  openMenu(anchor, [
    toggle("grid", "Grid"),
    toggle("center", "Centre marks"),
    toggle("thirds", "Thirds"),
    toggle("horizon", "Horizon / eye-line"),
    {
      type: "range", label: "Horizon height", min: 0, max: 100, value: Math.round((1 - board.horizon) * 100),
      onChange: (v) => {
        board.horizon = 1 - v / 100;
        view.horizon = board.horizon;
        view.drawGuides();
        metaDirty = true;
        saveSoon();
      },
    },
    toggle("safe", "Action safe (93%)"),
    {
      type: "select", label: "Protect for", value: String(view.guides.protect || 0),
      options: [["0", "None"], ["1.33", "1.33:1"], ["1.66", "1.66:1"], ["1.78", "1.78:1"], ["1.85", "1.85:1"], ["2", "2.00:1"], ["2.39", "2.39:1"]],
      onChange: (v) => { view.guides.protect = parseFloat(v); saveGuides(); view.drawGuides(); },
    },
    { type: "sep" },
    toggle("onion", "Onion skin (previous blue, next red)"),
  ]);
}

function exportMenu(anchor) {
  openMenu(anchor, [
    { label: "Project file (.storyboard)…", action: exportProjectFile },
    { label: "This board as PNG…", action: exportPng },
    { type: "sep" },
    { type: "note", label: exportNoteText() },
    { type: "note", label: "Storyboard v" + VERSION },
  ]);
}

const safeName = (s) => s.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Untitled";

async function exportProjectFile() {
  await flush();
  toast("Packing the project…");
  const blob = await exportProject(project);
  const ok = await shareFile(blob, safeName(project.title) + ".storyboard", "application/zip");
  if (!ok) return;
  project.exported = Date.now();
  project.editedSinceExport = false;
  project.firstEditSinceExport = null;
  await db.putProject(project);
  exportNote();
}

async function exportPng() {
  await flush();
  const blob = await store.canvasBlob(view.flatten(BOARD_WIDTH));
  const scene = sceneOf(project, board);
  await shareFile(blob, `${safeName(project.title)} ${scene.kohtaus || "x"}-${boardLabel(project, board)}.png`, "image/png");
}

function exportNoteText() {
  return project.exported ? "Last exported: " + ago(project.exported) : "Not exported yet";
}

function exportNote() {
  $("export-note").textContent = exportNoteText();
}

function nudge() {
  if (!project.editedSinceExport) return;
  const since = project.exported || project.firstEditSinceExport;
  const days = Math.floor((Date.now() - since) / 864e5);
  if (days < NUDGE_DAYS) return;
  banner(`Edited for ${days} days without an export. A project file is your backup off this device.`, [
    { label: "Export now", primary: true, action: exportProjectFile },
    { label: "Later" },
  ]);
}
