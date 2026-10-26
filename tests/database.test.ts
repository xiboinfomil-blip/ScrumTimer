import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { PgDialect } from 'drizzle-orm/pg-core';
import { readFileSync } from 'node:fs';
import * as schema from '../src/db/schema.ts';
import { teamWriteStatements, historyWriteStatements } from '../src/lib/relational-store.ts';
import { validateTeamInput, validateTeamRequest, validateHistoryInput } from '../src/lib/team-validation.ts';
import { writeTeam, writeHistory, readTeam, readHistory } from '../src/lib/relational-store.ts';
import { createTeam, listTeams } from '../src/lib/workspace-store.ts';

const team = { roster: [{ id: 'person-1', name: "Élodie <script>'", present: true, mood: 2, moodUpdatedAt: '2026-10-14T10:00:00.000Z', moodSlide: { title: 'Meter', image: '/mood-meters/slides/deck/slide.svg', slideNumber: 1, meterId: 'deck' } }], duration: 120, warning: 30, sound: true, session: [], currentMoodSlide: null, usedMoodMeters: ['deck'] };
const now = new Date('2026-10-14T12:00:00Z');
const round = { id: 'round-1', completedAt: now.toISOString(), people: [{ id: 'person-1', name: 'Élodie', mood: null, speakingSeconds: 12.5, budgetSeconds: 120, timeUp: false, score: null, meterTitle: null }] };

test('normalized schema has no JSON columns, scoped identity keys and relational integrity', () => {
  const configs = Object.values(schema).map(getTableConfig);
  assert.equal(configs.length, 18);
  for (const table of configs) {
    for (const column of table.columns) assert.ok(!/json/i.test(column.getSQLType()), `${table.name}.${column.name}`);
    if (!['teams', 'workspaces'].includes(table.name) && !table.name.startsWith('remote_mood_')) {
      assert.equal(table.primaryKeys[0].columns[0].name, 'team_id');
      assert.ok(table.foreignKeys.length > 0);
    }
    assert.ok(table.checks.length > 0, table.name);
  }
  const turns = getTableConfig(schema.speakingTurns);
  assert.deepEqual(turns.primaryKeys[0].columns.map(c => c.name), ['team_id', 'session_id', 'participant_id']);
  assert.equal(turns.foreignKeys.find(fk => fk.reference().foreignTable === schema.participants)?.onDelete, 'no action');
  assert.equal(getTableConfig(schema.teamMembers).foreignKeys[0].onDelete, 'cascade');
  assert.deepEqual(getTableConfig(schema.standupSessions).indexes[0].config.columns.map(c => 'name' in c ? c.name : null), ['team_id', 'completed_at']);
});
test('team CAS and ALL child writes use unique transaction gates and parameters', () => {
  const id = "private'; DROP TABLE teams; --";
  const statements = teamWriteStatements(id, 4, validateTeamInput(team)).map(s => new PgDialect().sqlToQuery(s));
  assert.match(statements[0].sql, /revision=revision\+1/);
  assert.match(statements[0].sql, /AND revision=\$\d+/);
  assert.ok(statements[0].params.includes(4));
  for (const statement of statements) {
    assert.ok(!statement.sql.includes(id));
    assert.ok(!statement.sql.includes(team.roster[0].name));
    assert.ok(statement.params.includes(id));
    assert.match(statement.sql, /txid_current\(\)/);
  }
  for (const child of statements.slice(1)) assert.match(child.sql, /EXISTS \(SELECT 1 FROM teams WHERE id=\$\d+ AND write_transaction=txid_current\(\)\)/);
  assert.ok(!statements.some(s => /DELETE FROM participants/.test(s.sql)), 'identities survive removal');
  assert.match(new PgDialect().sqlToQuery(teamWriteStatements(id, 0, validateTeamInput(team))[0]).sql, /UPDATE teams/);
});
test('history writes serialize on the private team and idempotently gate all children', () => {
  const statements = historyWriteStatements('private-id', validateHistoryInput(round, now), now).map(s => new PgDialect().sqlToQuery(s));
  assert.match(statements[0].sql, /FOR UPDATE/);
  assert.match(statements[1].sql, /ON CONFLICT DO NOTHING RETURNING id/);
  for (const s of statements.slice(2, 5)) {
    assert.match(s.sql, /write_transaction=txid_current\(\)/);
    assert.ok(s.params.includes('round-1'));
    assert.ok(!s.sql.includes('private-id'));
  }
  assert.match(statements[5].sql, /WHERE team_id=\$\d+ AND completed_at/);
  assert.ok(statements[5].params.includes('2026-10-10T00:00:00.000Z'));
  assert.match(statements[6].sql, /DELETE FROM participant_daily_hints WHERE team_id=\$\d+ AND EXISTS/);
  assert.match(statements[6].sql, /write_transaction=txid_current\(\)/);
  assert.ok(statements[6].params.includes('round-1'));
});
test('strict team validation accepts exact contracts and rejects malformed input without normalization', () => {
  assert.deepEqual(validateTeamInput(team).roster, team.roster);
  assert.equal(validateTeamRequest({ team, revision: 0 }).revision, 0);
  for (const override of [{ duration: 0 }, { duration: 3660 }, { duration: 1.5 }, { warning: 12 }, { sound: 1 }, { unknown: true }, { usedMoodMeters: ['deck', 'deck'] }, { session: ['unknown'] }]) assert.throws(() => validateTeamInput({ ...team, ...override }));
  for (const override of [{ id: '' }, { id: 'a'.repeat(101) }, { name: ' Élodie ' }, { name: 'a'.repeat(61) }, { name: 'E\n' }, { mood: 5 }, { present: 1 }, { moodUpdatedAt: 'invalid' }, { moodSlide: { title: 'M', image: '/mood-meters/slides/../s.svg', slideNumber: 1 } }, { moodSlide: { ...team.roster[0].moodSlide, title: 'x'.repeat(201) } }]) assert.throws(() => validateTeamInput({ ...team, roster: [{ ...team.roster[0], ...override }] }));
  assert.throws(() => validateTeamInput({ ...team, roster: [team.roster[0], team.roster[0]] }));
  assert.throws(() => validateTeamRequest({ team, revision: 2147483647 }));
  assert.equal(validateTeamInput({ ...team, session: ['person-1'], currentMoodSlide: team.roster[0].moodSlide }).currentMoodSlide, null);
});
test('strict history validates every field and never clips scores, names, titles or counts', () => {
  assert.deepEqual(validateHistoryInput(round, now), round);
  for (const override of [{ score: 1001 }, { score: 0.5 }, { score: -1 }, { name: 'a'.repeat(61) }, { mood: 0 }, { id: '' }, { meterTitle: 'x'.repeat(201) }, { speakingSeconds: Infinity }, { budgetSeconds: -1 }, { timeUp: 0 }, { unknown: 1 }]) assert.throws(() => validateHistoryInput({ ...round, people: [{ ...round.people[0], ...override }] }, now));
  for (const people of [[], Array.from({ length: 101 }, (_, i) => ({ ...round.people[0], id: String(i) })), [round.people[0], round.people[0]]]) assert.throws(() => validateHistoryInput({ ...round, people }, now));
  assert.throws(() => validateHistoryInput({ ...round, completedAt: '2026-10-04T00:00:00Z' }, now));
  assert.throws(() => validateHistoryInput({ ...round, completedAt: '2026-10-15T00:00:00Z' }, now));
});
test('migration verifies all legacy data before dropping tables and never prunes old history', () => {
  const migration = readFileSync(new URL('../drizzle/0001_abandoned_snowbird.sql', import.meta.url), 'utf8');
  assert.ok(migration.indexOf('DROP TABLE standup_rounds') > migration.indexOf('Legacy row count verification failed'));
  assert.match(migration, /LOCK TABLE standup_spaces, standup_rounds IN ACCESS EXCLUSIVE MODE/);
  assert.match(migration, /actual IS DISTINCT FROM old_round.result->'people'/);
  assert.match(migration, /actual IS DISTINCT FROM expected/);
  assert.ok(!/DELETE FROM|completed_at\s*</i.test(migration));
  assert.ok(!/CREATE TABLE[\s\S]*?"\w+" jsonb/.test(migration));
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.scripts['db:migrate'], 'drizzle-kit migrate');
  const config = readFileSync(new URL('../drizzle.config.ts', import.meta.url), 'utf8');
  assert.match(config, /dialect: 'postgresql'/);
  assert.match(config, /out: '\.\/drizzle'/);
  assert.match(config, /schema: 'drizzle', table: '__drizzle_migrations'/);
});

// Mandatory genuine PostgreSQL integration. Never connects to Neon.
test('PostgreSQL: legacy backfill, CAS isolation, atomic rollback, scoped reads and history idempotency', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const engine = new PGlite();
  const id = 'a'.repeat(64); let other = 'b'.repeat(64);
  const legacy = readFileSync(new URL('../drizzle/0000_spotty_the_stranger.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../drizzle/0001_abandoned_snowbird.sql', import.meta.url), 'utf8');
  const old = { ...round, id: 'ancient', completedAt: '2020-01-01T12:00:00.000Z', people: [{ ...round.people[0], id: 'removed', name: 'Ancien nom', meterTitle: 'Ancient meter' }] };
  await engine.exec(legacy);
  await engine.query('INSERT INTO standup_spaces(id,team,revision) VALUES($1,$2::jsonb,7)', [id, JSON.stringify(team)]);
  await engine.query('INSERT INTO standup_rounds(space_id,id,completed_at,result) VALUES($1,$2,$3,$4::jsonb)', [id, old.id, old.completedAt, JSON.stringify(old)]);
  // An unsupported value must roll back DDL AND conversion, preserving legacy.
  await engine.query("UPDATE standup_spaces SET team=jsonb_set(team,'{warning}','12')");
  await assert.rejects(engine.transaction(async (tx: typeof engine) => { await tx.exec(migration); }));
  assert.equal((await engine.query("SELECT to_regclass('teams') AS table")).rows[0].table, null);
  assert.equal((await engine.query('SELECT count(*)::int AS n FROM standup_rounds')).rows[0].n, 1);
  await engine.query("UPDATE standup_spaces SET team=jsonb_set(team,'{warning}','30')");
  await engine.transaction(async (tx: typeof engine) => { await tx.exec(migration); });
  await engine.transaction(async (tx: typeof engine) => { await tx.exec(readFileSync(new URL('../drizzle/0002_workspace_daily_meters.sql', import.meta.url), 'utf8')); });
  for (const name of ['0004_slim_emma_frost', '0005_tired_black_bird', '0006_pretty_shiver_man', '0007_remove_unused_workspace_selection', '0008_remove_unused_round_feedback', '0009_remove_unused_audit_timestamps']) {
    await engine.exec(readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8'));
  }
  assert.equal((await engine.query('SELECT count(*)::int AS n FROM standup_sessions')).rows[0].n, 1, 'old history converted before retention');
  assert.equal((await engine.query("SELECT to_regclass('standup_spaces') AS table")).rows[0].table, null);
  assert.equal((await engine.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('json','jsonb')")).rows[0].n, 0);
  const client = {
    execute: (query: import('drizzle-orm').SQL) => {
      // Lazy thenable matches Drizzle execute's batch-safe behavior.
      return { query, then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        const compiled = new PgDialect().sqlToQuery(query);
        return engine.query(compiled.sql, compiled.params).then(resolve, reject);
      } };
    },
    batch: (queries: { query: import('drizzle-orm').SQL }[]) => engine.transaction(async (tx: typeof engine) => {
      const results = [];
      for (const query of queries) {
        const compiled = new PgDialect().sqlToQuery(query.query);
        results.push(await tx.query(compiled.sql, compiled.params));
      }
      return results;
    }),
  } as unknown as Parameters<typeof writeTeam>[0];
  assert.deepEqual(await readTeam(client, id, now), { team: validateTeamInput(team), revision: 7 });
  assert.deepEqual(await readTeam(client, other), { team: null, revision: 0 });
  const changed = validateTeamInput({ ...team, roster: [{ ...team.roster[0], name: 'Renommée' }], usedMoodMeters: [] });
  assert.equal(await writeTeam(client, id, 7, changed), 8);
  const before = await readTeam(client, id, now);
  assert.equal(await writeTeam(client, id, 7, validateTeamInput({ ...team, roster: [], usedMoodMeters: ['stale-meter'] })), null);
  assert.equal(await writeTeam(client, id, 0, validateTeamInput(team)), null);
  assert.deepEqual(await readTeam(client, id, now), before);
  assert.equal((await engine.query('SELECT count(*)::int AS n FROM mood_meter_identifiers WHERE id=$1', ['stale-meter'])).rows[0].n, 0);
  const invalid = { ...changed, roster: [{ ...changed.roster[0], name: 'x'.repeat(61) }] };
  await assert.rejects(writeTeam(client, id, 8, invalid));
  assert.deepEqual(await readTeam(client, id, now), before, 'child failure rolls back parent CAS');
  assert.equal(await writeHistory(client, other, { ...round, completedAt: new Date().toISOString() }), false);
  // Use actual current time because writeHistory's retention is a runtime policy.
  const current = { ...round, completedAt: new Date().toISOString() };
  assert.equal(await writeHistory(client, id, validateHistoryInput(current)), true);
  assert.equal(await writeHistory(client, id, validateHistoryInput({ ...current, people: [{ ...current.people[0], name: 'Duplicate must not overwrite' }] })), true);
  assert.deepEqual(await readHistory(client, id), [current]);
  assert.deepEqual(await readHistory(client, other), []);
  await listTeams(client);
  other = (await createTeam(client, 'Autre équipe')).activeTeamId!;
  assert.equal(await writeTeam(client, other, 1, validateTeamInput(team)), 2, 'same participant IDs work in another private team');
  assert.equal(await writeHistory(client, other, validateHistoryInput(current)), true, 'same round ID is scoped to team');
  assert.deepEqual(await readHistory(client, other), [current]);
  const reordered = validateTeamInput({ ...team, roster: [{ ...team.roster[0], id: 'person-2', name: 'Deuxième', present: false }, { ...team.roster[0], moodSlide: { ...team.roster[0].moodSlide, meterId: undefined } }] });
  assert.equal(await writeTeam(client, other, 2, reordered), 3);
  assert.deepEqual(await readTeam(client, other, now), { team: reordered, revision: 3 });
  assert.equal((await engine.query('SELECT count(*)::int AS n FROM mood_meter_slides WHERE team_id=$1', [other])).rows[0].n, 1, 'shared slide metadata stored once');
  assert.equal(await writeTeam(client, id, 8, validateTeamInput({ ...team, roster: [] })), 9);
  assert.deepEqual(await readHistory(client, id), [current], 'removal preserves historical identity and name');
  assert.equal((await engine.query('SELECT count(*)::int AS n FROM participants WHERE team_id=$1 AND id=$2', [id, 'removed'])).rows[0].n, 1);
  // Five-day retention deletes actual rows and cascades only their speaking
  // turns. Exact midnight is retained; one millisecond earlier is expired.
  for (const owner of [id, other]) {
    for (const [session, completedAt] of [['boundary', '2026-10-10T00:00:00Z'], ['expired', '2026-10-09T23:59:59.999Z']]) {
      await engine.query('INSERT INTO standup_sessions(team_id,id,completed_at) VALUES($1,$2,$3)', [owner, session, completedAt]);
      await engine.query("INSERT INTO speaking_turns(team_id,session_id,participant_id,position,name_snapshot,mood,speaking_seconds,budget_seconds,time_up,score) VALUES($1,$2,'person-1',0,'Retained identity',2,20,120,false,900)", [owner, session]);
    }
  }
  const retained = await readHistory(client, id, now);
  assert.ok(retained.some(result => result.id === 'boundary'));
  assert.ok(!retained.some(result => result.id === 'expired'));
  assert.equal((await engine.query("SELECT count(*)::int AS n FROM speaking_turns WHERE team_id=$1 AND session_id='expired'", [id])).rows[0].n, 0);
  assert.equal((await engine.query("SELECT count(*)::int AS n FROM standup_sessions WHERE team_id=$1 AND id='expired'", [other])).rows[0].n, 1, 'another team is not pruned by this read');
  const statements = historyWriteStatements(other, { ...round, id: 'retention-write' }, now);
  await client.batch(statements.map(statement => client.execute(statement)) as Parameters<typeof client.batch>[0]);
  assert.equal((await engine.query("SELECT count(*)::int AS n FROM standup_sessions WHERE team_id=$1 AND id='expired'", [other])).rows[0].n, 0, 'saving a result also prunes expired history');
  assert.equal((await engine.query("SELECT count(*)::int AS n FROM speaking_turns WHERE team_id=$1 AND session_id='expired'", [other])).rows[0].n, 0);
  assert.equal((await engine.query("SELECT count(*)::int AS n FROM standup_sessions WHERE team_id=$1 AND id='boundary'", [other])).rows[0].n, 1);
  assert.equal((await engine.query("SELECT count(*)::int AS n FROM participants WHERE id='person-1'")).rows[0].n, 2, 'participant identities survive retention');
  assert.equal((await engine.query('SELECT count(*)::int AS n FROM teams')).rows[0].n, 2);
  await engine.close();
});