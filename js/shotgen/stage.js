// The Shot Generator's 3D view: one WebGL canvas showing the shot camera, the top (plan) view or a free
// orbit view, with a small inset of the other view. Draws only when something changes. SPEC §8.4–8.5.

import * as THREE from "three";
import { buildSet, LAYER_CAMERA_ONLY, LAYER_PLAN } from "./set.js";
import { verticalAov, horizontalAov } from "./sensors.js";

const BG = 0x1d1f23;
const SKY = 0xcfd3d8;
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

    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a6a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 6, 2);
    this.scene.add(key);

    this.shotCam = new THREE.PerspectiveCamera(40, 2.39, 0.05, 500);
    this.shotCam.rotation.order = "YXZ";
    this.shotCam.layers.enable(LAYER_CAMERA_ONLY);

    this.topCam = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 200);
    this.topCam.up.set(0, 0, -1);   // north up
    this.topCam.layers.enable(LAYER_PLAN);
    this.top = { cx: 0, cz: 0, span: 8 };

    this.orbitCam = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
    this.orbitCam.layers.enable(LAYER_PLAN);
    this.orbit = { r: 9, theta: rad(35), phi: rad(55), target: new THREE.Vector3(0, 1, 0) };

    this.body = this.cameraBody();
    this.scene.add(this.body);

    this.view = "camera";
    this.ratio = 2.39;
    this.frame = null;
  }

  // ---------- content ----------

  setSet(room) {
    if (this.set) {
      this.scene.remove(this.set);
      this.set.traverse((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
    }
    this.set = buildSet(room);
    this.scene.add(this.set);
    const span = room.exterior ? 16 : Math.max(room.w, room.d) + 2;
    this.top = { cx: 0, cz: room.exterior ? 2 : 0, span };
    this.orbit.r = room.exterior ? 14 : Math.max(room.w, room.d) * 1.6;
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
    const r = this.canvas.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
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
    const r = this.renderer;
    const { W, H, main, inset } = this.layout();
    r.setScissorTest(true);
    this.draw(null, { x: 0, y: 0, w: W, h: H }, BG);
    const mainCam = this.view === "camera" ? this.shotCam : this.view === "top" ? this.topCam : this.orbitCam;
    this.draw(mainCam, main, SKY);
    this.draw(this.view === "camera" ? this.topCam : this.shotCam, inset, SKY);
    this.insetRect = inset;
    this.mainRect = main;
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
    r.setClearColor(SKY);
    r.clear();
    this.shotCam.aspect = width / height;
    this.shotCam.updateProjectionMatrix();
    r.render(this.scene, this.shotCam);
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
