// The board strip along the bottom: thumbnails grouped under scene headings. SPEC §6.1.
// Tap = select. Press and hold, then drag = reorder within the scene.

import { heading, sceneBoards, boardLabel } from "./model.js";

const HOLD_MS = 350;
let handlers = null;
let press = null;

export function initStrip(el, h) {
  handlers = h;

  el.addEventListener("click", (e) => {
    const scene = e.target.closest(".scene")?.dataset.id;
    if (e.target.closest(".collapse")) handlers.toggleScene(scene);
    else if (e.target.closest(".edit")) handlers.editScene(scene);
    else if (e.target.closest(".add-scene")) handlers.addScene();
  });

  el.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest(".board");
    if (!btn) return;
    press = { id: btn.dataset.id, btn, x: e.clientX, y: e.clientY, pointer: e.pointerId, dragging: false, target: null };
    press.timer = setTimeout(() => {
      press.dragging = true;
      btn.classList.add("dragging");
      try { el.setPointerCapture(press.pointer); } catch { /* fine */ }
    }, HOLD_MS);
  });

  el.addEventListener("pointermove", (e) => {
    if (!press) return;
    if (!press.dragging) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) cancel();
      return;
    }
    clearMarks(el);
    press.target = null;
    const t = document.elementFromPoint(e.clientX, e.clientY)?.closest(".board");
    if (t && t !== press.btn && t.closest(".scene") === press.btn.closest(".scene")) {
      const r = t.getBoundingClientRect();
      const after = e.clientX > r.left + r.width / 2;
      t.classList.add(after ? "drop-after" : "drop-before");
      press.target = { id: t.dataset.id, after };
    }
    const r = el.getBoundingClientRect();
    if (e.clientX < r.left + 40) el.scrollLeft -= 12;
    if (e.clientX > r.right - 40) el.scrollLeft += 12;
  });

  el.addEventListener("pointerup", () => {
    if (!press) return;
    clearTimeout(press.timer);
    const p = press;
    press = null;
    p.btn.classList.remove("dragging");
    clearMarks(el);
    if (!p.dragging) handlers.select(p.id);
    else if (p.target) handlers.reorder(p.id, p.target.id, p.target.after);
  });

  el.addEventListener("pointercancel", cancel);
  // While dragging a board, don't let the strip scroll under the finger.
  el.addEventListener("touchmove", (e) => { if (press?.dragging) e.preventDefault(); }, { passive: false });
}

function cancel() {
  if (!press) return;
  clearTimeout(press.timer);
  press.btn.classList.remove("dragging");
  press = null;
}

function clearMarks(el) {
  el.querySelectorAll(".drop-before, .drop-after").forEach((b) => b.classList.remove("drop-before", "drop-after"));
}

export function renderStrip(el, project, currentId, thumbs) {
  const scroll = el.scrollLeft;
  el.innerHTML = "";
  el.style.setProperty("--ratio", project.ratio);
  for (const scene of project.scenes) {
    const boards = sceneBoards(project, scene.id);
    if (scene.actBefore) {
      const act = document.createElement("div");
      act.className = "act";
      act.textContent = scene.actBefore;
      el.append(act);
    }
    const g = document.createElement("div");
    g.className = "scene" + (scene.collapsed ? " collapsed" : "");
    g.dataset.id = scene.id;
    g.innerHTML = `<div class="scene-head"><button class="collapse" aria-label="Show or hide boards"></button><span class="heading"></span><button class="edit">Edit</button></div><div class="boards"></div>`;
    g.querySelector(".collapse").textContent = scene.collapsed ? "▸" : "▾";
    g.querySelector(".heading").textContent = heading(scene) + (scene.collapsed ? ` · ${boards.length}` : "");
    g.querySelector(".heading").title = scene.synopsis || "";
    const row = g.querySelector(".boards");
    for (const b of boards) {
      const btn = document.createElement("button");
      btn.className = "board" + (b.id === currentId ? " current" : "") + (b.newShot ? " shot-start" : "");
      btn.dataset.id = b.id;
      const img = document.createElement("img");
      img.alt = "";
      img.draggable = false;
      if (thumbs.has(b.id)) img.src = thumbs.get(b.id);
      const label = document.createElement("span");
      label.textContent = boardLabel(project, b);
      btn.append(img, label);
      row.append(btn);
    }
    el.append(g);
  }
  const add = document.createElement("button");
  add.className = "add-scene";
  add.textContent = "+ Scene";
  el.append(add);
  el.scrollLeft = scroll;
}

export function setCurrent(el, id) {
  el.querySelectorAll(".board").forEach((b) => b.classList.toggle("current", b.dataset.id === id));
}

export function setThumb(el, id, url) {
  const img = el.querySelector(`.board[data-id="${id}"] img`);
  if (img) img.src = url;
}

export function scrollToBoard(el, id) {
  el.querySelector(`.board[data-id="${id}"]`)?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
}
