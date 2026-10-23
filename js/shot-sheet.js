// Shot data sheet (SPEC §5): one row per board, for merging into the Shot List elsewhere.
// The app never writes Shot List.xlsx itself. Also the PNG of every board, named as in the sheet.

import { orderedBoards, sceneOf, boardLabel, boardHeight, BOARD_WIDTH } from "./model.js";
import * as store from "./board-store.js";
import { writeSheet } from "./xlsx-write.js";
import { makeZip } from "./zip.js";

const HEADER = ["Kohtaus #", "Kuva #", "Board", "Kuvakoko", "Lens/Focal", "Camera height (cm)", "Tilt (°)", "Movement", "Image"];
const WIDTHS = [10, 8, 8, 10, 12, 18, 9, 18, 16];

const clean = (s) => String(s).replace(/[\\/:*?"<>|\s]+/g, "_");

// "1-1b.png": scene number, then the board's number as shown in the strip.
export function imageName(project, board) {
  return `${clean(sceneOf(project, board).kohtaus || "x")}-${clean(boardLabel(project, board))}.png`;
}

function rows(project) {
  const out = [HEADER];
  for (const b of orderedBoards(project)) {
    const cam = b.camera || {};   // filled in by the Shot Generator (phase 4)
    out.push([
      sceneOf(project, b).kohtaus, b.kuva, boardLabel(project, b), b.kuvakoko, b.lens,
      cam.height != null ? Math.round(cam.height) : "", cam.tilt != null ? Math.round(cam.tilt * 10) / 10 : "",
      b.movement, imageName(project, b),
    ]);
  }
  return out;
}

export const shotSheetXlsx = (project) => writeSheet(rows(project), { sheetName: "Shot data", widths: WIDTHS });

export function shotSheetCsv(project) {
  const q = (v) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const text = rows(project).map((r) => r.map(q).join(",")).join("\r\n") + "\r\n";
  // The byte-order mark tells Excel the file is UTF-8, so ä and ö come through.
  return new Blob(["﻿" + text], { type: "text/csv" });
}

// Every board flattened on white at full size, in one zip. onProgress(done, total).
export async function boardImagesZip(project, onProgress) {
  const w = BOARD_WIDTH;
  const h = boardHeight(project.ratio);
  const boards = orderedBoards(project);
  const entries = [];
  for (const [i, b] of boards.entries()) {
    const art = await store.flattenStored(b, w, h);
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(art, 0, 0);
    entries.push({ name: imageName(project, b), data: await store.canvasBlob(c) });
    onProgress?.(i + 1, boards.length);
  }
  return makeZip(entries);
}
