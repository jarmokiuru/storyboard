// Reads the first sheet of an .xlsx file into rows of text. Only reads — the app never writes his spreadsheets.

import { readZip } from "./zip.js";

async function xml(files, path) {
  const blob = files.get(path);
  return blob ? new DOMParser().parseFromString(await blob.text(), "application/xml") : null;
}

const colIndex = (ref) => {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

// Returns string[][]: rows[r][c], "" for empty cells.
export async function readFirstSheet(file) {
  const files = await readZip(file);

  // Find the first sheet's file through the workbook and its relationships.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const wb = await xml(files, "xl/workbook.xml");
  const rels = await xml(files, "xl/_rels/workbook.xml.rels");
  const first = wb?.getElementsByTagName("sheet")[0];
  if (first && rels) {
    const id = first.getAttribute("r:id");
    const rel = [...rels.getElementsByTagName("Relationship")].find((r) => r.getAttribute("Id") === id);
    if (rel) {
      const target = rel.getAttribute("Target");
      sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target;
    }
  }

  const shared = [];
  const ss = await xml(files, "xl/sharedStrings.xml");
  if (ss) {
    for (const si of ss.getElementsByTagName("si")) {
      shared.push([...si.getElementsByTagName("t")].map((t) => t.textContent).join(""));
    }
  }

  const sheet = await xml(files, sheetPath);
  if (!sheet) throw new Error("No sheet found");
  const rows = [];
  for (const row of sheet.getElementsByTagName("row")) {
    const r = row.hasAttribute("r") ? Number(row.getAttribute("r")) - 1 : rows.length;
    const cells = (rows[r] = rows[r] || []);
    let next = 0;
    for (const c of row.getElementsByTagName("c")) {
      const type = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      let text;
      if (type === "s") text = shared[Number(v)] ?? "";
      else if (type === "inlineStr") text = [...c.getElementsByTagName("t")].map((t) => t.textContent).join("");
      else if ((type === "n" || !type) && v !== "" && !isNaN(v)) text = String(Number(v));
      else text = v;
      const col = c.hasAttribute("r") ? colIndex(c.getAttribute("r")) : next;
      cells[col] = text.trim();
      next = col + 1;
    }
  }
  for (let i = 0; i < rows.length; i++) {
    rows[i] = Array.from(rows[i] || [], (x) => x ?? "");
  }
  return rows;
}
