import { execFile } from 'node:child_process';
import path from 'node:path';
import catalog from './remote-mood-catalog.json';

export const remoteCatalog = catalog.map(({ id, title, category }) => ({ remoteId: id, title, category, slides: [] }));
export const findPresentation = (id: string) => catalog.find(item => item.id === id);

export function parseGoogleSlideIds(html: string): string[] {
  return [...new Set(Array.from(html.matchAll(/setPageData\(\s*['"]([\w.-]+)['"]/g), match => match[1]))].slice(0, 500);
}

// Bounded, short-lived RAM cache; no exported files are written to disk.
const cache = new Map<string, { text: string; expires: number }>();
const pending = new Map<string, Promise<string>>();
let bytes = 0;
async function request(googleId: string, pageId?: string): Promise<string> {
  if (!/^[\w-]+$/.test(googleId) || (pageId && !/^[\w.-]+$/.test(pageId))) throw new Error('Invalid presentation');
  if (process.platform === 'win32') {
    return new Promise((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(process.cwd(), 'scripts/fetch-google-slide.ps1'), '-GoogleId', googleId, ...(pageId ? ['-PageId', pageId] : [])],
        { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, timeout: 50000, windowsHide: true },
        (error, stdout) => error ? reject(error) : resolve(stdout));
    });
  }
  const suffix = pageId ? `export/svg?pageid=${encodeURIComponent(pageId)}` : 'preview';
  const response = await fetch(`https://docs.google.com/presentation/d/${googleId}/${suffix}`, { signal: AbortSignal.timeout(40000), cache: 'no-store' });
  if (!response.ok || (pageId && !response.headers.get('Content-Type')?.startsWith('image/svg+xml'))) throw new Error('Google export unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty export');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 20 * 1024 * 1024) { await reader.cancel(); throw new Error('Export too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function fetchGoogleSlide(googleId: string, pageId?: string, fresh = false): Promise<string> {
  const key = `${googleId}:${pageId || ''}`;
  const cached = cache.get(key);
  if (!fresh && cached && cached.expires > Date.now()) return cached.text;
  const existing = pending.get(key);
  if (existing) return existing;
  if (pending.size >= 8) throw new Error('Too many Google requests');
  const job = request(googleId, pageId).then(text => {
    if (pageId && !/<svg[\s>]/i.test(text)) throw new Error('Invalid SVG');
    const size = Buffer.byteLength(text);
    if (size > 20 * 1024 * 1024) throw new Error('Export too large');
    const previous = cache.get(key);
    if (previous) { bytes -= Buffer.byteLength(previous.text); cache.delete(key); }
    while (cache.size && bytes + size > 32 * 1024 * 1024) {
      const oldest = cache.keys().next().value!;
      bytes -= Buffer.byteLength(cache.get(oldest)!.text); cache.delete(oldest);
    }
    cache.set(key, { text, expires: Date.now() + 5 * 60000 }); bytes += size;
    return text;
  }).finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}