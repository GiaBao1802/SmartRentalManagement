-- IMPORTANT DEPLOYMENT NOTE
--
-- This migration upgrades an existing Database V1.2 instance to V1.3.
--
-- Before use against any staging or production database containing real data:
-- 1. Take a recoverable backup.
-- 2. Validate this migration against a populated disposable V1.2 database.
-- 3. Verify Contract counts and existing Contract fields are preserved.
-- 4. Verify draft Contracts map to revision 0.
-- 5. Verify active/expired/terminated Contracts map to revision 1.
-- 6. Verify no synthetic contract_change_history rows are created.
--
-- Fresh V1.3 installations should use schema.sql directly.
-- Góc Trọ V1.2 → V1.3 populated-safe migration.
-- Run once against a backed-up V1.2 database using PostgreSQL 18.
-- This script never fabricates Contract history.
BEGIN;
LOCK TABLE contracts IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='contracts' AND column_name='status'
    ) THEN
        RAISE EXCEPTION 'Preflight failed: public.contracts.status is missing';
    END IF;
    IF EXISTS (
        SELECT 1 FROM contracts
        WHERE status NOT IN ('draft','active','expired','terminated')
    ) THEN
        RAISE EXCEPTION 'Preflight failed: contracts contain an unrecognized status; no revision mapping applied';
    END IF;
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public' AND table_name='contracts' AND column_name='revision'
    ) THEN
        RAISE EXCEPTION 'Preflight failed: contracts.revision already exists; this is not an untouched V1.2 schema';
    END IF;
    RAISE NOTICE 'V1.2 contract preflight counts: draft=%, active=%, expired=%, terminated=%',
        (SELECT count(*) FROM contracts WHERE status='draft'),
        (SELECT count(*) FROM contracts WHERE status='active'),
        (SELECT count(*) FROM contracts WHERE status='expired'),
        (SELECT count(*) FROM contracts WHERE status='terminated');
    IF to_regclass('public.contract_change_history') IS NOT NULL THEN
        RAISE EXCEPTION 'Preflight failed: contract_change_history already exists; this is not an untouched V1.2 schema';
    END IF;
END;
$$;

ALTER TABLE contracts
    ADD COLUMN revision integer NOT NULL DEFAULT 0;
ALTER TABLE contracts
    ADD CONSTRAINT contracts_revision_nonnegative CHECK (revision >= 0);
UPDATE contracts
SET revision = CASE WHEN status = 'draft' THEN 0 ELSE 1 END;
ALTER TABLE contracts
    ADD CONSTRAINT contracts_status_revision_consistent CHECK (
        (status = 'draft' AND revision = 0)
        OR (status IN ('active','expired','terminated') AND revision >= 1)
    );
ALTER TABLE contracts
    ADD CONSTRAINT contracts_id_owner_unique UNIQUE (contract_id, owner_id);

CREATE TABLE contract_change_history (
    change_id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    contract_id            bigint NOT NULL,
    owner_id               bigint NOT NULL,
    changed_by_account_id  bigint NOT NULL,
    revision               integer NOT NULL CHECK (revision >= 1),
    change_type            varchar(32) NOT NULL
                           CHECK (change_type IN ('activation','material_update','status_transition')),
    change_reason          varchar(1000),
    before_data            jsonb NOT NULL CHECK (jsonb_typeof(before_data) = 'object'),
    after_data             jsonb NOT NULL CHECK (jsonb_typeof(after_data) = 'object'),
    created_at             timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT contract_change_history_material_reason CHECK (
        change_type <> 'material_update'
        OR (change_reason IS NOT NULL AND length(btrim(change_reason)) BETWEEN 1 AND 1000)
    ),
    UNIQUE (contract_id, revision),
    FOREIGN KEY (contract_id, owner_id)
        REFERENCES contracts(contract_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (changed_by_account_id, owner_id)
        REFERENCES accounts(account_id, owner_id) ON DELETE RESTRICT,
    FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON DELETE RESTRICT
);
CREATE INDEX contract_change_history_by_owner_contract_revision
    ON contract_change_history(owner_id, contract_id, revision DESC);

CREATE FUNCTION prevent_contract_change_history_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'contract change history is append-only; record a new event instead'
        USING ERRCODE = 'restrict_violation';
END;
$$;
CREATE TRIGGER contract_change_history_append_only
BEFORE UPDATE OR DELETE ON contract_change_history
FOR EACH ROW EXECUTE FUNCTION prevent_contract_change_history_mutation();

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM contracts WHERE status='draft' AND revision<>0)
       OR EXISTS (SELECT 1 FROM contracts WHERE status<>'draft' AND revision<1) THEN
        RAISE EXCEPTION 'Post-migration revision invariant failed';
    END IF;
    IF EXISTS (SELECT 1 FROM contract_change_history) THEN
        RAISE EXCEPTION 'Migration unexpectedly created synthetic Contract history';
    END IF;
END;
$$;

COMMIT;
