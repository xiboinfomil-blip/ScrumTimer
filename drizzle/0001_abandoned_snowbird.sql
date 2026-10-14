CREATE TABLE "mood_meter_identifiers" (
	"team_id" text NOT NULL,
	"id" text NOT NULL,
	CONSTRAINT "mood_meter_identifiers_team_id_id_pk" PRIMARY KEY("team_id","id"),
	CONSTRAINT "mood_meter_identifiers_length" CHECK (length("mood_meter_identifiers"."id") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE TABLE "mood_meter_slides" (
	"team_id" text NOT NULL,
	"id" text NOT NULL,
	"meter_id" text NOT NULL,
	"image" text NOT NULL,
	"slide_number" integer NOT NULL,
	CONSTRAINT "mood_meter_slides_team_id_id_pk" PRIMARY KEY("team_id","id"),
	CONSTRAINT "mood_meter_slides_context" UNIQUE("team_id","meter_id","image","slide_number"),
	CONSTRAINT "mood_meter_slides_number" CHECK ("mood_meter_slides"."slide_number" BETWEEN 1 AND 10000),
	CONSTRAINT "mood_meter_slides_image" CHECK ("mood_meter_slides"."image" ~* '^/mood-meters/slides/[a-zA-Z0-9_ ./-]+[.](png|jpe?g|gif|webp|svg)$' AND "mood_meter_slides"."image" !~ '/([.]{1,2})?(/|$)')
);
--> statement-breakpoint
CREATE TABLE "mood_meters" (
	"team_id" text NOT NULL,
	"id" text NOT NULL,
	"title" text NOT NULL,
	CONSTRAINT "mood_meters_team_id_id_pk" PRIMARY KEY("team_id","id"),
	CONSTRAINT "mood_meters_title" UNIQUE("team_id","title"),
	CONSTRAINT "mood_meters_title_length" CHECK (length("mood_meters"."title") <= 200)
);
--> statement-breakpoint
CREATE TABLE "participant_check_ins" (
	"team_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"mood" integer,
	"mood_updated_at" timestamp with time zone,
	"slide_id" text,
	"identifier_id" text,
	CONSTRAINT "participant_check_ins_team_id_participant_id_pk" PRIMARY KEY("team_id","participant_id"),
	CONSTRAINT "participant_check_ins_mood" CHECK ("participant_check_ins"."mood" BETWEEN 1 AND 4),
	CONSTRAINT "participant_check_ins_identifier" CHECK ("participant_check_ins"."identifier_id" IS NULL OR "participant_check_ins"."slide_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "participants" (
	"team_id" text NOT NULL,
	"id" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "participants_team_id_id_pk" PRIMARY KEY("team_id","id"),
	CONSTRAINT "participants_id" CHECK (length("participants"."id") BETWEEN 1 AND 100 AND "participants"."id" !~ '[[:cntrl:]]'),
	CONSTRAINT "participants_name" CHECK (length("participants"."name") BETWEEN 1 AND 60 AND "participants"."name" = btrim("participants"."name") AND "participants"."name" !~ '[[:cntrl:]]')
);
--> statement-breakpoint
CREATE TABLE "speaking_turns" (
	"team_id" text NOT NULL,
	"session_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"position" integer NOT NULL,
	"name_snapshot" text NOT NULL,
	"mood" integer,
	"speaking_seconds" double precision NOT NULL,
	"budget_seconds" double precision NOT NULL,
	"time_up" boolean NOT NULL,
	"score" integer,
	"meter_id" text,
	CONSTRAINT "speaking_turns_team_id_session_id_participant_id_pk" PRIMARY KEY("team_id","session_id","participant_id"),
	CONSTRAINT "speaking_turns_position" UNIQUE("team_id","session_id","position"),
	CONSTRAINT "speaking_turns_position_bounds" CHECK ("speaking_turns"."position" BETWEEN 0 AND 99),
	CONSTRAINT "speaking_turns_name" CHECK (length("speaking_turns"."name_snapshot") BETWEEN 1 AND 60 AND "speaking_turns"."name_snapshot" = btrim("speaking_turns"."name_snapshot") AND "speaking_turns"."name_snapshot" !~ '[[:cntrl:]]'),
	CONSTRAINT "speaking_turns_mood" CHECK ("speaking_turns"."mood" BETWEEN 1 AND 4),
	CONSTRAINT "speaking_turns_times" CHECK ("speaking_turns"."speaking_seconds" BETWEEN 0 AND 86400 AND "speaking_turns"."budget_seconds" BETWEEN 0 AND 86400),
	CONSTRAINT "speaking_turns_score" CHECK ("speaking_turns"."score" BETWEEN 0 AND 1000)
);
--> statement-breakpoint
CREATE TABLE "standup_sessions" (
	"team_id" text NOT NULL,
	"id" text NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	"write_transaction" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "standup_sessions_team_id_id_pk" PRIMARY KEY("team_id","id"),
	CONSTRAINT "standup_sessions_id" CHECK ("standup_sessions"."id" ~ '^[a-zA-Z0-9_-]{1,100}$')
);
--> statement-breakpoint
CREATE TABLE "team_members" (
	"team_id" text NOT NULL,
	"participant_id" text NOT NULL,
	"position" integer NOT NULL,
	"present" boolean NOT NULL,
	CONSTRAINT "team_members_team_id_participant_id_pk" PRIMARY KEY("team_id","participant_id"),
	CONSTRAINT "team_members_position" UNIQUE("team_id","position"),
	CONSTRAINT "team_members_position_bounds" CHECK ("team_members"."position" BETWEEN 0 AND 99)
);
--> statement-breakpoint
CREATE TABLE "team_used_mood_meters" (
	"team_id" text NOT NULL,
	"identifier_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "team_used_mood_meters_team_id_identifier_id_pk" PRIMARY KEY("team_id","identifier_id"),
	CONSTRAINT "team_used_mood_meters_position" UNIQUE("team_id","position"),
	CONSTRAINT "team_used_mood_meters_bounds" CHECK ("team_used_mood_meters"."position" BETWEEN 0 AND 1999)
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"write_transaction" bigint DEFAULT 0 NOT NULL,
	"duration" integer NOT NULL,
	"warning" integer NOT NULL,
	"sound" boolean NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teams_id" CHECK ("teams"."id" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "teams_revision" CHECK ("teams"."revision" >= 1),
	CONSTRAINT "teams_duration" CHECK ("teams"."duration" BETWEEN 1 AND 3659),
	CONSTRAINT "teams_warning" CHECK ("teams"."warning" IN (0,10,15,30,60))
);
--> statement-breakpoint
ALTER TABLE "mood_meter_identifiers" ADD CONSTRAINT "mood_meter_identifiers_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mood_meter_slides" ADD CONSTRAINT "mood_meter_slides_team_id_meter_id_mood_meters_team_id_id_fk" FOREIGN KEY ("team_id","meter_id") REFERENCES "public"."mood_meters"("team_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mood_meters" ADD CONSTRAINT "mood_meters_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_check_ins" ADD CONSTRAINT "participant_check_ins_team_id_participant_id_team_members_team_id_participant_id_fk" FOREIGN KEY ("team_id","participant_id") REFERENCES "public"."team_members"("team_id","participant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_check_ins" ADD CONSTRAINT "participant_check_ins_team_id_slide_id_mood_meter_slides_team_id_id_fk" FOREIGN KEY ("team_id","slide_id") REFERENCES "public"."mood_meter_slides"("team_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participant_check_ins" ADD CONSTRAINT "participant_check_ins_team_id_identifier_id_mood_meter_identifiers_team_id_id_fk" FOREIGN KEY ("team_id","identifier_id") REFERENCES "public"."mood_meter_identifiers"("team_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participants" ADD CONSTRAINT "participants_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_turns" ADD CONSTRAINT "speaking_turns_team_id_session_id_standup_sessions_team_id_id_fk" FOREIGN KEY ("team_id","session_id") REFERENCES "public"."standup_sessions"("team_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_turns" ADD CONSTRAINT "speaking_turns_team_id_participant_id_participants_team_id_id_fk" FOREIGN KEY ("team_id","participant_id") REFERENCES "public"."participants"("team_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "speaking_turns" ADD CONSTRAINT "speaking_turns_team_id_meter_id_mood_meters_team_id_id_fk" FOREIGN KEY ("team_id","meter_id") REFERENCES "public"."mood_meters"("team_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standup_sessions" ADD CONSTRAINT "standup_sessions_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_participant_id_participants_team_id_id_fk" FOREIGN KEY ("team_id","participant_id") REFERENCES "public"."participants"("team_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_used_mood_meters" ADD CONSTRAINT "team_used_mood_meters_team_id_identifier_id_mood_meter_identifiers_team_id_id_fk" FOREIGN KEY ("team_id","identifier_id") REFERENCES "public"."mood_meter_identifiers"("team_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "standup_sessions_completed" ON "standup_sessions" USING btree ("team_id","completed_at");
--> statement-breakpoint
-- The HTTP Drizzle migrator runs the entire migration and journal insert in one
-- Neon transaction. Lock legacy writers until conversion, verification and drop.
LOCK TABLE standup_spaces, standup_rounds IN ACCESS EXCLUSIVE MODE;
--> statement-breakpoint
DO $backfill$
DECLARE space record; old_round record; person jsonb; context jsonb; item jsonb;
	position integer; slide_key text; identifier text; actual jsonb; expected jsonb;
BEGIN
	FOR space IN SELECT * FROM standup_spaces LOOP
		IF jsonb_typeof(space.team) <> 'object' OR NOT (space.team ?& ARRAY['roster','duration','warning','sound']) OR jsonb_typeof(space.team->'roster') <> 'array'
			OR jsonb_array_length(space.team->'roster') > 100
			OR jsonb_typeof(space.team->'duration') <> 'number'
			OR jsonb_typeof(space.team->'warning') <> 'number'
			OR jsonb_typeof(space.team->'sound') <> 'boolean'
			OR (space.team ? 'session' AND (jsonb_typeof(space.team->'session') <> 'array' OR space.team->'session' <> '[]'::jsonb))
			OR EXISTS(SELECT 1 FROM jsonb_object_keys(space.team) k WHERE k NOT IN ('roster','session','duration','warning','sound','usedMoodMeters','currentMoodSlide'))
			THEN RAISE EXCEPTION 'Unsupported legacy team; conversion aborted'; END IF;
		INSERT INTO teams(id,revision,duration,warning,sound,updated_at)
			VALUES(space.id,space.revision,(space.team->>'duration')::integer,(space.team->>'warning')::integer,(space.team->>'sound')::boolean,space.updated_at);
		position := 0;
		FOR person IN SELECT value FROM jsonb_array_elements(space.team->'roster') LOOP
			IF jsonb_typeof(person) <> 'object' OR jsonb_typeof(person->'id') <> 'string'
				OR jsonb_typeof(person->'name') <> 'string' OR jsonb_typeof(person->'present') <> 'boolean'
				OR person->>'id' <> btrim(person->>'id')
				OR NOT (person ? 'mood') OR NOT (person ? 'moodUpdatedAt')
				OR jsonb_typeof(person->'mood') NOT IN ('null','number')
				OR jsonb_typeof(person->'moodUpdatedAt') NOT IN ('null','string')
				OR EXISTS(SELECT 1 FROM jsonb_object_keys(person) k WHERE k NOT IN ('id','name','present','mood','moodUpdatedAt','moodSlide'))
				THEN RAISE EXCEPTION 'Unsupported legacy participant; conversion aborted'; END IF;
			IF person->>'moodUpdatedAt' IS NOT NULL THEN PERFORM (person->>'moodUpdatedAt')::timestamptz; END IF;
			INSERT INTO participants VALUES(space.id,person->>'id',person->>'name');
			INSERT INTO team_members VALUES(space.id,person->>'id',position,(person->>'present')::boolean);
			INSERT INTO participant_check_ins(team_id,participant_id,mood,mood_updated_at)
				VALUES(space.id,person->>'id',(person->>'mood')::integer,(person->>'moodUpdatedAt')::timestamptz);
			position := position+1;
		END LOOP;
		-- Catalog both check-in contexts and any legacy transient current slide.
		FOR item IN SELECT value FROM jsonb_array_elements(space.team->'roster')
			UNION ALL SELECT jsonb_build_object('moodSlide',space.team->'currentMoodSlide') LOOP
			context := item->'moodSlide';
			IF context IS NOT NULL AND context <> 'null'::jsonb THEN
				IF jsonb_typeof(context) <> 'object' OR jsonb_typeof(context->'title') <> 'string'
					OR jsonb_typeof(context->'image') <> 'string' OR jsonb_typeof(context->'slideNumber') <> 'number'
					OR (context ? 'meterId' AND jsonb_typeof(context->'meterId') <> 'string')
					OR EXISTS(SELECT 1 FROM jsonb_object_keys(context) k WHERE k NOT IN ('title','image','slideNumber','meterId'))
					THEN RAISE EXCEPTION 'Unsupported legacy slide; conversion aborted'; END IF;
				INSERT INTO mood_meters VALUES(space.id,context->>'title',context->>'title') ON CONFLICT DO NOTHING;
				identifier := context->>'meterId';
				IF identifier IS NOT NULL AND (identifier <> btrim(identifier) OR identifier ~ '[[:cntrl:]]') THEN RAISE EXCEPTION 'Unsupported legacy meter identifier'; END IF;
				IF identifier IS NOT NULL THEN INSERT INTO mood_meter_identifiers VALUES(space.id,identifier) ON CONFLICT DO NOTHING; END IF;
				slide_key := md5(jsonb_build_array(context->>'title',context->>'image',(context->>'slideNumber')::integer)::text);
				INSERT INTO mood_meter_slides VALUES(space.id,slide_key,context->>'title',context->>'image',(context->>'slideNumber')::integer) ON CONFLICT DO NOTHING;
				IF item ? 'id' THEN
					UPDATE participant_check_ins SET slide_id=slide_key,identifier_id=identifier WHERE team_id=space.id AND participant_id=item->>'id';
				END IF;
				SELECT jsonb_build_object('title',m.title,'image',s.image,'slideNumber',s.slide_number) || CASE WHEN identifier IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('meterId',identifier) END INTO actual
					FROM mood_meter_slides s JOIN mood_meters m ON m.team_id=s.team_id AND m.id=s.meter_id WHERE s.team_id=space.id AND s.id=slide_key;
				IF actual IS DISTINCT FROM context THEN RAISE EXCEPTION 'Legacy slide verification failed'; END IF;
			END IF;
		END LOOP;
		position := 0;
		FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(space.team->'usedMoodMeters','[]'::jsonb)) LOOP
			IF jsonb_typeof(item) <> 'string' THEN RAISE EXCEPTION 'Unsupported legacy meter identifier'; END IF;
			identifier := item #>> '{}';
			IF identifier <> btrim(identifier) OR identifier ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Unsupported legacy used meter identifier'; END IF;
			INSERT INTO mood_meter_identifiers VALUES(space.id,identifier) ON CONFLICT DO NOTHING;
			INSERT INTO team_used_mood_meters VALUES(space.id,identifier,position);
			position := position+1;
		END LOOP;
		SELECT jsonb_build_object('duration',t.duration,'warning',t.warning,'sound',t.sound,
			'roster',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'present',r.present,'mood',c.mood,'moodUpdatedAt',c.mood_updated_at,'moodSlide',CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object('title',m.title,'image',s.image,'slideNumber',s.slide_number) || CASE WHEN c.identifier_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('meterId',c.identifier_id) END END) ORDER BY r.position)
				FROM team_members r JOIN participants p ON p.team_id=r.team_id AND p.id=r.participant_id JOIN participant_check_ins c ON c.team_id=r.team_id AND c.participant_id=r.participant_id LEFT JOIN mood_meter_slides s ON s.team_id=c.team_id AND s.id=c.slide_id LEFT JOIN mood_meters m ON m.team_id=s.team_id AND m.id=s.meter_id WHERE r.team_id=t.id),'[]'::jsonb),
			'usedMoodMeters',COALESCE((SELECT jsonb_agg(u.identifier_id ORDER BY u.position) FROM team_used_mood_meters u WHERE u.team_id=t.id),'[]'::jsonb)) INTO actual FROM teams t WHERE t.id=space.id;
		expected := (space.team-'session'-'currentMoodSlide') || jsonb_build_object('usedMoodMeters',COALESCE(space.team->'usedMoodMeters','[]'::jsonb),'roster',COALESCE((SELECT jsonb_agg(value || jsonb_build_object('moodUpdatedAt',(value->>'moodUpdatedAt')::timestamptz,'moodSlide',COALESCE(value->'moodSlide','null'::jsonb))) FROM jsonb_array_elements(space.team->'roster')),'[]'::jsonb));
		IF actual IS DISTINCT FROM expected OR NOT EXISTS(SELECT 1 FROM teams WHERE id=space.id AND revision=space.revision AND updated_at=space.updated_at) THEN RAISE EXCEPTION 'Legacy team verification failed'; END IF;
	END LOOP;
	-- Do NOT apply ten-day retention here: convert and verify every archived round.
	FOR old_round IN SELECT * FROM standup_rounds ORDER BY completed_at DESC LOOP
		IF jsonb_typeof(old_round.result) <> 'object' OR NOT (old_round.result ?& ARRAY['id','completedAt','people']) OR jsonb_typeof(old_round.result->'people') <> 'array'
			OR jsonb_array_length(old_round.result->'people') NOT BETWEEN 1 AND 100
			OR old_round.result->>'id' IS DISTINCT FROM old_round.id
			OR (old_round.result->>'completedAt')::timestamptz IS DISTINCT FROM old_round.completed_at
			OR EXISTS(SELECT 1 FROM jsonb_object_keys(old_round.result) k WHERE k NOT IN ('id','completedAt','people'))
			THEN RAISE EXCEPTION 'Unsupported legacy history; conversion aborted'; END IF;
		INSERT INTO standup_sessions(team_id,id,completed_at) VALUES(old_round.space_id,old_round.id,old_round.completed_at);
		position := 0;
		FOR person IN SELECT value FROM jsonb_array_elements(old_round.result->'people') LOOP
			IF jsonb_typeof(person) <> 'object' OR jsonb_typeof(person->'id') <> 'string' OR jsonb_typeof(person->'name') <> 'string'
				OR person->>'id' <> btrim(person->>'id')
				OR jsonb_typeof(person->'speakingSeconds') <> 'number' OR jsonb_typeof(person->'budgetSeconds') <> 'number' OR jsonb_typeof(person->'timeUp') <> 'boolean'
				OR NOT (person ?& ARRAY['mood','score','meterTitle']) OR jsonb_typeof(person->'mood') NOT IN ('null','number') OR jsonb_typeof(person->'score') NOT IN ('null','number') OR jsonb_typeof(person->'meterTitle') NOT IN ('null','string')
				OR EXISTS(SELECT 1 FROM jsonb_object_keys(person) k WHERE k NOT IN ('id','name','mood','speakingSeconds','budgetSeconds','timeUp','score','meterTitle'))
				THEN RAISE EXCEPTION 'Unsupported legacy speaking turn'; END IF;
			INSERT INTO participants VALUES(old_round.space_id,person->>'id',person->>'name') ON CONFLICT DO NOTHING;
			IF person->>'meterTitle' IS NOT NULL THEN INSERT INTO mood_meters VALUES(old_round.space_id,person->>'meterTitle',person->>'meterTitle') ON CONFLICT DO NOTHING; END IF;
			INSERT INTO speaking_turns VALUES(old_round.space_id,old_round.id,person->>'id',position,person->>'name',(person->>'mood')::integer,(person->>'speakingSeconds')::double precision,(person->>'budgetSeconds')::double precision,(person->>'timeUp')::boolean,(person->>'score')::integer,person->>'meterTitle');
			position := position+1;
		END LOOP;
		SELECT jsonb_agg(jsonb_build_object('id',p.participant_id,'name',p.name_snapshot,'mood',p.mood,'speakingSeconds',p.speaking_seconds,'budgetSeconds',p.budget_seconds,'timeUp',p.time_up,'score',p.score,'meterTitle',m.title) ORDER BY p.position) INTO actual
			FROM speaking_turns p LEFT JOIN mood_meters m ON m.team_id=p.team_id AND m.id=p.meter_id WHERE p.team_id=old_round.space_id AND p.session_id=old_round.id;
		IF actual IS DISTINCT FROM old_round.result->'people' THEN RAISE EXCEPTION 'Legacy history verification failed'; END IF;
	END LOOP;
	IF (SELECT count(*) FROM teams) <> (SELECT count(*) FROM standup_spaces)
		OR (SELECT count(*) FROM standup_sessions) <> (SELECT count(*) FROM standup_rounds)
		OR (SELECT count(*) FROM team_members) <> (SELECT COALESCE(sum(jsonb_array_length(team->'roster')),0) FROM standup_spaces)
		OR (SELECT count(*) FROM speaking_turns) <> (SELECT COALESCE(sum(jsonb_array_length(result->'people')),0) FROM standup_rounds)
		THEN RAISE EXCEPTION 'Legacy row count verification failed'; END IF;
END $backfill$;
--> statement-breakpoint
-- Destructive steps only follow complete field and row-count verification.
DROP TABLE standup_rounds;
--> statement-breakpoint
DROP TABLE standup_spaces;