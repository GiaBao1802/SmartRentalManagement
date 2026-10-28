-- Góc Trọ Database V1.14 Resident Flexible Service booking schema validator.
-- Read-only against application rows; the temporary result table is rolled back.
BEGIN;
SET LOCAL search_path=public,pg_catalog;
CREATE TEMP TABLE booking_validation_results(test_name text PRIMARY KEY, passed boolean NOT NULL) ON COMMIT DROP;
CREATE FUNCTION pg_temp.assert_true(test_name text, outcome boolean) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF outcome IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'VALIDATION FAIL: %',test_name; END IF;
  INSERT INTO booking_validation_results VALUES(test_name,true);
  RAISE NOTICE 'PASS: %',test_name;
END $$;

DO $$
DECLARE total integer;
BEGIN
  PERFORM pg_temp.assert_true('BOOKING-01 V1.14 has exactly 46 public tables',
    (SELECT count(*)=46 FROM pg_tables WHERE schemaname='public'));
  PERFORM pg_temp.assert_true('BOOKING-02 auth_sessions and Resident bookings both exist',
    to_regclass('public.auth_sessions') IS NOT NULL AND to_regclass('public.resident_service_bookings') IS NOT NULL);
  PERFORM pg_temp.assert_true('BOOKING-03 booking table has all 23 mapped columns',
    (SELECT count(*)=23 FROM information_schema.columns WHERE table_schema='public' AND table_name='resident_service_bookings'));
  PERFORM pg_temp.assert_true('BOOKING-04 booking primary key is present',
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.resident_service_bookings'::regclass AND contype='p' AND conname='resident_service_bookings_pkey'));
  PERFORM pg_temp.assert_true('BOOKING-05 booking has six state and value CHECK constraints',
    (SELECT count(*)=6 FROM pg_constraint WHERE conrelid='public.resident_service_bookings'::regclass AND contype='c'));
  PERFORM pg_temp.assert_true('BOOKING-06 booking has nine scope foreign keys',
    (SELECT count(*)=9 FROM pg_constraint WHERE conrelid='public.resident_service_bookings'::regclass AND contype='f'));
  PERFORM pg_temp.assert_true('BOOKING-07 Resident and Owner are constrained together',
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.resident_service_bookings'::regclass AND contype='f' AND conname='resident_service_bookings_resident_owner_fkey' AND pg_get_constraintdef(oid,false) LIKE 'FOREIGN KEY (resident_id, owner_id)%'));
  PERFORM pg_temp.assert_true('BOOKING-08 Property, Room and Contract scope keys are constrained',
    (SELECT count(*)=3 FROM pg_constraint WHERE conrelid='public.resident_service_bookings'::regclass AND contype='f' AND conname IN ('resident_service_bookings_property_scope_fkey','resident_service_bookings_room_scope_fkey','resident_service_bookings_contract_scope_fkey')));
  PERFORM pg_temp.assert_true('BOOKING-09 service and booking configuration share Owner/Property scope',
    (SELECT count(*)=2 FROM pg_constraint WHERE conrelid='public.resident_service_bookings'::regclass AND contype='f' AND conname IN ('resident_service_bookings_service_scope_fkey','resident_service_bookings_booking_config_fkey') AND pg_get_constraintdef(oid,false) LIKE 'FOREIGN KEY (property_pricing_item_id, owner_id, property_id, kind)%'));
  PERFORM pg_temp.assert_true('BOOKING-10 quoted price version is scoped to the saved service',
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.resident_service_bookings'::regclass AND contype='f' AND conname='resident_service_bookings_quoted_price_version_fkey' AND confrelid='public.property_price_versions'::regclass));
  PERFORM pg_temp.assert_true('BOOKING-11 approved charge is Owner/Property scoped',
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.resident_service_bookings'::regclass AND contype='f' AND conname='resident_service_bookings_charge_fkey' AND confrelid='public.flexible_service_charges'::regclass));
  PERFORM pg_temp.assert_true('BOOKING-12 state transition CHECK binds decision, cancellation and charge fields',
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.resident_service_bookings'::regclass AND contype='c' AND conname='resident_service_bookings_decision_state_check'));
  PERFORM pg_temp.assert_true('BOOKING-13 only configured BOOKING services can be inserted',
    EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.resident_service_bookings'::regclass AND tgname='resident_service_bookings_booking_mode_guard' AND NOT tgisinternal)
    AND EXISTS(SELECT 1 FROM pg_proc WHERE proname='enforce_resident_service_booking_mode' AND pg_get_functiondef(oid) LIKE '%BOOKING%'));
  PERFORM pg_temp.assert_true('BOOKING-14 one Resident cannot hold the same active slot twice',
    EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='resident_service_bookings' AND indexname='resident_service_bookings_resident_active_slot_key' AND indexdef LIKE '%UNIQUE INDEX%WHERE%'));
  PERFORM pg_temp.assert_true('BOOKING-15 capacity lookup index counts active requests',
    EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='resident_service_bookings' AND indexname='resident_service_bookings_by_service_slot' AND indexdef LIKE '%WHERE%'));
  PERFORM pg_temp.assert_true('BOOKING-16 Admin and Resident listing indexes are present',
    (SELECT count(*)=2 FROM pg_indexes WHERE schemaname='public' AND tablename='resident_service_bookings' AND indexname IN ('resident_service_bookings_by_resident_date','resident_service_bookings_by_property_status')));
  PERFORM pg_temp.assert_true('BOOKING-17 one saved charge can be linked to at most one request',
    EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='public.resident_service_bookings'::regclass AND contype='u' AND conname='resident_service_bookings_charge_scope_key'));

  SELECT count(*) INTO total FROM booking_validation_results;
  IF total<>17 THEN RAISE EXCEPTION 'VALIDATION FAIL: expected 17 booking checks, got %',total; END IF;
  RAISE NOTICE 'DATABASE V1.14 BOOKING VALIDATION = PASS; TOTAL=% PASS=% FAIL=0',total,total;
END $$;
ROLLBACK;
