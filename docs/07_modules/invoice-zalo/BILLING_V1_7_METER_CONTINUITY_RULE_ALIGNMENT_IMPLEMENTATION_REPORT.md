# Billing V1.7 Meter Continuity Rule Alignment + Implementation

- **Date:** 2026-10-13
- **Status:** `IMPLEMENTED — DRAFT OPENINGS RESOLVED; FINALIZE STILL FAIL-CLOSED`
- **Database baseline:** V1.7 remains the locked local/development baseline. This task did not connect to or query Goctro_test3.

## 1. Scope and sources

Updated the canonical Requirement first, reconciled the directly conflicting API wording, then implemented a read-only Meter Continuity Resolver and used it while creating Invoice drafts. Reviewed the repository rules/current-state/catalog, Requirement, API Spec, Database V1.7 schema and Prisma mapping, Billing gap review, and the Utility Tariff Resolver implementation report.

No schema, Prisma, migration, seed, database data, frontend, pricing calculator, Invoice item/snapshot writer, Zalo, Payment, or production finalize wiring was changed.

## 2. Requirement rule before and after

**Before:** Billing text used a broad “same rental continuity” rule and allowed renewal/successor meter baselines to come from predecessor Contract closing readings or predecessor finalized Invoice readings at a continuity boundary. Repeated summaries in the Contract/Billing sections and API Spec carried the same behavior.

**Now:** Each Contract is a separate meter continuity:

1. Its first Invoice uses that Contract's own initial reading, independently for Electricity and Water.
2. A later Invoice uses the nearest earlier finalized Invoice's ending reading from that same Owner/Property/Contract only.
3. Draft/unfinalized history is excluded. A missing/invalid ending reading on the nearest finalized Invoice fails closed; the resolver does not skip back to stale history or use the Contract initial value to conceal it.
4. A renewal successor/new tenant gets new Contract initial readings. Predecessor Contract readings, predecessor Invoices, and other Room history are never inherited. A successor cannot activate until both initial readings are explicitly present.
5. If no earlier finalized Invoice exists and the relevant Contract initial reading is absent/invalid, the Invoice can remain draft but cannot finalize.

The conflicting predecessor/Room inheritance wording was replaced in Requirement sections 9, 10, 11, 21.4, the billing decision summary, and the billing-pricing matrix. A full Requirement search found no remaining rule authorizing meter inheritance across Contracts.

The API Spec contained explicit, not merely generic, predecessor inheritance behavior. Its Renewal and Invoice billing summary/finalization statements were therefore aligned with the new Requirement. Endpoint paths, request/response shapes, auth rules, and unrelated API behavior did not change.

## 3. Files changed

- `docs/01_REQUIREMENTS.md` — canonical same-Contract continuity rule.
- `docs/04_API_SPEC.md` — aligned directly conflicting Contract Renewal/Invoice behavior; no endpoint or DTO changes.
- `backend/src/invoices/meter-continuity.repository.ts` — Owner/Property/Contract-scoped Prisma read repository.
- `backend/src/invoices/meter-continuity.resolver.ts` — independent per-utility resolution, provenance, validation, explicit unresolved results.
- `backend/src/invoices/meter-continuity.repository.test.ts`
- `backend/src/invoices/meter-continuity.resolver.test.ts`
- `backend/src/invoices/invoice.repository.ts` — new draft opening values now come from the resolver; unresolved values remain `null`. Finalize no longer silently substitutes Contract initial values for an unresolved stored opening.
- `backend/src/invoices/invoice.repository.test.ts`
- `backend/src/contracts/contract.repository.ts` — renewal creates blank initial readings; activation requires explicit successor readings and does not query predecessor meter history.
- `backend/src/contracts/contract.repository.test.ts`
- `backend/package.json` — included the meter resolver/repository tests in `test:invoices`.
- `docs/00_CURRENT_STATE.md`, `docs/DOCUMENT_CATALOG.md` — checkpoint and report index.
- `docs/07_modules/invoice-zalo/BILLING_V1_7_METER_CONTINUITY_RULE_ALIGNMENT_IMPLEMENTATION_REPORT.md` — this report.

## 4. Resolver and draft behavior

The resolver accepts Owner, Contract, utility type, and Invoice period start. It reads the Contract only inside the authenticated Owner scope, then queries only earlier finalized (`unpaid`/`paid`, `finalized_at` present) Invoices with the same Owner, Property, and Contract. It orders by period end descending and returns the nearest eligible result. It never queries predecessor/successor Contract lineage or Room-wide Invoice history.

For each utility it returns `RESOLVED` with a normalized reading and either `PREVIOUS_FINALIZED_INVOICE` + Invoice reference or `CONTRACT_INITIAL_READING` + Contract reference. Electricity and Water are resolved independently. Draft creation writes the resolved opening reading or `null`; this lets an incomplete draft exist without inventing a baseline.

Missing Contract, owner/property/contract scope mismatch, invalid period, invalid readings, and absent baseline have explicit unresolved reasons. Reading validation accepts nonnegative values up to the Database V1.7 `numeric(12,3)` range and preserves three decimal places. A malformed or missing value on the nearest finalized Invoice fails closed instead of falling back to an older Invoice or initial reading.

## 5. Finalize boundary

`UnconfiguredInvoicePricing` remains wired in production. The resolver is not used to activate finalization; no Invoice transitions to unpaid as part of this task. Finalize now refuses missing draft openings instead of falling back to Contract initial readings. Full pricing, meter/tier snapshots, itemized calculation, and the atomic finalization transaction remain unimplemented.

## 6. Tests and verification

- Focused meter/repository/Invoice/Contract repository tests: **49/49 PASS**.
- `npm run test:invoices --workspace=@goctro/backend`: **69/69 PASS**.
- `npm run test:contracts --workspace=@goctro/backend`: **134/134 PASS**.
- Backend typecheck: **FAIL**, 174 diagnostics remain: 173 in pre-existing legacy `backend/src/app.ts`, 1 in `backend/src/residents/resident.test.ts`, and 0 in task files.
- Backend build was not run because the existing typecheck errors block a clean build result.
- No database command, live DB query, migration, seed, or fixture write was run.

Tests cover first-period initial readings, later same-Contract finalized readings, draft exclusion, cross-Contract/Owner/Property protection, utility independence, invalid/missing values, nearest-period boundaries, draft creation with unresolved openings, renewal isolation, and successor activation requirements.

## 7. Remaining work and exact next task

Still open: verify actual tariff/meter configuration in a permitted runtime environment; Fixed/Flexible/Parking price and charge resolution; calculation/rounding; durable reading/tier/charge snapshots; atomic `ITEMIZED` finalization and full end-to-end closure. Finalize stays fail-closed; Payment is not started.

**Exact next task: `BILLING V1.7 FIXED SERVICE PRICE RESOLVER (PERIOD_START)`.** Implement the internal Property-scoped read/eligibility resolver for Fixed Service price versions, test effective-date selection and fail-closed missing/invalid data, and keep Invoice finalize unwired.
