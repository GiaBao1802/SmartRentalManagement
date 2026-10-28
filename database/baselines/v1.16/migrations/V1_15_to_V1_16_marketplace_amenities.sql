BEGIN;
SET LOCAL search_path = public, pg_catalog;
DO $$
BEGIN
  IF current_database() IN ('Goctro_dev_v18', 'Goctro_test3')
     AND current_setting('goctro.allow_locked_db_migration', true) IS DISTINCT FROM 'V1.16' THEN
    RAISE EXCEPTION 'Refusing V1.16 migration on protected database % without exact session authorization', current_database()
      USING ERRCODE = '42501';
  END IF;
END $$;

ALTER TABLE rooms
  ADD COLUMN marketplace_amenities text[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT rooms_marketplace_amenities_allowed_check CHECK (
    marketplace_amenities <@ ARRAY[
      'air_conditioning','parking','wifi','elevator','washing_machine','refrigerator',
      'water_heater','private_kitchen','private_bathroom','balcony','cats_allowed','dogs_allowed'
    ]::text[]
  );

CREATE INDEX rooms_marketplace_amenities_gin ON rooms USING GIN (marketplace_amenities);
COMMENT ON COLUMN rooms.marketplace_amenities IS 'Owner-confirmed public listing features used by marketplace filters; empty by default and never inferred from descriptions.';

COMMIT;
