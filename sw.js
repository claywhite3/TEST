/* Engage Companion service worker — opens instantly and works offline.
   Everything the app needs is cached on install. Pushing content and live status still need a connection.
   VERSIONING: bump VERSION together with BUILD in js/core.js and the ?v= tags (one rule, one bump).
   ASSETS: keep in step with the files in the repo; an asset missing here still works online but not offline. */
const VERSION = "v0.6.1";
const CACHE = "engage-companion-" + VERSION;
const ASSETS = [
  "./",
  "assets/content/coke-santa.jpg",
  "assets/content/powerade.jpg",
  "assets/content/pumpkin.jpg",
  "assets/content/tomato.jpg",
  "assets/products/bananas.png",
  "assets/products/hass-avocados.png",
  "assets/products/navel-oranges.png",
  "assets/products/pie-pumpkins.png",
  "assets/products/red-delicious-apples.png",
  "assets/products/tomatoes-on-vine.png",
  "battery.html",
  "content.html",
  "css/app.css",
  "fonts/figtree-400.woff2",
  "fonts/figtree-500.woff2",
  "fonts/figtree-600.woff2",
  "fonts/figtree-700.woff2",
  "fonts/figtree-800.woff2",
  "fonts/jetbrains-mono-500.woff2",
  "fonts/jetbrains-mono-700.woff2",
  "fonts/sign-price-bold.woff",
  "fonts/sign-price-regular.woff",
  "home.html",
  "icons/apple-touch-icon.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "index.html",
  "install.html",
  "js/art.js",
  "js/battery.js",
  "js/content.js",
  "js/core.js",
  "js/home.js",
  "js/install.js",
  "js/login.js",
  "js/placeholder.js",
  "js/plu.js",
  "js/preview.js",
  "js/sign.js",
  "js/site.js",
  "lib/zxing.min.js",
  "login.html",
  "manifest.webmanifest",
  "site.html",
  "troubleshoot.html"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith("engage-companion-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

/* the page asks the waiting worker to take over when the tech taps "Reload" */
self.addEventListener("message", (e) => { if (e.data === "skip-waiting") self.skipWaiting(); });

/* cache first for the app's own files (the ?v= tag is ignored: the cache itself is versioned) */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  })));
});
