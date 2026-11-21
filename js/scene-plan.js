// Camera plan of a scene (Jarmo, 2026-11-19): the set seen from above with every board's camera marked — where it
// stands, which way it looks, how wide the lens sees — and the shot number and lens beside it. Figures and furniture
// are drawn too, so the plan reads as a setup map for the crew. Unlike the Shot Designer plan this one carries text,
// a scale bar and a north arrow. Plain 2D drawing, so it works from the board editor without loading the 3D parts.

import { drawWalls } from "./plan-export.js";
import { heading, sceneBoards, boardLabel, roomOpenings } from "./model.js";
import { sceneBlocking, isCast, PLAIN } from "./shotgen/blocking.js";
import { sensorById, horizontalAov, DEFAULT_SENSOR } from "./shotgen/sensors.js";

const LONG_SIDE = 2400;   // px: the plan's longer side (room + margins), before header and footer
const MARGIN = 0.7;       // metres around what is drawn
const WEDGE = 1.8;        // metres: how far the angle-of-view lines reach with no figure in frame
const CAMERA = "#c0392b";
const rad = (d) => (d * Math.PI) / 180;

// What the plan shows; Jarmo picks these in the export dialog (camera-plan-dialog.js), kept as project.planOptions.
export const PLAN_OPTIONS = [
  ["wedges", "Angle of view", true],
  ["lens", "Lens on the camera labels", true],
  ["cast", "Cast", true],
  ["castNames", "Cast names", true],
  ["extras", "Extras", true],
  ["extraNames", "Extras' names", false],
  ["furniture", "Furniture", true],
  ["header", "Scene heading and set", true],
  ["footer", "Scale, north and camera format", true],
  ["unset", "Boards without a camera", true],
];
export const planOptions = (saved = {}) => Object.fromEntries(PLAN_OPTIONS.map(([k, , on]) => [k, typeof saved[k] === "boolean" ? saved[k] : on]));

// The set a scene uses, without making one (the Shot Generator makes it on first open).
export const sceneLocation = (project, scene) => (project.locations || []).find((l) => l.id === scene.locationId) || null;

// The scene's boards that have a 3D camera in this set, and those that don't.
export function sceneCameras(project, scene, loc) {
  const set = [], unset = [];
  for (const b of sceneBoards(project, scene.id)) {
    const s = b.shot3d;
    if (s?.camera && (!s.locationId || s.locationId === loc.id)) set.push({ board: b, label: boardLabel(project, b), cam: s.camera });
    else unset.push(boardLabel(project, b));
  }
  return { set, unset };
}

// Draws the plan; returns the canvas (for a preview) and, with asBlob, the PNG.
export async function scenePlan(project, scene, loc, options = {}, { asBlob = true } = {}) {
  const o = planOptions(options);
  const room = loc.room;
  const { set, unset } = sceneCameras(project, scene, loc);
  const everyone = sceneBlocking(project, scene).figures;
  const figures = everyone.filter((f) => (isCast(project, f.name) ? o.cast : o.extras));
  const showName = (f) => (isCast(project, f.name) ? o.castNames : o.extraNames);
  const objects = o.furniture ? loc.objects || [] : [];
  const sensor = sensorById(project.sensor || DEFAULT_SENSOR);

  // What has to fit: the room (or, outdoors, everything placed) and every camera, in plan metres.
  const pts = set.map((c) => [c.cam.x, c.cam.z]).concat(figures.map((f) => [f.x, f.z]), objects.map((o) => [o.x, o.z]));
  if (!room.exterior) pts.push([-room.w / 2, -room.d / 2], [room.w / 2, room.d / 2]);
  if (!pts.length) pts.push([-3, -3], [3, 3]);
  const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
  const x0 = Math.min(...xs) - MARGIN, x1 = Math.max(...xs) + MARGIN;
  const z0 = Math.min(...zs) - MARGIN, z1 = Math.max(...zs) + MARGIN;
  const ppm = Math.min(220, LONG_SIDE / Math.max(x1 - x0, z1 - z0));

  const W = Math.round((x1 - x0) * ppm);
  const Hp = Math.round((z1 - z0) * ppm);
  const fs = Math.max(16, Math.round(Math.max(W, 900) / 70));   // base text size
  const head = o.header ? Math.round(fs * 3.4) : Math.round(fs * 0.6);
  const foot = o.footer || (o.unset && unset.length) ? Math.round(fs * 3.2) : Math.round(fs * 0.6);
  const c = document.createElement("canvas");
  let g = c.getContext("2d");
  const font = (size, bold) => `${bold ? "bold " : ""}${Math.round(size)}px Helvetica, Arial, sans-serif`;
  const textWidth = (t, f) => { g.font = f; return g.measureText(t).width; };

  // Plan metres → plan pixels, before the margins are known.
  const Q = (x, z) => [(x - x0) * ppm, (z - z0) * ppm];
  const r = 0.22 * ppm;

  // Where each camera's wedge ends and its label sits, worked out first: anything that would fall outside the
  // picture widens the blank margin just enough to keep it whole (Jarmo, 2026-11-21).
  const wedges = set.map(({ cam }) => {
    const half = horizontalAov(sensor, project.ratio, cam.focal) / 2;
    // The lines reach a little past the nearest figure in frame, so the wedge shows who the shot is on.
    let reach = Infinity;
    for (const f of figures) {
      const dx = f.x - cam.x, dz = f.z - cam.z, dist = Math.hypot(dx, dz);
      const off = ((Math.atan2(dx, -dz) * 180) / Math.PI - cam.pan + 540) % 360 - 180;
      if (dist > 0.3 && Math.abs(off) <= half) reach = Math.min(reach, dist);
    }
    const len = (reach === Infinity ? WEDGE : Math.min(12, reach + 0.6)) * ppm;
    const [cx, cy] = Q(cam.x, cam.z);
    const ray = (a) => [cx + Math.sin(rad(a)) * len, cy - Math.cos(rad(a)) * len];
    return { cx, cy, left: ray(cam.pan - half), right: ray(cam.pan + half) };
  });
  const groups = [];   // cameras within 15 cm share one label
  for (const k of set) {
    const near = groups.find((gr) => Math.hypot(gr[0].cam.x - k.cam.x, gr[0].cam.z - k.cam.z) < 0.15);
    if (near) near.push(k); else groups.push([k]);
  }
  const big = font(fs * 1.15, true), small = font(fs * 0.8);
  const lh = fs * 1.45, pad = fs * 0.45;
  const labels = groups.map((gr) => {
    const lines = gr.map((k) => [k.label, o.lens ? `${Math.round(k.cam.focal)}mm` : ""]);
    const w1 = Math.max(...lines.map(([a]) => textWidth(a, big)));
    const w2 = o.lens ? Math.max(...lines.map(([, b]) => textWidth(b, small))) : 0;
    const bw = w1 + w2 + pad * (o.lens ? 3 : 2), bh = lines.length * lh + pad;
    // Behind the camera, away from where it looks, so the label never covers the shot.
    const pan = gr[0].cam.pan;
    const [cx, cy] = Q(gr[0].cam.x, gr[0].cam.z);
    const back = 0.5 * ppm + fs;
    const lx = cx - Math.sin(rad(pan)) * back, ly = cy + Math.cos(rad(pan)) * back;
    return { lines, w1, bw, bh, bx: lx - bw / 2, by: ly - bh / 2 };
  });
  const names = figures.filter((f) => showName(f) && (f.name || "").trim() && f.name.trim() !== "?").map((f) => {
    const [fx, fy] = Q(f.x, f.z);
    const out = r + fs * 0.9;   // on the side away from the nose, so the two never overlap
    const text = f.name.trim();
    return { text, x: fx + Math.sin(rad(f.rot || 0)) * out, y: fy - Math.cos(rad(f.rot || 0)) * out, w: textWidth(text, font(fs * 0.85, true)) };
  });
  let minX = 0, minY = 0, maxX = W, maxY = Hp;
  const take = (x0b, y0b, x1b, y1b) => { minX = Math.min(minX, x0b); minY = Math.min(minY, y0b); maxX = Math.max(maxX, x1b); maxY = Math.max(maxY, y1b); };
  const body = 0.32 * ppm;
  for (const w of wedges) {
    take(w.cx - body, w.cy - body, w.cx + body, w.cy + body);
    if (o.wedges) for (const [x, y] of [w.left, w.right]) take(x, y, x, y);
  }
  for (const l of labels) take(l.bx, l.by, l.bx + l.bw, l.by + l.bh);
  for (const n of names) take(n.x - n.w / 2, n.y - fs * 0.6, n.x + n.w / 2, n.y + fs * 0.6);
  const edge = fs * 0.5;   // a little white beyond whatever reaches furthest
  const grow = (v) => (v > 0 ? v + edge : 0);
  const padL = grow(-minX), padR = grow(maxX - W), padT = grow(-minY), padB = grow(maxY - Hp);

  // Header and footer text must fit too.
  const title = heading(scene) || "Scene";
  const size = room.exterior ? "exterior" : `${room.w.toFixed(2)} × ${room.d.toFixed(2)} m`;
  const sub = `Camera plan · ${loc.name}, ${size} (${loc.tag}) · ${project.title}`;
  const notes = [];
  if (o.footer) notes.push(`${sensor.camera} ${sensor.mode}, ${project.ratio.toFixed(2)}:1`);
  if (o.unset && unset.length) notes.push(`No camera yet: ${unset.join(", ")}`);
  const noteText = notes.join("  ·  ");
  const footStart = o.footer ? fs * 7 + ppm : fs;
  const textNeed = Math.max(
    o.header ? fs * 2 + Math.max(textWidth(title, font(fs * 1.3, true)), textWidth(sub, font(fs * 0.85))) : 0,
    noteText ? footStart + fs + textWidth(noteText, font(fs * 0.85)) : 0,
  );
  const planW = W + padL + padR;
  c.width = Math.ceil(Math.max(planW, o.header || o.footer ? 900 : 0, textNeed));
  const H = Math.ceil(head + padT + Hp + padB + foot);
  c.height = H;
  g = c.getContext("2d");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, c.width, H);

  // Header: scene heading and project.
  if (o.header) {
    g.fillStyle = "#000";
    g.textBaseline = "middle";
    g.font = font(fs * 1.3, true);
    g.fillText(title, fs, head * 0.4);
    g.font = font(fs * 0.85);
    g.fillStyle = "#555";
    g.fillText(sub, fs, head * 0.78);
  }
  g.textBaseline = "middle";

  // Plan pixels → picture pixels.
  const ox = (c.width - planW) / 2 + padL, oy = head + padT;
  const P = (x, z) => { const [a, b] = Q(x, z); return [ox + a, oy + b]; };

  if (!room.exterior) {
    g.save();
    g.translate(...P(-room.w / 2, -room.d / 2));
    g.fillStyle = "#fafafa";
    g.fillRect(0, 0, room.w * ppm, room.d * ppm);
    drawWalls(g, room, ppm);
    // Panels (screens, boards) as a grey strip on the wall's face.
    g.fillStyle = "#999";
    for (const o of roomOpenings(room).filter((o) => o.kind === "panel")) {
      const along = o.wall === "n" || o.wall === "s" ? room.w : room.d;
      const a = (along / 2 + o.offset - o.width / 2) * ppm, len = o.width * ppm, t = 0.06 * ppm, wall = 0.08 * ppm;
      if (o.wall === "n") g.fillRect(a, wall, len, t);
      if (o.wall === "s") g.fillRect(a, room.d * ppm - wall - t, len, t);
      if (o.wall === "w") g.fillRect(wall, a, t, len);
      if (o.wall === "e") g.fillRect(room.w * ppm - wall - t, a, t, len);
    }
    g.restore();
  }

  // Furniture: its footprint, turned as placed.
  for (const o of objects) {
    const w = (o.w ?? 50) / 100 * ppm, d = (o.d ?? 50) / 100 * ppm;
    g.save();
    g.translate(...P(o.x, o.z));
    g.rotate(rad(o.rot || 0));
    g.fillStyle = "#e4e4e4";
    g.strokeStyle = "#8a8a8a";
    g.lineWidth = Math.max(1.5, ppm * 0.012);
    g.beginPath();
    if (/circle|round/.test(o.model || "")) g.ellipse(0, 0, w / 2, d / 2, 0, 0, Math.PI * 2);
    else g.rect(-w / 2, -d / 2, w, d);
    g.fill();
    g.stroke();
    g.restore();
  }

  // Angle-of-view wedges first, so bodies and labels sit on top of them.
  if (o.wedges) for (const w of wedges) {
    const at = ([x, y]) => [ox + x, oy + y];
    const [cx, cy] = at([w.cx, w.cy]);
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(...at(w.left));
    g.lineTo(...at(w.right));
    g.closePath();
    g.fillStyle = "rgba(192, 57, 43, 0.10)";
    g.fill();
    g.strokeStyle = "rgba(192, 57, 43, 0.6)";
    g.lineWidth = Math.max(1.5, ppm * 0.01);
    g.setLineDash([ppm * 0.08, ppm * 0.05]);
    g.beginPath();
    g.moveTo(...at(w.left)); g.lineTo(cx, cy); g.lineTo(...at(w.right));
    g.stroke();
    g.setLineDash([]);
  }

  // Figures: a disc in the figure's colour with a nose for where it faces, and the name.
  for (const f of figures) {
    const [fx, fy] = P(f.x, f.z);
    g.save();
    g.translate(fx, fy);
    g.rotate(rad(f.rot || 0));   // rot 0 = facing south (down the plan), + turns clockwise
    g.fillStyle = f.colour || PLAIN;
    g.strokeStyle = "#333";
    g.lineWidth = Math.max(1.5, ppm * 0.012);
    g.beginPath();
    g.moveTo(-r * 0.45, r * 0.85); g.lineTo(0, r * 1.45); g.lineTo(r * 0.45, r * 0.85);
    g.fillStyle = "#333";
    g.fill();
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fillStyle = f.colour || PLAIN;
    g.fill();
    g.stroke();
    g.restore();
  }
  g.font = font(fs * 0.85, true);
  g.textAlign = "center";
  g.fillStyle = "#222";
  for (const n of names) g.fillText(n.text, ox + n.x, oy + n.y);
  g.textAlign = "left";

  // Cameras: the body, turned to its pan, and a label (shot · lens).
  for (const k of set) {
    const [cx, cy] = P(k.cam.x, k.cam.z);
    g.save();
    g.translate(cx, cy);
    g.rotate(rad(k.cam.pan));   // pan 0 = looking north (up the plan)
    const bw = 0.22 * ppm, bl = 0.32 * ppm;
    g.fillStyle = CAMERA;
    g.fillRect(-bw / 2, -bl * 0.2, bw, bl);
    g.beginPath();   // lens
    g.moveTo(-bw * 0.28, -bl * 0.2); g.lineTo(-bw * 0.45, -bl * 0.55); g.lineTo(bw * 0.45, -bl * 0.55); g.lineTo(bw * 0.28, -bl * 0.2);
    g.fill();
    g.restore();
  }
  for (const l of labels) {
    const bx = ox + l.bx, by = oy + l.by;
    g.fillStyle = "#fff";
    g.strokeStyle = CAMERA;
    g.lineWidth = Math.max(2, fs * 0.12);
    g.beginPath();
    g.roundRect(bx, by, l.bw, l.bh, fs * 0.35);
    g.fill();
    g.stroke();
    l.lines.forEach(([a, b], i) => {
      const y = by + pad / 2 + lh * (i + 0.5);
      g.font = big; g.fillStyle = CAMERA; g.fillText(a, bx + pad, y);
      if (b) { g.font = small; g.fillStyle = "#333"; g.fillText(b, bx + pad * 2 + l.w1, y); }
    });
  }

  // Footer: scale bar, north, camera format, boards without a camera.
  const fy = H - foot / 2;
  if (o.footer) {
    const bar = ppm;   // 1 m
    const t = Math.max(2, fs * 0.12);
    g.fillStyle = "#000";
    g.fillRect(fs, fy - fs * 0.15, bar, fs * 0.3);
    g.fillRect(fs, fy - fs * 0.45, t, fs * 0.9);
    g.fillRect(fs + bar - t, fy - fs * 0.45, t, fs * 0.9);
    g.font = font(fs * 0.85);
    g.fillText("1 m", fs * 1.5 + bar, fy);
    g.font = font(fs * 0.85, true);
    g.fillText("N ↑", fs * 4 + bar, fy);
  }
  if (noteText) {
    g.font = font(fs * 0.85);
    g.fillStyle = "#555";
    g.fillText(noteText, footStart, fy);
  }

  const blob = asBlob ? await new Promise((resolve) => c.toBlob(resolve, "image/png")) : null;
  return { blob, canvas: c, width: c.width, height: H, cameras: set.length, unset };
}
