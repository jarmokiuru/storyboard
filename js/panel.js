// The right-hand panel: slugline + shot name, the scene's shot list, shot details, board buttons, layers and
// reference photo. SPEC §6.1, §6.4, §6.6. Every section folds; which ones are open is remembered on the device.

import { LAYERS, LAYER_LABELS, heading, boardLabel, sceneOf, sceneBoards } from "./model.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["kuva", "kuvakoko", "sisalto", "lens", "movement", "dialogue", "action", "notes"];

const FOLD_KEY = "storyboard.panel-folded";
let shown = null;   // { project, board } last filled, for refreshing the shot list while typing

export function initPanel(h) {
  for (const f of FIELDS) {
    $("f-" + f).addEventListener("input", (e) => {
      h.edit(f, e.target.value);
      if (shown && ["kuva", "kuvakoko", "sisalto"].includes(f)) renderShotList(shown.project, shown.board);
    });
  }
  // Folded sections, remembered per device.
  let folded = [];
  try { folded = JSON.parse(localStorage.getItem(FOLD_KEY)) || []; } catch { /* first run */ }
  document.querySelectorAll("#panel details.psec").forEach((d) => {
    d.open = !folded.includes(d.dataset.sec);
    d.addEventListener("toggle", () => {
      const now = [...document.querySelectorAll("#panel details.psec")].filter((x) => !x.open).map((x) => x.dataset.sec);
      try { localStorage.setItem(FOLD_KEY, JSON.stringify(now)); } catch { /* not essential */ }
    });
  });
  $("shot-list").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-board]");
    if (b) h.jump(b.dataset.board);
  });
  $("f-scene").addEventListener("change", (e) => h.changeScene(e.target.value));
  $("new-board").onclick = () => h.newBoard(false);
  $("new-shot").onclick = () => h.newBoard(true);
  $("dup-board").onclick = () => h.duplicate();
  $("del-board").onclick = () => h.remove();
  $("clear-layer").onclick = () => h.clearLayer();
  $("add-photo").onclick = () => h.addPhoto();
  document.querySelectorAll("[data-fit]").forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll("[data-fit]").forEach((x) => x.classList.toggle("on", x === b));
      h.setFitMode(b.dataset.fit);
    };
  });
  $("layers").addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    if (e.target.closest(".eye")) h.toggleLayer(li.dataset.name);
    else if (e.target.closest(".name")) h.setActive(li.dataset.name);
  });
  $("layers").addEventListener("input", (e) => {
    const li = e.target.closest("li");
    if (li && e.target.type === "range") h.setOpacity(li.dataset.name, e.target.value / 100);
  });
}

export function fillPanel(project, board) {
  shown = { project, board };
  updateLabel(project, board);
  for (const f of FIELDS) {
    const input = $("f-" + f);
    if (document.activeElement !== input) input.value = board[f] ?? "";
  }
  const select = $("f-scene");
  select.innerHTML = "";
  for (const s of project.scenes) select.append(new Option(heading(s), s.id, false, s.id === board.sceneId));
}

// "8. INT POLICE STATION - PRESS ROOM - LATER / Shot 1a"
export function updateLabel(project, board) {
  const h = $("scene-heading");
  h.textContent = heading(sceneOf(project, board)) + " / ";
  h.append(Object.assign(document.createElement("span"), { className: "shot-name", textContent: "Shot " + boardLabel(project, board) }));
  renderShotList(project, board);
}

// One line per shot in the board's scene: Kuva # (with its board count), then Kuvakoko · Sisältö. Tapping a line
// opens the shot's first board.
function renderShotList(project, board) {
  const ol = $("shot-list");
  ol.innerHTML = "";
  const shots = [];
  for (const b of sceneBoards(project, board.sceneId)) {
    const last = shots[shots.length - 1];
    if (last && last.kuva === b.kuva) last.boards.push(b);
    else shots.push({ kuva: b.kuva, boards: [b] });
  }
  for (const s of shots) {
    const first = s.boards[0];
    const btn = document.createElement("button");
    btn.dataset.board = first.id;
    btn.className = s.boards.includes(board) ? "on" : "";
    const what = [first.kuvakoko, first.sisalto].filter((x) => x && String(x).trim()).join(" · ");
    btn.title = what;
    btn.append(
      Object.assign(document.createElement("span"), { className: "num", textContent: s.kuva + (s.boards.length > 1 ? ` (${s.boards.length})` : "") }),
      Object.assign(document.createElement("span"), { className: "what", textContent: what || "—" }),
    );
    const li = document.createElement("li");
    li.append(btn);
    ol.append(li);
  }
}

// Top layer first, as in a drawing app.
export function renderLayers(board, active) {
  const ul = $("layers");
  ul.innerHTML = "";
  for (const name of [...LAYERS].reverse()) {
    const st = board.layers[name];
    const li = document.createElement("li");
    li.dataset.name = name;
    li.className = name === active ? "active" : "";
    li.innerHTML = `<button class="eye" aria-label="Show or hide"></button><button class="name"></button><input type="range" min="0" max="100" aria-label="Opacity">`;
    li.querySelector(".eye").textContent = st.visible ? "●" : "○";
    li.querySelector(".name").textContent = LAYER_LABELS[name];
    li.querySelector("input").value = Math.round(st.opacity * 100);
    ul.append(li);
  }
}

// Slides only when tapped, so rotating the iPad doesn't sweep the panel across the screen.
export function togglePanel(force) {
  const panel = $("panel");
  panel.classList.add("sliding");
  panel.classList.toggle("open", force);
  setTimeout(() => panel.classList.remove("sliding"), 250);
}
