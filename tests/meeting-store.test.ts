import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { DEFAULT_DISCUSSION_PROMPTS } from '../src/lib/meeting-settings.ts';
import { readMeetingSettings, saveMeetingSettings } from '../src/lib/meeting-store.ts';
import { teamDiscussionPrompts, teamMeetingSettings } from '../src/db/schema.ts';

test('meeting settings tables use normalized scoped keys and cascading team FKs', () => {
  for (const table of [teamDiscussionPrompts, teamMeetingSettings]) {
    const config = getTableConfig(table);
    assert.equal(config.primaryKeys[0].columns[0].name, 'team_id');
    assert.ok(config.columns.every(column => !/json/i.test(column.getSQLType())));
    assert.ok(config.foreignKeys.every(key => key.onDelete === 'cascade'));
  }
});

test('PGlite: generated migrations and settings CAS/rollback/isolation', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const engine = new PGlite();
  try {
    const journal = JSON.parse(readFileSync(new URL('../drizzle/meta/_journal.json', import.meta.url), 'utf8')) as { entries: { tag: string }[] };
    for (const entry of journal.entries) await engine.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), 'utf8'));
    const client = {
      execute(query: SQL) {
        return { query, then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
          const compiled = new PgDialect().sqlToQuery(query);
          return engine.query(compiled.sql, compiled.params).then(resolve, reject);
        } };
      },
      batch(queries: { query: SQL }[]) {
        return engine.transaction(async tx => {
          const results = [];
          for (const query of queries) {
            const compiled = new PgDialect().sqlToQuery(query.query);
            results.push(await tx.query(compiled.sql, compiled.params));
          }
          return results;
        });
      },
    } as unknown as Parameters<typeof saveMeetingSettings>[0];
    const a = 'a'.repeat(64), b = 'b'.repeat(64), workspace = '0'.repeat(64);
    await engine.query('INSERT INTO workspaces(id) VALUES($1)', [workspace]);
    for (const [id, name] of [[a, 'A'], [b, 'B']]) {
      await engine.query('INSERT INTO teams(id,workspace_id,name,duration,warning,sound) VALUES($1,$2,$3,120,30,true)', [id, workspace, name]);
      for (const person of ['p1', 'p2', 'not-archived']) await engine.query('INSERT INTO participants(team_id,id,name) VALUES($1,$2,$2)', [id, person]);
      await engine.query("INSERT INTO standup_sessions(team_id,id,completed_at) VALUES($1,'round',$2)", [id, '2026-10-15T12:00:00Z']);
      for (const [position, person] of ['p1', 'p2'].entries()) await engine.query("INSERT INTO speaking_turns(team_id,session_id,participant_id,position,name_snapshot,speaking_seconds,budget_seconds,time_up) VALUES($1,'round',$2,$3,$2,30,120,false)", [id, person, position]);
    }
    assert.deepEqual(await readMeetingSettings(client, a), { prompts: [...DEFAULT_DISCUSSION_PROMPTS], revision: 0 });
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM team_discussion_prompts')).rows[0].n, 0, 'reading defaults never creates rows');
    const saved = await saveMeetingSettings(client, a, { prompts: ['Blocages ?', "Besoin d’aide ?"], revision: 0 });
    assert.equal(saved.revision, 1);
    await assert.rejects(saveMeetingSettings(client, a, { prompts: ['Silent overwrite'], revision: 0 }), { status: 409 });
    assert.deepEqual(await readMeetingSettings(client, a), saved);
    assert.equal((await engine.query('SELECT revision FROM teams WHERE id=$1', [a])).rows[0].revision, 1, 'roster revision unaffected');
    assert.deepEqual(await readMeetingSettings(client, b), { prompts: [...DEFAULT_DISCUSSION_PROMPTS], revision: 0 });
    const writers = await Promise.allSettled([
      saveMeetingSettings(client, a, { prompts: ['Winner A'], revision: 1 }),
      saveMeetingSettings(client, a, { prompts: ['Winner B'], revision: 1 }),
    ]);
    assert.equal(writers.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(writers.filter(result => result.status === 'rejected' && result.reason.status === 409).length, 1);
    assert.equal((await readMeetingSettings(client, a)).revision, 2);
    await assert.rejects(engine.transaction(async tx => {
      await tx.query('DELETE FROM team_discussion_prompts WHERE team_id=$1', [a]);
      await tx.query('INSERT INTO team_discussion_prompts(team_id,position,prompt) VALUES($1,5,$2)', [a, 'Invalid']);
    }));
    assert.equal((await readMeetingSettings(client, a)).prompts.length, 1, 'constraint failure rolls back deletion');
    await saveMeetingSettings(client, a, { prompts: [...DEFAULT_DISCUSSION_PROMPTS], revision: 2 });
    await engine.query("DELETE FROM standup_sessions WHERE team_id=$1 AND id='round'", [a]);
    assert.equal((await readMeetingSettings(client, a)).prompts.length, 3, 'round deletion leaves settings');
    await engine.query('DELETE FROM teams WHERE id=$1', [a]);
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM team_discussion_prompts WHERE team_id=$1', [a])).rows[0].n, 0);
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM team_meeting_settings WHERE team_id=$1', [a])).rows[0].n, 0);
  } finally { await engine.close(); }
});