# Góc Trọ — Billing V1.7 Parking Price + Entitlement Resolver

- **Date:** 2026-10-13
- **Status:** `IMPLEMENTED — INTERNAL READ-ONLY RESOLVER; NOT WIRED TO FINALIZE`
- **Database baseline:** Database V1.7, locked local/development baseline. No live database connection/query/write was used.

## 1. Scope and sources

Implemented an internal resolver for each Parking slot assignment in an Invoice's Owner/Property/Contract/Room context. It distinguishes billable paid, free, unclassified, and invalid cases, and resolves the Property Parking price version effective at Invoice `period_start`.

Reviewed repository governance/current state/catalog; canonical Requirement, API Spec and Database Changelog; V1.7 schema, ERD and Prisma mapping; and the Billing gap review plus Utility Tariff, Meter Continuity, Fixed Service and Flexible Service implementation reports. No canonical business/API rule or database artifact required a change.

## 2. V1.7 model inspected

- `parking_slot_assignments` carries Owner, Property, Room, Contract, Resident, Vehicle, slot, `started_at`, nullable `ended_at`, status and nullable `entitlement_id`. The nullable entitlement is retained for historical/unclassified V1.6 assignments.
- `parking_entitlements` carries Owner/Property, entitlement type, billability, active flag and, for paid entitlements, the Property pricing item reference and `pricing_kind='PARKING'`.
- `property_pricing_items` and `property_price_versions` are the single Property-scoped price authority. Versions carry effective date, VND price, publication and source metadata.
- `room_residents` provides a second check that the assignment Resident belonged to the requested Room/Contract at the requested period start.

The repository reads only. It does not create or update assignments/entitlements, write price snapshots, create Invoice Items, or consume Parking assignments.

## 3. Eligibility and classification

Each assignment is checked independently against the requested Owner, Property, Contract, Room, Resident, Vehicle and physical slot. An assignment is considered active on `period_start` when it started on/before that date and either remains active with no end date or has an ended/revoked end date on/after that date. If its start is after `period_start`, or it ended before that date, it is excluded from the result.

- `PAID_SLOT` must be explicitly `PAID`; active Motorcycle/Apartment Vehicle Card entitlements may be `PAID` or `FREE`.
- Explicit `FREE` returns `RESOLVED_FREE`, without a price or charge.
- `LEGACY_UNCLASSIFIED`, and an assignment whose `entitlement_id` is NULL, return `RESOLVED_UNCLASSIFIED`; neither is inferred paid or free.
- Malformed or inactive entitlement, wrong type/billability combination, rental-context mismatch, or invalid resident occupancy fails closed with an unresolved reason.

Assignments alone never establish billability. Multiple vehicles yield separate results, so paid/free/unclassified assignments can coexist without being collapsed into one amount.

## 4. Price and period behavior

For a valid active paid entitlement, the resolver requires an active Property pricing item whose Owner/Property match and whose kind is `PARKING`, and an explicitly referenced `PARKING` item. It selects the latest **published** version with `effective_from <= Invoice.period_start`, sorting by effective date descending and then version number descending. Future versions are not eligible. Contract overrides, assignment values, Facility records, current date and `period_end` are not price inputs.

An assignment starting after `period_start` produces no charge in that Invoice period; it can resolve as billable in a later period whose start is on/after the assignment start. A price change during a period does not split the period: the version selected at `period_start` applies to the full period. An assignment ending after the period start remains a full-period eligible assignment; no proration or line amount calculation is performed here.

Missing paid price item/version, wrong kind/scope, unpublished/future/negative or malformed price fails closed. The resolver returns unit price/version metadata only; calculator and VND rounding belong to a later task.

## 5. Files changed

- `backend/src/invoices/parking-billing.repository.ts`
- `backend/src/invoices/parking-billing.resolver.ts`
- `backend/src/invoices/parking-billing.repository.test.ts`
- `backend/src/invoices/parking-billing.resolver.test.ts`
- `backend/package.json` — added both focused files to `test:invoices`.
- `docs/00_CURRENT_STATE.md`
- `docs/DOCUMENT_CATALOG.md`
- This report.

No Requirement/API, Database V1.7, Prisma, migration, seed, backend route, frontend, Invoice finalize wiring, Payment, or Zalo code was changed. No live Parking/pricing rows were queried.

## 6. Tests and verification

- Focused Parking repository/resolver tests: **31/31 PASS**.
- `npm run test:invoices --workspace=@goctro/backend`: **133/133 PASS** after allowing the test runner to use its ephemeral loopback HTTP socket; the sandbox-only attempt had 9 route-test connection `EACCES` failures and no assertion failures.
- Backend typecheck: **FAIL**, still 174 pre-existing legacy diagnostics (173 in `backend/src/app.ts`, one in `backend/src/residents/resident.test.ts`). The new Parking resolver/repository files add **0** diagnostics.
- No database command, connection/query/write, migration, seed, or Prisma operation was performed.

Coverage includes paid/free/unclassified/NULL-entitlement cases, assignment-only non-billability, activation boundary and subsequent period, ended mid-period full eligibility, old/new period pricing, future/unpublished/missing/negative versions, multiple vehicles, Owner/Property/Contract/Room/Resident/Vehicle isolation, malformed/inactive configuration, and empty result. Repository tests assert context/date query filters and read-only behavior.

## 7. Finalization and remaining work

The resolver is not wired to production finalization. `UnconfiguredInvoicePricing` remains in place and finalization remains fail-closed. This task does not calculate Parking amounts, prorate or round values, create `invoice_items`, write snapshots, consume/update assignments, or provide an atomic itemized transaction. No live entitlement or price catalog data was checked.

## 8. Exact next task

**BILLING V1.7 ITEMIZED INVOICE CALCULATOR + ATOMIC SNAPSHOT FINALIZATION IMPLEMENTATION** — reconcile Contract rent, utility tariff/meter results, Fixed Service, Flexible Service and Parking resolver outputs into decimal-safe rounded Invoice Items and required snapshots, then implement the atomic transaction/consumption/reconciliation path. Keep the locked Database V1.7 unchanged and do not start Payment until Invoice finalization is complete and reviewed.
