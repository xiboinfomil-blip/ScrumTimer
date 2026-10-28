import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { readDailyHints, saveDailyHint } from '../src/lib/meeting/daily-hints-store.ts';
import { createParticipantLinkToken, readParticipantLinkToken } from '../src/lib/participants/participant-access.ts';
import { WorkspaceError } from '../src/lib/team/workspace-store.ts';
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
const portal = () => read('../src/app/api/participant-portal/route.ts');
const secret = 'participant-portal-integration-secret-at-least-32-bytes';
const teamA = 'a'.repeat(64), teamB = 'b'.repeat(64);
const now = new Date('2026-10-16T10:00:00Z');
const input = { participantId: 'shared-person', hint: 'Préparer la démonstration', day: '2026-10-16', revision: 0 };
const hasStatus = (status: number) => (error: unknown) => error instanceof WorkspaceError && error.status === status;

test('participant bridge authenticates the server bearer and signed team before any read or write; no arbitrary team selector', () => {
  const source = portal();
  const authorization = source.slice(source.indexOf('function authorizedTeam('), source.indexOf('export async function GET('));
  assert.match(authorization, /process\.env\.PARTICIPANT_PORTAL_SECRET/);
  assert.match(authorization, /if \(!validPortalSecret\(secret\)\) throw new WorkspaceError\(503,/);
  assert.match(authorization, /if \(!equalPortalSecret\(request\.headers\.get\('authorization'\) \?\? '', `Bearer \$\{secret\}`\)\) throw new WorkspaceError\(403,/);
  assert.match(authorization, /readParticipantLinkToken\(request\.headers\.get\('X-Team-Link'\), secret\)/);
  assert.match(authorization, /if \(!teamId\) throw new WorkspaceError\(403,/);
  assert.match(authorization, /return teamId;/);
  assert.ok(authorization.indexOf('equalPortalSecret(') < authorization.indexOf('readParticipantLinkToken('));
  assert.equal(source.match(/const id = authorizedTeam\(request\)/g)?.length, 2);
  for (const method of ['GET', 'PUT']) {
    const handler = source.slice(source.indexOf(`export async function ${method}(`));
    assert.ok(handler.indexOf('authorizedTeam(request)') < handler.indexOf('database()'));
  }
  assert.doesNotMatch(source, /selectedTeam|resolveSelectedTeam|X-Team-Id|searchParams|request\.url|input\.teamId|request\.json\(/);
  assert.match(source, /'Cache-Control': 'no-store'/);
  assert.match(source, /'Referrer-Policy': 'no-referrer'/);
  assert.match(source, /export const dynamic = 'force-dynamic'/);
});

test('participant GET projects only team identity and roster attendance, scoped notes/history, never management state or credentials', () => {
  const source = portal();
  const handler = source.slice(source.indexOf('export async function GET('), source.indexOf('export async function PUT('));
  const query = handler.match(/db\.execute\(sql`([^`]+)`\)/)?.[1];
  assert.ok(query, 'inspect the actual GET projection, not an unrelated helper');
  assert.match(query, /^SELECT t\.id,t\.name,COALESCE\(/);
  assert.match(query, /jsonb_build_object\('id',p\.id,'name',p\.name,'present',m\.present\)/);
  assert.match(query, /p\.team_id=m\.team_id AND p\.id=m\.participant_id/);
  assert.match(query, /WHERE m\.team_id=t\.id/);
  assert.match(query, /FROM teams t WHERE t\.id=\$\{id\}$/);
  assert.doesNotMatch(query, /\*|revision|write_transaction|workspace_id|duration|warning|sound|participant_check_ins|mood|secret|token/i);
  assert.match(handler, /if \(!team\.rows\.length\) throw new WorkspaceError\(403,/);
  assert.match(handler, /Promise\.all\(\[readDailyHints\(db, id\), readHistory\(db, id\)\]\)/);
  assert.match(handler, /return response\(\{ team: team\.rows\[0\], \.\.\.notes, history \}\)/);
  assert.doesNotMatch(handler, /process\.env|authorization|X-Team-Link|readTeam|readMeetingSettings|teamReadCache\.read/);
});

test('participant bridge exposes only GET and strict note PUT, with cache invalidation and store error statuses preserved', () => {
  const source = portal();
  assert.deepEqual([...source.matchAll(/export async function (\w+)\(/g)].map(match => match[1]), ['GET', 'PUT']);
  const handler = source.slice(source.indexOf('export async function PUT('));
  assert.match(handler, /validateDailyHint\(await readJson\(request\)\)/);
  assert.match(handler, /throw new WorkspaceError\(400,/);
  assert.match(handler, /return response\(await teamReadCache\.mutate\(\(\) => saveDailyHint\(database\(\), id, input\)\)\)/);
  assert.match(handler, /catch \(error\) \{ return databaseFailure\(error\); \}/);
  assert.doesNotMatch(source, /saveTeam|writeTeam|createTeam|deleteTeam|saveHistory|resetDaily|saveMeetingSettings|saveRoundFeedback|changeDailyMeter|\.batch\(|sql`\s*(?:INSERT|UPDATE|DELETE)/i);
  const failure = read('../src/lib/persistence/database.ts');
  assert.match(failure, /error instanceof WorkspaceError\) return NextResponse\.json\(\{ error: error\.message \}, \{ status: error\.status,/);
});

test('participant link issuance is same-origin selected-team only, validates the portal origin and returns a signed URL without the shared secret', () => {
  const source = read('../src/app/api/participant-link/route.ts');
  assert.deepEqual([...source.matchAll(/export async function (\w+)\(/g)].map(match => match[1]), ['POST']);
  assert.match(source, /if \(!sameOrigin\(request\)\) return new NextResponse\(null, \{ status: 403, headers \}\)/);
  assert.ok(source.indexOf('sameOrigin(request)') < source.indexOf('await selectedTeam(request)'));
  assert.match(source, /base\.username \|\| base\.password \|\| base\.pathname !== '\/' \|\| base\.search \|\| base\.hash/);
  assert.match(source, /base\.protocol !== 'https:'/);
  assert.match(source, /base\.protocol === 'http:' && \['localhost', '127\.0\.0\.1'\]\.includes\(base\.hostname\)/);
  assert.match(source, /if \(!validPortalSecret\(secret\)\) return NextResponse\.json/);
  assert.match(source, /const id = await selectedTeam\(request\)/);
  assert.match(source, /return NextResponse\.json\(\{ url: new URL\(`\/t\/\$\{createParticipantLinkToken\(id, secret\)\}`, base\)\.href \}, \{ headers \}\)/);
  assert.match(source, /'Cache-Control': 'no-store'/);
  assert.match(source, /'Referrer-Policy': 'no-referrer'/);
  assert.doesNotMatch(source, /readJson|request\.json|searchParams|request\.url|fetch\(/);
  assert.match(source, /if \(await jiraTeamSprint\(database\(\), id\)\) throw new WorkspaceError\(403/);
});

test('PGlite: signed team-A notes use member-only CAS, reject forged scope and preserve team B, management state and archived history', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const engine = new PGlite();
  const dialect = new PgDialect();
  let batches = 0;
  try {
    // Use the real migration journal and the same lazy, transactional Neon
    // adapter pattern as the existing daily-hints/team-deletion store tests.
    const journal = JSON.parse(read('../drizzle/meta/_journal.json')) as { entries: { tag: string }[] };
    assert.ok(journal.entries.some(entry => entry.tag.startsWith('0005_')));
    for (const { tag } of journal.entries) {
      await engine.transaction(async tx => { await tx.exec(read(`../drizzle/${tag}.sql`)); });
    }
    const client = {
      execute(query: SQL) {
        return { query, then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          const compiled = dialect.sqlToQuery(query);
          return engine.query(compiled.sql, compiled.params).then(resolve, reject);
        } };
      },
      batch(queries: { query: SQL }[]) {
        batches++;
        return engine.transaction(async tx => {
          const results = [];
          for (const { query } of queries) {
            const compiled = dialect.sqlToQuery(query);
            results.push(await tx.query(compiled.sql, compiled.params));
          }
          return results;
        });
      },
    } as unknown as Parameters<typeof saveDailyHint>[0];
    await engine.query('INSERT INTO workspaces(id) VALUES($1)', ['0'.repeat(64)]);
    for (const [id, name] of [[teamA, 'Équipe A'], [teamB, 'Équipe B']]) {
      await engine.query('INSERT INTO teams(id,workspace_id,name,duration,warning,sound) VALUES($1,$2,$3,120,30,true)', [id, '0'.repeat(64), name]);
      await engine.query("INSERT INTO participants(team_id,id,name) VALUES($1,'shared-person','Camille'),($1,'archived','Ancien')", [id]);
      await engine.query("INSERT INTO team_members(team_id,participant_id,position,present) VALUES($1,'shared-person',0,false)", [id]);
      await engine.query("INSERT INTO participant_check_ins(team_id,participant_id,mood,mood_updated_at) VALUES($1,'shared-person',3,$2)", [id, now]);
      await engine.query("INSERT INTO standup_sessions(team_id,id,completed_at) VALUES($1,'shared-round',$2)", [id, now]);
      await engine.query("INSERT INTO speaking_turns(team_id,session_id,participant_id,position,name_snapshot,mood,speaking_seconds,budget_seconds,time_up,score) VALUES($1,'shared-round','archived',0,'Ancien',2,60,120,false,1000)", [id]);
      await engine.query('INSERT INTO team_meeting_settings(team_id,revision) VALUES($1,2)', [id]);
      await engine.query("INSERT INTO team_discussion_prompts(team_id,position,prompt) VALUES($1,0,'Un obstacle ?')", [id]);
    }
    await engine.query("INSERT INTO participants(team_id,id,name) VALUES($1,'only-b','B seulement')", [teamB]);
    await engine.query("INSERT INTO team_members(team_id,participant_id,position,present) VALUES($1,'only-b',1,true)", [teamB]);
    await saveDailyHint(client, teamB, { ...input, hint: 'Note B à conserver' }, now);
    const otherNotes = await readDailyHints(client, teamB, now);

    // Snapshot every non-note public table, not just a few known columns, so
    // incidental roster/settings/check-in/history writes cannot go unnoticed.
    const tables = (await engine.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> 'participant_daily_hints' ORDER BY table_name")).rows;
    async function managementSnapshot() {
      const snapshot: Record<string, unknown[]> = {};
      for (const { table_name: name } of tables) {
        const quoted = `"${name.replaceAll('"', '""')}"`;
        snapshot[name] = (await engine.query(`SELECT * FROM ${quoted} ORDER BY to_jsonb(${quoted})::text`)).rows;
      }
      return snapshot;
    }
    const before = await managementSnapshot();
    const token = createParticipantLinkToken(teamA, secret);
    // This composes the real token resolver and real store, NOT a simulated
    // HTTP handler. Source contracts above pin the actual route to this scope.
    const saveFromLink = async (link: string, value: unknown) => {
      const resolvedTeam = readParticipantLinkToken(link, secret);
      if (!resolvedTeam) throw new WorkspaceError(403, 'Lien d’équipe invalide.');
      return saveDailyHint(client, resolvedTeam, value, now);
    };
    assert.deepEqual(await saveFromLink(token, input), {
      day: input.day, hints: [{ participantId: input.participantId, hint: input.hint, revision: 1 }],
    });
    assert.equal((await readDailyHints(client, teamA, now)).hints.length, 1, 'absent current members can write notes');
    await assert.rejects(saveFromLink(token, { ...input, teamId: teamB }), hasStatus(400));
    await assert.rejects(saveFromLink(token, { ...input, participantId: 'only-b' }), hasStatus(404));
    await assert.rejects(saveFromLink(token, { ...input, participantId: 'archived' }), hasStatus(404));
    await assert.rejects(saveFromLink(token, { ...input, participantId: 'unknown' }), hasStatus(404));
    await assert.rejects(saveFromLink(token, input), hasStatus(409));
    await assert.rejects(saveFromLink(token, { ...input, revision: 2 }), hasStatus(409));
    await assert.rejects(saveFromLink(token, { ...input, day: '2026-10-15', revision: 1 }), hasStatus(409));

    const forgedPayload = Buffer.from(JSON.stringify({ v: 1, teamId: teamB })).toString('base64url');
    const batchesBeforeForgery = batches;
    await assert.rejects(saveFromLink(`${forgedPayload}.${token.split('.')[1]}`, { ...input, hint: 'Écraser B', revision: 1 }), hasStatus(403));
    assert.equal(batches, batchesBeforeForgery, 'forged scope is rejected before reaching the store');

    const markdown = '**Avancement**\n\n- API terminée\n- *Tests* en cours\n\n1. ~~Ancien~~\n2. Suite';
    const updated = await saveFromLink(token, { ...input, hint: ` \n${markdown}\n `, revision: 1 });
    assert.deepEqual(updated, { day: input.day, hints: [{ participantId: input.participantId, hint: markdown, revision: 2 }] });
    assert.equal((await engine.query('SELECT hint FROM participant_daily_hints WHERE team_id=$1', [teamA])).rows[0].hint, markdown, 'database preserves Markdown exactly after outer trimming');
    const fetched = await readDailyHints(client, teamA, now);
    assert.deepEqual(fetched, updated, 'GET store returns unchanged Markdown and revisions');
    const { ParticipantNote } = await tsImport('../src/components/ui/participant-note.tsx', import.meta.url) as { ParticipantNote: ComponentType<{ hint: string }> };
    const html = renderToStaticMarkup(createElement(ParticipantNote, { hint: fetched.hints[0].hint }));
    assert.match(html, /<strong>Avancement<\/strong>/);
    assert.match(html, /<em>Tests<\/em>/);
    assert.match(html, /<del>Ancien<\/del>/);
    assert.match(html, /<ul>/);
    assert.match(html, /<ol>/);
    await assert.rejects(saveFromLink(token, { ...input, hint: 'Brouillon périmé', revision: 1 }), hasStatus(409));
    assert.deepEqual(await readDailyHints(client, teamA, now), updated, 'failed CAS cannot overwrite the winner');
    assert.deepEqual(await readDailyHints(client, teamB, now), otherNotes, 'same participant ID does not allow a cross-team overwrite');
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM participant_daily_hints')).rows[0].n, 2, 'rejections create no extra or archived-member notes');
    assert.deepEqual(await managementSnapshot(), before, 'all non-note rows, including both teams’ archived sessions and turns, remain unchanged');
  } finally { await engine.close(); }
});