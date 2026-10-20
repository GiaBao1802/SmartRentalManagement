-- Góc Trọ Database V1.7 -> V1.8 recurring Parking Invoice linkage.
-- PostgreSQL 18; one guarded, transactional metadata-only migration. Do not rerun.
-- Protected Goctro_test3 requires the separately approved session setting:
-- SET goctro.allow_locked_db_migration = 'V1.8';
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE invoice_items IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  old_constraint pg_constraint%ROWTYPE;
  duplicate_count bigint;
  bad_category_count bigint;
  bad_link_count bigint;
BEGIN
  IF current_database() = 'Goctro_test3'
     AND current_setting('goctro.allow_locked_db_migration', true) IS DISTINCT FROM 'V1.8' THEN
    RAISE EXCEPTION 'Refusing V1.8 migration on protected database % without exact session authorization', current_database()
      USING ERRCODE = '42501',
            HINT = 'A separately authorized V1.8 promotion session must set goctro.allow_locked_db_migration=V1.8.';
  END IF;

  IF (SELECT count(*) FROM pg_tables WHERE schemaname='public') <> 40 THEN
    RAISE EXCEPTION 'Expected V1.7 baseline with 40 public tables; found %',
      (SELECT count(*) FROM pg_tables WHERE schemaname='public');
  END IF;

  SELECT * INTO old_constraint
  FROM pg_constraint
  WHERE conrelid='public.invoice_items'::regclass
    AND conname='invoice_items_parking_assignment_id_key'
    AND contype='u';
  IF NOT FOUND OR pg_get_constraintdef(old_constraint.oid) <> 'UNIQUE (parking_assignment_id)' THEN
    RAISE EXCEPTION 'Expected exact V1.7 UNIQUE(parking_assignment_id) constraint; found drift or missing constraint';
  END IF;

  IF to_regclass('public.invoice_items_invoice_parking_assignment_unique') IS NOT NULL THEN
    RAISE EXCEPTION 'V1.8 index already exists; refusing duplicate/non-idempotent migration';
  END IF;

  SELECT count(*) INTO duplicate_count
  FROM (SELECT invoice_id,parking_assignment_id FROM invoice_items
        WHERE parking_assignment_id IS NOT NULL
        GROUP BY invoice_id,parking_assignment_id HAVING count(*) > 1) d;
  IF duplicate_count > 0 THEN
    RAISE EXCEPTION 'Preflight found % duplicate (invoice_id, parking_assignment_id) groups', duplicate_count;
  END IF;

  SELECT count(*) INTO bad_category_count
  FROM invoice_items WHERE parking_assignment_id IS NOT NULL AND category <> 'PARKING';
  IF bad_category_count > 0 THEN
    RAISE EXCEPTION 'Preflight found % non-PARKING Invoice Items linked to a Parking assignment', bad_category_count;
  END IF;

  SELECT count(*) INTO bad_link_count
  FROM invoice_items ii
  LEFT JOIN parking_slot_assignments a ON a.assignment_id=ii.parking_assignment_id
  WHERE ii.parking_assignment_id IS NOT NULL
    AND (a.assignment_id IS NULL OR a.owner_id IS DISTINCT FROM ii.owner_id OR a.property_id IS DISTINCT FROM ii.property_id);
  IF bad_link_count > 0 THEN
    RAISE EXCEPTION 'Preflight found % orphan or cross-Owner/Property Parking assignment links', bad_link_count;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.invoice_items'::regclass
      AND contype='f' AND conname='invoice_items_parking_assignment_id_owner_id_property_id_fkey') THEN
    RAISE EXCEPTION 'Expected composite Parking assignment Owner/Property FK is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.invoice_items'::regclass
      AND tgname='invoice_item_source_shape' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'Expected invoice_item_source_shape trigger is missing';
  END IF;
END $$;

ALTER TABLE invoice_items DROP CONSTRAINT invoice_items_parking_assignment_id_key;
CREATE UNIQUE INDEX invoice_items_invoice_parking_assignment_unique
  ON invoice_items(invoice_id,parking_assignment_id)
  WHERE parking_assignment_id IS NOT NULL;
COMMENT ON INDEX invoice_items_invoice_parking_assignment_unique IS
  'V1.8: one Parking assignment may recur across invoices, but only once per invoice.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.invoice_items'::regclass
      AND conname='invoice_items_parking_assignment_id_key') THEN
    RAISE EXCEPTION 'V1.8 postcondition failed: old global constraint remains';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_index x JOIN pg_class i ON i.oid=x.indexrelid
      WHERE i.relname='invoice_items_invoice_parking_assignment_unique' AND x.indisunique
        AND pg_get_indexdef(i.oid) LIKE '%(invoice_id, parking_assignment_id)%'
        AND pg_get_expr(x.indpred,x.indrelid) ILIKE '%parking_assignment_id IS NOT NULL%') THEN
    RAISE EXCEPTION 'V1.8 postcondition failed: partial unique index definition is incorrect';
  END IF;
END $$;
COMMIT;
