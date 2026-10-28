import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import { STORAGE_BUDGET_BYTES, STORAGE_WARNING_BYTES, storageBudgetFailure, storageUsageStatement } from '../src/lib/persistence/storage-budget.ts';

test('storage reporting counts actual database and relation bytes without reading application data', async () => {
  const engine = new PGlite();
  try {
    const query = new PgDialect().sqlToQuery(storageUsageStatement());
    const result = await engine.query<{ database_bytes: string; application_bytes: string }>(query.sql, query.params);
    assert.ok(Number(result.rows[0].database_bytes) > 0);
    assert.equal(Number(result.rows[0].application_bytes), 0);
    assert.ok(STORAGE_WARNING_BYTES < STORAGE_BUDGET_BYTES);
    assert.ok(STORAGE_BUDGET_BYTES < 1_000_000_000);
  } finally { await engine.close(); }
});

test('storage failures expose a safe noncached 507 response, never SQL or credentials', async () => {
  for (const code of ['P0S01', '53100']) {
    const response = storageBudgetFailure({ cause: { sourceError: { code, message: 'private connection and SQL' } } });
    assert.equal(response?.status, 507);
    assert.equal(response?.headers.get('cache-control'), 'no-store');
    const body = await response!.json();
    assert.equal(body.code, 'STORAGE_LIMIT');
    assert.doesNotMatch(JSON.stringify(body), /private|connection|SQL/);
  }
  assert.equal(storageBudgetFailure({ code: '23505' }), null);
  assert.equal(storageBudgetFailure(null), null);
});

test('storage migration guards every application table and leaves reads and cleanup available at capacity', async () => {
  const engine = new PGlite();
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
  try {
    const journal = JSON.parse(read('../drizzle/meta/_journal.json')) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) await engine.exec(read(`../drizzle/${tag}.sql`));
    const guarded = await engine.query("SELECT count(*)::int AS count FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgname='app_storage_budget' AND t.tgenabled='O'");
    assert.equal(guarded.rows[0].count, 21);
    const id = 'a'.repeat(64);
    await engine.query('INSERT INTO workspaces(id) VALUES($1)', [id]);
    const lowBudget = (statement: string) => engine.transaction(async transaction => {
      await transaction.exec("SET LOCAL app.storage_budget_bytes = '1'");
      return transaction.query(statement, [id]);
    });
    await assert.rejects(lowBudget('INSERT INTO workspaces(id) VALUES($1) ON CONFLICT DO NOTHING'), { code: 'P0S01' });
    await assert.rejects(lowBudget('UPDATE workspaces SET id=id WHERE id=$1'), { code: 'P0S01' });
    assert.equal((await lowBudget('SELECT id FROM workspaces WHERE id=$1')).rows.length, 1);
    assert.equal((await lowBudget('DELETE FROM workspaces WHERE id=$1 RETURNING id')).rows.length, 1);
    assert.equal((await engine.query('SELECT id FROM workspaces')).rows.length, 0);
    const migration = read('../drizzle/0011_storage_budget.sql');
    assert.match(migration, /LEAST\(\s*750000000::bigint/);
    assert.match(migration, /pg_advisory_xact_lock/);
    assert.doesNotMatch(migration, /DROP TABLE|DELETE FROM|TRUNCATE|SECURITY DEFINER/i);
  } finally { await engine.close(); }
});