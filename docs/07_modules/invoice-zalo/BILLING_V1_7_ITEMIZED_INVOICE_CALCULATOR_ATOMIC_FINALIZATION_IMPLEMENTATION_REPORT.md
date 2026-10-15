# Billing V1.7 Itemized Invoice Calculator + Atomic Finalization

**Date:** 2026-10-13  
**Status:** PARTIAL — finalization remains fail-closed; blocked by a Database V1.7 constraint conflict.  
**Scope:** Invoice calculation and finalize transaction only. Payment, production Zalo delivery, frontend, and locked database changes are out of scope.

## 1. Scope and source baseline

Implemented a decimal-safe itemized pricing plan using the existing Utility Tariff, Meter Continuity, Fixed Service, Flexible Service, and Parking resolvers. Added persistence for meter readings/snapshots, line items/tier rows, atomic Flexible charge consumption, compatibility aggregates, and the `NOT_FINALIZED` → `ITEMIZED` / `draft` → `unpaid` transition.

Sources checked: canonical Requirement and API Spec, Database V1.7 changelog/artifacts, Current State, Catalog, and current Invoice resolver/finalize implementation.

## 2. State before work

- V1.7 Invoice resolvers existed, but `InvoicePricing` only returned aggregate amounts.
- `UnconfiguredInvoicePricing` was wired in `backend/src/app.ts`, so production finalization returned incomplete-data and stayed closed.
- No V1.7 item, Electricity tier, or meter snapshot persistence existed in the finalize path.
- Database V1.7 is locked; no schema/Prisma/migration change is permitted in this task.

## 3. Files changed

- `backend/src/invoices/invoice-itemized.calculator.ts` and `.test.ts`
- `backend/src/invoices/invoice-itemized.pricing.ts`
- `backend/src/invoices/invoice.repository.ts` and `.test.ts`
- `backend/src/invoices/invoice.routes.ts`
- `backend/src/invoices/invoice.pricing.ts`
- `backend/src/invoices/flexible-service-charge.repository.ts`
- `backend/src/invoices/invoice-itemized.postgres.integration.test.ts`
- `backend/package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/DOCUMENT_CATALOG.md`
- this report

`backend/src/app.ts` still wires `UnconfiguredInvoicePricing`. No public endpoint/DTO, business requirement, API Spec, Database V1.7 artifact, Prisma schema, migration, seed source, frontend, Payment, or Zalo provider was changed.

## 4. Calculator behavior implemented

- **Rent:** full Contract rent line; no final-period proration.
- **Electricity:** usage is ending less same-Contract opening meter; progressive tier quantities are kept to three decimals. Each tier amount is rounded half-up to whole VND; parent Electricity item is their sum and includes all tier snapshots, including zero-quantity tiers.
- **Water:** m³ usage times the period-start flat tariff; line amount is rounded half-up.
- **Fixed Service:** separate full-period line per resolved Property service; no proration.
- **Flexible Service:** separate line per eligible source charge, price resolved at `occurred_at`, line half-up rounding, and source amount must match the V1.7 charge snapshot. Prisma's `amount` is explicitly mapped to the resolver's `amountSnapshot`.
- **Parking:** separate line per explicitly paid assignment active at `period_start`, with the eligible Property price version; free and unclassified assignments create no line.
- **Total:** sum of rounded line amounts. The repository independently reconciles each aggregate category to item rows before writing.

Arithmetic uses integer milli-quantities and `bigint` VND values; no binary floating-point money math is used.

## 5. Snapshot and transaction behavior

The repository path writes manual ending-meter reading records with the Admin account as actor; `reading_at` records the server acceptance time, and the note explicitly says it is not claimed to be the actual meter observation time. Opening snapshots retain either the source finalized Invoice ID or the same Contract initial-reading source. Ending snapshots reference the inserted manual meter-reading rows.

Within one serializable transaction the implementation locks/re-reads the draft, revalidates contract-period anchoring and readings, resolves prices, records both ending readings and four snapshots, conditionally consumes each READY Flexible charge, inserts items and Electricity tiers, then writes aggregate snapshots, due date, finalized time, `snapshot_kind=ITEMIZED`, and `status=unpaid`. Any thrown database error rolls back the transaction. The route passes the authenticated Admin account ID. Finalized financial rows remain subject to Database V1.7 immutability.

## 6. PostgreSQL V1.7 rehearsal and blocker

A disposable local PostgreSQL 18.6 cluster was created at `127.0.0.1:55432`, database `goctro_itemized_rehearsal`. The database identity was checked before use. Database V1.7 clean-install `schema.sql`, base `seed.sql`, and `runtime_validator.sql` ran successfully; the validator reported **71/71 PASS**. No command connected to or changed locked `Goctro_test3`.

The actual itemized-finalize integration reached item insertion and PostgreSQL rejected the paid Parking item with this unique index:

```text
invoice_items_parking_assignment_id_key
UNIQUE (parking_assignment_id)
```

The seeded paid assignment `8404` already has an Invoice Item in invoice `5010`. Database V1.7 therefore prevents that same active recurring Parking assignment from appearing in a later billing period. Requirement/API describe recurring Parking billing while active and eligible at each `period_start`; this physical uniqueness rule cannot support that repeated-period behavior without changing the locked database design. The failed transaction was verified to leave the new Invoice `draft / NOT_FINALIZED`, with zero Invoice Items, zero meter snapshots, no new meter-reading rows, and the Flexible charge still `READY` with no Invoice link. The rollback behavior worked; the integration did **not** pass as a successful full finalization.

Per scope, this report does not change the constraint, omit a valid Parking line, invent a new identity, or modify Database V1.7. This conflict must be resolved through an approved database change request/version before finalization can be enabled.

## 7. Tests and checks

- Focused calculator + repository unit tests: **PASS**.
- Invoice suite with loopback enabled and no rehearsal URL: **137 passed, 0 failed, 1 PostgreSQL integration test skipped**.
- PostgreSQL V1.7 integration attempt: **FAIL for successful finalization**, surfaced the `parking_assignment_id` uniqueness conflict; rollback state verified as above.
- V1.7 database runtime validator on the disposable test DB: **71/71 PASS**.
- Backend typecheck: **FAIL, 174 existing project diagnostics** (173 legacy diagnostics in `backend/src/app.ts`, 1 in `backend/src/residents/resident.test.ts`); changed Invoice files add no typecheck diagnostics.
- Contract regression suite was not rerun; Contract code was not changed.

## 8. Finalization and remaining blocker

**Finalization was not wired.** `UnconfiguredInvoicePricing` remains the production adapter, so the Admin finalize route remains fail-closed. The plan/persistence code must not be treated as a fully working billing path until the approved Database V1.7 recurring-Parking mismatch is resolved and a successful PostgreSQL integration test passes.

No full invoice was committed. The live successful integration did not persist rent/utility/services/parking lines or snapshots, and no Flexible charge was consumed; its transaction rolled back. Unit-level resolver/calculation coverage remains available.

## 9. Exact next task

Create and approve a **Database change request/design for recurring paid Parking Invoice item linkage** that allows the same valid recurring assignment/entitlement to be billed across eligible Invoice periods while preserving duplicate prevention within a period and legacy immutability. Only after that approved physical path has a new database version/migration and runtime validation should this finalization pass resume.
