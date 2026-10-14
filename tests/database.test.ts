import assert from 'node:assert/strict';
import test from 'node:test';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/neon-http';
import { and, eq, sql } from 'drizzle-orm';
import { rounds, spaces } from '../src/db/schema.ts';

test('Drizzle schema preserves legacy tables, composite keys, cascade and retention index', () => {
  const team = getTableConfig(spaces);
  const history = getTableConfig(rounds);
  assert.equal(team.name, 'standup_spaces');
  assert.deepEqual(team.columns.map(column => column.name), ['id', 'team', 'revision', 'updated_at']);
  assert.equal(history.name, 'standup_rounds');
  assert.equal(history.primaryKeys[0].getName(), 'standup_rounds_pkey');
  assert.deepEqual(history.primaryKeys[0].columns.map(column => column.name), ['space_id', 'id']);
  assert.equal(history.foreignKeys[0].getName(), 'standup_rounds_space_id_fkey');
  assert.equal(history.foreignKeys[0].onDelete, 'cascade');
  assert.equal(history.indexes[0].config.name, 'standup_rounds_completed');
});

test('Drizzle optimistic profile updates parameterize private identifiers and revision', () => {
  const db = drizzle.mock();
  const query = db.update(spaces).set({ revision: sql`${spaces.revision} + 1` })
    .where(and(eq(spaces.id, 'private-id'), eq(spaces.revision, 4)))
    .returning({ revision: spaces.revision }).toSQL();
  assert.ok(!query.sql.includes('private-id'));
  assert.deepEqual(query.params, ['private-id', 4]);
  assert.match(query.sql, /"revision" \+ 1/);
});