// Guide overlays and onion skin (SPEC §6.5).

// g: { grid, center, thirds, horizon, safe, protect }. horizon: 0 = top, 1 = bottom. z: screen pixels per board pixel.
export function drawGuides(ctx, w, h, g, horizon, z) {
  ctx.clearRect(0, 0, w, h);
  const px = 1 / z;   // one screen pixel, in board pixels
  ctx.lineWidth = 1.5 * px;
  const line = (x1, y1, x2, y2) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };

  if (g.grid) {
    ctx.strokeStyle = "rgba(47, 127, 209, 0.3)";
    const step = w / 12;
    for (let x = step; x < w - 1; x += step) line(x, 0, x, h);
    for (let y = step; y < h - 1; y += step) line(0, y, w, y);
  }
  if (g.thirds) {
    ctx.strokeStyle = "rgba(47, 127, 209, 0.75)";
    for (const t of [1 / 3, 2 / 3]) {
      line(w * t, 0, w * t, h);
      line(0, h * t, w, h * t);
    }
  }
  if (g.center) {
    ctx.strokeStyle = "rgba(210, 60, 50, 0.85)";
    const s = 18 * px;
    line(w / 2 - s, h / 2, w / 2 + s, h / 2);
    line(w / 2, h / 2 - s, w / 2, h / 2 + s);
    line(w / 2, 0, w / 2, s);
    line(w / 2, h - s, w / 2, h);
    line(0, h / 2, s, h / 2);
    line(w - s, h / 2, w, h / 2);
  }
  if (g.horizon) {
    ctx.strokeStyle = "rgba(46, 158, 91, 0.9)";
    ctx.setLineDash([10 * px, 6 * px]);
    line(0, h * horizon, w, h * horizon);
    ctx.setLineDash([]);
  }
  if (g.safe) {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    const m = 0.035;   // 93% action safe
    ctx.strokeRect(w * m, h * m, w * (1 - 2 * m), h * (1 - 2 * m));
  }
  if (g.protect) {
    ctx.strokeStyle = "rgba(224, 138, 30, 0.95)";
    const ratio = w / h;
    if (g.protect < ratio - 0.01) {
      const x = (w - h * g.protect) / 2;
      line(x, 0, x, h);
      line(w - x, 0, w - x, h);
    } else if (g.protect > ratio + 0.01) {
      const y = (h - w / g.protect) / 2;
      line(0, y, w, y);
      line(0, h - y, w, h - y);
    }
  }
}

// Previous board tinted blue, next board tinted red, both faint.
export function drawOnion(ctx, prev, next) {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  tinted(ctx, prev, "#2f7fd1");
  tinted(ctx, next, "#d23c32");
}

function tinted(ctx, src, colour) {
  if (!src) return;
  const t = document.createElement("canvas");
  t.width = ctx.canvas.width;
  t.height = ctx.canvas.height;
  const c = t.getContext("2d");
  c.drawImage(src, 0, 0, t.width, t.height);
  c.globalCompositeOperation = "source-atop";
  c.fillStyle = colour;
  c.fillRect(0, 0, t.width, t.height);
  ctx.globalAlpha = 0.3;
  ctx.drawImage(t, 0, 0);
  ctx.globalAlpha = 1;
}
