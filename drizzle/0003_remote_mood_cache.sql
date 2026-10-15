CREATE TABLE "remote_mood_cache_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"generation" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "remote_mood_cache_singleton" CHECK ("remote_mood_cache_state"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "remote_mood_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"google_id" text NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"loaded_at" timestamp with time zone,
	CONSTRAINT "remote_mood_catalog_id" CHECK ("remote_mood_catalog"."id" ~ '^deck-[a-f0-9]{20}$'),
	CONSTRAINT "remote_mood_catalog_google_id" CHECK ("remote_mood_catalog"."google_id" ~ '^[a-zA-Z0-9_-]+$')
);
--> statement-breakpoint
CREATE TABLE "remote_mood_pages" (
	"deck_id" text NOT NULL,
	"position" integer NOT NULL,
	"page_id" text NOT NULL,
	CONSTRAINT "remote_mood_pages_deck_id_position_pk" PRIMARY KEY("deck_id","position"),
	CONSTRAINT "remote_mood_pages_identity" UNIQUE("deck_id","page_id"),
	CONSTRAINT "remote_mood_pages_position" CHECK ("remote_mood_pages"."position" BETWEEN 0 AND 499),
	CONSTRAINT "remote_mood_pages_id" CHECK ("remote_mood_pages"."page_id" ~ '^[a-zA-Z0-9_.-]+$' AND "remote_mood_pages"."page_id" !~ '[.][.]')
);
--> statement-breakpoint
ALTER TABLE "remote_mood_pages" ADD CONSTRAINT "remote_mood_pages_deck_id_remote_mood_catalog_id_fk" FOREIGN KEY ("deck_id") REFERENCES "public"."remote_mood_catalog"("id") ON DELETE cascade ON UPDATE no action;