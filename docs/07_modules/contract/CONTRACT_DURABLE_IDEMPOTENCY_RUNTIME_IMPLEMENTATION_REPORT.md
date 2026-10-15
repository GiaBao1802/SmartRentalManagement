# Góc Trọ — Contract Durable Idempotency Runtime Implementation Report

**Date:** 2026-10-12  
**Scope:** Contract create, activate, renew and terminate durable replay. No full authenticated browser E2E, Invoice/Payment migration, or document-upload replay.  
**Status:** Runtime implementation and PostgreSQL concurrency: PASS. P1-6: **PARTIAL / NOT PASS** until same-Owner Account-isolation validation is reconciled with the locked account model.

## 1. Executive summary

Implemented durable, encrypted, transactional idempotency for Contract create/activate/renew/terminate against the Database V1.5 table. PostgreSQL 18 runtime tests verified duplicate concurrency, replay after service re-instantiation, key loss, payload conflict and rollback. The current database enforces one Admin Account per Owner (`accounts.owner_id UNIQUE`), so it is not possible to create the required same-Owner Account A/Account B fixture without changing the locked schema. The backend includes Account ID in the request namespace, lookup and AAD, but P1-6 is not marked PASS because that isolation scenario could not be runtime-tested.

Database V1.5 sources, Prisma, migrations, seed and Goctro_test3 were not changed. Tests used a uniquely named disposable PostgreSQL 18 database with 28 tables, V1.5 `schema.sql`, and synthetic V1.4 seed data; the database was dropped after the run.

## 2. Approved design and runtime architecture

Implementation follows [`DATABASE_V1_5_CONTRACT_IDEMPOTENCY_DESIGN.md`](DATABASE_V1_5_CONTRACT_IDEMPOTENCY_DESIGN.md). `ContractIdempotencyService` owns the database arbitration and replay algorithm. The four route handlers authenticate, validate active account and role, resolve Owner/Account from server session, scope the resource, validate body/header, then call the service. Client input never supplies Owner or Account authority.

Repository `create`, `activate`, `renew` and `terminate` accept the Prisma transaction client. The repository performs its mutation, Contract history, occupancy and lifecycle side effects on that client; the idempotency row and encrypted successful response use the same PostgreSQL transaction. The HTTP response is sent only after commit. Document upload still validates the header and remains outside durable replay because object storage is not in the PostgreSQL transaction.

## 3. Key hashing, fingerprint and encryption

- Raw `Idempotency-Key` is validated as visible ASCII, 1–128 characters, hashed with SHA-256, and never persisted or logged.
- Fingerprint v1 is SHA-256 over the version domain, method, canonical operation scope and deterministic canonical JSON of normalized semantic input. Object keys sort recursively; arrays keep order; omitted and null differ; BigInt IDs/money are decimal strings; dates normalize to `YYYY-MM-DD`; Prisma Decimal values use non-exponent canonical decimal strings. Renewal/termination include parsed `If-Match` revision.
- Successful JSON status/body is serialized after safe DTO construction and encrypted with AES-256-GCM. AAD binds request ID, Owner ID, Account ID, operation, key digest and request fingerprint. Only ciphertext, nonce, auth tag and key version are persisted.
- Key material comes from environment in local development (ignored `backend/.env`) and must come from deployment secret management/KMS in production. Historical key versions remain available for replay after rotation. Missing keys, unsupported versions or decrypt/integrity failures return generic `503 IDEMPOTENCY_REPLAY_UNAVAILABLE` and never rerun the mutation.
- There is no TTL/automatic cleanup. The stored success contains no cookie, CSRF token or arbitrary response headers.

## 4. Transaction, replay and error behavior

The service inserts `in_progress` with `ON CONFLICT DO NOTHING` against the V1.5 unique key `(owner_id, account_id, operation_scope, idempotency_key_hash)`. PostgreSQL uniqueness serializes concurrent requests. The first request runs the mutation, encrypts its safe result, marks the row completed and commits. A duplicate locks the committed row, compares using its stored fingerprint version and either decrypts/replays the original status/body or returns `409 IDEMPOTENCY_KEY_REUSED`. Incomplete committed rows fail closed. Whole-transaction retries are bounded to three attempts for `P2034`, SQLSTATE `40001` and `40P01`.

Authorization, active account/role, Owner scope and request validation execute before replay lookup. Create preflight checks only that Room and Resident references belong to the authenticated Owner; mutable business eligibility is rechecked inside the transaction. This allows a previously committed create to replay if a referenced Room or Resident later becomes inactive/archived.

## 5. Runtime results

| Scenario | Result/evidence |
|---|---|
| Create, same key/payload concurrently | PASS; both responses had same Contract ID/body; one Contract and one completed request row |
| Create, retry after service re-instantiation | PASS; exact status/body decrypted from PostgreSQL; Contract count unchanged |
| Same key, changed create payload | PASS; 409 `IDEMPOTENCY_KEY_REUSED`; no second Contract |
| Activate, concurrent duplicate | PASS; same response, revision 1 and one activation history event |
| Renew, concurrent duplicate | PASS; same successor ID, one direct successor, predecessor revision unchanged; changed dates with same key return 409 |
| Terminate, concurrent duplicate | PASS; one termination revision/history event, one Occupancy ended, Resident state recomputed; changed payload with same key returns 409 |
| Owner isolation | PASS; same raw key/operation under a different Owner and its authenticated Account created/replayed an independent Contract |
| Account isolation under the same Owner | **NOT TESTABLE under locked V1.5**; the schema's unique `accounts.owner_id` permits only one Admin Account for each Owner. Runtime SQL namespace, lookup and AAD include Account ID. No schema workaround was used. |
| Business mutation failure | PASS; inserted Contract and reservation both rolled back |
| Encryption key unavailable for new command | PASS; mutation and reservation rolled back |
| Historical key unavailable on replay | PASS; generic 503, no mutation rerun |
| Replay while active key is unavailable but historical key exists | PASS; original DB response replays |
| Response lost after commit / service restart | PASS by executing again with a newly instantiated service |
| Document upload replay | Excluded as approved; header validation remains |

The disposable database was created from locked V1.5 `schema.sql` and V1.4 synthetic seed, confirmed at 28 public tables and PostgreSQL 18, and dropped by the runner. `Goctro_test3` was not a test target and was not modified.

## 6. Code and tests

- New `backend/src/contracts/contract-idempotency.ts`: hashing, fingerprinting, AES-GCM, key provider and DB transaction/replay service.
- `backend/src/contracts/contract.repository.ts`: covered repository mutations can join the caller's transaction; Owner-only create reference preflight.
- `backend/src/contracts/contract.routes.ts`, `backend/src/auth/v1.router.ts`, `backend/src/app.ts`: covered route wiring and safe DTO persistence/replay.
- `backend/src/contracts/contract-idempotency.test.ts`: seven focused fingerprint/crypto/key tests.
- `backend/src/contracts/contract-idempotency.integration.test.ts`: real PostgreSQL lifecycle/concurrency/replay/rollback/Owner-scope scenario. `scripts/run-contract-idempotency-runtime.mjs` prepares and always drops a random disposable database.
- `frontend/src/lib/api/contractView.ts`: maps 409 `IDEMPOTENCY_KEY_REUSED` to “Yêu cầu này đã được sử dụng với dữ liệu khác. Vui lòng tải lại và thử lại.”

## 7. Validation and runtime API checks

| Check | Result |
|---|---|
| Contract suite | 132/132 PASS |
| Disposable PostgreSQL 18 runtime scenario | 1/1 PASS; covers create/activate/renew/terminate concurrency and rollback assertions above |
| Auth | 20/20 PASS |
| Property/Room | 44/44 PASS |
| Resident/Occupancy | 49/49 PASS |
| Invoice/Zalo | 36/36 PASS |
| Room Images | 21/21 PASS |
| Frontend typecheck | PASS |
| Frontend API tests | 26/26 PASS |
| Frontend production build | PASS |
| Backend typecheck/build | BLOCKED by 174 existing legacy Prisma diagnostics in `backend/src/app.ts` and `backend/src/residents/resident.test.ts`; zero diagnostics in changed Contract/idempotency files |
| Existing backend health | `/api/health` 200; `/api/health/db` 200; `/api/v1/auth/csrf` 200 |
| Authenticated Contract HTTP/browser E2E | NOT RUN; full Contract E2E is explicitly out of scope for this pass |

Initial sandbox runs of HTTP-backed regression tests/build were blocked by Windows loopback/path access. The same suites passed after rerunning with local workspace/loopback access. No password, encryption key or CSRF token is included in this report.

## 8. Database and API status

Database V1.5 schema/Prisma/seed/migration: **UNCHANGED**. Database V1.5 remains LOCK. Runtime rows were created only in and removed with the disposable test database.

Covered operations: `contracts.create`, `contracts.activate:<contract_id>`, `contracts.renew:<contract_id>`, `contracts.terminate:<contract_id>`. Payload conflict: HTTP 409 `IDEMPOTENCY_KEY_REUSED`. Replay unavailable: HTTP 503 `IDEMPOTENCY_REPLAY_UNAVAILABLE`. No endpoint or request/response contract shape changed. The API version remains 1.2. Upload and every other domain are outside this runtime implementation.

## 9. P1-6 and E2E decision

**CONTRACT P1-6 DURABLE IDEMPOTENCY: PARTIAL / NOT PASS.** All four command implementations and required PostgreSQL concurrency/re-instantiation cases passed. The required same-Owner Account A vs Account B isolation runtime case cannot be constructed because V1.5 has a unique Admin `owner_id`. Resolve whether one Admin per Owner is the accepted invariant (making independent Account test inapplicable) or an approved future account-model change is needed; do not modify V1.5 ad hoc.

**CONTRACT BUSINESS REQUIREMENTS — ALL P1 ALIGNED: NOT CLAIMED.** P1-1 through P1-5 retain their prior PASS evidence; P1-6 awaits the account-scope test/policy decision. Authenticated Admin/Resident Contract E2E remains pending and is not complete.

## 10. Exact next task

Reconcile the approved same-Owner Account-isolation test with Database V1.5's one-Admin-account-per-Owner invariant. After that decision, complete the separate authenticated Admin + Resident Contract E2E closure. Do not begin Payment or document-upload durable replay in this task.
