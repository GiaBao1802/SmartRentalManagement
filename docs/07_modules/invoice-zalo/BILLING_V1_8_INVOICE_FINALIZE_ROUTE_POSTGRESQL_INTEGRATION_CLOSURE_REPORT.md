# Billing V1.8 Invoice Finalize Route PostgreSQL Integration Closure

**Date:** 2026-10-14  
**Status:** ROUTE-LEVEL POSTGRESQL VERIFICATION — PASS  
**Scope:** Disposable Database V1.8 rehearsal and authenticated HTTP-to-PostgreSQL Invoice finalization verification. No production database was used.

## 1. Scope and sources

Read the repository governance and checkpoint, canonical Requirement/API/Database sources, V1.8 implementation report, and production finalization wiring report. The verification exercised the existing `POST /api/v1/invoices/{invoice_id}/finalize` route through the actual V1 router, CSRF middleware, authenticated session, production `PrismaInvoiceRepository`, `PrismaItemizedInvoicePricing`, and PostgreSQL 18.

No Requirement, API contract, database schema, migration, Prisma model, frontend, Payment flow, or Zalo provider behavior was changed.

## Files modified

- `backend/src/invoices/invoice.repository.ts` — narrowly retry PostgreSQL serialization error `P2010` only when metadata SQLSTATE is `40001`, alongside existing Prisma `P2034` retry.
- `backend/src/invoices/invoice.repository.test.ts` — cover both serialization error representations.
- `backend/src/invoices/invoice-itemized.postgres.integration.test.ts` — real HTTP CSRF route, due-date/persistence checks, missing/invalid auth checks, conflict and rollback assertions.
- `docs/00_CURRENT_STATE.md` and `docs/DOCUMENT_CATALOG.md` — mark route verification closed and record the next task.
- This report.

## 2. Rehearsal target and safety

| Field | Verified value |
|---|---|
| Host | `127.0.0.1` |
| Port | `55432` |
| Database | `goctro_v18_rehearsal` |
| PostgreSQL | `18.6` |
| Public tables after install | `40` |

This was a newly initialized disposable PostgreSQL cluster and database. `GOCTRO_V18_REHEARSAL_DATABASE_URL` was set only in the test process and pointed to this target. No connection was made to `Goctro_test3`; no operation, including a read, was run against it.

## 3. V1.8 installation and validation

- `Database V1.8/schema.sql`: PASS on the empty rehearsal database.
- Synthetic `Database V1.8/seed.sql`: PASS; no user data was copied. It emitted a non-fatal nested-transaction warning from the appended synthetic V1.7 fixture section; the script completed and committed successfully.
- CORE runtime validator: **78/78 PASS, 0 failed**.
- Inherited seed fixture validator: **171/171 PASS, 0 failed**. Its legacy summary label says V1.7 because it is the inherited fixture suite; it ran against the V1.8 schema and seed.
- Validator probes ran in rollback-only transactions.

## 4. HTTP route and authorization

The integration test called the real `GET /api/v1/auth/csrf` route, retained a test session in the in-memory session store, then sent HTTP requests through the production V1 router to the Invoice finalize endpoint. The test server used the real PostgreSQL-backed auth and Invoice repositories.

- Active Admin in the matching Owner scope: finalize succeeded (`200`).
- Missing session: rejected (`401`).
- Invalid CSRF token: rejected (`403`).
- Resident attempting Admin finalization: rejected (`403`).
- Missing/out-of-scope Invoice under the Admin Owner: returned the canonical not-found response (`404`); the seeded foreign-Owner case was also checked.

## 5. Finalization and persistence

The successful request persisted an Invoice with `status=unpaid`, `snapshot_kind=ITEMIZED`, and `finalized_at`. The API and database `due_date` matched the approved five-calendar-day rule in `Asia/Ho_Chi_Minh`.

Persisted rows included Rent (1), Electricity (1) with three tier rows, Water (1), Fixed Service (3), Flexible Service (1), and recurring Parking (1). Four meter snapshots were written, including the prior finalized Invoice as the opening source and new ending readings. Rent, utility, service, and total aggregates each reconciled to the itemized lines; total equaled the sum of rounded lines. The Flexible charge became `INVOICED` and linked to the finalized Invoice. The recurring Parking assignment was linked on the later eligible period.

Repeating finalization returned `409 INVOICE_ALREADY_FINALIZED` and created no duplicate item lines, meter snapshots, or Flexible line/consumption. A second Invoice could use the recurring Parking assignment in its own period, while the V1.8 partial unique rule rejected two Parking lines for the same assignment on one Invoice; the route returned a safe `409 CONFLICT`.

## 6. Retry, concurrency, and fail-closed behavior

The first runtime run found a real concurrency defect: PostgreSQL returned SQLSTATE `40001` for the losing `SELECT ... FOR UPDATE`; Prisma represented that raw-query error as `P2010`, while the retry path only recognized `P2034`. The losing request consequently returned `500` instead of the canonical finalized conflict.

The production retry condition now handles `P2010` only when its PostgreSQL metadata code is exactly `40001`, in addition to Prisma `P2034`. It does not retry unrelated raw-query errors. Unit coverage verifies both error representations. On the clean rerun, simultaneous finalization returned exactly one `200` and one `409 INVOICE_ALREADY_FINALIZED`, with one set of itemized rows and one set of four meter snapshots.

Fail-closed cases verified:

- Ending meter reading lower than the opening reading: `400`; Invoice remains `draft / NOT_FINALIZED`.
- Unresolved/missing pricing configuration: `409 INVOICE_DATA_INCOMPLETE`; Invoice remains `draft / NOT_FINALIZED`.
- Flexible charge claimed during pricing/finalization: `409 INVOICE_DATA_INCOMPLETE`; transaction rollback left the Invoice draft, left no invoice items, tier rows, or meter snapshots, and restored the charge to `READY / unlinked`.
- Injected PostgreSQL trigger failure after transactional writes began: safe `500`; Invoice remained draft, no invoice items, electricity tiers, meter snapshots or ending meter readings remained, and the Flexible charge remained `READY / unlinked`.

## 7. Automated checks

- V1.8 CORE validator: **78/78 PASS**.
- V1.8 clean-install fixture validator: **171/171 PASS**.
- Route-level PostgreSQL integration: **PASS**, including success, scope/auth, retry, concurrency, Parking uniqueness, fail-closed, and atomic rollback assertions.
- `npm run test:invoices --workspace=@goctro/backend`: **140 passed, 0 failed, 0 skipped**.
- Focused repository tests: **15 passed, 0 failed**.
- Backend typecheck: **FAIL with 174 existing legacy diagnostics** — 173 in legacy sections of `backend/src/app.ts`, and 1 in `backend/src/residents/resident.test.ts`. The invoice integration/repository files changed for this closure produced no typecheck diagnostics.

## 8. Cleanup and final state

After logs and this report were saved, the disposable database and PostgreSQL cluster were stopped and deleted. `Goctro_test3` was not modified or used.

- Database/Prisma V1.8: unchanged.
- Billing production finalize route: **route-level PostgreSQL verification closed**.
- Billing Admin workflow: still incomplete; Admin Invoice has no detail/meter-edit/finalize/itemized-breakdown UX.
- Payment: not started.
- Zalo provider delivery: remains unconfigured and best-effort behavior remains unchanged.

**Exact next task:** Admin Invoice detail + draft meter edit + finalize UX + itemized breakdown.
