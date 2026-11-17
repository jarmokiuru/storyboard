// A small sample stroke on each tool button (Jarmo, 2026-11-17), so the tools can be told apart by their mark.
// Drawn with the same brush code as real strokes: an S-curve with the Pencil tipped over in the middle and a
// quick flick at the end, so tilt widening and speed thinning both show. Uses the tool's chosen colour and size.

import { widthFor, drawDot, drawSegment } from "./brush.js";

export const SAMPLE_W = 76;   // CSS px
export const SAMPLE_H = 16;

export function drawSample(canvas, def, size, color) {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  canvas.width = Math.round((canvas.clientWidth || SAMPLE_W) * dpr);
  canvas.height = Math.round(SAMPLE_H * dpr);
  const out = canvas.getContext("2d");
  out.fillStyle = "#ffffff";
  out.fillRect(0, 0, canvas.width, canvas.height);

  // Board pixels → sample pixels: about as the frame shows it, smaller for big tools so the mark fits.
  const widest = size * (1 + 0.45 * (def.tilt || 0));
  const room = def.layer ? 0.75 : 0.4;   // the eraser's cut stays inside its grey band
  const k = Math.min(0.5, (SAMPLE_H * room) / widest) * dpr;
  const len = (canvas.width - 10 * dpr) / k;
  const amp = Math.max(0, (canvas.height / k - widest) / 2 - 1);

  const mark = document.createElement("canvas");
  mark.width = canvas.width;
  mark.height = canvas.height;
  const ctx = mark.getContext("2d");
  ctx.setTransform(k, 0, 0, k, 5 * dpr, canvas.height / 2);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = ctx.fillStyle = def.layer ? color : "#000";

  const N = 48;
  let prev = null, prevW = 0;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const s = {
      x: t * len,
      y: Math.sin(t * Math.PI * 2) * amp * 0.8,
      altitude: ((90 - 55 * Math.sin(Math.PI * t)) * Math.PI) / 180,   // upright → tipped to 35° → upright
      azimuth: 0.4,
      pressure: 0.5,
    };
    const flick = Math.max(0, (t - 0.7) / 0.3);
    const w = widthFor(def, size, s, 0.5 + 7.5 * flick * flick);   // steady, then a quick flick off
    if (!prev) drawDot(ctx, def, s, w);
    else drawSegment(ctx, def, prev, s, prevW, w);
    prev = s;
    prevW = w;
  }

  if (def.layer) {
    out.globalAlpha = def.alpha;
    out.drawImage(mark, 0, 0);
  } else {
    // Eraser: a grey band with the stroke taken out of it.
    const band = document.createElement("canvas");
    band.width = canvas.width;
    band.height = canvas.height;
    const b = band.getContext("2d");
    b.fillStyle = "#9a9ea6";
    b.fillRect(0, canvas.height * 0.15, canvas.width, canvas.height * 0.7);
    b.globalCompositeOperation = "destination-out";
    b.drawImage(mark, 0, 0);
    out.drawImage(band, 0, 0);
  }
}
