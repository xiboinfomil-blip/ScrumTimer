import { fetchGoogleSlide, findPresentation, parseGoogleSlideIds } from '@/lib/google-slides';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET(_request: Request, context: { params: Promise<{ deck: string; file: string }> }) {
  const { deck, file } = await context.params;
  const item = findPresentation(deck);
  if (!item || !/^[\w.-]+\.svg$/.test(file) || file.includes('..')) return new Response(null, { status: 404 });
  try {
    const page = file.slice(0, -4);
    if (!parseGoogleSlideIds(await fetchGoogleSlide(item.googleId)).includes(page)) return new Response(null, { status: 404 });
    return new Response(await fetchGoogleSlide(item.googleId, page), { headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'private, max-age=300',
      'Content-Security-Policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'",
      'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline',
    } });
  } catch { return Response.json({ error: 'SVG Google indisponible.' }, { status: 502 }); }
}