-- Góc Trọ Database V1.5 → V1.6
-- Approved additive delta: canonicalize existing Account phones, add Resident avatar key,
-- and enforce unique non-null Account phone + Resident avatar storage key.
BEGIN;
SET LOCAL lock_timeout = '10s';
LOCK TABLE accounts, residents IN ACCESS EXCLUSIVE MODE;

-- Normalize only approved Vietnamese formats; stop before any persistent update on invalid
-- values or normalized collisions. The temp table and all DDL are transaction-scoped.
CREATE TEMP TABLE v16_normalized_account_phones (
    account_id bigint PRIMARY KEY,
    canonical_phone varchar(30) NOT NULL UNIQUE
) ON COMMIT DROP;

DO $$
DECLARE
    r record;
    v_clean text;
    v_canonical text;
    v_existing_account_id bigint;
BEGIN
    FOR r IN SELECT account_id, phone FROM accounts WHERE phone IS NOT NULL ORDER BY account_id LOOP
        v_clean := regexp_replace(regexp_replace(r.phone, '^[[:space:]]+|[[:space:]]+$', '', 'g'), '[ .-]', '', 'g');
        IF v_clean ~ '^0[0-9]{9}$' THEN
            v_canonical := '+84' || substr(v_clean, 2);
        ELSIF v_clean ~ '^84[0-9]{9}$' THEN
            v_canonical := '+' || v_clean;
        ELSIF v_clean ~ '^\+84[0-9]{9}$' THEN
            v_canonical := v_clean;
        ELSE
            RAISE EXCEPTION 'V1.6 phone normalization rejected Account ID % (unsupported format)', r.account_id
                USING ERRCODE = 'check_violation';
        END IF;

        BEGIN
            INSERT INTO pg_temp.v16_normalized_account_phones(account_id, canonical_phone)
            VALUES (r.account_id, v_canonical);
        EXCEPTION WHEN unique_violation THEN
            SELECT account_id INTO v_existing_account_id
            FROM pg_temp.v16_normalized_account_phones WHERE canonical_phone = v_canonical;
            RAISE EXCEPTION 'V1.6 normalized phone collision between Account IDs % and %',
                v_existing_account_id, r.account_id USING ERRCODE = 'unique_violation';
        END;
    END LOOP;
END
$$;

UPDATE accounts a
SET phone = n.canonical_phone,
    updated_at = CASE WHEN a.phone IS DISTINCT FROM n.canonical_phone THEN now() ELSE a.updated_at END
FROM pg_temp.v16_normalized_account_phones n
WHERE n.account_id = a.account_id;

ALTER TABLE residents ADD COLUMN avatar_storage_key text;
CREATE UNIQUE INDEX residents_avatar_storage_key_key
    ON residents(avatar_storage_key) WHERE avatar_storage_key IS NOT NULL;
CREATE UNIQUE INDEX accounts_phone_nonnull_key
    ON accounts(phone) WHERE phone IS NOT NULL;

COMMENT ON COLUMN residents.avatar_storage_key IS
    'Opaque relative key for externally stored avatar bytes; no URL, absolute path, or image binary.';
COMMENT ON INDEX residents_avatar_storage_key_key IS
    'At most one Resident may reference each non-null external avatar storage key.';
COMMENT ON INDEX accounts_phone_nonnull_key IS
    'Canonical +84 Vietnamese phone values are unique; multiple NULL values are allowed.';

COMMIT;
