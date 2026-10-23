// Contact-sheet PDF: boards in a grid with their shot details underneath, and a blank worksheet. SPEC §7.

import { PDF } from "./pdf.js";
import { orderedBoards, heading, boardLabel, sceneOf, ratioLabel } from "./model.js";
import * as store from "./board-store.js";
import { formDialog, toast } from "./ui.js";

const PAPER = { A4: [595.28, 841.89], Letter: [612, 792] };

// [columns, rows] for each preset.
const GRIDS = {
  landscape: { 1: [1, 1], 2: [2, 1], 3: [3, 1], 4: [2, 2], 6: [3, 2], 8: [4, 2], 9: [3, 3], 12: [4, 3] },
  portrait: { 1: [1, 1], 2: [1, 2], 3: [1, 3], 4: [2, 2], 6: [2, 3], 8: [2, 4], 9: [3, 3], 12: [3, 4] },
};

const FIELDS = [
  ["heading", "Scene heading (where a scene starts)"], ["kuva", "Kuva #"], ["kuvakoko", "Kuvakoko"],
  ["lens", "Lens/Focal"], ["movement", "Movement"], ["sisalto", "Sisältö"], ["dialogue", "Dialogue"], ["action", "Action"], ["notes", "Notes"],
];

export const DEFAULTS = {
  kind: "boards", perPage: "6", custom: "", paper: "A4", orientation: "landscape",
  fields: FIELDS.map((f) => f[0]), scenes: null, newScenePage: true, draft: false, blankPages: "1",
};

const DPI = 200;            // picture resolution in the PDF
const MARGIN = 36;          // half an inch
const HEADER = 26;
const GUTTER_X = 14;
const GUTTER_Y = 12;
const GREY = [0.45, 0.45, 0.48];
const LIGHT = [0.75, 0.75, 0.78];

// ---------- dialog ----------

export async function askOptions(project) {
  const o = { ...DEFAULTS, ...project.pdfOptions };
  if (project.pdfOptions && !project.pdfOptions.fields.includes("sisalto")) o.fields = [...o.fields, "sisalto"];
  const sceneIds = project.scenes.map((s) => s.id);
  const v = await formDialog("Contact sheet PDF", [
    { name: "kind", label: "Print", type: "select", value: o.kind, options: [["boards", "Boards"], ["blank", "Blank worksheet (empty frames)"]] },
    { name: "perPage", label: "Boards per page", type: "select", value: o.perPage, options: [...["1", "2", "3", "4", "6", "8", "9", "12"].map((n) => [n, n]), ["custom", "Custom…"]] },
    { name: "custom", label: "Custom: rows × columns, e.g. 3x4", value: o.custom },
    { name: "paper", label: "Paper", type: "select", value: o.paper, options: ["A4", "Letter"] },
    { name: "orientation", label: "Orientation", type: "select", value: o.orientation, options: [["landscape", "Landscape"], ["portrait", "Portrait"]] },
    { name: "scenes", label: "Scenes", type: "checklist", value: o.scenes ? o.scenes.filter((id) => sceneIds.includes(id)) : sceneIds, options: project.scenes.map((s) => [s.id, heading(s)]) },
    { name: "fields", label: "Under each frame", type: "checklist", value: o.fields, options: FIELDS },
    { name: "newScenePage", label: "Start each scene on a new page", type: "checkbox", value: o.newScenePage },
    { name: "draft", label: "DRAFT mark", type: "checkbox", value: o.draft },
    { name: "blankPages", label: "Pages (blank worksheet only)", value: o.blankPages },
  ], { ok: "Make PDF" });
  if (!v) return null;
  if (v.kind === "boards" && !v.scenes.length) {
    toast("Tick at least one scene.");
    return null;
  }
  if (v.perPage === "custom" && !parseCustom(v.custom)) {
    toast("Write the custom grid as rows x columns, e.g. 3x4.");
    return null;
  }
  // Remember the scene choice only if it isn't simply "all of them".
  if (v.scenes.length === sceneIds.length) v.scenes = null;
  return v;
}

function parseCustom(s) {
  const m = String(s).match(/^\s*(\d+)\s*[x×*]\s*(\d+)\s*$/i);
  if (!m) return null;
  const rows = +m[1];
  const cols = +m[2];
  return rows >= 1 && cols >= 1 && rows <= 10 && cols <= 10 ? { rows, cols } : null;
}

// ---------- layout ----------

function layout(o, ratio) {
  let [W, H] = PAPER[o.paper] || PAPER.A4;
  if (o.orientation === "landscape") [W, H] = [H, W];
  let cols, rows;
  if (o.perPage === "custom") ({ rows, cols } = parseCustom(o.custom));
  else [cols, rows] = GRIDS[o.orientation][o.perPage];

  const cellW = (W - 2 * MARGIN - GUTTER_X * (cols - 1)) / cols;
  const cellH = (H - 2 * MARGIN - HEADER - GUTTER_Y * (rows - 1)) / rows;
  const fs = Math.min(10, Math.max(6.5, cellW / 30));
  const lh = fs * 1.3;
  const f = new Set(o.fields);
  const lines = o.kind === "blank"
    ? 3
    : (f.has("heading") ? 1 : 0) + (["kuva", "kuvakoko", "lens", "movement"].some((k) => f.has(k)) ? 1 : 0) +
      ["sisalto", "dialogue", "action", "notes"].filter((k) => f.has(k)).length * 2;
  const textH = lines ? lines * lh + 4 : 0;
  let fw = cellW;
  let fh = fw / ratio;
  if (fh > cellH - textH) {
    fh = Math.max(cellH - textH, cellH * 0.3);
    fw = fh * ratio;
  }
  // Rows stack from the top rather than spreading over the page, so wide frames don't float apart.
  const pitch = Math.min(cellH + GUTTER_Y, fh + textH + 22);
  return { W, H, cols, rows, cellW, cellH, fw, fh, fs, lh, lines, pitch };
}

const cellOrigin = (L, i) => ({
  x: MARGIN + (i % L.cols) * (L.cellW + GUTTER_X),
  y: MARGIN + HEADER + Math.floor(i / L.cols) * L.pitch,
});

// ---------- text fitting (Helvetica metrics measured on this device) ----------

const measure = document.createElement("canvas").getContext("2d");

function textWidth(str, size, font) {
  measure.font = `${font === "bold" ? "bold " : font === "italic" ? "italic " : ""}${size}px Helvetica, Arial, sans-serif`;
  return measure.measureText(str).width;
}

function fit(str, maxW, size, font) {
  if (textWidth(str, size, font) <= maxW) return str;
  let s = str;
  while (s.length > 1 && textWidth(s + "…", size, font) > maxW) s = s.slice(0, -1);
  return s.trimEnd() + "…";
}

function wrap(str, maxW, size, font, maxLines) {
  const words = String(str).replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let line = "";
  while (words.length) {
    const next = line ? line + " " + words[0] : words[0];
    if (textWidth(next, size, font) <= maxW || !line) {
      line = next;
      words.shift();
    } else {
      lines.push(line);
      line = "";
      if (lines.length === maxLines) break;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (words.length || lines.length > maxLines) {
    lines.length = Math.min(lines.length, maxLines);
    lines[lines.length - 1] = fit(lines[lines.length - 1] + " " + words.join(" "), maxW, size, font);
  }
  return lines.map((l) => fit(l, maxW, size, font));
}

// ---------- pages ----------

function header(page, project, o, n, total) {
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  page.text(fit(project.title, page.w * 0.55, 11, "bold"), MARGIN, MARGIN + 11, { size: 11, font: "bold" });
  const right = `${o.kind === "blank" ? "Worksheet · " : ""}${ratioLabel(project.ratio)} · ${date} · Page ${n} of ${total}`;
  page.text(right, page.w - MARGIN - textWidth(right, 8.5, "regular"), MARGIN + 11, { size: 8.5, color: GREY });
  page.line(MARGIN, MARGIN + 17, page.w - MARGIN, MARGIN + 17, { color: LIGHT, width: 0.5 });
  if (o.draft) {
    const size = Math.min(page.w, page.h) / 4.5;
    const angle = Math.atan2(page.h, page.w);
    const half = textWidth("DRAFT", size, "bold") / 2;
    page.turnedText("DRAFT", page.w / 2 - Math.cos(angle) * half, page.h / 2 + Math.sin(angle) * half, angle, { size, font: "bold", color: [0.9, 0.9, 0.92] });
  }
}

function paginate(boards, perPage, newScenePage) {
  const pages = [];
  let current = [];
  let prev = null;
  for (const b of boards) {
    if (current.length === perPage || (newScenePage && prev && b.sceneId !== prev.sceneId && current.length)) {
      pages.push(current);
      current = [];
    }
    current.push(b);
    prev = b;
  }
  if (current.length) pages.push(current);
  return pages;
}

async function boardJpeg(board, w, h) {
  const art = await store.flattenStored(board, w, h);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(art, 0, 0);
  const blob = await store.canvasBlob(c, "image/jpeg", 0.88);
  return new Uint8Array(await blob.arrayBuffer());
}

function boardText(project, b, firstOfScene, o, L) {
  const f = new Set(o.fields);
  const out = [];
  if (f.has("heading") && firstOfScene) out.push({ str: fit(heading(sceneOf(project, b)), L.fw, L.fs, "bold"), font: "bold" });
  const label = f.has("kuva") ? boardLabel(project, b) : "";
  const meta = [f.has("kuvakoko") && b.kuvakoko, f.has("lens") && b.lens, f.has("movement") && b.movement].filter(Boolean).join(" · ");
  if (label || meta) out.push({ label, str: meta });
  if (f.has("sisalto") && (b.sisalto || "").trim()) wrap(b.sisalto, L.fw, L.fs, "regular", 2).forEach((s) => out.push({ str: s }));
  if (f.has("dialogue") && b.dialogue.trim()) wrap(`“${b.dialogue.trim()}”`, L.fw, L.fs, "italic", 2).forEach((s) => out.push({ str: s, font: "italic" }));
  if (f.has("action") && b.action.trim()) wrap(b.action, L.fw, L.fs, "regular", 2).forEach((s) => out.push({ str: s }));
  if (f.has("notes") && b.notes.trim()) wrap(b.notes, L.fw, L.fs, "regular", 2).forEach((s) => out.push({ str: s, color: GREY }));
  return out.slice(0, L.lines);
}

export async function makeContactSheet(project, o) {
  const L = layout(o, project.ratio);
  const pdf = new PDF();
  const perPage = L.cols * L.rows;

  if (o.kind === "blank") {
    const total = Math.min(50, Math.max(1, parseInt(o.blankPages, 10) || 1));
    for (let n = 1; n <= total; n++) {
      const page = pdf.addPage(L.W, L.H);
      header(page, project, o, n, total);
      for (let i = 0; i < perPage; i++) {
        const { x, y } = cellOrigin(L, i);
        page.rect(x, y, L.fw, L.fh, { stroke: [0.2, 0.2, 0.22], width: 0.7 });
        for (let k = 1; k <= L.lines; k++) page.line(x, y + L.fh + k * L.lh + 2, x + L.fw, y + L.fh + k * L.lh + 2, { color: LIGHT, width: 0.4 });
      }
    }
    return pdf.toBlob();
  }

  const chosen = o.scenes ? new Set(o.scenes) : null;
  const boards = orderedBoards(project).filter((b) => !chosen || chosen.has(b.sceneId));
  const pages = paginate(boards, perPage, o.newScenePage);
  const pxW = Math.min(2048, Math.round((L.fw / 72) * DPI));
  const pxH = Math.round(pxW / project.ratio);
  let done = 0;
  let prevScene = null;

  for (let n = 0; n < pages.length; n++) {
    const page = pdf.addPage(L.W, L.H);
    header(page, project, o, n + 1, pages.length);
    for (let i = 0; i < pages[n].length; i++) {
      const b = pages[n][i];
      const { x, y } = cellOrigin(L, i);
      const name = pdf.addJpeg(await boardJpeg(b, pxW, pxH), pxW, pxH);
      page.image(name, x, y, L.fw, L.fh);
      page.rect(x, y, L.fw, L.fh, { stroke: [0.2, 0.2, 0.22], width: 0.5 });

      let ty = y + L.fh + L.lh;
      for (const line of boardText(project, b, b.sceneId !== prevScene, o, L)) {
        let tx = x;
        if (line.label) {
          page.text(line.label, tx, ty, { size: L.fs, font: "bold" });
          tx += textWidth(line.label + "   ", L.fs, "bold");
        }
        if (line.str) page.text(fit(line.str, L.fw - (tx - x), L.fs, line.font || "regular"), tx, ty, { size: L.fs, font: line.font || "regular", color: line.color || [0, 0, 0] });
        ty += L.lh;
      }
      prevScene = b.sceneId;
      done++;
      if (done % 4 === 0) toast(`Making PDF… ${done} of ${boards.length} boards`);
    }
  }
  return pdf.toBlob();
}
