const prefix = "kelime-arenasi-shell-";
const cacheName = `${prefix}v1`;
const shell = "/index.html";

async function saveShell(cache, response) {
  const html = await response.clone().text();
  const assets = [...new Set(Array.from(html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g), match => match[1]))];
  await Promise.all(assets.map(async asset => {
    if (!(await cache.match(asset))) await cache.add(asset);
  }));
  await cache.put(shell, response);
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(cacheName);
    const response = await fetch(shell, { cache: "reload" });
    if (!response.ok) throw new Error("Oyun sayfası alınamadı.");
    await saveShell(cache, response);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith(prefix) && key !== cacheName) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

async function navigation(request) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok && response.headers.get("Content-Type")?.includes("text/html")) {
      await saveShell(cache, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    return (await cache.match(shell)) ?? Response.error();
  }
}

async function asset(request) {
  const cache = await caches.open(cacheName);
  const previous = await cache.match(request);
  if (previous) return previous;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone()).catch(() => {});
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return;
  if (request.mode === "navigate") event.respondWith(navigation(request));
  else if (/^\/assets\/[^/]+\.(?:js|css)$/.test(url.pathname)) event.respondWith(asset(request));
});
