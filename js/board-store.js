// Reading and writing a board's layer images on the device.

import * as db from "./db.js";
import { LAYERS } from "./model.js";

export function canvasBlob(canvas, type = "image/png", quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't save the drawing"))), type, quality);
  });
}

async function decode(blob) {
  if (!blob) return null;
  try {
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

// { layerName: ImageBitmap | null }
export async function loadImages(board) {
  const out = {};
  await Promise.all(LAYERS.map(async (n) => {
    out[n] = board.layers[n].hasData ? await decode(await db.getLayer(board.id, n)) : null;
  }));
  return out;
}

// A flattened copy of a stored board (used for onion skin), transparent where nothing is drawn.
export async function flattenStored(board, w, h, { skipReference = false } = {}) {
  const images = await loadImages(board);
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  const ctx = c.getContext("2d");
  for (const n of LAYERS) {
    const st = board.layers[n];
    if (!images[n] || !st.visible || (skipReference && n === "reference")) continue;
    ctx.globalAlpha = st.opacity;
    ctx.drawImage(images[n], 0, 0, c.width, c.height);
  }
  return c;
}

export async function loadPhoto(file) {
  try {
    return await createImageBitmap(file);
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      return img;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
