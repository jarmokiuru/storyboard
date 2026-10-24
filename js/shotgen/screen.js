// Shot Generator screen: opens full screen from a board, edits the set and the camera, saves the camera view
// to the board's reference layer. Step 1 of phase 4: set + camera. Figures and furniture come next.

import { Stage } from "./stage.js";
import { defaultRoom } from "./set.js";
import { SENSORS, PRIMES, DEFAULT_SENSOR, sensorById } from "./sensors.js";
import { formDialog } from "../ui.js";
import { uid, sceneOf, BOARD_WIDTH, boardHeight, heading } from "../model.js";

const $ = (id) => document.getElementById(id);
const SLIDERS = [
  ["height", "Height", 10, 400, 1, "cm"],
  ["pan", "Pan", -180, 180, 0.5, "°"],
  ["tilt", "Tilt", -90, 90, 0.5, "°"],
  ["roll", "Roll", -45, 45, 0.5, "°"],
];

let stage = null;
let project, board, loc, shot, hooks;
let drag = null;
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
export function openShotGenerator(p, b, h) {
  project = p;
  board = b;
  hooks = h;
  loc = locationFor(project, sceneOf(project, board));
  shot = { ...defaultShot(loc.room), ...(board.shot3d?.camera || {}) };
  if (!stage) {
    stage = new Stage($("sg-canvas"));
    bind();
  }
  $("shotgen").hidden = false;
  $("sg-title").textContent = `${loc.name} · Board ${h.label}`;
  buildControls();
  stage.setSet(loc.room);
  apply();
  stage.resize();
  hooks.changed();
}

function close() {
  $("shotgen").hidden = true;
  hooks.close();
}

function save() {
  const w = BOARD_WIDTH;
  const h = boardHeight(project.ratio);
  const picture = stage.snapshot(w, h);
  hooks.save(picture, { locationId: loc.id, camera: { ...shot } });
  close();
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
  for (const f of PRIMES) {
    const b = document.createElement("button");
    b.textContent = f;
    b.dataset.focal = f;
    lenses.append(b);
  }

  const sliders = $("sg-sliders");
  sliders.innerHTML = "";
  for (const [key, label, min, max, stepSize, unit] of SLIDERS) {
    const row = document.createElement("label");
    row.className = "sg-slider";
    row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${stepSize}" data-key="${key}"><output data-for="${key}"></output>`;
    row.dataset.unit = unit;
    sliders.append(row);
  }
  refreshControls();
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
  refreshControls();
  const s = sensor();
  $("sg-readout").textContent = `${shot.focal} mm · ${stage.hfov.toFixed(1)}° horizontal · height ${Math.round(shot.height)} cm · tilt ${shot.tilt.toFixed(1)}° · ${s.camera} ${s.mode}`;
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

async function setDialog() {
  const r = loc.room;
  const walls = [["", "None"], ["n", "North"], ["s", "South"], ["e", "East"], ["w", "West"]];
  const v = await formDialog(`Set: ${loc.name}`, [
    { type: "note", label: "Shared by every scene at this location. Offsets are from the wall's centre: + is east or south." },
    { name: "name", label: "Location name", value: loc.name },
    { name: "tag", label: "Plan is", type: "select", value: loc.tag, options: [["measured", "Measured"], ["traced", "Traced"], ["assumed", "Assumed"]] },
    { name: "exterior", label: "Exterior (ground, no walls)", type: "checkbox", value: r.exterior },
    { name: "w", label: "Width, west–east (m)", value: r.w },
    { name: "d", label: "Depth, north–south (m)", value: r.d },
    { name: "h", label: "Ceiling height (m)", value: r.h },
    { name: "doorWall", label: "Door wall", type: "select", value: r.door?.wall || "", options: walls },
    { name: "doorOffset", label: "Door offset (m)", value: r.door?.offset ?? 0 },
    { name: "doorWidth", label: "Door width (m)", value: r.door?.width ?? 0.9 },
    { name: "winWall", label: "Window wall", type: "select", value: r.window?.wall || "", options: walls },
    { name: "winOffset", label: "Window offset (m)", value: r.window?.offset ?? 0 },
    { name: "winWidth", label: "Window width (m)", value: r.window?.width ?? 1.4 },
    { name: "winHeight", label: "Window height (m)", value: r.window?.height ?? 1.2 },
    { name: "winSill", label: "Window sill height (m)", value: r.window?.sill ?? 0.9 },
  ], { ok: "Build" });
  if (!v) return;
  loc.name = v.name.trim() || loc.name;
  loc.tag = v.tag;
  loc.room = {
    ...r,
    exterior: v.exterior,
    w: Math.max(1, num(v.w, r.w)),
    d: Math.max(1, num(v.d, r.d)),
    h: Math.max(1.8, num(v.h, r.h)),
    door: v.doorWall ? { wall: v.doorWall, offset: num(v.doorOffset, 0), width: num(v.doorWidth, 0.9), height: r.door?.height ?? 2.1 } : null,
    window: v.winWall ? { wall: v.winWall, offset: num(v.winOffset, 0), width: num(v.winWidth, 1.4), height: num(v.winHeight, 1.2), sill: num(v.winSill, 0.9) } : null,
  };
  $("sg-title").textContent = `${loc.name} · Board ${hooks.label}`;
  stage.setSet(loc.room);
  hooks.changed();
}

// ---------- input ----------

function bind() {
  $("sg-back").onclick = close;
  $("sg-save").onclick = save;
  $("sg-set").onclick = setDialog;
  $("sg-reset").onclick = () => { shot = defaultShot(loc.room); apply(); };
  document.querySelectorAll("#sg-views [data-view]").forEach((b) => (b.onclick = () => setView(b.dataset.view)));
  $("sg-sensor").onchange = (e) => { project.sensor = e.target.value; apply(); hooks.changed(); };
  $("sg-lenses").onclick = (e) => {
    const f = Number(e.target.dataset?.focal);
    if (f) { shot.focal = f; apply(); }
  };
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
  window.addEventListener("blur", () => held.clear());
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

  // A tap on the inset swaps it with the main view.
  if (inside(p, stage.insetRect)) {
    drag = { mode: "swap", id: e.pointerId };
    return;
  }
  const rect = stage.mainRect;
  if (stage.view === "camera") {
    drag = { mode: "look", id: e.pointerId, x: p.x, y: p.y, pan: shot.pan, tilt: shot.tilt, rect };
  } else if (stage.view === "top") {
    const g = stage.topToGround(p.x, p.y, rect);
    const near = 28 / stage.topScale(rect);   // about a fingertip, in metres
    const aim = { x: shot.x + Math.sin((shot.pan * Math.PI) / 180) * 1.2, z: shot.z - Math.cos((shot.pan * Math.PI) / 180) * 1.2 };
    if (Math.hypot(g.x - shot.x, g.z - shot.z) < near) drag = { mode: "move", id: e.pointerId, rect };
    else if (Math.hypot(g.x - aim.x, g.z - aim.z) < near * 1.5) drag = { mode: "aim", id: e.pointerId, rect };
    else drag = { mode: "map", id: e.pointerId, x: p.x, y: p.y, cx: stage.top.cx, cz: stage.top.cz, rect };
  } else {
    drag = { mode: "orbit", id: e.pointerId, x: p.x, y: p.y, theta: stage.orbit.theta, phi: stage.orbit.phi };
  }
}

function move(e) {
  const p = local(e);
  if (e.pointerType === "touch" && touches.has(e.pointerId)) touches.set(e.pointerId, p);
  if (!drag) return;
  if (drag.mode === "pinch") {
    const k = drag.d / Math.max(1, spread());
    zoom(k, drag);
    return;
  }
  if (drag.id !== e.pointerId) return;
  if (drag.mode === "look") {
    // Drag right = camera turns right; drag up = camera tilts up. Speed matches the lens's angle of view.
    shot.pan = wrap(drag.pan + ((p.x - drag.x) / drag.rect.w) * stage.hfov);
    shot.tilt = clamp(drag.tilt - ((p.y - drag.y) / drag.rect.h) * stage.shotCam.fov, -90, 90);
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
  if (drag.mode === "swap" && drag.id === e.pointerId) setView(stage.view === "camera" ? "top" : "camera");
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

function wheel(e) {
  e.preventDefault();
  zoom(Math.exp(e.deltaY * 0.002));
}

// Mac keys, as in Storyboarder's Shot Generator: W/A/S/D or the arrows move the camera, R/F raise and lower it,
// Shift moves faster. Movement is smooth while a key is held. Z/X roll, Esc goes back to the board.
const MOVES = { w: [0, 1], arrowup: [0, 1], s: [0, -1], arrowdown: [0, -1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
const SPEED = 1.2;        // metres per second; Shift × 3
const LIFT = 0.6;         // metres per second up or down
const held = new Set();
let fast = false;
let lastTick = 0;

// Keys typed into a text box stay there; sliders and buttons don't keep the keys.
const typing = (t) => t.matches?.("textarea, select, input:not([type=range]):not([type=checkbox]):not([type=button])");

function keys(e) {
  if ($("shotgen").hidden || typing(e.target) || document.querySelector("dialog[open]") || e.metaKey || e.ctrlKey) return;
  const key = e.key.toLowerCase();
  fast = e.shiftKey;
  if (MOVES[key] || key === "r" || key === "f") {
    e.preventDefault();
    e.stopPropagation();
    if (!held.size) {
      lastTick = performance.now();
      requestAnimationFrame(tick);
    }
    held.add(key);
    return;
  }
  const other = { z: () => (shot.roll = clamp(shot.roll - 1, -45, 45)), x: () => (shot.roll = clamp(shot.roll + 1, -45, 45)), escape: close };
  if (!other[key]) return;
  e.preventDefault();
  other[key]();
  if (!$("shotgen").hidden) apply();
}

function keyUp(e) {
  held.delete(e.key.toLowerCase());
  fast = e.shiftKey;
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

