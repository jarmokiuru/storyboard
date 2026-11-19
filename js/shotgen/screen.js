// Shot Generator screen: opens full screen from a board, edits the set, furniture, figures and camera, and saves
// the camera view to the board's reference layer. One 3D space per scene (v0.22.0): the figures are the scene's
// (blocking.js); each board of the scene is a camera, stepped through with the Cameras row or keys 1–9.

import * as THREE from "three";
import { Stage, LIGHT } from "./stage.js";
import { defaultRoom } from "./set.js";
import { SENSORS, PRIMES, DEFAULT_SENSOR, sensorById } from "./sensors.js";
import { formDialog, toast, openMenu, choose, confirmBox, pickFile, shareFile } from "../ui.js";
import * as db from "../db.js";
import { blankPlan, SHOT_DESIGNER, SHARP } from "../plan-export.js";
import { scenePlan } from "../scene-plan.js";
import { loadPlanPicture, calibratePlan } from "../plan-calibrate.js";
import { locationFile, readLocationFile } from "../location-file.js";
import { parseLens } from "../lens.js";
import { Things } from "./things.js";
import { SIZES, frameSize, sizeFromKuvakoko } from "./framing.js";
import { startPlacing, setBoard as placingBoard, addMenu, select, selectedItem, chosenItems, isChosen, lead, chooseAllFigures, setSeveral, severalOn, moveSelected, deleteSelected, duplicateSelected, dropSelected, subjectDistance, refreshSelected } from "./placing.js";
import { uid, sceneOf, orderedBoards, BOARD_WIDTH, boardHeight, heading, readRoom, roomOpenings } from "../model.js";
import { openingsEditor } from "./openings-editor.js";
import { sceneBlocking, boardFigures, syncColours, pictureStale, setStamp, boardLight } from "./blocking.js";
import { makeUndo } from "./undo.js";
import { foldable } from "../fold.js";

const $ = (id) => document.getElementById(id);
const SLIDERS = [
  ["height", "Height", 10, 400, 1, "cm"],
  ["pan", "Pan", -180, 180, 0.5, "°"],
  ["tilt", "Tilt", -90, 90, 0.5, "°"],
  ["roll", "Roll", -45, 45, 0.5, "°"],
];

let stage = null;
let project, board, scene, loc, shot, hooks, figures;
let loaded = "";   // the camera and light as they were when this board was opened, to tell whether they changed
let light = { ...LIGHT };   // sun direction and height, sun strength, fill, outside brightness (stage.js LIGHT)
let zoomRange = null;   // when the board's Lens/Focal is a zoom, e.g. [24, 70]
let drag = null;
let history = null;   // undo and redo (undo.js), for the board being looked through
const pressed = new Set();   // pointers down anywhere: a change is taken in for undo once they are up
const touches = new Map();

// ---------- data ----------

// One set per location, shared by every scene shot there (SPEC §3). Found by the scene's link, then by name.
function locationFor(p, scene) {
  p.locations = p.locations || [];
  let l = p.locations.find((x) => x.id === scene.locationId);
  const name = (scene.lokaatio || "").trim();
  const exterior = /^EXT/i.test(scene.intExt || "");
  if (!l && name) l = p.locations.find((x) => x.name.toLowerCase() === name.toLowerCase() && !!x.room.exterior === exterior);
  if (!l) {
    l = { id: uid(), name: name || heading(scene), tag: "assumed", room: defaultRoom(exterior) };
    p.locations.push(l);
  }
  scene.locationId = l.id;
  return l;
}

function defaultShot(room) {
  return { x: 0, z: room.exterior ? 6 : room.d / 2 - 0.4, height: 150, pan: 0, tilt: 0, roll: 0, focal: 35 };
}

const sensor = () => sensorById(project.sensor || DEFAULT_SENSOR);

// ---------- open / close ----------

// hooks: save(canvas, shot3d) — put the picture on the board; changed() — project data changed; close()
// hooks: save(boardId, canvas, shot3d) — put the picture on that board; changed() — project data changed;
// close(boardId) — back to the editor, on the board last looked through; label(board) — a board's name, e.g. "3a".
export function openShotGenerator(p, b, h) {
  project = p;
  board = b;
  hooks = h;
  scene = sceneOf(project, board);
  loc = locationFor(project, scene);
  if (!Array.isArray(loc.room.openings)) loc.room = readRoom(loc.room);   // stored before openings[] (v0.19.0)
  sceneBlocking(project, scene);   // made from the boards' own figures the first time (blocking.js)
  syncColours(project);
  cameraFor(board, null);
  if (!stage) {
    stage = new Stage($("sg-canvas"));
    // The panel is only rebuilt when a model finishes loading, never while someone is typing in it.
    stage.things = new Things(stage.scene, () => { stage.request(); readout(); }, () => refreshSelected());
    stage.things.cameraAt = () => stage.shotCam.position.clone();
    bind();
  }
  $("shotgen").hidden = false;
  showTitle();
  buildControls();
  stage.setSet(loc.room);
  showPlan();
  figures = boardFigures(project, scene, board);
  // One light per scene (v0.27.0): made the first time from this board's light (or the one it carried over).
  if (!scene.light) scene.light = lightFor(project, board);
  light = boardLight(scene, board);
  loaded = camLightText();
  showLight();
  showShading();
  placeAll();
  apply();
  showCameras();
  stage.resize();
  hooks.changed();
  history = makeUndo(undoState, putState);
  showUndo();
}

// ---------- undo ----------

// Everything the Shot Generator can change, as text.
const undoState = () => JSON.stringify({
  shot, sceneLight: scene.light,
  ownLight: Object.fromEntries(sceneBoardsInOrder().map((b) => [b.id, b.ownLight || null])),
  figures: sceneBlocking(project, scene).figures,
  own: Object.fromEntries(sceneBoardsInOrder().map((b) => [b.id, b.ownFigures || null])),
  objects: loc.objects || [], room: loc.room,
  characters: project.characters || [], shading: project.shading || "clay",
});

function putState(text) {
  const s = JSON.parse(text);
  shot = s.shot;
  scene.light = s.sceneLight;
  scene.blocking = { figures: s.figures };
  for (const b of sceneBoardsInOrder()) {
    if (s.own[b.id]) b.ownFigures = s.own[b.id];
    else delete b.ownFigures;
    if (s.ownLight[b.id]) b.ownLight = s.ownLight[b.id];
    else delete b.ownLight;
  }
  light = boardLight(scene, board);
  if (JSON.stringify(loc.room) !== JSON.stringify(s.room)) { loc.room = s.room; stage.setSet(loc.room); }
  loc.objects = s.objects;
  project.characters = s.characters;
  project.shading = s.shading;
  figures = boardFigures(project, scene, board);
  const keep = new Set([...loc.objects, ...figures].map((i) => i.id));
  for (const id of [...stage.things.nodes.keys()]) if (!keep.has(id)) stage.things.remove(id);
  for (const o of loc.objects) stage.things.put(o);
  placingBoard(board, figures);
  if (!selectedItem()) select(null);
  refreshSelected();
  showShading();
  showLight();
  apply();
  showCameras();
  hooks.changed();
}

function showUndo() {
  const can = history?.can() || {};
  $("sg-undo").disabled = !can.undo;
  $("sg-redo").disabled = !can.redo;
}

function undoRedo(back) {
  if (!history) return;
  if (!(back ? history.undo() : history.redo())) toast(back ? "Nothing to undo." : "Nothing to redo.");
  showUndo();
}

// Take in a change once nothing is held down, so one drag, one slider move or one held key is one step.
function watchUndo() {
  if (!history || $("shotgen").hidden || pressed.size || held.size) return;
  history.check();
  showUndo();
}

const showTitle = () => ($("sg-title").textContent = `${loc.name} · Board ${hooks.label(board)}`);

// The camera a board starts with: its own, else (a board not framed yet) the camera just looked through, or the
// default; either way on the board's shot-list lens (INTEGRATION.md item 1).
function cameraFor(b, from) {
  shot = { ...defaultShot(loc.room), ...(from || {}), ...(b.shot3d?.camera || {}) };
  const lens = parseLens(b.lens);
  zoomRange = lens?.range ?? null;
  if (!b.shot3d?.camera && lens) shot.focal = lens.focal;
}

const camLightText = () => JSON.stringify([shot, light]);

// The camera and light stay with the board when you step to another camera or leave, even without saving a picture.
function keepCamera() {
  if (!board || camLightText() === loaded) return;
  const { dir, ...rest } = light;
  board.shot3d = { ...(board.shot3d || {}), locationId: loc.id, camera: { ...shot }, sun: dir, light: rest };
  loaded = camLightText();
  hooks.changed();
}

// ---------- cameras: the scene's boards ----------

const sceneBoardsInOrder = () => orderedBoards(project).filter((b) => b.sceneId === scene.id);

// A board needs a new picture when its saved 3D picture is out of date, or it has a camera but its reference layer
// is still empty. A reference that isn't a 3D picture (a photo) is never replaced.
const needsPicture = (b) => pictureStale(project, scene, b, loc) || (!!b.shot3d?.camera && !b.shot3d.figures && !b.layers?.reference?.hasData);

function showCameras() {
  const row = $("sg-cameras");
  row.innerHTML = "";
  sceneBoardsInOrder().forEach((b, i) => {
    const btn = document.createElement("button");
    btn.dataset.board = b.id;
    btn.textContent = hooks.label(b);
    btn.title = `Board ${hooks.label(b)}${i < 9 ? ` (key ${i + 1})` : ""}${b.kuvakoko ? " · " + b.kuvakoko : ""}`;
    btn.classList.toggle("on", b === board);
    btn.classList.toggle("stale", needsPicture(b));
    btn.classList.toggle("unset", !b.shot3d?.camera);
    row.append(btn);
  });
  const n = sceneBoardsInOrder().filter(needsPicture).length;
  $("sg-rerender").textContent = n ? `Update ${n === 1 ? "1 picture" : n + " pictures"}` : "All pictures up to date";
  $("sg-rerender").disabled = !n;
}

// Step to another board of the scene: this camera stays with this board, the figures stay where they are (the
// board's own versions swap in), and so does the light (the scene's, or the board's own).
function switchTo(b) {
  if (!b || b === board) return;
  keepCamera();
  const from = { ...shot };
  board = b;
  cameraFor(board, from);
  light = boardLight(scene, board);
  figures = boardFigures(project, scene, board);
  loaded = camLightText();
  placingBoard(board, figures);
  showLight();
  showTitle();
  markListedSize();
  apply();
  showCameras();
  history?.reset();   // undo works within the board being looked through
  showUndo();
}

// Make every out-of-date picture in the scene again, each through its own board's camera and light.
async function rerenderAll() {
  keepCamera();
  const todo = sceneBoardsInOrder().filter(needsPicture);
  if (!todo.length) return;
  const back = board;
  let done = 0;
  for (const b of todo) {
    switchTo(b);
    toast(`Updating pictures… ${++done} / ${todo.length}`, 60000);
    await hooks.save(b.id, picture(), shot3d());
  }
  switchTo(back);
  showCameras();
  toast(`${todo.length === 1 ? "1 picture" : todo.length + " pictures"} updated.`);
}

// Furniture from the set and figures from the board, into the 3D scene.
function placeAll() {
  startPlacing({
    project, board, scene, loc, figures, things: stage.things,
    shot: () => shot,
    setChanged: () => { hooks.changed(); showCameras(); },
    redraw: () => { stage.request(); readout(); },
  });
}

function showPlan() {
  if (!loc.plan) return stage.setPlan(null);
  db.getPlan(project.id, loc.id).then((blob) => stage.setPlan(loc.plan, blob));
}

function close() {
  keepCamera();
  $("shotgen").hidden = true;
  hooks.close(board.id);
}

const picture = () => stage.snapshot(BOARD_WIDTH, boardHeight(project.ratio));
// Saved as shot3d.sun (direction, as in v0.11.0) plus shot3d.light (the rest).
// savedCamera, savedLight, setStamp and figures record what the picture showed, so a later change marks it out of date.
const shot3d = () => {
  const { dir, ...rest } = light;
  return {
    locationId: loc.id, camera: { ...shot }, figures: structuredClone(figures), sun: dir, light: rest,
    savedCamera: { ...shot }, savedLight: { sun: dir, light: rest }, setStamp: setStamp(project, loc),
  };
};

const readLight = (b) => (b.shot3d?.sun != null ? { ...LIGHT, ...(b.shot3d.light || {}), dir: b.shot3d.sun } : null);

// Before v0.27.0 each board had its own light, carried from the board before. This reads that, once, to start the
// scene's shared light: the board's own, else the nearest earlier board's in the same scene.
function lightFor(p, b) {
  if (readLight(b)) return readLight(b);
  const scene = orderedBoards(p).filter((x) => x.sceneId === b.sceneId);
  for (let i = scene.indexOf(b) - 1; i >= 0; i--) if (readLight(scene[i])) return readLight(scene[i]);
  return { ...LIGHT };
}

// [key, label, min, max, step, title] — modelled on Storyboarder's World panel (ambient intensity; directional
// intensity, rotation and tilt; background brightness), in the units a DP would use.
const LIGHT_ROWS = [
  ["dir", "Sun", 0, 360, 5, "Where the sun comes from on the plan: 0° = from north, 90° = from east"],
  ["height", "Height", 5, 90, 1, "How high the sun is above the horizon: low = long shadows, 90° = straight overhead"],
  ["sun", "Strength", 0, 100, 1, "How bright the sun is"],
  ["fill", "Fill", 0, 100, 1, "Ambient light: how bright the shadow side is"],
  ["diffusion", "Diffusion", 0, 100, 1, "How soft the sun is: 0 = hard sun, 100 = overcast (soft, faint shadows)"],
  ["outside", "Outside", 0, 100, 1, "Brightness of the sky outside — what you see through the window or behind an exterior"],
];
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
const lightText = (key, v) => (key === "walls" ? "" : key === "dir" ? `${v}° ${COMPASS[Math.round(v / 45) % 8]}` : key === "height" ? `${v}°` : `${v}%`);

// Shading is one look for the whole project, like Storyboarder's per-scene setting.
function showShading() {
  const mode = project.shading === "outline" ? "outline" : "clay";
  stage.setShading(mode);
  for (const b of $("sg-shading").children) b.classList.toggle("on", b.dataset.shading === mode);
}

function buildLight() {
  const box = $("sg-light");
  box.querySelectorAll(".sg-slider").forEach((r) => r.remove());
  for (const [key, label, min, max, step, title] of LIGHT_ROWS) {
    const row = document.createElement("div");
    row.className = "sg-slider";
    row.title = title;
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" data-light="${key}" aria-label="${title}"><output data-light-out="${key}"></output><button class="sg-zero" data-light-reset="${key}" title="Back to ${lightText(key, LIGHT[key])}">↺</button>`;
    box.append(row);
  }
  box.querySelectorAll(".sg-check").forEach((x) => x.remove());
  const walls = document.createElement("label");
  walls.className = "sg-check";
  walls.title = "Walls and ceiling cast shadows: the sun gets in only through the window and door";
  walls.innerHTML = `<input type="checkbox" data-light-walls> Walls block the sun`;
  box.append(walls);
  const own = document.createElement("label");
  own.className = "sg-check";
  own.title = "On: this board keeps its own light; the other boards don't follow. Off: the light is shared by every board of the scene.";
  own.innerHTML = `<input type="checkbox" data-light-own> This board only`;
  box.append(own);
}

function showLight() {
  stage.setLight(light);
  for (const [key] of LIGHT_ROWS) {
    $("sg-light").querySelector(`[data-light="${key}"]`).value = light[key];
    $("sg-light").querySelector(`[data-light-out="${key}"]`).textContent = lightText(key, light[key]);
  }
  $("sg-light").querySelector("[data-light-walls]").checked = !!light.walls;
  $("sg-light").querySelector("[data-light-own]").checked = !!board.ownLight;
}

async function save() {
  await hooks.save(board.id, picture(), shot3d());
  loaded = camLightText();
  close();
}


// Storyboarder's "insert as new shot": keep working here, now on the new board.
async function saveAsNew() {
  keepCamera();
  const made = await hooks.saveAsNew(board.id, picture(), shot3d());
  board = made.board;
  figures = boardFigures(project, scene, board);
  placingBoard(board, figures);
  loaded = camLightText();
  zoomRange = parseLens(board.lens)?.range ?? null;
  markListedSize();
  showTitle();
  showCameras();
  toast(`Saved as new board ${made.label}.${made.note ? " " + made.note + "." : ""} Keep framing, or go back to the board.`, 4000);
}

// ---------- controls ----------

function buildControls() {
  const sel = $("sg-sensor");
  sel.innerHTML = "";
  let group = null;
  for (const s of SENSORS) {
    if (!group || group.label !== s.camera) {
      group = document.createElement("optgroup");
      group.label = s.camera;
      sel.append(group);
    }
    group.append(new Option(`${s.mode} — ${s.w} × ${s.h} mm`, s.id));
  }
  sel.value = sensor().id;

  const lenses = $("sg-lenses");
  lenses.innerHTML = "";
  // The project's own lens set (e.g. from a starter file), otherwise Jarmo's primes.
  for (const f of project.lenses?.length ? project.lenses : PRIMES) {
    const b = document.createElement("button");
    b.textContent = f;
    b.dataset.focal = f;
    lenses.append(b);
  }

  const sliders = $("sg-sliders");
  sliders.innerHTML = "";
  for (const [key, label, min, max, stepSize, unit] of SLIDERS) {
    const row = document.createElement("div");
    row.className = "sg-slider";
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${stepSize}" data-key="${key}" aria-label="${label}"><output data-for="${key}"></output><button class="sg-zero" data-reset="${key}" title="Back to ${key === "height" ? "150 cm" : "0°"}">↺</button>`;
    row.dataset.unit = unit;
    sliders.append(row);
  }
  const sizes = $("sg-sizes");
  sizes.innerHTML = "";
  for (const s of SIZES) {
    const b = document.createElement("button");
    b.textContent = s.id;
    b.dataset.size = s.id;
    b.title = s.title;
    sizes.append(b);
  }
  markListedSize();
  refreshControls();
}

// The board's Kuvakoko from the shot list gets a dashed outline, so the matching button is easy to find.
function markListedSize() {
  const want = sizeFromKuvakoko(board.kuvakoko);
  for (const b of $("sg-sizes").children) b.classList.toggle("listed", b.dataset.size === want);
  $("sg-listed").textContent = board.kuvakoko ? `(shot list: ${board.kuvakoko})` : "";
}

// Frame the chosen figure (or the only figure on the board) at a shot size, keeping the pan.
function frameAt(sizeId) {
  let it = selectedItem();
  if (it?.kind !== "figure") it = figures.length === 1 ? figures[0] : null;
  if (!it) return toast(figures.length ? "Tap a figure first, then the shot size." : "Add a figure first (Add → Figure), then choose the shot size.");
  const next = frameSize(sizeId, stage.things.landmarks(it.id), shot, stage.shotCam.fov);
  if (!next) return toast("That figure is still loading. Try again in a moment.");
  Object.assign(shot, next);
  apply();
  const r = loc.room;
  if (!r.exterior && (Math.abs(shot.x) > r.w / 2 || Math.abs(shot.z) > r.d / 2)) {
    toast(`At ${shot.focal} mm the camera has to stand outside the room for a ${sizeId}. Choose a wider lens, or turn the camera.`, 5000);
  }
}

function refreshControls() {
  for (const input of $("sg-sliders").querySelectorAll("input")) input.value = shot[input.dataset.key];
  for (const out of $("sg-sliders").querySelectorAll("output")) {
    const v = shot[out.dataset.for];
    out.textContent = (out.dataset.for === "height" ? Math.round(v) : (Math.round(v * 10) / 10).toFixed(1)) + out.parentElement.dataset.unit;
  }
  for (const b of $("sg-lenses").querySelectorAll("button")) b.classList.toggle("on", Number(b.dataset.focal) === shot.focal);
  if (document.activeElement !== $("sg-focal")) $("sg-focal").value = shot.focal;
}

function apply() {
  stage.setShot(shot, sensor(), project.ratio);
  stage.things.refreshLooks();   // figures looking into the lens follow the camera
  refreshControls();
  readout();
}

function readout() {
  if (!stage?.hfov) return;
  const s = sensor();
  const d = subjectDistance();
  const subject = (d == null ? "" : ` · subject ${d.toFixed(2)} m`) + (zoomRange ? ` · zoom ${zoomRange[0]}–${zoomRange[1]} mm` : "");
  const speed = $("sg-speed").checked ? ` · ${stage.fps ? stage.fps + " fps" : "move to measure"}` : "";
  $("sg-readout").textContent = `${shot.focal} mm · ${stage.hfov.toFixed(1)}° horizontal · height ${Math.round(shot.height)} cm · tilt ${shot.tilt.toFixed(1)}°${subject} · ${s.camera} ${s.mode}${speed}`;
}

// [ / ]: the next wider or longer lens in the project's lens set (or the prime set).
function stepLens(dir) {
  const set = [...(project.lenses?.length ? project.lenses : PRIMES)].map(Number).sort((a, b) => a - b);
  const next = dir < 0 ? set.filter((f) => f < shot.focal - 0.01).pop() : set.find((f) => f > shot.focal + 0.01);
  if (next) shot.focal = next;
}

function cycleShading() {
  project.shading = project.shading === "outline" ? "clay" : "outline";
  showShading();
  hooks.changed();
  stage.request();
}

function setView(v) {
  stage.view = v;
  document.querySelectorAll("#sg-views [data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
  stage.request();
}

const num = (s, fallback) => {
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? fallback : n;
};

// ---------- the set: size, plan picture, Shot Designer plan, location files (SPEC §8.1, §8.6) ----------

function setMenu(anchor) {
  openMenu(anchor, [
    { label: "Room size and openings…", action: setDialog },
    { type: "sep" },
    { label: loc.plan ? "Replace plan picture…" : "Add plan picture…", action: addPlanPicture },
    ...(loc.plan ? [
      { label: "Line up the plan again…", action: realignPlan },
      { label: "Remove plan picture", action: removePlan },
    ] : []),
    { type: "sep" },
    { label: "Plan for Shot Designer (PNG)", action: () => exportPlan(SHOT_DESIGNER) },
    { label: "Plan for Shot Designer, sharp (800 px/m)", action: () => exportPlan(SHARP) },
    { label: "Camera plan of this scene (PNG)", action: exportCameraPlan },
    { label: "Save location file", action: saveLocation },
    { label: "Open location file…", action: openLocation },
  ]);
}

async function addPlanPicture() {
  const file = await pickFile("image/*");
  if (!file) return;
  const pic = await loadPlanPicture(file);
  if (!pic) return;
  const res = await calibratePlan(pic, loc.room);
  if (!res) return;
  await db.putPlan(project.id, loc.id, pic.blob);
  usePlan(res);
}

async function realignPlan() {
  const blob = await db.getPlan(project.id, loc.id);
  if (!blob) return toast("The plan picture is missing on this device. Add it again.");
  const res = await calibratePlan({ blob, w: loc.plan.w, h: loc.plan.h, type: loc.plan.type }, loc.room, loc.plan);
  if (res) usePlan(res);
}

function usePlan({ plan, w, d }) {
  if (w) {
    loc.room = { ...loc.room, w, d };
    stage.setSet(loc.room);
  }
  loc.plan = plan;
  showPlan();
  setView("top");
  hooks.changed();
  toast("Plan lined up with the north wall. Check the doors and windows against it (Set… → Room size and openings).", 4500);
}

async function removePlan() {
  if (!(await confirmBox("Remove the plan picture from this set? The room and furniture stay.", { ok: "Remove", danger: true }))) return;
  await db.deletePlan(project.id, loc.id);
  delete loc.plan;
  showPlan();
  hooks.changed();
}

const fileName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, "-").trim() || "Set";
const metres = (v) => Number(v).toFixed(2);

// Jarmo's rules: blank, cropped wall to wall. The size, density and tag go in the file name, never on the plan.
// The default opens in Shot Designer at 1.25 × true size (scale it down to fit its props); sharp is for scaling by hand.
async function exportPlan(kind) {
  const r = loc.room;
  if (r.exterior) return toast("An exterior has no walls to draw. Shot Designer plans are for rooms.");
  const out = await blankPlan(r, kind);
  const name = `${fileName(loc.name)} plan ${metres(r.w)} x ${metres(r.d)} m ${out.ppm} px per m (${loc.tag}).png`;
  const scale = kind === SHOT_DESIGNER ? ` In Shot Designer it opens at ${Math.round(out.ppm)}% of true size; scale it to ${Math.round(10000 / out.ppm)}% to match its props.` : "";
  const note = out.ppm < kind.ppm ? ` The room is large, so it's ${out.ppm} px per metre instead of ${kind.ppm}.` : "";
  toast(`Picture width = ${metres(r.w)} m (west–east), height = ${metres(r.d)} m (north–south).${scale}${note}`, 7000);
  await shareFile(out.blob, name, "image/png");
}

// Every board's camera with its shot number and lens, on the set seen from above (scene-plan.js).
async function exportCameraPlan() {
  keepCamera();   // the camera being looked through counts too
  const out = await scenePlan(project, scene, loc);
  if (!out.cameras) return toast("No board in this scene has a camera yet.");
  await shareFile(out.blob, `${fileName(heading(scene))} camera plan.png`, "image/png");
}

async function saveLocation() {
  await shareFile(await locationFile(project, loc), `${fileName(loc.name)}.location.json`, "application/json");
}

// Brings in a set from a location file: room, openings, north, tag and plan replace this set's; furniture is
// Jarmo's choice when both have some. The set keeps its name and its link to the scenes.
async function openLocation() {
  const file = await pickFile(".json,application/json");
  if (!file) return;
  let got;
  try {
    got = await readLocationFile(file);
  } catch (err) {
    return toast(err.message, 5000);
  }
  const { location, planBlob } = got;
  let furniture = "file";
  if (loc.objects?.length && location.objects.length) {
    const pieces = (n) => (n === 1 ? "1 piece" : `${n} pieces`);
    furniture = await choose(`The file has ${pieces(location.objects.length)} of furniture; this set has ${pieces(loc.objects.length)}. Which to keep?`, [
      { label: "Keep mine", value: "keep" },
      { label: "Use the file's", value: "file" },
    ]);
    if (!furniture) return;
  } else if (!location.objects.length) furniture = "keep";
  loc.tag = location.tag;
  loc.room = location.room;
  if (location.gps) loc.gps = location.gps;
  if (furniture === "file") loc.objects = location.objects;
  if (planBlob) {
    await db.putPlan(project.id, loc.id, planBlob);
    loc.plan = location.plan;
  }
  stage.setSet(loc.room);
  showPlan();
  placeAll();
  apply();
  hooks.changed();
  toast(`Set loaded from "${location.name}".`);
}

async function setDialog() {
  const r = loc.room;
  const openings = openingsEditor(roomOpenings(r));
  const v = await formDialog(`Set: ${loc.name}`, [
    { type: "note", label: "Shared by every scene at this location. Offsets are from the wall's centre: + is east or south. Sill = height of the bottom edge above the floor." },
    { name: "name", label: "Location name", value: loc.name },
    { name: "tag", label: "Plan is", type: "select", value: loc.tag, options: [["measured", "Measured"], ["traced", "Traced"], ["assumed", "Assumed"]] },
    { name: "exterior", label: "Exterior (ground, no walls)", type: "checkbox", value: r.exterior },
    { name: "w", label: "Width, west–east (m)", value: r.w },
    { name: "d", label: "Depth, north–south (m)", value: r.d },
    { name: "h", label: "Ceiling height (m)", value: r.h },
    { type: "custom", name: "openings", ...openings },
  ], { ok: "Build" });
  if (!v) return;
  loc.name = v.name.trim() || loc.name;
  loc.tag = v.tag;
  const room = {
    ...r,
    exterior: v.exterior,
    w: Math.max(1, num(v.w, r.w)),
    d: Math.max(1, num(v.d, r.d)),
    h: Math.max(1.8, num(v.h, r.h)),
    openings: v.openings,
  };
  delete room.door;
  delete room.window;
  loc.room = room;
  showTitle();
  stage.setSet(loc.room);
  hooks.changed();
}

// ---------- input ----------

function bind() {
  $("sg-back").onclick = close;
  foldable($("sg-panel"), "storyboard.sg-panel-folded");   // folded sections, remembered per device
  $("sg-several").onclick = () => {
    setSeveral(!severalOn());
    $("sg-several").classList.toggle("on", severalOn());
  };
  $("sg-all-figs").onclick = chooseAllFigures;
  $("sg-none").onclick = () => select(null);
  $("sg-undo").onclick = () => undoRedo(true);
  $("sg-redo").onclick = () => undoRedo(false);
  document.addEventListener("pointerdown", (e) => pressed.add(e.pointerId), true);
  for (const t of ["pointerup", "pointercancel"]) document.addEventListener(t, (e) => { pressed.delete(e.pointerId); setTimeout(watchUndo, 0); }, true);
  setInterval(watchUndo, 400);   // also catches changes that finish later (a model loading, a dialog)
  $("sg-save").onclick = save;
  $("sg-save-new").onclick = saveAsNew;
  $("sg-set").onclick = (e) => setMenu(e.currentTarget);
  $("sg-add").onclick = (e) => addMenu(e.currentTarget);
  $("sg-reset").onclick = () => { shot = defaultShot(loc.room); apply(); };
  // ↺ next to a slider: just that value back to its start (height 150 cm, angles 0°).
  $("sg-sliders").addEventListener("click", (e) => {
    const key = e.target.dataset?.reset;
    if (!key) return;
    shot[key] = defaultShot(loc.room)[key];
    apply();
  });
  $("sg-focus").onclick = () => {
    $("shotgen").classList.toggle("focus");
    $("sg-focus").classList.toggle("on", $("shotgen").classList.contains("focus"));
    stage.resize();
  };
  document.querySelectorAll("#sg-views [data-view]").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  $("sg-cameras").onclick = (e) => {
    const id = e.target.closest("[data-board]")?.dataset.board;
    if (id) switchTo(project.boards.find((b) => b.id === id));
  };
  $("sg-rerender").onclick = rerenderAll;
  $("sg-sensor").onchange = (e) => { project.sensor = e.target.value; apply(); hooks.changed(); };
  $("sg-lenses").onclick = (e) => {
    const f = Number(e.target.dataset?.focal);
    if (f) { shot.focal = f; apply(); }
  };
  buildLight();
  $("sg-shading").onclick = (e) => {
    const mode = e.target.dataset?.shading;
    if (!mode) return;
    project.shading = mode;
    showShading();
    hooks.changed();
  };
  const setLightValue = (key, v) => {
    const [, , min, max] = LIGHT_ROWS.find((r) => r[0] === key);
    light[key] = key === "dir" ? ((v % 360) + 360) % 360 : Math.min(max, Math.max(min, v));
    showLight();
  };
  $("sg-light").addEventListener("change", (e) => {
    if (e.target.matches("[data-light-walls]")) {
      light.walls = e.target.checked;
      if (light.walls && loc.room.exterior) toast("An exterior has no walls; this takes effect in rooms.");
      showLight();
    }
    // This board only: on = the board takes a copy of the light as it is now; off = back to the scene's light.
    if (e.target.matches("[data-light-own]")) {
      if (e.target.checked) board.ownLight = structuredClone(light);
      else delete board.ownLight;
      light = boardLight(scene, board);
      showLight();
      hooks.changed();
    }
    showCameras();   // other boards' pictures may now be out of date
  });
  $("sg-light").addEventListener("input", (e) => {
    const key = e.target.dataset?.light;
    if (key) setLightValue(key, Number(e.target.value));
  });
  $("sg-light").addEventListener("click", (e) => {
    const key = e.target.dataset?.lightReset;
    if (key) { setLightValue(key, LIGHT[key]); showCameras(); }
  });
  // No scroll-to-change on the panel: scrolling only scrolls it (Jarmo, 2026-11-18).
  $("sg-sizes").onclick = (e) => {
    const id = e.target.dataset?.size;
    if (id) frameAt(id);
  };
  // Speed readout for checking the 2017 Mac (SPEC §8.5: aim for 20+ frames per second while dragging).
  try { $("sg-speed").checked = localStorage.getItem("sg-speed") === "1"; } catch { /* private mode */ }
  $("sg-speed").onchange = (e) => {
    try { localStorage.setItem("sg-speed", e.target.checked ? "1" : "0"); } catch { /* private mode */ }
    readout();
  };
  stage.onFrame = () => { if ($("sg-speed").checked) readout(); };
  $("sg-focal").onchange = (e) => {
    const f = num(e.target.value, shot.focal);
    if (f >= 4 && f <= 1200) { shot.focal = f; apply(); }
  };
  $("sg-sliders").addEventListener("input", (e) => {
    const key = e.target.dataset?.key;
    if (key) { shot[key] = Number(e.target.value); apply(); }
  });

  const canvas = $("sg-canvas");
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  for (const t of ["touchstart", "touchmove"]) canvas.addEventListener(t, (e) => e.preventDefault(), { passive: false });
  window.addEventListener("resize", () => { if (!$("shotgen").hidden) stage.resize(); });
  document.addEventListener("keydown", keys);
  document.addEventListener("keyup", keyUp);
  window.addEventListener("blur", () => { held.clear(); pressed.clear(); });
}

const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

function local(e) {
  const r = $("sg-canvas").getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function down(e) {
  try { $("sg-canvas").setPointerCapture(e.pointerId); } catch { /* dragging still works without it */ }
  const p = local(e);
  if (e.pointerType === "touch") {
    touches.set(e.pointerId, p);
    if (touches.size === 2) { drag = { mode: "pinch", d: spread(), span: stage.top.span, r: stage.orbit.r, focal: shot.focal }; return; }
  }
  if (drag) return;
  const { main, inset } = stage.layout();   // where things are now, not in the last drawn frame

  // The small plan in the camera view works like the top view: drag the camera or a piece to move it.
  // A tap on an empty part of it (or on the small camera picture in the other views) swaps the views.
  if (inside(p, inset)) {
    drag = (stage.view === "camera" && planGrab(e, p, inset)) || { mode: "swap", id: e.pointerId, start: p, tap: true };
    return;
  }
  const rect = main;
  if (stage.view === "top") {
    drag = planGrab(e, p, rect, true);
    drag.start = p;
    return;
  }
  // A joint dot on the chosen figure: drag it to pose (camera and orbit views).
  const cam = viewCamera(rect);
  const dot = stage.things.hitHandle(p.x, p.y, rect, cam);
  if (dot) {
    drag = { mode: "joint", id: e.pointerId, key: dot, rect, cam, pose: stage.things.dragStart(dot) };
    return;
  }
  if (stage.view === "camera") {
    drag = { mode: "look", id: e.pointerId, x: p.x, y: p.y, pan: shot.pan, tilt: shot.tilt, rect, tap: true };
  } else {
    drag = { mode: "orbit", id: e.pointerId, x: p.x, y: p.y, theta: stage.orbit.theta, phi: stage.orbit.phi, rect, tap: true };
  }
  drag.start = p;
}

// What a press on a plan (top view or the small plan) grabs: the camera, its aim point, a piece, or — for the
// top view — the floor to look around. Returns null when it grabs nothing (small plan only).
function planGrab(e, p, rect, isMain = false) {
  const g = stage.topToGround(p.x, p.y, rect);
  // About a fingertip, in metres — but never more than 0.6 m, or on the small plan the camera's handles
  // would swallow the furniture around them.
  const near = Math.min(28 / stage.topScale(rect), 0.6);
  const aim = { x: shot.x + Math.sin((shot.pan * Math.PI) / 180) * 1.2, z: shot.z - Math.cos((shot.pan * Math.PI) / 180) * 1.2 };
  if (Math.hypot(g.x - shot.x, g.z - shot.z) < near) return { mode: "move", id: e.pointerId, rect };
  const item = stage.things.hitPlan(g.x, g.z, near * 0.3);
  if (item) {
    // Several chosen and one of them pressed: drag them all. A tap (no drag) then chooses just it — or, adding
    // (Several on, or Shift), takes it out of the choice.
    const add = severalOn() || e.shiftKey;
    const group = isChosen(item) && (add || chosenItems().length > 1);
    if (group) lead(item);
    else select(item, add);
    const it = selectedItem();
    return { mode: "item", id: e.pointerId, rect, dx: it.x - g.x, dz: it.z - g.z, item, start: p, tap: group, tapAdd: add };
  }
  if (Math.hypot(g.x - aim.x, g.z - aim.z) < near) return { mode: "aim", id: e.pointerId, rect };
  return isMain ? { mode: "map", id: e.pointerId, x: p.x, y: p.y, cx: stage.top.cx, cz: stage.top.cz, rect, tap: true } : null;
}

function move(e) {
  const p = local(e);
  if (e.pointerType === "touch" && touches.has(e.pointerId)) touches.set(e.pointerId, p);
  if (!drag) return;
  if (drag.mode === "pinch") {
    // Once one finger has lifted, the other must not keep "pinching" against nothing.
    if (touches.size < 2) return;
    const k = drag.d / Math.max(1, spread());
    zoom(k, drag);
    return;
  }
  if (drag.id !== e.pointerId) return;
  if (drag.tap && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 6) drag.tap = false;
  if (drag.mode === "item") {
    const g = stage.topToGround(p.x, p.y, drag.rect);
    moveSelected(g.x + drag.dx, g.z + drag.dz);
    return;
  }
  if (drag.mode === "joint") {
    // The dot moves in a plane facing the camera, through where it started.
    const r = drag.rect;
    const ndc = new THREE.Vector2(((p.x - r.x) / r.w) * 2 - 1, 1 - ((p.y - r.y) / r.h) * 2);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, drag.cam);
    const normal = drag.cam.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, drag.pose.at);
    const target = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (target) stage.things.dragTo(drag.key, target, drag.pose);
    return;
  }
  if (drag.mode === "look" && drag.tap) return;   // could still be a tap
  if (drag.mode === "look") {
    // The picture follows the finger (Jarmo's choice): drag right = camera pans left, drag up = camera tilts down.
    // Speed matches the lens's angle of view, so a point stays under the finger.
    shot.pan = wrap(drag.pan - ((p.x - drag.x) / drag.rect.w) * stage.hfov);
    shot.tilt = clamp(drag.tilt + ((p.y - drag.y) / drag.rect.h) * stage.shotCam.fov, -90, 90);
    apply();
  } else if (drag.mode === "move") {
    const g = stage.topToGround(p.x, p.y, drag.rect);
    shot.x = round(g.x);
    shot.z = round(g.z);
    apply();
  } else if (drag.mode === "aim") {
    const g = stage.topToGround(p.x, p.y, drag.rect);
    shot.pan = Math.round(((Math.atan2(g.x - shot.x, -(g.z - shot.z)) * 180) / Math.PI) * 2) / 2;
    apply();
  } else if (drag.mode === "map") {
    const s = stage.topScale(drag.rect);
    stage.top.cx = drag.cx - (p.x - drag.x) / s;
    stage.top.cz = drag.cz - (p.y - drag.y) / s;
    stage.request();
  } else if (drag.mode === "orbit") {
    stage.orbit.theta = drag.theta - (p.x - drag.x) * 0.01;
    stage.orbit.phi = clamp(drag.phi - (p.y - drag.y) * 0.01, 0.15, Math.PI / 2 - 0.02);
    stage.request();
  }
}

function up(e) {
  touches.delete(e.pointerId);
  if (!drag) return;
  if (drag.id === e.pointerId && !drag.tap && drag.mode !== "pinch") { hooks.changed(); showCameras(); }   // a figure or piece may have moved
  if (drag.mode === "joint" && drag.id === e.pointerId) refreshSelected();
  if (drag.mode === "swap") {
    if (drag.tap && drag.id === e.pointerId) setView(stage.view === "camera" ? "top" : "camera");
  } else if (drag.mode === "item") {
    if (drag.tap && drag.id === e.pointerId) select(drag.item, drag.tapAdd);
  } else if (drag.tap && drag.id === e.pointerId) {
    tapSelect(local(e), drag, severalOn() || e.shiftKey);
  }
  if (drag.mode === "pinch" ? touches.size === 0 : drag.id === e.pointerId) drag = null;
}

// Pinch or scroll. Camera view: zooms the lens, like Storyboarder's scroll wheel. Top and orbit: zoom the view.
// k > 1 = wider / further out. from: the values when the pinch started (scrolling zooms from the current ones).
function zoom(k, from = { span: stage.top.span, r: stage.orbit.r, focal: shot.focal }) {
  if (stage.view === "camera") {
    shot.focal = Math.round(clamp(from.focal / k, 8, 400) * 2) / 2;
    apply();
  } else if (stage.view === "top") {
    stage.top.span = clamp(from.span * k, 2, 60);
    stage.request();
  } else {
    stage.orbit.r = clamp(from.r * k, 1.5, 60);
    stage.request();
  }
}

// The camera a view is drawn with, set up for the given rectangle (so screen points map correctly).
function viewCamera(rect) {
  if (stage.view === "orbit") {
    stage.aimOrbit(rect.w / rect.h);
    return stage.orbitCam;
  }
  return stage.shotCam;
}

// A tap without dragging picks what's under it (or clears the choice when it hits nothing).
// add: put the tapped piece into the choice (or take it out); a tap on nothing then changes nothing.
function tapSelect(p, d, add = false) {
  if (stage.view === "top") {
    const g = stage.topToGround(p.x, p.y, d.rect);
    return select(stage.things.hitPlan(g.x, g.z, 0.1), add);
  }
  const r = d.rect;
  const ndc = { x: ((p.x - r.x) / r.w) * 2 - 1, y: 1 - ((p.y - r.y) / r.h) * 2 };
  select(stage.things.hitView(ndc, stage.view === "camera" ? stage.shotCam : stage.orbitCam), add);
}

function wheel(e) {
  e.preventDefault();
  zoom(Math.exp(e.deltaY * 0.002));
}

// Mac keys, after Storyboarder's Shot Generator (read from its installed app, 2026-11-17): W/A/S/D move the camera,
// the arrows pan and tilt it (Jarmo, 2026-11-18; Storyboarder moves with both), R/F raise and lower it, Shift goes
// faster (smooth while held). Z/X roll, T top view ↔ camera
// view, [ wider lens / ] longer lens (through the lens set), Backspace deletes the chosen piece, Esc lets go of it
// (or goes back to the board when nothing is chosen), Cmd-D duplicates, Cmd-B drops to the floor, Cmd-K switches
// Clay/Outline.
const MOVES = { w: [0, 1], s: [0, -1], a: [-1, 0], d: [1, 0] };
const TURNS = { arrowleft: [-1, 0], arrowright: [1, 0], arrowup: [0, 1], arrowdown: [0, -1] };   // [pan, tilt]
const SPEED = 1.2;        // metres per second; Shift × 3
const TURN = 30;          // degrees per second; Shift × 3
const LIFT = 0.6;         // metres per second up or down
const held = new Set();
let fast = false;
let lastTick = 0;

// Keys typed into a text box stay there; sliders and buttons don't keep the keys.
const typing = (t) => t.matches?.("textarea, select, input:not([type=range]):not([type=checkbox]):not([type=button])");

function keys(e) {
  if ($("shotgen").hidden || document.querySelector("dialog[open]")) return;
  const key = e.key.toLowerCase();
  // Cmd keys work even from a number box in the panel (e.g. right after typing an elevation); the box is
  // left first, so it can't write its old value back over the change.
  if ((e.metaKey || e.ctrlKey) && (key === "z" || key === "y") && !typing(e.target)) {
    e.preventDefault();
    e.stopPropagation();
    return undoRedo(key === "z" && !e.shiftKey);
  }
  if (e.metaKey || e.ctrlKey) {
    const cmd = { d: duplicateSelected, b: dropSelected, k: cycleShading }[key];
    if (!cmd || e.shiftKey || e.altKey || e.target.matches?.("textarea")) return;
    e.preventDefault();
    e.stopPropagation();
    if (typing(e.target)) e.target.blur();
    return cmd();
  }
  if (typing(e.target)) return;
  fast = e.shiftKey;
  if (e.target.type === "range" && key.startsWith("arrow")) return;   // a chosen slider steps with the arrows
  if (MOVES[key] || TURNS[key] || key === "r" || key === "f") {
    e.preventDefault();
    e.stopPropagation();
    if (!held.size) {
      lastTick = performance.now();
      requestAnimationFrame(tick);
    }
    held.add(key);
    return;
  }
  const other = {
    z: () => (shot.roll = clamp(shot.roll - 1, -45, 45)),
    x: () => (shot.roll = clamp(shot.roll + 1, -45, 45)),
    backspace: deleteSelected,
    delete: deleteSelected,
    escape: () => (selectedItem() ? select(null) : close()),
    t: () => setView(stage.view === "top" ? "camera" : "top"),
    "[": () => stepLens(-1),
    ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), () => switchTo(sceneBoardsInOrder()[n - 1])])),
    "]": () => stepLens(1),
  };
  if (!other[key]) return;
  e.preventDefault();
  other[key]();
  if (!$("shotgen").hidden) apply();
}

function keyUp(e) {
  held.delete(e.key.toLowerCase());
  fast = e.shiftKey;
  setTimeout(watchUndo, 0);
}

function tick(now) {
  if (!held.size || $("shotgen").hidden) return held.clear();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  let fwd = 0;
  let side = 0;
  for (const k of held) if (MOVES[k]) { side += MOVES[k][0]; fwd += MOVES[k][1]; }
  const step = SPEED * (fast ? 3 : 1) * dt;
  const a = (shot.pan * Math.PI) / 180;
  shot.x = round(shot.x + (Math.sin(a) * fwd + Math.cos(a) * side) * step);
  shot.z = round(shot.z + (-Math.cos(a) * fwd + Math.sin(a) * side) * step);
  let pan = 0;
  let tilt = 0;
  for (const k of held) if (TURNS[k]) { pan += TURNS[k][0]; tilt += TURNS[k][1]; }
  const turn = TURN * (fast ? 3 : 1) * dt;
  if (pan) shot.pan = Math.round(wrap(shot.pan + pan * turn) * 10) / 10;
  if (tilt) shot.tilt = Math.round(clamp(shot.tilt + tilt * turn, -90, 90) * 10) / 10;
  if (held.has("r")) shot.height = clamp(shot.height + LIFT * 100 * dt * (fast ? 3 : 1), 10, 400);
  if (held.has("f")) shot.height = clamp(shot.height - LIFT * 100 * dt * (fast ? 3 : 1), 10, 400);
  apply();
  requestAnimationFrame(tick);
}

function spread() {
  const [a, b] = [...touches.values()];
  return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 1;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;
const round = (v) => Math.round(v * 100) / 100;


