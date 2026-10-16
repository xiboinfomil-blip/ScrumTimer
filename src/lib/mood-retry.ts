export const MOOD_RETRY_DELAYS = [1000, 1000, 2000] as const;

export function retryDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, milliseconds);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/** Initial read plus at most three retries. Never retry writes or access refusals. */
export async function fetchMoodRead(url: string, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    let response: Response;
    try { response = await fetch(url, { signal, cache: 'no-store' }); }
    catch (error) {
      signal.throwIfAborted();
      if (attempt >= MOOD_RETRY_DELAYS.length) throw error;
      await retryDelay(MOOD_RETRY_DELAYS[attempt], signal);
      continue;
    }
    if (attempt >= MOOD_RETRY_DELAYS.length || ![408, 429, 500, 502, 503, 504].includes(response.status)) return response;
    await response.body?.cancel();
    await retryDelay(MOOD_RETRY_DELAYS[attempt], signal);
  }
}