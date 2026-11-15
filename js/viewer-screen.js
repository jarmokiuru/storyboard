// iPhone viewing (SPEC §1, phase 6): one board at a time, big, with its shot details underneath. Swipe or tap the
// frame's edges to move between boards; "Boards" shows every board under its scene heading. Reads only — nothing
// here writes to the project. Opened instead of the editor on phone-size screens (see `phoneSized`).

import * as db from "./db.js";
import * as store from "./board-store.js";
import { orderedBoards, heading, boardLabel, sceneOf, BOARD_WIDTH, boardHeight } from "./model.js";

const $ = (id) => document.getElementById(id);

// A phone: the screen's short side is under 600 pt (iPhone 13 Pro Max: 428; iPad Air: 820). The screen, not the
// window, so an iPad in Split View still gets the editor. ?viewer in the address forces it, for testing.
export const phoneSized = () => /[?&]viewer\b/.test(location.search) || Math.min(screen.width, screen.height) < 600;

let project = null;
let boards = [];
let index = 0;
let leave;
const thumbs = new Map();     // board id → image address (stored 320-px thumbnail)
const sharp = new Map();      // board id → image address (full picture), last few only
const SHARP_KEEP = 6;

export function initViewer({ exit }) {
  leave = exit;
  $("v-back").onclick = () => leave();
  $("v-grid-btn").onclick = () => showGrid(!$("v-grid").hidden ? false : true);
  $("v-scene").onchange = (e) => {
    const i = boards.findIndex((b) => b.sceneId === e.target.value);
    if (i >= 0) go(i);
  };
  $("v-grid").addEventListener("click", (e) => {
    const t = e.target.closest("[data-i]");
    if (!t) return;
    showGrid(false);
    go(Number(t.dataset.i));
  });
  swipe($("v-frame-area"));
  document.addEventListener("keydown", (e) => {
    if ($("viewer-screen").hidden) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") go(index + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") go(index - 1);
    else if (e.key === "Escape") leave();
  });
}

export async function openViewer(p) {
  project = p;
  boards = orderedBoards(p);
  for (const url of [...thumbs.values(), ...sharp.values()]) URL.revokeObjectURL(url);
  thumbs.clear();
  sharp.clear();
  $("v-title").textContent = p.title;
  $("v-frame").style.aspectRatio = String(p.ratio);
  $("viewer-screen").style.setProperty("--ratio", p.ratio);
  $("viewer-screen").classList.remove("big");
  const sel = $("v-scene");
  sel.innerHTML = "";
  for (const s of p.scenes) {
    if (!boards.some((b) => b.sceneId === s.id)) continue;
    sel.add(new Option(heading(s), s.id));
  }
  await Promise.all(boards.map(async (b) => {
    const blob = await db.getThumb(b.id);
    if (blob) thumbs.set(b.id, URL.createObjectURL(blob));
  }));
  showGrid(false);
  const last = localStorage.getItem("viewer-board-" + p.id);
  const i = boards.findIndex((b) => b.id === last);
  go(i >= 0 ? i : 0, true);
}

// ---------- one board ----------

async function go(i, force = false) {
  if (!boards.length) return showEmpty();
  i = Math.max(0, Math.min(boards.length - 1, i));
  if (i === index && !force) return;
  index = i;
  const b = boards[i];
  localStorage.setItem("viewer-board-" + project.id, b.id);
  details(b);
  const img = $("v-img");
  img.dataset.id = b.id;
  img.src = sharp.get(b.id) || thumbs.get(b.id) || "";
  img.hidden = !img.src;
  await sharpen(b);
  if (img.dataset.id === b.id && sharp.has(b.id)) {
    img.src = sharp.get(b.id);
    img.hidden = false;
  }
  // The next and previous boards, so a swipe lands on a sharp picture.
  for (const n of [boards[i + 1], boards[i - 1]]) if (n) sharpen(n);
}

const drawn = (b) => Object.values(b.layers || {}).some((l) => l.hasData);

const pending = new Map();
function sharpen(b) {
  if (sharp.has(b.id) || !drawn(b)) return Promise.resolve();
  if (pending.has(b.id)) return pending.get(b.id);
  const job = (async () => {
    // As wide as the phone shows it, in real pixels, but never past the board's own 2048.
    const w = Math.min(BOARD_WIDTH, Math.round(Math.max(screen.width, screen.height) * (devicePixelRatio || 1)));
    const h = w * boardHeight(project.ratio) / BOARD_WIDTH;
    const c = await store.flattenStored(b, w, h);
    const blob = await store.canvasBlob(c, "image/jpeg", 0.88).catch(() => null);
    c.width = c.height = 0;
    if (!blob) return;
    sharp.set(b.id, URL.createObjectURL(blob));
    while (sharp.size > SHARP_KEEP) {
      const [oldest, url] = sharp.entries().next().value;
      if (oldest === boards[index]?.id) break;
      sharp.delete(oldest);
      URL.revokeObjectURL(url);
    }
  })().finally(() => pending.delete(b.id));
  pending.set(b.id, job);
  return job;
}

function details(b) {
  const scene = sceneOf(project, b);
  $("v-scene").value = b.sceneId;
  $("v-count").textContent = `${index + 1} / ${boards.length}`;
  $("v-heading").textContent = (scene?.actBefore && isFirstOfScene(b) ? scene.actBefore + " · " : "") + (scene ? heading(scene) : "");
  $("v-kuva").textContent = "Kuva " + boardLabel(project, b);
  $("v-line").textContent = [b.kuvakoko, b.lens, b.movement].filter(Boolean).join(" · ");
  const rows = [["Sisältö", b.sisalto], ["Dialogue", b.dialogue], ["Action", b.action], ["Notes", b.notes]];
  const dl = $("v-fields");
  dl.innerHTML = "";
  for (const [label, text] of rows) {
    if (!text || !String(text).trim()) continue;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = text;
    dl.append(dt, dd);
  }
  $("v-prev").disabled = index === 0;
  $("v-next").disabled = index === boards.length - 1;
  $("v-details").scrollTop = 0;
}

const isFirstOfScene = (b) => boards.find((x) => x.sceneId === b.sceneId) === b;

function showEmpty() {
  $("v-img").hidden = true;
  $("v-count").textContent = "";
  $("v-heading").textContent = "This project has no boards yet.";
  $("v-kuva").textContent = $("v-line").textContent = "";
  $("v-fields").innerHTML = "";
}

// Swipe left/right to move; a tap on the left or right third of the frame does the same; a tap in the middle
// hides the details and the bar for a bigger frame.
function swipe(el) {
  let start = null;
  el.addEventListener("pointerdown", (e) => {
    if (e.target.closest("button")) return;
    start = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId };
  });
  el.addEventListener("pointercancel", () => (start = null));
  el.addEventListener("pointerup", (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    start = null;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.2) return go(index + (dx < 0 ? 1 : -1));
    if (Math.abs(dx) < 10 && Math.abs(dy) < 10) {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      if (x < 0.28) go(index - 1);
      else if (x > 0.72) go(index + 1);
      else $("viewer-screen").classList.toggle("big");
    }
  });
  $("v-prev").onclick = () => go(index - 1);
  $("v-next").onclick = () => go(index + 1);
}

// ---------- all boards ----------

function showGrid(on) {
  const grid = $("v-grid");
  grid.hidden = !on;
  $("v-grid-btn").classList.toggle("on", on);
  $("viewer-screen").classList.toggle("grid", on);
  if (!on) return;
  grid.innerHTML = "";
  for (const s of project.scenes) {
    const list = boards.map((b, i) => [b, i]).filter(([b]) => b.sceneId === s.id);
    if (!list.length) continue;
    if (s.actBefore) {
      const act = document.createElement("p");
      act.className = "v-act";
      act.textContent = s.actBefore;
      grid.append(act);
    }
    const h = document.createElement("h3");
    h.textContent = heading(s);
    const row = document.createElement("div");
    row.className = "v-cells";
    for (const [b, i] of list) {
      const cell = document.createElement("button");
      cell.dataset.i = i;
      cell.dataset.id = b.id;
      cell.className = i === index ? "on" : "";
      cell.innerHTML = `<span class="v-thumb"><img alt=""></span><span class="v-cap"></span>`;
      cell.querySelector(".v-thumb").style.aspectRatio = String(project.ratio);
      const url = thumbs.get(b.id);
      const img = cell.querySelector("img");
      if (url) img.src = url;
      else img.hidden = true;
      cell.querySelector(".v-cap").textContent = [boardLabel(project, b), b.kuvakoko].filter(Boolean).join(" · ");
      row.append(cell);
    }
    grid.append(h, row);
  }
  grid.querySelector("button.on")?.scrollIntoView({ block: "center" });
  // Drawn boards that have never had a thumbnail made (e.g. never opened in the editor): fill them in.
  // Made here only, not stored: the viewer never writes to the device.
  for (const b of boards) if (!thumbs.has(b.id) && drawn(b)) smallThumb(b);
}

async function smallThumb(b) {
  const c = await store.flattenStored(b, 320, 320 / project.ratio);
  const blob = await store.canvasBlob(c, "image/jpeg", 0.8).catch(() => null);
  if (!blob || thumbs.has(b.id)) return;
  thumbs.set(b.id, URL.createObjectURL(blob));
  markGridThumb(b.id, thumbs.get(b.id));
}

function markGridThumb(id, url) {
  const img = $("v-grid").querySelector(`button[data-id="${id}"] img`);
  if (img) {
    img.src = url;
    img.hidden = false;
  }
}
