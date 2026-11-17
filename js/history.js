// Undo / redo, one history per board, kept while the project is open (switching boards no longer loses it).
// Keeps only the rectangle each stroke touched. All boards share one memory budget; when it's spent, the
// oldest steps of the least recently used boards go first.

const LIMIT_BYTES = 150e6;

// The picture of a layer just before a change — one scratch canvas for every board.
const before = document.createElement("canvas");
const beforeCtx = before.getContext("2d");

const all = new Map();   // board id → History, least recently used first

const bytesOf = (h) => [...h.undoStack, ...h.redoStack].reduce((n, s) => n + s.before.data.length * 2, 0);

export function historyFor(boardId) {
  let h = all.get(boardId);
  if (h) all.delete(boardId);
  else h = new History();
  all.set(boardId, h);
  return h;
}

export function forgetHistory(boardId) {
  if (boardId) all.delete(boardId);
  else all.clear();
}

function trim(current) {
  let total = 0;
  for (const h of all.values()) total += bytesOf(h);
  for (const h of all.values()) {
    if (total <= LIMIT_BYTES) return;
    if (h === current) continue;
    total -= bytesOf(h);
    h.clear();
  }
  while (total > LIMIT_BYTES && current.undoStack.length > 1) {
    total -= current.undoStack.shift().before.data.length * 2;
  }
}

export class History {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.before = before;
    this.beforeCtx = beforeCtx;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  // Call before changing a layer.
  begin(canvas, name) {
    this.canvas = canvas;
    this.name = name;
    if (this.before.width !== canvas.width || this.before.height !== canvas.height) {
      this.before.width = canvas.width;
      this.before.height = canvas.height;
    } else {
      this.beforeCtx.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.beforeCtx.drawImage(canvas, 0, 0);
  }

  // box: [left, top, right, bottom] of what changed. group: steps sharing a group undo together.
  commit(box, group = null) {
    const c = this.canvas;
    const x = Math.max(0, Math.floor(box[0]));
    const y = Math.max(0, Math.floor(box[1]));
    const w = Math.min(c.width, Math.ceil(box[2])) - x;
    const h = Math.min(c.height, Math.ceil(box[3])) - y;
    if (w <= 0 || h <= 0) return;
    this.undoStack.push({
      name: this.name, x, y, group,
      before: this.beforeCtx.getImageData(x, y, w, h),
      after: c.getContext("2d").getImageData(x, y, w, h),
    });
    this.redoStack = [];
    trim(this);
  }

  // Returns the names of the layers that changed (empty when there's nothing to undo).
  undo(ctxs) {
    return this.move(this.undoStack, this.redoStack, (s) => ctxs[s.name].putImageData(s.before, s.x, s.y));
  }

  redo(ctxs) {
    return this.move(this.redoStack, this.undoStack, (s) => ctxs[s.name].putImageData(s.after, s.x, s.y));
  }

  move(from, to, paint) {
    const names = [];
    const first = from.at(-1);
    while (from.length && (names.length === 0 || (first.group && from.at(-1).group === first.group))) {
      const s = from.pop();
      paint(s);
      to.push(s);
      names.push(s.name);
    }
    return names;
  }
}
