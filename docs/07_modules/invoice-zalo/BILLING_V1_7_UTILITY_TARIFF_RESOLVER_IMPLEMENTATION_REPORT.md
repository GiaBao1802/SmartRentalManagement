# Billing V1.7 Utility Tariff Resolver Implementation

- **Date:** 2026-10-13
- **Status:** `IMPLEMENTED — INTERNAL RESOLVER; NOT WIRED TO FINALIZE`
- **Database baseline:** V1.7, `Goctro_test3`, PostgreSQL 18.6, 40 public tables, locked local/development baseline. This task did not connect to or inspect the live database.

## 1. Scope and sources

Implemented an internal, read-only Electricity/Water tariff repository and resolver. Reviewed the project working rules, current-state checkpoint and document catalog; the canonical Requirement §10, API Spec Billing sections and Database V1.7 artifacts; plus the current Billing implementation gap review, UX/data-readiness audit and Admin Invoice browser closure report.

The Requirement selects one utility tariff version at Invoice `period_start` and keeps it for the entire period. Electricity is progressive kWh; Water is flat per m³. Mid-period tariff changes do not split or reprice the current period. The API Spec and current Billing implementation keep invoice finalization fail-closed until the complete pricing, meter, charge and immutable snapshot transaction exists.

## 2. Previous backend state

Invoice lifecycle and period helpers existed, but no backend read/resolution layer used the Database V1.7 utility tariff tables. The production Invoice finalize route used `UnconfiguredInvoicePricing` and returned an incomplete-data conflict without finalizing.

## 3. Files changed

- `backend/src/invoices/utility-tariff.repository.ts` — typed internal repository and Prisma read adapter.
- `backend/src/invoices/utility-tariff.resolver.ts` — version selection, tariff validation and explicit `RESOLVED` / `UNRESOLVED` result.
- `backend/src/invoices/utility-tariff.resolver.test.ts` — resolver behavior tests.
- `backend/src/invoices/utility-tariff.repository.test.ts` — Prisma query-scope/selection tests.
- `backend/package.json` — included the two focused files in `test:invoices`.

No frontend, API route, Prisma, schema, migration, seed, or database file/data was changed.

## 4. Repository and period selection

The Prisma repository first checks that the Property belongs to the supplied Owner. It then limits tariff reads to that Owner, Property, requested utility type and active tariff status. Nested versions must be published and have `effective_from <= Invoice.period_start`; the latest eligible effective date wins, with version number as deterministic tie-breaker. It never selects by current date, finalize date, `created_at`, or `period_end`.

If more than one active tariff has an eligible version for the same Owner/Property/utility, the resolver returns `AMBIGUOUS_TARIFF` rather than guessing which tariff is authoritative. This is fail-closed because the current schema does not provide a unique selection policy for that situation.

## 5. Electricity and Water behavior

- **Electricity:** resolves the selected tariff/version and all its tiers. Requires `kWh` + `PROGRESSIVE`, no flat price, tier numbering from 1 without gaps, a zero lower bound for the first tier, contiguous boundaries, valid nonnegative prices/bounds, closed intermediate tiers and one open final tier. Decimal usage boundaries are checked without floating-point comparison. A malformed or missing tier set returns `UNRESOLVED`.
- **Water:** resolves one flat `m3` rate. Requires `FLAT`, a present nonnegative rate and no progressive tier rows. Missing/invalid rate or an unexpected tier set returns `UNRESOLVED`.
- Missing Property scope, tariff, or eligible published version also returns a specific unresolved reason. No fallback/default tariff or price is supplied, and no data is repaired or written.

The resolver returns price configuration only; it does not calculate utility amounts or create Invoice Items/snapshots.

## 6. Tests and verification

- `npm run test:invoices --workspace=@goctro/backend` — **51/51 PASS, 0 failed**. Covers Invoice regressions and the new resolver/repository cases, including old/new periods, effective version at `period_start`, mid-period no-split, future/unpublished versions, Owner/Property scoping, missing/ambiguous data, Electricity tier shape/rate/boundary validation, and Water flat pricing.
- Backend typecheck — **FAIL** with 174 existing diagnostics: 173 in `backend/src/app.ts` legacy code and 1 in `backend/src/residents/resident.test.ts`. There were **0 diagnostics** in either new utility resolver file.
- Production build — not run because backend typecheck is already blocked by the unrelated diagnostics above.
- No live database query was run. A prior V1.7 promotion report recorded the new tariff tables empty at promotion time; current tariff data has not been rechecked and is therefore unverified.

## 7. Finalization, remaining work and blockers

Production finalize wiring was left unchanged: `backend/src/app.ts` still constructs `UnconfiguredInvoicePricing`. The resolver is not called by finalize, so this task does not enable finalization or change Invoice status. The existing path remains fail-closed.

Meter Continuity Resolver is now implemented; see [the Meter Continuity implementation report](BILLING_V1_7_METER_CONTINUITY_RULE_ALIGNMENT_IMPLEMENTATION_REPORT.md). Still unimplemented: Fixed/Flexible/Parking price and charge resolution; utility amount calculations; meter/tier/charge snapshots and the atomic itemized finalization transaction; live tariff configuration verification. No API or frontend integration was added by the Utility Tariff Resolver task.

## 8. Exact next task

Implement the **Billing V1.7 Fixed Service Price Resolver (period_start)** as the next bounded backend task. Keep Invoice finalize unwired/fail-closed until the full itemized transaction and required immutable snapshots are ready. Do not start Payment.
