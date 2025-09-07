// Dziennik Tarota — Service Worker (offline + cache)
const CACHE = "tarot-v3.2.3";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-1024.png",
  "./apple-touch-icon-180.png"
];

// Instalacja – precache
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Aktywacja – sprzątanie starych cache
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k.startsWith("tarot-") && k !== CACHE)
        .map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Strategia: 
// - nawigacje → sieć, a w razie braku offline fallback do index.html
// - assety statyczne → cache-first
self.addEventListener("fetch", (e) => {
  const req = e.request;

  // 1) Nawigacja (przejścia między stronami)
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("./index.html"))
    );
    return;
  }

  // 2) Statyka (css/js/ico/png/webmanifest)
  if (/\.(css|js|png|ico|webmanifest)$/.test(new URL(req.url).pathname)) {
    e.respondWith(
      caches.match(req).then((hit) =>
        hit ||
        fetch(req).then((res) => {
          const resClone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, resClone));
          return res;
        })
      )
    );
  }
  // reszta – default (przepuść do sieci)
});