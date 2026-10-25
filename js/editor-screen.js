// The board editor screen: wires the canvas, tool column, panel, board strip, menus and saving together.

import * as db from "./db.js";
import {
  LAYER_LABELS, BOARD_WIDTH, boardHeight, heading, boardLabel, orderedBoards, sceneBoards, sceneOf, ago,
  insertBoardAfter, insertBoardBefore, toggleNewShot, nudgeBoard, duplicateBoard, removeBoard, moveBoard, moveBoardToScene, addScene, removeScene, newScene, nextSceneNumber,
} from "./model.js";
import { TOOLS, MOVE, loadToolSettings, saveToolSettings } from "./brush.js";
import { BoardView } from "./board-view.js";
import { initStrip, renderStrip, setCurrent, setThumb, scrollToBoard } from "./strip.js";
import { initPanel, fillPanel, updateLabel, renderLayers, togglePanel } from "./panel.js";
import * as store from "./board-store.js";
import { toast, confirmBox, formDialog, openMenu, shareFile, banner, pickFile, showText } from "./ui.js";
import { exportProject } from "./projectfile.js";
import { askOptions, makeContactSheet } from "./contact-sheet.js";
import { lensMatches, lensText } from "./lens.js";
import { importSpreadsheet, importScript } from "./importer.js";
import { renumber } from "./renumber.js";
import { logText, clearLog } from "./pencil-log.js";
import { shotSheetXlsx, shotSheetCsv, boardImagesZip, imageName } from "./shot-sheet.js";
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
const LAYOUT_KEY = "storyboard.layout";
let layout = { panelHidden: false, focus: false };
try { Object.assign(layout, JSON.parse(localStorage.getItem(LAYOUT_KEY))); } catch { /* defaults */ }
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
  $("import-btn").onclick = (e) => importMenu(e.currentTarget);
  $("export-btn").onclick = (e) => exportMenu(e.currentTarget);
  $("info-btn").onclick = () => togglePanel();
  $("panel-btn").onclick = () => setLayout({ panelHidden: !(layout.panelHidden || layout.focus), focus: false });
  $("focus-btn").onclick = () => setLayout({ focus: !layout.focus });
  setLayout({});
  $("fit").onclick = () => view.fit();
  $("shotgen-btn").onclick = openShotGen;
  $("scene-jump").onchange = (e) => selectBoard(sceneBoards(project, e.target.value)[0], true);

  window.addEventListener("resize", () => project && view.fit());
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(); });
  window.addEventListener("pagehide", () => flush());
  document.addEventListener("keydown", keyDown);
  document.addEventListener("keyup", keyUp);
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
    { name: "actBefore", label: "Act divider before this scene (e.g. ACT 2)", value: s.actBefore || "" },
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

// Hide panel / Focus mode: more room for the frame.
function setLayout(change) {
  Object.assign(layout, change);
  const screen = $("editor-screen");
  screen.classList.toggle("no-panel", layout.panelHidden || layout.focus);
  screen.classList.toggle("focus", layout.focus);
  $("panel-btn").textContent = layout.panelHidden || layout.focus ? "Show panel" : "Hide panel";
  $("focus-btn").classList.toggle("on", layout.focus);
  if (layout.focus) togglePanel(false);
  try { localStorage.setItem(LAYOUT_KEY, JSON.stringify(layout)); } catch { /* not essential */ }
  requestAnimationFrame(() => project && view.fit());
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
  const eraser = TOOLS.find((t) => t.id === "eraser");
  view.quickEraser = { def: eraser, size: eraser.sizes[settings.eraser.size], color: "#000" };
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
  if (!def || !def.colors.length) return toast("Pick a drawing tool first, then hold I and click a colour.");
  settings[toolId].color = hex;
  saveToolSettings(settings);
  setTool(toolId);
}

// Mac keys, matching Storyboarder 3.0's key map (read from the installed app, 2026-10-24). Cmd-K lists them.
const KEY_LIST = `Drawing
  1 light pencil · 2 brush · 4 pencil · 5 pen · 6 note pen · 7 eraser · V move/scale
  8 / 9 / 0  first, second, third colour of the tool
  [ and ]  smaller / bigger
  Shift  straight line · Alt-drag  quick erase · Space-drag  pan
  Cmd-drag  move layer · Cmd-Alt-drag  scale layer · hold I and click  pick colour
  Backspace  clear all drawing layers · Alt-Backspace  clear the active layer

Boards
  N  new board (next Kuva #) · Shift-N  new board before this one (same shot)
  /  toggle "new shot" on this board · D  duplicate · Cmd-Backspace  delete board
  ← →  previous / next board · Alt-← →  move board left / right
  Cmd-← →  previous / next scene

View
  O  onion skin · Tab  cycle view (panel, no panel, focus) · Shift-Tab  back
  P  hide panel · F  focus
  Cmd-0  fit · Cmd-+ / Cmd--  zoom
  Cmd-Z  undo · Cmd-Shift-Z  redo
  Cmd-P  contact sheet PDF · Cmd-Shift-P  blank worksheet
  Cmd-K  this list`;

const VIEW_MODES = [{ panelHidden: false, focus: false }, { panelHidden: true, focus: false }, { panelHidden: false, focus: true }];

function keyDown(e) {
  if ($("editor-screen").hidden || !board || !$("shotgen").hidden) return;
  if (e.target.matches?.("input, textarea, select") || document.querySelector("dialog[open]")) return;
  const key = e.key.toLowerCase();
  const cmd = e.metaKey || e.ctrlKey;
  const run = (fn) => { e.preventDefault(); fn(); };

  if (cmd) {
    if (key === "z") return run(() => (e.shiftKey ? view.redo() : view.undo()));
    if (key === "y") return run(() => view.redo());
    if (key === "k") return run(() => showText("Keys", KEY_LIST));
    if (key === "p") return run(() => exportContactSheet(e.shiftKey ? { kind: "blank" } : {}));
    if (key === "s") return run(() => flush().then(() => toast("Saved — the app saves as you work. Export a project file for a backup.")));
    if (key === "0") return run(() => view.fit());
    if (key === "=" || key === "+") return run(() => zoomView(1.25));
    if (key === "-") return run(() => zoomView(0.8));
    if (e.key === "ArrowLeft") return run(() => stepScene(-1));
    if (e.key === "ArrowRight") return run(() => stepScene(1));
    if (e.key === "Backspace" || e.key === "Delete") return run(deleteCurrent);
    return;
  }
  if (key === "i") { view.pickHeld = true; return; }
  const tool = [...TOOLS, MOVE].find((t) => t.key === key);
  if (tool) return run(() => setTool(tool.id));
  const colour = { 8: 0, 9: 1, 0: 2 }[e.key];
  if (colour !== undefined) return run(() => pickPaletteColour(colour));
  if (e.key === "[") return run(() => changeSize(-1));
  if (e.key === "]") return run(() => changeSize(1));
  if (e.key === "ArrowLeft") return run(() => (e.altKey ? moveCurrent(-1) : step(-1)));
  if (e.key === "ArrowRight") return run(() => (e.altKey ? moveCurrent(1) : step(1)));
  if (key === "n") return run(() => (e.shiftKey ? newBoardBefore() : newBoard(true)));
  if (key === "d") return run(duplicateCurrent);
  if (e.key === "/") return run(toggleShot);
  if (key === "o") return run(() => toggleGuide("onion"));
  if (e.key === "Tab") return run(() => cycleView(e.shiftKey ? -1 : 1));
  if (key === "f") return run(() => setLayout({ focus: !layout.focus }));
  if (key === "p") return run(() => setLayout({ panelHidden: !(layout.panelHidden || layout.focus), focus: false }));
  if (e.key === "Backspace" || e.key === "Delete") return run(() => (e.altKey ? clearLayer(false) : view.clearDrawing()));
  if (e.key === " ") return run(() => (view.spaceHeld = true));
}

function keyUp(e) {
  if (e.key === " ") view.spaceHeld = false;
  if (e.key.toLowerCase() === "i") view.pickHeld = false;
}

function cycleView(dir) {
  const now = VIEW_MODES.findIndex((m) => m.focus === layout.focus && m.panelHidden === (layout.panelHidden && !layout.focus));
  setLayout(VIEW_MODES[(Math.max(0, now) + dir + VIEW_MODES.length) % VIEW_MODES.length]);
}

function zoomView(k) {
  const r = $("view").getBoundingClientRect();
  view.zoomAt(r.width / 2, r.height / 2, view.z * k);
}

function stepScene(dir) {
  const i = project.scenes.findIndex((s) => s.id === board.sceneId);
  const scene = project.scenes[i + dir];
  if (scene) selectBoard(sceneBoards(project, scene.id)[0], true);
}

function moveCurrent(dir) {
  if (!nudgeBoard(project, board, dir)) return;
  edited();
  saveSoon();
  refreshStrip();
  updateLabel(project, board);
  scrollToBoard($("strip"), board.id);
}

async function newBoardBefore() {
  await flush();
  const b = insertBoardBefore(project, board);
  edited();
  refreshStrip();
  await selectBoard(b, true);
}

function toggleShot() {
  toggleNewShot(project, board);
  edited();
  saveSoon();
  refreshStrip();
  fillPanel(project, board);
}

function toggleGuide(key) {
  view.guides[key] = !view.guides[key];
  saveGuides();
  if (key === "onion") updateOnion();
  view.drawGuides();
}

function pickPaletteColour(i) {
  const def = TOOLS.find((t) => t.id === toolId);
  if (!def || !def.colors[i]) return;
  settings[toolId].color = def.colors[i];
  saveToolSettings(settings);
  setTool(toolId);
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
    { type: "sep" },
    { label: "Pencil log…", action: () => showText("Pencil log", `Storyboard v${VERSION}\n${navigator.userAgent}\n\n${logText()}`, { onClear: clearLog }) },
  ]);
}

function importMenu(anchor) {
  openMenu(anchor, [
    { label: "Breakdown or shot list (.xlsx)…", action: async () => {
      const file = await pickFile(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      if (file) afterImport(await importSpreadsheet(project, file));
    } },
    { label: "Script file (.fountain, .txt)…", action: async () => {
      const file = await pickFile();
      if (file) afterImport(await importScript(project, await file.text()));
    } },
    { label: "Paste script text…", action: async () => {
      const v = await formDialog("Paste script text", [{ name: "text", label: "Script", type: "textarea", rows: 12, value: "" }], { ok: "Find scenes" });
      if (v) afterImport(await importScript(project, v.text));
    } },
    { label: "Renumber list (.csv)…", action: async () => {
      const file = await pickFile();
      if (file) afterImport(await renumber(project, await file.text()));
    } },
    { type: "sep" },
    { type: "note", label: "Imports add and fill in; drawings are never changed. A renumber list moves boards with their drawings." },
  ]);
}

async function afterImport(changed) {
  metaDirty = true;   // remembered column choices
  if (changed) edited();
  await flush();
  if (!changed) return;
  refreshStrip();
  if (board) fillPanel(project, board);
  toast("Imported.");
}

function exportMenu(anchor) {
  openMenu(anchor, [
    { label: "Contact sheet PDF…", action: exportContactSheet },
    { label: "Project file (.storyboard)…", action: exportProjectFile },
    { label: "This board as PNG…", action: exportPng },
    { label: "All boards as PNGs (.zip)…", action: exportAllPngs },
    { label: "Shot data sheet (.xlsx)…", action: () => exportShotSheet("xlsx") },
    { label: "Shot data sheet (.csv)…", action: () => exportShotSheet("csv") },
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

// ---------- Shot Generator ----------

async function openShotGen() {
  await flush();
  toast("Opening the Shot Generator…");
  let mod;
  try {
    mod = await import("./shotgen/screen.js");
  } catch (err) {
    return toast("Couldn't open the Shot Generator: " + err.message, 5000);
  }
  let target = board;   // the board the Shot Generator saves to; moves on with "Save as new board"
  // Returns a note when the board's Lens/Focal had to follow the 3D camera (INTEGRATION.md item 1).
  const keep = (b, picture, shot3d) => {
    b.shot3d = shot3d;
    // Height and tilt also go to the shot data sheet.
    b.camera = { height: shot3d.camera.height, tilt: shot3d.camera.tilt, pan: shot3d.camera.pan, focal: shot3d.camera.focal };
    let note = "";
    if (!lensMatches(b.lens, shot3d.camera.focal)) {
      const old = (b.lens || "").trim();
      b.lens = lensText(shot3d.camera.focal);
      note = old ? `Lens/Focal changed ${old} → ${b.lens}` : `Lens/Focal set to ${b.lens}`;
    }
    if (board === b) {
      view.drawReference(picture, "fill");
      renderLayers(b, view.activeLayer);
      fillPanel(project, b);
    }
    edited();
    saveSoon(200);
    return note;
  };
  mod.openShotGenerator(project, target, {
    label: boardLabel(project, target),
    changed: () => { metaDirty = true; saveSoon(); },
    close: () => { if (board === target) view.fit(); },
    save: (picture, shot3d) => {
      const note = keep(target, picture, shot3d);
      toast(`Saved to the board's reference layer.${note ? " " + note + "." : ""} Draw over it, or dim it in Layers.`, note ? 5000 : 2600);
    },
    // A new board after the current one, as the next shot (next Kuva #), with this camera view on it.
    saveAsNew: async (picture, shot3d) => {
      await flush();
      const b = insertBoardAfter(project, target, true);
      target = b;
      edited();
      refreshStrip();
      await selectBoard(b, true);
      const note = keep(b, picture, shot3d);
      return { board: b, label: boardLabel(project, b), note };
    },
  });
}

async function exportContactSheet(preset = {}) {
  const o = await askOptions(project, preset);
  if (!o) return;
  project.pdfOptions = o;
  metaDirty = true;
  await flush();
  toast("Making PDF…");
  try {
    const blob = await makeContactSheet(project, o);
    const name = `${safeName(project.title)} ${o.kind === "blank" ? "worksheet" : "storyboard"}.pdf`;
    await shareFile(blob, name, "application/pdf");
  } catch (err) {
    toast("Couldn't make the PDF: " + err.message);
  }
}

async function exportShotSheet(kind) {
  await flush();
  const name = `${safeName(project.title)} shot data.${kind}`;
  if (kind === "xlsx") await shareFile(await shotSheetXlsx(project), name, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  else await shareFile(shotSheetCsv(project), name, "text/csv");
}

async function exportAllPngs() {
  await flush();
  toast("Preparing pictures…");
  const blob = await boardImagesZip(project, (done, total) => { if (done % 5 === 0) toast(`Preparing pictures… ${done} of ${total}`); });
  await shareFile(blob, `${safeName(project.title)} boards.zip`, "application/zip");
}

async function exportPng() {
  await flush();
  const blob = await store.canvasBlob(view.flatten(BOARD_WIDTH));
  await shareFile(blob, imageName(project, board), "image/png");
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
