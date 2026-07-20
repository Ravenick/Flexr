const CACHE = "flexr-v2";
const ASSETS = [
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./logo-mark.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Cache-first for our own shell. Everything else (fonts/libs loaded once) falls back to network
// only if not already cached. Flexr's core never needs the network to run.
self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).catch(() => cached))
  );
});
