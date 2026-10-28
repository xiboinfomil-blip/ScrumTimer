import assert from 'node:assert/strict';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { PgDialect } from 'drizzle-orm/pg-core';
import { pruneHistoryStatement } from '../src/lib/history/retention.ts';
import { authorizedMaintenance, maintainDatabase } from '../src/lib/persistence/maintenance.ts';
import { readFileSync } from 'node:fs';
import type { SQL } from 'drizzle-orm';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';

test('maintenance requires an exact bearer secret and fails closed for missing or weak configuration', () => {
  const secret = 'fixture-secret-'.repeat(4);
  const request = (authorization?: string) => new Request('https://example.test/api/cron/cleanup', { headers: authorization ? { authorization } : {} });
  assert.equal(authorizedMaintenance(request(`Bearer ${secret}`), secret), true);
  for (const header of [undefined, secret, `bearer ${secret}`, `Bearer ${secret}x`, 'Bearer undefined']) assert.equal(authorizedMaintenance(request(header), secret), false);
  for (const config of [undefined, '', 'short', ' '.repeat(32)]) assert.equal(authorizedMaintenance(request(`Bearer ${config}`), config), false);
});

function clientFor(engine: PGlite) {
  return {
    execute(query: SQL) { return { query }; },
    batch(queries: { query: SQL }[]) {
      return engine.transaction(async transaction => {
        const results = [];
        for (const { query } of queries) {
          const compiled = new PgDialect().sqlToQuery(query);
          results.push(await transaction.query(compiled.sql, compiled.params));
        }
        return results;
      });
    },
  } as unknown as Parameters<typeof maintainDatabase>[0];
}

test('maintenance prunes inactive teams, cascades turns, preserves live references and rolls back failures', async () => {
  const engine = new PGlite();
  const now = new Date('2026-10-28T20:00:00Z');
  const team = 'a'.repeat(64), other = 'b'.repeat(64);
  const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');
  try {
    const journal = JSON.parse(read('../drizzle/meta/_journal.json')) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) await engine.exec(read(`../drizzle/${tag}.sql`));
    await engine.query('INSERT INTO workspaces(id) VALUES($1)', [team]);
    for (const id of [team, other]) {
      await engine.query("INSERT INTO teams(id,workspace_id,name,duration,warning,sound) VALUES($1,$2,$3,120,30,true)", [id, team, id[0]]);
      await engine.query("INSERT INTO participants(team_id,id,name) VALUES($1,'member','Member'),($1,'historic','Historic'),($1,'orphan','Orphan')", [id]);
      await engine.query("INSERT INTO team_members VALUES($1,'member',0,true)", [id]);
      await engine.query("INSERT INTO mood_meters VALUES($1,'kept','Kept'),($1,'unused','Unused')", [id]);
      await engine.query("INSERT INTO standup_sessions SELECT $1,id::text,'2020-01-01'::timestamptz + id * interval '1 day',0 FROM generate_series(1,7) id", [id]);
      await engine.query("INSERT INTO speaking_turns(team_id,session_id,participant_id,position,name_snapshot,speaking_seconds,budget_seconds,time_up,meter_id) SELECT $1,id::text,'historic',0,'Historic',20,120,false,'kept' FROM generate_series(1,7) id", [id]);
      await engine.query("INSERT INTO mood_meter_identifiers VALUES($1,'today'),($1,'past'),($1,'used'),($1,'unreferenced')", [id]);
      await engine.query("INSERT INTO team_daily_meters VALUES($1,'2026-10-29','today','Today'),($1,'2026-10-28','past','Past')", [id]);
      await engine.query("INSERT INTO team_used_mood_meters VALUES($1,'used',0)", [id]);
      await engine.query("INSERT INTO mood_meter_slides VALUES($1,'current','kept','/mood-meters/slides/test/current.svg',1),($1,'unused','unused','/mood-meters/slides/test/unused.svg',2)", [id]);
      await engine.query("INSERT INTO participant_check_ins VALUES($1,'member',2,$2,'current','today')", [id, id === team ? '2026-10-28T20:00:00Z' : '2026-10-28T19:59:59Z']);
      await engine.query("INSERT INTO participant_daily_hints VALUES($1,'member','2026-10-29','Today',1),($1,'orphan','2026-10-28','Past',1)", [id]);
    }
    await engine.query("INSERT INTO jira_oauth_states VALUES($1,'2026-10-28T20:00:00Z'),($2,'2026-10-29T00:00:00Z')", ['c'.repeat(64), 'd'.repeat(64)]);
    await engine.query("INSERT INTO jira_sessions(id,account_id,display_name,access_token,access_expires_at,expires_at) VALUES($1,'account','Name','encrypted','2020-01-01','2026-10-29'),($2,'account','Name','encrypted','2020-01-01','2026-10-28T20:00:00Z')", ['e'.repeat(64), 'f'.repeat(64)]);
    await engine.exec("CREATE FUNCTION reject_cleanup() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$; CREATE TRIGGER reject_cleanup BEFORE DELETE ON participants FOR EACH ROW EXECUTE FUNCTION reject_cleanup();");
    await assert.rejects(maintainDatabase(clientFor(engine), now));
    assert.equal((await engine.query('SELECT * FROM standup_sessions')).rows.length, 14);
    assert.equal((await engine.query('SELECT * FROM participant_daily_hints')).rows.length, 4);
    await engine.exec('DROP TRIGGER reject_cleanup ON participants');
    const result = await maintainDatabase(clientFor(engine), now);
    assert.equal(result.history, 4);
    assert.equal(result.participants, 2);
    assert.equal(result.notes, 2);
    assert.equal(result.dailyMeters, 2);
    assert.equal(result.checkIns, 1);
    assert.equal(result.slides, 3);
    assert.equal(result.oauthStates, 1);
    assert.equal(result.jiraSessions, 1);
    assert.equal((await engine.query('SELECT * FROM speaking_turns')).rows.length, 10);
    assert.equal((await engine.query('SELECT * FROM teams')).rows.length, 2);
    assert.equal((await engine.query('SELECT * FROM team_members')).rows.length, 2);
    assert.equal((await engine.query('SELECT * FROM mood_meters')).rows.length, 2);
    assert.equal((await engine.query('SELECT * FROM participant_check_ins')).rows.length, 1);
    assert.equal((await engine.query('SELECT * FROM mood_meter_slides')).rows.length, 1);
    assert.equal((await engine.query('SELECT * FROM mood_meter_identifiers')).rows.length, 4);
    assert.ok(Object.values(await maintainDatabase(clientFor(engine), now)).every(count => count === 0));
  } finally { await engine.close(); }
});

test('actual cron route authenticates before database access, never caches, and hides internal failures', async () => {
  const source = readFileSync(new URL('../src/app/api/cron/cleanup/route.ts', import.meta.url), 'utf8');
  const secret = 'fixture-cron-secret-'.repeat(3);
  let connectionCalls = 0, invalidations = 0, cleanupCalls = 0;
  let failure = false;
  const connection = {};
  const environment: { CRON_SECRET?: string } = {};
  const modules: Record<string, unknown> = {
    '@/lib/persistence/database': { database: () => { connectionCalls++; return connection; } },
    '@/lib/persistence/maintenance': { authorizedMaintenance, maintainDatabase: async (db: unknown) => {
      assert.equal(db, connection); cleanupCalls++;
      if (failure) throw new Error('private database connection and token');
      return { history: 3 };
    } },
    '@/lib/persistence/shared-read-cache': { teamReadCache: { mutate: async (operation: () => Promise<unknown>) => { invalidations++; return operation(); } } },
  };
  const handlers: { GET?: (request: Request) => Promise<Response> } = {};
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: handlers, Response, process: { env: environment }, require: (name: string) => {
      assert.ok(Object.hasOwn(modules, name)); return modules[name];
    },
  });
  const request = (authorization?: string) => new Request('https://example.test/api/cron/cleanup?keep=0', { headers: authorization ? { authorization } : {} });
  let response = await handlers.GET!(request(`Bearer ${secret}`));
  assert.equal(response.status, 401);
  environment.CRON_SECRET = secret;
  response = await handlers.GET!(request());
  assert.equal(response.status, 401);
  assert.equal(connectionCalls, 0); assert.equal(cleanupCalls, 0); assert.equal(invalidations, 0);
  response = await handlers.GET!(request(`Bearer ${secret}`));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true, deleted: { history: 3 } });
  failure = true;
  response = await handlers.GET!(request(`Bearer ${secret}`));
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await response.text(), /private|token|connection/);
  assert.equal(invalidations, 2);
  const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
  assert.deepEqual(config.crons, [{ path: '/api/cron/cleanup', schedule: '0 2 * * *' }]);
});

test('history retention keeps five newest per team regardless of age, resolves ties and is idempotent', async () => {
  const engine = new PGlite();
  try {
    await engine.exec(`CREATE TABLE standup_sessions (team_id text,id text,completed_at timestamptz,PRIMARY KEY(team_id,id));
      INSERT INTO standup_sessions SELECT team,id::text,'2020-01-01'::timestamptz + id * interval '1 day'
      FROM unnest(ARRAY['a','b']) team CROSS JOIN generate_series(1,7) id;
      INSERT INTO standup_sessions VALUES ('c','old','2000-01-01'),('a','tie','2020-01-08');`);
    const execute = async (teamId?: string) => {
      const query = new PgDialect().sqlToQuery(pruneHistoryStatement(teamId));
      return engine.query(query.sql, query.params);
    };
    await execute('a');
    assert.deepEqual((await engine.query('SELECT id FROM standup_sessions WHERE team_id=\'a\' ORDER BY completed_at DESC,id')).rows, ['7','tie','6','5','4'].map(id => ({ id })));
    assert.equal((await engine.query('SELECT * FROM standup_sessions WHERE team_id=\'b\'')).rows.length, 7);
    await execute();
    assert.equal((await engine.query('SELECT * FROM standup_sessions')).rows.length, 11);
    assert.equal((await execute()).affectedRows, 0);
  } finally { await engine.close(); }
});