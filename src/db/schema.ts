import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, doublePrecision, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, unique, uniqueIndex } from 'drizzle-orm/pg-core';

// Disposable global source cache; never references team-owned history or check-ins.
export const remoteMoodCacheState = pgTable('remote_mood_cache_state', {
  id: integer('id').primaryKey(), generation: text('generation').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, t => [check('remote_mood_cache_singleton', sql`${t.id} = 1`)]);
export const remoteMoodCatalog = pgTable('remote_mood_catalog', {
  id: text('id').primaryKey(), googleId: text('google_id').notNull(), title: text('title').notNull(), category: text('category').notNull(),
  loadedAt: timestamp('loaded_at', { withTimezone: true }),
}, t => [check('remote_mood_catalog_id', sql`${t.id} ~ '^deck-[a-f0-9]{20}$'`), check('remote_mood_catalog_google_id', sql`${t.googleId} ~ '^[a-zA-Z0-9_-]+$'`)]);
export const remoteMoodPages = pgTable('remote_mood_pages', {
  deckId: text('deck_id').notNull().references(() => remoteMoodCatalog.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(), pageId: text('page_id').notNull(),
}, t => [primaryKey({ columns: [t.deckId, t.position] }), unique('remote_mood_pages_identity').on(t.deckId, t.pageId),
  check('remote_mood_pages_position', sql`${t.position} BETWEEN 0 AND 499`), check('remote_mood_pages_id', sql`${t.pageId} ~ '^[a-zA-Z0-9_.-]+$' AND ${t.pageId} !~ '[.][.]'`)]);

export const workspaces = pgTable('workspaces', {
  id: text('id').primaryKey(),
}, t => [check('workspaces_id', sql`${t.id} ~ '^[a-f0-9]{64}$'`)]);

export const teams = pgTable('teams', {
  id: text('id').primaryKey(), revision: integer('revision').notNull().default(1),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id), name: text('name').notNull(),
  category: text('category', { enum: ['Tech', 'Produit', 'Support', 'Marketing'] }),
  favorite: boolean('favorite').notNull().default(false),
  writeTransaction: bigint('write_transaction', { mode: 'bigint' }).notNull().default(sql`0`),
  duration: integer('duration').notNull(), warning: integer('warning').notNull(), sound: boolean('sound').notNull(),
}, t => [check('teams_category', sql`${t.category} IN ('Tech','Produit','Support','Marketing')`), uniqueIndex('teams_workspace_name').on(t.workspaceId, sql`lower(${t.name})`), check('teams_name', sql`length(${t.name}) BETWEEN 1 AND 60 AND ${t.name} = btrim(${t.name}) AND ${t.name} !~ '[[:cntrl:]]'`), check('teams_id', sql`${t.id} ~ '^[a-f0-9]{64}$'`), check('teams_revision', sql`${t.revision} >= 1`), check('teams_duration', sql`${t.duration} BETWEEN 1 AND 3659`), check('teams_warning', sql`${t.warning} IN (0,10,15,30,60)`)]);
export const participants = pgTable('participants', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }), id: text('id').notNull(), name: text('name').notNull(),
}, t => [primaryKey({ columns: [t.teamId, t.id] }), check('participants_id', sql`length(${t.id}) BETWEEN 1 AND 100 AND ${t.id} !~ '[[:cntrl:]]'`), check('participants_name', sql`length(${t.name}) BETWEEN 1 AND 60 AND ${t.name} = btrim(${t.name}) AND ${t.name} !~ '[[:cntrl:]]'`)]);
export const teamMembers = pgTable('team_members', {
  teamId: text('team_id').notNull(), participantId: text('participant_id').notNull(), position: integer('position').notNull(), present: boolean('present').notNull(),
}, t => [primaryKey({ columns: [t.teamId, t.participantId] }), foreignKey({ columns: [t.teamId, t.participantId], foreignColumns: [participants.teamId, participants.id] }).onDelete('cascade'), unique('team_members_position').on(t.teamId, t.position), check('team_members_position_bounds', sql`${t.position} BETWEEN 0 AND 99`)]);
export const moodMeters = pgTable('mood_meters', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }), id: text('id').notNull(), title: text('title').notNull(),
}, t => [primaryKey({ columns: [t.teamId, t.id] }), unique('mood_meters_title').on(t.teamId, t.title), check('mood_meters_title_length', sql`length(${t.title}) <= 200`)]);
export const moodMeterIdentifiers = pgTable('mood_meter_identifiers', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }), id: text('id').notNull(),
}, t => [primaryKey({ columns: [t.teamId, t.id] }), check('mood_meter_identifiers_length', sql`length(${t.id}) BETWEEN 1 AND 200`)]);
export const teamDailyMeters = pgTable('team_daily_meters', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }), day: date('day').notNull(),
  meterId: text('meter_id').notNull(), title: text('title').notNull(),
}, t => [primaryKey({ columns: [t.teamId, t.day] }), foreignKey({ columns: [t.teamId, t.meterId], foreignColumns: [moodMeterIdentifiers.teamId, moodMeterIdentifiers.id] }), check('team_daily_meters_identifier', sql`length(${t.meterId}) BETWEEN 1 AND 200`), check('team_daily_meters_title', sql`length(${t.title}) BETWEEN 1 AND 200`)]);
export const moodMeterSlides = pgTable('mood_meter_slides', {
  teamId: text('team_id').notNull(), id: text('id').notNull(), meterId: text('meter_id').notNull(), image: text('image').notNull(), slideNumber: integer('slide_number').notNull(),
}, t => [primaryKey({ columns: [t.teamId, t.id] }), foreignKey({ columns: [t.teamId, t.meterId], foreignColumns: [moodMeters.teamId, moodMeters.id] }).onDelete('cascade'), unique('mood_meter_slides_context').on(t.teamId, t.meterId, t.image, t.slideNumber), check('mood_meter_slides_number', sql`${t.slideNumber} BETWEEN 1 AND 10000`), check('mood_meter_slides_image', sql`${t.image} ~* '^/mood-meters/slides/[a-zA-Z0-9_ ./-]+[.](png|jpe?g|gif|webp|svg)$' AND ${t.image} !~ '/([.]{1,2})?(/|$)'`)]);
export const participantCheckIns = pgTable('participant_check_ins', {
  teamId: text('team_id').notNull(), participantId: text('participant_id').notNull(), mood: integer('mood'), moodUpdatedAt: timestamp('mood_updated_at', { withTimezone: true }), slideId: text('slide_id'), identifierId: text('identifier_id'),
}, t => [primaryKey({ columns: [t.teamId, t.participantId] }), foreignKey({ columns: [t.teamId, t.participantId], foreignColumns: [teamMembers.teamId, teamMembers.participantId] }).onDelete('cascade'), foreignKey({ columns: [t.teamId, t.slideId], foreignColumns: [moodMeterSlides.teamId, moodMeterSlides.id] }), foreignKey({ columns: [t.teamId, t.identifierId], foreignColumns: [moodMeterIdentifiers.teamId, moodMeterIdentifiers.id] }), check('participant_check_ins_mood', sql`${t.mood} BETWEEN 1 AND 4`), check('participant_check_ins_identifier', sql`${t.identifierId} IS NULL OR ${t.slideId} IS NOT NULL`)]);
export const teamUsedMoodMeters = pgTable('team_used_mood_meters', {
  teamId: text('team_id').notNull(), identifierId: text('identifier_id').notNull(), position: integer('position').notNull(),
}, t => [primaryKey({ columns: [t.teamId, t.identifierId] }), foreignKey({ columns: [t.teamId, t.identifierId], foreignColumns: [moodMeterIdentifiers.teamId, moodMeterIdentifiers.id] }).onDelete('cascade'), unique('team_used_mood_meters_position').on(t.teamId, t.position), check('team_used_mood_meters_bounds', sql`${t.position} BETWEEN 0 AND 1999`)]);
export const standupSessions = pgTable('standup_sessions', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }), id: text('id').notNull(), completedAt: timestamp('completed_at', { withTimezone: true }).notNull(),
  writeTransaction: bigint('write_transaction', { mode: 'bigint' }).notNull().default(sql`0`),
}, t => [primaryKey({ columns: [t.teamId, t.id] }), index('standup_sessions_completed').on(t.teamId, t.completedAt), check('standup_sessions_id', sql`${t.id} ~ '^[a-zA-Z0-9_-]{1,100}$'`)]);
export const speakingTurns = pgTable('speaking_turns', {
  teamId: text('team_id').notNull(), sessionId: text('session_id').notNull(), participantId: text('participant_id').notNull(), position: integer('position').notNull(), nameSnapshot: text('name_snapshot').notNull(), mood: integer('mood'), speakingSeconds: doublePrecision('speaking_seconds').notNull(), budgetSeconds: doublePrecision('budget_seconds').notNull(), timeUp: boolean('time_up').notNull(), score: integer('score'), meterId: text('meter_id'),
}, t => [primaryKey({ columns: [t.teamId, t.sessionId, t.participantId] }), foreignKey({ columns: [t.teamId, t.sessionId], foreignColumns: [standupSessions.teamId, standupSessions.id] }).onDelete('cascade'), foreignKey({ columns: [t.teamId, t.participantId], foreignColumns: [participants.teamId, participants.id] }), foreignKey({ columns: [t.teamId, t.meterId], foreignColumns: [moodMeters.teamId, moodMeters.id] }), unique('speaking_turns_position').on(t.teamId, t.sessionId, t.position), check('speaking_turns_position_bounds', sql`${t.position} BETWEEN 0 AND 99`), check('speaking_turns_name', sql`length(${t.nameSnapshot}) BETWEEN 1 AND 60 AND ${t.nameSnapshot} = btrim(${t.nameSnapshot}) AND ${t.nameSnapshot} !~ '[[:cntrl:]]'`), check('speaking_turns_mood', sql`${t.mood} BETWEEN 1 AND 4`), check('speaking_turns_times', sql`${t.speakingSeconds} BETWEEN 0 AND 86400 AND ${t.budgetSeconds} BETWEEN 0 AND 86400`), check('speaking_turns_score', sql`${t.score} BETWEEN 0 AND 1000`)]);

// Separate CAS state: prompt edits never change the roster's revision/write gate.
export const teamMeetingSettings = pgTable('team_meeting_settings', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  revision: integer('revision').notNull().default(0),
  writeTransaction: bigint('write_transaction', { mode: 'bigint' }).notNull().default(sql`0`),
}, t => [primaryKey({ columns: [t.teamId] }), check('team_meeting_settings_revision', sql`${t.revision} >= 0`)]);
export const teamDiscussionPrompts = pgTable('team_discussion_prompts', {
  teamId: text('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(), prompt: text('prompt').notNull(),
}, t => [primaryKey({ columns: [t.teamId, t.position] }), check('team_discussion_prompts_position', sql`${t.position} BETWEEN 0 AND 4`),
  check('team_discussion_prompts_text', sql`length(${t.prompt}) BETWEEN 1 AND 160 AND ${t.prompt} = btrim(${t.prompt}) AND ${t.prompt} !~ '[[:cntrl:]]'`)]);
// Identity FK, not membership: roster writes delete/reinsert team_members.
export const participantDailyHints = pgTable('participant_daily_hints', {
  teamId: text('team_id').notNull(), participantId: text('participant_id').notNull(),
  day: date('day').notNull(), hint: text('hint').notNull(), revision: integer('revision').notNull(),
}, t => [primaryKey({ columns: [t.teamId, t.participantId] }),
  foreignKey({ columns: [t.teamId, t.participantId], foreignColumns: [participants.teamId, participants.id] }).onDelete('cascade'),
  index('participant_daily_hints_day').on(t.day),
  check('participant_daily_hints_revision', sql`${t.revision} >= 1`),
  check('participant_daily_hints_text', sql`length(${t.hint}) BETWEEN 1 AND 600 AND ${t.hint} = btrim(${t.hint}, E' \\n\\r\\t\\013\\014') AND ${t.hint} !~ '[\\x01-\\x09\\x0B-\\x1F\\x7F-\\x9F]'`),
]);

export const jiraTeamSprints = pgTable('jira_team_sprints', {
  teamId: text('team_id').primaryKey().references(() => teams.id, { onDelete: 'cascade' }),
  cloudId: text('cloud_id').notNull(), boardId: integer('board_id').notNull(), sprintId: integer('sprint_id').notNull(),
  sprintName: text('sprint_name').notNull(),
}, table => [check('jira_team_sprints_cloud', sql`${table.cloudId} ~ '^[a-fA-F0-9-]{36}$'`),
  check('jira_team_sprints_ids', sql`${table.boardId} > 0 AND ${table.sprintId} > 0`),
  check('jira_team_sprints_name', sql`length(${table.sprintName}) BETWEEN 1 AND 200`)]);

export const jiraOAuthStates = pgTable('jira_oauth_states', {
  id: text('id').primaryKey(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, table => [check('jira_oauth_states_id', sql`${table.id} ~ '^[a-f0-9]{64}$'`), index('jira_oauth_states_expiry').on(table.expiresAt)]);

export const jiraSessions = pgTable('jira_sessions', {
  id: text('id').primaryKey(), accountId: text('account_id').notNull(), displayName: text('display_name').notNull(),
  accessToken: text('access_token').notNull(), refreshToken: text('refresh_token'),
  accessExpiresAt: timestamp('access_expires_at', { withTimezone: true }).notNull(), expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  refreshLease: text('refresh_lease'), refreshLeaseUntil: timestamp('refresh_lease_until', { withTimezone: true }),
}, table => [check('jira_sessions_id', sql`${table.id} ~ '^[a-f0-9]{64}$'`),
  check('jira_sessions_account', sql`length(${table.accountId}) BETWEEN 1 AND 100`), index('jira_sessions_expiry').on(table.expiresAt)]);
