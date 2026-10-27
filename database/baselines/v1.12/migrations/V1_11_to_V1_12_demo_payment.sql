BEGIN;
SET LOCAL lock_timeout = '10s';
DO $$
BEGIN
  IF current_database() IN ('Goctro_dev_v18', 'Goctro_test3')
     AND current_setting('goctro.allow_locked_db_migration', true) IS DISTINCT FROM 'V1.12' THEN
    RAISE EXCEPTION 'Refusing V1.12 migration on protected database % without exact session authorization', current_database()
      USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.payment_transactions'::regclass
      AND conname='payment_transactions_provider_check'
      AND pg_get_constraintdef(oid, false) LIKE '%momo%zalopay%'
      AND pg_get_constraintdef(oid, false) NOT LIKE '%demo%'
  ) THEN
    RAISE EXCEPTION 'Expected the exact V1.11 payment provider check.';
  END IF;
END $$;
ALTER TABLE payment_transactions DROP CONSTRAINT payment_transactions_provider_check;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_transactions_provider_check
  CHECK (provider IN ('momo','zalopay','demo'));
COMMIT;
