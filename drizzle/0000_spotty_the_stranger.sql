-- Adopt the matching legacy tables without dropping data or rebuilding profiles.
CREATE TABLE IF NOT EXISTS "standup_rounds" (
	"space_id" text NOT NULL,
	"id" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"result" jsonb NOT NULL,
	CONSTRAINT "standup_rounds_pkey" PRIMARY KEY("space_id","id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "standup_spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"team" jsonb NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'standup_rounds_space_id_fkey'
			AND conrelid = 'public.standup_rounds'::regclass
	) THEN
		ALTER TABLE "standup_rounds" ADD CONSTRAINT "standup_rounds_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "public"."standup_spaces"("id") ON DELETE cascade ON UPDATE no action;
	END IF;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "standup_rounds_completed" ON "standup_rounds" USING btree ("completed_at");