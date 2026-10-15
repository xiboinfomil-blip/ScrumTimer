import 'server-only';
import { execFile } from 'node:child_process';
import path from 'node:path';
import catalog from './remote-mood-catalog.json';
import { MOOD_SOURCE_URL, parseMoodSource } from './mood-source';
import type { RemoteMoodSource } from './mood-fetch-cache';

let pending: Promise<RemoteMoodSource[]> | undefined;
async function fetchSource() {
  if (process.platform === 'win32') return new Promise<string>((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(process.cwd(), 'scripts/fetch-mood-source.ps1')], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, timeout: 50000, windowsHide: true }, (error, stdout) => error ? reject(error) : resolve(stdout));
  });
  const response = await fetch(MOOD_SOURCE_URL, { cache: 'no-store', signal: AbortSignal.timeout(40000) });
  if (!response.ok) throw new Error('Public mood catalogue unavailable');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Empty mood catalogue');
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 10 * 1024 * 1024) { await reader.cancel(); throw new Error('Mood catalogue too large'); }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}
export function fetchMoodSource(): Promise<RemoteMoodSource[]> {
  pending ??= fetchSource().then(html => parseMoodSource(html, catalog)).finally(() => { pending = undefined; });
  return pending;
}