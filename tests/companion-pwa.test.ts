import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { GET as manifestGET } from '../src/app/remote/manifest.webmanifest/route.ts';
import { GET as workerGET } from '../src/app/remote/sw.js/route.ts';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const component = source('src/components/remote/companion-install.tsx');

test('remote manifest has stable credential-free identity, scope and PNG icons', async () => {
  const response = manifestGET();
  assert.match(response.headers.get('content-type')!, /application\/manifest\+json/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const manifest = await response.json();
  assert.deepEqual({ id: manifest.id, start: manifest.start_url, scope: manifest.scope }, {
    id: '/remote', start: '/remote', scope: '/remote',
  });
  assert.equal(manifest.name, 'Infomil Télécommande');
  assert.equal(manifest.short_name, 'Télécommande');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.background_color, '#205f9d');
  assert.equal(manifest.theme_color, '#205f9d');
  assert.equal(manifest.orientation, 'any');
  assert.equal(manifest.lang, 'fr');
  assert.deepEqual(manifest.icons, [
    { src: '/remote/icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/remote/icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
  ]);
  assert.doesNotMatch(JSON.stringify(manifest), /token|secret|pair|team/i);
});

type WorkerEvent = {
  request?: { url: string; method: string; mode: string };
  waitUntil?: (promise: Promise<unknown>) => void;
  respondWith?: (promise: Promise<Response>) => void;
};

async function workerHarness(network: (request: unknown, init: RequestInit) => Promise<Response>) {
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  let skipped = 0;
  let claimed = 0;
  runInNewContext(await workerGET().text(), {
    URL, Response,
    fetch: network,
    self: {
      location: { origin: 'https://scrum.example' },
      skipWaiting: async () => { skipped++; },
      clients: { claim: async () => { claimed++; } },
      addEventListener: (name: string, handler: (event: WorkerEvent) => void) => handlers.set(name, handler),
    },
    // No caches, storage, secrets or application globals are available.
  });
  return {
    handlers,
    counts: () => ({ skipped, claimed }),
    navigate(url = 'https://scrum.example/remote', mode = 'navigate', method = 'GET') {
      let response: Promise<Response> | undefined;
      handlers.get('fetch')!({ request: { url, mode, method }, respondWith: value => { response = value; } });
      return response;
    },
  };
}

test('worker response allows the exact /remote scope without root-wide access or caches', async () => {
  const response = workerGET();
  assert.equal(response.headers.get('service-worker-allowed'), '/remote');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(response.headers.get('content-type')!, /application\/javascript/);
  const script = await response.text();
  assert.doesNotMatch(script, /\bcaches\b|CacheStorage|indexedDB|localStorage|sessionStorage|\.clone\(|\.put\(|addAll|importScripts/);
  const worker = await workerHarness(async () => new Response('online'));
  for (const name of ['install', 'activate']) {
    let completion: Promise<unknown> | undefined;
    worker.handlers.get(name)!({ waitUntil: promise => { completion = promise; } });
    await completion;
  }
  assert.deepEqual(worker.counts(), { skipped: 1, claimed: 1 });
});

test('worker only handles remote GET documents; APIs, commands and unrelated routes bypass it', async () => {
  const calls: { request: unknown; init: RequestInit }[] = [];
  const online = new Response('live document', { headers: { 'Cache-Control': 'no-store' } });
  const worker = await workerHarness(async (request, init) => { calls.push({ request, init }); return online; });
  assert.equal(await worker.navigate(), online);
  assert.equal(await worker.navigate('https://scrum.example/remote/child'), online);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.cache, 'no-store');
  for (const path of ['/api/timer-remote', '/api/team', '/timer', '/remote-other', '/remotely']) {
    assert.equal(worker.navigate(`https://scrum.example${path}`), undefined);
  }
  assert.equal(worker.navigate('https://other.example/remote'), undefined);
  assert.equal(worker.navigate('https://scrum.example/remote', 'cors'), undefined);
  assert.equal(worker.navigate('https://scrum.example/remote', 'navigate', 'POST'), undefined);
  assert.equal(calls.length, 2);
});

test('offline navigation is a self-contained French error, never a cached live/control screen', async () => {
  const worker = await workerHarness(async () => { throw new TypeError('Network failed'); });
  const response = await worker.navigate('https://scrum.example/remote?token=PRIVATE#PRIVATE');
  assert.ok(response);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.match(response.headers.get('content-security-policy')!, /default-src 'none'/);
  const html = await response.text();
  assert.match(html, /lang="fr"/);
  assert.match(html, /Connexion nécessaire/);
  assert.match(html, /href="\/remote"/);
  assert.doesNotMatch(html, /PRIVATE|token|<script|<img|<iframe|https?:\/\/|Démarrer|Pause|Suivant/);
});

test('HTTP errors are preserved instead of masquerading as offline success', async () => {
  const denied = new Response('not authorized', { status: 401 });
  const worker = await workerHarness(async () => denied);
  assert.equal(await worker.navigate(), denied);
});

test('install component defers native prompt to a real click, cleans listeners and reports failures', () => {
  assert.match(component, /^'use client'/);
  for (const event of ['beforeinstallprompt', 'appinstalled']) {
    assert.ok(component.includes(`addEventListener('${event}'`));
    assert.ok(component.includes(`removeEventListener('${event}'`));
  }
  assert.match(component, /event\.preventDefault\(\)/);
  assert.match(component, /displayMode\.addEventListener\('change'/);
  assert.match(component, /displayMode\.removeEventListener\('change'/);
  assert.match(component, /\(display-mode: standalone\)/);
  assert.match(component, /standalone === true/);
  assert.match(component, /if \(installed && !workerError\) return null/);
  assert.match(component, /\{!installed &&/);
  assert.match(component, /\{deferredPrompt &&/);
  assert.match(component, /\{!deferredPrompt &&/);
  assert.match(component, /onClick=\{\(\) => void install\(\)\}/);
  assert.match(component, /await prompt\.prompt\(\)/);
  assert.match(component, /await prompt\.userChoice/);
  const installHandler = component.slice(component.indexOf('async function install()'), component.indexOf('if (installed && !workerError)'));
  assert.doesNotMatch(installHandler, /setInstalled\(true\)/);
  assert.match(component, /window\.isSecureContext && 'serviceWorker' in navigator/);
  assert.match(component, /register\('\/remote\/sw\.js', \{\s*scope: '\/remote',\s*updateViaCache: 'none'/);
  assert.match(component, /catch \{\s*if \(mounted.current\) \{\s*setWorkerError/);
  assert.match(component, /role="alert"/);
  assert.doesNotMatch(component, /localStorage|sessionStorage|indexedDB|document\.cookie|location\.(hash|search)|caches\./);
});

test('install UI provides French platform guidance, accessible status and 44px branded controls', () => {
  for (const text of ['Safari', 'Partager', 'Sur l’écran d’accueil', 'Android', 'Installer l’application', 'Ajouter à l’écran d’accueil', 'HTTPS', 'Connexion nécessaire']) {
    assert.ok(component.includes(text), text);
  }
  assert.match(component, /min-h-11 min-w-11 focus-visible:/);
  assert.match(component, /<summary className="[^"]*min-h-11/);
  assert.match(component, /disabled=\{pending\}/);
  assert.match(component, /role="status"/);
  assert.match(component, /border-accent/);
  assert.match(component, /text-brand/);
});

test('icon route uses server ImageResponse, only 192/512 PNG dimensions and safe phone margins', () => {
  const icon = source('src/app/remote/icon/route.tsx');
  assert.match(icon, /import \{ ImageResponse \} from 'next\/og'/);
  assert.match(icon, /searchParams\.get\('size'\) === '512' \? 512 : 192/);
  assert.match(icon, /new ImageResponse\(/);
  assert.match(icon, /width: size,\s*height: size/);
  assert.match(icon, /fontFamily: 'sans-serif'/);
  for (const color of ['#205f9d', '#ec8b23', '#ffffff']) assert.ok(icon.includes(color));
  assert.match(icon, /width: 208 \* unit, height: 320 \* unit/);
  assert.match(icon, /borderRadius: 36 \* unit/);
  assert.doesNotMatch(icon, /fetch\(|readFile|writeFile|https?:\/\/|<img|<script/);
});