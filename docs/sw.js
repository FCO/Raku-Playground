// Service worker: cache the big Rakudo runtime (perl6.js) across visits so
// repeat loads skip the ~10 MB download entirely. Registered only on the
// https deployment (see playground.js) — never on localhost/file://.
//
// Safety hinges on perl6.js being fetched at a *versioned* URL (perl6.js?v=<build>):
// a new deploy changes the build id, so it's a fresh cache key and the old
// runtime can never be pinned. The build id rides in on this worker's own URL.

const BUILD = new URLSearchParams(self.location.search).get("v") || "dev";
const CACHE = `raku-runtime-${BUILD}`;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        // Drop caches from previous builds.
        const names = await caches.keys();
        await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    const url = new URL(event.request.url);
    // Only the runtime is worth caching here; everything else hits the network.
    if (event.request.method !== "GET" || !url.pathname.endsWith("/perl6.js")) return;

    event.respondWith((async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
    })());
});
