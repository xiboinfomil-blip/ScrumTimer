import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../src/db/schema.ts';
import { configureNeonNetwork } from '../src/lib/persistence/neon-network.ts';
import { createTeam, deleteTeam, updateTeamDirectory } from '../src/lib/team/workspace-store.ts';
import { readHistory, readTeam, writeHistory, writeTeam } from '../src/lib/persistence/relational-store.ts';
import type { HistoryRound } from '../src/lib/history/history.ts';
import type { TeamState } from '../src/types/team.ts';

const { loadEnvConfig } = createRequire(import.meta.url)('@next/env') as typeof import('@next/env');

async function main() {
  assert.ok(process.argv.includes('--allow-disposable-teams'), 'Requires --allow-disposable-teams: creates and deletes temporary teams in the configured database.');
  loadEnvConfig(process.cwd());
  const url = process.env.CONCURRENCY_DATABASE_URL ?? process.env.DATABASE_URL;
  assert.ok(url, 'Configure CONCURRENCY_DATABASE_URL or DATABASE_URL privately.');
  configureNeonNetwork(url);
  const db = drizzle(neon(url));
  const run = randomBytes(8).toString('hex');
  const names = ['main', 'control', 'delete'].map(suffix => `TEST CONCURRENCY ${run} ${suffix}`);
  const fixtures = new Map<string, string>();
  const traces: { pid: number; start: number; end: number }[] = [];
  async function race<First, Second>(label: string, first: () => Promise<First>, second: () => Promise<Second>): Promise<[First, Second]> {
    const offset = traces.length;
    const results = await Promise.allSettled([first(), second()]);
    for (const result of results) if (result.status === 'rejected') throw result.reason;
    const pair = traces.slice(offset);
    assert.equal(pair.length, 2, `${label}: expected exactly two transactions`);
    assert.ok(pair[0].pid !== pair[1].pid && pair[0].start < pair[1].end && pair[1].start < pair[0].end, `${label}: transactions did not overlap on distinct PostgreSQL backends`);
    assert.ok(results[0].status === 'fulfilled' && results[1].status === 'fulfilled');
    console.log(`PASS ${label}: verified overlapping PostgreSQL backends`);
    return [results[0].value, results[1].value];
  }
  const guarded = {
    execute: db.execute.bind(db),
    async batch(queries: Parameters<typeof db.batch>[0]) {
      const results = await db.batch([
        db.execute(sql`SET LOCAL lock_timeout='4s'`),
        db.execute(sql`SET LOCAL statement_timeout='10s'`),
        db.execute(sql`SELECT pg_backend_pid() AS pid,clock_timestamp() AS started`),
        queries[0],
        db.execute(sql`SELECT pg_sleep(1)`),
        ...queries.slice(1),
        db.execute(sql`SELECT clock_timestamp() AS ended`),
      ]);
      traces.push({ pid: Number(results[2].rows[0].pid), start: new Date(String(results[2].rows[0].started)).getTime(), end: new Date(String(results.at(-1)!.rows[0].ended)).getTime() });
      return [results[3], ...results.slice(5, -1)];
    },
  } as Parameters<typeof writeTeam>[0];
  const state: TeamState = { duration: 120, warning: 30, sound: false, session: [], usedMoodMeters: [], roster: [
    { id: 'fixture-a', name: 'Test Alice', present: true, mood: null, moodUpdatedAt: null, moodSlide: null },
    { id: 'fixture-b', name: 'Test Bob', present: true, mood: null, moodUpdatedAt: null, moodSlide: null },
  ] };
  const owned = Object.values(schema).map(getTableConfig).filter(table => table.columns.some(column => column.name === 'team_id'));
  const fixtureRows = async (id: string) => {
    const counts = owned.map(table => sql`(SELECT count(*) FROM ${sql.identifier(table.name)} WHERE team_id=${id})`);
    const result = await db.execute(sql`SELECT (SELECT count(*) FROM teams WHERE id=${id}) + ${sql.join(counts, sql` + `)} AS total`);
    return Number(result.rows[0].total);
  };
  let succeeded = false;
  console.log(`Disposable concurrency run: ${run}`);
  try {
    assert.equal((await db.execute(sql`SELECT id FROM teams WHERE name IN (${sql.join(names.map(name => sql`${name}`), sql`, `)})`)).rows.length, 0);
    for (const name of names) {
      const result = await createTeam(guarded, name);
      assert.ok(result.activeTeamId);
      fixtures.set(name, result.activeTeamId);
    }
    const [mainId, controlId, deleteId] = names.map(name => fixtures.get(name)!);
    assert.equal(await writeTeam(guarded, mainId, 1, state), 2);
    assert.equal(await writeTeam(guarded, controlId, 1, state), 2);
    const control = await readTeam(db, controlId);
    const proposals = [90, 150].map(duration => ({ ...state, duration }));
    const saves = await race('competing CAS saves', () => writeTeam(guarded, mainId, 2, proposals[0]), () => writeTeam(guarded, mainId, 2, proposals[1]));
    assert.equal(saves.filter(revision => revision === 3).length, 1);
    assert.equal(saves.filter(revision => revision === null).length, 1);
    assert.deepEqual((await readTeam(db, mainId)).team, { ...proposals[saves.findIndex(revision => revision === 3)], currentMoodSlide: null });
    console.log('PASS competing CAS saves: exactly one winner, no partial roster');
    for (const category of ['Tech', 'Support', 'Produit']) {
      const saved = await readTeam(db, mainId);
      const [, revision] = await race(`metadata/save ${category}`,
        () => updateTeamDirectory(guarded, { teamId: mainId, category }),
        () => writeTeam(guarded, mainId, saved.revision, { ...state, duration: 180 }));
      assert.equal(revision, saved.revision + 1);
      assert.equal((await db.execute(sql`SELECT category FROM teams WHERE id=${mainId}`)).rows[0].category, category);
    }
    console.log('PASS metadata/save contention: three overlapping pairs, no deadlock');
    const rounds: HistoryRound[] = ['first', 'second'].map(id => ({ id: `test-${run}-${id}`, completedAt: new Date().toISOString(), people: state.roster.map(person => ({ id: person.id, name: person.name, mood: null, speakingSeconds: 10, budgetSeconds: 120, timeUp: false, score: 125, meterTitle: null })) }));
    const archives = await race('daily archives', () => writeHistory(guarded, mainId, rounds[0]), () => writeHistory(guarded, mainId, rounds[1]));
    assert.equal(archives.filter(Boolean).length, 1);
    const winner = rounds[archives.findIndex(Boolean)];
    assert.equal(await writeHistory(guarded, mainId, winner), true);
    assert.deepEqual((await readHistory(db, mainId)).map(round => round.id), [winner.id]);
    console.log('PASS concurrent daily archives: one winner and idempotent replay');
    const [, deletedSave] = await race('delete/save',
      () => deleteTeam(guarded, { teamId: deleteId, name: names[2] }),
      () => writeTeam(guarded, deleteId, 1, state));
    assert.ok(deletedSave === null || deletedSave === 2);
    assert.equal(await fixtureRows(deleteId), 0);
    assert.deepEqual(await readTeam(db, controlId), control);
    console.log('PASS delete/save contention: no resurrection or orphan rows; control team unchanged');
    console.log(`Verified all six race pairs independently across ${traces.length} transactions.`);
    succeeded = true;
  } finally {
    const remaining = await db.execute(sql`SELECT id,name FROM teams WHERE name IN (${sql.join(names.map(name => sql`${name}`), sql`, `)})`);
    for (const row of remaining.rows) {
      const name = String(row.name); const id = String(row.id);
      assert.ok(names.includes(name) && (!fixtures.has(name) || fixtures.get(name) === id));
      fixtures.set(name, id);
      await deleteTeam(db, { teamId: id, name });
    }
    for (const id of fixtures.values()) assert.equal(await fixtureRows(id), 0);
    console.log('CLEANUP verified: all disposable teams and their owned rows removed.');
  }
  assert.ok(succeeded);
}

main().catch((error: unknown) => {
  const failure = error as { code?: unknown; status?: unknown };
  const code = typeof failure.code === 'string' && /^[A-Z0-9_]{2,40}$/.test(failure.code) ? failure.code : 'CHECK_FAILED';
  const location = error instanceof Error ? error.stack?.match(/test-live-concurrency\.ts:\d+:\d+/)?.[0] : undefined;
  console.error(`Concurrency check failed: ${code}${typeof failure.status === 'number' ? ` (HTTP ${failure.status})` : ''}${location ? ` at ${location}` : ''}. Review cleanup output; no credentials or SQL parameters are logged.`);
  process.exitCode = 1;
});