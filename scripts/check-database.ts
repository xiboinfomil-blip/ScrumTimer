import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { configureNeonNetwork } from '../src/lib/neon-network';
import * as schema from '../src/db/schema.ts';
import { getTableConfig } from 'drizzle-orm/pg-core';
const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof import('@next/env');
loadEnvConfig(process.cwd());

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Missing configuration');
  configureNeonNetwork(process.env.DATABASE_URL);
  const db = drizzle(neon(process.env.DATABASE_URL));
  await db.execute(sql`SELECT 1`);
  console.log('Neon connectivity: OK');
  const configs = Object.values(schema).map(getTableConfig);
  const names = configs.map(config => config.name);
  const tableNames = sql.join(names.map(name => sql`${name}`), sql`, `);
  const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${tableNames}) ORDER BY table_name`);
  console.log(`Application tables present: ${tables.rows.length} / ${names.length}`);
  if (tables.rows.length !== names.length) throw new Error('Missing normalized tables');
  const legacy = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('standup_spaces','standup_rounds')`);
  if (legacy.rows.length) throw new Error('Legacy tables remain');
  const columns = await db.execute(sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${tableNames}) AND data_type IN ('json','jsonb')`);
  console.log(`Persisted JSON columns: ${columns.rows.length}`);
  if (columns.rows.length) throw new Error('Unsupported JSON columns');
  // Team selection is React-only, not a durable per-device workspace pointer.
  const ownership = await db.execute(sql`SELECT count(*)::int AS n FROM teams t LEFT JOIN workspaces w ON w.id=t.workspace_id WHERE w.id IS NULL`);
  if (Number(ownership.rows[0].n)) throw new Error('Missing team workspace');
  const fields = await db.execute(sql`SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='teams' AND column_name IN ('workspace_id','name')`);
  if (fields.rows.length !== 2 || fields.rows.some(row => row.is_nullable !== 'NO')) throw new Error('Missing team ownership constraints');
  const uniqueNames = await db.execute(sql`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='teams' AND indexname='teams_workspace_name' AND indexdef ILIKE '%UNIQUE%lower(name)%'`);
  if (!uniqueNames.rows.length) throw new Error('Missing case-insensitive team name index');
  for (const config of configs) {
    const count = await db.execute(sql`SELECT count(*)::text AS count FROM ${sql.identifier(config.name)}`);
    console.log(`${config.name}: ${count.rows[0].count} rows`);
  }
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