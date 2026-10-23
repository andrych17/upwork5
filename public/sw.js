// Bump CACHE when the precache list changes; old caches are dropped on activate.
const CACHE = 'lantern-v1';
const PRECACHE = [
  '/',
  '/rules.html',
  '/terms.html',
  '/privacy.html',
  '/offline.html',
  '/widgets-while-you-wait.html',
  '/prototypes/lantern-calendar-v1.html',
  '/assets/site.css',
  '/assets/app.js',
  '/assets/memory-widget.js',
  '/manifest.webmanifest',
  '/icons/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// Cloudflare Pages (and Vercel cleanUrls) redirect /page.html to /page, so pages
// are stored under the extensionless path and looked up the same way.
const pageKey = (url) => {
  const path = new URL(url, self.location.origin).pathname;
  return path.replace(/\/index\.html$/, '/').replace(/\.html$/, '');
};

async function precache() {
  const cache = await caches.open(CACHE);
  await Promise.all(PRECACHE.map(async (url) => {
    const res = await fetch(url, { cache: 'reload' });
    if (!res.ok) throw new Error(`precache ${url}: ${res.status}`);
    // A redirected response can't answer a navigation, so keep a clean copy.
    const copy = res.redirected
      ? new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: res.headers })
      : res;
    await cache.put(url.endsWith('.html') || url === '/' ? pageKey(url) : url, copy);
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  // Pages: network first so edits show up, cached copy or offline.html without a connection.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(pageKey(req.url), copy));
        }
        return res;
      } catch {
        return (await caches.match(pageKey(req.url))) || (await caches.match('/offline'));
      }
    })());
    return;
  }

  // Everything else: serve from cache, refresh in the background.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const network = fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') cache.put(req, res.clone());
        return res;
      })
      .catch(() => hit || Response.error());
    return hit || network;
  })());
});
