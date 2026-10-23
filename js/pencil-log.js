// Pencil log: the last pointer events on the board, for tracking down strokes that never appear.
// Opened from Guides → Pencil log…; Jarmo copies it into the chat after a missed stroke.
// Large contacts the iPad itself cancels (a resting hand, a grip on the edge) arrive about 60 times a
// second, so they're folded into one summary line instead of filling the log.

const MAX_LINES = 300;
const BIG = 40;            // CSS px: wider than a fingertip
const lines = [];
const moves = new Map();   // pointer id → moves since its pointerdown
const big = new Set();     // ids of large contacts currently down
let folded = { count: 0, spots: new Set(), since: 0 };
let start = null;

const now = () => {
  const t = performance.now();
  if (start === null) start = t;
  return Math.round(t - start);
};

function push(text, t = now()) {
  lines.push(`${String(t).padStart(7)} ms  ${text}`);
  if (lines.length > MAX_LINES) lines.shift();
}

function flushFolded() {
  if (!folded.count) return;
  push(`(${folded.count} large touches at ${[...folded.spots].join(" and ")} — cancelled by the iPad)`, folded.since);
  folded = { count: 0, spots: new Set(), since: 0 };
}

export function note(text) {
  flushFolded();
  push(text);
}

export const isBigTouch = (e) => e.pointerType === "touch" && Math.max(e.width || 0, e.height || 0) > BIG;

export function logText() {
  flushFolded();
  return lines.join("\n") || "(nothing yet — draw a few strokes first)";
}

export function clearLog() {
  lines.length = 0;
  folded = { count: 0, spots: new Set(), since: 0 };
  start = null;
}

const who = (e) => `${e.pointerType}#${e.pointerId}`;
const at = (e) => `${Math.round(e.clientX)},${Math.round(e.clientY)}`;

// Listens alongside the board's own handlers (capture phase), so it changes nothing about drawing.
export function watch(el) {
  el.addEventListener("pointerdown", (e) => {
    if (isBigTouch(e)) {
      big.add(e.pointerId);
      if (!folded.count) folded.since = now();
      folded.count++;
      folded.spots.add(`${Math.round(e.clientX / 10) * 10},${Math.round(e.clientY / 10) * 10}`);
      return;
    }
    moves.set(e.pointerId, 0);
    const size = e.pointerType === "touch" ? ` size ${Math.round(e.width || 0)}×${Math.round(e.height || 0)}` : ` pressure ${e.pressure.toFixed(2)}`;
    note(`${who(e)} down at ${at(e)}${size}`);
  }, true);
  el.addEventListener("pointermove", (e) => {
    if (big.has(e.pointerId)) return;
    if (moves.has(e.pointerId)) moves.set(e.pointerId, moves.get(e.pointerId) + 1);
    else if (e.pointerType === "pen" && e.buttons) note(`${who(e)} MOVE WITHOUT A DOWN at ${at(e)}`);
  }, true);
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
    el.addEventListener(type, (e) => {
      if (big.has(e.pointerId)) {
        if (type !== "lostpointercapture") big.delete(e.pointerId);
        return;
      }
      const n = moves.get(e.pointerId);
      if (type !== "lostpointercapture") moves.delete(e.pointerId);
      note(`${who(e)} ${type.replace("pointer", "").replace("lost", "lost ")}${n === undefined ? "" : ` after ${n} moves`}`);
    }, true);
  }
}
