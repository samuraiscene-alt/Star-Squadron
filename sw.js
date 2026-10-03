const CACHE = "star-squadron-v17";
const FILES = ["./index.html", "./audio-unlock-v16.wav", "./style.css?v=16", "./game.js?v=17", "./manifest.webmanifest?v=15", "./icons/apple-touch-icon-v15.png", "./icons/icon-192-v15.png", "./icons/icon-512-v15.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("star-squadron-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    if (event.request.mode === "navigate") {
      const page = await caches.match("./index.html");
      if (page) return page;
    }
    return Response.error();
  }));
});
