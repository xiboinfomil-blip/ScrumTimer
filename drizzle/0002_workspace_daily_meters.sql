-- Preserve every existing team ID, preference, check-in and history row.
CREATE TABLE "workspaces" (
  "id" text PRIMARY KEY NOT NULL,
  "selected_team_id" text,
  CONSTRAINT "workspaces_id" CHECK ("id" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "workspace_id" text;
--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "name" text;
--> statement-breakpoint
INSERT INTO "workspaces" ("id", "selected_team_id") SELECT "id", "id" FROM "teams";
--> statement-breakpoint
UPDATE "teams" SET "workspace_id" = "id", "name" = 'Mon équipe';
--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "workspace_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "teams" ALTER COLUMN "name" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id");
--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_selected_team_id_teams_id_fk" FOREIGN KEY ("selected_team_id") REFERENCES "teams"("id");
--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_name" CHECK (length("name") BETWEEN 1 AND 60 AND "name" = btrim("name") AND "name" !~ '[[:cntrl:]]');
--> statement-breakpoint
CREATE UNIQUE INDEX "teams_workspace_name" ON "teams" USING btree ("workspace_id", lower("name"));
--> statement-breakpoint
CREATE TABLE "team_daily_meters" (
  "team_id" text NOT NULL,
  "day" date NOT NULL,
  "meter_id" text NOT NULL,
  "title" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "team_daily_meters_team_id_day_pk" PRIMARY KEY ("team_id", "day"),
  CONSTRAINT "team_daily_meters_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE cascade,
  CONSTRAINT "team_daily_meters_team_id_meter_id_mood_meter_identifiers_team_id_id_fk" FOREIGN KEY ("team_id", "meter_id") REFERENCES "mood_meter_identifiers"("team_id", "id"),
  CONSTRAINT "team_daily_meters_identifier" CHECK (length("meter_id") BETWEEN 1 AND 200),
  CONSTRAINT "team_daily_meters_title" CHECK (length("title") BETWEEN 1 AND 200)
);