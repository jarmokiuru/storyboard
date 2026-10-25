// A location's floor-plan picture (SPEC §8.1, §8.6): bring in a picture, then tap the two inside corners of the
// north wall and type that wall's real length. That one step gives the scale, turns the picture so the wall runs
// west → east, and puts the north-west corner on the room's corner. The plan then shows under the top view.
//
// Stored on the location as plan = { type, w, h (picture px), a, b ([x, y] px: NW and NE inside corners),
// dist (m between them), x, z (m: where the picture's centre sits), rot (° the picture is turned) }.

import { formDialog, toast } from "./ui.js";

const MAX_SIDE = 4096;   // keeps big photos light enough to store and draw

// A picked file → a picture no larger than 4096 px on its long side (PNG stays PNG, the rest become JPEG).
export async function loadPlanPicture(file) {
  if (!/^image\//.test(file.type) && !/\.(png|jpe?g|heic|webp|gif)$/i.test(file.name)) {
    toast("That isn't a picture. For a PDF plan, take a screenshot of it and use that.", 5000);
    return null;
  }
  let img;
  try {
    img = await createImageBitmap(file);
  } catch {
    toast("Couldn't read that picture.", 4000);
    return null;
  }
  const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.round(img.width * k);
  const h = Math.round(img.height * k);
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  const png = file.type === "image/png";
  if (!png) {
    g.fillStyle = "#fff";
    g.fillRect(0, 0, w, h);
  }
  g.drawImage(img, 0, 0, w, h);
  const type = png ? "image/png" : "image/jpeg";
  const blob = await new Promise((resolve) => c.toBlob(resolve, type, 0.9));
  return { blob, w, h, type };
}

// Where the picture sits on the floor once its NW→NE wall is lined up with the room's north wall.
export function placePlan(plan, room) {
  const [ax, ay] = plan.a;
  const [bx, by] = plan.b;
  const s = plan.dist / Math.max(1e-6, Math.hypot(bx - ax, by - ay));   // metres per pixel
  const th = Math.atan2(by - ay, bx - ax);
  // The NW corner, measured from the picture's centre and turned so the wall runs east.
  const lx = (ax - plan.w / 2) * s;
  const lz = (ay - plan.h / 2) * s;
  const rx = lx * Math.cos(th) + lz * Math.sin(th);
  const rz = -lx * Math.sin(th) + lz * Math.cos(th);
  return { ...plan, x: round(-room.w / 2 - rx), z: round(-room.d / 2 - rz), rot: round((th * 180) / Math.PI) };
}

// The picture's size on the floor, in metres.
export const planScale = (plan) => plan.dist / Math.max(1e-6, Math.hypot(plan.b[0] - plan.a[0], plan.b[1] - plan.a[1]));

// Opens the corner-tapping screen. Resolves { plan, w, d } (the sizes to give the room, if asked) or null.
export async function calibratePlan(picture, room, old = null) {
  const marks = await pickCorners(picture, old?.w === picture.w && old?.h === picture.h ? [old.a, old.b] : []);
  if (!marks) return null;
  const v = await formDialog("Plan scale", [
    { type: "note", label: "The distance between the two corners you tapped is the north wall's inside length." },
    { name: "dist", label: "North wall, inside length (m)", value: old?.dist ?? room.w },
    { name: "d", label: "Room depth, north–south (m) — read it off the plan", value: room.d },
    { name: "resize", label: "Make the room this size", type: "checkbox", value: true },
  ], { ok: "Use the plan" });
  if (!v) return null;
  const dist = Number(String(v.dist).replace(",", "."));
  const d = Number(String(v.d).replace(",", "."));
  if (!(dist > 0.3 && dist < 200)) {
    toast("That length doesn't look right.");
    return null;
  }
  const size = v.resize ? { w: dist, d: d > 0.5 && d < 200 ? d : room.d } : { w: room.w, d: room.d };
  const plan = placePlan({ type: picture.type, w: picture.w, h: picture.h, a: marks[0], b: marks[1], dist }, { ...room, ...size });
  return { plan, ...(v.resize ? size : {}) };
}

// Full-screen picture: tap the NW corner, then the NE corner; drag a marker to fine-tune; zoom for accuracy.
function pickCorners(picture, start) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(picture.blob);
    const root = document.createElement("div");
    root.className = "plan-cal";
    root.innerHTML = `
      <header>
        <p class="plan-cal-help"></p>
        <span class="sep"></span>
        <button data-zoom="1" class="on">Fit</button><button data-zoom="2">2×</button><button data-zoom="4">4×</button>
        <span class="sep"></span>
        <button data-act="cancel">Cancel</button><button data-act="ok" class="primary" disabled>Next</button>
      </header>
      <div class="plan-cal-view"><div class="plan-cal-sheet"><img alt="Floor plan"><i class="mark a"></i><i class="mark b"></i></div></div>`;
    document.body.append(root);
    const view = root.querySelector(".plan-cal-view");
    const sheet = root.querySelector(".plan-cal-sheet");
    const img = root.querySelector("img");
    const help = root.querySelector(".plan-cal-help");
    const ok = root.querySelector('[data-act="ok"]');
    const markEl = [root.querySelector(".mark.a"), root.querySelector(".mark.b")];
    const marks = start.map((p) => [...p]);
    img.src = url;
    let zoom = 1;
    let k = 1;   // screen px per picture px

    const layout = () => {
      const fit = Math.min(view.clientWidth / picture.w, view.clientHeight / picture.h);
      k = fit * zoom;
      sheet.style.width = picture.w * k + "px";
      sheet.style.height = picture.h * k + "px";
      draw();
    };
    const draw = () => {
      markEl.forEach((m, i) => {
        m.hidden = !marks[i];
        if (marks[i]) {
          m.style.left = marks[i][0] * k + "px";
          m.style.top = marks[i][1] * k + "px";
        }
      });
      ok.disabled = marks.length < 2;
      help.textContent = marks.length === 0
        ? "Tap the inside corner where the north wall meets the west wall (usually top left)."
        : marks.length === 1
          ? "Now tap the inside corner where the north wall meets the east wall (usually top right)."
          : "Drag a marker to fine-tune, zoom in to check, then Next.";
    };
    const at = (e) => {
      const r = sheet.getBoundingClientRect();
      return [clamp((e.clientX - r.left) / k, 0, picture.w), clamp((e.clientY - r.top) / k, 0, picture.h)];
    };

    let drag = null;
    sheet.addEventListener("pointerdown", (e) => {
      const which = markEl.indexOf(e.target);
      drag = { which, x: e.clientX, y: e.clientY, moved: false };
      if (which >= 0) {
        e.preventDefault();
        try { sheet.setPointerCapture(e.pointerId); } catch { /* still works */ }
      }
    });
    sheet.addEventListener("pointermove", (e) => {
      if (!drag) return;
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
      if (drag.which >= 0) {
        marks[drag.which] = at(e);
        draw();
      }
    });
    sheet.addEventListener("pointerup", (e) => {
      // A tap (not a scroll) places the next corner.
      if (drag && drag.which < 0 && !drag.moved && marks.length < 2) {
        marks.push(at(e));
        draw();
      }
      drag = null;
    });
    root.querySelectorAll("[data-zoom]").forEach((b) => (b.onclick = () => {
      // Keep the middle of the view in the middle while zooming.
      const cx = (view.scrollLeft + view.clientWidth / 2) / k;
      const cy = (view.scrollTop + view.clientHeight / 2) / k;
      zoom = Number(b.dataset.zoom);
      root.querySelectorAll("[data-zoom]").forEach((x) => x.classList.toggle("on", x === b));
      layout();
      view.scrollLeft = cx * k - view.clientWidth / 2;
      view.scrollTop = cy * k - view.clientHeight / 2;
    }));
    const finish = (v) => {
      window.removeEventListener("resize", layout);
      root.remove();
      URL.revokeObjectURL(url);
      resolve(v);
    };
    root.querySelector('[data-act="cancel"]').onclick = () => finish(null);
    ok.onclick = () => finish(marks.map((p) => p.map((n) => Math.round(n * 10) / 10)));
    window.addEventListener("resize", layout);
    img.onload = layout;
    requestAnimationFrame(layout);
  });
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v) => Math.round(v * 1000) / 1000;
