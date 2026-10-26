-- Góc Trọ Database V1.9 -> V1.10 auth sessions.
-- Additive migration; rehearse on a disposable copy before any target promotion.
-- Protected local targets require a separately authorized session setting:
-- SET goctro.allow_locked_db_migration = 'V1.10';
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
BEGIN
  IF current_database() IN ('Goctro_test3', 'Goctro_dev_v18')
     AND current_setting('goctro.allow_locked_db_migration', true) IS DISTINCT FROM 'V1.10' THEN
    RAISE EXCEPTION 'Refusing V1.10 migration on protected database % without exact session authorization', current_database()
      USING ERRCODE = '42501';
  END IF;
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 41
     OR to_regclass('public.accounts') IS NULL
     OR to_regclass('public.property_flexible_service_configurations') IS NULL
     OR to_regclass('public.invoice_items_invoice_parking_assignment_unique') IS NULL THEN
    RAISE EXCEPTION 'Expected Database V1.9 with 41 public tables, Flexible configuration and recurring Parking index';
  END IF;
  IF to_regclass('public.auth_sessions') IS NOT NULL THEN
    RAISE EXCEPTION 'auth_sessions already exists; refusing repeated migration';
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
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 42
     OR to_regclass('public.auth_sessions') IS NULL THEN
    RAISE EXCEPTION 'V1.10 auth session postcondition failed';
  END IF;
END $$;
COMMIT;
