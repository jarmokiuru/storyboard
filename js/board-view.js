// The board canvas: five stacked layers plus onion skin, stroke, prediction and guides,
// with Pencil drawing, finger pan / pinch zoom, palm rejection and undo. SPEC §6.3–6.5.

import { LAYERS } from "./model.js";
import { readSample, widthFor, drawSegment, drawDot, notePressure, reach } from "./brush.js";
import { History } from "./history.js";
import { drawGuides, drawOnion } from "./guides.js";
import { note, watch, isBigTouch } from "./pencil-log.js";

const HAS_COALESCED = "getCoalescedEvents" in PointerEvent.prototype;
const HAS_PREDICTED = "getPredictedEvents" in PointerEvent.prototype;
const TAP_MS = 350;
const TAP_SPREAD_MS = 120;   // fingers of a real two-finger tap land almost together
const PALM_SIZE = 40;        // contact wider than this (CSS px) is a hand, not a fingertip
const PALM_GUARD_MS = 800;   // finger taps this soon after the Pencil are treated as a resting hand

export class BoardView {
  // hooks: onChange(layerName, { cleared }), onPick(colour), onActive(layerName)
  constructor({ view, stack, cursor, hooks }) {
    Object.assign(this, { view, stack, cursor, hooks });
    this.layers = {};
    this.ctx = {};
    this.layerState = null;
    this.z = 1; this.tx = 0; this.ty = 0;
    this.penSeen = false;
    this.lastPen = -Infinity;
    this.spaceHeld = false;
    this.straight = false;
    this.moveMode = "move";
    this.activeLayer = "pencil";
    this.guides = { grid: false, center: false, thirds: false, horizon: false, safe: false, protect: 0, onion: false };
    this.horizon = 0.5;
    this.history = new History();
    this.touches = new Map();
    this.ignored = new Set();   // finger ids judged to be a resting palm, until they lift
    this.gesture = null;
    this.action = null;
    this.tool = null;
    this.bind();
  }

  // ---------- canvases ----------

  setSize(w, h) {
    if (this.w === w && this.h === h) return;
    this.w = w;
    this.h = h;
    this.stack.innerHTML = "";
    this.stack.style.width = w + "px";
    this.stack.style.height = h + "px";
    const make = (cls, scale = 1) => {
      const c = document.createElement("canvas");
      c.width = Math.round(w * scale);
      c.height = Math.round(h * scale);
      c.className = cls;
      this.stack.append(c);
      return c;
    };
    for (const name of LAYERS) {
      this.layers[name] = make("layer");
      this.ctx[name] = this.layers[name].getContext("2d");
      if (name === "reference") this.onion = make("onion", 0.5);
    }
    this.strokeCanvas = make("stroke");
    this.strokeCtx = this.strokeCanvas.getContext("2d");
    this.predictCanvas = make("predict");
    this.predictCtx = this.predictCanvas.getContext("2d");
    this.guideCanvas = make("guides");
    this.guideCtx = this.guideCanvas.getContext("2d");
    this.history.clear();
  }

  showBoard(board, images) {
    this.layerState = board.layers;
    this.horizon = board.horizon ?? 0.5;
    for (const name of LAYERS) {
      this.ctx[name].clearRect(0, 0, this.w, this.h);
      if (images[name]) this.ctx[name].drawImage(images[name], 0, 0, this.w, this.h);
      this.applyLayerState(name);
    }
    this.history.clear();
    this.drawGuides();
  }

  applyLayerState(name) {
    const st = this.layerState[name];
    this.layers[name].style.opacity = st.opacity;
    this.layers[name].style.visibility = st.visible ? "" : "hidden";
  }

  setActive(name) {
    this.activeLayer = name;
    this.hooks.onActive?.(name);
  }

  flatten(width, { background = "#ffffff", skipReference = false } = {}) {
    const c = document.createElement("canvas");
    c.width = Math.round(width);
    c.height = Math.round((width * this.h) / this.w);
    const ctx = c.getContext("2d");
    if (background) {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, c.width, c.height);
    }
    for (const name of LAYERS) {
      const st = this.layerState[name];
      if ((skipReference && name === "reference") || !st.visible) continue;
      ctx.globalAlpha = st.opacity;
      ctx.drawImage(this.layers[name], 0, 0, c.width, c.height);
    }
    return c;
  }

  clearLayer(name) {
    this.history.begin(this.layers[name], name);
    this.ctx[name].clearRect(0, 0, this.w, this.h);
    this.history.commit([0, 0, this.w, this.h]);
    this.hooks.onChange(name, { cleared: true });
  }

  drawReference(img, mode) {
    const ctx = this.ctx.reference;
    this.history.begin(this.layers.reference, "reference");
    ctx.clearRect(0, 0, this.w, this.h);
    const s = mode === "fill" ? Math.max(this.w / img.width, this.h / img.height) : Math.min(this.w / img.width, this.h / img.height);
    const dw = img.width * s;
    const dh = img.height * s;
    ctx.drawImage(img, (this.w - dw) / 2, (this.h - dh) / 2, dw, dh);
    this.history.commit([0, 0, this.w, this.h]);
    this.layerState.reference.visible = true;
    this.applyLayerState("reference");
    this.hooks.onChange("reference");
  }

  undo() {
    const name = this.history.undo(this.ctx);
    if (name) this.hooks.onChange(name);
  }

  redo() {
    const name = this.history.redo(this.ctx);
    if (name) this.hooks.onChange(name);
  }

  // ---------- view: fit, pan, zoom ----------

  fit() {
    const r = this.view.getBoundingClientRect();
    if (!r.width || !this.w) return;
    this.fitZ = Math.min(r.width / this.w, r.height / this.h) * 0.94;
    this.z = this.fitZ;
    this.tx = (r.width - this.w * this.z) / 2;
    this.ty = (r.height - this.h * this.z) / 2;
    this.apply();
  }

  apply() {
    this.stack.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.z})`;
    if (!this.guideFrame) {
      this.guideFrame = requestAnimationFrame(() => {
        this.guideFrame = null;
        this.drawGuides();
      });
    }
  }

  zoomAt(px, py, z) {
    z = Math.min(8, Math.max((this.fitZ || this.z) * 0.4, z));
    const bx = (px - this.tx) / this.z;
    const by = (py - this.ty) / this.z;
    this.z = z;
    this.tx = px - bx * z;
    this.ty = py - by * z;
    this.apply();
  }

  drawGuides() {
    if (!this.guideCtx) return;
    drawGuides(this.guideCtx, this.w, this.h, this.guides, this.horizon, this.z);
    this.onion.style.display = this.guides.onion ? "" : "none";
  }

  setOnion(prev, next) {
    drawOnion(this.onion.getContext("2d"), prev, next);
    this.onion.style.display = this.guides.onion ? "" : "none";
  }

  toBoard(cx, cy) {
    const r = this.viewRect;
    return { x: (cx - r.left - this.tx) / this.z, y: (cy - r.top - this.ty) / this.z };
  }

  // ---------- input ----------

  bind() {
    const v = this.view;
    watch(v);
    // A failure inside a handler would silently end a stroke, so record it in the Pencil log.
    const safe = (fn) => (e) => {
      try { fn.call(this, e); } catch (err) { note(`ERROR in ${e.type}: ${err.message}`); }
    };
    v.addEventListener("pointerdown", safe(this.down));
    v.addEventListener("pointermove", safe(this.move));
    v.addEventListener("pointerup", safe(this.up));
    v.addEventListener("pointercancel", safe(this.up));
    v.addEventListener("lostpointercapture", safe((e) => { if (e.pointerType !== "touch") this.up(e); }));
    v.addEventListener("pointerleave", (e) => { if (e.pointerType !== "touch") this.cursor.hidden = true; });
    v.addEventListener("wheel", (e) => this.wheel(e), { passive: false });
    // Stop Safari's magnifier, text selection, scrolling and double-tap zoom.
    for (const type of ["touchstart", "touchmove", "touchend"]) v.addEventListener(type, (e) => e.preventDefault(), { passive: false });
    v.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  down(e) {
    this.viewRect = this.view.getBoundingClientRect();
    if (e.pointerType === "touch") return this.touchDown(e);
    if (e.pointerType === "pen") {
      this.penSeen = true;
      this.lastPen = e.timeStamp;
      // Any fingers already down are the drawing hand resting: drop them so they can't pan the board.
      for (const id of this.touches.keys()) this.ignored.add(id);
      this.touches.clear();
      this.gesture = null;
    }
    if (!this.tool) return note("  ignored: no tool chosen");
    // A stroke still open means its end was lost (Safari dropped the lift-off): finish it, start the new one.
    if (this.action && e.pointerType !== "mouse") {
      note(`  previous ${this.action.kind} (#${this.action.id}) never ended — closing it`);
      this.finishAction();
    }
    if (this.action) return note(`  ignored: busy with ${this.action.kind}`);
    try { this.view.setPointerCapture(e.pointerId); } catch { /* still works without */ }
    if (e.pointerType === "mouse" && (e.button === 1 || this.spaceHeld)) return this.startPan(e);
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.altKey && !e.metaKey) return this.pick(e);
    if (e.metaKey) return this.startMove(e, e.altKey);
    if (this.tool.def.id === "move") return this.startMove(e, this.moveMode === "scale");
    this.startStroke(e);
  }

  move(e) {
    if (e.pointerType === "touch") return this.touchMove(e);
    if (e.pointerType === "pen") this.lastPen = e.timeStamp;
    const a = this.action;
    if (a && a.id !== e.pointerId && e.buttons && !a.mismatch) {
      a.mismatch = true;   // note it once per stroke
      note(`  move from #${e.pointerId} while drawing with #${a.id} — not drawn`);
    }
    if (!a || a.id !== e.pointerId) return this.hover(e);
    if (a.kind === "stroke") this.continueStroke(e);
    else if (a.kind === "move") this.continueMove(e);
    else if (a.kind === "pan") {
      this.tx = a.tx + e.clientX - a.x;
      this.ty = a.ty + e.clientY - a.y;
      this.apply();
    }
  }

  up(e) {
    if (e.pointerType === "touch") return this.touchUp(e);
    if (this.action?.id === e.pointerId) this.finishAction();
  }

  finishAction() {
    const a = this.action;
    if (a.kind === "stroke") this.endStroke();
    else if (a.kind === "move") this.endMove();
    this.action = null;
  }

  // A ring showing where and how wide the mark will be: mouse on the Mac, Pencil hover on the iPad.
  hover(e) {
    const t = this.tool;
    if (!t || !t.def.sizes || this.action) {
      this.cursor.hidden = true;
      return;
    }
    this.viewRect = this.view.getBoundingClientRect();
    const s = readSample(e, e.pointerType, (x, y) => this.toBoard(x, y));
    const d = (t.def.shape === "stamp" ? t.size : widthFor(t.def, t.size, s, 0)) * this.z;
    const x = e.clientX - this.viewRect.left;
    const y = e.clientY - this.viewRect.top;
    Object.assign(this.cursor.style, { width: d + "px", height: d + "px", transform: `translate(${x - d / 2}px, ${y - d / 2}px)` });
    this.cursor.hidden = false;
  }

  startPan(e) {
    this.action = { kind: "pan", id: e.pointerId, x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty };
  }

  wheel(e) {
    e.preventDefault();
    const r = this.view.getBoundingClientRect();
    if (e.ctrlKey) {
      this.zoomAt(e.clientX - r.left, e.clientY - r.top, this.z * Math.exp(-e.deltaY * 0.01));
    } else {
      this.tx -= e.deltaX;
      this.ty -= e.deltaY;
      this.apply();
    }
  }

  pick(e) {
    const { x, y } = this.toBoard(e.clientX, e.clientY);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    for (const name of [...LAYERS].reverse()) {
      if (!this.layerState[name].visible) continue;
      const d = this.ctx[name].getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      if (d[3] > 16) {
        this.hooks.onPick("#" + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join(""));
        return;
      }
    }
  }

  // ---------- strokes ----------

  startStroke(e) {
    this.cursor.hidden = true;
    const { def, size, color } = this.tool;
    const eraser = def.id === "eraser";
    const name = eraser ? this.activeLayer : def.layer;
    if (!eraser && name !== this.activeLayer) this.setActive(name);
    const st = this.layerState[name];
    if (!st.visible) {
      st.visible = true;
      this.applyLayerState(name);
      this.hooks.onActive?.(name);
    }
    this.history.begin(this.layers[name], name);

    const ctx = eraser ? this.ctx[name] : this.strokeCtx;
    if (!eraser) {
      this.layers[name].after(this.strokeCanvas);
      this.strokeCanvas.style.opacity = def.alpha * st.opacity;
      this.predictCanvas.style.opacity = def.alpha * st.opacity;
    }
    for (const c of [ctx, this.predictCtx]) {
      c.save();
      c.lineCap = "round";
      c.lineJoin = "round";
      c.strokeStyle = c.fillStyle = eraser ? "#000" : color;
    }
    if (eraser) ctx.globalCompositeOperation = "destination-out";

    this.action = {
      kind: "stroke", id: e.pointerId, type: e.pointerType, def, size, name, ctx, eraser,
      last: null, lastW: 0, speed: 0, first: null,
      straight: this.straight || e.shiftKey,
      box: [Infinity, Infinity, -Infinity, -Infinity], pbox: null,
    };
    this.addSample(e, false);
    note(`  stroke started: ${def.id} on ${name}`);
  }

  continueStroke(e) {
    const list = HAS_COALESCED ? e.getCoalescedEvents() : [];
    for (const c of list.length ? list : [e]) this.addSample(c, true, e);
    this.predict(e);
  }

  addSample(src, moving, parent = null) {
    const a = this.action;
    const s = readSample(src, a.type, (x, y) => this.toBoard(x, y), parent);
    if (moving && a.type === "pen") notePressure(src.pressure);
    if (a.last) {
      const dt = Math.max(2, s.time - a.last.time);
      a.speed = a.speed * 0.7 + (Math.hypot(s.x - a.last.x, s.y - a.last.y) / dt) * 0.3;
    }
    const w = widthFor(a.def, a.size, s, a.speed);
    this.grow(a.box, s, reach(a.def, w));

    if (a.straight) {
      if (!a.first) a.first = { s, w };
      this.drawStraight(s);
    } else if (a.last) {
      drawSegment(a.ctx, a.def, a.last, s, a.lastW, w);
    } else {
      drawDot(a.ctx, a.def, s, w);
    }
    a.last = s;
    a.lastW = w;
  }

  drawStraight(s) {
    const a = this.action;
    const { s: f, w } = a.first;
    if (a.eraser) {
      // Put the layer back as it was, then erase along the new line.
      a.ctx.save();
      a.ctx.globalCompositeOperation = "copy";
      a.ctx.drawImage(this.history.before, 0, 0);
      a.ctx.restore();
    } else {
      a.ctx.clearRect(0, 0, this.w, this.h);
    }
    drawDot(a.ctx, a.def, f, w);
    drawSegment(a.ctx, a.def, f, s, w, w);
  }

  // Safari's guess at where the Pencil is going, drawn ahead of the real line to hide lag.
  predict(e) {
    const a = this.action;
    if (a.pbox) {
      const [x0, y0, x1, y1] = a.pbox;
      this.predictCtx.clearRect(x0, y0, x1 - x0, y1 - y0);
      a.pbox = null;
    }
    if (!HAS_PREDICTED || a.straight || a.eraser) return;
    const points = e.getPredictedEvents();
    if (!points.length) return;
    a.pbox = [Infinity, Infinity, -Infinity, -Infinity];
    let prev = a.last;
    let pw = a.lastW;
    for (const p of points) {
      const s = readSample(p, a.type, (x, y) => this.toBoard(x, y), e);
      const w = widthFor(a.def, a.size, s, a.speed);
      drawSegment(this.predictCtx, a.def, prev, s, pw, w);
      this.grow(a.pbox, s, reach(a.def, w));
      this.grow(a.pbox, prev, reach(a.def, pw));
      prev = s;
      pw = w;
    }
  }

  endStroke() {
    const a = this.action;
    this.predictCtx.restore();
    this.predictCtx.clearRect(0, 0, this.w, this.h);
    a.ctx.restore();
    if (!a.eraser) {
      const ctx = this.ctx[a.name];
      ctx.save();
      ctx.globalAlpha = a.def.alpha;
      ctx.drawImage(this.strokeCanvas, 0, 0);
      ctx.restore();
      this.strokeCtx.clearRect(0, 0, this.w, this.h);
    }
    if (a.straight && a.first) {
      this.grow(a.box, a.first.s, reach(a.def, a.first.w));
    }
    this.history.commit(a.box);
    this.hooks.onChange(a.name);
    note(`  stroke ended: ${Math.round(a.box[2] - a.box[0])}×${Math.round(a.box[3] - a.box[1])} px`);
  }

  grow(box, s, r) {
    box[0] = Math.min(box[0], s.x - r);
    box[1] = Math.min(box[1], s.y - r);
    box[2] = Math.max(box[2], s.x + r);
    box[3] = Math.max(box[3], s.y + r);
  }

  // ---------- move / scale a layer ----------

  startMove(e, scale) {
    const name = this.activeLayer;
    this.history.begin(this.layers[name], name);
    this.action = { kind: "move", id: e.pointerId, name, x: e.clientX, y: e.clientY, scale };
  }

  continueMove(e) {
    const a = this.action;
    const dx = (e.clientX - a.x) / this.z;
    const dy = (e.clientY - a.y) / this.z;
    const ctx = this.ctx[a.name];
    ctx.clearRect(0, 0, this.w, this.h);
    if (a.scale) {
      const s = Math.exp((dx - dy) / 400);
      ctx.save();
      ctx.translate(this.w / 2, this.h / 2);
      ctx.scale(s, s);
      ctx.translate(-this.w / 2, -this.h / 2);
      ctx.drawImage(this.history.before, 0, 0);
      ctx.restore();
    } else {
      ctx.drawImage(this.history.before, dx, dy);
    }
  }

  endMove() {
    this.history.commit([0, 0, this.w, this.h]);
    this.hooks.onChange(this.action.name);
  }

  // ---------- fingers: pan, pinch, two-finger tap = undo, three = redo ----------

  touchDown(e) {
    // A hand landing while the Pencil draws, or just after, is a palm.
    if (this.action?.type === "pen" || e.timeStamp - this.lastPen < PALM_GUARD_MS) {
      this.ignored.add(e.pointerId);
      if (!isBigTouch(e)) note("  treated as palm");
      return;
    }
    this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!this.gesture) this.gesture = { start: e.timeStamp, max: 0, moved: false, palm: false, spread: 0 };
    else this.gesture.spread = Math.max(this.gesture.spread, e.timeStamp - this.gesture.start);
    if (Math.max(e.width || 0, e.height || 0) > PALM_SIZE) this.gesture.palm = true;
    this.gesture.max = Math.max(this.gesture.max, this.touches.size);
    this.gestureBase();
  }

  gestureBase() {
    const pts = [...this.touches.values()];
    this.gesture.base = {
      c: centroid(pts),
      d: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0,
      z: this.z, tx: this.tx, ty: this.ty,
    };
  }

  touchMove(e) {
    const t = this.touches.get(e.pointerId);
    const g = this.gesture;
    if (!t || !g) return;
    t.x = e.clientX;
    t.y = e.clientY;
    const b = g.base;
    const pts = [...this.touches.values()];
    const c = centroid(pts);
    if (Math.hypot(c.x - b.c.x, c.y - b.c.y) > 10) g.moved = true;

    if (pts.length >= 2) {
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (Math.abs(d - b.d) > 10) g.moved = true;
      if (!g.moved) return;
      const r = this.viewRect;
      this.z = b.z; this.tx = b.tx; this.ty = b.ty;
      this.zoomAt(b.c.x - r.left, b.c.y - r.top, b.d ? (b.z * d) / b.d : b.z);
      this.tx += c.x - b.c.x;
      this.ty += c.y - b.c.y;
      this.apply();
    } else if (!this.penSeen && g.moved) {
      // Until the Pencil is used, one finger pans; afterwards it takes two.
      this.tx = b.tx + c.x - b.c.x;
      this.ty = b.ty + c.y - b.c.y;
      this.apply();
    }
  }

  touchUp(e) {
    if (this.ignored.delete(e.pointerId)) return;
    if (!this.touches.delete(e.pointerId) || !this.gesture) return;
    const g = this.gesture;
    if (this.touches.size === 0) {
      // Undo/redo only for a clean fingertip tap — never for a hand settling on the glass.
      const tap = !g.moved && !g.palm && g.spread < TAP_SPREAD_MS && e.timeStamp - g.start < TAP_MS && e.timeStamp - this.lastPen > PALM_GUARD_MS;
      if (tap && g.max === 2) { note("  two-finger tap: undo"); this.undo(); }
      else if (tap && g.max >= 3) { note("  three-finger tap: redo"); this.redo(); }
      this.gesture = null;
    } else {
      this.gestureBase();
    }
  }
}

function centroid(pts) {
  const n = pts.length || 1;
  return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n };
}
