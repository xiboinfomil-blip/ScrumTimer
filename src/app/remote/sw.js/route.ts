// Deliberately no Cache Storage, precache, background sync or saved pairing state.
// API calls and commands bypass this worker; remote document requests are network-only.
const serviceWorker = String.raw`
'use strict';
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || request.mode !== 'navigate' ||
      url.origin !== self.location.origin ||
      !(url.pathname === '/remote' || url.pathname.startsWith('/remote/'))) return;

  event.respondWith(fetch(request, { cache: 'no-store' }).catch(() => new Response(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="theme-color" content="#205f9d"><title>Connexion nécessaire · Infomil</title>' +
    '<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#205f9d;color:#fff;font:16px system-ui,sans-serif}' +
    'main{max-width:28rem;padding:2rem}h1{font-size:1.6rem}p{line-height:1.6}' +
    'a{display:inline-flex;align-items:center;min-height:44px;padding:0 1rem;border-radius:12px;background:#fff;color:#205f9d;font-weight:700;text-decoration:none}' +
    'a:focus-visible{outline:3px solid #ec8b23;outline-offset:4px}</style></head>' +
    '<body><main><h1>Connexion nécessaire</h1><p>La télécommande ne fonctionne pas hors connexion. Vérifiez votre accès à Internet, puis réessayez.</p>' +
    '<p>Si nécessaire, scannez à nouveau le QR code affiché sur l’ordinateur pour associer le minuteur.</p>' +
    '<a href="/remote">Réessayer</a></main></body></html>',
    { status: 503, headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff'
    } }
  )));
});
`;

export function GET() {
  return new Response(serviceWorker, {
    headers: {
      'Content-Type': 'application/javascript; charset=utf-8',
      'Cache-Control': 'no-store',
      // Default /remote/ would miss the actual start URL /remote.
      'Service-Worker-Allowed': '/remote',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}