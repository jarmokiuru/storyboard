// Undo / redo for the board being drawn on. Keeps only the rectangle each stroke touched.

const LIMIT_BYTES = 150e6;

export class History {
  constructor() {
    this.undoStack = [];
    this.redoStack = [];
    this.before = document.createElement("canvas");
    this.beforeCtx = this.before.getContext("2d");
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

  // box: [left, top, right, bottom] of what changed.
  commit(box) {
    const c = this.canvas;
    const x = Math.max(0, Math.floor(box[0]));
    const y = Math.max(0, Math.floor(box[1]));
    const w = Math.min(c.width, Math.ceil(box[2])) - x;
    const h = Math.min(c.height, Math.ceil(box[3])) - y;
    if (w <= 0 || h <= 0) return;
    this.undoStack.push({
      name: this.name, x, y,
      before: this.beforeCtx.getImageData(x, y, w, h),
      after: c.getContext("2d").getImageData(x, y, w, h),
    });
    this.redoStack = [];
    let bytes = this.undoStack.reduce((n, s) => n + s.before.data.length * 2, 0);
    while (bytes > LIMIT_BYTES && this.undoStack.length > 1) {
      bytes -= this.undoStack.shift().before.data.length * 2;
    }
  }

  // Returns the name of the layer that changed, or null.
  undo(ctxs) {
    const s = this.undoStack.pop();
    if (!s) return null;
    ctxs[s.name].putImageData(s.before, s.x, s.y);
    this.redoStack.push(s);
    return s.name;
  }

  redo(ctxs) {
    const s = this.redoStack.pop();
    if (!s) return null;
    ctxs[s.name].putImageData(s.after, s.x, s.y);
    this.undoStack.push(s);
    return s.name;
  }
}
