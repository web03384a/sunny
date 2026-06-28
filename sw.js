const CACHE_PREFIX = "sunny-";
const SHELL_CACHE = `${CACHE_PREFIX}shell-v10`;
const RUNTIME_CACHE = `${CACHE_PREFIX}runtime-v10`;
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./theme-init.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable.svg",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png"
];
const SHELL_URLS = new Set(ASSETS.map(path => new URL(path, self.location.href).href));
const INDEX_URL = new URL("./index.html", self.location.href).href;
const FONT_ORIGINS = new Set(["https://fonts.googleapis.com", "https://fonts.gstatic.com"]);

self.addEventListener("install", event => {
  event.waitUntil(caches.open(SHELL_CACHE).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith(CACHE_PREFIX) && ![SHELL_CACHE, RUNTIME_CACHE].includes(key))
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

async function isSafeResponse(request, response) {
  if (!response || !response.ok || response.redirected) return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return FONT_ORIGINS.has(url.origin) && response.type === "opaque";

  const contentType = response.headers.get("content-type") || "";
  if (request.mode === "navigate" || request.destination === "document") {
    const html = await response.clone().text();
    return contentType.includes("text/html") && html.includes('id="app-screen"') && html.includes("./app.js");
  }
  if (request.destination === "script") return /javascript|ecmascript/.test(contentType);
  if (request.destination === "style") return contentType.includes("text/css");
  if (request.destination === "image") return contentType.startsWith("image/");
  if (url.pathname.endsWith(".webmanifest")) return /manifest\+json|application\/json/.test(contentType);
  return true;
}

async function refreshShell(request, cacheKey) {
  try {
    const response = await fetch(request);
    if (await isSafeResponse(request, response)) {
      const cache = await caches.open(SHELL_CACHE);
      await cache.put(cacheKey, response.clone());
    }
    return response;
  } catch {
    return null;
  }
}

async function shellResponse(event) {
  const request = event.request;
  const cacheKey = request.mode === "navigate" ? INDEX_URL : request;
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(cacheKey);
  const network = refreshShell(request, cacheKey);

  if (cached) {
    event.waitUntil(network);
    return cached;
  }

  const response = await network;
  if (response) return response;
  if (request.mode === "navigate") return cache.match(INDEX_URL);
  return Response.error();
}

async function trimRuntimeCache(cache, maxEntries = 20) {
  const keys = await cache.keys();
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map(key => cache.delete(key)));
}

async function fontResponse(event) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(event.request);
  if (cached) return cached;

  try {
    const response = await fetch(event.request);
    if (response.ok || response.type === "opaque") {
      await cache.put(event.request, response.clone());
      await trimRuntimeCache(cache);
    }
    return response;
  } catch {
    return Response.error();
  }
}

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);

  if (event.request.mode === "navigate" || (url.origin === self.location.origin && SHELL_URLS.has(url.href))) {
    event.respondWith(shellResponse(event));
  } else if (FONT_ORIGINS.has(url.origin)) {
    event.respondWith(fontResponse(event));
  }
});
