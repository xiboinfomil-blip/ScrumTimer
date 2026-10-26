import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
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
  const allTables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'`);
  if (allTables.rows.some(row => !names.includes(String(row.table_name)))) throw new Error('Unexpected public tables remain');
  const legacy = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('standup_spaces','standup_rounds','round_feedback')`);
  if (legacy.rows.length) throw new Error('Legacy tables remain');
  const liveColumns = await db.execute(sql`SELECT table_name,column_name FROM information_schema.columns WHERE table_schema='public' AND table_name IN (${tableNames})`);
  const expectedColumns = new Set(configs.flatMap(config => config.columns.map(column => `${config.name}.${column.name}`)));
  const actualColumns = new Set(liveColumns.rows.map(row => `${row.table_name}.${row.column_name}`));
  if (expectedColumns.size !== actualColumns.size || [...expectedColumns].some(column => !actualColumns.has(column))) throw new Error('Database columns differ from the canonical schema');
  console.log(`Canonical columns verified: ${actualColumns.size}`);
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
  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
  const journal = await db.execute(sql`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id`);
  if (journal.rows.length !== migrations.length || migrations.some((migration, position) => journal.rows[position]?.hash !== migration.hash || Number(journal.rows[position]?.created_at) !== migration.folderMillis)) throw new Error('Migration journal differs from local migrations');
  console.log(`Applied Drizzle migrations: ${journal.rows.length} / ${migrations.length}`);
  // Aggregate-only diagnostics: no names, notes, credentials or team capabilities.
  // Read directly; application read routes may perform retention housekeeping.
  const integrity = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM team_members m LEFT JOIN participants p ON p.team_id=m.team_id AND p.id=m.participant_id WHERE p.id IS NULL) AS orphan_members,
      (SELECT count(*)::int FROM participant_check_ins c LEFT JOIN team_members m ON m.team_id=c.team_id AND m.participant_id=c.participant_id WHERE m.participant_id IS NULL) AS orphan_check_ins,
      (SELECT count(*)::int FROM participant_daily_hints h LEFT JOIN participants p ON p.team_id=h.team_id AND p.id=h.participant_id WHERE p.id IS NULL) AS orphan_notes,
      (SELECT count(*)::int FROM speaking_turns t LEFT JOIN standup_sessions s ON s.team_id=t.team_id AND s.id=t.session_id LEFT JOIN participants p ON p.team_id=t.team_id AND p.id=t.participant_id WHERE s.id IS NULL OR p.id IS NULL) AS orphan_turns,
      (SELECT count(*)::int FROM standup_sessions s WHERE NOT EXISTS(SELECT 1 FROM speaking_turns t WHERE t.team_id=s.team_id AND t.session_id=s.id)) AS empty_sessions,
      (SELECT count(*)::int FROM speaking_turns WHERE score IS NOT NULL AND (score NOT BETWEEN 0 AND 1000 OR speaking_seconds < 1 OR budget_seconds <= 0)) AS invalid_scored_turns,
      (SELECT count(*)::int FROM (SELECT team_id FROM team_members GROUP BY team_id HAVING min(position)<>0 OR max(position)<>count(*)-1) gaps) AS roster_position_gaps,
      (SELECT count(*)::int FROM (SELECT team_id,session_id FROM speaking_turns GROUP BY team_id,session_id HAVING min(position)<>0 OR max(position)<>count(*)-1) gaps) AS turn_position_gaps
  `);
  for (const [name, count] of Object.entries(integrity.rows[0])) {
    console.log(`Integrity ${name}: ${count}`);
    if (Number(count) !== 0) throw new Error('Persisted data integrity check failed');
  }
  const coverage = await db.execute(sql`SELECT count(*)::int AS total, count(score)::int AS scored,
    count(*) FILTER (WHERE score IS NULL)::int AS unscored FROM speaking_turns`);
  console.log(`Archived turns: ${coverage.rows[0].total}; scored: ${coverage.rows[0].scored}; unscored: ${coverage.rows[0].unscored}`);
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