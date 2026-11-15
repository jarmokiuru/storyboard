// Start-up: shows the project list or reopens the project that was open, and sets up the offline copy.

import * as db from "./db.js";
import { initProjects, showProjects } from "./projects-screen.js";
import { initEditor, openProject, flushEditor } from "./editor-screen.js";
import { initViewer, openViewer, phoneSized } from "./viewer-screen.js";
import { setupOffline, storageKept } from "./offline.js";
import { banner } from "./ui.js";

const $ = (id) => document.getElementById(id);

function show(screen) {
  $("projects-screen").hidden = screen !== "projects";
  $("editor-screen").hidden = screen !== "editor";
  $("viewer-screen").hidden = screen !== "viewer";
}

// On a phone the project opens for viewing only (SPEC §1).
async function open(project) {
  history.replaceState(null, "", location.search + "#p=" + project.id);
  if (phoneSized()) {
    show("viewer");
    return openViewer(project);
  }
  show("editor");
  await openProject(project);
}

async function exit() {
  show("projects");
  history.replaceState(null, "", location.pathname + location.search);
  await showProjects();
}

initEditor({ exit });
initProjects({ open });
initViewer({ exit });

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
