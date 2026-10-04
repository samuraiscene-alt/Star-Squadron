const CACHE = "star-squadron-v26";
const FILES = ["./index.html", "./cinema.js?v=18", "./media/base-v18.jpg", "./media/launch-v18.mp4", "./media/ending-v18.mp4", "./audio-unlock-v16.wav", "./style.css?v=18", "./game.js?v=26", "./manifest.webmanifest?v=15", "./icons/apple-touch-icon-v15.png", "./icons/icon-192-v15.png", "./icons/icon-512-v15.png"];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith("star-squadron-") && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.status === 200) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy)));
    }
    return response;
  }).catch(async () => {
    const cached = await caches.match(event.request);
    if (cached) {
      const range = event.request.headers.get("Range");
      if (range && new URL(event.request.url).pathname.endsWith(".mp4")) {
        const bytes = await cached.arrayBuffer();
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match || (!match[1] && !match[2])) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.byteLength}` } });
        const start = match[1] ? Number(match[1]) : Math.max(0, bytes.byteLength - Number(match[2]));
        const end = match[1] && match[2] ? Math.min(Number(match[2]), bytes.byteLength - 1) : bytes.byteLength - 1;
        if (start > end || start >= bytes.byteLength) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.byteLength}` } });
        return new Response(bytes.slice(start, end + 1), { status: 206, headers: {
          "Content-Type": "video/mp4", "Accept-Ranges": "bytes",
          "Content-Range": `bytes ${start}-${end}/${bytes.byteLength}`, "Content-Length": String(end - start + 1)
        } });
      }
      return cached;
    }
    if (event.request.mode === "navigate") {
      const page = await caches.match("./index.html");
      if (page) return page;
    }
    return Response.error();
  }));
});
