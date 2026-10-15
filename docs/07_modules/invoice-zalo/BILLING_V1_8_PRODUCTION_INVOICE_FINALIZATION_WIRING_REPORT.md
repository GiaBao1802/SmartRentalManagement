# Billing V1.8 Production Invoice Finalization Wiring Report

**Date:** 2026-10-14  
**Status:** PARTIAL — production source wired; route-level PostgreSQL verification pending  
**Scope:** Backend Invoice finalization wiring only

## 1. Scope and source of truth

Followed `AGENTS.md`, `docs/DOCUMENTATION_RULES.md`, `docs/00_CURRENT_STATE.md`, `docs/DOCUMENT_CATALOG.md`, the canonical Requirement/API/Database documents, and the listed Billing/V1.8 reports. Database V1.8 remains the locked local/development baseline. This task made no database or Prisma change.

## 2. State before this task

`backend/src/app.ts` supplied `UnconfiguredInvoicePricing` to the existing V1 Invoice router. The router and transactional itemized repository implementation already existed. The earlier V1.8 integration report recorded 138/138 Invoice checks, including repository-level PostgreSQL finalization, recurring Parking, snapshots, charge consumption, retries and rollback.

## 3. Files changed

- `backend/src/app.ts`
- `backend/src/invoices/invoice.repository.ts`
- `backend/src/invoices/invoice.routes.ts`
- `backend/src/invoices/invoice.repository.test.ts`
- `backend/src/invoices/invoice.routes.test.ts`
- `backend/src/invoices/invoice-itemized.postgres.integration.test.ts`
- `docs/00_CURRENT_STATE.md`
- `docs/DOCUMENT_CATALOG.md`
- this report

## 4. Production wiring and preserved API

Production now constructs `PrismaItemizedInvoicePricing` and passes it to the same `PrismaInvoiceRepository` and V1 router. No duplicate finalize path was created.

The canonical route remains `POST /api/v1/invoices/{invoice_id}/finalize`. Method, path, request allowlist, required `Idempotency-Key` header, role, response DTO and error envelope are unchanged. No API Spec update was needed.

## 5. Authorization and transaction behavior

The route still requires an authenticated Admin. The Owner ID comes from session context; clients cannot supply Owner authority. The repository reads the Invoice under that Owner, loads its Contract/Room/Property context and returns the canonical not-found result for an out-of-scope Invoice. Database V1.8 tenant and source constraints remain authoritative.

The existing serializable transaction and Invoice `FOR UPDATE` lock remain in place. It re-reads and validates draft/`NOT_FINALIZED` state, resolves server-side pricing and meter continuity, validates readings, then persists meter readings, opening/ending snapshots, item lines and electricity tiers, consumes Flexible charges, reconciles the amount buckets, and sets `ITEMIZED`, `unpaid`, `finalized_at` and due date before commit. Missing inputs/prices remain fail-closed. Legacy finalized aggregate invoices are not re-itemized.

Serialization failures (`P2034`) are retried up to two times after the first attempt. A concurrent loser then re-reads the committed Invoice and receives `INVOICE_ALREADY_FINALIZED`, without writing duplicate rows. Unique Invoice-period conflicts retain `INVOICE_PERIOD_CONFLICT`; other unique-source conflicts return a generic safe `409 CONFLICT` rather than being mislabeled as a duplicate Invoice period.

The existing post-commit Zalo hook remains best-effort. No real Zalo delivery or Payment behavior was added.

## 6. Tests and validation

- `npm run test:invoices --workspace=@goctro/backend`: **139 passed, 0 failed, 1 skipped**.
- Route unit tests passed for Admin-only access, idempotency header validation, post-finalize Zalo ordering, and safe uniqueness-error mapping.
- Repository test passed for retrying a serialization conflict and returning the committed finalized-state conflict.
- The PostgreSQL integration test now contains an HTTP request through the V1 router, CSRF/session authentication, production repository/pricing adapter, database persistence assertions, Resident denial, Owner-scoped not-found, concurrent finalization, duplicate Parking rejection, invalid readings, missing pricing, and an injected database-trigger rollback case.
- **That route-level PostgreSQL integration did not run:** `GOCTRO_V18_REHEARSAL_DATABASE_URL` was unset and `127.0.0.1:55432` was not listening. The test was skipped. No migration, schema SQL, seed, or write to `Goctro_test3` was attempted.
- `npm run typecheck --workspace=@goctro/backend`: **FAIL, 174 existing diagnostics** — 173 legacy errors in unrelated portions of `backend/src/app.ts`, and one in `backend/src/residents/resident.test.ts`. There are no TypeScript diagnostics in the Invoice files or at the changed app wiring lines.

## 7. Admin browser workflow

The Admin Invoice page is still a read-only list. It has no detail screen, draft meter input/edit control, finalize action, or finalized itemized breakdown. No frontend changes were made, and no browser finalize flow could be exercised.

## 8. Database and completion status

- Database/Prisma/schema/migration/seed: **unchanged**.
- Payment and production Zalo delivery: **not implemented**.
- Production source uses the itemized finalization path: **YES**.
- Full task PASS / production readiness: **NO**. The required HTTP-to-PostgreSQL production-route integration remains unverified; successful repository-level integration from the previous V1.8 task is not a substitute for this route-level gate.

## 9. Remaining blocker and next task

Provide or restore the dedicated disposable Database V1.8 rehearsal target and run this route-level PostgreSQL integration, including persistence and rollback assertions. Do not use the populated `Goctro_test3` target or run migrations/seeds for this verification. After the route-level gate passes, review the Admin Invoice detail, meter-edit, finalize and itemized-breakdown UX before considering Payment.
