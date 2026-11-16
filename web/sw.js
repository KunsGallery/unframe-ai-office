// Unframe Log 서비스 워커: 앱 설치 + 웹 푸시 알림. 그림 파일만 캐시하고, 나머지는 항상 최신 버전을 받아온다.
const CACHE = 'office-assets-v2';
const VERSION = 'push-2';
// 앱이 진단 화면에서 서비스 워커 버전을 물어본다
self.addEventListener('message', e => { if (e.data && e.data.type === 'version' && e.ports[0]) e.ports[0].postMessage({ version: VERSION }); });
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())
));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // Firebase 등 외부 요청은 건드리지 않음
  if (url.pathname.includes('/assets/') || url.pathname.includes('/icons/')) {
    e.respondWith(caches.open(CACHE).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // 화면·코드: 네트워크 먼저, 오프라인이면 캐시
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request)));
});

// 🔔 웹 푸시: 앱이 닫혀 있어도 알림을 띄운다 (Netlify 함수 push가 보냄)
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Unframe Log', {
    body: d.body || '', tag: d.tag || undefined, renotify: !!d.tag,
    icon: 'icons/icon-192.png', data: { url: d.url || './' },
  }));
});
// 알림을 누르면: 열린 앱이 있으면 그 창으로, 없으면 새로 연다
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const c = list.find(x => x.url.startsWith(self.registration.scope));
    if (c) { c.postMessage({ type: 'open', url }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
