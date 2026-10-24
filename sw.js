// Keeps a copy of the app on the device so it opens with no signal (SPEC §2).
// With every release: change VERSION here and in js/version.js, and list any new file below
// (the list can be rebuilt from the folders: js/, vendor/three/, vendor/models/).

const VERSION = "0.5.4";
const CACHE = "storyboard-" + VERSION;
const FILES = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "icons/icon-180.png",
  "icons/icon-512.png",
  "js/board-store.js",
  "js/board-view.js",
  "js/brush.js",
  "js/contact-sheet.js",
  "js/db.js",
  "js/editor-screen.js",
  "js/guides.js",
  "js/history.js",
  "js/importer.js",
  "js/lens.js",
  "js/main.js",
  "js/model.js",
  "js/offline.js",
  "js/panel.js",
  "js/pdf.js",
  "js/pencil-log.js",
  "js/projectfile.js",
  "js/projects-screen.js",
  "js/script.js",
  "js/shot-sheet.js",
  "js/shotgen/catalog.js",
  "js/shotgen/models.js",
  "js/shotgen/placing.js",
  "js/shotgen/screen.js",
  "js/shotgen/sensors.js",
  "js/shotgen/set.js",
  "js/shotgen/stage.js",
  "js/shotgen/things.js",
  "js/strip.js",
  "js/ui.js",
  "js/version.js",
  "js/xlsx-write.js",
  "js/xlsx.js",
  "js/zip.js",
  "vendor/three/build/three.core.js",
  "vendor/three/build/three.module.js",
  "vendor/three/examples/jsm/loaders/GLTFLoader.js",
  "vendor/three/examples/jsm/utils/BufferGeometryUtils.js",
  "vendor/three/examples/jsm/utils/SkeletonUtils.js",
  "vendor/models/characters/essential/adult-female/adult-female-lod.glb",
  "vendor/models/characters/essential/adult-male/adult-male-lod.glb",
  "vendor/models/characters/essential/baby/baby-lod.glb",
  "vendor/models/characters/essential/child/child-lod.glb",
  "vendor/models/characters/essential/teen-female/teen-female-lod.glb",
  "vendor/models/characters/essential/teen-male/teen-male-lod.glb",
  "vendor/models/objects/essential/bed/bed-full/bed-full.glb",
  "vendor/models/objects/essential/bed/bed-king/bed-king.glb",
  "vendor/models/objects/essential/bed/bed-twin/bed-twin.glb",
  "vendor/models/objects/essential/cabinet/cabinet-bookshelf/cabinet-bookshelf.glb",
  "vendor/models/objects/essential/cabinet/cabinet-dresser-3/cabinet-dresser-3.glb",
  "vendor/models/objects/essential/cabinet/cabinet-dresser-5/cabinet-dresser-5.glb",
  "vendor/models/objects/essential/chair/chair-bar/chair-bar.glb",
  "vendor/models/objects/essential/chair/chair-box/chair-box.glb",
  "vendor/models/objects/essential/chair/chair-modern/chair-modern.glb",
  "vendor/models/objects/essential/chair/chair-office/chair-office.glb",
  "vendor/models/objects/essential/chair/chair-sofa-wide/chair-sofa-wide.glb",
  "vendor/models/objects/essential/chair/chair-sofa/chair-sofa.glb",
  "vendor/models/objects/essential/chair/chair-stool-mini/chair-stool-mini.glb",
  "vendor/models/objects/essential/chair/chair-stool/chair-stool.glb",
  "vendor/models/objects/essential/door/door-double-frame/door-double-frame.glb",
  "vendor/models/objects/essential/door/door-double/door-double.glb",
  "vendor/models/objects/essential/door/door-single-frame/door-single-frame.glb",
  "vendor/models/objects/essential/door/door-single/door-single.glb",
  "vendor/models/objects/essential/primitive/primitive-cylinder-hollow/primitive-cylinder-hollow.glb",
  "vendor/models/objects/essential/primitive/primitive-cylinder/primitive-cylinder.glb",
  "vendor/models/objects/essential/primitive/primitive-pyramid/primitive-pyramid.glb",
  "vendor/models/objects/essential/primitive/primitive-sphere/primitive-sphere.glb",
  "vendor/models/objects/essential/primitive/primitive-wedge/primitive-wedge.glb",
  "vendor/models/objects/essential/stairs/stairs-single-6/stairs-single-6.glb",
  "vendor/models/objects/essential/table/table-bar-circle/table-bar-circle.glb",
  "vendor/models/objects/essential/table/table-bar-rectangle/table-bar-rectangle.glb",
  "vendor/models/objects/essential/table/table-bar/table-bar.glb",
  "vendor/models/objects/essential/table/table-coffee/table-coffee.glb",
  "vendor/models/objects/essential/table/table-counter/table-counter.glb",
  "vendor/models/objects/essential/table/table-nightstand/table-nightstand.glb",
  "vendor/models/objects/essential/table/table-sit-circle/table-sit-circle.glb",
  "vendor/models/objects/essential/table/table-sit-rectangle/table-sit-rectangle.glb",
  "vendor/models/objects/essential/table/table-sit-square/table-sit-square.glb",
  "vendor/models/objects/essential/tree/tree-bushy/tree-bushy.glb",
  "vendor/models/objects/essential/tree/tree-no-leaves/tree-no-leaves.glb",
  "vendor/models/objects/essential/vehicle/vehicle-bicycle-bmx/vehicle-bicycle-bmx.glb",
  "vendor/models/objects/essential/vehicle/vehicle-car/vehicle-car.glb",
];

self.addEventListener("install", (e) => {
  // "reload" skips Safari's own short-term copies (GitHub Pages lets it keep files 10 minutes),
  // so a new version is never built from the previous version's files.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("storyboard-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "activate") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.includes("/pencil-test/")) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
