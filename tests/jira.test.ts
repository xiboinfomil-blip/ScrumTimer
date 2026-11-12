import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { beginJiraLogin, endJiraLogin, finishJiraLogin, jiraAccessToken, jiraCookie, jiraHash, jiraRequestCookie, jiraSession, jiraStateCookie, openJiraToken, sealJiraToken } from '../src/lib/jira/jira-auth.ts';
import { JiraService } from '../src/lib/jira/jira-service.ts';
import { assertJiraRoster, authorizeJiraTeam, jiraTeamSprint, saveJiraDisplay, syncJiraRoster, visibleJiraTeams } from '../src/lib/jira/jira-store.ts';
import { createTeam, deleteTeam, listTeams } from '../src/lib/team/workspace-store.ts';
import { readTeam, writeTeam } from '../src/lib/persistence/relational-store.ts';
import { jiraTicketDetails, jiraTickets, sprintParticipants, validateJiraDisplay, validateJiraSelection } from '../src/lib/jira/jira.ts';
import { validateTeamCreation } from '../src/lib/team/team-directory.ts';
import { JiraResourceCache } from '../src/lib/jira/jira-resource-cache.ts';

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
test('Jira display selection validates strict creation payloads and keeps old defaults', () => {
  const selection = { cloudId: '12345678-1234-1234-1234-123456789abc', boardId: 1, sprintId: 2 };
  assert.deepEqual(validateJiraSelection(selection), selection);
  const display = { boardId: 8, scope: 'backlog' as const };
  assert.deepEqual(validateTeamCreation({ name: 'Sprint', category: null, kind: 'sprint', sprint: { ...selection, display } }).sprint, { ...selection, display });
  for (const invalid of [{ boardId: 0, scope: 'board' }, { boardId: 2_147_483_648, scope: 'board' }, { boardId: '8', scope: 'board' }, { boardId: 8, scope: ['board'] }, { boardId: 8, scope: 'other' }, { ...display, cloudId: selection.cloudId }, null]) {
    assert.throws(() => validateJiraDisplay(invalid));
    assert.throws(() => validateJiraSelection({ ...selection, display: invalid }));
  }
});
test('Jira ticket details discover the board estimate field and remain board-authorized', async () => {
  const originalFetch = globalThis.fetch;
  const cloudId = '12345678-1234-1234-1234-123456789abc';
  let permitted = true;
  let available = true;
  let configurationAllowed = true;
  let configurationStatus = 403;
  let ticketStatus = 200;
  let details = 0;
  const issue = { id: '1', key: 'DEV-1', fields: { summary: '<script>safe title</script>', status: { name: 'En cours' }, assignee: null,
    description: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Description <img src=x>' }] }, { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Acceptance criteria' }] }] }] }] },
    customfield_10888: 0, labels: ['api'], components: [{ name: 'Backend' }], reporter: { displayName: 'Camille' }, parent: { key: 'DEV-9' } } };
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/oauth/token/accessible-resources') return Response.json([{ id: cloudId, name: 'Jira', url: 'https://example.atlassian.net', scopes: ['read:board-scope:jira-software'] }]);
    if (url.pathname.endsWith('/board')) return Response.json({ values: permitted ? [{ id: 1, name: 'Board', type: 'scrum' }] : [], startAt: 0, isLast: true });
    if (url.pathname.endsWith('/configuration')) return configurationAllowed ? Response.json({ estimation: { type: 'field', field: { fieldId: 'customfield_10888', displayName: 'Story Points' } } }) : new Response(null, { status: configurationStatus });
    assert.ok(url.pathname.endsWith('/board/1/issue'));
    assert.equal(url.searchParams.get('jql'), 'key = "DEV-1"');
    assert.equal(url.searchParams.get('fields')?.includes('customfield_10888'), configurationAllowed);
    details++;
    if (ticketStatus !== 200) return new Response(null, { status: ticketStatus });
    return Response.json({ issues: available ? [issue] : [], isLast: true });
  };
  try {
    const ticket = await new JiraService('detail-fixture').ticket({ cloudId, boardId: 1 }, 'DEV-1');
    assert.equal(ticket.description, 'Description \\<img src=x\\>\n\n- Acceptance criteria');
    assert.deepEqual(ticket.estimate, { label: 'Story Points', value: 0 });
    assert.equal(ticket.reporter, 'Camille');
    assert.deepEqual(ticket.components, ['Backend']);
    assert.equal(ticket.parent, 'DEV-9');
    configurationAllowed = false;
    for (const status of [401, 403]) {
      configurationStatus = status;
      const legacy = await new JiraService('detail-fixture').ticket({ cloudId, boardId: 1 }, 'DEV-1');
      assert.equal(legacy.description, ticket.description);
      assert.equal(legacy.estimateUnavailable, true);
      assert.equal(legacy.estimate, null);
    }
    configurationStatus = 429;
    await assert.rejects(new JiraService('detail-fixture').ticket({ cloudId, boardId: 1 }, 'DEV-1'), { status: 429 });
    configurationAllowed = true;
    ticketStatus = 401;
    await assert.rejects(new JiraService('detail-fixture').ticket({ cloudId, boardId: 1 }, 'DEV-1'), { status: 401 });
    ticketStatus = 200;
    assert.equal(jiraTicketDetails({ ...issue, fields: { ...issue.fields, description: null } }, 'https://example.atlassian.net').description, '');
    available = false;
    await assert.rejects(new JiraService('detail-fixture').ticket({ cloudId, boardId: 1 }, 'DEV-1'), { status: 404 });
    permitted = false;
    await assert.rejects(new JiraService('detail-fixture').ticket({ cloudId, boardId: 1 }, 'DEV-1'), { status: 403 });
    await assert.rejects(new JiraService('detail-fixture').ticket({ cloudId, boardId: 1 }, 'DEV-1 OR key != DEV-2'), { status: 400 });
    assert.equal(details, 5);
    const recursive: { type: string; content: unknown[] } = { type: 'paragraph', content: [] };
    recursive.content.push(recursive);
    assert.throws(() => jiraTicketDetails({ ...issue, fields: { ...issue.fields, description: recursive } }, 'https://example.atlassian.net'), /complexe/);
  } finally { globalThis.fetch = originalFetch; }
});

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

test('Jira renewal preserves sessions on temporary failures, releases leases and removes rejected grants', async () => {
  configuration(); const engine = new PGlite(); const originalFetch = globalThis.fetch;
  const cookie = 'c'.repeat(43); const id = jiraHash(cookie);
  const request = new Request('http://localhost:3001/api/jira', { headers: { cookie: `${jiraCookie}=${cookie}` } });
  try {
    const journal = JSON.parse(read('../drizzle/meta/_journal.json')) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) await engine.exec(read(`../drizzle/${tag}.sql`));
    await engine.query("INSERT INTO jira_sessions(id,account_id,display_name,access_token,refresh_token,access_expires_at,expires_at) VALUES($1,'fixture','Camille',$2,$3,now()-interval '1 second',now()+interval '8 hours')", [id, sealJiraToken('access', `${id}:access`), sealJiraToken('refresh', `${id}:refresh`)]);
    const client = clientFor(engine);
    for (const failure of [503, 429, new TypeError('network'), new DOMException('timeout', 'TimeoutError')]) {
      const before = await jiraSession(client, request);
      globalThis.fetch = async () => {
        if (typeof failure !== 'number') throw failure;
        return new Response(null, { status: failure });
      };
      await assert.rejects(jiraAccessToken(client, request), { status: failure === 429 ? 429 : typeof failure === 'number' ? 502 : 503 });
      assert.deepEqual(await jiraSession(client, request), before);
      assert.deepEqual((await engine.query('SELECT refresh_lease,refresh_lease_until FROM jira_sessions WHERE id=$1', [id])).rows[0], { refresh_lease: null, refresh_lease_until: null });
      globalThis.fetch = async () => Response.json({ access_token: 'recovered', refresh_token: 'rotated', expires_in: 3600 });
      assert.equal(await jiraAccessToken(client, request), 'recovered');
      await engine.query("UPDATE jira_sessions SET access_expires_at=now()-interval '1 second' WHERE id=$1", [id]);
    }
    await engine.query("UPDATE jira_sessions SET refresh_lease='other',refresh_lease_until=now()+interval '30 seconds' WHERE id=$1", [id]);
    await assert.rejects(jiraAccessToken(client, request), { status: 503 });
    assert.ok(await jiraSession(client, request));
    await engine.query('UPDATE jira_sessions SET refresh_lease=NULL,refresh_lease_until=NULL WHERE id=$1', [id]);
    for (const status of [400, 403]) {
      await engine.query("INSERT INTO jira_sessions(id,account_id,display_name,access_token,refresh_token,access_expires_at,expires_at) VALUES($1,'fixture','Camille',$2,$3,now()-interval '1 second',now()+interval '8 hours') ON CONFLICT DO NOTHING", [id, sealJiraToken('access', `${id}:access`), sealJiraToken('refresh', `${id}:refresh`)]);
      globalThis.fetch = async () => Response.json({ error: 'invalid_grant', error_description: 'Unknown or invalid refresh token.' }, { status });
      await assert.rejects(jiraAccessToken(client, request), { status: 401 });
      assert.equal(await jiraSession(client, request, false), null);
    }
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
    assert.equal((await jiraTeamSprint(client, teamId))?.display, undefined);
    const display = { boardId: 8, scope: 'backlog' as const };
    const configured = await createTeam(client, 'Affichage personnalisé', null, { ...selection, display, name: 'Sprint 2', roster: [{ id: 'jira:1', name: 'Camille', present: true, mood: null, moodUpdatedAt: null, moodSlide: null }] });
    assert.deepEqual((await jiraTeamSprint(client, configured.activeTeamId!))?.display, display);
    const lockedList = await visibleJiraTeams(client, request, imported);
    assert.deepEqual(lockedList.teams.find(team => team.id === teamId), { id: teamId, name: 'Sprint', memberCount: 0, category: null, kind: 'sprint', jiraLocked: true });
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
  const filters: (string | null)[] = [];
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
    filters.push(url.searchParams.get('jql'));
    assert.ok([null, 'statusCategory = "In Progress"', 'statusCategory = "To Do"', 'statusCategory = "Done"'].includes(url.searchParams.get('jql')));
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
    await assert.rejects(new JiraService('board-access').boardTickets(selection, 'indeterminate', true), /incomplets/);
    looping = false;
    await new JiraService('board-access').boardTickets(selection); assert.equal(issueReads, 8);
    await new JiraService('board-access').boardTickets(selection, 'done'); assert.equal(issueReads, 10);
    await new JiraService('board-access').boardTickets(selection, 'new'); assert.equal(issueReads, 12);
    await new JiraService('board-access').boardTickets(selection, 'indeterminate'); assert.equal(issueReads, 12);
    await new JiraService('board-access').boardTickets(selection, 'done'); assert.equal(issueReads, 12);
    const complete = await new JiraService('board-access').boardTickets(selection, 'all');
    assert.equal(complete.tickets.length, 3);
    assert.equal(issueReads, 14);
    assert.deepEqual(filters.slice(-2), [null, null]);
    await new JiraService('board-access').boardTickets(selection, 'all');
    assert.equal(issueReads, 14);
    await assert.rejects(new JiraService('board-access').boardTickets(selection, 'done OR assignee IS NOT EMPTY'), { status: 400 });
    assert.equal(issueReads, 14);
  } finally { globalThis.fetch = originalFetch; }
});

test('Jira display boards include Kanban; backlog pages and caches remain scoped and authorized', async () => {
  const originalFetch = globalThis.fetch;
  const cloudId = '12345678-1234-1234-1234-123456789abc';
  let allowed = true; let reads = 0;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('accessible-resources')) return Response.json([{ id: cloudId, name: 'Site', url: 'https://example.atlassian.net', scopes: ['read:board-scope:jira-software'] }]);
    if (url.pathname.endsWith('/board')) return Response.json({ startAt: 0, isLast: true, values: allowed ? [{ id: 8, name: 'Support personnalisé', type: 'kanban' }] : [] });
    if (url.pathname.endsWith('/configuration')) return Response.json({});
    const backlog = url.pathname.endsWith('/rest/software/1.0/board/8/backlog');
    assert.ok(backlog || url.pathname.endsWith('/rest/software/1.0/board/8/issue'));
    if (url.searchParams.has('jql')) {
      assert.equal(backlog, true);
      assert.equal(url.searchParams.get('jql'), 'key = "SUP-1"');
      return Response.json({ issues: [{ id: '1', key: 'SUP-1', fields: { summary: 'Détail du backlog', status: { name: 'À qualifier' } } }] });
    }
    assert.equal(url.searchParams.get('jql'), null);
    assert.equal(url.searchParams.has('startAt'), false);
    const next = url.searchParams.get('nextPageToken');
    assert.ok(next === null || next === 'next-backlog');
    reads++;
    return Response.json({ isLast: !!next, ...(!next ? { nextPageToken: 'next-backlog' } : {}), issues: [{ id: next ? '2' : '1', key: next ? 'SUP-2' : 'SUP-1', fields: { summary: backlog ? 'Backlog' : 'Tableau', status: { name: 'À qualifier' }, assignee: null } }] });
  };
  try {
    const service = new JiraService('backlog-fixture');
    assert.deepEqual(await service.boards(cloudId), []);
    assert.deepEqual(await service.boards(cloudId, true), [{ id: '8', name: 'Support personnalisé' }]);
    const selection = { cloudId, boardId: 8 };
    const result = await service.boardTickets(selection, 'all', false, true);
    assert.equal(result.tickets.length, 2);
    assert.equal((await service.ticket(selection, 'SUP-1', true)).summary, 'Détail du backlog');
    await new JiraService('backlog-fixture').boardTickets(selection, 'all', false, true);
    assert.equal(reads, 2);
    const board = await new JiraService('backlog-fixture').boardTickets(selection, 'all');
    assert.equal(board.tickets[0].summary, 'Tableau');
    assert.equal(result.tickets[0].summary, 'Backlog');
    assert.equal(reads, 4);
    await assert.rejects(new JiraService('backlog-fixture').boardTickets({ ...selection, boardId: 9 }, 'all', false, true), { status: 403 });
    allowed = false;
    await assert.rejects(new JiraService('backlog-fixture').boardTickets(selection, 'all', false, true), { status: 403 });
    assert.equal(reads, 4);
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
    if (url.pathname.endsWith('/board')) return Response.json({ startAt: 0, isLast: true, values: [{ id: 1, name: 'Scrum', type: 'scrum' }, ...(!url.searchParams.has('type') ? [{ id: 8, name: 'Support', type: 'kanban' }] : [])] });
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
    const unchanged = await readTeam(client, teamId);
    const display = { boardId: 8, scope: 'backlog' as const };
    await assert.rejects(saveJiraDisplay(client, new Request('http://localhost:3001/api/jira'), teamId, display), { status: 401 });
    await assert.rejects(saveJiraDisplay(client, request(), teamId, { ...display, boardId: 99 }), { status: 403 });
    await assert.rejects(saveJiraDisplay(client, request(), teamId, { ...display, scope: 'other' }), { status: 400 });
    assert.deepEqual(await saveJiraDisplay(client, request(), teamId, display), { display });
    assert.deepEqual((await jiraTeamSprint(client, teamId))?.display, display);
    assert.deepEqual(await readTeam(client, teamId), unchanged);
    assert.equal((await jiraTeamSprint(client, hidden.activeTeamId!))?.display, undefined);
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
    assert.deepEqual((await jiraTeamSprint(client, teamId))?.display, display);
    empty = true;
    await assert.rejects(syncJiraRoster(client, request(), teamId, after.revision, { ...selection, sprintId: 3 }), { status: 422 });
    assert.equal((await readTeam(client, teamId)).revision, after.revision);
    await deleteTeam(client, { teamId, name: 'Autorisé' });
    assert.equal(await jiraTeamSprint(client, teamId), null);
    assert.ok(await jiraTeamSprint(client, hidden.activeTeamId!));
  } finally { globalThis.fetch = originalFetch; await engine.close(); }
});