// The scene index (Jarmo, 2026-11-21): every scene of the open episode's script in one scrolling list, to find a
// scene fast and to switch scenes on or off for storyboarding. Switched-off scenes keep their data (and any shots
// from the shot list) but stay out of the strip, the PDF, the shot sheet and the viewer. Also the episode menu.

import { modal, formDialog, confirmBox, toast, openMenu } from "./ui.js";
import { heading, episodeScenes, openEpisode, isOn, sceneBoards } from "./model.js";
import { addEpisode, removeEpisode, setOn, drawnBoards } from "./episodes.js";

const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
  return n;
};

// Shots a scene has: its distinct Kuva #s, not counting a lone empty starter board.
function shotCount(project, scene) {
  const boards = sceneBoards(project, scene.id);
  const filled = boards.filter((b) => b.kuvakoko || b.sisalto || b.lens || b.notes || Object.values(b.layers).some((l) => l.hasData) || b.shot3d);
  if (boards.length === 1 && !filled.length) return 0;
  return new Set(boards.map((b) => b.kuva)).size;
}

// hooks: changed() — something was switched (save, redraw the strip); episode() — another episode is open now;
// jump(scene) — go to that scene's first board.
export function sceneIndex(project, hooks) {
  return modal((d, done) => {
    const finish = done;
    const title = el("h2", { textContent: "Scene index" });
    const epRow = el("div", { className: "si-episodes" });
    const search = el("input", { type: "search", placeholder: "Find: number, place, character, words in the synopsis", autocomplete: "off" });
    const onlyOn = el("label", { className: "check" }, el("input", { type: "checkbox" }), el("span", { textContent: "Only storyboarded" }));
    const count = el("p", { className: "si-count muted" });
    const list = el("ul", { className: "si-list" });
    const doneBtn = el("button", { type: "button", className: "primary", textContent: "Done", onclick: () => finish(true) });

    const drawEpisodes = () => {
      epRow.innerHTML = "";
      const eps = project.episodes || [];
      if (eps.length) {
        const sel = el("select", { ariaLabel: "Episode" });
        for (const e of eps) sel.append(new Option(e.name, e.id, false, e.id === openEpisode(project).id));
        sel.onchange = () => {
          project.openEpisode = sel.value;
          hooks.episode();
          draw();
        };
        epRow.append(sel);
      }
      epRow.append(el("button", { type: "button", textContent: eps.length ? "New episode…" : "Split into episodes…", onclick: newEpisode }));
      if (eps.length) epRow.append(el("button", { type: "button", textContent: "Rename / delete…", onclick: editEpisode }));
    };

    const draw = () => {
      const q = search.value.trim().toLowerCase();
      const scenes = episodeScenes(project);
      const shown = scenes.filter((s) => (!onlyOn.firstChild.checked || isOn(s))
        && (!q || [s.kohtaus, heading(s), s.synopsis, s.henkilot].join(" ").toLowerCase().includes(q)));
      const on = scenes.filter(isOn).length;
      count.textContent = `${scenes.length} ${scenes.length === 1 ? "scene" : "scenes"}, ${on} storyboarded` + (shown.length < scenes.length ? ` · showing ${shown.length}` : "");
      list.innerHTML = "";
      for (const s of shown) {
        const box = el("input", { type: "checkbox", checked: isOn(s), title: "Storyboard this scene (boards and 3D)" });
        box.onchange = () => {
          if (!setOn(project, s, box.checked)) {
            box.checked = true;
            toast("One scene of the episode stays on, so there is a board to show.");
            return;
          }
          hooks.changed();
          draw();
        };
        const n = shotCount(project, s);
        const name = el("button", { type: "button", className: "si-name" },
          el("strong", { textContent: heading(s) }),
          el("span", { className: "muted", textContent: [n ? `${n} ${n === 1 ? "shot" : "shots"}` : "no shots", s.synopsis].filter(Boolean).join(" · ") }));
        name.title = isOn(s) ? "Go to this scene" : "Switch the scene on to storyboard it";
        name.onclick = () => {
          if (!isOn(s)) return toast("Tick the box to storyboard this scene first.");
          finish(true);
          hooks.jump(s);
        };
        const li = el("li", { className: isOn(s) ? "" : "off" }, box, name);
        if (s.actBefore) list.append(el("li", { className: "si-act", textContent: s.actBefore }));
        list.append(li);
      }
    };

    async function newEpisode() {
      const first = !project.episodes?.length;
      const v = await formDialog(first ? "Split into episodes" : "New episode", [
        ...(first ? [{ name: "first", label: "The scenes so far become episode", value: "EP1" }] : []),
        { name: "name", label: "New episode", value: "" },
        { type: "note", label: "The new episode starts with one empty scene. Import its breakdown, script and shot list with Import (they go into the episode that's open)." },
      ], { ok: "Add" });
      if (!v) return reopen();
      if (!v.name.trim() || (first && !v.first.trim())) { toast("Give the episode a name, e.g. EP4."); return reopen(); }
      addEpisode(project, v.name.trim(), first ? v.first.trim() : undefined);
      hooks.episode();
      reopen();
    }

    async function editEpisode() {
      const e = openEpisode(project);
      const v = await formDialog(`Episode ${e.name}`, [{ name: "name", label: "Name", value: e.name }],
        { ok: "Save", extra: project.episodes.length > 1 ? [{ label: "Delete episode", value: "delete" }] : [] });
      if (v?.__action === "delete") {
        const scenes = episodeScenes(project);
        const boards = scenes.flatMap((s) => sceneBoards(project, s.id));
        const drawn = drawnBoards(boards);
        const ok = await confirmBox(`Delete ${e.name} with its ${scenes.length} scenes and ${boards.length} boards${drawn ? ` (${drawn} drawn or with a 3D camera)` : ""}? This can't be undone; export a project file first if unsure.`, { ok: "Delete episode", danger: true });
        if (ok) {
          await hooks.removed(removeEpisode(project, e));
          hooks.episode();
        }
      } else if (v?.name?.trim()) {
        e.name = v.name.trim();
        hooks.changed();
      }
      reopen();
    }

    // The small dialogs above replace this one; open the index again afterwards.
    const reopen = () => queueMicrotask(() => sceneIndex(project, hooks));

    search.oninput = draw;
    onlyOn.firstChild.onchange = draw;
    drawEpisodes();
    draw();
    d.append(title, epRow, el("div", { className: "si-find" }, search, onlyOn), count, list, el("div", { className: "dialog-buttons" }, doneBtn));
    setTimeout(() => search.focus({ preventScroll: true }), 50);
  });
}

// The top bar's episode button: switch episode, or open the index.
export function episodeMenu(anchor, project, hooks) {
  openMenu(anchor, [
    ...project.episodes.map((e) => ({ label: (e.id === openEpisode(project).id ? "✓ " : "   ") + e.name, action: () => { project.openEpisode = e.id; hooks.episode(); } })),
    { type: "sep" },
    { label: "Scene index…", action: () => sceneIndex(project, hooks) },
  ]);
}
