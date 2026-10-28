import { cachedMoodCatalog } from '@/lib/mood/remote-mood-cache';
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;
export async function GET() {
  try {
    return Response.json(await cachedMoodCatalog(), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    let cause: unknown = error;
    let missingSchema = false;
    for (let depth = 0; cause && depth < 5; depth++) {
      const detail = cause as { code?: unknown; cause?: unknown; sourceError?: unknown };
      if (detail.code === '42P01') missingSchema = true;
      cause = detail.cause ?? detail.sourceError;
    }
    return Response.json({ error: missingSchema ? 'Catalogue indisponible : la migration de la base doit être appliquée par un administrateur.' : 'Catalogue temporairement indisponible. Réessayez dans quelques instants.' }, { status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '30' } });
  }
}