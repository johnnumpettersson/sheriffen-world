const VERSION = "v1";
const RUNTIME_CACHE = `sheriffen-world-runtime-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== RUNTIME_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isImageApiRequest(url) {
  return (
    url.pathname.includes("/api/images/") &&
    (url.pathname.endsWith("/thumbnail") ||
      url.pathname.endsWith("/map-thumbnail") ||
      url.pathname.endsWith("/preview") ||
      url.pathname.endsWith("/file"))
  );
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const networkPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone()).catch(() => {
          // ignore cache write failures
        });
      }
      return response;
    })
    .catch(() => null);

  if (cached) {
    return cached;
  }

  const network = await networkPromise;
  if (network) {
    return network;
  }

  return new Response("Offline", { status: 503 });
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") {
    return;
  }

  if (isImageApiRequest(url)) {
    event.respondWith(staleWhileRevalidate(event.request));
  }
});
