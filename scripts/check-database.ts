import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { configureNeonNetwork } from '../src/lib/neon-network';
const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Missing configuration');
  configureNeonNetwork(process.env.DATABASE_URL);
  const db = drizzle(neon(process.env.DATABASE_URL));
  await db.execute(sql`SELECT 1`);
  console.log('Neon connectivity: OK');
  const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('standup_spaces', 'standup_rounds') ORDER BY table_name`);
  console.log(`Application tables present: ${tables.rows.length} / 2`);
  if (tables.rows.length !== 2) throw new Error('Missing tables');
  const journal = await db.execute(sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`);
  console.log(`Applied Drizzle migrations: ${journal.rows[0].count}`);
}
main().catch((error: unknown) => {
  // Never log messages, SQL parameters, URLs, credentials or full driver errors.
  let cause: unknown = error;
  for (let depth = 0; cause && depth < 5; depth++) {
    const current = cause as { code?: unknown; cause?: unknown; sourceError?: unknown; message?: unknown; errors?: { code?: unknown }[] };
    if (typeof current.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(current.code)) console.error(`Database failure code: ${current.code}`);
    for (const item of current.errors ?? []) {
      if (typeof item.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(item.code)) console.error(`Network failure code: ${item.code}`);
    }
    if (typeof current.message === 'string') {
      const categories = ['fetch', 'timeout', 'password', 'authentication', 'certificate', 'connection', 'URL', 'Missing'];
      console.error(`Failure category: ${categories.filter(word => current.message!.toString().toLowerCase().includes(word.toLowerCase())).join(', ') || 'database operation'}`);
    }
    cause = current.cause ?? current.sourceError;
  }
  process.exitCode = 1;
});