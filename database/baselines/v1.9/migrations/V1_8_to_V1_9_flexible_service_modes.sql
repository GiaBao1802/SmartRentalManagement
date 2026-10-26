-- Góc Trọ Database V1.8 -> V1.9 Flexible Service configuration.
-- Additive only: preserves all V1.8 catalog, price, charge and invoice rows.
-- Protected local databases require the separately authorized session setting:
-- SET goctro.allow_locked_db_migration = 'V1.9';
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  public_table_count bigint;
  expected_scope_key boolean;
BEGIN
  IF current_database() IN ('Goctro_dev_v18', 'Goctro_test3')
     AND current_setting('goctro.allow_locked_db_migration', true) IS DISTINCT FROM 'V1.9' THEN
    RAISE EXCEPTION 'Refusing V1.9 migration on protected database % without exact session authorization', current_database()
      USING ERRCODE = '42501',
            HINT = 'A separately authorized V1.9 migration session must set goctro.allow_locked_db_migration=V1.9.';
  END IF;

  SELECT count(*) INTO public_table_count
  FROM pg_tables WHERE schemaname = 'public';
  IF public_table_count <> 40 THEN
    RAISE EXCEPTION 'Expected the V1.8 schema with 40 public tables; found %', public_table_count;
  END IF;

  IF to_regclass('public.property_flexible_service_configurations') IS NOT NULL THEN
    RAISE EXCEPTION 'V1.9 configuration table already exists; refusing duplicate/non-idempotent migration';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_pricing_items'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid, false) = 'UNIQUE (property_pricing_item_id, owner_id, property_id, kind)'
  ) INTO expected_scope_key;
  IF NOT expected_scope_key THEN
    RAISE EXCEPTION 'Expected the V1.8 Owner/Property/kind pricing item key; refusing migration on schema drift';
  END IF;
END $$;

CREATE TABLE property_flexible_service_configurations (
  property_pricing_item_id bigint PRIMARY KEY,
  owner_id bigint NOT NULL,
  property_id bigint NOT NULL,
  kind varchar(24) NOT NULL DEFAULT 'FLEXIBLE_SERVICE' CHECK (kind = 'FLEXIBLE_SERVICE'),
  service_mode varchar(16) NOT NULL CHECK (service_mode IN ('BOOKING', 'SUBSCRIPTION')),
  opens_at time NOT NULL,
  closes_at time NOT NULL,
  open_monday boolean NOT NULL DEFAULT true,
  open_tuesday boolean NOT NULL DEFAULT true,
  open_wednesday boolean NOT NULL DEFAULT true,
  open_thursday boolean NOT NULL DEFAULT true,
  open_friday boolean NOT NULL DEFAULT true,
  open_saturday boolean NOT NULL DEFAULT true,
  open_sunday boolean NOT NULL DEFAULT true,
  slot_duration_minutes integer,
  capacity_per_slot integer,
  package_duration_count integer,
  package_duration_unit varchar(8),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (property_pricing_item_id, owner_id, property_id, kind),
  FOREIGN KEY (property_pricing_item_id, owner_id, property_id, kind)
    REFERENCES property_pricing_items(property_pricing_item_id, owner_id, property_id, kind) ON DELETE RESTRICT,
  CHECK (opens_at < closes_at),
  CHECK (open_monday OR open_tuesday OR open_wednesday OR open_thursday OR open_friday OR open_saturday OR open_sunday),
  CHECK (
    (service_mode = 'BOOKING'
      AND slot_duration_minutes > 0
      AND capacity_per_slot > 0
      AND package_duration_count IS NULL
      AND package_duration_unit IS NULL
      AND slot_duration_minutes <= floor(extract(epoch FROM (closes_at - opens_at)) / 60))
    OR
    (service_mode = 'SUBSCRIPTION'
      AND slot_duration_minutes IS NULL
      AND capacity_per_slot IS NULL
      AND package_duration_count > 0
      AND package_duration_unit IN ('MONTH', 'YEAR'))
  )
);
CREATE INDEX property_flexible_service_configurations_owner_property_mode
  ON property_flexible_service_configurations(owner_id, property_id, service_mode);
COMMENT ON TABLE property_flexible_service_configurations IS
  'V1.9 current Admin configuration for Flexible Service booking slots or time-bounded subscription packages.';
COMMENT ON COLUMN property_flexible_service_configurations.opens_at IS
  'Local property opening time (Asia/Ho_Chi_Minh for current product); shared by selected weekdays.';
COMMENT ON COLUMN property_flexible_service_configurations.capacity_per_slot IS
  'Maximum concurrent attendees for one BOOKING slot; does not limit SUBSCRIPTION package attendance.';

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 41 THEN
    RAISE EXCEPTION 'V1.9 postcondition failed: expected 41 public tables';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_flexible_service_configurations'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid, false) LIKE 'FOREIGN KEY (property_pricing_item_id, owner_id, property_id, kind)%'
  ) THEN
    RAISE EXCEPTION 'V1.9 postcondition failed: scoped pricing-item foreign key missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_flexible_service_configurations'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid, false) LIKE '%service_mode%BOOKING%SUBSCRIPTION%'
  ) THEN
    RAISE EXCEPTION 'V1.9 postcondition failed: mode checks missing';
  END IF;
END $$;
COMMIT;
