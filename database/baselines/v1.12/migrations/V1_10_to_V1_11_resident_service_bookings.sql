-- Góc Trọ Database V1.10 -> V1.11 — authenticated Resident Flexible Service bookings.
-- V1.10 remains the immutable auth-session baseline; this migration only adds booking requests.
-- Protected local databases require the separately authorized session setting:
-- SET goctro.allow_locked_db_migration = 'V1.11';
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  public_table_count bigint;
  expected_scope_key boolean;
BEGIN
  IF current_database() IN ('Goctro_dev_v18', 'Goctro_test3')
     AND current_setting('goctro.allow_locked_db_migration', true) IS DISTINCT FROM 'V1.11' THEN
    RAISE EXCEPTION 'Refusing V1.11 migration on protected database % without exact session authorization', current_database()
      USING ERRCODE = '42501',
            HINT = 'A separately authorized V1.11 migration session must set goctro.allow_locked_db_migration=V1.11.';
  END IF;

  SELECT count(*) INTO public_table_count
  FROM pg_tables WHERE schemaname = 'public';
  IF public_table_count <> 42 THEN
    RAISE EXCEPTION 'Expected the V1.10 schema with 42 public tables; found %', public_table_count;
  END IF;

  IF to_regclass('public.auth_sessions') IS NULL THEN
    RAISE EXCEPTION 'Expected V1.10 auth_sessions table; refusing booking migration on a noncanonical baseline';
  END IF;

  IF to_regclass('public.resident_service_bookings') IS NOT NULL THEN
    RAISE EXCEPTION 'V1.11 booking table already exists; refusing duplicate/non-idempotent migration';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_flexible_service_configurations'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid, false) = 'UNIQUE (property_pricing_item_id, owner_id, property_id, kind)'
  ) INTO expected_scope_key;
  IF NOT expected_scope_key THEN
    RAISE EXCEPTION 'Expected the V1.10 Flexible configuration scope key; refusing migration on schema drift';
  END IF;
END $$;

CREATE TABLE resident_service_bookings (
  booking_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  owner_id bigint NOT NULL,
  resident_id bigint NOT NULL,
  property_id bigint NOT NULL,
  room_id bigint NOT NULL,
  contract_id bigint NOT NULL,
  property_pricing_item_id bigint NOT NULL,
  kind varchar(24) NOT NULL DEFAULT 'FLEXIBLE_SERVICE' CHECK (kind = 'FLEXIBLE_SERVICE'),
  service_name_snapshot varchar(150) NOT NULL,
  quoted_price_version_id bigint NOT NULL,
  quoted_unit_price bigint NOT NULL CHECK (quoted_unit_price >= 0),
  unit_snapshot varchar(30) NOT NULL,
  service_date date NOT NULL,
  slot_start time NOT NULL,
  slot_end time NOT NULL,
  slot_duration_minutes integer NOT NULL CHECK (slot_duration_minutes > 0),
  status varchar(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
  decision_by_account_id bigint,
  decision_at timestamptz,
  decision_note varchar(1000),
  cancelled_at timestamptz,
  flexible_service_charge_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT resident_service_bookings_charge_scope_key UNIQUE (flexible_service_charge_id, owner_id, property_id),
  CONSTRAINT resident_service_bookings_slot_window_check CHECK (slot_start < slot_end),
  CONSTRAINT resident_service_bookings_decision_state_check CHECK (
    (status = 'PENDING' AND decision_by_account_id IS NULL AND decision_at IS NULL AND cancelled_at IS NULL AND flexible_service_charge_id IS NULL)
    OR (status = 'APPROVED' AND decision_by_account_id IS NOT NULL AND decision_at IS NOT NULL AND cancelled_at IS NULL AND flexible_service_charge_id IS NOT NULL)
    OR (status = 'REJECTED' AND decision_by_account_id IS NOT NULL AND decision_at IS NOT NULL AND cancelled_at IS NULL AND flexible_service_charge_id IS NULL)
    OR (status = 'CANCELLED' AND decision_by_account_id IS NULL AND decision_at IS NULL AND cancelled_at IS NOT NULL AND flexible_service_charge_id IS NULL)
  ),
  CONSTRAINT resident_service_bookings_resident_owner_fkey
    FOREIGN KEY (resident_id, owner_id)
    REFERENCES residents(resident_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_property_scope_fkey
    FOREIGN KEY (property_id, owner_id)
    REFERENCES properties(property_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_room_scope_fkey
    FOREIGN KEY (room_id, property_id, owner_id)
    REFERENCES rooms(room_id, property_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_contract_scope_fkey
    FOREIGN KEY (contract_id, room_id, property_id, owner_id)
    REFERENCES contracts(contract_id, room_id, property_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_service_scope_fkey
    FOREIGN KEY (property_pricing_item_id, owner_id, property_id, kind)
    REFERENCES property_pricing_items(property_pricing_item_id, owner_id, property_id, kind) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_booking_config_fkey
    FOREIGN KEY (property_pricing_item_id, owner_id, property_id, kind)
    REFERENCES property_flexible_service_configurations(property_pricing_item_id, owner_id, property_id, kind) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_quoted_price_version_fkey
    FOREIGN KEY (quoted_price_version_id, owner_id, property_id, kind)
    REFERENCES property_price_versions(property_price_version_id, owner_id, property_id, kind) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_decision_actor_fkey
    FOREIGN KEY (decision_by_account_id, owner_id)
    REFERENCES accounts(account_id, owner_id) ON DELETE RESTRICT,
  CONSTRAINT resident_service_bookings_charge_fkey
    FOREIGN KEY (flexible_service_charge_id, owner_id, property_id)
    REFERENCES flexible_service_charges(flexible_service_charge_id, owner_id, property_id) ON DELETE RESTRICT
);

CREATE INDEX resident_service_bookings_by_resident_date
  ON resident_service_bookings(owner_id, resident_id, service_date, slot_start);
CREATE INDEX resident_service_bookings_by_property_status
  ON resident_service_bookings(owner_id, property_id, status, service_date, slot_start);
CREATE INDEX resident_service_bookings_by_service_slot
  ON resident_service_bookings(owner_id, property_pricing_item_id, service_date, slot_start, slot_end)
  WHERE status IN ('PENDING', 'APPROVED');
CREATE UNIQUE INDEX resident_service_bookings_resident_active_slot_key
  ON resident_service_bookings(property_pricing_item_id, resident_id, service_date, slot_start)
  WHERE status IN ('PENDING', 'APPROVED');

CREATE FUNCTION enforce_resident_service_booking_mode() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE configured_mode varchar(16);
BEGIN
  SELECT service_mode INTO configured_mode
  FROM property_flexible_service_configurations
  WHERE property_pricing_item_id = NEW.property_pricing_item_id
    AND owner_id = NEW.owner_id
    AND property_id = NEW.property_id
    AND kind = NEW.kind
  FOR KEY SHARE;
  IF configured_mode IS DISTINCT FROM 'BOOKING' THEN
    RAISE EXCEPTION 'Resident service bookings require a configured BOOKING service'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER resident_service_bookings_booking_mode_guard
  BEFORE INSERT OR UPDATE ON resident_service_bookings
  FOR EACH ROW EXECUTE FUNCTION enforce_resident_service_booking_mode();

COMMENT ON TABLE resident_service_bookings IS
  'V1.11 Resident requests for Admin-configured BOOKING Flexible Services; Admin approval creates a READY charge for the normal Contract invoice, not a payment.';
COMMENT ON COLUMN resident_service_bookings.service_date IS
  'Service calendar date in Asia/Ho_Chi_Minh; slot_start and slot_end are local wall-clock times.';
COMMENT ON COLUMN resident_service_bookings.slot_duration_minutes IS
  'Duration snapshot when the Resident submits the request; later schedule changes do not rewrite it.';
COMMENT ON COLUMN resident_service_bookings.quoted_price_version_id IS
  'Published Flexible Service price effective on the requested service date, captured when the Resident submits the request.';
COMMENT ON COLUMN resident_service_bookings.quoted_unit_price IS
  'VND quote captured when the Resident submits the request; only Admin approval creates the billable charge.';
COMMENT ON COLUMN resident_service_bookings.status IS
  'PENDING and APPROVED bookings count against capacity. Only Admin approval creates a READY Flexible Service charge; Resident cancellation is limited to PENDING.';

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_tables WHERE schemaname = 'public') <> 43 THEN
    RAISE EXCEPTION 'V1.11 postcondition failed: expected 43 public tables';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.resident_service_bookings'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid, false) LIKE 'FOREIGN KEY (property_id, owner_id)%'
  ) THEN
    RAISE EXCEPTION 'V1.11 postcondition failed: scoped Property foreign key missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.resident_service_bookings'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid, false) LIKE 'FOREIGN KEY (property_pricing_item_id, owner_id, property_id, kind)%'
  ) THEN
    RAISE EXCEPTION 'V1.11 postcondition failed: scoped service foreign key missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid = 'public.resident_service_bookings'::regclass
      AND tgname = 'resident_service_bookings_booking_mode_guard'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'V1.11 postcondition failed: BOOKING mode guard missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'resident_service_bookings_resident_active_slot_key'
  ) THEN
    RAISE EXCEPTION 'V1.11 postcondition failed: active Resident duplicate-slot guard missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.resident_service_bookings'::regclass
      AND contype = 'f'
      AND pg_get_constraintdef(oid, false) LIKE 'FOREIGN KEY (contract_id, room_id, property_id, owner_id)%'
  ) THEN
    RAISE EXCEPTION 'V1.11 postcondition failed: booking Contract/Room scope missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.resident_service_bookings'::regclass
      AND contype = 'f'
      AND confrelid = 'public.property_price_versions'::regclass
      AND pg_get_constraintdef(oid, false) LIKE 'FOREIGN KEY (quoted_price_version_id, owner_id, property_id, kind)%'
  ) THEN
    RAISE EXCEPTION 'V1.11 postcondition failed: quoted price-version scope missing';
  END IF;
END $$;
COMMIT;
