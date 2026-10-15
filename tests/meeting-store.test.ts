import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PgDialect, getTableConfig } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { DEFAULT_DISCUSSION_PROMPTS } from '../src/lib/meeting-settings.ts';
import { readMeetingSettings, saveMeetingSettings, readRoundFeedback, saveRoundFeedback } from '../src/lib/meeting-store.ts';
import { roundFeedback, teamDiscussionPrompts, teamMeetingSettings } from '../src/db/schema.ts';

test('meeting tables use normalized scoped keys and cascading archive FKs', () => {
  for (const table of [roundFeedback, teamDiscussionPrompts, teamMeetingSettings]) {
    const config = getTableConfig(table);
    assert.equal(config.primaryKeys[0].columns[0].name, 'team_id');
    assert.ok(config.columns.every(column => !/json/i.test(column.getSQLType())));
    assert.ok(config.foreignKeys.every(key => key.onDelete === 'cascade'));
  }
  const feedback = getTableConfig(roundFeedback);
  assert.deepEqual(feedback.primaryKeys[0].columns.map(column => column.name), ['team_id', 'session_id', 'participant_id']);
  assert.ok(feedback.foreignKeys.every(key => key.reference().foreignTable !== roundFeedback));
  assert.ok(feedback.foreignKeys.some(key => key.reference().columns.length === 3));
});

test('PGlite: generated migrations, settings CAS/rollback/isolation and feedback upsert/retention', async () => {
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
    const now = new Date('2026-10-15T14:00:00Z');
    assert.deepEqual((await readRoundFeedback(client, a, 'round', now)).counts, { utile: 0, mitige: 0, 'pas-utile': 0 });
    await saveRoundFeedback(client, a, { roundId: 'round', participantId: 'p1', value: 'utile' }, now);
    await saveRoundFeedback(client, a, { roundId: 'round', participantId: 'p1', value: 'utile' }, now);
    const replaced = await saveRoundFeedback(client, a, { roundId: 'round', participantId: 'p1', value: 'mitige' }, now);
    assert.equal(replaced.responses.length, 1);
    assert.deepEqual(replaced.counts, { utile: 0, mitige: 1, 'pas-utile': 0 });
    await saveRoundFeedback(client, a, { roundId: 'round', participantId: 'p2', value: 'pas-utile' }, now);
    await saveRoundFeedback(client, b, { roundId: 'round', participantId: 'p1', value: 'utile' }, now);
    assert.deepEqual((await readRoundFeedback(client, b, 'round', now)).counts, { utile: 1, mitige: 0, 'pas-utile': 0 });
    await Promise.all([
      saveRoundFeedback(client, b, { roundId: 'round', participantId: 'p1', value: 'mitige' }, now),
      saveRoundFeedback(client, b, { roundId: 'round', participantId: 'p1', value: 'utile' }, now),
    ]);
    assert.equal((await readRoundFeedback(client, b, 'round', now)).responses.length, 1, 'concurrent feedback cannot accumulate duplicates');
    await assert.rejects(saveRoundFeedback(client, a, { roundId: 'round', participantId: 'not-archived', value: 'utile' }, now), { status: 404 });
    await assert.rejects(saveRoundFeedback(client, a, { roundId: 'other-round', participantId: 'p1', value: 'utile' }, now), { status: 404 });
    await assert.rejects(engine.query("INSERT INTO round_feedback(team_id,session_id,participant_id,value) VALUES($1,'round','not-archived','utile')", [a]));
    await assert.rejects(engine.query("UPDATE round_feedback SET value='unknown' WHERE team_id=$1", [a]));
    await engine.query("DELETE FROM standup_sessions WHERE team_id=$1 AND id='round'", [a]);
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM round_feedback WHERE team_id=$1', [a])).rows[0].n, 0);
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM round_feedback WHERE team_id=$1', [b])).rows[0].n, 1);
    await assert.rejects(readRoundFeedback(client, b, 'round', new Date('2026-10-20T00:00:00Z')), { status: 404 });
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM round_feedback')).rows[0].n, 0, 'expired rounds cascade feedback on access');
    assert.equal((await readMeetingSettings(client, a)).prompts.length, 3, 'round deletion leaves settings');
    await engine.query('DELETE FROM teams WHERE id=$1', [a]);
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM team_discussion_prompts WHERE team_id=$1', [a])).rows[0].n, 0);
    assert.equal((await engine.query('SELECT count(*)::int AS n FROM team_meeting_settings WHERE team_id=$1', [a])).rows[0].n, 0);
  } finally { await engine.close(); }
});