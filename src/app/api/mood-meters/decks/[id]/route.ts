import { fetchGoogleSlide, findPresentation, parseGoogleSlideIds } from '@/lib/google-slides';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const item = findPresentation(id);
  if (!item) return new Response(null, { status: 404 });
  try {
    const pages = parseGoogleSlideIds(await fetchGoogleSlide(item.googleId));
    if (!pages.length) throw new Error('No public slides');
    return Response.json({ title: item.title, slides: pages.map(page => `mood-meters/slides/${id}/${page}.svg`) });
  } catch {
    return Response.json({ error: 'Présentation Google indisponible ou accès refusé.' }, { status: 502 });
  }
}