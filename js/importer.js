// Bringing scenes and shots in from Breakdown.xlsx, Shot List.xlsx or a script. SPEC §4.
// Re-imports merge, never wipe: new scenes and shots are added, empty fields are filled,
// changed text is listed for Jarmo to accept, and drawings are never touched.

import { readFirstSheet } from "./xlsx.js";
import { parseScript } from "./script.js";
import { newScene, newBoard, sceneBoards } from "./model.js";
import { formDialog, toast } from "./ui.js";

const COLUMNS = {
  breakdown: [
    ["kohtaus", "Kohtaus #"], ["intExt", "INT/EXT"], ["lokaatio", "Lokaatio"], ["aika", "Vuorokaudenaika"],
    ["synopsis", "Synopsis"], ["henkilot", "Henkilöt"],
  ],
  shotlist: [
    ["kohtaus", "Kohtaus #"], ["slug", "Slugline + Synopsis"], ["kuva", "Kuva #"], ["kuvakoko", "Kuvakoko"],
    ["sisalto", "Sisältö"], ["lens", "Lens/Focal"], ["movement", "Movement"], ["notes", "Notes"],
  ],
};
const REQUIRED = { breakdown: ["kohtaus"], shotlist: ["kohtaus", "kuva"] };

const SCENE_FIELDS = { intExt: "INT/EXT", lokaatio: "Lokaatio", aika: "Vuorokaudenaika", synopsis: "Synopsis", henkilot: "Henkilöt", actBefore: "Act divider" };
const SHOT_FIELDS = { kuvakoko: "Kuvakoko", sisalto: "Sisältö", lens: "Lens/Focal", movement: "Movement", notes: "Notes" };

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, "");
const sameNumber = (a, b) => norm(a) === norm(b);
const numeric = (s) => {
  const n = parseFloat(String(s).replace(",", "."));
  return isNaN(n) ? Infinity : n;
};

// ---------- spreadsheets ----------

function findHeader(rows) {
  let best = { score: 0 };
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const cells = (rows[r] || []).map(norm);
    for (const kind of Object.keys(COLUMNS)) {
      const score = COLUMNS[kind].filter(([, name]) => cells.includes(norm(name))).length;
      if (score > best.score || (score === best.score && kind === "shotlist" && cells.includes(norm("Kuva #")))) {
        best = { score, kind, row: r };
      }
    }
  }
  return best.score >= 2 ? best : null;
}

// Pick which spreadsheet column feeds each field. Asks on first import, or when a remembered column is gone.
async function columnMap(project, kind, headers) {
  project.importMaps = project.importMaps || {};
  const saved = project.importMaps[kind];
  const present = (name) => headers.some((h) => norm(h) === norm(name));
  if (saved && Object.values(saved).every((h) => !h || present(h))) return saved;

  const guess = Object.fromEntries(COLUMNS[kind].map(([key, name]) => [key, headers.find((h) => norm(h) === norm(name)) || ""]));
  const v = await formDialog(kind === "breakdown" ? "Breakdown columns" : "Shot list columns", [
    { type: "note", label: "Check which column in the file feeds each field. This is remembered for this project." },
    ...COLUMNS[kind].map(([key, name]) => ({
      name: key, label: name, type: "select", value: guess[key],
      options: [["", "— not in this file —"], ...headers.filter(Boolean).map((h) => [h, h])],
    })),
  ], { ok: "Continue" });
  if (!v) return null;
  for (const key of REQUIRED[kind]) {
    if (!v[key]) {
      toast(`The ${COLUMNS[kind].find((c) => c[0] === key)[1]} column is needed.`);
      return null;
    }
  }
  project.importMaps[kind] = v;
  return v;
}

function reader(headers, map) {
  const index = Object.fromEntries(Object.entries(map).map(([key, h]) => [key, h ? headers.findIndex((x) => norm(x) === norm(h)) : -1]));
  return (row, key) => (index[key] >= 0 ? String(row[index[key]] ?? "").trim() : "");
}

function readBreakdown(rows, start, cell) {
  const scenes = [];
  const problems = [];
  let act = "";
  for (let r = start; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row.some(Boolean)) continue;
    const kohtaus = cell(row, "kohtaus");
    if (!kohtaus) {
      // Act-break row: no scene number, a label further along.
      act = row.find(Boolean) || act;
      continue;
    }
    if (scenes.some((s) => sameNumber(s.kohtaus, kohtaus))) {
      problems.push(`Kohtaus ${kohtaus} appears twice in the breakdown; the second row was skipped.`);
      continue;
    }
    scenes.push({
      kohtaus, intExt: cell(row, "intExt").toUpperCase(), lokaatio: cell(row, "lokaatio"), aika: cell(row, "aika"),
      synopsis: cell(row, "synopsis"), henkilot: cell(row, "henkilot"), actBefore: act,
    });
    act = "";
  }
  return { scenes, problems };
}

function readShotList(rows, start, cell) {
  const shots = [];
  const problems = [];
  let current = "";
  for (let r = start; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row.some(Boolean)) continue;
    const kuva = cell(row, "kuva");
    const slug = cell(row, "slug");
    const kohtaus = cell(row, "kohtaus");
    if (!kuva) {
      // Scene header row (slugline merged across).
      if (slug || kohtaus) current = kohtaus || (slug.match(/^\s*(\d+[A-Za-z]?)\./) || [])[1] || current;
      continue;
    }
    const k = kohtaus || current;
    if (!k) {
      problems.push(`Kuva ${kuva} on row ${r + 1} has no Kohtaus #; skipped.`);
      continue;
    }
    shots.push({
      kohtaus: k, kuva, kuvakoko: cell(row, "kuvakoko"), sisalto: cell(row, "sisalto"),
      lens: cell(row, "lens"), movement: cell(row, "movement"), notes: cell(row, "notes"),
    });
  }
  return { shots, problems };
}

// ---------- merge plans ----------

function emptyPlan() {
  return { newScenes: [], newBoards: [], reuse: [], fills: [], changes: [], problems: [] };
}

function compare(plan, target, fields, incoming, label) {
  for (const [field, name] of Object.entries(fields)) {
    const value = incoming[field];
    if (value === undefined || value === "") continue;   // never wipe
    const old = target[field] ?? "";
    if (old === value) continue;
    if (!old) plan.fills.push({ target, field, value });
    else plan.changes.push({ id: String(plan.changes.length), target, field, value, text: `${label} · ${name}: “${old}” → “${value}”` });
  }
}

function planScenes(project, scenes, problems = []) {
  const plan = emptyPlan();
  plan.problems.push(...problems);
  for (const inc of scenes) {
    const existing = project.scenes.find((s) => sameNumber(s.kohtaus, inc.kohtaus));
    if (existing) compare(plan, existing, SCENE_FIELDS, inc, `Kohtaus ${inc.kohtaus}`);
    else plan.newScenes.push(inc);
  }
  return plan;
}

const isBlank = (b) => !Object.values(b.layers).some((l) => l.hasData) && !Object.keys(SHOT_FIELDS).some((f) => b[f]) && !b.dialogue && !b.action;

function planShots(project, shots, problems = []) {
  const plan = emptyPlan();
  plan.problems.push(...problems);
  const seen = new Set();
  const reused = new Set();
  for (const shot of shots) {
    const scene = project.scenes.find((s) => sameNumber(s.kohtaus, shot.kohtaus));
    if (!scene) {
      plan.problems.push(`Kuva ${shot.kuva}: Kohtaus ${shot.kohtaus} isn't in this project (import the breakdown first); skipped.`);
      continue;
    }
    const key = norm(shot.kohtaus) + "/" + norm(shot.kuva);
    if (seen.has(key)) {
      plan.problems.push(`Kohtaus ${shot.kohtaus}, Kuva ${shot.kuva} appears twice in the shot list; the second row was skipped.`);
      continue;
    }
    seen.add(key);
    const boards = sceneBoards(project, scene.id);
    const board = boards.find((b) => sameNumber(b.kuva, shot.kuva));
    if (board) {
      compare(plan, board, SHOT_FIELDS, shot, `Kohtaus ${shot.kohtaus} / Kuva ${shot.kuva}`);
      continue;
    }
    // A scene's untouched starter board takes the first shot instead of sitting there empty.
    const starter = boards.length === 1 && isBlank(boards[0]) && !reused.has(boards[0].id) && !shots.some((s) => sameNumber(s.kohtaus, shot.kohtaus) && sameNumber(s.kuva, boards[0].kuva)) ? boards[0] : null;
    if (starter) {
      reused.add(starter.id);
      plan.reuse.push({ board: starter, shot });
    } else {
      plan.newBoards.push({ scene, shot });
    }
  }
  return plan;
}

// ---------- applying ----------

function insertScene(project, fields) {
  const scene = newScene(fields);
  const after = project.scenes.findIndex((s) => numeric(s.kohtaus) > numeric(fields.kohtaus));
  if (after < 0) project.scenes.push(scene);
  else project.scenes.splice(after, 0, scene);
  project.boards.push(newBoard(scene.id, 1, true));
}

function insertBoard(project, scene, shot) {
  const b = newBoard(scene.id, shot.kuva, true);
  Object.assign(b, pick(shot, Object.keys(SHOT_FIELDS)));
  const boards = sceneBoards(project, scene.id);
  const before = boards.filter((x) => numeric(x.kuva) <= numeric(shot.kuva)).pop();
  if (before) {
    // After the shot it follows, including that shot's continuation boards.
    const last = boards.filter((x) => x.kuva === before.kuva).pop();
    project.boards.splice(project.boards.indexOf(last) + 1, 0, b);
  } else if (boards.length) {
    project.boards.splice(project.boards.indexOf(boards[0]), 0, b);
  } else {
    project.boards.push(b);
  }
}

const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k]).map((k) => [k, o[k]]));

function apply(project, plan, accepted) {
  for (const f of plan.fills) f.target[f.field] = f.value;
  for (const c of plan.changes) if (accepted.includes(c.id)) c.target[c.field] = c.value;
  for (const s of plan.newScenes) insertScene(project, s);
  for (const { board, shot } of plan.reuse) Object.assign(board, { kuva: shot.kuva }, pick(shot, Object.keys(SHOT_FIELDS)));
  for (const { scene, shot } of plan.newBoards) insertBoard(project, scene, shot);
}

async function review(project, plan, what) {
  const adds = [];
  if (plan.newScenes.length) adds.push(`${plan.newScenes.length} new ${plan.newScenes.length === 1 ? "scene" : "scenes"}`);
  const boards = plan.newBoards.length + plan.reuse.length;
  if (boards) adds.push(`${boards} new ${boards === 1 ? "board" : "boards"}`);
  if (plan.fills.length) adds.push(`${plan.fills.length} empty ${plan.fills.length === 1 ? "field" : "fields"} filled`);
  if (!adds.length && !plan.changes.length) {
    toast(plan.problems.length ? plan.problems[0] : `Nothing new in this ${what}.`, 5000);
    return null;
  }
  const fields = [{ type: "note", label: (adds.length ? "Adds " + adds.join(", ") + "." : "Nothing new to add.") + " Drawings are never changed by an import." }];
  if (plan.changes.length) {
    fields.push({ name: "accept", type: "checklist", label: "Changed in the file — untick any you want to keep as they are in the app", value: plan.changes.map((c) => c.id), options: plan.changes.map((c) => [c.id, c.text]) });
  }
  if (plan.problems.length) fields.push({ type: "note", label: "Not imported:\n• " + plan.problems.join("\n• ") });
  const v = await formDialog(`Import ${what}`, fields, { ok: "Import" });
  if (!v) return null;
  apply(project, plan, v.accept || []);
  return adds.length || (v.accept || []).length;
}

// ---------- entry points (each returns true when the project changed) ----------

export async function importSpreadsheet(project, file) {
  let rows;
  try {
    rows = await readFirstSheet(file);
  } catch {
    toast("Couldn't read that file. Use an .xlsx spreadsheet.");
    return false;
  }
  const found = findHeader(rows);
  if (!found) {
    toast("Couldn't find the column headings (Kohtaus #, Kuva #…) in that sheet.");
    return false;
  }
  const headers = rows[found.row];
  const map = await columnMap(project, found.kind, headers);
  if (!map) return false;
  const cell = reader(headers, map);
  if (found.kind === "breakdown") {
    const { scenes, problems } = readBreakdown(rows, found.row + 1, cell);
    return !!(await review(project, planScenes(project, scenes, problems), "breakdown"));
  }
  const { shots, problems } = readShotList(rows, found.row + 1, cell);
  return !!(await review(project, planShots(project, shots, problems), "shot list"));
}

export async function importScript(project, text) {
  const scenes = parseScript(text);
  if (!scenes.length) {
    toast("No scene headings found (lines starting INT., EXT., SIS., ULK.…).", 5000);
    return false;
  }
  return !!(await review(project, planScenes(project, scenes), "script"));
}

