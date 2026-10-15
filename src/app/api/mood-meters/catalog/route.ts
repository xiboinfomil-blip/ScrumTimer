import { cachedMoodCatalog } from '@/lib/remote-mood-cache';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET() {
  try {
    return Response.json(await cachedMoodCatalog(), { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Cache des baromètres indisponible.' }, { status: 503 });
  }
}