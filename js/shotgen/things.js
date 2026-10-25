// Placed furniture and figures: keeps the 3D copies in step with the saved data, and finds what was tapped.
// Item data (plan metres, degrees, cm):
//   object: { id, kind: "object", model, x, z, y, rot, w, d, h }
//   figure: { id, kind: "figure", model, name, x, z, y, rot, height, colour, pose, joints, lookAt }
//     pose: a key of POSES (poses.js); joints: { boneName: [x, y, z] degrees }; lookAt: "camera", a figure id, or empty
// y: elevation in cm above the floor (missing = 0).
// rot 0 = facing south (towards the bottom of the plan), + turns clockwise seen from above.

import * as THREE from "three";
import { byId } from "./catalog.js";
import { makeObject, makeFigure, setFigureHeight } from "./models.js";
import { LAYER_PLAN } from "./set.js";
import { applyPose, handlePositions, dragHandle } from "./poses.js";

// Joint dots: seen in the camera and orbit views only (not the plan), and never in Save to board.
export const LAYER_HANDLES = 3;
const DOT = new THREE.SphereGeometry(0.035, 16, 12);
const DOT_COLOURS = { head: 0xffffff, hips: 0x6fb2ff };
const dotMaterial = (key) => new THREE.MeshBasicMaterial({ color: DOT_COLOURS[key] ?? 0xf0b429, depthTest: false, transparent: true, opacity: 0.95 });

const SELECT = 0xf0b429;
const rad = (d) => (d * Math.PI) / 180;

export class Things {
  // onChange: something moved or changed (redraw). onLoaded: a model finished loading (its real size is known).
  constructor(scene, onChange, onLoaded) {
    this.group = new THREE.Group();
    this.group.name = "things";
    scene.add(this.group);
    this.nodes = new Map();   // id → { holder, model, size, fig, mark, item }
    this.onChange = onChange;
    this.onLoaded = onLoaded;
    this.cameraAt = () => null;   // set by the screen: the camera's position, for figures looking into the lens
    this.handles = new THREE.Group();
    this.handles.name = "joint dots";
    scene.add(this.handles);
    this.selectedId = null;
  }

  clear() {
    for (const n of this.nodes.values()) this.group.remove(n.holder);
    this.nodes.clear();
    this.selectedId = null;
  }

  // Add or update one item. Loading a model is the only slow part; placing is instant.
  async put(item) {
    let n = this.nodes.get(item.id);
    if (n && n.mark && item.kind === "figure" && n.labelName !== item.name) {
      // Renamed: redraw the plan label.
      n.holder.remove(n.mark);
      n.mark = this.planMark(item, n.size);
      n.labelName = item.name;
      n.holder.add(n.mark);
    }
    if (!n || n.model !== item.model) {
      if (n) this.group.remove(n.holder);
      const holder = new THREE.Group();
      holder.userData.id = item.id;
      n = { holder, model: item.model, item };
      this.nodes.set(item.id, n);
      this.group.add(holder);
      const entry = byId(item.model);
      const made = item.kind === "figure" ? await makeFigure(entry, item.colour) : await makeObject(entry);
      if (this.nodes.get(item.id) !== n) return;   // removed or replaced while loading
      n.size = made.size;
      n.fig = item.kind === "figure" ? made : null;
      holder.add(made.node);
      n.mark = this.planMark(item, made.size);
      n.labelName = item.name;
      holder.add(n.mark);
      n.item = item;
      this.place(n);
      this.onLoaded?.(item.id);
    }
    n.item = item;
    this.place(n);
    this.refreshLooks(item.id);
    this.onChange();
  }

  // The model's own size in metres (null until loaded).
  sizeOf(id) {
    return this.nodes.get(id)?.size ?? null;
  }

  // Where a figure's eyes should go: the lens, or another figure's eyes.
  lookPoint(item) {
    if (!item.lookAt) return null;
    if (item.lookAt === "camera") return this.cameraAt();
    const other = this.nodes.get(item.lookAt)?.item;
    if (!other) return null;
    return new THREE.Vector3(other.x, (other.y || 0) / 100 + (other.height * 0.93) / 100, other.z);
  }

  // Re-pose figures whose eyes follow something that moved (another figure, or the camera).
  refreshLooks(movedId = null) {
    for (const n of this.nodes.values()) {
      const it = n.item;
      if (it.kind !== "figure" || !it.lookAt || !n.fig || it.id === movedId) continue;
      if (movedId === null || it.lookAt === movedId || it.lookAt === "camera") this.place(n);
    }
  }

  remove(id) {
    const n = this.nodes.get(id);
    if (!n) return;
    this.group.remove(n.holder);
    this.nodes.delete(id);
    if (this.selectedId === id) this.selectedId = null;
    this.onChange();
  }

  place(n) {
    const { item, holder } = n;
    holder.position.set(item.x, (item.y || 0) / 100, item.z);   // y: elevation in cm, 0 = on the floor
    holder.rotation.y = -rad(item.rot);
    if (!n.size) return;
    if (item.kind === "figure") {
      setFigureHeight(n.fig, item.height);
      holder.updateMatrixWorld(true);
      applyPose(n.fig, item, this.lookPoint(item));
    } else {
      // New objects take the model's own size; after that the cm values rule.
      if (item.w == null) Object.assign(item, { w: Math.round(n.size.x * 100), d: Math.round(n.size.z * 100), h: Math.round(n.size.y * 100) });
      const model = holder.children[0];
      model.scale.set(item.w / 100 / n.size.x, item.h / 100 / n.size.y, item.d / 100 / n.size.z);
    }
    this.paintSelection(n);
    if (item.id === this.selectedId) this.showHandles();
  }

  // Seen from above: a footprint outline for objects; a coloured disc with the name's first letter for figures.
  planMark(item, size) {
    const g = new THREE.Group();
    if (item.kind === "figure") {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(0.28, 32), new THREE.MeshBasicMaterial({ color: item.colour, transparent: true, opacity: 0.5 }));
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.01;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.18, 12), new THREE.MeshBasicMaterial({ color: item.colour }));
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 0.02, 0.34);   // points the way the figure faces
      const label = this.label((item.name || "?").slice(0, 2), item.colour);
      label.position.y = 2.4;
      g.add(disc, nose, label);
    } else {
      g.userData.outline = true;
    }
    g.traverse((o) => o.layers.set(LAYER_PLAN));
    return g;
  }

  label(text, colour) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d");
    ctx.fillStyle = colour;
    ctx.beginPath();
    ctx.arc(64, 64, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 64px -apple-system, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 64, 68);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    sprite.scale.set(0.42, 0.42, 1);
    sprite.renderOrder = 10;
    return sprite;
  }

  select(id) {
    this.selectedId = id;
    for (const n of this.nodes.values()) this.paintSelection(n);
    this.showHandles();
    this.onChange();
  }

  // ---------- joint dots (tap-and-drag posing) ----------

  showHandles() {
    this.handles.clear();
    const n = this.nodes.get(this.selectedId);
    if (!n?.fig || n.item.kind !== "figure") return;
    for (const [key, p] of Object.entries(handlePositions(n.fig))) {
      const dot = new THREE.Mesh(DOT, dotMaterial(key));
      dot.position.copy(p);
      dot.renderOrder = 20;
      dot.userData.key = key;
      dot.layers.set(LAYER_HANDLES);
      this.handles.add(dot);
    }
  }

  // The dot nearest a point on screen (px, py in CSS pixels of the canvas), within a fingertip. rect: the view's area.
  hitHandle(px, py, rect, camera) {
    let best = null;
    for (const dot of this.handles.children) {
      const s = dot.position.clone().project(camera);
      if (s.z > 1) continue;   // behind the camera
      const x = rect.x + ((s.x + 1) / 2) * rect.w;
      const y = rect.y + ((1 - s.y) / 2) * rect.h;
      const dist = Math.hypot(x - px, y - py);
      if (dist < 28 && (!best || dist < best.dist)) best = { key: dot.userData.key, dist };
    }
    return best?.key ?? null;
  }

  // What a drag needs to remember from its start.
  // Heights (world metres) of the body landmarks shot sizes cut at, as the figure is posed now.
  landmarks(id) {
    const n = this.nodes.get(id);
    const B = n?.fig?.bones;
    if (!B?.Head) return null;
    n.holder.updateMatrixWorld(true);
    const at = (name) => B[name]?.getWorldPosition(new THREE.Vector3());
    const head = at("Head");
    const top = B.Head.children[0] ? B.Head.children[0].getWorldPosition(new THREE.Vector3()) : head.clone().setY(head.y + 0.2);
    const eyes = B.LeftEye && B.RightEye ? at("LeftEye").lerp(at("RightEye"), 0.5) : head.clone().lerp(top, 0.5);
    const L = Math.max(0.1, top.y - head.y);   // head bone to crown, about two-thirds of the head
    const knees = (at("LeftLeg").y + at("RightLeg").y) / 2;
    const floor = Math.min(...["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"].filter((b) => B[b]).map((b) => at(b).y)) - 0.06;
    return {
      top: top.y, eyes: eyes.y, chin: head.y - 0.3 * L, neck: at("Neck").y, chest: at("Spine2").y,
      waist: at("Spine").y, knees, floor, L,
      head: { x: eyes.x, z: eyes.z }, body: { x: at("Hips").x, z: at("Hips").z },
    };
  }

  dragStart(key) {
    const n = this.nodes.get(this.selectedId);
    const at = this.handles.children.find((d) => d.userData.key === key)?.position.clone();
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(n.holder.getWorldQuaternion(new THREE.Quaternion()));
    return { at, forward, hipsShift: n.item.hipsShift ?? 0 };
  }

  dragTo(key, target, start) {
    const n = this.nodes.get(this.selectedId);
    if (!n?.fig) return;
    dragHandle(n.fig, n.item, key, target, start);
    this.place(n);
    this.refreshLooks(n.item.id);
    this.onChange();
  }

  paintSelection(n) {
    const on = n.item.id === this.selectedId;
    n.holder.children[0]?.traverse((m) => {
      if (m.material?.emissive) m.material.emissive.setHex(on ? 0x5a4410 : 0x000000);
    });
    if (n.mark?.userData.outline) {
      n.mark.clear();
      if (n.size) {
        const w = n.item.w / 100;
        const d = n.item.d / 100;
        const pts = [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([x, z]) => new THREE.Vector3(x, 0.02, z));
        const line = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: on ? SELECT : 0x3a3c40 }));
        line.layers.set(LAYER_PLAN);
        n.mark.add(line);
      }
    }
  }

  // What's under a plan position (top view). tolerance: metres of slack around each footprint.
  hitPlan(x, z, tolerance) {
    let best = null;
    for (const n of this.nodes.values()) {
      const it = n.item;
      const dx = x - it.x;
      const dz = z - it.z;
      let inside;
      if (it.kind === "figure") {
        inside = Math.hypot(dx, dz) < 0.3 + tolerance;
      } else {
        const a = rad(it.rot);   // into the item's own axes
        const lx = dx * Math.cos(a) + dz * Math.sin(a);
        const lz = -dx * Math.sin(a) + dz * Math.cos(a);
        inside = Math.abs(lx) < it.w / 200 + tolerance && Math.abs(lz) < it.d / 200 + tolerance;
      }
      // Figures win over furniture they stand at; smaller things win over bigger ones.
      const rank = it.kind === "figure" ? 0 : (it.w * it.d) / 1e4;
      if (inside && (!best || rank < best.rank)) best = { id: it.id, rank };
    }
    return best?.id ?? null;
  }

  // What's under a point in a perspective view. ndc: -1…1 screen position.
  hitView(ndc, camera) {
    const ray = new THREE.Raycaster();
    ray.layers.set(0);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(this.group.children, true)[0];
    let o = hit?.object;
    while (o && !o.userData.id) o = o.parent;
    return o?.userData.id ?? null;
  }
}
