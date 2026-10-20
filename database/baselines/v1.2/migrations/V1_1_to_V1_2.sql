-- Góc Trọ Database migration V1.1 -> V1.2
-- Source expected: Database V1.1 schema (25 public tables), invoices has status unpaid/paid,
-- due_date NOT NULL, and no finalized_at. Target: Database V1.2 invoice lifecycle.
--
-- Data policy: fail closed if any invoice rows exist. No production data is expected, but a
-- historical finalized_at cannot be inferred safely from created_at or due_date. If rows exist,
-- stop and perform an explicitly reviewed/audited data migration before applying this patch.

BEGIN;

DO $source_guard$
BEGIN
    IF to_regclass('public.invoices') IS NULL THEN
        RAISE EXCEPTION 'V1.1 -> V1.2 aborted: public.invoices does not exist';
    END IF;
END
$source_guard$;

LOCK TABLE public.invoices IN ACCESS EXCLUSIVE MODE;

DO $migration$
DECLARE
    v_status_attnum smallint;
    v_old_status_checks integer;
    v_constraint_name text;
    v_finalized_exists boolean;
    v_due_date_not_null boolean;
BEGIN
    IF to_regclass('public.invoices') IS NULL THEN
        RAISE EXCEPTION 'V1.1 -> V1.2 aborted: public.invoices does not exist';
    END IF;

    SELECT attnum INTO v_status_attnum
    FROM pg_attribute
    WHERE attrelid = 'public.invoices'::regclass
      AND attname = 'status'
      AND NOT attisdropped;

    IF v_status_attnum IS NULL THEN
        RAISE EXCEPTION 'V1.1 -> V1.2 aborted: public.invoices.status is missing';
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.invoices'::regclass
          AND attname = 'finalized_at'
          AND NOT attisdropped
    ) INTO v_finalized_exists;

    IF v_finalized_exists THEN
        RAISE EXCEPTION 'V1.1 -> V1.2 aborted: finalized_at already exists; source is not the expected V1.1 shape';
    END IF;

    SELECT a.attnotnull INTO v_due_date_not_null
    FROM pg_attribute a
    WHERE a.attrelid = 'public.invoices'::regclass
      AND a.attname = 'due_date'
      AND NOT a.attisdropped;

    IF v_due_date_not_null IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'V1.1 -> V1.2 aborted: due_date is not the expected NOT NULL V1.1 column';
    END IF;

    IF EXISTS (SELECT 1 FROM public.invoices LIMIT 1) THEN
        RAISE EXCEPTION 'V1.1 -> V1.2 aborted: public.invoices contains rows. No safe finalized_at backfill is available; archive/review data and plan an audited migration first.';
    END IF;

    SELECT count(*) INTO v_old_status_checks
    FROM pg_constraint c
    WHERE c.conrelid = 'public.invoices'::regclass
      AND c.contype = 'c'
      AND c.conkey @> ARRAY[v_status_attnum]::smallint[]
      AND pg_get_constraintdef(c.oid) ~ '''unpaid'''
      AND pg_get_constraintdef(c.oid) ~ '''paid'''
      AND pg_get_constraintdef(c.oid) !~ '''draft''';

    IF v_old_status_checks <> 1 THEN
        RAISE EXCEPTION 'V1.1 -> V1.2 aborted: expected exactly one old unpaid/paid status CHECK; found %', v_old_status_checks;
    END IF;

    SELECT c.conname INTO v_constraint_name
    FROM pg_constraint c
    WHERE c.conrelid = 'public.invoices'::regclass
      AND c.contype = 'c'
      AND c.conkey @> ARRAY[v_status_attnum]::smallint[]
      AND pg_get_constraintdef(c.oid) ~ '''unpaid'''
      AND pg_get_constraintdef(c.oid) ~ '''paid'''
      AND pg_get_constraintdef(c.oid) !~ '''draft''';

    EXECUTE format('ALTER TABLE public.invoices DROP CONSTRAINT %I', v_constraint_name);
END
$migration$;

ALTER TABLE public.invoices
    ALTER COLUMN due_date DROP NOT NULL,
    ADD COLUMN finalized_at timestamptz,
    ALTER COLUMN status SET DEFAULT 'draft';

ALTER TABLE public.invoices
    ADD CONSTRAINT invoices_status_allowed
        CHECK (status IN ('draft','unpaid','paid')),
    ADD CONSTRAINT invoices_lifecycle_consistent
        CHECK (
            (status = 'draft' AND finalized_at IS NULL AND due_date IS NULL)
            OR
            (status IN ('unpaid','paid') AND finalized_at IS NOT NULL AND due_date IS NOT NULL)
        );

COMMENT ON COLUMN public.invoices.finalized_at IS
    'V1.2: timestamp when authoritative invoice amounts were finalized; null while draft.';
COMMENT ON COLUMN public.invoices.due_date IS
    'V1.2: null while draft; backend sets from finalized_at local calendar date plus five days.';

COMMIT;
