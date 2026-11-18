// Changing a project's aspect ratio (Jarmo, 2026-11-18). Boards stay 2048 px wide; the height follows the new ratio.
// Every stored layer is redrawn centred in the new frame: a taller frame gets blank space above and below, a
// shorter one loses the same amount off the top and bottom. Horizon lines keep their place on the drawing, and
// thumbnails are made again. Saved 3D renders are reshaped the same way until saved again from the Shot Generator.

import * as db from "./db.js";
import * as store from "./board-store.js";
import { LAYERS, BOARD_WIDTH, boardHeight } from "./model.js";

export const drawnBoards = (p) => p.boards.filter((b) => LAYERS.some((n) => b.layers[n]?.hasData));

// Pixels cut off the top and the bottom each (negative = added), going from one ratio to the other.
export const cropEach = (from, to) => (boardHeight(from) - boardHeight(to)) / 2;

export async function changeRatio(project, ratio, progress = () => {}) {
  const oldH = boardHeight(project.ratio);
  const newH = boardHeight(ratio);
  const off = (newH - oldH) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_WIDTH;
  canvas.height = newH;
  const g = canvas.getContext("2d");
  const boards = project.boards;
  for (let i = 0; i < boards.length; i++) {
    const b = boards[i];
    progress(i + 1, boards.length);
    for (const n of LAYERS) {
      if (!b.layers[n]?.hasData) continue;
      const blob = await db.getLayer(b.id, n);
      if (!blob) continue;
      const bm = await createImageBitmap(blob);
      g.clearRect(0, 0, BOARD_WIDTH, newH);
      g.drawImage(bm, 0, off, BOARD_WIDTH, oldH);
      bm.close?.();
      await db.putLayer(b.id, n, await store.canvasBlob(canvas));
    }
    if (typeof b.horizon === "number") b.horizon = Math.min(1, Math.max(0, (b.horizon * oldH + off) / newH));
  }
  canvas.width = canvas.height = 0;
  project.ratio = ratio;
  // Thumbnails at the new shape (after the ratio is set, so they're made from the reshaped layers).
  for (const b of boards) {
    if (!drawnBoards({ boards: [b] }).length && !(await db.getThumb(b.id))) continue;
    const c = await store.flattenStored(b, 320, 320 / ratio);
    const white = document.createElement("canvas");
    white.width = c.width;
    white.height = c.height;
    const w = white.getContext("2d");
    w.fillStyle = "#fff";
    w.fillRect(0, 0, c.width, c.height);
    w.drawImage(c, 0, 0);
    await db.putThumb(b.id, await store.canvasBlob(white, "image/jpeg", 0.8));
  }
  project.modified = Date.now();
  await db.putProject(project);
}
