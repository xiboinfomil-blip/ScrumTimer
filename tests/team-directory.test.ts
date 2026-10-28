import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { filterTeams, isTeamCategory, teamCategories, validateTeamCategory, validateTeamCreation, validateTeamDirectoryPatch } from '../src/lib/team/team-directory.ts';
import { createTeam, deleteTeam, listTeams, selectTeam, updateTeamDirectory, WorkspaceError } from '../src/lib/team/workspace-store.ts';
import { readTeam, writeTeam } from '../src/lib/persistence/relational-store.ts';
import { jiraTickets, sprintParticipants, validateJiraSelection } from '../src/lib/jira/jira.ts';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const id = 'a'.repeat(64);
const hasStatus = (status: number) => (error: unknown) => error instanceof WorkspaceError && error.status === status;

test('Jira sprint imports use distinct account IDs and exclude unassigned tickets', () => {
  const issue = (id: string, accountId: string | null, name = 'Camille') => ({ id, key: `TEST-${id}`, fields: { summary: 'Ticket', status: { name: 'En cours' }, assignee: accountId ? { accountId, displayName: name } : null } });
  const tickets = jiraTickets([issue('1', 'account-a'), issue('2', 'account-a'), issue('3', null), issue('4', 'account-b')], 'https://example.atlassian.net');
  const people = sprintParticipants(tickets);
  assert.deepEqual(people.map(person => person.id).sort(), ['jira:account-a', 'jira:account-b']);
  assert.ok(people.every(person => person.present && person.mood === null));
  assert.equal(tickets[0].url, 'https://example.atlassian.net/browse/TEST-1');
  assert.throws(() => sprintParticipants(jiraTickets([issue('1', null)], 'https://example.atlassian.net')));
  assert.throws(() => jiraTickets([issue('1', 'a')], 'https://untrusted.example'));
  assert.throws(() => sprintParticipants(jiraTickets(Array.from({ length: 101 }, (_, position) => issue(String(position + 1), `account-${position}`)), 'https://example.atlassian.net')));
  assert.deepEqual(validateJiraSelection({ cloudId: '12345678-1234-1234-1234-123456789abc', boardId: 1, sprintId: 2 }).sprintId, 2);
  assert.throws(() => validateJiraSelection({ cloudId: 'host.example', boardId: 1, sprintId: 2 }));
});

function clientFor(engine: PGlite, statements: string[] = [], failList = false) {
  const dialect = new PgDialect();
  return {
    execute: (query: SQL) => ({ query, then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
      const compiled = dialect.sqlToQuery(query);
      return engine.query(compiled.sql, compiled.params).then(resolve, reject);
    } }),
    batch: (queries: { query: SQL }[]) => engine.transaction(async tx => {
      const results = [];
      for (const { query } of queries) {
        const compiled = dialect.sqlToQuery(query);
        statements.push(compiled.sql);
        if (failList && compiled.sql.startsWith('SELECT t.id,t.name')) throw new Error('injected list failure');
        results.push(await tx.query(compiled.sql, compiled.params));
      }
      return results;
    }),
  } as unknown as Parameters<typeof listTeams>[0];
}

test('directory contracts: exact discriminated PATCH, legacy creation, categories and pure filters', () => {
  assert.deepEqual(teamCategories, ['Tech', 'Produit', 'Support', 'Marketing']);
  for (const category of [...teamCategories, null]) {
    assert.equal(validateTeamCategory(category), category);
    assert.equal(isTeamCategory(category), category !== null);
    assert.deepEqual(validateTeamCreation({ name: 'A', category }), { name: 'A', category });
    assert.deepEqual(validateTeamDirectoryPatch({ teamId: id, category }), { teamId: id, category });
  }
  assert.deepEqual(validateTeamCreation({ name: 'A' }), { name: 'A', category: null });
  assert.deepEqual(validateTeamDirectoryPatch({ teamId: id }), { teamId: id });
  for (const favorite of [true, false]) assert.deepEqual(validateTeamDirectoryPatch({ teamId: id, favorite }), { teamId: id, favorite });
  for (const value of [undefined, '', 'tech', 'Autre', 0, false, [], {}]) assert.throws(() => validateTeamCategory(value));
  for (const value of [null, [], {}, { category: 'Tech' }, { name: 'A', favorite: true }, { name: 'A', category: undefined }, { name: 'A', category: 'Tech', extra: true }]) assert.throws(() => validateTeamCreation(value));
  for (const value of [null, [], {}, { teamId: id, name: 'A' }, { teamId: id, category: 'Tech', favorite: true }, { teamId: id, favorite: true, extra: 1 },
    ...['bad', 'A'.repeat(64), 1, null].map(teamId => ({ teamId })),
    ...[undefined, null, 0, 1, 'true', {}, []].map(favorite => ({ teamId: id, favorite })),
    ...[undefined, 'tech', 1, false, {}, []].map(category => ({ teamId: id, category }))]) assert.throws(() => validateTeamDirectoryPatch(value));
  const teams = [{ id, name: 'A', memberCount: 0, category: null, favorite: false }, { id: 'b', name: 'B', memberCount: 1, category: 'Tech' as const, favorite: true }];
  assert.deepEqual(filterTeams(teams), teams);
  assert.deepEqual(filterTeams(teams, { category: null }), [teams[0]]);
  assert.deepEqual(filterTeams(teams, { category: 'Tech', favoritesOnly: true }), [teams[1]]);
  assert.deepEqual(filterTeams(teams, { category: 'Support', favoritesOnly: true }), []);
});

test('teams API validates before database access, keeps selection separate and invalidates metadata cache', () => {
  const source = read('../src/app/api/teams/route.ts');
  const post = source.slice(source.indexOf('export async function POST'), source.indexOf('export async function PATCH'));
  const patch = source.slice(source.indexOf('export async function PATCH'), source.indexOf('export async function DELETE'));
  for (const handler of [post, patch]) {
    assert.ok(handler.indexOf('sameOrigin(request)') < handler.indexOf('readJson(request)'));
    assert.ok(handler.indexOf('readJson(request)') < handler.indexOf('database()'));
  }
  assert.match(post, /validateTeamCreation\(await readJson\(request\)\)/);
  assert.match(post, /createTeam\(database\(\), name, category, setup\)/);
  assert.match(patch, /validateTeamDirectoryPatch\(await readJson\(request\)\)/);
  assert.match(patch, /teamReadCache\.mutate\(\(\) => updateTeamDirectory\(database\(\), input\)\)/);
  assert.match(patch, /selectTeam\(database\(\), input.teamId\)/);
  assert.match(source, /teamReadCache.read\(teamReadKey\('teams'\)/);
});

test('PGlite: migration backfill, category creation, shared absolute favorites, isolation, roster preservation and deletion', async () => {
  const engine = new PGlite();
  try {
    const journal = JSON.parse(read('../drizzle/meta/_journal.json')) as { entries: { tag: string }[] };
    const directoryIndex = journal.entries.findIndex(entry => entry.tag === '0006_pretty_shiver_man');
    assert.ok(directoryIndex >= 0);
    for (const { tag } of journal.entries.slice(0, directoryIndex)) await engine.exec(read(`../drizzle/${tag}.sql`));
    await engine.query('INSERT INTO workspaces(id) VALUES($1)', [id]);
    await engine.query("INSERT INTO teams(id,workspace_id,name,duration,warning,sound) VALUES($1,$1,'Ancienne',120,30,true)", [id]);
    const beforeMigration = (await engine.query('SELECT * FROM teams')).rows[0];
    const latest = journal.entries[directoryIndex].tag;
    assert.equal(latest, '0006_pretty_shiver_man');
    await engine.exec(read(`../drizzle/${latest}.sql`));
    assert.deepEqual((await engine.query('SELECT * FROM teams')).rows[0], { ...beforeMigration, category: null, favorite: false });
    for (const { tag } of journal.entries.slice(directoryIndex + 1)) await engine.exec(read(`../drizzle/${tag}.sql`));
    delete beforeMigration.updated_at;
    const statements: string[] = [];
    const client = clientFor(engine, statements);
    const first = (await listTeams(client)).teams[0];
    assert.deepEqual(first, { id, name: 'Ancienne', memberCount: 0, category: null, favorite: false });
    const plain = await createTeam(client, 'Sans catégorie');
    assert.equal(plain.teams.find(team => team.id === plain.activeTeamId)!.category, null);
    for (const category of teamCategories) {
      const created = await createTeam(client, category, category);
      assert.deepEqual(created.teams.find(team => team.id === created.activeTeamId), { id: created.activeTeamId, name: category, memberCount: 0, category, favorite: false });
    }
    await assert.rejects(createTeam(client, 'tech', 'Produit'), hasStatus(409));
    const untouched = (await engine.query('SELECT * FROM teams WHERE id<>$1 ORDER BY id', [id])).rows;
    const rosterBefore = await readTeam(client, id);
    await engine.query("INSERT INTO standup_sessions(team_id,id,completed_at) VALUES($1,'keep-session',now())", [id]);
    const sessions = (await engine.query('SELECT * FROM standup_sessions')).rows;
    statements.length = 0;
    const categorized = await updateTeamDirectory(client, { teamId: id, category: 'Support' });
    assert.equal(categorized.activeTeamId, id);
    assert.equal(categorized.teams.find(team => team.id === id)!.category, 'Support');
    assert.match(statements[1], /FROM workspaces .*FOR UPDATE/);
    assert.match(statements[2], /FROM teams .*FOR UPDATE/);
    assert.match(statements[3], /^UPDATE teams SET category=/);
    assert.doesNotMatch(statements[3], /revision|updated_at|write_transaction/);
    const favorite = await updateTeamDirectory(client, { teamId: id, favorite: true });
    assert.deepEqual(await updateTeamDirectory(client, { teamId: id, favorite: true }), favorite, 'absolute assignment is idempotent');
    assert.deepEqual(await selectTeam(clientFor(engine), id), favorite, 'another device sees shared metadata');
    assert.deepEqual((await engine.query('SELECT * FROM teams WHERE id=$1', [id])).rows[0], { ...beforeMigration, category: 'Support', favorite: true });
    assert.deepEqual(await readTeam(client, id), rosterBefore, 'metadata does not change roster revision/session DTO');
    assert.deepEqual((await engine.query('SELECT * FROM standup_sessions')).rows, sessions);
    assert.deepEqual((await engine.query('SELECT * FROM teams WHERE id<>$1 ORDER BY id', [id])).rows, untouched);
    await assert.rejects(updateTeamDirectory(clientFor(engine, [], true), { teamId: id, category: 'Marketing' }), /injected list failure/);
    assert.deepEqual(await selectTeam(client, id), favorite, 'later failure rolls back the update');
    const roster = { ...rosterBefore.team!, roster: [{ id: 'person', name: 'Élodie', present: true, mood: null, moodUpdatedAt: null, moodSlide: null }] };
    assert.equal(await writeTeam(client, id, rosterBefore.revision, roster), rosterBefore.revision + 1, 'metadata never invalidates an in-flight roster CAS');
    const afterRoster = (await selectTeam(client, id)).teams.find(team => team.id === id)!;
    assert.deepEqual(afterRoster, { ...first, memberCount: 1, category: 'Support', favorite: true });
    await Promise.all([updateTeamDirectory(client, { teamId: id, category: 'Produit' }), updateTeamDirectory(client, { teamId: id, favorite: false })]);
    assert.deepEqual((await selectTeam(client, id)).teams.find(team => team.id === id), { ...afterRoster, category: 'Produit', favorite: false });
    await updateTeamDirectory(client, { teamId: id, category: null });
    const beforeInvalid = (await engine.query('SELECT * FROM teams ORDER BY id')).rows;
    for (const value of [{ teamId: id }, { teamId: id, favorite: 'true' }, { teamId: id, category: 'Bad' }, { teamId: id, category: null, favorite: true }, { teamId: 'bad', favorite: true }]) await assert.rejects(updateTeamDirectory(client, value), hasStatus(400));
    await assert.rejects(createTeam(client, 'Invalid', 'Bad' as never), hasStatus(400));
    await assert.rejects(updateTeamDirectory(client, { teamId: 'f'.repeat(64), favorite: true }), hasStatus(404));
    await assert.rejects(engine.query("UPDATE teams SET category='Other' WHERE id=$1", [id]), /teams_category/);
    await assert.rejects(engine.query('UPDATE teams SET favorite=NULL WHERE id=$1', [id]), /not-null/);
    assert.deepEqual((await engine.query('SELECT * FROM teams ORDER BY id')).rows, beforeInvalid);
    const [updated, removed] = await Promise.all([updateTeamDirectory(client, { teamId: id, favorite: true }), deleteTeam(client, { teamId: id, name: first.name })]);
    assert.equal(updated.teams.find(team => team.id === id)!.favorite, true);
    assert.equal(removed.teams.some(team => team.id === id), false);
    await assert.rejects(updateTeamDirectory(client, { teamId: id, category: 'Tech' }), hasStatus(404));
    assert.equal((await listTeams(clientFor(engine))).teams.some(team => team.id === id), false, 'metadata writes cannot resurrect deleted teams');
    assert.deepEqual((await engine.query('SELECT * FROM teams ORDER BY id')).rows, untouched);
  } finally { await engine.close(); }
});