# Góc Trọ — Billing V1.7 Flexible Service Charge Resolver

- **Date:** 2026-10-13
- **Status:** `IMPLEMENTED — INTERNAL RESOLVER; NOT CONSUMED OR WIRED TO FINALIZE`
- **Database baseline:** Database V1.7, locked local/development baseline. No live database connection/query/write was used.

## 1. Scope and sources

Implemented an internal, read-only resolver that selects unconsumed Flexible Service charge records for an Invoice rental context, checks their eligibility, and resolves each charge's Property price version at its event time. Reviewed repository rules/current state/catalog; canonical Requirement, API Spec and Database Changelog; Database V1.7 schema/ERD/Prisma mapping; and the Billing gap review plus Utility Tariff, Meter Continuity and Fixed Service resolver reports.

The exact period rule was initially missing from Requirement/API. After clarification, the approved decision was recorded in both canonical documents: convert `occurred_at` to its `Asia/Ho_Chi_Minh` calendar date and include the full `period_start` through `period_end` dates. No endpoint or API shape changed.

No Invoice calculator, Invoice Item/snapshot writer, charge consumption, finalize wiring, Parking, frontend, schema/Prisma/migration/seed, Zalo or Payment behavior was implemented.

## 2. V1.7 model and business rule

`FlexibleServiceCharge` contains Owner, Property, Room, Contract and optional Resident context; pricing item/version IDs; `occurredAt`; `quantity`; `unit`; price and amount snapshots; source system/event key/fingerprint; status; and nullable Invoice ID. Its pricing item points to `PropertyPricingItem`; price versions are in `PropertyPriceVersion`.

The repository first verifies the Owner/Property and Contract/Room context, then scopes charge reads by all four IDs. It selects charges whose occurrence timestamp falls within the Invoice's inclusive Vietnam calendar dates. A timestamp window `[period_start 00:00 Asia/Ho_Chi_Minh, midnight after period_end Asia/Ho_Chi_Minh)` includes every instant of `period_end` without relying on millisecond precision.

Only a `READY` charge with no Invoice link is eligible. `INVOICED` records with an Invoice link and `VOID` records are returned as excluded, never billable again. Inconsistent READY/link or INVOICED/no-link states fail closed. Charges from another Owner, Property, Contract or Room fail closed even if a repository were to return an incorrectly scoped row.

## 3. Price resolution at `occurred_at`

For every charge independently, the resolver considers published versions belonging to the same Property pricing item/Owner/Property and `kind='FLEXIBLE_SERVICE'`, with `effective_from` no later than the charge's Vietnam calendar date. It selects the latest effective date, then highest version number for a same-date tie. Thus charges in one Invoice period can use different price versions.

The selected server version and its `unit_price` must match the charge's recorded version ID and `unit_price_snapshot`; otherwise the charge is unresolved. The stored `amount` is not used or recalculated. Client price values are never authoritative. A retired pricing item can still resolve a historical recorded charge because V1.7 has no retirement timestamp and retirement alone does not invalidate a previously recorded billable event; the historical published version still must match.

The result preserves charge ID, rental context, service code/name, event time, normalized quantity/unit, authoritative unit price/version, source/reference and source event identity. It does not calculate a line amount. No eligible price, wrong kind/scope, unpublished/future version, invalid/negative price, or snapshot mismatch fails closed.

## 4. Quantity and duplicate safety

Quantity is parsed with decimal-safe integer milli-units, must be greater than zero and fit Database V1.7 `numeric(12,3)`. No floating-point money/quantity calculation occurs.

Database V1.7 enforces `UNIQUE(owner_id, source_system, source_event_key)` and a 32-byte fingerprint. The resolver verifies a non-empty event identity and fingerprint shape, and detects duplicate source identities in its candidate batch as a defense-in-depth check. It does not write an idempotency row or consume a charge. Preventing concurrent double consumption still requires the future finalization transaction to lock/recheck the READY state and atomically link the charge to its Invoice Item/Invoice.

## 5. Files changed

- `backend/src/invoices/flexible-service-charge.repository.ts`
- `backend/src/invoices/flexible-service-charge.resolver.ts`
- `backend/src/invoices/flexible-service-charge.repository.test.ts`
- `backend/src/invoices/flexible-service-charge.resolver.test.ts`
- `backend/package.json` — included new tests in `test:invoices`.
- `../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` — recorded the approved inclusive Vietnam-date period membership rule.
- `../GocTro-SmartBuilding/docs/04_API_SPEC.md` — aligned the Flexible Service rule; no endpoint/DTO changes.
- `docs/00_CURRENT_STATE.md`
- `docs/DOCUMENT_CATALOG.md`
- This report.

## 6. Tests and verification

- Focused Flexible Service repository/resolver tests: **20/20 PASS**.
- `npm run test:invoices --workspace=@goctro/backend`: **102/102 PASS** with loopback available for HTTP route tests. Sandbox-only execution blocks those local test sockets with `EACCES`; no application assertion failed in the successful run.
- Backend typecheck: **FAIL**, 174 existing diagnostics remain (173 in legacy `backend/src/app.ts`, one in `backend/src/residents/resident.test.ts`); **0** diagnostics in the new Flexible Service files.
- No database command, query, migration, seed, charge insertion, charge status update, or schema/Prisma change was performed.

Tests cover valid READY charges, old/new price versions, multiple versions within one Invoice, Vietnam period boundaries (including all of `period_end`), Owner/Property/Contract/Room isolation, INVOICED/VOID exclusion, missing/wrong pricing item, missing/unpublished/future/negative price version, stored snapshot mismatch, decimal quantity validation, duplicate source identity, and invalid periods/data.

## 7. Remaining work / blockers

- No live Flexible charge or pricing data was queried; runtime rows remain unverified.
- This resolver is read-only and is not wired to production finalization. It does not calculate charge amounts, create Invoice Items, mark a charge `INVOICED`, set `invoice_id`, or provide atomic consume/replay behavior.
- Parking resolution, rent/utility/service amount calculation and rounding, meter/tier/charge snapshots, reconciliation and atomic `ITEMIZED` finalization remain unimplemented. `UnconfiguredInvoicePricing` stays wired, so finalization remains fail-closed.

## 8. Exact next task

**BILLING V1.7 PARKING PRICE + ENTITLEMENT RESOLVER (PERIOD_START)** — resolve eligible paid Parking entitlement/assignment rows against the Property-scoped Parking price version at Invoice `period_start`; exclude free and legacy-unclassified entitlement, test Owner/Property/Contract/Room isolation and no-proration rules, and keep finalization unwired. Do not start Payment.
