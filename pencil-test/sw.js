// Keeps a copy of the pencil test on the device so it opens with no signal.
// Change VERSION with every release so the new files replace the old copy.

const VERSION = "0.1.1";
const CACHE = "pencil-test-" + VERSION;
const FILES = ["./", "index.html", "style.css", "pencil.js", "manifest.webmanifest", "icon-180.png", "icon-512.png"];

self.addEventListener("install", (e) => {
  // "reload" skips Safari's own short-term copies (GitHub Pages lets it keep files 10 minutes),
  // so a new version is never built from the previous version's files.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((f) => new Request(f, { cache: "reload" })))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("pencil-test-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "activate") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});
