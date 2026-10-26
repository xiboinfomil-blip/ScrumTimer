ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_selected_team_id_teams_id_fk";
--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "selected_team_id";