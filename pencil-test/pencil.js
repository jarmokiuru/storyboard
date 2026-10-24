// Pencil test page (SPEC §9 phase 1): pressure, tilt, palm rejection, latency.

const VERSION = "0.1.1";

const $ = (id) => document.getElementById(id);
const ink = $("ink");
const overlay = $("overlay");
const inkCtx = ink.getContext("2d");
const overCtx = overlay.getContext("2d");
const graph = $("graph");
const graphCtx = graph.getContext("2d");

const LINE = "#2a2a2e";
const BASE_WIDTH = 6;          // CSS pixels at full pressure, pencil tool
const SHADE_WIDTH = 10;        // CSS pixels, shading tool lead width when upright

let scale = 2;                 // canvas pixels per CSS pixel, at least 2 for print
let tool = "pencil";
let predict = false;
let penSeen = false;
let rejected = 0;

let active = null;             // the stroke being drawn: { id, type, last, start, samples, pressures }
const session = {
  pMin: Infinity, pMax: -Infinity,
  tMin: Infinity, tMax: -Infinity,
  rate: null, delays: [],
};

const support = {
  coalesced: "getCoalescedEvents" in PointerEvent.prototype,
  predicted: "getPredictedEvents" in PointerEvent.prototype,
};

$("version").textContent = "v" + VERSION;

// ---------- canvas size ----------

function fit() {
  const bar = $("bar").getBoundingClientRect().height;
  document.documentElement.style.setProperty("--bar-height", bar + "px");
  const rect = $("stage").getBoundingClientRect();
  scale = Math.max(2, window.devicePixelRatio || 1);
  const w = Math.round(rect.width * scale);
  const h = Math.round(rect.height * scale);
  if (ink.width === w && ink.height === h) return;

  // Keep what's drawn when the iPad rotates.
  const keep = document.createElement("canvas");
  keep.width = ink.width;
  keep.height = ink.height;
  if (keep.width && keep.height) keep.getContext("2d").drawImage(ink, 0, 0);

  for (const c of [ink, overlay]) { c.width = w; c.height = h; }
  if (keep.width && keep.height) inkCtx.drawImage(keep, 0, 0);
}
window.addEventListener("resize", fit);
fit();

// ---------- reading the Pencil ----------

function point(e) {
  const rect = ink.getBoundingClientRect();
  const pressure = e.pressure > 0 ? e.pressure : 0.5;   // mouse and some fingers report none
  const { altitude, azimuth } = angles(e);
  return {
    x: (e.clientX - rect.left) * scale,
    y: (e.clientY - rect.top) * scale,
    pressure, altitude, azimuth,
  };
}

// Altitude: 90° = upright, 0° = lying flat. Azimuth: direction the Pencil leans.
function angles(e) {
  if (typeof e.altitudeAngle === "number" && e.pointerType === "pen") {
    return { altitude: e.altitudeAngle, azimuth: e.azimuthAngle || 0 };
  }
  const tx = Math.tan(((e.tiltX || 0) * Math.PI) / 180);
  const ty = Math.tan(((e.tiltY || 0) * Math.PI) / 180);
  if (!tx && !ty) return { altitude: Math.PI / 2, azimuth: 0 };
  return { altitude: Math.atan(1 / Math.hypot(tx, ty)), azimuth: Math.atan2(ty, tx) };
}

function samples(e) {
  const list = support.coalesced ? e.getCoalescedEvents() : [];
  return list.length ? list : [e];
}

// ---------- drawing ----------

function drawSegment(ctx, a, b) {
  if (tool === "pencil") {
    ctx.strokeStyle = LINE;
    ctx.lineCap = "round";
    ctx.lineWidth = BASE_WIDTH * scale * (0.1 + 0.9 * (a.pressure + b.pressure) / 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    return;
  }
  // Shading: the lead's footprint stretches into an ellipse as the Pencil tilts over.
  const dist = Math.hypot(b.x - a.x, b.y - a.y);
  const r = (SHADE_WIDTH * scale * (0.3 + 0.7 * b.pressure)) / 2;
  const steps = Math.max(1, Math.ceil(dist / (r * 0.4)));
  ctx.fillStyle = LINE;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const alt = a.altitude + (b.altitude - a.altitude) * t;
    const long = r / Math.max(Math.sin(alt), 0.22);
    ctx.globalAlpha = 0.05 + 0.1 * b.pressure;
    ctx.beginPath();
    ctx.ellipse(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, long, r, b.azimuth, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPrediction(e) {
  overCtx.clearRect(0, 0, overlay.width, overlay.height);
  if (!predict || !support.predicted || !active) return;
  let prev = active.last;
  for (const pe of e.getPredictedEvents()) {
    const p = point(pe);
    drawSegment(overCtx, prev, p);
    prev = p;
  }
}

// ---------- pointer handling ----------

function onDown(e) {
  if (e.pointerType === "pen") {
    if (!penSeen) {
      penSeen = true;
      $("r-palm").textContent = "On (Pencil detected)";
    }
    // A pen landing ends any finger stroke already in progress (likely a palm).
    if (active && active.type === "touch") active = null;
  }
  if (e.pointerType === "touch" && penSeen) {
    rejected++;
    $("r-rejected").textContent = rejected;
    return;
  }
  if (active) return;

  try { ink.setPointerCapture(e.pointerId); } catch { /* stroke still draws without capture */ }
  const p = point(e);
  active = { id: e.pointerId, type: e.pointerType, last: p, start: e.timeStamp, samples: 1, pressures: [p.pressure] };
  drawSegment(inkCtx, p, p);
  read(e, p);
}

function onMove(e) {
  if (!active || e.pointerId !== active.id) return;
  noteDelay(e);
  let p;
  for (const s of samples(e)) {
    p = point(s);
    drawSegment(inkCtx, active.last, p);
    active.last = p;
    active.samples++;
    active.pressures.push(p.pressure);
  }
  drawPrediction(e);
  read(e, p);
}

function onUp(e) {
  if (!active || e.pointerId !== active.id) return;
  overCtx.clearRect(0, 0, overlay.width, overlay.height);
  const seconds = (e.timeStamp - active.start) / 1000;
  if (seconds > 0.25 && active.samples > 10) {
    session.rate = Math.round(active.samples / seconds);
    $("r-rate").textContent = session.rate + (active.type === "pen" ? "" : " (" + label(active.type) + ")");
  }
  drawGraph(active.pressures);
  active = null;
}

ink.addEventListener("pointerdown", onDown);
ink.addEventListener("pointermove", onMove);
ink.addEventListener("pointerup", onUp);
ink.addEventListener("pointercancel", onUp);

// Stop Safari's magnifier, text selection and double-tap zoom from stealing the Pencil.
for (const type of ["touchstart", "touchmove", "touchend"]) {
  ink.addEventListener(type, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("gesturestart", (e) => e.preventDefault());

// ---------- readings ----------

function label(type) {
  return { pen: "Apple Pencil", touch: "Finger", mouse: "Mouse / trackpad" }[type] || type;
}

const deg = (rad) => Math.round((rad * 180) / Math.PI);

function read(e, p) {
  $("r-type").textContent = label(e.pointerType);
  if (e.pointerType !== "pen") {
    $("r-pressure").textContent = "not reported";
    $("r-tilt").textContent = $("r-azimuth").textContent = "–";
    return;
  }
  const tilt = 90 - deg(p.altitude);
  $("r-pressure").textContent = p.pressure.toFixed(2);
  $("r-tilt").textContent = tilt + "°";
  $("r-azimuth").textContent = ((deg(p.azimuth) + 360) % 360) + "°";

  session.pMin = Math.min(session.pMin, p.pressure);
  session.pMax = Math.max(session.pMax, p.pressure);
  session.tMin = Math.min(session.tMin, tilt);
  session.tMax = Math.max(session.tMax, tilt);
  $("r-prange").textContent = session.pMin.toFixed(2) + " – " + session.pMax.toFixed(2);
  $("r-trange").textContent = session.tMin + "° – " + session.tMax + "°";
}

// Time from the screen registering the touch to this page receiving it.
// It does not include the time to light the pixels, so the real lag is longer.
function noteDelay(e) {
  const ms = performance.now() - e.timeStamp;
  if (ms < 0 || ms > 500) return;
  session.delays.push(ms);
  if (session.delays.length > 120) session.delays.shift();
  const avg = session.delays.reduce((a, b) => a + b, 0) / session.delays.length;
  $("r-delay").textContent = avg.toFixed(1) + " ms";
}

function drawGraph(values) {
  const w = graph.width, h = graph.height;
  graphCtx.clearRect(0, 0, w, h);
  if (values.length < 2) return;
  graphCtx.strokeStyle = "#e8e6e1";
  graphCtx.lineWidth = 2;
  graphCtx.beginPath();
  values.forEach((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - v * (h - 4) - 2;
    i ? graphCtx.lineTo(x, y) : graphCtx.moveTo(x, y);
  });
  graphCtx.stroke();
}

const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
$("r-mode").textContent = standalone ? "Home-screen app" : "Safari tab";
$("r-coalesced").textContent = support.coalesced ? "Yes" : "No";
$("r-predicted").textContent = support.predicted ? "Available" : "Not available";

async function checkStorage() {
  if (!navigator.storage || !navigator.storage.persist) {
    $("r-storage").textContent = "Can't ask";
    return;
  }
  const kept = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  $("r-storage").textContent = kept ? "Yes" : "Not promised";
}
checkStorage();

// ---------- buttons ----------

document.querySelectorAll("[data-tool]").forEach((b) => {
  b.addEventListener("click", () => {
    tool = b.dataset.tool;
    document.querySelectorAll("[data-tool]").forEach((x) => x.classList.toggle("on", x === b));
  });
});

$("predict").addEventListener("click", () => {
  if (!support.predicted) return toast("This browser doesn't offer prediction");
  predict = !predict;
  $("predict").textContent = "Prediction: " + (predict ? "on" : "off");
  $("predict").classList.toggle("on", predict);
});

$("clear").addEventListener("click", () => inkCtx.clearRect(0, 0, ink.width, ink.height));

$("info").addEventListener("click", () => {
  $("panel").hidden = !$("panel").hidden;
  $("info").classList.toggle("on", !$("panel").hidden);
});

$("copy").addEventListener("click", async () => {
  const lines = [`Pencil test v${VERSION}`, new Date().toISOString().slice(0, 16).replace("T", " ")];
  document.querySelectorAll("#panel dt").forEach((dt) => lines.push(`${dt.textContent}: ${dt.nextElementSibling.textContent}`));
  lines.push("Browser: " + navigator.userAgent);
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    toast("Copied — paste it into the chat");
  } catch {
    toast("Couldn't copy here");
  }
});

let toastTimer;
function toast(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 2500);
}

// ---------- offline copy and updates ----------

async function setupOffline() {
  if (!("serviceWorker" in navigator)) {
    $("r-offline").textContent = "Not supported";
    return;
  }
  try {
    const reg = await navigator.serviceWorker.register("sw.js");
    await navigator.serviceWorker.ready;
    $("r-offline").textContent = "Saved";
    const offer = (worker) => {
      $("update").hidden = false;
      $("reload").onclick = () => worker.postMessage("activate");
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener("updatefound", () => {
      const worker = reg.installing;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker);
      });
    });
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
  } catch {
    $("r-offline").textContent = "Failed";
  }
}
setupOffline();
