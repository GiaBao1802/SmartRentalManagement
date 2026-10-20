-- Database V1.4 -> V1.5: approved additive Contract idempotency table only.
-- No expiry/TTL/cleanup is part of V1.5. Do not execute runtime idempotency here.

BEGIN;

CREATE TABLE contract_idempotency_requests (
    request_id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_id                bigint NOT NULL,
    account_id              bigint NOT NULL,
    operation_scope         varchar(200) NOT NULL,
    idempotency_key_hash    bytea NOT NULL,
    request_fingerprint     bytea NOT NULL,
    fingerprint_version     smallint NOT NULL DEFAULT 1,
    state                   varchar(16) NOT NULL DEFAULT 'in_progress',
    response_status         smallint,
    response_ciphertext     bytea,
    response_nonce          bytea,
    response_auth_tag       bytea,
    response_key_version    varchar(64),
    created_at              timestamptz NOT NULL DEFAULT now(),
    completed_at            timestamptz,

    CONSTRAINT contract_idempotency_requests_owner_fk
        FOREIGN KEY (owner_id) REFERENCES owners(owner_id) ON DELETE RESTRICT,
    CONSTRAINT contract_idempotency_requests_account_owner_fk
        FOREIGN KEY (account_id, owner_id)
        REFERENCES accounts(account_id, owner_id) ON DELETE RESTRICT,
    CONSTRAINT contract_idempotency_requests_scope_key_key
        UNIQUE (owner_id, account_id, operation_scope, idempotency_key_hash),
    CONSTRAINT contract_idempotency_requests_key_hash_check
        CHECK (octet_length(idempotency_key_hash) = 32),
    CONSTRAINT contract_idempotency_requests_fingerprint_check
        CHECK (octet_length(request_fingerprint) = 32 AND fingerprint_version >= 1),
    CONSTRAINT contract_idempotency_requests_scope_check
        CHECK (operation_scope ~ '^(contracts\.create|contracts\.(activate|renew|terminate):[1-9][0-9]*)$'),
    CONSTRAINT contract_idempotency_requests_state_check
        CHECK (state IN ('in_progress','completed')),
    CONSTRAINT contract_idempotency_requests_response_state_check
        CHECK (
            (state = 'in_progress'
                AND response_status IS NULL AND response_ciphertext IS NULL
                AND response_nonce IS NULL AND response_auth_tag IS NULL
                AND response_key_version IS NULL AND completed_at IS NULL)
            OR
            (state = 'completed'
                AND response_status BETWEEN 200 AND 299
                AND response_ciphertext IS NOT NULL
                AND response_nonce IS NOT NULL AND octet_length(response_nonce) = 12
                AND response_auth_tag IS NOT NULL AND octet_length(response_auth_tag) = 16
                AND response_key_version IS NOT NULL AND length(response_key_version) > 0
                AND completed_at IS NOT NULL AND completed_at >= created_at)
        )
);

CREATE INDEX contract_idempotency_requests_account_owner_idx
    ON contract_idempotency_requests(account_id, owner_id);

COMMENT ON TABLE contract_idempotency_requests IS
    'Database V1.5: durable successful Contract command replay; Owner/Account scoped; response encrypted; no automatic expiry.';
COMMENT ON COLUMN contract_idempotency_requests.idempotency_key_hash IS
    'SHA-256 digest of the validated Idempotency-Key; raw key is never persisted.';
COMMENT ON COLUMN contract_idempotency_requests.request_fingerprint IS
    'Versioned SHA-256 fingerprint of canonical normalized semantic input.';
COMMENT ON COLUMN contract_idempotency_requests.response_ciphertext IS
    'AES-256-GCM encrypted serialized successful JSON response; key material is external to PostgreSQL.';

COMMIT;
