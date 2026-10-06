/* Service worker Admin Pesanan.
   - Tampilan aplikasi (HTML, ikon, pustaka CDN) dicache agar tetap terbuka saat sinyal jelek/offline.
   - DATA tidak pernah dicache: semua permintaan ke API server, Google Sheet, dan Apps Script
     dibiarkan langsung ke jaringan (tidak disentuh service worker), jadi nota selalu terbaru.
   Naikkan VERSI jika daftar file di bawah berubah. */
const VERSI = 'admin-pesanan-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];
const CDN = [
  'https://cdn.jsdelivr.net/npm/sweetalert2@11',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.6/Sortable.min.js',
  'https://html2canvas.hertzen.com/dist/html2canvas.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap'
];
const CDN_HOSTS = ['cdn.jsdelivr.net', 'html2canvas.hertzen.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(VERSI);
    await c.addAll(SHELL);                                   // wajib
    await Promise.all(CDN.map(u =>                           // pustaka CDN: dicoba saja, tidak menggagalkan pemasangan
      fetch(new Request(u, { mode: 'no-cors' })).then(r => c.put(u, r)).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== VERSI) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                          // POST (kirim data) tidak disentuh
  const url = new URL(req.url);

  // Halaman admin: ambil yang terbaru dari jaringan (update dari GitHub langsung terpakai); gagal/lambat -> cache
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    e.respondWith((async () => {
      const c = await caches.open(VERSI);
      try {
        const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(req, { cache: 'no-cache', signal: ctl.signal }); clearTimeout(t);
        if (r.ok) { c.put('./index.html', r.clone()); return r; }
      } catch (_) { }
      return (await c.match(req, { ignoreSearch: true })) || (await c.match('./index.html')) || (await c.match('./')) || Response.error();
    })());
    return;
  }

  // Ikon & file statis milik aplikasi: cache dulu
  if (url.origin === self.location.origin) {
    e.respondWith(caches.match(req).then(r => r || fetch(req)));
    return;
  }

  // Pustaka CDN & font: pakai cache, perbarui di belakang layar
  if (CDN_HOSTS.includes(url.hostname)) {
    e.respondWith((async () => {
      const c = await caches.open(VERSI);
      const lama = await c.match(req);
      const baru = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => lama);
      return lama || baru;
    })());
  }
  // Selain itu (API server, Google Sheet, Apps Script): langsung jaringan, tanpa cache
});
