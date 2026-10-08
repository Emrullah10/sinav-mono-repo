-- =====================================================
-- SINAV Service-Role Grants (idempotent; run as SUPERUSER on the `sinav` database)
-- =====================================================
-- Run AFTER every CREATE TABLE / SEQUENCE in 00..10 has succeeded.
-- Schemas: public enums identity notify audit storage content learning billing tutor. Role: sinav_svc.
-- After each later table migration write a separate `...-grant-<table>.sql` (template 4.5).
-- =====================================================

GRANT USAGE ON SCHEMA public   TO sinav_svc;
GRANT USAGE ON SCHEMA enums    TO sinav_svc;
GRANT USAGE ON SCHEMA identity TO sinav_svc;
GRANT USAGE ON SCHEMA notify   TO sinav_svc;
GRANT USAGE ON SCHEMA audit    TO sinav_svc;
GRANT USAGE ON SCHEMA storage  TO sinav_svc;
GRANT USAGE ON SCHEMA content  TO sinav_svc;
GRANT USAGE ON SCHEMA learning TO sinav_svc;
GRANT USAGE ON SCHEMA billing  TO sinav_svc;
GRANT USAGE ON SCHEMA tutor    TO sinav_svc;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public    TO sinav_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA enums     TO sinav_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA identity  TO sinav_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA notify    TO sinav_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA audit     TO sinav_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA storage   TO sinav_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA content   TO sinav_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA learning  TO sinav_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA billing   TO sinav_svc;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA tutor     TO sinav_svc;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public    TO sinav_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA enums     TO sinav_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA identity  TO sinav_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA notify    TO sinav_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit     TO sinav_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA storage   TO sinav_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA content   TO sinav_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA learning  TO sinav_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA billing   TO sinav_svc;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA tutor     TO sinav_svc;

-- Function execution (fn_set_updated_at in public)
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO sinav_svc;

-- Default privileges for FUTURE objects, for every role that may create them
-- (postgres, the role running this file, and the migration role).
DO $$
DECLARE
  target_schema TEXT;
  target_role   TEXT;
  roles         TEXT[] := ARRAY['postgres', current_user, 'sinav_dev'];
  seen          TEXT[] := ARRAY[]::TEXT[];
BEGIN
  FOREACH target_role IN ARRAY roles LOOP
    CONTINUE WHEN target_role = ANY(seen);
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = target_role);
    seen := seen || target_role;

    FOREACH target_schema IN ARRAY ARRAY[
      'public','enums','identity','notify','audit','storage','content','learning','billing','tutor'
    ] LOOP
      CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = target_schema);
      BEGIN
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO sinav_svc', target_role, target_schema);
        EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE, SELECT ON SEQUENCES TO sinav_svc', target_role, target_schema);
      EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'default privileges skipped: role=% schema=%', target_role, target_schema;
      END;
    END LOOP;

    BEGIN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO sinav_svc', target_role);
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
  END LOOP;
END $$;

-- VERIFY:
--   SELECT has_schema_privilege('sinav_svc', 'identity', 'USAGE');
--   SELECT has_table_privilege('sinav_svc', 'identity.organization', 'INSERT');
--   SELECT has_sequence_privilege('sinav_svc', 'global_code_seq', 'USAGE');
