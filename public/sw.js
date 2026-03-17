const CACHE = 'aria-v4';
const STATIC = [
  '/',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=DM+Sans:wght@200;300;400;500&family=DM+Mono:wght@300;400&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Never intercept API calls — always go to network
  if (url.pathname.startsWith('/chat') ||
      url.pathname.startsWith('/auth') ||
      url.pathname.startsWith('/tasks') ||
      url.pathname.startsWith('/events') ||
      url.pathname.startsWith('/memories') ||
      url.pathname.startsWith('/link') ||
      url.hostname === '127.0.0.1') {
    return;
  }

  // Cache-first for static assets (fonts, icons)
  if (e.request.destination === 'font' ||
      e.request.destination === 'image' ||
      url.pathname.startsWith('/icons/')) {
    e.respondWith(
      caches.match(e.request).then(cached => cached || fetch(e.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      }))
    );
    return;
  }

  // Network-first for the app shell (always fresh)
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Push notifications (for future use)
self.addEventListener('push', e => {
  if (!e.data) return;
  const { title, body, icon } = e.data.json();
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      vibrate: [200, 100, 200]
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/'));
});
