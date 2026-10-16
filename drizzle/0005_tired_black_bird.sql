CREATE TABLE "participant_daily_hints" (
	"team_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"day" date NOT NULL,
	"hint" text NOT NULL,
	"revision" integer NOT NULL,
	CONSTRAINT "participant_daily_hints_team_id_participant_id_pk" PRIMARY KEY("team_id","participant_id"),
	CONSTRAINT "participant_daily_hints_revision" CHECK ("participant_daily_hints"."revision" >= 1),
	CONSTRAINT "participant_daily_hints_text" CHECK (length("participant_daily_hints"."hint") BETWEEN 1 AND 600 AND "participant_daily_hints"."hint" = btrim("participant_daily_hints"."hint", E' \n\r\t\013\014') AND "participant_daily_hints"."hint" !~ '[\x01-\x09\x0B-\x1F\x7F-\x9F]')
);
--> statement-breakpoint
ALTER TABLE "participant_daily_hints" ADD CONSTRAINT "participant_daily_hints_team_id_participant_id_participants_team_id_id_fk" FOREIGN KEY ("team_id","participant_id") REFERENCES "public"."participants"("team_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "participant_daily_hints_day" ON "participant_daily_hints" USING btree ("day");