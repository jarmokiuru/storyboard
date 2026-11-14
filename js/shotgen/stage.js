// The Shot Generator's 3D view: one WebGL canvas showing the shot camera, the top (plan) view or a free
// orbit view, with a small inset of the other view. Draws only when something changes. SPEC §8.4–8.5.

import * as THREE from "three";
import { buildSet, LAYER_CAMERA_ONLY, LAYER_PLAN } from "./set.js";
import { LAYER_HANDLES } from "./things.js";
import { verticalAov, horizontalAov } from "./sensors.js";
import { planScale } from "../plan-calibrate.js";
import { drawOutlines } from "./outline.js";

const BG = 0x1d1f23;
const SKY = 0xcfd3d8;
// Starting light (as built in v0.11.0): sun from the south-east, 45° up; strengths in % of the original look.
export const LIGHT = { dir: 125, height: 45, sun: 50, fill: 50, outside: 83, diffusion: 0, walls: false };
const FRUSTUM_LENGTH = 3.5;   // metres drawn in the top view

export const rad = (d) => (d * Math.PI) / 180;

export class Stage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.autoClear = false;
    // The 2017 MacBook Pro's graphics are weak: draw it at normal resolution there.
    const mac = /Macintosh/.test(navigator.userAgent) && !("ontouchend" in document);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mac ? 1 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;   // three.js 0.186 dropped PCFSoftShadowMap; softness = shadow.radius
    this.shadowSize = mac ? 1024 : 2048;

    this.scene = new THREE.Scene();
    this.fill = new THREE.HemisphereLight(0xffffff, 0x6a6a6a, 1.15);
    this.scene.add(this.fill);
    // The sun (SPEC §8.5): a direction on the plan and a height, casting shadows from figures and furniture.
    // Walls don't cast, so the direction always reads on the people, inside or out.
    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(this.shadowSize, this.shadowSize);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);
    this.sunArrow = new THREE.Group();
    this.scene.add(this.sunArrow);
    this.light = { ...LIGHT };
    this.shading = "clay";   // or "outline": black edge lines on figures and furniture in the lens view
    this.sky = new THREE.Color(SKY);

    this.shotCam = new THREE.PerspectiveCamera(40, 2.39, 0.05, 500);
    this.shotCam.rotation.order = "YXZ";
    this.shotCam.layers.enable(LAYER_CAMERA_ONLY);
    this.shotCam.layers.enable(LAYER_HANDLES);

    this.topCam = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);
    this.topCam.up.set(0, 0, -1);   // north up
    this.topCam.layers.enable(LAYER_PLAN);
    this.top = { cx: 0, cz: 0, span: 8 };

    this.orbitCam = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    this.orbitCam.layers.enable(LAYER_PLAN);
    this.orbitCam.layers.enable(LAYER_HANDLES);
    this.orbit = { r: 9, theta: rad(35), phi: rad(55), target: new THREE.Vector3(0, 1, 0) };

    this.body = this.cameraBody();
    this.scene.add(this.body);

    this.view = "camera";
    this.ratio = 2.39;
    this.frame = null;
    // The canvas can change size without the window changing (the panel settling after opening, Focus,
    // the on-screen keyboard): re-measure whenever it does, or the picture is drawn stretched.
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(canvas);
  }

  // ---------- content ----------

  setSet(room) {
    if (this.set) {
      this.scene.remove(this.set);
      this.set.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    }
    this.set = buildSet(room);
    this.scene.add(this.set);
    this.room = room;
    this.setLight(this.light);
    const span = room.exterior ? 16 : Math.max(room.w, room.d) + 2;
    this.top = { cx: 0, cz: room.exterior ? 2 : 0, span };
    this.orbit.r = room.exterior ? 14 : Math.max(room.w, room.d) * 1.6;
    this.request();
  }

  // light: { dir (° on the plan the sun comes from, 0 = north), height (° above the horizon),
  //          sun, fill, outside (0–100 %: sun strength, ambient fill, brightness of the sky outside),
  //          diffusion (0–100 %: how soft the sun is), walls (true: walls and ceiling block the sun) }.
  setLight(light) {
    this.light = { ...LIGHT, ...light };
    const { dir, height, sun, fill, outside, diffusion, walls } = this.light;
    // Diffusion as an overcast sky: shadow edges spread and fade, and part of the sun's light becomes fill.
    const d = Math.min(1, Math.max(0, diffusion / 100));
    this.sun.intensity = (sun / 50) * 1.9 * (1 - 0.35 * d);
    this.fill.intensity = (fill / 50) * 1.15 + (sun / 50) * 0.4 * d;
    this.sun.shadow.intensity = 1 - 0.35 * d;
    this.sun.shadow.radius = 1 + 9 * d;   // in shadow-map texels: about 1–15 cm of soft edge in a room
    this.set?.traverse((o) => { if (o.userData.blocksSun) o.castShadow = !!walls; });
    this.sky.setHSL(0.58, 0.08, outside / 100, THREE.SRGBColorSpace);
    const a = rad(dir);
    const up = rad(Math.min(90, Math.max(1, height)));
    const flat = { x: Math.sin(a), z: -Math.cos(a) };   // from the room towards the sun
    const room = this.room || { w: 8, d: 8, exterior: true };
    const reach = room.exterior ? 12 : Math.max(room.w, room.d) / 2 + 2;   // what the shadows must cover
    // Low sun throws long shadows: let the shadow box reach further along the ground (up to 4×).
    const reachLong = reach * Math.min(4, 1 / Math.max(0.25, Math.sin(up)));
    const far = reachLong * 3;
    this.sun.position.set(flat.x * far * Math.cos(up), far * Math.sin(up), flat.z * far * Math.cos(up));
    this.sun.target.position.set(0, 0, 0);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -reachLong;
    cam.right = cam.top = reachLong;
    cam.near = 0.5;
    cam.far = far * 2;
    cam.updateProjectionMatrix();

    // A yellow arrow outside the room in the top view, pointing the way the light travels.
    this.sunArrow.clear();
    const start = new THREE.Vector3(flat.x * (reach + 0.6), (room.exterior ? 0 : room.h) + 0.05, flat.z * (reach + 0.6));
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(-flat.x, 0, -flat.z), start, 1.4, 0xe8a33d, 0.45, 0.3);
    arrow.traverse((o) => o.layers.set(LAYER_PLAN));
    this.sunArrow.add(arrow);
    this.request();
  }

  // Outline shading: edge lines on figures and furniture only (the room has its own edge lines).
  outlines() {
    if (this.shading !== "outline") return;
    drawOutlines(this.renderer, this.scene, this.shotCam, [this.set, this.things?.handles].filter(Boolean));
  }

  setShading(mode) {
    this.shading = mode === "outline" ? "outline" : "clay";
    this.request();
  }

  // The location's floor-plan picture on the floor, seen in the top and orbit views only (never in the saved frame).
  async setPlan(plan, blob) {
    const token = (this.planToken = (this.planToken || 0) + 1);
    if (this.planMesh) {
      this.scene.remove(this.planMesh);
      this.planMesh.geometry.dispose();
      this.planMesh.material.map?.dispose();
      this.planMesh.material.dispose();
      this.planMesh = null;
      this.request();
    }
    if (!plan || !blob) return;
    const url = URL.createObjectURL(blob);
    let map;
    try {
      map = await new THREE.TextureLoader().loadAsync(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    if (token !== this.planToken) return map.dispose();   // a newer plan arrived meanwhile
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const s = planScale(plan);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(plan.w * s, plan.h * s),
      new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    // Lying flat with the picture's top to the north, then turned and moved as the corners were lined up.
    mesh.geometry.rotateX(-Math.PI / 2);
    mesh.rotation.y = rad(plan.rot);
    mesh.position.set(plan.x, 0.004, plan.z);
    mesh.layers.set(LAYER_PLAN);
    this.planMesh = mesh;
    this.scene.add(mesh);
    this.request();
  }

  // shot: { x, z, height (cm), pan, tilt, roll (degrees), focal (mm) }
  setShot(shot, sensor, ratio) {
    this.ratio = ratio;
    const c = this.shotCam;
    c.position.set(shot.x, shot.height / 100, shot.z);
    c.rotation.set(rad(shot.tilt), -rad(shot.pan), -rad(shot.roll));
    c.fov = verticalAov(sensor, ratio, shot.focal);
    c.aspect = ratio;
    c.updateProjectionMatrix();
    this.hfov = horizontalAov(sensor, ratio, shot.focal);
    this.body.position.copy(c.position);
    this.body.rotation.copy(c.rotation);
    this.updateFrustum();
    this.request();
  }

  // A small camera with its field of view drawn out, seen only in the top and orbit views.
  cameraBody() {
    const g = new THREE.Group();
    const dark = new THREE.MeshLambertMaterial({ color: 0x2a2c30 });
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.18, 0.3), dark);
    box.position.z = 0.12;
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 16), dark);
    lens.rotation.x = Math.PI / 2;
    lens.position.z = -0.08;
    this.frustum = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf0b429 }));
    g.add(box, lens, this.frustum);
    g.traverse((o) => o.layers.set(LAYER_PLAN));
    return g;
  }

  updateFrustum() {
    const c = this.shotCam;
    const y = Math.tan(rad(c.fov / 2)) * FRUSTUM_LENGTH;
    const x = y * c.aspect;
    const L = -FRUSTUM_LENGTH;
    const corners = [[-x, -y], [x, -y], [x, y], [-x, y]].map(([a, b]) => new THREE.Vector3(a, b, L));
    const pts = [];
    for (let i = 0; i < 4; i++) pts.push(new THREE.Vector3(), corners[i], corners[i], corners[(i + 1) % 4]);
    this.frustum.geometry.dispose();
    this.frustum.geometry = new THREE.BufferGeometry().setFromPoints(pts);
  }

  // ---------- drawing ----------

  request() {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
    });
  }

  resize() {
    this.renderer.setSize(Math.max(1, this.canvas.clientWidth), Math.max(1, this.canvas.clientHeight), false);
    this.request();
  }

  // Rectangles in CSS pixels from the top-left of the canvas.
  layout() {
    const W = this.canvas.clientWidth;
    const H = this.canvas.clientHeight;
    const fit = (w, h, ratio, pad) => {
      const s = Math.min((w - pad * 2) / ratio, h - pad * 2);
      return { x: (w - s * ratio) / 2, y: (h - s) / 2, w: s * ratio, h: s };
    };
    const main = this.view === "camera" ? fit(W, H, this.ratio, 12) : { x: 0, y: 0, w: W, h: H };
    const iw = Math.min(W * 0.3, 320);
    const ih = this.view === "camera" ? iw * 0.8 : iw / this.ratio;
    const inset = { x: W - iw - 12, y: H - ih - 12, w: iw, h: ih };
    return { W, H, main, inset };
  }

  render() {
    // Last guard against a stretched picture: the drawing surface must match the canvas's size on screen.
    const size = this.renderer.getSize(new THREE.Vector2());
    if (Math.round(size.x) !== this.canvas.clientWidth || Math.round(size.y) !== this.canvas.clientHeight) {
      this.renderer.setSize(Math.max(1, this.canvas.clientWidth), Math.max(1, this.canvas.clientHeight), false);
    }
    // Frames per second while something keeps changing: frames closer than 1 s apart count as one movement (so a very slow machine still shows a low number).
    const now = performance.now();
    if (this.lastFrame && now - this.lastFrame < 1000) {
      (this.gaps ||= []).push(now - this.lastFrame);
      if (this.gaps.length > 30) this.gaps.shift();
      if (this.gaps.length >= 5) this.fps = Math.round(1000 / (this.gaps.reduce((a, b) => a + b, 0) / this.gaps.length));
    } else this.gaps = [];
    this.lastFrame = now;
    const r = this.renderer;
    const { W, H, main, inset } = this.layout();
    r.setScissorTest(true);
    this.draw(null, { x: 0, y: 0, w: W, h: H }, BG);
    const mainCam = this.view === "camera" ? this.shotCam : this.view === "top" ? this.topCam : this.orbitCam;
    // The outside brightness is what the lens sees; the plan and orbit views keep their usual light grey.
    const behind = (cam) => (cam === this.shotCam ? this.sky : SKY);
    this.draw(mainCam, main, behind(mainCam));
    const insetCam = this.view === "camera" ? this.topCam : this.shotCam;
    this.draw(insetCam, inset, behind(insetCam));
    this.insetRect = inset;
    this.mainRect = main;
    this.onFrame?.();
  }

  draw(cam, rect, clear) {
    const r = this.renderer;
    const H = this.canvas.clientHeight;
    const y = H - rect.y - rect.h;   // WebGL counts from the bottom
    r.setViewport(rect.x, y, rect.w, rect.h);
    r.setScissor(rect.x, y, rect.w, rect.h);
    r.setClearColor(clear);
    r.clear();
    if (!cam) return;
    if (cam === this.topCam) this.aimTop(rect.w / rect.h);
    if (cam === this.orbitCam) this.aimOrbit(rect.w / rect.h);
    r.render(this.scene, cam);
    if (cam === this.shotCam) this.outlines();
  }

  aimTop(aspect) {
    const { cx, cz, span } = this.top;
    const half = span / 2;
    const c = this.topCam;
    c.left = -half * Math.max(1, aspect);
    c.right = half * Math.max(1, aspect);
    c.top = half / Math.min(1, aspect);
    c.bottom = -half / Math.min(1, aspect);
    c.position.set(cx, 50, cz);
    c.lookAt(cx, 0, cz);
    c.updateProjectionMatrix();
  }

  aimOrbit(aspect) {
    const { r, theta, phi, target } = this.orbit;
    const c = this.orbitCam;
    c.aspect = aspect;
    c.position.set(target.x + r * Math.sin(phi) * Math.sin(theta), target.y + r * Math.cos(phi), target.z + r * Math.sin(phi) * Math.cos(theta));
    c.lookAt(target);
    c.updateProjectionMatrix();
  }

  // Plan position (x, z in metres) under a point in the top view. px, py: CSS pixels on the canvas.
  topToGround(px, py, rect) {
    this.aimTop(rect.w / rect.h);   // match the rectangle asked about, not whatever was drawn last
    const c = this.topCam;
    const nx = ((px - rect.x) / rect.w) * 2 - 1;
    const ny = 1 - ((py - rect.y) / rect.h) * 2;
    return { x: this.top.cx + nx * c.right, z: this.top.cz - ny * c.top };
  }

  // Pixels per metre in the top view, for hit-testing.
  topScale(rect) {
    this.aimTop(rect.w / rect.h);
    return rect.w / (this.topCam.right - this.topCam.left);
  }

  // The camera view at a given size, for Save to board. Returns a 2D canvas.
  snapshot(width, height) {
    const r = this.renderer;
    const old = { ratio: r.getPixelRatio(), w: this.canvas.clientWidth, h: this.canvas.clientHeight };
    r.setPixelRatio(1);
    r.setSize(width, height, false);
    r.setScissorTest(false);
    r.setViewport(0, 0, width, height);
    r.setClearColor(this.sky);
    r.clear();
    this.shotCam.aspect = width / height;
    this.shotCam.updateProjectionMatrix();
    this.shotCam.layers.disable(LAYER_HANDLES);   // no joint dots on the board
    r.render(this.scene, this.shotCam);
    this.outlines();
    this.shotCam.layers.enable(LAYER_HANDLES);
    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    out.getContext("2d").drawImage(this.canvas, 0, 0);
    r.setPixelRatio(old.ratio);
    r.setSize(old.w, old.h, false);
    this.shotCam.aspect = this.ratio;
    this.shotCam.updateProjectionMatrix();
    this.request();
    return out;
  }

  dispose() {
    this.renderer.dispose();
  }
}
