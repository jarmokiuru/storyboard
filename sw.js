// Keeps a copy of the app on the device so it opens with no signal (SPEC §2).
// With every release: change VERSION here and in js/version.js, and list any new file below.

const VERSION = "0.3.3";
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
  "js/contact-sheet.js",
  "js/brush.js",
  "js/db.js",
  "js/editor-screen.js",
  "js/guides.js",
  "js/history.js",
  "js/importer.js",
  "js/main.js",
  "js/model.js",
  "js/offline.js",
  "js/panel.js",
  "js/pencil-log.js",
  "js/pdf.js",
  "js/projectfile.js",
  "js/projects-screen.js",
  "js/script.js",
  "js/strip.js",
  "js/ui.js",
  "js/version.js",
  "js/xlsx.js",
  "js/zip.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
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
