// Drawing tools (Storyboarder's set, SPEC §6.2) and how a stroke's width is worked out.
// Line weight comes from tilt and speed; pressure joins in only if the pen reports it varying (SPEC §6.3).

const GREYS = ["#1c1d20", "#3a3c40", "#6b6f76", "#9a9ea6", "#c9ccd1"];
const NOTE_COLOURS = ["#d23c32", "#e08a1e", "#2f7fd1", "#2e9e5b", "#1c1d20"];

// sizes: board pixels (boards are 2048 px wide). tilt: how much tipping the Pencil widens the mark.
// speed: how much a fast stroke thins it (0 = not at all). alpha: how see-through the finished stroke is.
export const TOOLS = [
  { id: "light", label: "Light pencil", short: "Light", key: "1", layer: "pencil", sizes: [3, 6, 12], colors: GREYS, color: 2, alpha: 0.35, tilt: 2.5, speed: 0.5, shape: "line" },
  { id: "pencil", label: "Pencil", short: "Pencil", key: "2", layer: "pencil", sizes: [4, 8, 16], colors: GREYS, color: 1, alpha: 0.85, tilt: 2.5, speed: 0.55, shape: "line" },
  { id: "pen", label: "Pen", short: "Pen", key: "3", layer: "ink", sizes: [4, 8, 16], colors: GREYS, color: 0, alpha: 1, tilt: 0.3, speed: 0.6, shape: "line" },
  { id: "brush", label: "Brush", short: "Brush", key: "4", layer: "fill", sizes: [24, 48, 96], colors: GREYS, color: 2, alpha: 0.3, tilt: 2.5, speed: 0.3, shape: "stamp" },
  { id: "eraser", label: "Eraser", short: "Eraser", key: "5", layer: null, sizes: [16, 40, 100], colors: [], alpha: 1, tilt: 1, speed: 0, shape: "line" },
  { id: "note", label: "Note pen", short: "Note", key: "6", layer: "notes", sizes: [4, 8, 16], colors: NOTE_COLOURS, color: 0, alpha: 1, tilt: 0.3, speed: 0.3, shape: "line" },
];

export const MOVE = { id: "move", label: "Move / scale layer", short: "Move", key: "v" };

const SETTINGS_KEY = "storyboard.tools";

export function loadToolSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}; } catch { /* first run or private mode */ }
  return Object.fromEntries(TOOLS.map((t) => [t.id, { size: 1, color: t.colors[t.color] ?? "#000", ...saved[t.id] }]));
}

export function saveToolSettings(settings) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch { /* not essential */ }
}

// Pressure counts only once a pen has shown several different values (the USB-C Pencil sends a fixed 0.30).
export const pressure = { dynamic: false, seen: new Set() };

export function notePressure(p) {
  if (pressure.dynamic || !(p > 0)) return;
  pressure.seen.add(Math.round(p * 50));
  if (pressure.seen.size > 4) pressure.dynamic = true;
}

// Altitude: 90° = upright, 0° = lying flat. Azimuth: the direction the Pencil leans.
// Returns null when the event carries no tilt — Safari's in-between ("coalesced") samples can
// leave the angle at its upright placeholder, so those borrow the angle of the event they came with.
function angles(e) {
  if (e.tiltX || e.tiltY) {
    const tx = Math.tan((e.tiltX * Math.PI) / 180);
    const ty = Math.tan((e.tiltY * Math.PI) / 180);
    return { altitude: Math.atan(1 / Math.hypot(tx, ty)), azimuth: Math.atan2(ty, tx) };
  }
  if (typeof e.altitudeAngle === "number" && Math.abs(e.altitudeAngle - Math.PI / 2) > 1e-3) {
    return { altitude: e.altitudeAngle, azimuth: e.azimuthAngle || 0 };
  }
  return null;
}

export function readSample(e, type, toBoard, parent = null) {
  const { x, y } = toBoard(e.clientX, e.clientY);
  const a = type === "pen" ? angles(e) || (parent && angles(parent)) : null;
  return {
    x, y,
    pressure: e.pressure > 0 ? e.pressure : 0.5,
    altitude: a ? a.altitude : Math.PI / 2,
    azimuth: a ? a.azimuth : 0,
    time: e.timeStamp,
  };
}

// speed: board pixels per millisecond, already smoothed.
export function widthFor(tool, size, s, speed) {
  let w = size;
  if (pressure.dynamic) w *= 0.15 + 0.85 * s.pressure;
  if (tool.shape === "line") w *= 1 + (1 - Math.sin(s.altitude)) * tool.tilt;
  const v = Math.min(1, speed / 8);
  w *= 1 - tool.speed * v * v * (3 - 2 * v);
  return Math.max(0.5, w);
}

export function drawDot(ctx, tool, s, w) {
  if (tool.shape === "stamp") return stamp(ctx, tool, s, s.x, s.y, w);
  ctx.beginPath();
  ctx.arc(s.x, s.y, w / 2, 0, Math.PI * 2);
  ctx.fill();
}

export function drawSegment(ctx, tool, a, b, wa, wb) {
  if (tool.shape === "stamp") {
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(dist / Math.max(1, wb * 0.12)));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      stamp(ctx, tool, b, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, wa + (wb - wa) * t);
    }
    return;
  }
  ctx.lineWidth = (wa + wb) / 2;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

// The side of the lead: an ellipse that stretches as the Pencil tips over.
function stamp(ctx, tool, s, x, y, w) {
  const r = w / 2;
  const long = r * (1 + (1 - Math.sin(s.altitude)) * tool.tilt);
  ctx.beginPath();
  ctx.ellipse(x, y, long, r, s.azimuth, 0, Math.PI * 2);
  ctx.fill();
}

// Furthest a mark can reach from its centre, for working out what a stroke touched.
export const reach = (tool, w) => (w / 2) * (1 + tool.tilt) + 2;
