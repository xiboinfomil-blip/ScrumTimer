import { spawn } from 'node:child_process';
import path from 'node:path';
import { neonConfig } from '@neondatabase/serverless';

export function configureNeonNetwork(connectionString: string) {
  if (process.platform !== 'win32') return;
  const hostname = new URL(connectionString).hostname;
  // Neon replaces the endpoint's first label with api.* for HTTP SQL requests.
  const apiHostname = hostname.replace(/^[^.]+\./, 'api.');
  neonConfig.fetchFunction = async (input: string | URL, options: RequestInit = {}) => {
    const url = new URL(String(input));
    if (url.protocol !== 'https:' || ![hostname, apiHostname].includes(url.hostname) || url.pathname !== '/sql' || url.search || url.username || url.password) throw new Error('Unexpected Neon endpoint');
    const payload = JSON.stringify({ url: url.href, headers: Object.fromEntries(new Headers(options.headers)), body: String(options.body ?? '') });
    return new Promise<Response>((resolve, reject) => {
      const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-File', path.join(process.cwd(), 'scripts/neon-proxy-request.ps1')], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      const chunks: Buffer[] = [];
      let size = 0;
      let failureCode = '';
      const fail = () => { child.kill(); reject(new Error('Neon Windows proxy request failed')); };
      const timeout = setTimeout(fail, 45000);
      const abort = () => { fail(); };
      options.signal?.addEventListener('abort', abort, { once: true });
      child.stdout.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) fail();
        else chunks.push(chunk);
      });
      // Drain errors without logging: credentials and SQL must never be printed.
      child.stderr.on('data', (chunk: Buffer) => {
        const value = chunk.toString('utf8').trim();
        if (/^NEON_PROXY_[A-Z_]{1,50}$/.test(value)) failureCode = value;
      });
      child.on('error', fail);
      child.stdin.on('error', fail);
      child.on('close', code => {
        clearTimeout(timeout);
        options.signal?.removeEventListener('abort', abort);
        if (code !== 0) { reject(Object.assign(new Error('Neon Windows proxy request failed'), { code: failureCode || 'NEON_PROXY_FAILED' })); return; }
        try {
          const result = JSON.parse(Buffer.concat(chunks).toString('utf8').replace(/^\uFEFF/, ''));
          resolve(new Response(result.body, { status: result.status, headers: { 'Content-Type': 'application/json' } }));
        } catch { reject(new Error('Invalid Neon proxy response')); }
      });
      if (options.signal?.aborted) abort();
      else child.stdin.end(payload);
    });
  };
}