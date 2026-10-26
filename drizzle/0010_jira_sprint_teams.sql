CREATE TABLE "jira_oauth_states" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "jira_oauth_states_id" CHECK ("jira_oauth_states"."id" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "jira_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"display_name" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"access_expires_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"refresh_lease" text,
	"refresh_lease_until" timestamp with time zone,
	CONSTRAINT "jira_sessions_id" CHECK ("jira_sessions"."id" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "jira_sessions_account" CHECK (length("jira_sessions"."account_id") BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "jira_team_sprints" (
	"team_id" text PRIMARY KEY NOT NULL,
	"cloud_id" text NOT NULL,
	"board_id" integer NOT NULL,
	"sprint_id" integer NOT NULL,
	"sprint_name" text NOT NULL,
	CONSTRAINT "jira_team_sprints_cloud" CHECK ("jira_team_sprints"."cloud_id" ~ '^[a-fA-F0-9-]{36}$'),
	CONSTRAINT "jira_team_sprints_ids" CHECK ("jira_team_sprints"."board_id" > 0 AND "jira_team_sprints"."sprint_id" > 0),
	CONSTRAINT "jira_team_sprints_name" CHECK (length("jira_team_sprints"."sprint_name") BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "jira_team_sprints" ADD CONSTRAINT "jira_team_sprints_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "jira_oauth_states_expiry" ON "jira_oauth_states" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "jira_sessions_expiry" ON "jira_sessions" USING btree ("expires_at");