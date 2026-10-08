-- =====================================================
-- SINAV Bootstrap: service role + database
-- =====================================================
-- Run ONCE, by hand, as SUPERUSER, connected to the `postgres` database.
--   1) Edit the password literal below (CHANGE_ME) or run ALTER ROLE afterwards.
--   2) Execute this file (CREATE DATABASE must run outside a transaction block).
--   3) Connect to the new `sinav` database and run 00..10, then A99-grants.sql.
-- =====================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sinav_svc') THEN
        CREATE ROLE sinav_svc
            WITH LOGIN
                 PASSWORD 'CHANGE_ME'
                 NOSUPERUSER
                 NOCREATEDB
                 NOCREATEROLE
                 NOREPLICATION
                 INHERIT
                 CONNECTION LIMIT -1;
    END IF;
END $$;

-- ALTER ROLE sinav_svc PASSWORD 'X';

CREATE DATABASE sinav
    WITH OWNER = postgres
         ENCODING = 'UTF8'
         LOCALE_PROVIDER = 'icu'
         ICU_LOCALE = 'tr-TR'
         LC_COLLATE = 'C.UTF-8'
         LC_CTYPE   = 'C.UTF-8'
         TEMPLATE   = template0
         CONNECTION LIMIT = -1;

GRANT CONNECT ON DATABASE sinav TO sinav_svc;

-- Next (connected to `sinav` as superuser): 00-enums .. 10-seed-data, then A99-grants.sql
