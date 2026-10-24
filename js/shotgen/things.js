// Placed furniture and figures: keeps the 3D copies in step with the saved data, and finds what was tapped.
// Item data (plan metres, degrees, cm):
//   object: { id, kind: "object", model, x, z, rot, w, d, h }
//   figure: { id, kind: "figure", model, name, x, z, rot, height, colour }
// rot 0 = facing south (towards the bottom of the plan), + turns clockwise seen from above.

import * as THREE from "three";
import { byId } from "./catalog.js";
import { makeObject, makeFigure, setFigureHeight } from "./models.js";
import { LAYER_PLAN } from "./set.js";

const SELECT = 0xf0b429;
const rad = (d) => (d * Math.PI) / 180;

export class Things {
  constructor(scene, onChange) {
    this.group = new THREE.Group();
    this.group.name = "things";
    scene.add(this.group);
    this.nodes = new Map();   // id → { holder, model, size, fig, mark, item }
    this.onChange = onChange;
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
    }
    n.item = item;
    this.place(n);
    this.onChange();
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
    holder.position.set(item.x, 0, item.z);
    holder.rotation.y = -rad(item.rot);
    if (!n.size) return;
    if (item.kind === "figure") {
      setFigureHeight(n.fig, item.height);
    } else {
      // New objects take the model's own size; after that the cm values rule.
      if (item.w == null) Object.assign(item, { w: Math.round(n.size.x * 100), d: Math.round(n.size.z * 100), h: Math.round(n.size.y * 100) });
      const model = holder.children[0];
      model.scale.set(item.w / 100 / n.size.x, item.h / 100 / n.size.y, item.d / 100 / n.size.z);
    }
    this.paintSelection(n);
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
