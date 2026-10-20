# Contract Business Rule Alignment + P1 Fix Pass

**Date:** 2026-10-12 (status reconciled 2026-10-12)  
**Scope:** Approved Contract business decisions, P1 fixes, canonical Requirement/API alignment, automated regression. Full authenticated browser E2E closure was intentionally not run.  
**Database safety:** Database V1.5 schema/Prisma/migrations/seed were not modified. Runtime validation used a disposable PostgreSQL 18 database created from the locked schema and synthetic V1.4 seed, then dropped. Goctro_test3 was not changed.

## 1. Executive summary

P1-1 through P1-5 remain implemented and covered by backend tests. Contract durable replay is implemented for create, activate, renew and terminate on Database V1.5. PostgreSQL 18 runtime evidence passed concurrency, restart/re-instantiation replay and rollback checks. Following the approved V1 account-model decision, P1-6 is **PASS**: cross-Owner isolation is runtime-tested and PASS; same-Owner multi-Admin isolation is **N/A FOR V1 BY DATA MODEL INVARIANT** because V1 has one Admin Account per Owner. Runtime and DB continue to scope idempotency by both Owner and Account.

Automated results: Contract **132/132 PASS**, real PostgreSQL Contract runtime scenario **PASS** (one integration test covering concurrency/replay assertions), Auth **20/20 PASS**, Property/Room **44/44 PASS**, Resident/Occupancy **49/49 PASS**, Invoice **36/36 PASS**, Room Images **21/21 PASS**. Backend typecheck/build remain blocked by **174 existing TypeScript diagnostics** in legacy `backend/src/app.ts` and `residents/resident.test.ts`; no diagnostic points to changed Contract/idempotency files. Frontend API tests/typecheck/build results are in the runtime report. Full authenticated Contract HTTP/browser E2E was not run by scope.

**Current reconciled status:** CONTRACT BUSINESS REQUIREMENTS — **ALL P1 ALIGNED**. P1-1 through P1-5 retain their PASS evidence; P1-6 is PASS under the approved V1 account invariant. Authenticated Admin/Resident browser E2E remains pending, so the Contract module is not fully locked. The earlier partial status recorded below is historical and is superseded only as a status decision by [`CONTRACT_P1_6_ACCOUNT_MODEL_RECONCILIATION_REPORT.md`](CONTRACT_P1_6_ACCOUNT_MODEL_RECONCILIATION_REPORT.md); its runtime evidence is preserved.

## 2. Approved business decisions

- Active `resident_capacity` remains a Contract snapshot and can change only as an audited amendment with reason, current revision, history, and occupancy/parking guards. Room default capacity remains independent.
- Contract business date is `Asia/Ho_Chi_Minh`; future termination is rejected.
- Successor utility baselines never fall back to predecessor original initial readings. Electricity and water resolve independently before activation.
- Expiry is a persisted `active → expired` transition after the contractual end date, with one revision/history event and dependent parking/amenity closure.
- Contract termination recomputes every affected Resident's `residence_status` from all Owner-scoped active Occupancies in the same transaction.
- **Historical pre-V1.5 decision:** durable idempotency required a database change because no suitable table existed. Database V1.5 is now LOCKED and the durable runtime is implemented; current P1-6 status is PASS after account-model reconciliation.

## 3. Authority and sources

- `docs/01_REQUIREMENTS.md` and `docs/04_API_SPEC.md` in SmartRentalManagement (canonical product/API sources; updated only for these approved rules).
- `SmartRentalManagement/docs/DOCUMENTATION_RULES.md`, `docs/DOCUMENT_CATALOG.md`, and `docs/07_modules/contract/CONTRACT_BUSINESS_REQUIREMENT_AUDIT.md`.
- Contract frontend/API migration reports, Contract V1.3 migration and Resident successor privacy reports, latest Contract API hardening report, and Resident/Occupancy API hardening report.
- `database/schema.prisma`; current Contract repository, routes, validators and tests; Resident/Occupancy, Property/Room, Invoice reading fields/repository; Admin and Resident Contract UI; current API/idempotency helpers.

Canonical Requirement determines product intent. API Spec documents the request/response interface. Newly approved decisions in this pass resolve the listed Contract ambiguities. Backend remains the authority for enforcement; frontend presents the workflow.

## 4. Contract lifecycle after alignment

`draft/revision 0 → active/revision 1 → expired/revision N+1` when Vietnam business date is after `end_date`; active Contract termination remains a separate `active → terminated` transition. Expiry synchronization locks each candidate Contract, rechecks it after the lock, updates status/revision/history and ends linked parking/amenity state in one transaction. Repeated reads do not create duplicate events. `end_date` itself remains active. A terminated Contract is never changed to expired.

## 5. P1-1 — Contract code lookup

Added `contract_no` to the Owner-scoped list filter. Backend trims and validates it, performs case-insensitive partial matching, and composes it with Property, Room, Resident, status and pagination filters. Admin UI adds a Contract code search input and preserves pagination/filter state. It does not substitute Property-name search.

Tests cover trimmed filter parsing, partial/case-insensitive repository predicate, Owner scope, status/Room composition and pagination; frontend helper test confirms query serialization.

**Result: PASS by source and automated tests. Authenticated HTTP query was not exercised.**

## 6. P1-2 — Expired transition

Added `syncExpired(ownerId, actorId)` and invoke it from authenticated Contract list/detail, Resident self-list, history lookup, and lifecycle pre-read paths. It uses a Vietnam-local business date; an `end_date` equal to today remains active. Each candidate is transitioned under a row lock and `ReadCommitted` transaction, then history and dependent parking/amenity updates commit atomically. Repeated/concurrent readers recheck persisted status after acquiring the lock, preventing duplicate revision/history.

Tests cover day-after expiry, still-active end-date boundary, timezone rollover, and repeated synchronization producing one status/revision/history result and one dependent-closure set.

**Result: PASS by repository tests. Live authenticated transition was not run.**

## 7. P1-3 — Future termination

Repository validation now compares the supplied SQL date to the current date in `Asia/Ho_Chi_Minh` and rejects future dates with `400 VALIDATION_ERROR` and “Ngày chấm dứt không được lớn hơn ngày hiện tại.” The Admin date input's maximum is the earlier of the Contract end date and Vietnam business today; submit validation repeats the check. Termination still validates `start_date ≤ termination_date ≤ end_date`.

Tests cover future rejection, today's date, past-date success, before-start rejection and after-end rejection.

**Result: PASS by repository/frontend tests.**

## 8. P1-4 — Resident status recomputation on termination

Termination first identifies linked active Occupancies that it will end. After those updates, it independently queries remaining active Occupancies for each affected Resident across all Rooms/Contracts and sets `living` if any remain, otherwise `left`, before the same transaction commits. It does not update unrelated Residents or blindly mark every affected Resident left.

Tests cover last Occupancy → left, another Occupancy → living, independent results for multiple Residents, unrelated records remaining untouched, and a simulated later transaction failure rolling back Contract, Occupancy, Resident status and history changes.

**Result: PASS by repository tests; no live DB mutation was performed.**

## 9. P1-5 — Renewal meter baseline

Renewal no longer copies `predecessor.initial_electric_kwh` or `initial_water_m3`. A new draft may retain `null` where no new reading is known. On activation, electricity and water are resolved independently in this order: predecessor final/closing reading; latest finalized predecessor Invoice current reading whose period ends at/before the predecessor boundary; explicit Admin value on the successor draft. No original predecessor initial value is used as a fallback. If either value remains unresolved, activation returns `409 CONTRACT_SUCCESSOR_METER_BASELINE_UNRESOLVED`; resolved readings are saved and included in activation history.

Admin renewal/edit screens identify “Chỉ số đầu kỳ của hợp đồng mới”, explain where readings come from, and map the deterministic activation error to actionable Vietnamese text.

Tests cover finalized Invoice fallback, utility-by-utility explicit fallback, no stale clone, and activation baseline history. Invoice code was read only; it was not modified.

**Result: PASS by source and automated tests. Live billing/activation was not run.**

## 10. P1-6 — Durable idempotency

**Historical audit/design snapshot:** The original audit below was written before Database V1.5 was approved and migrated. Its V1.4 blocker/proposal is retained as history; current implementation and validation status follow it and are authoritative for this pass.

Audit confirmed Contract routes only validate the `Idempotency-Key`; Prisma V1.4 has no durable idempotency model/table. `event_outbox` cannot provide exact request fingerprint, same-key conflict, persisted success replay and transactional mutation semantics. No process-memory cache or schema workaround was added.

### Proposed additive table: `contract_idempotency_requests`

- `request_id bigint` primary key; `owner_id bigint` and `account_id bigint` required, with composite foreign key to the authenticated account/Owner; `operation_scope varchar(200)` identifies method, canonical route and resource ID; `idempotency_key varchar(128)`; `request_fingerprint char(64)`; `state varchar(16)` constrained to `in_progress|completed`; `response_status smallint`; `response_ciphertext bytea` plus key-version metadata for safe response replay; `created_at`, `completed_at`.
- Unique key: `(owner_id, account_id, operation_scope, idempotency_key)`. Add an expiry/cleanup index only if a separately approved retention period is adopted. Proposed default retention is **no automatic deletion** so a key cannot become reusable after process restart/time; any later retention/cleanup rule requires explicit approval and must define the replay guarantee window.
- Fingerprint canonical method/path scope plus the normalized allowlisted request payload; never persist raw password/session/secrets. Encrypt replay response snapshots at application level because Contract DTOs can contain personal data; restrict read access to the backend transaction path.
- In the same DB transaction as the Contract mutation, insert/lock the unique request row, compare fingerprints, perform the mutation, serialize safe success status/body, mark completed, and commit together. Same fingerprint replays the stored success; different fingerprint deterministically conflicts. Unique-key contention plus row lock serializes concurrent duplicates. Validation failures before mutation are not recorded as completed successes. Document upload must use a request-scoped staging key and cleanup/reconciliation around its external object-store side effect.
- Required follow-on: approve a Database V1.5 (or next version) change request, design SQL/ERD/Prisma/migration, validate concurrency and restart replay, then implement Contract commands. Keep Database V1.4 LOCK current until that version passes full validation.

**Historical P1-6 result:** blocked pending Database V1.5 approval; that database proposal is now implemented and locked. See the current runtime implementation report for current behavior and evidence.

**Current runtime status:** Contract create, activate, renew and terminate persist a SHA-256 key digest, versioned request fingerprint and AES-256-GCM encrypted safe success response in `contract_idempotency_requests`. Mutation, Contract history/dependent lifecycle effects and completed replay row share one Prisma transaction. Same fingerprint replays status/body, a different fingerprint returns `409 IDEMPOTENCY_KEY_REUSED`; incomplete/key-loss/decryption failures fail closed. Real PostgreSQL 18 tests verified duplicate create/activate/renew/terminate requests, one mutation/history/successor, re-instantiated replay, Owner separation, payload conflicts and rollback. Document upload remains explicitly excluded.

**Historical account-isolation limitation (reconciled):** V1.5 `accounts.owner_id` is unique. The approved V1 product invariant is one Owner = one Admin Account, so a same-Owner Account A vs Account B scenario is not a valid V1 state and is N/A, not a skipped applicable test. Cross-Owner isolation is required and was runtime-tested PASS. The runtime namespace, lookup and AAD remain Account-aware. See the reconciliation report for current decision; no Database V1.5 change was made.

## 11. Active `resident_capacity` amendment

Existing backend active PATCH already requires `change_reason` and `If-Match`, increments revision and writes history for a real change. Its capacity check separately prevents proposed capacity below active Occupancy count or active parking assignment count. Frontend now explains the amendment/history and guards, and explicitly says Room default is not changed. Added test verifies a valid active amendment produces one new revision/history; existing test verifies a decrease below occupancy is rejected.

**Result: PASS.**

## 12. API and canonical documentation changes

- Requirement now states code lookup, Vietnam Contract business date, expiry transition, no future termination, termination Resident recomputation, successor baseline order, active capacity amendment, and durable idempotency requirements. Current account cardinality and test applicability are recorded in the reconciliation report.
- API Spec §5.7 defines `contract_no`, expiry/read-side synchronization and dependent lifecycle handling, capacity amendments, meter baseline resolution/error, future termination validation, Resident recomputation, and durable replay behavior. This report's original pre-runtime blocker wording is historical; the API version and endpoint/request/response shapes are unchanged.
- Database authority/lock wording was not changed.

## 13. Backend changes

Changed Contract validator/query/repository/routes and Contract tests. Added the Vietnam business-date helper. No Invoice repository, Auth, Resident, Property/Room business logic, schema, Prisma or migration was edited.

## 14. Frontend changes

Added Contract code filter serialization/UI; Vietnam date handling and a max date for termination; renewal baseline wording and field labels; active capacity amendment guidance; safe UI mapping for unresolved successor baseline. No screen redesign or unrelated UI changes.

## 15. Database/schema impact

**Historical database status at the time of the original P1 fix pass:** V1.4 was LOCK and the idempotency table was still a proposal. The subsequent V1.5 migration report records physical implementation and validation. In the current account-model reconciliation pass, Database V1.5/schema/Prisma/migration/seed were not changed.

## 16. Automated test results

| Suite | Result |
|---|---:|
| Contract API/repository/validation/document | **125/125 PASS** |
| Auth | **20/20 PASS** |
| Property/Room | **44/44 PASS** |
| Resident/Occupancy | **49/49 PASS** |
| Invoice/Zalo (read-only dependency regression) | **36/36 PASS** |
| Frontend API/workflow tests | **26/26 PASS** |
| Frontend typecheck | **PASS** |
| Frontend production build | **PASS** |
| Backend full-project typecheck | **FAIL: 174 existing diagnostics**; legacy `backend/src/app.ts` plus one `backend/src/residents/resident.test.ts` diagnostic. Changed `backend/src/contracts/*` and `backend/src/contract-documents/*` produced **0** diagnostics. |

Initial sandboxed loopback tests/build were denied by Windows permissions. Reruns with the required local execution permission passed; this was an environment restriction, not a test assertion failure.

## 17. Runtime/API verification

- `GET http://localhost:4000/api/health` — **200**.
- `GET http://localhost:4000/api/health/db` — **200**, PostgreSQL health check.
- `GET http://localhost:4000/api/v1/auth/csrf` — **200**.
- Unauthenticated `GET http://localhost:4000/api/v1/contracts` — **401**, expected authorization response.
- Authenticated Admin business requests and disposable Contract mutations were **NOT VERIFIED**: no Admin session was available to this pass. No auth bypass or DB fixture was created. Contract correctness evidence is the automated route/repository tests above.
- Full authenticated browser E2E closure was not run, as directed.

## 18. Remaining P2

Remaining for later: (1) deposit-deduction evidence/policy; (2) occupancy follow-up CTA after activation; (3) Property/Room context on Resident Contract cards; (4) archived Property draft UX; (5) production object storage/multipart configuration remains an existing integration item. The `expiring_before` inclusive-boundary label was corrected in this pass. The other items were not directly necessary to fix P1.

## 19. Remaining blockers

1. Full backend typecheck cannot pass until the existing legacy type errors are addressed in a separate backend-foundation task.
2. Authenticated live Contract API mutation verification and browser E2E remain outstanding; no Admin session was available.

## 20. E2E readiness decision

**CONTRACT BUSINESS REQUIREMENTS — ✅ ALL P1 ALIGNED; P1-6 PASS. CONTRACT MODULE FULL LOCK — PENDING authenticated Admin/Resident E2E closure.** P2 items are not claimed complete.

## 21. Recommended next task

Run **CONTRACT AUTHENTICATED ADMIN + RESIDENT E2E CLOSURE**. Track backend-wide legacy typecheck cleanup separately. Multi-admin is not part of V1; if proposed later, it requires approved business, permission/Auth/Account, database migration, security and E2E review, including same-Owner Account isolation.
