# Database V1.5 — Contract Durable Idempotency Design

- **Date:** 2026-10-12
- **Domain:** Contract
- **Decision:** **APPROVED FOR MIGRATION IMPLEMENTATION**, subject to the implementation gates in §23.
- **Database status (synchronized 2026-10-12):** the approved V1.5 physical schema is now migrated and validated for local/development and is the current LOCK baseline (28 public tables, PostgreSQL 18, runtime validator 90/90 PASS). V1.4 is the historical locked predecessor. This implementation status does not claim Contract routes/services or durable replay runtime are implemented.
- **Scope:** Durable replay for database-atomic Contract create, activate, renew, and terminate commands. Contract document upload is deferred to a separate storage-safe design.

## 1. Executive summary

Add one table, `contract_idempotency_requests`, to Database V1.4. It stores a tenant/account/operation-scoped key digest, a versioned SHA-256 request fingerprint, and an encrypted successful JSON response. The record and Contract mutation commit in the same PostgreSQL transaction.

The key namespace is `(owner_id, account_id, operation_scope, idempotency_key_hash)`. A repeated request with the same fingerprint replays its original successful status/body. Reuse of that namespace with a different fingerprint returns deterministic HTTP 409 `IDEMPOTENCY_KEY_REUSED`.

This is additive: one new table, its PK/FKs/checks/unique constraint, and one supporting FK index. No existing table or Contract history is altered. Once implemented and validated, the public table count will move from 27 to 28. V1.4 remains current until V1.5 migration, Prisma validation, and runtime validation pass.

## 2. Problem statement and sources reviewed

The current Contract router validates that `Idempotency-Key` is 1–128 visible ASCII characters, but does not persist or replay it. The current API Spec explicitly says replay is not guaranteed and instructs implementations not to misuse `event_outbox`.

Sources reviewed:

- `docs/DOCUMENTATION_RULES.md` and `docs/DOCUMENT_CATALOG.md`.
- Canonical `docs/01_REQUIREMENTS.md` and `docs/04_API_SPEC.md` in SmartRentalManagement.
- `docs/07_modules/contract/CONTRACT_BUSINESS_REQUIREMENT_AUDIT.md`.
- `docs/07_modules/contract/CONTRACT_BUSINESS_RULE_ALIGNMENT_P1_FIX_REPORT.md`.
- `database/schema.prisma`, `Database V1.4/schema.sql`, and `Database V1.4/erd.md`.
- Contract route/validation implementation and API send helper.
- Database V1.4 changelog and implementation/runtime reports listed in the document catalog.

The exact locked V1.4 table count is 27. V1.4 has `accounts_id_owner_unique UNIQUE (account_id, owner_id)` and Account→Owner ownership enforcement, which allows a request row to enforce that its authenticated Admin account belongs to the stored Owner. V1.4 has no `event_outbox` table. Regardless of any future outbox, an event-delivery record would not by itself meet the required request fingerprint, same-key conflict, and original response replay semantics.

The documentation rules prefer module-first placement for documents primarily about one domain. This report is therefore stored under `docs/07_modules/contract/`, not the generic database folder.

## 3. Business semantics

For an authenticated Admin, a canonical operation and key digest identify at most one successful command within that Owner and Account:

| Request relationship | Required outcome |
|---|---|
| Same Owner + Account + operation + key + normalized semantic payload | Replay original successful HTTP status and JSON body. Do not execute the Contract mutation again. |
| Same namespace and key, different normalized payload | HTTP 409 `IDEMPOTENCY_KEY_REUSED`; do not mutate. |
| Different Account in the same Owner | Independent namespace; no other Account's response is replayed. |
| Different Owner | Independent namespace; no cross-Owner collision or lookup disclosure. |
| First attempt fails before successful commit | No completed replay record is retained; the transaction rolls back. A corrected retry can run. |

The namespace is Account-scoped as well as Owner-scoped. The API promise is for the same authenticated scope, and replaying an Admin response to a different Admin account could disclose a result to an actor who did not initiate it. Authentication, active-account checks, role checks, Owner context, and relevant Contract authorization still run before any record lookup/replay; `owner_id` and `account_id` come from the authenticated server context, never from client fields.

## 4. Proposed table and columns

Table name: `contract_idempotency_requests`. This matches the existing plural snake_case table convention and clearly limits ownership and retention to Contract commands.

| Column | PostgreSQL type | Nullability/default | Purpose |
|---|---|---|---|
| `request_id` | `bigint` identity | PK, generated always | Stable row identifier and encryption AAD binding. |
| `owner_id` | `bigint` | NOT NULL | Tenant namespace and Owner FK. |
| `account_id` | `bigint` | NOT NULL | Initiating authenticated Admin account. |
| `operation_scope` | `varchar(200)` | NOT NULL | Canonical allowlisted operation name plus normalized Contract ID where applicable. |
| `idempotency_key_hash` | `bytea` | NOT NULL | SHA-256 digest of the exact validated ASCII header; raw key is not persisted. Exactly 32 bytes. |
| `request_fingerprint` | `bytea` | NOT NULL | SHA-256 digest of the versioned canonical operation and normalized semantic inputs. Exactly 32 bytes. |
| `fingerprint_version` | `smallint` | NOT NULL, default `1` | Selects the canonicalization rules used for this request across deployments. |
| `state` | `varchar(16)` | NOT NULL, default `'in_progress'` | Only `in_progress` and `completed` are needed. |
| `response_status` | `smallint` | nullable until completed | Original successful HTTP status, currently 200 or 201. |
| `response_ciphertext` | `bytea` | nullable until completed | AES-256-GCM encrypted serialized JSON response bytes. |
| `response_nonce` | `bytea` | nullable until completed | GCM nonce, exactly 12 bytes. |
| `response_auth_tag` | `bytea` | nullable until completed | GCM authentication tag, exactly 16 bytes. |
| `response_key_version` | `varchar(64)` | nullable until completed | KMS-managed encryption key version/identifier; no key material is stored in PostgreSQL. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | First successful transaction's request row creation time. |
| `completed_at` | `timestamptz` | nullable until completed | Time at which response snapshot is ready in the same transaction. |

There is intentionally no raw request body, raw idempotency key, cookie, token, CSRF value, arbitrary header, user agent, IP address, or password field. The key digest is deterministic SHA-256 because the validated key is an opaque namespace value, not an authentication credential; clients should use high-entropy keys. The original key is never needed for replay.

## 5. Constraints and foreign keys

- `contract_idempotency_requests_pkey`: primary key on `request_id`.
- `contract_idempotency_requests_owner_fk`: `owner_id → owners(owner_id) ON DELETE RESTRICT`.
- `contract_idempotency_requests_account_owner_fk`: `(account_id, owner_id) → accounts(account_id, owner_id) ON DELETE RESTRICT`. The existing Account role/owner CHECK makes a matching non-NULL Owner pair an Admin Account context and rejects resident accounts for this table.
- `contract_idempotency_requests_scope_key_key`: unique `(owner_id, account_id, operation_scope, idempotency_key_hash)`.
- `contract_idempotency_requests_key_hash_check`: digest length is 32 bytes.
- `contract_idempotency_requests_fingerprint_check`: fingerprint length is 32 bytes; `fingerprint_version >= 1`.
- `contract_idempotency_requests_state_check`: state is only `in_progress` or `completed`.
- `contract_idempotency_requests_response_state_check`: `in_progress` has no completion time/status/ciphertext/nonce/tag/key version; `completed` has a 2xx status, all encryption fields, exact nonce/tag lengths, nonempty key version, and completion time not earlier than creation.
- `contract_idempotency_requests_operation_scope_check`: only canonical Contract command scopes are accepted, e.g. `contracts.create`, `contracts.activate:<positive-decimal-contract-id>`, `contracts.renew:<id>`, `contracts.terminate:<id>`. IDs use canonical base-10 without leading zeroes. This avoids arbitrary URL strings and keeps resource identity in the scope.

No `failed` or `abandoned` state is proposed. A failed command rolls back the entire transaction, including its idempotency row. Under the required transaction design, a committed `in_progress` row is an invariant violation and should be treated as an operational integrity error, not automatically claimed by another worker.

## 6. Indexes

1. The namespace UNIQUE constraint creates the principal B-tree index. It supports exact idempotency lookup, serialization of concurrent identical keys, and database enforcement against duplicate scope/key rows.
2. `contract_idempotency_requests_account_owner_idx` on `(account_id, owner_id)` supports the composite Account FK's parent-delete/update checks. The primary request path uses the UNIQUE namespace index; no separate lookup index is added.
3. No `expires_at` or cleanup index is added because approved V1.5 retention has no automatic deletion. No status/time index is justified for the command request path; monitoring can use future operational tooling if evidence requires it.

## 7. Scope and operation names

Canonical scopes (not raw request URLs):

- `contracts.create`
- `contracts.activate:<contract_id>`
- `contracts.renew:<contract_id>`
- `contracts.terminate:<contract_id>`

The server constructs the value from an allowlisted route operation and the parsed positive `bigint` ID rendered as canonical decimal. Create has no target Contract ID. Method/API family is fixed by the operation name and this table is not shared with Invoice, Payment, Auth, or arbitrary endpoints. Reusing one client key for two different operations produces two independent namespaces by design.

Document upload is not included in V1.5's durable replay scope; see §15. Upload still validates the currently required header until a separately approved API/design change reconciles storage semantics.

## 8. Request fingerprint algorithm

Use SHA-256 over a canonical byte representation with a domain/version prefix, such as:

```text
UTF8("goctro-contract-idempotency:v1\n" + HTTP_METHOD + "\n" + OPERATION_SCOPE + "\n" + JCS(normalized_semantic_input))
```

The application first applies existing authentication, route parsing, validation, and operation-specific normalization. Fingerprinting is over the validated semantic DTO plus semantically relevant preconditions, not the raw HTTP request.

- Method is uppercase; operation scope is the canonical value in §7.
- JSON object keys are serialized in deterministic lexicographic order using RFC 8785/JCS-compatible canonical JSON. Arrays retain order.
- JSON `null` remains distinct from an omitted field unless that operation's normalizer explicitly converts both to the same persisted meaning.
- For create/renew inputs, apply only existing field normalization/default semantics before fingerprinting. For partial/nullable fields in any future covered operation, omission and explicit null remain distinct when they mean “leave unchanged” versus “clear”.
- Database IDs and arbitrary-precision integers are canonical base-10 strings; never pass PostgreSQL `bigint` through an IEEE-754 JSON number. Decimal readings use a canonical non-exponent decimal string at the precision accepted by current validation. Money uses the existing integer VND representation. Dates use `YYYY-MM-DD`.
- Strings use the exact validated/persisted value after existing trim/normalization rules; do not case-fold free text or silently alter user semantics. Unicode is normalized only if the API's current validation/persistence already defines that behavior.
- For activate, normalized input is the empty object. Renew and terminate include the normalized request body and the parsed `If-Match` revision because it affects command preconditions. Create includes only its validated allowlisted payload.
- Exclude cookies, CSRF, Authorization/session tokens, request ID, trace headers, `Content-Type` boundary, client timestamps that are not accepted business data, and unstable headers.
- Persist `fingerprint_version` so a later deployment can use the matching canonicalizer to compare retries for existing records. Keep old canonicalizers available while records may be replayed; never turn a deployment-only serializer change into a false key conflict.
- Multipart upload bytes/metadata do not have a V1.5 fingerprint because upload is deferred. A later storage-safe design must include content SHA-256, normalized document type, filename policy, MIME type, and target Contract in a versioned fingerprint.

## 9. Successful response replay

Store the original 2xx status and the exact JSON bytes emitted by the route after safe DTO serialization. Encrypt those bytes with application-level AES-256-GCM using a KMS-managed key version. Bind AAD to `request_id`, Owner, Account, operation scope, key digest, and request fingerprint to prevent ciphertext row-swapping.

The current covered routes return JSON through `sendJson` and do not set per-command semantic headers such as `Location` or `ETag`. Replay therefore restores the stored status and body and sets `Content-Type: application/json`; standard per-attempt request/trace/security headers are regenerated. Do not persist/replay `Set-Cookie`, CSRF, session, authorization, hop-by-hop, date, server, or arbitrary headers. If a future covered command introduces a semantic header, add an explicit allowlist and schema representation in an approved change before implementation.

Contract DTOs can contain personal and financial information, so response-body encryption is required. Keep encryption keys outside the database and logs. Store only a key version identifier. Rotation uses new writes under the active version while retaining decrypt capability for existing versions; because V1.5 has no expiry, old versions cannot be destroyed while any retained row depends on them. If a referenced key version is unavailable or authentication fails, fail closed with a generic 503 replay-unavailable response, alert operators, and do not re-execute the mutation or return ciphertext.

## 10. State machine

```text
absent ──(within command transaction)──> in_progress ──(response encrypted)──> completed
```

Both transitions happen in one database transaction; other transactions do not observe the intermediate state. Only successful 2xx mutation outcomes become committed `completed` records. Validation/auth failures happen before insertion. Business/DB failures, encryption errors, and response serialization failures roll back both mutation and row. There is no committed `failed` record and no automatic takeover of a committed `in_progress` row.

## 11. Transaction algorithm

For create, activate, renew, and terminate:

1. Authenticate and authorize the Admin; derive Owner/Account from server context. Validate `Idempotency-Key`, route, body and preconditions; build operation scope, key digest, normalized DTO and fingerprint.
2. Begin a PostgreSQL `READ COMMITTED` transaction.
3. Attempt insert of an `in_progress` request row with namespace, fingerprint version/hash, and timestamps using `INSERT ... ON CONFLICT DO NOTHING RETURNING request_id`.
4. If inserted, this transaction owns the command. Execute the existing Owner-scoped Contract mutation, its revision/history/occupancy effects, and all required DB work using the same transaction client. If the mutation produces a not-found or business error, throw/return through rollback; do not commit an unsuccessful replay record.
5. Serialize the exact safe 2xx status/body, encrypt it, update the row to `completed` with status/nonce/tag/key version/ciphertext and `completed_at`, then commit. Mutation, history and replay response become visible atomically.
6. If insert found a unique conflict, PostgreSQL waits for the competing transaction. Select the matching namespace row `FOR UPDATE` in a new statement. Read the existing fingerprint version and compare using that version's canonicalizer. Different fingerprint returns deterministic 409 without mutation. Matching `completed` decrypts and replays original status/body without invoking the mutation. A committed `in_progress` row fails closed and triggers an integrity alert.
7. Return HTTP only after commit. If sending the response fails after commit, a client retry will find and replay the stored result.

Use one transaction client end-to-end. Do not commit an `in_progress` reservation separately. Use bounded database/lock timeouts and bounded retries for PostgreSQL serialization/deadlock errors (`40001`, `40P01`); retry the entire transaction with the same authenticated namespace/key. Never retry a known committed transaction as a fresh unkeyed command.

## 12. Concurrency and deadlock analysis

Two simultaneous requests with the same namespace hit the same unique index entry. The later insert waits for the first transaction to commit or roll back. If the first commits, the second reads its completed record and replays or returns payload conflict. If the first rolls back/crashes, the second may successfully insert and execute once. Unique constraint enforcement closes the race; application-level preflight lookup alone is insufficient.

The idempotency row is acquired before Contract/Room/Resident rows. Same-key requests serialize on the unique key; distinct keys do not lock each other's idempotency rows. Existing Contract repository row-lock order must remain deterministic for domain rows, especially when capacity/occupancy/parking checks touch multiple rows. Set statement/lock timeouts and return a retryable service error on timeout; do not hold locks while doing network/object-storage work.

Use PostgreSQL READ COMMITTED so the post-conflict SELECT is a fresh statement snapshot after unique contention resolves. Under SERIALIZABLE, handle serialization failure by retrying the whole transaction with a bounded retry policy. Validate same-key/same-payload and same-key/different-payload concurrency with real PostgreSQL sessions before locking V1.5.

## 13. Crash recovery

- Crash after the row INSERT but before mutation/commit: PostgreSQL rolls back the open transaction and row; retry can execute.
- Crash during Contract/history mutation before commit: all DB changes and request row roll back.
- Mutation and `completed` snapshot commit but process dies before HTTP response: retry reads and replays the committed original result.
- Encryption/serialization failure before commit: full rollback, then a corrected/retried request may execute.
- Crash after HTTP response begins: committed result remains replayable.

These guarantees apply because the four covered operations have only PostgreSQL side effects inside the transaction. External queues, email/Zalo, filesystem or object storage must not be invoked inside this atomic claim. Any future side effect requires an outbox/workflow design and separate delivery semantics.

## 14. Event outbox review

Database V1.4 physical schema has no `event_outbox` table. Even if an outbox is introduced for reliable event delivery, its event identity/payload and delivery state do not supply the required tuple of authenticated request namespace, normalized request fingerprint, response status/body, and replay/deconfliction behavior. An outbox may complement mutation delivery, but it is not a substitute for this request table.

## 15. Contract document upload

**Decision: defer durable upload replay from V1.5; require a separate storage-safe design before claiming upload replay.** Current upload first interacts with external object storage and then persists document metadata. PostgreSQL cannot atomically commit that object write with the idempotency row/document row. The current API key header remains required and validated, but until that separate work lands, same-key upload replay is not guaranteed and must not be described as implemented.

A later design must specify, at minimum:

- Per-request/per-fingerprint staging object keys that avoid collisions across different payloads and Owners; no client-controlled final storage key.
- Content SHA-256 and canonical metadata fingerprint (Contract, document type, normalized filename/MIME policy, bytes).
- Conditional/idempotent staging writes and retry behavior for an already-present matching object.
- One DB transaction for document metadata plus completed replay result, with the committed metadata referencing a safe final object key.
- Cleanup/reconciliation for orphan staging objects after upload succeeds but DB commit fails; preserve staged object when metadata commits but HTTP response is lost.
- Duplicate same-payload requests replay the committed document result; different-payload reuse returns 409 and cleans only its own unreferenced staging object.
- Storage outage, DB outage after upload, process crash, cleanup failure and retention semantics; no claim of a distributed atomic transaction.

V1.5's approval is limited to the four DB-atomic JSON commands. Before V1.5 implementation is called complete against the entire Contract requirement/API surface, the upload exclusion must be reconciled in a follow-up approved design/API decision or a separately validated storage-safe upload implementation.

## 16. Retention policy

Choose **no automatic deletion in V1.5**. The approved API/Requirement does not define a finite replay window; deleting a key record makes a later reuse execute a second mutation and contradicts indefinite replay/no-reuse expectations. Do not add `expires_at`, TTL cleanup, or key reuse after a time window.

Operational consequences: successful commands grow the table; encrypted Contract response snapshots retain personal/financial data; KMS key versions remain necessary; account deletion is restricted by the FK. Monitor row count/storage and key decryptability. Any finite retention, anonymization, account deletion, or archival policy requires an approved Requirement/API change that defines the changed replay guarantee and privacy/legal treatment, plus migration/runtime validation. No cleanup job is part of V1.5.

## 17. PII and security controls

- Owner and Account IDs are necessary for tenant boundary enforcement and are not secrets. Never accept either as authoritative client input.
- Store only a one-way digest of the idempotency key and request fingerprint; neither raw key nor request payload is stored.
- Encrypt the response snapshot; protect KMS access with least privilege, audit decrypt operations, retain old key versions while rows require them, and exclude ciphertext/plaintext/key data from logs/telemetry.
- Re-check current authentication, active Account status, Admin role, Owner scope, and resource authorization before replay. Same key cannot bypass revoked/locked access.
- Tenant namespace UNIQUE and composite Account/Owner FK prevent cross-Owner collisions and mismatched actor scope. Return indistinguishable not-found for out-of-scope resources before exposing resource details.
- Payload mismatch error is generic and must not disclose the previously stored fingerprint/body.
- Apply request/body-size bounds, DB connection/lock timeout, KMS timeout and rate limits. A KMS outage must fail closed; it must never cause duplicate mutation.
- Raw HTTP headers, session tokens, CSRF tokens, password fields and arbitrary client metadata are never persisted.

## 18. Proposed Prisma mapping (documentation only)

No edit to `database/schema.prisma` is authorized in this pass. Proposed model shape:

```prisma
model ContractIdempotencyRequest {
  requestId            BigInt    @id @default(autoincrement()) @map("request_id")
  ownerId              BigInt    @map("owner_id")
  accountId            BigInt    @map("account_id")
  operationScope       String    @map("operation_scope") @db.VarChar(200)
  idempotencyKeyHash   Bytes     @map("idempotency_key_hash") @db.ByteA
  requestFingerprint   Bytes     @map("request_fingerprint") @db.ByteA
  fingerprintVersion   Int       @default(1) @map("fingerprint_version") @db.SmallInt
  state                String    @default("in_progress") @db.VarChar(16)
  responseStatus       Int?      @map("response_status") @db.SmallInt
  responseCiphertext   Bytes?    @map("response_ciphertext") @db.ByteA
  responseNonce        Bytes?    @map("response_nonce") @db.ByteA
  responseAuthTag      Bytes?    @map("response_auth_tag") @db.ByteA
  responseKeyVersion   String?   @map("response_key_version") @db.VarChar(64)
  createdAt            DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  completedAt          DateTime? @map("completed_at") @db.Timestamptz(6)

  owner   Owner   @relation(fields: [ownerId], references: [ownerId], onDelete: Restrict)
  account Account @relation(fields: [accountId, ownerId], references: [accountId, ownerId], onDelete: Restrict)

  @@unique([ownerId, accountId, operationScope, idempotencyKeyHash], map: "contract_idempotency_requests_scope_key_key")
  @@index([accountId, ownerId], map: "contract_idempotency_requests_account_owner_idx")
  @@map("contract_idempotency_requests")
}
```

Add inverse relation arrays to `Owner` and `Account` when implementing Prisma. Prisma can represent bigint identities, `Bytes`/PostgreSQL `bytea`, composite FK, unique and index. Keep state as `String` because the database convention uses `varchar` + CHECK rather than native enums. Prisma cannot fully represent the CHECK constraints or the atomic transaction behavior; SQL remains authority. Verify supported scalar/native type syntax using the project's pinned Prisma CLI before implementation.

## 19. Proposed additive SQL migration (do not execute in this pass)

Suggested path/name when implementation is authorized: `Database V1.5/migrations/V1_4_to_V1_5_contract_idempotency.sql`.

```sql
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
```

This migration creates only the new table/index/comments. It does not alter, rewrite, or delete existing Contract data. Rehearse exact SQL, especially regex escaping and Prisma mappings, with the pinned PostgreSQL 18/Prisma versions during implementation; that validation is still a gate, not claimed here.

## 20. V1.4 → V1.5 migration safety plan

**Before:** take a restorable PostgreSQL backup; capture V1.4 schema fingerprint and public table count (27); record row counts for all critical V1.4 tables, especially accounts, owners, contracts, contract_change_history, contract_documents, rooms, residents and room_residents; run the locked V1.4 validator and preserve its output. Confirm target database identity and PostgreSQL version.

**Apply:** apply only the additive migration above in one transaction. Do not run V1.4 `schema.sql` over an existing database, reset, or reseed. Confirm `contract_idempotency_requests` exists with all named FKs, CHECKs, unique constraint and index; public table count is 28.

**After:** verify old table row-count fingerprints unchanged; compare all old schema objects to the pre-migration fingerprint; validate the new relation/constraint catalog; update proposed Prisma mapping and run `prisma validate`/`prisma generate` without db pull/push; run a V1.5 validator on PostgreSQL 18 for tenant/account isolation, exact duplicate replay, changed-payload conflict, successful rollback/crash semantics, concurrent contention, key decryption, missing key fail-closed, and retention. Start backend and run focused Contract tests. Only then may V1.5 be considered LOCK/current.

## 21. Rollback plan

- Before backend code writes rows, rollback is safe: take backup, drop the new index/table within an approved reverse migration; restore V1.4 Prisma/app baseline if it had been changed. No old table rows are affected.
- After any request rows are written, dropping the table loses replay protection and permits a retry to repeat a previously successful mutation. Do not roll back by dropping data while the new backend is serving traffic. First stop/disable covered write traffic or roll backend to a version that fails closed for commands requiring durable replay; preserve the table and backup. A destructive rollback requires an explicit business/operations decision acknowledging idempotency guarantees are lost and must include reconciliation of client retry windows.
- Retaining V1.5 table while rolling backend code back is safer than dropping it, but old code will not read the rows and must not be allowed to process retried commands blindly. Gate traffic accordingly.

## 22. Risks and mitigations

| Risk | Mitigation / gate |
|---|---|
| Indefinite response retention creates table growth and privacy obligations. | Encrypt bodies, retain only successful safe DTO bytes, monitor growth/key availability; no TTL without approved replay-policy change. |
| KMS/key loss makes an existing successful result unreplayable. | Retain/version keys, test restore and decrypt, fail closed without re-execution, alert operators. |
| Canonicalizer changes can create false conflicts. | Persist fingerprint version, keep backward canonicalizers, cover with cross-version fixtures. |
| A caller might replay after its account is locked or loses scope. | Re-authenticate/reauthorize before lookup and replay; derive Owner/account only from the session. |
| Different Accounts may expect shared retries. | Account scoping is intentional to honor same authenticated scope and prevent cross-actor response disclosure; clients must retry as the initiating Admin. |
| Upload object storage is outside PostgreSQL atomicity. | Excluded from V1.5 covered operations pending staging/reconciliation design; do not claim upload replay. |
| Lock contention / deadlock under burst retries. | Unique-key wait, short transaction, lock/statement timeout, deterministic domain locks, bounded whole-transaction retry and PostgreSQL concurrency tests. |
| Account deletion blocked by retained FK rows. | Account lifecycle should lock/archive, not hard-delete; any erasure policy must reconcile replay retention explicitly. |

## 23. Approval decision and exact next task

### DATABASE V1.5 IDEMPOTENCY DESIGN

**✅ APPROVED FOR MIGRATION IMPLEMENTATION** for the additive table and four PostgreSQL-atomic JSON commands: Contract create, activate, renew and terminate. The approved physical table design is implemented and Database V1.5 is current/LOCK for local/development.

The following was the approval checklist before V1.5 became current; its implementation-time runtime status is superseded by §22:

1. The physical migration, Prisma mapping, clean/populated PostgreSQL 18 paths, local Goctro_test3 validation and V1.5 structural validator are complete; see [`DATABASE_V1_4_TO_V1_5_MIGRATION_FINAL_REPORT.md`](DATABASE_V1_4_TO_V1_5_MIGRATION_FINAL_REPORT.md).
2. Implement and validate durable Contract runtime replay, conflict and concurrency behavior as a separately scoped backend pass before claiming the approved commands are operational.
3. Reconcile document upload idempotency as a separate approved storage-safe design/API decision before claiming the whole Contract command surface is durably idempotent.
4. Keep Database V1.5 as the current physical baseline unless an approved business-rule change creates a new database version and migration.

**Historical next task before runtime implementation:** implement durable Contract idempotency separately, respecting the approved request namespace, response encryption, authorization, transaction atomicity and concurrency rules. Do not include document upload replay without its own approved storage-safe design.

## 22. Runtime implementation status — 2026-10-12

The backend runtime implementation for Contract create, activate, renew and terminate is recorded in [`CONTRACT_DURABLE_IDEMPOTENCY_RUNTIME_IMPLEMENTATION_REPORT.md`](CONTRACT_DURABLE_IDEMPOTENCY_RUNTIME_IMPLEMENTATION_REPORT.md). Disposable PostgreSQL 18 concurrency, replay after service re-instantiation, payload conflict, rollback and fail-closed key-loss checks passed. Database V1.5 remains unchanged. The independent same-Owner Account A/Account B runtime isolation case could not be created because the locked V1.5 `accounts.owner_id` uniqueness permits one Admin Account per Owner; the runtime report keeps P1-6 partial until this model/test expectation is reconciled. Document upload replay remains excluded.

### Account-model reconciliation — 2026-10-12

V1 business invariant: each Owner has exactly one Admin Account; multi-admin, staff and delegated-admin are outside V1. Database V1.5 `accounts.owner_id UNIQUE` enforces at most one Admin Account per Owner, and the approved V1 provisioning/product model maintains one account for each Owner. The idempotency design remains scoped by `owner_id + account_id + operation_scope + idempotency_key_hash`; Account ID also remains in replay lookup and response AAD. Cross-Owner isolation remains a required runtime-tested case. A same-Owner/two-Admin isolation fixture is **N/A FOR V1 BY DATA MODEL INVARIANT**, rather than a skipped applicable test. If multi-admin is approved later, that isolation test becomes mandatory before release. The prior partial runtime report is retained as historical evidence of its status before this reconciliation; see [`CONTRACT_P1_6_ACCOUNT_MODEL_RECONCILIATION_REPORT.md`](CONTRACT_P1_6_ACCOUNT_MODEL_RECONCILIATION_REPORT.md) for the superseding status decision. No historical design/runtime evidence is rewritten.

## 24. Validation performed in this design pass

- Source, current model relations, route key validation, API contract, migration conventions and documentation placement were inspected.
- No database/SQL command, migration, seed, Prisma command, Contract E2E, or runtime mutation was run.
- No file except this design report and `docs/DOCUMENT_CATALOG.md` was changed.
