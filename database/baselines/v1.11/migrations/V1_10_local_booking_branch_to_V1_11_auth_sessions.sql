-- Local recovery only: the unpushed Resident-booking branch had applied the
-- booking table before upstream V1.10 added auth_sessions. This adds only the
-- missing upstream auth_sessions table and converges that exact branch to V1.11.
-- General V1.10 installs must use V1_10_to_V1_11_resident_service_bookings.sql.
-- This migration is restricted to Goctro_dev_v18 and requires exact catalog
-- verification by scripts/database-v111.mjs before it is executed.
-- SET goctro.allow_locked_db_migration = 'V1.11';
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF current_database() <> 'Goctro_dev_v18' THEN
    RAISE EXCEPTION 'Local booking-branch recovery is restricted to Goctro_dev_v18';
  END IF;
  IF current_setting('goctro.allow_locked_db_migration', true) IS DISTINCT FROM 'V1.11' THEN
    RAISE EXCEPTION 'Refusing local V1.11 recovery without exact session authorization'
      USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 42
     OR to_regclass('public.resident_service_bookings') IS NULL
     OR to_regclass('public.property_flexible_service_configurations') IS NULL
     OR to_regclass('public.auth_sessions') IS NOT NULL THEN
    RAISE EXCEPTION 'Expected exact local booking-first V1.10 branch with 42 tables and no auth_sessions';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public'
      AND indexname='resident_service_bookings_resident_active_slot_key'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgrelid='public.resident_service_bookings'::regclass
      AND tgname='resident_service_bookings_booking_mode_guard' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'Expected the reviewed Resident booking table guards; refusing local recovery';
  END IF;
END $$;

CREATE TABLE auth_sessions (
  token_hash          char(64) PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  account_id          bigint NOT NULL REFERENCES accounts(account_id) ON DELETE RESTRICT,
  created_at          timestamptz NOT NULL,
  last_seen_at        timestamptz NOT NULL,
  expires_at          timestamptz NOT NULL,
  absolute_expires_at timestamptz NOT NULL,
  CONSTRAINT auth_sessions_time_order CHECK (
    created_at <= last_seen_at AND last_seen_at <= expires_at
    AND expires_at <= absolute_expires_at
  )
);
CREATE INDEX auth_sessions_by_account ON auth_sessions(account_id);
CREATE INDEX auth_sessions_by_expiry ON auth_sessions(expires_at);

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public') <> 43
     OR to_regclass('public.auth_sessions') IS NULL
     OR to_regclass('public.resident_service_bookings') IS NULL THEN
    RAISE EXCEPTION 'V1.11 local booking-branch recovery postcondition failed';
  END IF;
END $$;
COMMIT;
