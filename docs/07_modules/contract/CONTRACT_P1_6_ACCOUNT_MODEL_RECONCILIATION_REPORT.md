# Góc Trọ — Contract P1-6 Account Model Reconciliation Report

**Date:** 2026-10-12  
**Status:** **P1-6 PASS; Contract Business P1 ALL ALIGNED; authenticated Admin/Resident E2E PENDING**  
**Scope:** Reconcile the V1 account invariant with Contract durable-idempotency isolation requirements. Documentation only; no runtime/database changes.

## 1. Executive summary

The approved V1 business model is **one Owner = one Admin Account**. Database V1.5 remains LOCKED, PostgreSQL 18.6, 28 public tables, with schema/seed/runtime validator 90/90 PASS and Prisma validate/generate PASS. Its unique constraint on `accounts.owner_id` enforces at most one Admin Account per Owner; the V1 product invariant and account provisioning model require the one Admin Account for each Owner. V1 has no multi-admin, staff, delegated-admin or super-admin support.

The prior P1-6 partial result treated same-Owner Account A/Account B as an applicable runtime test. Under the approved V1 invariant, that state is invalid, so this scenario is **N/A FOR V1 BY DATA MODEL INVARIANT**, not a skipped applicable test. Cross-Owner isolation remains required and already passed runtime validation. The implementation continues to use Account ID throughout its idempotency namespace, replay lookup and encrypted-response AAD. P1-6 is therefore **PASS for all applicable V1 requirements**. Contract authenticated Admin/Resident E2E is still pending; the Contract module is not fully locked.

## 2. Prior P1-6 partial reason

The [`CONTRACT_DURABLE_IDEMPOTENCY_RUNTIME_IMPLEMENTATION_REPORT.md`](CONTRACT_DURABLE_IDEMPOTENCY_RUNTIME_IMPLEMENTATION_REPORT.md) accurately recorded P1-6 as PARTIAL at the time: its test matrix expected two Admin Accounts under one Owner, but V1.5 `accounts.owner_id UNIQUE` did not permit that fixture. This report supersedes that report's **status decision only**. It does not alter or replace the runtime evidence in the prior report.

## 3. Verified V1 account invariant

Read-only source review confirmed:

- `Database V1.5/schema.sql` defines `accounts.owner_id bigint UNIQUE REFERENCES owners(owner_id)` and constrains Admin rows to have `owner_id` and no `resident_id`.
- `database/schema.prisma` maps `Account.ownerId` as nullable `BigInt` with `@unique`.
- Canonical Requirement identifies Owner as the Admin authority and now states the exact one-Owner/one-Admin V1 invariant.
- Canonical API Spec states the V1 Admin authority and prohibits the Admin account-status flow from creating another Admin. The V1 router exposes Auth and domain routers, with no Admin-account creation/provisioning route.
- Auth resolves Admin authority from the authenticated Account's server-side Owner relation; client-supplied Owner or role fields are rejected as authority inputs.

The physical unique constraint proves **at most one** Admin Account row per Owner. “Exactly one” is the approved V1 product/provisioning invariant; it is not a SQL guarantee that an Owner can never temporarily exist without an account during provisioning.

## 4. Formal V1 business decision

- Each Owner has exactly one Admin Account in the V1 product model; that authenticated Account is the authority for its Owner.
- Multiple Admin Accounts under one Owner are not supported in V1.
- Staff, delegated Admin and super-admin are not supported in V1.
- A future multi-admin model requires an approved business requirement, permission-model audit, Auth/Account design, a new database version and migration, security review, and new E2E coverage.
- Multi-admin support must not be inferred or introduced by weakening the current rule.

## 5. P1-6 isolation-test reconciliation

| Scenario | V1 status | Evidence / disposition |
|---|---|---|
| Same raw key under Owner A and Owner B | **REQUIRED — PASS** | PostgreSQL 18 runtime test proved independent Owner-scoped Contract creation/replay. |
| Same Owner, Account A vs Account B | **N/A FOR V1 BY DATA MODEL INVARIANT** | V1 supports one Admin Account per Owner; a second same-Owner Admin fixture is not a valid V1 state. This is not a skipped applicable test. |

If multi-admin becomes an approved future feature, same-Owner Account isolation becomes mandatory test coverage before that release.

## 6. Account ID remains in idempotency design

Account ID remains present in:

- unique namespace: `(owner_id, account_id, operation_scope, idempotency_key_hash)`;
- replay lookup predicate;
- runtime command context;
- response encryption AAD, alongside request, Owner, operation, key digest and fingerprint.

This is harmless under V1's one-Account cardinality, binds a replay to the initiating authenticated identity, and is forward-compatible. The design is not changed to Owner-only scope.

## 7. Security interpretation

The effective isolation layers remain:

1. authenticated Account;
2. Owner derived from the server session;
3. resource authorization in that Owner's scope;
4. idempotency namespace scoped by Owner, Account, operation and key digest;
5. encrypted response AAD bound to Owner and Account as well as request/operation/fingerprint context.

No valid V1 state can contain two Admin Accounts under one Owner, so cross-Account replay inside an Owner cannot occur under this model. Cross-Owner isolation is still independently required and runtime-tested PASS. No client-supplied Owner or Account is trusted for scope.

## 8. Requirement/API updates

- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`: §2.1 and §5 now state one Owner = one Admin Account, defer multi-admin/staff/delegated-admin, and require a future approval/design/security/E2E process. Contract idempotency requirements preserve Owner + Account scope, require cross-Owner testing, and classify same-Owner multi-Admin isolation as N/A for V1 and mandatory if multi-admin is later approved.
- `GocTro-SmartBuilding/docs/04_API_SPEC.md`: §2 authority and §5.7 implementation status now make the V1 cardinality and test disposition explicit. No endpoint, request, response, or API-version contract changed.

## 9. Database change status

**Database V1.5 changed: NO.** No `ALTER TABLE`, `DROP`, `CREATE INDEX`, migration, seed, validator, ERD or schema edit was made. V1.5 remains the current locked baseline: PostgreSQL 18.6, 28 public tables, schema PASS, seed PASS, runtime validator 90/90 PASS, Prisma validate/generate PASS.

## 10. Runtime code change status

**Runtime idempotency changed: NO.** No route, contract mutation, transaction, crypto, fingerprint, DTO, error behavior or runtime test was edited or rerun. Read-only inspection confirmed `account_id` remains in runtime insert/unique-conflict handling, replay SELECT predicate and AAD construction. The existing PostgreSQL runtime report already records the applicable cross-Owner isolation PASS and all create/activate/renew/terminate replay/concurrency/rollback/key-loss evidence.

## 11. P1-6 final decision

**CONTRACT P1-6 DURABLE IDEMPOTENCY — ✅ PASS.** Applicable V1 runtime/security requirements pass: create, activate, renew and terminate replay; same-key/same-payload; changed-payload 409; concurrent duplicate arbitration; restart/re-instantiation durability; cross-Owner isolation; rollback; encryption/key-loss fail-closed; and no raw idempotency key persistence. Same-Owner multi-Admin isolation is N/A under the approved account invariant. V1.5 remains unchanged and Account ID remains part of the implementation scope.

## 12. Contract Business P1 overall status

**CONTRACT BUSINESS REQUIREMENTS — ✅ ALL P1 ALIGNED.** P1-1 through P1-5 retain their prior PASS evidence. P1-6 is PASS after the account-model reconciliation. This status does not claim that P2 items are complete.

## 13. Remaining P2 / non-P1 items

The P1 fix report continues to track non-P1 work, including deposit-deduction evidence/policy, an occupancy follow-up action after activation, Property/Room context on Resident Contract cards, archived-Property draft UX, production object storage/multipart configuration, and backend-wide legacy typecheck diagnostics. These are not represented as complete by this P1-6 decision.

## 14. E2E readiness

Authenticated Admin/Resident Contract HTTP and browser E2E remains **PENDING**. Contract frontend migration/integration is recorded, but this reconciliation pass did not log in, execute Contract mutations over live HTTP, or run browser E2E. Thus:

- Contract backend/business P1: **ALIGNED**.
- Contract durable idempotency: **PASS**.
- Database V1.5: **LOCK**.
- Contract module full lock: **NO — authenticated Admin/Resident E2E pending**.

## 15. Exact next task

**CONTRACT AUTHENTICATED ADMIN + RESIDENT E2E CLOSURE.** Verify Admin and Resident login/session, Contract lifecycle and validation over real HTTP, replay, revision/history, successor and utility baseline, termination/expiry, Resident visibility/privacy, related Room/Occupancy state, persistence after refresh, and desktop/responsive UI behavior. Do not treat this reconciliation report as evidence that those interactions were already executed.

## Files modified

- `SmartRentalManagement/docs/07_modules/contract/CONTRACT_P1_6_ACCOUNT_MODEL_RECONCILIATION_REPORT.md` (new)
- `SmartRentalManagement/docs/07_modules/contract/DATABASE_V1_5_CONTRACT_IDEMPOTENCY_DESIGN.md` (status/reconciliation note)
- `SmartRentalManagement/docs/07_modules/contract/CONTRACT_BUSINESS_RULE_ALIGNMENT_P1_FIX_REPORT.md` (current P1 status and next task)
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md` (registered new report; preserved prior runtime report as historical evidence)
- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` (V1 Account invariant and idempotency test applicability)
- `GocTro-SmartBuilding/docs/04_API_SPEC.md` (authority and idempotency status clarification only)

No database, Prisma, migration, seed, validator, backend runtime or frontend file was modified.
