CREATE TABLE "round_feedback" (
	"team_id" text NOT NULL,
	"session_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"value" text NOT NULL,
	CONSTRAINT "round_feedback_team_id_session_id_participant_id_pk" PRIMARY KEY("team_id","session_id","participant_id"),
	CONSTRAINT "round_feedback_value" CHECK ("round_feedback"."value" IN ('utile','mitige','pas-utile'))
);
--> statement-breakpoint
CREATE TABLE "team_discussion_prompts" (
	"team_id" text NOT NULL,
	"position" integer NOT NULL,
	"prompt" text NOT NULL,
	CONSTRAINT "team_discussion_prompts_team_id_position_pk" PRIMARY KEY("team_id","position"),
	CONSTRAINT "team_discussion_prompts_position" CHECK ("team_discussion_prompts"."position" BETWEEN 0 AND 4),
	CONSTRAINT "team_discussion_prompts_text" CHECK (length("team_discussion_prompts"."prompt") BETWEEN 1 AND 160 AND "team_discussion_prompts"."prompt" = btrim("team_discussion_prompts"."prompt") AND "team_discussion_prompts"."prompt" !~ '[[:cntrl:]]')
);
--> statement-breakpoint
CREATE TABLE "team_meeting_settings" (
	"team_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"write_transaction" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "team_meeting_settings_team_id_pk" PRIMARY KEY("team_id"),
	CONSTRAINT "team_meeting_settings_revision" CHECK ("team_meeting_settings"."revision" >= 0)
);
--> statement-breakpoint
ALTER TABLE "round_feedback" ADD CONSTRAINT "round_feedback_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_feedback" ADD CONSTRAINT "round_feedback_team_id_session_id_standup_sessions_team_id_id_fk" FOREIGN KEY ("team_id","session_id") REFERENCES "public"."standup_sessions"("team_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "round_feedback" ADD CONSTRAINT "round_feedback_team_id_session_id_participant_id_speaking_turns_team_id_session_id_participant_id_fk" FOREIGN KEY ("team_id","session_id","participant_id") REFERENCES "public"."speaking_turns"("team_id","session_id","participant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_discussion_prompts" ADD CONSTRAINT "team_discussion_prompts_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_meeting_settings" ADD CONSTRAINT "team_meeting_settings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;