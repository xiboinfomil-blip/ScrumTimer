import { findPresentation, fetchGooglePowerPoint } from '@/lib/mood/google-slides';
import { extractMoodTitles } from '@/lib/mood/mood-titles';

export const runtime = 'nodejs';
export const maxDuration = 60;
const cache = new Map<string, { titles: (string | null)[]; expires: number }>();
const pending = new Map<string, Promise<(string | null)[]>>();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const deck = /^deck-[a-f0-9]{20}$/.test(id) ? findPresentation(id) : undefined;
  if (!deck) return new Response(null, { status: 404 });
  try {
    let entry = cache.get(id);
    if (!entry || entry.expires <= Date.now()) {
      let job = pending.get(id);
      if (!job) {
        if (pending.size >= 2) return Response.json({ error: 'Extraction occupée.' }, { status: 503 });
        job = fetchGooglePowerPoint(deck.googleId).then(extractMoodTitles).finally(() => pending.delete(id));
        pending.set(id, job);
      }
      entry = { titles: await job, expires: Date.now() + 5 * 60_000 };
      if (cache.size >= 20) cache.delete(cache.keys().next().value!);
      cache.set(id, entry);
    }
    return Response.json({ titles: entry.titles }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch {
    return Response.json({ error: 'Titres du baromètre indisponibles.' }, { status: 502 });
  }
}