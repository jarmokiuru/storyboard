// Shot-size presets (SPEC §8.4): with a figure chosen, put the camera at the distance that gives the framing
// with the current lens, keeping the direction the camera points (pan). Names follow Jarmo's Kuvakoko column.
// Each size says where the frame's top and bottom edges cut, from the figure as it's posed now
// (so a seated or crouching figure frames correctly too).

// m = body landmarks from Things.landmarks(): heights in metres, L = head bone to crown.
export const SIZES = [
  { id: "ECU", title: "Extreme close-up: forehead to mouth", cut: (m) => [m.top - 0.3 * m.L, m.chin + 0.25 * m.L], close: true },
  { id: "CU", title: "Close-up: head and a little neck", cut: (m) => [m.top + 0.12 * m.L, m.neck - 0.25 * m.L], close: true },
  { id: "MCU", title: "Medium close-up: to mid-chest", cut: (m) => [m.top + 0.25 * m.L, m.chest - 0.05], close: true },
  { id: "MS", title: "Medium shot: to the waist", cut: (m) => [m.top + 0.35 * m.L, m.waist - 0.05] },
  { id: "MLS", title: "Medium long shot: to the knees", cut: (m) => [m.top + 0.45 * m.L, m.knees - 0.04] },
  { id: "LS", title: "Long / full shot: the whole figure with a little room", cut: (m) => pad(m, 1.15) },
  { id: "WS", title: "Wide shot: the figure about a third of the frame height", cut: (m) => pad(m, 3) },
  { id: "EWS", title: "Extreme wide shot: the figure small in its surroundings", cut: (m) => pad(m, 8) },
];

// Whole figure at a share of the frame: the figure's height × k, centred a little below its middle.
function pad(m, k) {
  const h = m.top - m.floor;
  const mid = m.floor + h * 0.5;
  return [mid + (h * k) / 2, mid - (h * k) / 2];
}

// Kuvakoko text from the shot list → our size id ("FS" and "LS/FS" count as LS).
export function sizeFromKuvakoko(text) {
  const t = String(text || "").toUpperCase().replace(/\s+/g, "");
  if (t === "FS" || t === "LS/FS" || t === "FULL") return "LS";
  return SIZES.find((s) => s.id === t)?.id ?? null;
}

// Returns the new camera { x, z, height, tilt } for the size, or null if the figure can't be read.
// shot: current camera (pan kept), vfov: the picture's vertical angle of view in degrees.
export function frameSize(sizeId, m, shot, vfov) {
  const size = SIZES.find((s) => s.id === sizeId);
  if (!size || !m) return null;
  const [top, bottom] = size.cut(m);
  const span = Math.max(0.05, top - bottom);
  const centreY = (top + bottom) / 2;
  // Close shots centre on the face; wider ones on the body.
  const c = size.close ? m.head : m.body;
  // Distance along the line of sight that makes the frame `span` tall.
  const slant = span / 2 / Math.tan((vfov * Math.PI) / 360);
  let height = shot.height / 100;
  let dy = centreY - height;
  // Too steep to fit (camera far above or below a close framing): bring the camera to the frame's middle.
  if (Math.abs(dy) > slant * 0.7) {
    height = centreY;
    dy = 0;
  }
  const flat = Math.sqrt(slant * slant - dy * dy);
  const a = (shot.pan * Math.PI) / 180;
  return {
    x: round(c.x - Math.sin(a) * flat),
    z: round(c.z + Math.cos(a) * flat),
    height: Math.round(Math.max(10, height * 100)),
    tilt: Math.round(((Math.atan2(dy, flat) * 180) / Math.PI) * 10) / 10,
  };
}

const round = (v) => Math.round(v * 100) / 100;
