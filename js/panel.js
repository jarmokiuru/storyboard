// The right-hand panel: shot details, board buttons, layers and reference photo. SPEC §6.1, §6.4, §6.6.

import { LAYERS, LAYER_LABELS, heading, boardLabel, sceneOf } from "./model.js";

const $ = (id) => document.getElementById(id);
const FIELDS = ["kuva", "kuvakoko", "sisalto", "lens", "movement", "dialogue", "action", "notes"];

export function initPanel(h) {
  for (const f of FIELDS) $("f-" + f).addEventListener("input", (e) => h.edit(f, e.target.value));
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
  const scene = sceneOf(project, board);
  $("scene-heading").textContent = heading(scene);
  $("board-label").textContent = "Board " + boardLabel(project, board) + (board.newShot ? "" : " · continues the shot");
  for (const f of FIELDS) {
    const input = $("f-" + f);
    if (document.activeElement !== input) input.value = board[f] ?? "";
  }
  const select = $("f-scene");
  select.innerHTML = "";
  for (const s of project.scenes) select.append(new Option(heading(s), s.id, false, s.id === board.sceneId));
}

export function updateLabel(project, board) {
  $("board-label").textContent = "Board " + boardLabel(project, board) + (board.newShot ? "" : " · continues the shot");
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
