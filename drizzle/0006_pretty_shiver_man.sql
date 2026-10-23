ALTER TABLE "teams" ADD COLUMN "category" text;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "favorite" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_category" CHECK ("teams"."category" IN ('Tech','Produit','Support','Marketing'));