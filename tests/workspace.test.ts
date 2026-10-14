import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PGlite } from '@electric-sql/pglite';
import { createTeam, listTeams, mauritiusDay, readDailyMeter, resolveSelectedTeam, saveDailyMeter, selectTeam, validateDailyCheckIns, validateDailyMeter, validateTeamName, WorkspaceError } from '../src/lib/workspace-store.ts';
import { readHistory, readTeam, writeHistory, writeTeam } from '../src/lib/relational-store.ts';
import { validateTeamInput } from '../src/lib/team-validation.ts';
import catalog from '../src/lib/remote-mood-catalog.json' with { type: 'json' };

const workspace = 'a'.repeat(64); const foreignWorkspace = 'b'.repeat(64);
const original = { meterId: 'original', title: 'Baromètre original' };
const remote = { meterId: catalog[2].id, title: catalog[2].title };
const clock = new Date('2026-10-14T20:00:00.000Z');
const oldClock = new Date('2026-10-14T19:59:59.999Z');
const legacyTeam = validateTeamInput({ roster: [{ id: 'p', name: 'Élodie', present: true, mood: 2, moodUpdatedAt: oldClock.toISOString(), moodSlide: { meterId: remote.meterId, title: remote.title, image: '/mood-meters/slides/deck/slide.svg', slideNumber: 1 } }], duration: 120, warning: 30, sound: true, session: [], currentMoodSlide: null, usedMoodMeters: [remote.meterId] });
const forbidden = (error: unknown) => error instanceof WorkspaceError && error.status === 403;

test('Mauritius day boundary, strict catalogue and team-name contracts', () => {
  assert.equal(mauritiusDay(oldClock), '2026-10-14');
  assert.equal(mauritiusDay(clock), '2026-10-15');
  assert.equal(validateTeamName('  Équipe A  '), 'Équipe A');
  for (const name of ['', '   ', 'x'.repeat(61), '\nA', 'A\u0000', 1]) assert.throws(() => validateTeamName(name));
  assert.deepEqual(validateDailyMeter(original), original);
  assert.deepEqual(validateDailyMeter(remote), remote);
  for (const value of [{ ...original, title: 'Other' }, { ...remote, title: 'Fake' }, { meterId: 'local-deck', title: 'Local' }, { ...remote, extra: true }, { meterId: 'x'.repeat(201), title: 'No' }]) assert.throws(() => validateDailyMeter(value));
  assert.throws(() => validateDailyCheckIns(legacyTeam, original));
  assert.doesNotThrow(() => validateDailyCheckIns(legacyTeam, remote));
  assert.doesNotThrow(() => validateDailyCheckIns(legacyTeam, null));
});

test('migration metadata preserves every unchanged relational table and API ownership is explicit', () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const previous = JSON.parse(read('../drizzle/meta/0001_snapshot.json'));
  const next = JSON.parse(read('../drizzle/meta/0002_snapshot.json'));
  assert.equal(next.prevId, previous.id);
  assert.equal(Object.keys(next.tables).length, 12);
  for (const [name, table] of Object.entries(previous.tables)) {
    if (name !== 'public.teams') assert.deepEqual(next.tables[name], table, name);
  }
  const journal = JSON.parse(read('../drizzle/meta/_journal.json'));
  assert.equal(journal.entries[2].tag, '0002_workspace_daily_meters');
  for (const route of ['team', 'history', 'daily-meter']) {
    const source = read(`../src/app/api/${route}/route.ts`);
    assert.match(source, /GET\(request: Request\)/);
    assert.match(source, /await selectedTeam\(request\)/);
    assert.ok(!source.includes('await privateSpace()'));
  }
  assert.match(read('../src/lib/database.ts'), /request.headers.get\('X-Team-Id'\)/);
});

test('PGlite: legacy migration through 0002, workspace ownership, daily singleton and scoped histories', async () => {
  const engine = new PGlite();
  try {
    const migration = (name: string) => readFileSync(new URL(`../drizzle/${name}.sql`, import.meta.url), 'utf8');
    await engine.exec(migration('0000_spotty_the_stranger'));
    await engine.query('INSERT INTO standup_spaces(id,team,revision) VALUES($1,$2::jsonb,7)', [workspace, JSON.stringify(legacyTeam)]);
    const ancient = { id: 'ancient', completedAt: '2020-01-01T12:00:00.000Z', people: [{ id: 'p', name: 'Ancien', mood: 3, speakingSeconds: 10, budgetSeconds: 120, timeUp: false, score: 900, meterTitle: 'Ancien baromètre' }] };
    await engine.query('INSERT INTO standup_rounds(space_id,id,completed_at,result) VALUES($1,$2,$3,$4::jsonb)', [workspace, ancient.id, ancient.completedAt, JSON.stringify(ancient)]);
    for (const name of ['0001_abandoned_snowbird', '0002_workspace_daily_meters']) await engine.transaction(async tx => { await tx.exec(migration(name)); });
    assert.deepEqual((await engine.query('SELECT id,workspace_id,name,revision FROM teams')).rows, [{ id: workspace, workspace_id: workspace, name: 'Mon équipe', revision: 7 }]);
    assert.deepEqual((await engine.query('SELECT id,selected_team_id FROM workspaces')).rows, [{ id: workspace, selected_team_id: workspace }]);
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM standup_sessions')).rows[0].n, 1, 'migration preserves ancient history');
    assert.equal((await engine.query("SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows[0].n, 12);
    assert.equal((await engine.query("SELECT count(*)::int AS n FROM information_schema.columns WHERE table_schema='public' AND data_type IN ('json','jsonb')")).rows[0].n, 0);
    const dialect = new PgDialect();
    const client = {
      execute: (query: SQL) => ({ query, then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        const compiled = dialect.sqlToQuery(query);
        return engine.query(compiled.sql, compiled.params).then(resolve, reject);
      } }),
      batch: (queries: { query: SQL }[]) => engine.transaction(async tx => {
        const results = [];
        for (const { query } of queries) { const compiled = dialect.sqlToQuery(query); results.push(await tx.query(compiled.sql, compiled.params)); }
        return results;
      }),
    } as unknown as Parameters<typeof writeTeam>[0];
    const first = await listTeams(client, workspace);
    assert.deepEqual(first, { teams: [{ id: workspace, name: 'Mon équipe', memberCount: 1 }], activeTeamId: workspace });
    assert.deepEqual(await listTeams(client, workspace), first);
    const bootstrap = await Promise.all([listTeams(client, foreignWorkspace), listTeams(client, foreignWorkspace)]);
    assert.deepEqual(bootstrap[0], bootstrap[1]);
    assert.equal(bootstrap[0].teams.length, 1);
    assert.equal((await readTeam(client, foreignWorkspace)).revision, 1);
    const created = await createTeam(client, workspace, '  Deuxième  ');
    const second = created.activeTeamId!;
    assert.match(second, /^[a-f0-9]{64}$/);
    assert.notEqual(second, workspace);
    assert.equal(created.teams.length, 2);
    assert.deepEqual(await readTeam(client, second), { team: validateTeamInput({ ...legacyTeam, roster: [], usedMoodMeters: [] }), revision: 1 });
    await assert.rejects(createTeam(client, workspace, 'deuxième'), (error: unknown) => (error as { code?: string }).code === '23505');
    assert.equal((await listTeams(client, workspace)).activeTeamId, second, 'duplicate transaction cannot alter selection');
    assert.equal((await createTeam(client, foreignWorkspace, 'Deuxième')).teams.length, 2, 'names scoped to workspace');
    assert.equal(await resolveSelectedTeam(client, workspace), second);
    assert.equal(await resolveSelectedTeam(client, workspace, workspace), workspace, 'explicit header takes precedence');
    for (const id of [foreignWorkspace, 'f'.repeat(64), '', 'bad']) await assert.rejects(resolveSelectedTeam(client, workspace, id), forbidden);
    await assert.rejects(resolveSelectedTeam(client, 'c'.repeat(64), workspace), forbidden);
    await assert.rejects(selectTeam(client, workspace, foreignWorkspace), forbidden);
    await assert.rejects(selectTeam(client, workspace, 'e'.repeat(64)), forbidden);
    assert.equal((await selectTeam(client, workspace, workspace)).activeTeamId, workspace);
    await engine.query('UPDATE workspaces SET selected_team_id=$1 WHERE id=$2', [foreignWorkspace, workspace]);
    await assert.rejects(resolveSelectedTeam(client, workspace), forbidden);
    assert.equal((await listTeams(client, workspace)).activeTeamId !== foreignWorkspace, true, 'repairs foreign selection');
    await engine.query('UPDATE workspaces SET selected_team_id=NULL WHERE id=$1', [workspace]);
    assert.ok((await listTeams(client, workspace)).activeTeamId);

    assert.deepEqual(await readTeam(client, workspace, oldClock), { team: legacyTeam, revision: 7 });
    const expired = await readTeam(client, workspace, clock);
    assert.deepEqual(expired.team!.roster[0], { ...legacyTeam.roster[0], mood: null, moodUpdatedAt: null, moodSlide: null });
    assert.deepEqual(await readTeam(client, workspace, oldClock), { team: legacyTeam, revision: 7 }, 'expiration does not write DB');
    await engine.query('UPDATE participant_check_ins SET mood_updated_at=NULL WHERE team_id=$1', [workspace]);
    assert.equal((await readTeam(client, workspace, oldClock)).team!.roster[0].mood, null, 'null legacy timestamps expire');

    assert.deepEqual(await readDailyMeter(client, workspace, clock), { day: '2026-10-15', meter: null });
    const race = await Promise.all([saveDailyMeter(client, workspace, original, clock), saveDailyMeter(client, workspace, remote, clock)]);
    assert.deepEqual(race[0], race[1], 'both concurrent calls return authoritative first selection');
    assert.ok([original.meterId, remote.meterId].includes(race[0].meter!.meterId));
    assert.deepEqual(await saveDailyMeter(client, workspace, remote, clock), race[0], 'cannot replace same day');
    assert.deepEqual(await saveDailyMeter(client, second, remote, clock), { day: '2026-10-15', meter: remote }, 'team-scoped singleton');
    assert.deepEqual(await saveDailyMeter(client, workspace, remote, oldClock), { day: '2026-10-14', meter: remote }, 'day-scoped singleton');
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM team_daily_meters WHERE team_id=$1 AND day=$2', [workspace, '2026-10-15'])).rows[0].n, 1);
    await assert.rejects(engine.query('INSERT INTO team_daily_meters(team_id,day,meter_id,title) VALUES($1,$2,$3,$4)', [workspace, '2026-10-16', 'unregistered', 'X']), 'registry FK enforced');
    // Test real write gate with the actual server date (in-memory DB only).
    await saveDailyMeter(client, second, original);
    const matching = validateTeamInput({ ...legacyTeam, roster: [{ ...legacyTeam.roster[0], moodUpdatedAt: new Date().toISOString(), moodSlide: { ...legacyTeam.roster[0].moodSlide!, meterId: original.meterId, title: original.title } }] });
    const todaysMeter = (await readDailyMeter(client, second)).meter!;
    matching.roster[0].moodSlide!.meterId = todaysMeter.meterId;
    assert.equal(await writeTeam(client, second, 1, matching), 2);
    const mismatched = validateTeamInput({ ...matching, roster: [{ ...matching.roster[0], moodSlide: { ...matching.roster[0].moodSlide!, meterId: 'another' } }] });
    assert.equal(await writeTeam(client, second, 2, mismatched), null, 'daily consistency guarded atomically');
    assert.equal((await readTeam(client, second)).revision, 2);
    const builtInTeam = (await createTeam(client, workspace, 'Baromètre original')).activeTeamId!;
    await saveDailyMeter(client, builtInTeam, original);
    const noSlide = validateTeamInput({ ...matching, roster: [{ ...matching.roster[0], moodSlide: null }] });
    assert.equal(await writeTeam(client, builtInTeam, 1, noSlide), 2, 'built-in meter needs no image reference');
    await assert.rejects(engine.query('INSERT INTO teams(id,workspace_id,name,duration,warning,sound) VALUES($1,$2,$3,120,30,true)', ['not-64-hex', workspace, 'Invalid ID']), 'existing ID constraint retained');
    const round = { ...ancient, id: 'shared-round-id', completedAt: new Date().toISOString() };
    assert.equal(await writeHistory(client, workspace, round), true);
    assert.equal(await writeHistory(client, second, { ...round, people: [{ ...round.people[0], name: 'Autre équipe' }] }), true);
    assert.deepEqual(await readHistory(client, workspace), [round]);
    assert.equal((await readHistory(client, second))[0].people[0].name, 'Autre équipe');
    assert.deepEqual(await readHistory(client, foreignWorkspace), []);
    // Same ID continues to represent the same selected-team capability after reload.
    assert.equal(await resolveSelectedTeam(client, workspace, workspace), workspace);
    assert.equal((await listTeams(client, workspace)).teams.find(t => t.id === second)!.memberCount, 1);
  } finally { await engine.close(); }
});