import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beginJiraLogin, endJiraLogin, finishJiraLogin, jiraAccessToken, jiraCookie, jiraHash, jiraRequestCookie, jiraSession, jiraStateCookie, openJiraToken, sealJiraToken } from '../src/lib/jira-auth.ts';
import { JiraService } from '../src/lib/jira-service.ts';
import { assertJiraRoster, authorizeJiraTeam, jiraTeamSprint, syncJiraRoster, visibleJiraTeams } from '../src/lib/jira-store.ts';
import { createTeam, deleteTeam, listTeams } from '../src/lib/workspace-store.ts';
import { readTeam, writeTeam } from '../src/lib/relational-store.ts';
import { jiraTickets, sprintParticipants } from '../src/lib/jira.ts';
import { validateTeamCreation } from '../src/lib/team-directory.ts';
import { JiraResourceCache } from '../src/lib/jira-resource-cache.ts';

test('Jira resource cache coalesces requests, reuses speakers, isolates teams and expires', async () => {
  const cache = new JiraResourceCache();
  let calls = 0; let clock = 0;
  const request = (async (_input, init) => {
    calls++;
    return Response.json({ team: new Headers(init?.headers).get('X-Team-Id'), tickets: ['DEV-1'] });
  }) as typeof fetch;
  const url = '/api/jira?action=tickets&participantId=jira%3Aalice';
  const read = (team = 'one', refresh = false) => cache.read(url, team, refresh, request, () => clock);
  const [first, second] = await Promise.all([read(), read()]);
  assert.deepEqual(first, second); assert.equal(calls, 1);
  await read(); assert.equal(calls, 1);
  await read('two'); assert.equal(calls, 2);
  await read('one', true); assert.equal(calls, 3);
  clock = 60_001; await read(); assert.equal(calls, 4);
  cache.clear(); await read(); assert.equal(calls, 5);
  cache.invalidate(url, 'one'); await read(); assert.equal(calls, 6);
  await read(); assert.equal(calls, 6);
});

test('Jira resource cache does not retain failures or refill cleared entries', async () => {
  const cache = new JiraResourceCache(); let calls = 0;
  const failure = (async () => { calls++; return Response.json({ error: 'Non autorisé' }, { status: 401 }); }) as typeof fetch;
  await cache.read('/api/jira', 'one', false, failure);
  await cache.read('/api/jira', 'one', false, failure);
  assert.equal(calls, 2);
  let finish!: (response: Response) => void;
  const delayed = (() => new Promise<Response>(resolve => { finish = resolve; })) as typeof fetch;
  const pending = cache.read('/api/jira', 'one', false, delayed);
  cache.clear(); finish(Response.json({ connected: true })); await pending;
  await cache.read('/api/jira', 'one', false, failure); assert.equal(calls, 3);
});

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
function configuration() {
  process.env.JIRA_CLIENT_ID = 'fixture-client'; process.env.JIRA_CLIENT_SECRET = 'fixture-secret';
  process.env.JIRA_ENCRYPTION_KEY = 'a'.repeat(64); process.env.JIRA_CALLBACK_URL = 'http://localhost:3001/api/jira/callback';
}
function clientFor(engine: PGlite) {
  return {
    execute(query: SQL) {
      return { query, then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
        const compiled = new PgDialect().sqlToQuery(query); return engine.query(compiled.sql, compiled.params).then(resolve, reject);
      } };
    },
    batch(queries: { query: SQL }[]) {
      return engine.transaction(async transaction => {
        const results = [];
        for (const { query } of queries) { const compiled = new PgDialect().sqlToQuery(query); results.push(await transaction.query(compiled.sql, compiled.params)); }
        return results;
      });
    },
  } as unknown as Parameters<typeof beginJiraLogin>[0];
}
test('Jira tokens are encrypted, context-bound and tamper evident; cookies reject malformed values', () => {
  configuration();
  const ciphertext = sealJiraToken('private-access-token', 'session:access');
  assert.ok(!ciphertext.includes('private-access-token'));
  assert.equal(openJiraToken(ciphertext, 'session:access'), 'private-access-token');
  assert.throws(() => openJiraToken(ciphertext, 'other-session:access'));
  const bytes = Buffer.from(ciphertext, 'base64url'); bytes[15] ^= 1;
  assert.throws(() => openJiraToken(bytes.toString('base64url'), 'session:access'));
  for (const cookie of ['', 'short', '%00', 'a'.repeat(200)]) assert.equal(jiraRequestCookie(new Request('http://localhost', { headers: { cookie: `${jiraCookie}=${cookie}` } })), null);
});

test('Jira OAuth: one-use browser-bound state, encrypted session, refresh rotation and logout', async () => {
  configuration(); const engine = new PGlite(); const originalFetch = globalThis.fetch;
  let tokenRequests = 0;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://auth.atlassian.com/oauth/token') {
      tokenRequests++;
      const body = JSON.parse(String(init?.body));
      assert.equal(body.client_id, 'fixture-client'); assert.equal(body.client_secret, 'fixture-secret');
      if (body.grant_type === 'authorization_code') assert.equal(body.code, 'fixture-code');
      else { assert.equal(body.grant_type, 'refresh_token'); assert.equal(body.refresh_token, 'refresh-1'); }
      return Response.json({ access_token: `access-${tokenRequests}`, refresh_token: `refresh-${tokenRequests}`, expires_in: 3600 });
    }
    if (url === 'https://api.atlassian.com/me') return Response.json({ account_id: 'account-1', name: 'Camille' });
    throw new Error(`Unexpected fixture request: ${url}`);
  };
  try {
    const journal = JSON.parse(read('../drizzle/meta/_journal.json')) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) await engine.exec(read(`../drizzle/${tag}.sql`));
    const client = clientFor(engine); const flow = await beginJiraLogin(client, 'http://localhost:3001');
    assert.equal(flow.url.origin, 'https://auth.atlassian.com');
    assert.equal(flow.url.searchParams.get('state'), flow.state);
    await assert.rejects(beginJiraLogin(client, 'https://attacker.example'), { status: 400 });
    const callback = (state: string, cookie = flow.state) => new Request(`http://localhost:3001/api/jira/callback?code=fixture-code&state=${state}`, { headers: { cookie: `${jiraStateCookie}=${cookie}` } });
    await assert.rejects(finishJiraLogin(client, callback('forged')));
    assert.equal(tokenRequests, 0);
    const cookie = await finishJiraLogin(client, callback(flow.state));
    await assert.rejects(finishJiraLogin(client, callback(flow.state)), { status: 400 });
    assert.equal(tokenRequests, 1);
    const request = new Request('http://localhost:3001/api/jira', { headers: { cookie: `${jiraCookie}=${cookie}` } });
    const session = await jiraSession(client, request);
    assert.equal(session?.accountId, 'account-1'); assert.notEqual(session?.encryptedAccess, 'access-1');
    assert.equal(await jiraAccessToken(client, request), 'access-1');
    await engine.query('UPDATE jira_sessions SET access_expires_at=now()-interval \'1 second\'');
    assert.equal(await jiraAccessToken(client, request), 'access-2');
    const stored = (await engine.query<{ refresh_token: string }>('SELECT refresh_token FROM jira_sessions')).rows[0];
    assert.equal(openJiraToken(stored.refresh_token, `${jiraHash(cookie)}:refresh`), 'refresh-2');
    await endJiraLogin(client, request);
    await assert.rejects(jiraSession(client, request), { status: 401 });
    assert.equal(await jiraSession(client, request, false), null);
  } finally { globalThis.fetch = originalFetch; await engine.close(); }
});

test('Jira sprint creation is atomic; unauthenticated lists expose only locked entries, reads and manual roster edits are rejected', async () => {
  const engine = new PGlite();
  try {
    const journal = JSON.parse(read('../drizzle/meta/_journal.json')) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) await engine.exec(read(`../drizzle/${tag}.sql`));
    const client = clientFor(engine); const request = new Request('http://localhost:3001/api/teams');
    await listTeams(client);
    const selection = { cloudId: '12345678-1234-1234-1234-123456789abc', boardId: 1, sprintId: 2 };
    assert.equal(validateTeamCreation({ name: 'Sprint', category: null, kind: 'sprint', sprint: selection }).sprint?.sprintId, 2);
    assert.throws(() => validateTeamCreation({ name: 'Sprint', category: null, kind: 'sprint' }));
    assert.throws(() => validateTeamCreation({ name: 'Ordinaire', category: null, kind: 'ordinary', sprint: selection }));
    await assert.rejects(createTeam(client, 'Rollback', null, { ...selection, name: 'Sprint', roster: [{ id: 'jira:1', name: '', present: true, mood: null, moodUpdatedAt: null, moodSlide: null }] }));
    assert.ok(!(await listTeams(client)).teams.some(team => team.name === 'Rollback'));
    const imported = await createTeam(client, 'Sprint', 'Tech', { ...selection, name: 'Sprint 2', roster: [{ id: 'jira:1', name: 'Camille', present: true, mood: null, moodUpdatedAt: null, moodSlide: null }] });
    const teamId = imported.activeTeamId!; const stored = await readTeam(client, teamId);
    assert.equal(stored.team?.roster[0].id, 'jira:1');
    assert.equal(stored.team?.roster.length, 1);
    const lockedList = await visibleJiraTeams(client, request, imported);
    assert.deepEqual(lockedList.teams.find(team => team.id === teamId), { id: teamId, name: 'Sprint', memberCount: 0, category: null, favorite: false, kind: 'sprint', jiraLocked: true });
    assert.notEqual(lockedList.activeTeamId, teamId);
    assert.equal((await visibleJiraTeams(client, request, { teams: imported.teams.filter(team => team.id === teamId), activeTeamId: teamId })).activeTeamId, null);
    await assert.rejects(authorizeJiraTeam(client, request, teamId), { status: 401 });
    const team = stored.team!;
    await assertJiraRoster(client, teamId, { ...team, roster: team.roster.map(person => ({ ...person, present: false })) });
    await assert.rejects(assertJiraRoster(client, teamId, { ...team, roster: [] }), { status: 400 });
    await assert.rejects(assertJiraRoster(client, teamId, { ...team, roster: team.roster.map(person => ({ ...person, name: 'Autre' })) }), { status: 400 });
    assert.equal(await writeTeam(client, teamId, stored.revision, team), stored.revision + 1);
  } finally { await engine.close(); }
});

test('Jira service follows current token pagination, deduplicates assignees and rejects incomplete/unauthorized imports', async () => {
  const originalFetch = globalThis.fetch;
  const selection = { cloudId: '12345678-1234-1234-1234-123456789abc', boardId: 1, sprintId: 2 };
  let looping = false; let forbidden = false;
  let issueReads = 0;
  const issue = (id: string, accountId: string | null) => ({ id, key: `DEV-${id}`, fields: { summary: `Ticket ${id}`, status: { name: 'En cours' }, priority: null, assignee: accountId ? { accountId, displayName: 'Camille' } : null } });
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.origin, 'https://api.atlassian.com');
    assert.ok(['Bearer fixture-access', 'Bearer other-access'].includes(new Headers(init?.headers).get('authorization') ?? ''));
    if (forbidden) return new Response(null, { status: 403 });
    if (url.pathname.endsWith('accessible-resources')) return Response.json([{ id: selection.cloudId, name: 'Site', url: 'https://example.atlassian.net', scopes: ['read:board-scope:jira-software'] }]);
    if (url.pathname.endsWith('/board')) return Response.json({ startAt: 0, isLast: true, values: [{ id: 1, name: 'Scrum', type: 'scrum' }] });
    if (url.pathname.endsWith('/sprint')) return Response.json({ startAt: 0, isLast: true, values: [{ id: 2, name: 'Sprint 2', state: 'active' }] });
    assert.ok(url.pathname.endsWith('/rest/software/1.0/board/1/sprint/2/issue'));
    issueReads++;
    if (url.searchParams.has('nextPageToken')) return Response.json({ isLast: !looping, nextPageToken: 'page-2', issues: [issue('3', null), issue('4', 'b')] });
    return Response.json({ isLast: false, nextPageToken: 'page-2', issues: [issue('1', 'a'), issue('2', 'a')] });
  };
  try {
    const imported = await new JiraService('fixture-access').tickets(selection, true);
    assert.equal(imported.tickets.length, 4);
    assert.equal(sprintParticipants(imported.tickets).length, 2);
    assert.equal(imported.tickets[0].url, 'https://example.atlassian.net/browse/DEV-1');
    const before = issueReads;
    await Promise.all([new JiraService('fixture-access').tickets(selection), new JiraService('fixture-access').tickets(selection)]);
    assert.equal(issueReads, before + 2);
    await new JiraService('fixture-access').tickets(selection);
    assert.equal(issueReads, before + 2);
    await new JiraService('other-access').tickets(selection);
    assert.equal(issueReads, before + 4);
    forbidden = true;
    await assert.rejects(new JiraService('fixture-access').tickets(selection), { status: 403 });
    assert.equal(issueReads, before + 4);
    forbidden = false;
    await assert.rejects(new JiraService('fixture-access').tickets({ ...selection, boardId: 99 }), { status: 403 });
    looping = true;
    await assert.rejects(new JiraService('fixture-access').tickets(selection, false, true), /incomplets/);
    forbidden = true;
    await assert.rejects(new JiraService('fixture-access').tickets(selection), { status: 403 });
  } finally { globalThis.fetch = originalFetch; }
});

test('Jira board tickets share all assignees and pages without skipping fresh authorization', async () => {
  const originalFetch = globalThis.fetch;
  const selection = { cloudId: '12345678-1234-1234-1234-123456789abc', boardId: 7 };
  let issueReads = 0; let boardReads = 0; let forbidden = false; let looping = false;
  const issue = (id: string, accountId: string | null) => ({ id, key: `DEV-${id}`, fields: { summary: `Ticket ${id}`, status: { name: 'Ouvert' }, assignee: accountId ? { accountId, displayName: accountId } : null } });
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('accessible-resources')) return Response.json([{ id: selection.cloudId, name: 'Site', url: 'https://example.atlassian.net', scopes: ['read:board-scope:jira-software'] }]);
    if (url.pathname.endsWith('/board')) {
      boardReads++;
      return Response.json({ startAt: 0, isLast: true, values: forbidden ? [] : [{ id: 7, name: 'Tableau produit', type: 'scrum' }] });
    }
    assert.ok(url.pathname.endsWith('/rest/software/1.0/board/7/issue'));
    assert.equal(url.searchParams.get('fields'), 'summary,status,priority,assignee,issuetype');
    issueReads++;
    return Response.json(url.searchParams.has('nextPageToken')
      ? { isLast: !looping, nextPageToken: 'next', issues: [issue('3', null)] }
      : { isLast: false, nextPageToken: 'next', issues: [issue('1', 'alice'), issue('2', 'bob')] });
  };
  try {
    const [first, second] = await Promise.all([new JiraService('board-access').boardTickets(selection), new JiraService('board-access').boardTickets(selection)]);
    assert.deepEqual(first, second); assert.equal(issueReads, 2); assert.equal(boardReads, 2);
    assert.equal(first.name, 'Tableau produit');
    assert.deepEqual(first.tickets.map(ticket => ticket.assigneeId), ['alice', 'bob', null]);
    await new JiraService('board-access').boardTickets(selection); assert.equal(issueReads, 2); assert.equal(boardReads, 3);
    await new JiraService('other-board-access').boardTickets(selection); assert.equal(issueReads, 4);
    forbidden = true;
    await assert.rejects(new JiraService('board-access').boardTickets(selection), { status: 403 });
    assert.equal(issueReads, 4);
    forbidden = false; looping = true;
    await assert.rejects(new JiraService('board-access').boardTickets(selection, true), /incomplets/);
    looping = false;
    await new JiraService('board-access').boardTickets(selection); assert.equal(issueReads, 8);
  } finally { globalThis.fetch = originalFetch; }
});

test('Jira ticket presentation retains real issue types and categories without guessing custom statuses', () => {
  const issue = (category: string) => ({ id: '1', key: 'DEV-1', fields: { summary: 'Résumé', status: { name: 'Validation personnalisée', statusCategory: { key: category } }, issuetype: { name: 'Story' }, priority: null, assignee: null } });
  const [ticket] = jiraTickets([issue('done')], 'https://example.atlassian.net');
  assert.equal(ticket.statusCategory, 'done');
  assert.equal(ticket.issueType, 'Story');
  assert.equal(ticket.status, 'Validation personnalisée');
  assert.equal(jiraTickets([issue('custom')], 'https://example.atlassian.net')[0].statusCategory, undefined);
});

test('Jira access is caller-scoped; explicit roster refresh preserves attendance, resets moods and rolls back failures', async () => {
  configuration(); const engine = new PGlite(); const originalFetch = globalThis.fetch;
  const selection = { cloudId: '12345678-1234-1234-1234-123456789abc', boardId: 1, sprintId: 2 };
  const cookie = 'b'.repeat(43); const sessionId = jiraHash(cookie);
  const request = () => new Request('http://localhost:3001/api/jira', { headers: { cookie: `${jiraCookie}=${cookie}` } });
  let empty = false;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('accessible-resources')) return Response.json([{ id: selection.cloudId, name: 'Site', url: 'https://example.atlassian.net', scopes: ['read:board-scope:jira-software'] }]);
    if (url.pathname.endsWith('/board')) return Response.json({ startAt: 0, isLast: true, values: [{ id: 1, name: 'Scrum', type: 'scrum' }] });
    if (url.pathname.endsWith('/sprint')) return Response.json({ startAt: 0, isLast: true, values: [{ id: 3, name: 'Sprint 3', state: 'active' }] });
    assert.ok(url.pathname.endsWith('/sprint/3/issue'));
    return Response.json({ isLast: true, issues: empty ? [] : ['retained', 'new'].map((accountId, index) => ({ id: String(index + 1), key: `DEV-${index + 1}`, fields: { summary: 'Ticket', status: { name: 'Ouvert' }, assignee: { accountId, displayName: accountId === 'retained' ? 'Camille Jira' : 'Nouveau' } } })) });
  };
  try {
    const journal = JSON.parse(read('../drizzle/meta/_journal.json')) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) await engine.exec(read(`../drizzle/${tag}.sql`));
    const client = clientFor(engine);
    await engine.query("INSERT INTO jira_sessions(id,account_id,display_name,access_token,access_expires_at,expires_at) VALUES($1,'caller','Camille',$2,now()+interval '1 hour',now()+interval '8 hours')", [sessionId, sealJiraToken('fixture-access', `${sessionId}:access`)]);
    await listTeams(client);
    const person = (id: string) => ({ id: `jira:${id}`, name: id, present: true, mood: null, moodUpdatedAt: null, moodSlide: null });
    const created = await createTeam(client, 'Autorisé', null, { ...selection, name: 'Sprint 2', roster: [person('retained'), person('removed')] });
    const teamId = created.activeTeamId!;
    const hidden = await createTeam(client, 'Non autorisé', null, { ...selection, boardId: 99, name: 'Privé', roster: [person('hidden')] });
    const visible = await visibleJiraTeams(client, request(), hidden);
    assert.ok(visible.teams.some(team => team.id === teamId && team.kind === 'sprint'));
    assert.ok(visible.teams.some(team => team.id === hidden.activeTeamId && team.jiraLocked && !team.sprintName && team.memberCount === 0));
    assert.notEqual(visible.activeTeamId, hidden.activeTeamId);
    await assert.rejects(authorizeJiraTeam(client, request(), hidden.activeTeamId!), { status: 403 });
    const stored = await readTeam(client, teamId);
    const before = { ...stored.team!, roster: stored.team!.roster.map(person => ({ ...person, present: false, mood: 2 as const, moodUpdatedAt: new Date().toISOString() })) };
    const revision = await writeTeam(client, teamId, stored.revision, before);
    await assert.rejects(syncJiraRoster(client, request(), teamId, stored.revision, { ...selection, sprintId: 3 }), { status: 409 });
    assert.equal((await jiraTeamSprint(client, teamId))?.sprintId, 2);
    await engine.exec("CREATE FUNCTION reject_jira_members() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture write failure'; END $$; CREATE TRIGGER reject_jira_members BEFORE INSERT ON team_members FOR EACH ROW EXECUTE FUNCTION reject_jira_members();");
    await assert.rejects(syncJiraRoster(client, request(), teamId, revision, { ...selection, sprintId: 3 }));
    assert.equal((await jiraTeamSprint(client, teamId))?.sprintId, 2);
    assert.deepEqual((await readTeam(client, teamId)).team?.roster.map(person => person.id), before.roster.map(person => person.id));
    await engine.exec('DROP TRIGGER reject_jira_members ON team_members');
    assert.deepEqual(await syncJiraRoster(client, request(), teamId, revision, { ...selection, sprintId: 3 }), { count: 2 });
    const after = await readTeam(client, teamId);
    assert.deepEqual(after.team?.roster.map(person => [person.id, person.name, person.present, person.mood]), [['jira:retained', 'Camille Jira', false, null], ['jira:new', 'Nouveau', true, null]]);
    assert.equal(after.revision, revision + 1);
    assert.equal((await jiraTeamSprint(client, teamId))?.sprintId, 3);
    empty = true;
    await assert.rejects(syncJiraRoster(client, request(), teamId, after.revision, { ...selection, sprintId: 3 }), { status: 422 });
    assert.equal((await readTeam(client, teamId)).revision, after.revision);
    await deleteTeam(client, { teamId, name: 'Autorisé' });
    assert.equal(await jiraTeamSprint(client, teamId), null);
    assert.ok(await jiraTeamSprint(client, hidden.activeTeamId!));
  } finally { globalThis.fetch = originalFetch; await engine.close(); }
});