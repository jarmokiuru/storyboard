// Start-up: shows the project list or reopens the project that was open, and sets up the offline copy.

import * as db from "./db.js";
import { initProjects, showProjects } from "./projects-screen.js";
import { initEditor, openProject, flushEditor } from "./editor-screen.js";
import { setupOffline, storageKept } from "./offline.js";
import { banner } from "./ui.js";

const $ = (id) => document.getElementById(id);

function show(screen) {
  $("projects-screen").hidden = screen !== "projects";
  $("editor-screen").hidden = screen !== "editor";
}

async function open(project) {
  show("editor");
  history.replaceState(null, "", "#p=" + project.id);
  await openProject(project);
}

async function exit() {
  show("projects");
  history.replaceState(null, "", location.pathname);
  await showProjects();
}

initEditor({ exit });
initProjects({ open });

const match = location.hash.match(/^#p=(.+)$/);
const last = match && (await db.getProject(match[1]));
if (last) open(last);
else exit();

storageKept();
setupOffline((worker) => {
  banner("A new version of Storyboard is ready.", [
    { label: "Reload", primary: true, action: async () => { await flushEditor(); worker.postMessage("activate"); } },
    { label: "Later" },
  ]);
});
