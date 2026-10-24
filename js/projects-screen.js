// The opening screen: the list of projects on this device.

import * as db from "./db.js";
import { newProject, RATIOS, ratioLabel, ago } from "./model.js";
import { formDialog, confirmBox, choose, toast, pickFile } from "./ui.js";
import { readProjectFile, installProject } from "./projectfile.js";
import { mergeStarter } from "./importer.js";
import { standalone, storageKept } from "./offline.js";
import { VERSION } from "./version.js";

const $ = (id) => document.getElementById(id);
let openProject;

export function initProjects({ open }) {
  openProject = open;
  $("app-version").textContent = "v" + VERSION;
  $("new-project").onclick = newProjectDialog;
  $("import-project").onclick = importDialog;
  $("project-list").addEventListener("click", async (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    if (e.target.closest(".delete")) return deleteDialog(li.dataset.id);
    const p = await db.getProject(li.dataset.id);
    if (p) openProject(p);
  });
}

export async function showProjects() {
  const list = (await db.listProjects()).sort((a, b) => b.modified - a.modified);
  const ul = $("project-list");
  ul.innerHTML = "";
  for (const p of list) {
    const li = document.createElement("li");
    li.dataset.id = p.id;
    li.innerHTML = `<button class="open"><strong></strong><span class="meta"></span></button><button class="delete">Delete</button>`;
    li.querySelector("strong").textContent = p.title;
    li.querySelector(".meta").textContent = [
      ratioLabel(p.ratio),
      p.scenes.length + (p.scenes.length === 1 ? " scene" : " scenes"),
      p.boards.length + (p.boards.length === 1 ? " board" : " boards"),
      "edited " + ago(p.modified),
      p.exported ? "exported " + ago(p.exported) : "never exported",
    ].join(" · ");
    ul.append(li);
  }
  $("no-projects").hidden = list.length > 0;
  storageNote();
}

async function storageNote() {
  const note = $("storage-note");
  const kept = await storageKept();
  if (!standalone) {
    note.textContent = "On the iPad, add Storyboard to the Home Screen (Share → Add to Home Screen) and always open it from that icon. In a Safari tab, Safari can delete the boards after 7 days without a visit. Export project files as backups.";
  } else if (!kept) {
    note.textContent = "This device hasn't promised to keep the boards. Export project files as backups.";
  } else {
    note.textContent = "";
  }
  note.hidden = !note.textContent;
}

async function newProjectDialog() {
  const v = await formDialog("New project", [
    { name: "title", label: "Title", value: "" },
    { name: "ratio", label: "Aspect ratio", type: "select", value: "2.39", options: [...RATIOS.map((r) => [String(r.value), r.label]), ["custom", "Custom…"]] },
    { name: "custom", label: "Custom ratio, e.g. 2.20 (only if Custom)", value: "" },
  ], { ok: "Create" });
  if (!v) return;
  const ratio = v.ratio === "custom" ? parseFloat(v.custom.replace(",", ".")) : parseFloat(v.ratio);
  if (!(ratio > 0.4 && ratio < 4)) return toast("That aspect ratio doesn't look right.");
  const p = newProject(v.title.trim() || "Untitled", ratio);
  await db.putProject(p);
  openProject(p);
}

async function importDialog() {
  const file = await pickFile();
  if (!file) return;
  let data;
  try {
    data = await readProjectFile(file);
  } catch (err) {
    return toast(err.newer ? err.message : "That isn't a Storyboard project file.", 6000);
  }
  const existing = await db.getProject(data.project.id);
  let mode = "replace";
  if (existing) {
    mode = await choose(`"${existing.title}" is already on this device. Merge the file into it (new scenes and shots added, changes listed, drawings kept), keep both, or replace it?`, [
      { label: "Keep both", value: "copy" },
      { label: "Replace", value: "replace", danger: true },
      { label: "Merge", value: "merge" },
    ]);
    if (!mode) return;
  }
  if (mode === "merge") {
    if (await mergeStarter(existing, data.project)) {
      existing.modified = Date.now();
      await db.putProject(existing);
      toast(`Merged into "${existing.title}"`);
    }
    return showProjects();
  }
  const p = await installProject(data, mode);
  toast(`Imported "${p.title}"`);
  showProjects();
}

async function deleteDialog(id) {
  const p = await db.getProject(id);
  if (!p) return;
  const ok = await confirmBox(`Delete "${p.title}" from this device? Its boards can only come back from an exported project file.`, { ok: "Delete", danger: true });
  if (!ok) return;
  await db.deleteProject(p);
  showProjects();
}
