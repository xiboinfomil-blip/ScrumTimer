CREATE FUNCTION public.enforce_storage_budget() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
	PERFORM pg_advisory_xact_lock(20501029);
	IF pg_database_size(current_database()) >= LEAST(
		750000000::bigint,
		COALESCE(NULLIF(current_setting('app.storage_budget_bytes', true), '')::bigint, 750000000::bigint)
	) THEN
		RAISE EXCEPTION USING ERRCODE = 'P0S01', MESSAGE = 'Application storage budget reached';
	END IF;
	RETURN NULL;
END;
$$;
--> statement-breakpoint
DO $$
DECLARE relation record;
BEGIN
	FOR relation IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename LOOP
		EXECUTE format(
			'CREATE TRIGGER app_storage_budget BEFORE INSERT OR UPDATE ON %I.%I FOR EACH STATEMENT EXECUTE FUNCTION public.enforce_storage_budget()',
			'public', relation.tablename
		);
	END LOOP;
END;
$$;