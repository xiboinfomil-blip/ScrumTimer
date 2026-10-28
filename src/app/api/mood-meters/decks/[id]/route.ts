import { cachedMoodDeck } from '@/lib/mood/remote-mood-cache';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^deck-[a-f0-9]{20}$/.test(id)) return new Response(null, { status: 404 });
  try {
    const deck = await cachedMoodDeck(id);
    if (!deck) return new Response(null, { status: 404 });
    return Response.json({ title: deck.title, category: deck.category, slides: deck.pages.map(page => `mood-meters/slides/${id}/${page}.svg`) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Présentation Google indisponible ou accès refusé.' }, { status: 502 });
  }
}