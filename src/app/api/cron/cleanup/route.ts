import { database } from '@/lib/persistence/database';
import { authorizedMaintenance, maintainDatabase } from '@/lib/persistence/maintenance';
import { teamReadCache } from '@/lib/persistence/shared-read-cache';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (!authorizedMaintenance(request, process.env.CRON_SECRET)) {
    return Response.json({ error: 'Non autorisé.' }, { status: 401, headers });
  }
  try {
    const deleted = await teamReadCache.mutate(() => maintainDatabase(database()));
    return Response.json({ ok: true, deleted }, { headers });
  } catch {
    return Response.json({ error: 'Nettoyage indisponible. Réessayez depuis le tableau de bord Vercel.' }, { status: 503, headers });
  }
}