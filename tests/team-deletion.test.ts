import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { createTeam, deleteTeam, listTeams, WorkspaceError } from '../src/lib/workspace-store.ts';

const sharedWorkspace = '0'.repeat(64);
const legacyWorkspace = 'a'.repeat(64);
const anotherWorkspace = 'b'.repeat(64);
const deckId = 'deck-aaaaaaaaaaaaaaaaaaaa';
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const hasStatus = (status: number) => (error: unknown) => error instanceof WorkspaceError && error.status === status;
const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

async function migratedDatabase() {
  const engine = new PGlite();
  try {
    const journal = JSON.parse(read('../drizzle/meta/_journal.json')) as { entries: { tag: string }[] };
    assert.ok(journal.entries.some(entry => entry.tag.startsWith('0004_')), 'meeting/feedback migration must be exercised');
    for (const { tag } of journal.entries) {
      await engine.transaction(async tx => { await tx.exec(read(`../drizzle/${tag}.sql`)); });
    }
    return engine;
  } catch (error) { await engine.close(); throw error; }
}

function clientFor(engine: PGlite, beforeQuery?: (statement: string) => void) {
  const dialect = new PgDialect();
  // Like neon-http, execute is lazy and batch executes all statements in ONE
  // transaction. A failed later statement must roll back earlier reference clears.
  return {
    execute: (query: SQL) => ({ query, then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      const compiled = dialect.sqlToQuery(query);
      return engine.query(compiled.sql, compiled.params).then(resolve, reject);
    } }),
    batch: (queries: { query: SQL }[]) => engine.transaction(async tx => {
      const results = [];
      for (const { query } of queries) {
        const compiled = dialect.sqlToQuery(query);
        beforeQuery?.(compiled.sql);
        results.push(await tx.query(compiled.sql, compiled.params));
      }
      return results;
    }),
  } as unknown as Parameters<typeof deleteTeam>[0];
}

async function teamTables(engine: PGlite) {
  const result = await engine.query<{ table_name: string }>(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='team_id' ORDER BY table_name`);
  return result.rows.map(row => row.table_name);
}

async function snapshot(engine: PGlite, tables: string[]) {
  const result: Record<string, unknown[]> = {};
  for (const table of tables) {
    result[table] = (await engine.query(`SELECT * FROM ${quote(table)} ORDER BY to_jsonb(${quote(table)})::text`)).rows;
  }
  return result;
}

async function seedOwnedRows(engine: PGlite, teamId: string) {
  // Both teams deliberately reuse ALL participant/session/meter/slide IDs.
  // Include an archived participant absent from the current roster, too.
  await engine.transaction(async tx => {
    const insert = (statement: string) => tx.query(statement, [teamId]);
    await insert(`INSERT INTO participants(team_id,id,name) VALUES($1,'person','Élodie'),($1,'archived','Ancien')`);
    await insert(`INSERT INTO team_members(team_id,participant_id,position,present) VALUES($1,'person',0,true)`);
    await insert(`INSERT INTO mood_meter_identifiers(team_id,id) VALUES($1,'${deckId}')`);
    await insert(`INSERT INTO mood_meters(team_id,id,title) VALUES($1,'meter','Baromètre partagé')`);
    await insert(`INSERT INTO mood_meter_slides(team_id,id,meter_id,image,slide_number) VALUES($1,'slide','meter','/mood-meters/slides/deck/slide.svg',1)`);
    await insert(`INSERT INTO participant_check_ins(team_id,participant_id,mood,mood_updated_at,slide_id,identifier_id) VALUES($1,'person',3,'2026-10-15T08:00:00Z','slide','${deckId}')`);
    await insert(`INSERT INTO team_used_mood_meters(team_id,identifier_id,position) VALUES($1,'${deckId}',0)`);
    await insert(`INSERT INTO team_daily_meters(team_id,day,meter_id,title) VALUES($1,'2026-10-15','${deckId}','Baromètre partagé')`);
    await insert(`INSERT INTO standup_sessions(team_id,id,completed_at) VALUES($1,'round','2026-10-15T08:30:00Z')`);
    await insert(`INSERT INTO speaking_turns(team_id,session_id,participant_id,position,name_snapshot,mood,speaking_seconds,budget_seconds,time_up,score,meter_id) VALUES($1,'round','person',0,'Élodie',3,60,120,false,1000,'meter'),($1,'round','archived',1,'Ancien',2,130,120,true,917,'meter')`);
    await insert(`INSERT INTO round_feedback(team_id,session_id,participant_id,value) VALUES($1,'round','person','utile'),($1,'round','archived','mitige')`);
    await insert(`INSERT INTO team_meeting_settings(team_id,revision,write_transaction) VALUES($1,2,17)`);
    await insert(`INSERT INTO team_discussion_prompts(team_id,position,prompt) VALUES($1,0,'Un obstacle ?'),($1,1,'Une réussite ?')`);
  });
}

async function seedGlobals(engine: PGlite, selectedTeamId: string) {
  await engine.query(`INSERT INTO workspaces(id,selected_team_id) VALUES($1,$3),($2,$3)`, [legacyWorkspace, anotherWorkspace, selectedTeamId]);
  await engine.query(`UPDATE workspaces SET selected_team_id=$1 WHERE id=$2`, [selectedTeamId, sharedWorkspace]);
  await engine.query(`INSERT INTO remote_mood_cache_state(id,generation,expires_at) VALUES(1,'keep-generation','2026-10-22T00:00:00Z')`);
  await engine.query(`INSERT INTO remote_mood_catalog(id,google_id,title,category,loaded_at) VALUES($1,'google_shared','Baromètre partagé','Movies','2026-10-15T00:00:00Z')`, [deckId]);
  await engine.query(`INSERT INTO remote_mood_pages(deck_id,position,page_id) VALUES($1,0,'p.shared')`, [deckId]);
}

test('DELETE teams route requires same-origin strict JSON and delegates exact-name confirmation to the transactional store', () => {
  const route = read('../src/app/api/teams/route.ts');
  const handler = route.slice(route.indexOf('export async function DELETE('));
  assert.match(handler, /DELETE\(request: Request\)/);
  assert.match(handler, /if \(!sameOrigin\(request\)\) return new NextResponse\(null, \{ status: 403 \}\)/);
  assert.match(handler, /strictObject\(await readJson\(request\), \['teamId', 'name'\]\)/);
  assert.match(handler, /capabilityId\(input.teamId\)/);
  assert.match(handler, /validateTeamName\(input.name\)/);
  assert.match(handler, /response\(await teamReadCache\.mutate\(\(\) => deleteTeam\(database\(\), input\)\)\)/);
  assert.ok(handler.indexOf('sameOrigin(request)') < handler.indexOf('readJson(request)'));
  assert.ok(handler.indexOf('readJson(request)') < handler.indexOf('database()'));
  assert.doesNotMatch(handler, /input.name\s*=|selectTeam\(/, 'never normalize confirmation or switch to another team before deleting');
});

test('PGlite: dependent-first team deletion cascades remaining ownership, clears legacy references, and preserves other teams and global data', async () => {
  const engine = await migratedDatabase();
  try {
    const statements: string[] = [];
    const client = clientFor(engine, statement => { statements.push(statement); });
    const target = (await listTeams(client)).teams[0];
    const second = (await createTeam(client, 'Autre équipe')).activeTeamId!;
    await seedOwnedRows(engine, target.id);
    await seedOwnedRows(engine, second);
    await seedGlobals(engine, target.id);
    // One legacy reference selects the surviving team and must not be cleared.
    await engine.query('UPDATE workspaces SET selected_team_id=$1 WHERE id=$2', [second, anotherWorkspace]);
    const tables = await teamTables(engine);
    assert.equal(tables.length, 13, 'all current team_id tables, including migration 0004');
    const before = await snapshot(engine, ['teams', ...tables, 'workspaces', 'remote_mood_cache_state', 'remote_mood_catalog', 'remote_mood_pages']);
    for (const table of tables) assert.ok(before[table].some(row => (row as { team_id: string }).team_id === target.id), `${table} must be populated before deletion`);
    statements.length = 0;
    const deleted = await deleteTeam(client, { teamId: target.id, name: target.name });
    assert.deepEqual(deleted, { teams: [{ id: second, name: 'Autre équipe', memberCount: 1 }], activeTeamId: second });
    assert.match(statements[1], /FROM workspaces .*FOR UPDATE/);
    assert.match(statements[2], /FROM teams .*FOR UPDATE/);
    assert.match(statements[3], /^UPDATE workspaces /);
    assert.match(statements[4], /^DELETE FROM participant_check_ins /);
    assert.match(statements[5], /^DELETE FROM team_daily_meters /);
    assert.match(statements[6], /^DELETE FROM standup_sessions /);
    for (const statement of statements.slice(3, 7)) {
      assert.match(statement, /AND EXISTS\(SELECT 1 FROM teams WHERE id=\$\d+ AND name=\$\d+\)/, 'every pre-root mutation requires exact target ID and name');
    }
    assert.match(statements[7], /^DELETE FROM teams WHERE id=\$\d+ AND name=\$\d+ RETURNING id/);
    assert.equal(statements.filter(statement => /^DELETE /i.test(statement)).length, 4, 'three dependent deletes precede the root cascade for remaining ownership');
    const after = await snapshot(engine, Object.keys(before));
    assert.deepEqual(after.teams, before.teams.filter(row => (row as { id: string }).id !== target.id));
    for (const table of tables) {
      assert.deepEqual(after[table], before[table].filter(row => (row as { team_id: string }).team_id !== target.id), `${table}: target zero, other team byte-for-byte unchanged`);
    }
    assert.deepEqual(after.workspaces, before.workspaces.map(row => {
      const workspace = row as { selected_team_id: string | null };
      return workspace.selected_team_id === target.id ? { ...workspace, selected_team_id: null } : workspace;
    }), 'all namespaces survive, only references to the deleted team are cleared');
    for (const table of ['remote_mood_cache_state', 'remote_mood_catalog', 'remote_mood_pages']) assert.deepEqual(after[table], before[table], table);
    assert.deepEqual(await listTeams(clientFor(engine)), deleted, 'GET/reload sees the authoritative surviving roster');
  } finally { await engine.close(); }
});

test('PGlite: initial bootstrap is singleton, last deletion stays empty across GET/reload, explicit recreation works', async () => {
  const engine = await migratedDatabase();
  try {
    const client = clientFor(engine);
    const [first, concurrent] = await Promise.all([listTeams(client), listTeams(client)]);
    assert.deepEqual(concurrent, first);
    assert.deepEqual(first, { teams: [{ id: sharedWorkspace, name: 'Mon équipe', memberCount: 0 }], activeTeamId: sharedWorkspace });
    const empty = { teams: [], activeTeamId: null };
    assert.deepEqual(await deleteTeam(client, { teamId: sharedWorkspace, name: 'Mon équipe' }), empty);
    for (let reload = 0; reload < 3; reload++) assert.deepEqual(await listTeams(clientFor(engine)), empty);
    assert.deepEqual((await engine.query('SELECT id,selected_team_id FROM workspaces')).rows, [{ id: sharedWorkspace, selected_team_id: null }]);
    const created = await createTeam(clientFor(engine), 'Mon équipe');
    assert.equal(created.teams.length, 1);
    assert.equal(created.teams[0].name, 'Mon équipe');
    assert.notEqual(created.activeTeamId, sharedWorkspace, 'explicit recreation gets a new identity');
    assert.deepEqual(await listTeams(clientFor(engine)), created);
    // Global serialization also covers concurrent create/list/delete batches.
    const [removed, added, listed] = await Promise.all([
      deleteTeam(client, { teamId: created.activeTeamId, name: 'Mon équipe' }),
      createTeam(client, 'Après suppression'),
      listTeams(client),
    ]);
    assert.deepEqual(removed, empty);
    assert.equal(added.teams.length, 1);
    assert.deepEqual(listed, added);
  } finally { await engine.close(); }
});

test('PGlite: legacy teams suppress the initial default without changing ownership or references', async () => {
  const engine = await migratedDatabase();
  try {
    await engine.query('INSERT INTO workspaces(id) VALUES($1)', [legacyWorkspace]);
    await engine.query(`INSERT INTO teams(id,workspace_id,name,duration,warning,sound) VALUES($1,$1,'Mon équipe',120,30,true)`, [legacyWorkspace]);
    await engine.query('UPDATE workspaces SET selected_team_id=$1 WHERE id=$1', [legacyWorkspace]);
    const client = clientFor(engine);
    const initial = { teams: [{ id: legacyWorkspace, name: 'Mon équipe', memberCount: 0 }], activeTeamId: legacyWorkspace };
    assert.deepEqual(await listTeams(client), initial);
    assert.deepEqual(await listTeams(client), initial);
    assert.equal((await engine.query('SELECT workspace_id FROM teams')).rows[0].workspace_id, legacyWorkspace);
    assert.equal((await engine.query('SELECT selected_team_id FROM workspaces WHERE id=$1', [legacyWorkspace])).rows[0].selected_team_id, legacyWorkspace);
    assert.deepEqual(await deleteTeam(client, { teamId: legacyWorkspace, name: 'Mon équipe' }), { teams: [], activeTeamId: null });
    assert.deepEqual(await listTeams(clientFor(engine)), { teams: [], activeTeamId: null });
  } finally { await engine.close(); }
});

test('PGlite: malformed, missing and non-exact confirmations never mutate rows; transaction failures roll back reference clearing and cascades', async () => {
  const engine = await migratedDatabase();
  try {
    const client = clientFor(engine);
    const target = (await listTeams(client)).teams[0];
    await seedOwnedRows(engine, target.id);
    await seedGlobals(engine, target.id);
    const tables = ['teams', ...await teamTables(engine), 'workspaces', 'remote_mood_cache_state', 'remote_mood_catalog', 'remote_mood_pages'];
    const before = await snapshot(engine, tables);
    const malformed: unknown[] = [null, [], '', {}, { teamId: target.id }, { name: target.name }, { teamId: target.id, name: target.name, extra: true },
      ...['bad', 'A'.repeat(64), null, 123].map(teamId => ({ teamId, name: target.name })),
      ...[null, 12, '', ' ', '\nMon équipe', 'x'.repeat(61)].map(name => ({ teamId: target.id, name }))];
    for (const input of malformed) await assert.rejects(deleteTeam(client, input), hasStatus(400));
    for (const name of ['mon équipe', 'Mon equipe', ' Mon équipe', 'Mon équipe ', 'Autre équipe']) {
      await assert.rejects(deleteTeam(client, { teamId: target.id, name }), hasStatus(409));
      assert.deepEqual(await snapshot(engine, tables), before, `exact-name mismatch ${JSON.stringify(name)} cannot clear legacy selections`);
    }
    await assert.rejects(deleteTeam(client, { teamId: 'f'.repeat(64), name: target.name }), hasStatus(404));
    assert.deepEqual(await snapshot(engine, tables), before, 'invalid/nonexistent inputs leave all rows unchanged');
    for (const failAt of [/^DELETE FROM participant_check_ins /, /^DELETE FROM team_daily_meters /, /^DELETE FROM standup_sessions /, /^DELETE FROM teams /, /^SELECT t.id,t.name/]) {
      const failingClient = clientFor(engine, statement => { if (failAt.test(statement)) throw new Error('injected transactional failure'); });
      await assert.rejects(deleteTeam(failingClient, { teamId: target.id, name: target.name }), /injected transactional failure/);
      assert.deepEqual(await snapshot(engine, tables), before, 'rollback restores legacy references and even already-cascaded child rows');
    }
    await deleteTeam(client, { teamId: target.id, name: target.name });
    const after = await snapshot(engine, tables);
    await assert.rejects(deleteTeam(client, { teamId: target.id, name: target.name }), hasStatus(404));
    assert.deepEqual(await snapshot(engine, tables), after, 'repeated deletion cannot recreate or mutate the deleted team');
  } finally { await engine.close(); }
});