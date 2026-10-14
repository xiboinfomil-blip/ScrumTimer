import { foreignKey, index, integer, jsonb, pgTable, primaryKey, text, timestamp } from 'drizzle-orm/pg-core';
import type { TeamState } from '../types/team';
import type { HistoryRound } from '../lib/history';

export const spaces = pgTable('standup_spaces', {
  id: text('id').primaryKey(),
  team: jsonb('team').$type<TeamState>().notNull(),
  revision: integer('revision').default(1).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const rounds = pgTable('standup_rounds', {
  spaceId: text('space_id').notNull(),
  id: text('id').notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  result: jsonb('result').$type<HistoryRound>().notNull(),
}, table => [
  primaryKey({ name: 'standup_rounds_pkey', columns: [table.spaceId, table.id] }),
  foreignKey({ name: 'standup_rounds_space_id_fkey', columns: [table.spaceId], foreignColumns: [spaces.id] }).onDelete('cascade'),
  index('standup_rounds_completed').on(table.completedAt),
]);