# Góc Trọ — Billing V1.7 Fixed Service Price Resolver

- **Date:** 2026-10-13
- **Status:** `IMPLEMENTED — INTERNAL RESOLVER; NOT WIRED TO FINALIZE`
- **Database baseline:** Database V1.7 remains the locked local/development baseline. No database connection or data query was used.

## 1. Scope and sources

Implemented a read-only backend resolver for Property-level Fixed Service price versions at Invoice `period_start`. Reviewed `AGENTS.md`, documentation rules, current state and catalog; canonical Requirement §10, API Spec Billing sections and Database Changelog; Database V1.7 `schema.sql`, ERD and the application Prisma mapping; and the Billing gap review, Utility Tariff Resolver report and Meter Continuity report.

No calculator, Invoice Item/snapshot writer, API route, frontend, Prisma/schema/migration/seed, database data or finalization wiring was changed. No Payment or Zalo implementation was started.

## 2. State before this task

Utility Tariff and Meter Continuity internal resolvers existed. Fixed Service had no Property pricing catalog query or effective-version resolver. Invoice finalization remained correctly wired to `UnconfiguredInvoicePricing` and failed closed.

## 3. V1.7 model and business rule

The resolver uses the existing `PropertyPricingItem` and `PropertyPriceVersion` models. The item supplies Owner, Property, `kind`, code, name, unit and active/retired status. The price version supplies version number, `effectiveFrom`, integer VND `unitPrice`, publication time and source/reference. It does not use Contract price fields or infer a charge from Property Facility records.

Only active `FIXED_SERVICE` items belonging to the requested Owner and Property are read. A published version with `effectiveFrom <= period_start` is eligible; the latest effective date wins, with highest `versionNo` as the deterministic same-date tie-breaker. The database's unique version constraints prevent duplicate `(pricing item, effective date, version number)` records. Future versions are not selected. A price change during the billing period does not split/reprice that period; the selected price applies to the whole period without price-change proration.

Multiple Property Fixed Services resolve independently and retain their own code/name, unit, price/version identity, effective date and optional source/reference. A Property with no active Fixed Service returns `RESOLVED` with an empty list; a configured active item with no eligible published version fails closed.

## 4. Property, Room and charge eligibility

Property ownership is checked before pricing rows are read. The repository scopes every catalog query by `ownerId`, `propertyId`, `kind='FIXED_SERVICE'` and active status. When an Invoice Room context is supplied, the Room must match that Owner and Property and have `is_active=true` and a non-`inactive` status. Otherwise the resolver returns `ROOM_NOT_ELIGIBLE` before reading pricing items. A catalog-only lookup may omit Room context; it resolves configuration, not a Room charge.

V1 has no per-Room Fixed Service applicability override. The resolver does not invent one and does not look up Facility or Contract pricing. Invoice/Contract eligibility and producing a per-Room Invoice line remain responsibilities of the later calculator/finalization path.

## 5. Fail-closed behavior

The resolver returns either `RESOLVED` or `UNRESOLVED` with a reason. Invalid period, Owner/Property mismatch, ineligible Room, malformed/wrong-kind/inactive item, missing eligible version and invalid version/negative price do not fall back to a current/default/Contract/Facility price and do not write data. VND price values remain `bigint`; this task performs no money calculation.

Database V1.7 requires a published timestamp on each stored price version via its CHECK constraint; resolver validation also rejects a missing publication timestamp in supplied/test records. No default price or silent repair is provided.

## 6. Files changed

- `backend/src/invoices/fixed-service-price.repository.ts`
- `backend/src/invoices/fixed-service-price.resolver.ts`
- `backend/src/invoices/fixed-service-price.repository.test.ts`
- `backend/src/invoices/fixed-service-price.resolver.test.ts`
- `backend/package.json` — included the resolver/repository tests in `test:invoices`.
- `docs/00_CURRENT_STATE.md`
- `docs/DOCUMENT_CATALOG.md`
- This report.

## 7. Tests and verification

- Focused Fixed Service resolver/repository tests: **13/13 PASS**.
- `npm run test:invoices --workspace=@goctro/backend`: **82/82 PASS** when run with loopback access enabled. The sandbox-only attempt could not open the test server socket (`EACCES`); no assertion failed in that attempt.
- Backend typecheck: **FAIL** due to the existing legacy diagnostics in `backend/src/app.ts` and `backend/src/residents/resident.test.ts`. The new Fixed Service files have no typecheck diagnostics after correction.
- No database command or query, migration, seed, Prisma/schema change, or fixture write was run.

Coverage includes Property/Owner filtering, active Fixed Service filtering, Room ownership/activity validation, single and multiple services, old/new period selection, mid-period non-splitting, future and unpublished version exclusion, same-date version tie-break, missing/invalid/negative price, wrong kind, invalid period, and no Contract/Facility lookup.

## 8. Finalization and remaining work

Production finalization remains unwired to all internal resolvers and stays fail-closed through `UnconfiguredInvoicePricing`. This resolver only returns price configuration: it does not determine Invoice Room/Contract eligibility beyond the optional active Room scope check, calculate line amounts, create Invoice Items, or persist snapshots. Flexible Service, Parking, utility calculation/rounding, rent lines, tier/meter/charge snapshots and atomic `ITEMIZED` finalization remain unimplemented. Live pricing rows were not queried.

## 9. Exact next task

**BILLING V1.7 FLEXIBLE SERVICE CHARGE RESOLVER (OCCURRED_AT)** — implement and test the internal Property-scoped resolution/eligibility of approved Flexible Service charges using their recorded billable-event and price-version data at `occurred_at`. Keep Invoice finalization unwired/fail-closed; do not start Payment.
