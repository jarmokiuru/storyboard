// Pencil log: the last pointer events on the board, for tracking down strokes that never appear.
// Opened from Guides → Pencil log…; Jarmo copies it into the chat after a missed stroke.

const MAX_LINES = 120;
const lines = [];
const moves = new Map();   // pointer id → moves since its pointerdown
let start = null;

export function note(text) {
  const now = performance.now();
  if (start === null) start = now;
  lines.push(`${String(Math.round(now - start)).padStart(7)} ms  ${text}`);
  if (lines.length > MAX_LINES) lines.shift();
}

export const logText = () => lines.join("\n") || "(nothing yet — draw a few strokes first)";

export function clearLog() {
  lines.length = 0;
  start = null;
}

const who = (e) => `${e.pointerType}#${e.pointerId}`;
const at = (e) => `${Math.round(e.clientX)},${Math.round(e.clientY)}`;

// Listens alongside the board's own handlers (capture phase), so it changes nothing about drawing.
export function watch(el) {
  el.addEventListener("pointerdown", (e) => {
    moves.set(e.pointerId, 0);
    const size = e.pointerType === "touch" ? ` size ${Math.round(e.width || 0)}×${Math.round(e.height || 0)}` : ` pressure ${e.pressure.toFixed(2)}`;
    note(`${who(e)} down at ${at(e)}${size}`);
  }, true);
  el.addEventListener("pointermove", (e) => {
    if (moves.has(e.pointerId)) moves.set(e.pointerId, moves.get(e.pointerId) + 1);
    else if (e.pointerType === "pen" && e.buttons) note(`${who(e)} MOVE WITHOUT A DOWN at ${at(e)}`);
  }, true);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    el.addEventListener(type, (e) => {
      const n = moves.get(e.pointerId);
      if (type !== "lostpointercapture") moves.delete(e.pointerId);
      note(`${who(e)} ${type.replace("pointer", "").replace("lost", "lost ")}${n === undefined ? "" : ` after ${n} moves`}`);
    }, true);
  }
}
