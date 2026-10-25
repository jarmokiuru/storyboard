// Floor plan for Shot Designer (SPEC §8.6, Jarmo's rules 2026-10-25): a blank PNG of the room — walls, windows,
// doors with their swing, nothing else. No text, labels, scale bar, north arrow or furniture: Shot Designer lays
// its own elements on top. The picture's edges are the room's inside faces (walls drawn inside the edge), so its
// width is the room width and its height the depth, for calibrating. 800 pixels per metre, stored in the file.

import { crc32 } from "./zip.js";

const WALL = 0.08;     // metres: drawn wall thickness, inside the edge
const LINE = 0.012;    // metres: thin lines (door leaf and swing, window)
const MAX_PIXELS = 16e6;   // iPad Safari refuses bigger canvases; big rooms drop below 800 px/m

// room: { w, d, door, window } in metres (plan axes: x west → east, z north → south; north up).
export async function blankPlan(room, ppm = 800) {
  while (room.w * ppm * room.d * ppm > MAX_PIXELS && ppm > 100) ppm -= 50;
  const W = Math.round(room.w * ppm);
  const H = Math.round(room.d * ppm);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = g.strokeStyle = "#000";
  g.lineWidth = Math.max(2, LINE * ppm);
  const t = WALL * ppm;

  for (const side of ["n", "s", "w", "e"]) {
    const along = side === "n" || side === "s" ? W : H;
    // Openings on this wall, as pixel spans along it (offset is from the wall's centre, + east or south).
    const cuts = [];
    if (room.door?.wall === side) cuts.push({ kind: "door", ...span(room.door, along, ppm) });
    if (room.window?.wall === side) cuts.push({ kind: "window", ...span(room.window, along, ppm) });
    cuts.sort((p, q) => p.a - q.a);
    let at = 0;
    for (const cut of cuts) {
      band(g, side, at, cut.a, t, W, H);
      if (cut.kind === "window") windowMark(g, side, cut.a, cut.b, t, W, H);
      else doorMark(g, side, cut.a, cut.b, t, W, H);
      at = Math.max(at, cut.b);
    }
    band(g, side, at, along, t, W, H);
  }
  const blob = await new Promise((resolve) => c.toBlob(resolve, "image/png"));
  return { blob: await withDensity(blob, ppm), width: W, height: H, ppm };
}

function span(o, along, ppm) {
  const mid = along / 2 + o.offset * ppm;
  return { a: Math.max(0, mid - (o.width * ppm) / 2), b: Math.min(along, mid + (o.width * ppm) / 2) };
}

// Turns "a position along the wall and a distance into the room" into picture coordinates.
function pointer(side, W, H) {
  if (side === "n") return (s, i) => [s, i];
  if (side === "s") return (s, i) => [s, H - i];
  if (side === "w") return (s, i) => [i, s];
  return (s, i) => [W - i, s];
}

function band(g, side, a, b, t, W, H) {
  if (b - a < 0.5) return;
  const p = pointer(side, W, H);
  const [x0, y0] = p(a, 0);
  const [x1, y1] = p(b, t);
  g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
}

// A window: the wall's two faces and a centre line, as thin lines across the gap.
function windowMark(g, side, a, b, t, W, H) {
  const p = pointer(side, W, H);
  const lw = g.lineWidth;
  for (const i of [lw / 2, t / 2, t - lw / 2]) line(g, p(a, i), p(b, i));
  line(g, p(a, 0), p(a, t));
  line(g, p(b, 0), p(b, t));
}

// A door: hinged at its west/north end, the leaf drawn open into the room with a quarter-circle swing.
function doorMark(g, side, a, b, t, W, H) {
  const p = pointer(side, W, H);
  const r = b - a;
  line(g, p(a, t), p(a, t + r));
  g.beginPath();
  const steps = 32;
  for (let k = 0; k <= steps; k++) {
    const ang = (k / steps) * (Math.PI / 2);
    const [x, y] = p(a + Math.sin(ang) * r, t + Math.cos(ang) * r);
    if (k === 0) g.moveTo(x, y);
    else g.lineTo(x, y);
  }
  g.stroke();
}

function line(g, [x0, y0], [x1, y1]) {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}

// Adds a pHYs chunk (pixels per metre) right after the PNG header, so apps read the true scale.
async function withDensity(blob, ppm) {
  const src = new Uint8Array(await blob.arrayBuffer());
  const data = new Uint8Array(9);
  const v = new DataView(data.buffer);
  v.setUint32(0, ppm);
  v.setUint32(4, ppm);
  data[8] = 1;   // unit: metre
  const chunk = new Uint8Array(21);
  const cv = new DataView(chunk.buffer);
  cv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4);   // "pHYs"
  chunk.set(data, 8);
  cv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const end = 33;   // 8-byte signature + 25-byte IHDR chunk
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, end));
  out.set(chunk, end);
  out.set(src.subarray(end), end + chunk.length);
  return new Blob([out], { type: "image/png" });
}
