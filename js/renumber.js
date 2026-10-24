// Renumber list (INTEGRATION.md item 4): after a script revision, move boards to new Kohtaus # / Kuva # numbers
// with all their drawings and 3D data, instead of leaving the drawings on the old numbers.
// The list is a small CSV from screenplay-revision-diff:
//   old Kohtaus #,old Kuva #,new Kohtaus #,new Kuva #
//   12,3,12,4
//   12,4,12A,1

import { sceneBoards } from "./model.js";
import { formDialog, toast } from "./ui.js";

const norm = (s) => String(s ?? "").replace(/\s+/g, "").toLowerCase();
const unquote = (s) => s.trim().replace(/^"(.*)"$/, "$1").trim();

export function parseRenumber(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  // Commas normally; semicolons (Finnish Excel) or tabs if that's what the file uses.
  const first = lines[0];
  const sep = first.includes("\t") ? "\t" : first.includes(";") && !first.includes(",") ? ";" : ",";
  const rows = lines.map((l, i) => ({ cells: l.split(sep).map(unquote), line: i + 1 }));
  if (rows.length && /[a-zäö]/i.test(rows[0].cells.join("")) && /kohtaus|kuva|old|new/i.test(rows[0].cells.join(" "))) rows.shift();
  return rows
    .filter((r) => r.cells.length >= 4 && r.cells.slice(0, 4).every(Boolean))
    .map((r) => ({ oldK: r.cells[0], oldKuva: r.cells[1], newK: r.cells[2], newKuva: r.cells[3], line: r.line }));
}

// Shots sort by their number: 3 before 4 before 12; "3A" after 3.
const kuvaOrder = (a, b) => (parseFloat(a.kuva) || 0) - (parseFloat(b.kuva) || 0) || String(a.kuva).localeCompare(String(b.kuva));

// Returns true when boards moved.
export async function renumber(project, text) {
  const rows = parseRenumber(text);
  if (!rows.length) {
    toast("No moves found. The list needs four columns: old Kohtaus #, old Kuva #, new Kohtaus #, new Kuva #.", 6000);
    return false;
  }
  const scene = (k) => project.scenes.find((s) => norm(s.kohtaus) === norm(k));
  const problems = [];
  let moves = [];
  for (const r of rows) {
    const from = scene(r.oldK);
    const to = scene(r.newK);
    const boards = from ? sceneBoards(project, from.id).filter((b) => norm(b.kuva) === norm(r.oldKuva)) : [];
    if (!from) problems.push(`Line ${r.line}: Kohtaus ${r.oldK} isn't in this project.`);
    else if (!boards.length) problems.push(`Line ${r.line}: Kohtaus ${r.oldK} has no Kuva ${r.oldKuva}.`);
    else if (!to) problems.push(`Line ${r.line}: Kohtaus ${r.newK} isn't in this project (import the revised breakdown first).`);
    else moves.push({ ...r, from, to, boards });
  }

  // All moves happen at once, so swapped numbers don't collide. A clash with a board that isn't moving is skipped.
  const moving = new Set(moves.flatMap((m) => m.boards));
  const taken = new Set();
  moves = moves.filter((m) => {
    const key = m.to.id + "/" + norm(m.newKuva);
    const clash = sceneBoards(project, m.to.id).some((b) => norm(b.kuva) === norm(m.newKuva) && !moving.has(b));
    if (clash || taken.has(key)) {
      problems.push(`Line ${m.line}: Kohtaus ${m.newK} already has a Kuva ${m.newKuva}; ${m.oldK}/${m.oldKuva} left where it is.`);
      return false;
    }
    taken.add(key);
    return true;
  });

  if (!moves.length) {
    toast(problems[0] || "Nothing to move.", 6000);
    return false;
  }
  const plural = (n) => (n === 1 ? "board" : "boards");
  const fields = [
    { type: "note", label: "These shots move, with all their drawings and 3D:\n" + moves.map((m) => `• ${m.oldK} / ${m.oldKuva} → ${m.newK} / ${m.newKuva}  (${m.boards.length} ${plural(m.boards.length)})`).join("\n") },
  ];
  if (problems.length) fields.push({ type: "note", label: "Skipped:\n• " + problems.join("\n• ") });
  const ok = await formDialog("Renumber shots", fields, { ok: "Renumber" });
  if (!ok) return false;

  const touched = new Set();
  for (const m of moves) {
    for (const b of m.boards) {
      b.kuva = String(m.newKuva);
      b.sceneId = m.to.id;
    }
    touched.add(m.from.id);
    touched.add(m.to.id);
  }
  // Rebuild board order: each touched scene sorted by Kuva # (continuation boards keep their order).
  project.boards = project.scenes.flatMap((s) => {
    const list = project.boards.filter((b) => b.sceneId === s.id);
    return touched.has(s.id) ? list.sort(kuvaOrder) : list;
  });
  return true;
}
