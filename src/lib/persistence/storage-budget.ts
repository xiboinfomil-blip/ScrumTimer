import { sql } from 'drizzle-orm';

export const STORAGE_BUDGET_BYTES = 750_000_000;
export const STORAGE_WARNING_BYTES = 600_000_000;

export function storageUsageStatement() {
  return sql`SELECT pg_database_size(current_database())::text AS database_bytes,
    COALESCE((SELECT sum(pg_total_relation_size(c.oid)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','m')),0)::text AS application_bytes`;
}

export function storageBudgetFailure(error: unknown): Response | null {
  let cause = error;
  for (let depth = 0; cause && depth < 6; depth++) {
    const current = cause as { code?: string; cause?: unknown; sourceError?: unknown };
    if (current.code === 'P0S01' || current.code === '53100') {
      return Response.json({ code: 'STORAGE_LIMIT', error: 'Le stockage de la base est presque plein. Les lectures restent disponibles. Contactez l’administrateur pour nettoyer les données ou augmenter la capacité.' }, { status: 507, headers: { 'Cache-Control': 'no-store' } });
    }
    cause = current.cause ?? current.sourceError;
  }
  return null;
}