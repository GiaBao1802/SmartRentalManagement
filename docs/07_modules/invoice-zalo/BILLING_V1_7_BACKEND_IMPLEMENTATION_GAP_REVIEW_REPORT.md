# Góc Trọ — Billing V1.7 Backend Implementation Gap Review

- **Date:** 2026-10-13
- **Status:** `CURRENT — REVIEW ONLY`
- **Database baseline:** V1.7, `Goctro_test3`, PostgreSQL 18.6, 40 public tables, `LOCKED LOCAL/DEV`.
- **Method:** Static review of canonical docs, V1.7 artifacts, backend source/tests, and existing reports. No tests or database commands were run.

## 1. Scope

Reviewed the current Invoice/Zalo backend against Requirement §10 and related service/Parking rules, API Spec §§5.8–5.11, Database V1.7 schema/ERD/migration/runtime validator, Prisma V1.7 mapping, and the latest Billing, Resident, Contract, and project status reports. No backend/frontend/database/Prisma/business-rule/API contract code was changed. No migration, seed, commit, or push was performed.

## 2. Current Billing backend summary

The backend has a usable **Invoice lifecycle skeleton**: Owner/Resident-scoped list/detail, Admin draft creation/generation, draft meter-field updates, Contract-anchored monthly period calculations, finalize authorization/state checks, and Zalo send-log plumbing. It does not yet use the Database V1.7 pricing, meter provenance, item, tier, Flexible charge, or Parking entitlement models. The deployed pricing adapter always returns “not configured,” so the current finalize route intentionally fails closed.

This is not a meaningful percentage of Billing V1.7 completion: the key authoritative pricing and itemized-finalization path is still absent.

## 3. What already works (from source inspection and existing evidence)

- `GET /api/v1/invoices` applies Owner or authenticated Resident/Contract scope and pagination.
- `POST /api/v1/invoices` creates a draft only after validating Owner-scoped Contract and the original Contract-start-date billing period.
- `POST /api/v1/contracts/{contract_id}/invoices/generate` derives an eligible period on the server, uses a Contract row lock, and relies on the unique period key plus transaction retry for races.
- The pure billing helpers calculate each monthly anniversary from the original anchor, clamp short months without cumulative drift, use the approved effective Contract end date, and preserve full rent in a shortened final period.
- Draft PATCH accepts only current electricity/water readings; client totals/status/tenant context are rejected.
- Finalize checks draft state, reading presence/order, uses a row lock and serializable transaction, and calculates due date from the Ho Chi Minh business date. With the currently wired adapter it leaves the draft unchanged and returns `409 INVOICE_DATA_INCOMPLETE`.
- Invoice and Zalo log reads are scoped. The send-log service records a new revision-specific log before calling the provider boundary. Tests use a fake provider and verify post-commit ordering.
- `/api/invoices` is explicitly retired with HTTP 410 before older legacy handlers. The old unversioned handlers remain in source but are unreachable through that prefix.

These bullets describe source and prior report evidence; this review did not rerun runtime smoke or tests.

## 4. What is legacy or incomplete

- The public implementation contract and response shape still represent the previous aggregate Invoice model. There is no V1.7 `line_items`, tier detail, meter-reading provenance, or `itemization_available` mapping.
- Final calculation still returns only aggregate electricity, water, and one generic service amount; it cannot explain fixed, flexible, or Parking items.
- Admin Invoice frontend still calls retired `/api/invoices` (documented in the Oct 13 coverage audit); this review did not deeply inspect or modify frontend.
- `UnconfiguredInvoicePricing` contains a stale source comment saying tariff/service rules are not approved. Canonical Requirement/API records those business decisions as approved. The fail-closed behavior itself remains correct until the complete authoritative calculator and snapshot writer exist.
- Idempotency-Key format is checked on write routes, but no durable Invoice-command replay or same-key/different-payload protection is implemented. The API Spec explicitly lists this as remaining work.
- Production Zalo recipient policy, queue/provider, and external delivery are not configured. The wired resolver defaults to no recipient, and the wired provider throws unavailable.
- There is no scheduled reminder/draft-generation job. The HTTP generate command exists; it is not a scheduler.
- Payment has no Invoice payment flow mounted in this implementation and remains a separate deferred domain.

## 5. Database V1.7 usage matrix

All listed Prisma models are present in `database/schema.prisma`. Static search found no backend `prisma.<model>` access for any of these V1.7-specific models. The target apply report also says all 12 new tables had zero rows immediately after promotion. Therefore each is **NOT USED by current Billing application code**, even though the physical schema and Prisma mapping support it.

| V1.7 table | Backend use | Why |
|---|---|---|
| `utility_tariffs` | NOT USED | No Billing tariff repository/service. |
| `utility_tariff_versions` | NOT USED | No period-start effective-version query. |
| `electricity_tariff_tiers` | NOT USED | No tier calculation or persisted tier snapshot. |
| `property_pricing_items` | NOT USED | No Property pricing catalog lookup/write path. |
| `property_price_versions` | NOT USED | No Fixed/Flexible/Parking as-of price resolution. |
| `flexible_service_charges` | NOT USED | No billable-event intake, claim, or invoice consumption flow. |
| `meter_readings` | NOT USED | Current API writes compatibility reading columns on `invoices` only. |
| `invoice_meter_reading_snapshots` | NOT USED | No source/provenance snapshot inserts. |
| `invoice_items` | NOT USED | No authoritative item insert/read path. |
| `invoice_item_electricity_tiers` | NOT USED | No electricity tier snapshot rows. |
| `parking_entitlements` | NOT USED | No Parking charge/entitlement lookup in Billing. |

The backend does use the existing `Invoice`, `Contract`, and Zalo-log Prisma models. Invoice queries include Contract/payment-summary fields, but do not include Invoice Items or meter snapshots. The scalar `snapshotKind` is mapped by Prisma but the current repository neither branches on it nor sets it when finalizing.

## 6. Electricity gap

Requirement selects exactly one Property tariff version effective at `period_start`, keeps it for the full period, calculates progressive kWh tiers, rounds each tier using decimal-safe half-up VND arithmetic, and snapshots the selected version, applied quantities/prices/amounts, and parent item. There is no tariff query, tier calculator, or tier/item persistence. The current pricing adapter returns no calculation at all. No mid-period split is present, but that is absence of implementation rather than a verified V1.7 calculation.

## 7. Water gap

Requirement needs one Property water price version effective at `period_start`, flat per m³ for the entire period, usage from reliable readings, a rounded line amount, and a source/version item snapshot. No Water price resolution or usage calculation exists. Water's price-source/locality fields are audit metadata; the app does not yet read or snapshot them.

## 8. Meter continuity gap

Draft creation currently queries the latest earlier Invoice for the **same Contract** by `periodEnd`, selecting only the current readings; it does not filter that query to finalized/eligible invoices. This can select an unfinalized prior draft instead of the latest eligible finalized Invoice. The query also does not walk renewal predecessor lineage. Finalize then falls back to the Contract initial reading if the draft opening value is null. Database V1.7's `meter_readings` and `invoice_meter_reading_snapshots` are unused, so source kind/time/provenance is not frozen.

Requirement/API require same-rental-continuity selection, only eligible finalized history, the predecessor boundary for renewal, then Contract initial reading where allowed; unresolved openings must leave the Invoice draft and block finalization. This needs a dedicated resolver plus focused renewal/foreign-continuity tests.

## 9. Rent gap

Rent is copied from the Contract into the draft and included in the aggregate total. It is not rebuilt as a `RENT` Invoice Item at finalization and therefore cannot be part of the required V1.7 authoritative item snapshot. Full-period rent/no-proration for the truncated final period is represented in period tests and the stored Contract rent; itemization is absent.

## 10. Fixed Service gap

There is no Property service catalog/version query, eligibility resolution, or per-eligible-Room item generation. Generic `serviceAmount` cannot represent separate Fixed Service lines, source/version, or label snapshots. The backend does not apply the no-Contract-override, period-start price, all-eligible-Room, full-period/no-proration rules.

## 11. Flexible Service gap

There is no charge intake/claiming/invoicing code, no lookup of Property price at `occurred_at`, and no transition of a charge from `READY` to `INVOICED` in the same finalize transaction. V1.7 database uniqueness and source fingerprint fields exist but are unused. Do not accept client-supplied price or invent a POS flow.

## 12. Parking billing gap

No Billing code reads `parking_entitlements`, assignment eligibility, or the shared Property Parking price. It cannot distinguish paid, free, and legacy-unclassified cases. Thus it does not enforce: assignment alone is not billable, free/unclassified creates no inferred charge, paid requires a valid price version, and mid-period activation begins next period with no proration.

## 13. Invoice item snapshot gap

V1.7 requires `snapshot_kind='ITEMIZED'` for newly finalized invoices, authoritative rows in `invoice_items`, opening/ending snapshots for both utilities, Electricity tier rows, and category/aggregate/total reconciliation. No repository code writes or returns those rows. Current responses omit line/tier/provenance detail and the explicit legacy itemization flag.

## 14. Finalization gap and confirmed source/schema blocker

`app.ts` wires `UnconfiguredInvoicePricing`, whose `calculate()` always returns `null`. The fail-closed response is correct today: it prevents unsupported totals from being finalized.

There is an additional deterministic source/schema incompatibility if a future adapter simply starts returning amounts:

1. The repository updates `status='unpaid'` and financial aggregate fields but does not set `snapshotKind='ITEMIZED'`.
2. Database V1.7's `invoices_snapshot_kind_lifecycle` CHECK permits `unpaid` only with `LEGACY_AGGREGATE` or `ITEMIZED`; a draft defaults to `NOT_FINALIZED`. Thus the current success write would be rejected.
3. Even if code only changed `snapshotKind` to `ITEMIZED`, the deferred database reconciliation requires four opening/ending utility snapshots, reconciled category item sums, and Electricity tier snapshots. The current transaction inserts none of them and cannot satisfy the V1.7 finalization invariant.

This is confirmed by static comparison of current repository writes and checked-in V1.7 constraints. It was **not** reproduced against PostgreSQL in this review. Do not remove/relax the database constraints; implement the complete atomic snapshot transaction before enabling pricing.

## 15. Rounding gap

No production pricing arithmetic exists to verify V1.7 tier/line rounding. Amount values and the aggregate helper use `bigint`, which avoids floating-point money sums, but the authoritative calculations, per-line half-up rounding, tier quantity math, and rounded-item total reconciliation are absent. Current reading monotonic checks use numeric comparison; there is no money formula to evaluate yet.

## 16. Legacy invoice compatibility

Database V1.7 correctly classifies old finalized invoices as `LEGACY_AGGREGATE` and old drafts as `NOT_FINALIZED`, with no fabricated item rows. Backend does not synthesize detail, which is good. However, it does not branch by `snapshotKind`, return `itemization_available=false` for legacy rows / true for new itemized rows, or include item data for V1.7 rows. The scalar snapshot kind can be present in the raw Invoice DTO but is not a substitute for the approved response contract.

## 17. API gap matrix

Endpoints below are the ones actually specified in API Spec §5.8; no new path is invented here.

| Required path | Status | Evidence / gap |
|---|---|---|
| `GET /api/v1/invoices` | PARTIAL | Route and scope/pagination exist; response is aggregate-only and lacks itemization availability/details. |
| `POST /api/v1/invoices` | PARTIAL | Creates a validated draft; no V1.7 line/read provenance model is attached. |
| `POST /api/v1/contracts/{contract_id}/invoices/generate` | PARTIAL | Server-derived draft command exists; scheduled reminders/automatic runner are absent. |
| `GET /api/v1/invoices/{invoice_id}` | PARTIAL | Scoped detail exists; no V1.7 items, tiers, meter provenance, or legacy flag. |
| `PATCH /api/v1/invoices/{invoice_id}` | PARTIAL | Draft-only current reading columns; no first-class meter reading history/source contract. |
| `POST /api/v1/invoices/{invoice_id}/finalize` | PARTIAL — BLOCKED | Route exists but deployed adapter always returns incomplete; current positive write path is incompatible with V1.7 snapshot constraints. |
| `POST /api/v1/invoices/{invoice_id}/send-zalo` | PARTIAL | Eligibility/log boundary exists; default recipient policy and production provider are unconfigured. |
| `GET /api/v1/invoices/{invoice_id}/zalo-send-logs` | IMPLEMENTED (scope/history) | Scoped history and Resident redaction exist; production send path remains unavailable. |
| Unversioned `/api/invoices` | LEGACY / RETIRED | Always returns HTTP 410; old handlers remain unreachable. Admin Invoice UI still calls this retired route per the current project audit. |
| Admin tariff/price configuration, meter history/provenance, Flexible charge intake, invoice item detail | MISSING / CONTRACT DETAIL PENDING | API Spec §5.10 says exact V1.7 paths and DTOs remain to be detailed. Do not add routes until the contract is approved. |
| Payment session/attempt/callback | MISSING / OUT OF SCOPE HERE | API Spec §5.9; Payment is deferred and depends on valid finalized invoices. |

The API Spec must be updated in a separately authorized contract-design task before adding any of the currently unspecified management/intake/detail routes. Existing endpoint behavior should not be silently expanded.

## 18. Test coverage

The current Invoice/Billing/Zalo source has **36 test declarations** across billing helpers, repository, routes, validation, and Zalo service. The latest project coverage report records the Invoice suite as 36/36; earlier V1.3 implementation/hardening reports record their own historical runs. Existing tests cover anchor/clamp/no-drift, final period/termination, draft validation, Owner/Resident scoping, duplicate-period/idempotency-header behavior, fail-closed pricing, an injected aggregate pricing success path, and fake-provider/log ordering/privacy.

Coverage gaps before claiming V1.7 Billing completion:

- V1.7 PostgreSQL finalization against lifecycle CHECKs/deferred item reconciliation triggers.
- Electricity period-start tariff selection, no-split behavior, tier boundaries/continuity, and half-up line rounding.
- Flat Water pricing, reading usage, effective price selection, and rounding.
- Meter provenance priority: finalized same-continuity Invoice, successor/predecessor boundary, Contract initial, unresolved fail-closed; explicitly reject prior draft as opening source.
- Full rent item, Fixed Service eligibility/version/no proration, Flexible charge timestamp/idempotency/consumption, and Parking paid/free/unclassified/no-proration cases.
- Atomic four reading snapshots + items + tiers + aggregates + consumed-charge state + `ITEMIZED` transition, rollback on every missing/conflicting input, and immutability after commit.
- Legacy aggregate vs new itemized response mapping, durable Invoice idempotency if approved, and concurrent PostgreSQL scenarios.

No tests were executed in this review-only task.

## 19. Blockers

1. **BLOCKER — no V1.7 calculator and no V1.7 snapshot persistence.** Pricing adapter is unconfigured; enabling it alone would hit a physical lifecycle CHECK and then deferred snapshot reconciliation.
2. **HIGH — no tariff/price/read/charge integration.** All 11 V1.7 Billing models are unused by backend source; V1.7 migration report says new tables were empty after promotion.
3. **HIGH — meter continuity selection is not compliant.** Prior Invoice query is not finalized-filtered and does not traverse predecessor continuity.
4. **HIGH — unspecified API surfaces.** Contract details for configuration, meter provenance, Flexible charge ingestion, and itemized reads must be completed before routes are exposed.
5. **MEDIUM — durable Invoice command replay is missing.** API Spec documents this as remaining work; Database V1.7 does not provide an Invoice idempotency-request table. Keep V1.7 locked; a separate approved database design/version is needed if durable Invoice replay is required as a release gate.
6. **MEDIUM — Zalo and scheduler are not production-ready.** Recipient policy/queue/provider and scheduled reminder/job execution remain unconfigured/unimplemented.

## 20. Dependency order / recommended implementation sequence

0. Before new public management/intake routes: complete the API contract for Property tariff/price version management, meter reading/history/provenance, Flexible charge intake, and itemized Invoice/legacy response shape. Do not invent endpoint names or payloads.
1. Implement a read-only, Owner/Property-scoped Utility Tariff Resolver: choose one published version per utility effective at `period_start`; validate Electricity tier structure; treat Water as flat-rate; fail closed when absent/invalid.
2. Implement a Meter Continuity Resolver that selects only eligible finalized readings in the same rental continuity, handles renewal predecessor boundary, then Contract initial; record resolved opening/ending provenance.
3. Implement read/eligibility services for Fixed Service versions, Flexible charges at `occurred_at`, and paid/free/unclassified Parking entitlement rules. Each must be independently unit-tested and fail closed.
4. Implement decimal-safe calculation types: rent, tiered Electricity, Water, Fixed/Flexible/Parking lines; per-line half-up rounding and totals from rounded item amounts.
5. Implement finalization as one transaction: validate all inputs; insert four reading snapshots, item rows and Electricity tier rows; consume eligible Flexible charges; derive compatibility aggregates; set `snapshot_kind='ITEMIZED'`, due date and `unpaid` last; let DB reconciliation enforce the result. Roll back completely on failure.
6. Complete Invoice detail/list serialization for new itemized and legacy aggregate rows; add durable idempotency only according to an approved design and available physical version.
7. Add PostgreSQL V1.7 integration/concurrency tests using a disposable/rehearsal database, then focused API tests. Do not validate by writing fixtures to locked `Goctro_test3`.
8. Later, separately address the Admin frontend, production Zalo queue/recipient policy, scheduler, and Payment after Invoice finalization is authoritative.

## 21. Smallest next implementation task

**GÓC TRỌ — BILLING V1.7 UTILITY TARIFF RESOLVER (PERIOD_START)**

Boundary: backend-only internal read service; no route, frontend, database/Prisma/schema change, seed, or change to finalize wiring. Resolve the published tariff version for one Property/utility at Invoice `period_start`; load Electricity tiers and validate tier shape; resolve Water's single rate; return an explicit unresolved result for missing/invalid configuration. Add unit tests for version selection, no mid-period split, tier validation, and fail-closed missing data. Keep `UnconfiguredInvoicePricing` wired until the complete itemized finalization transaction is ready.

This is independently testable and unlocks the calculation layer without pretending that an empty production pricing table is configured.

## 22. Files changed

- `SmartRentalManagement/docs/07_modules/invoice-zalo/BILLING_V1_7_BACKEND_IMPLEMENTATION_GAP_REVIEW_REPORT.md` (created)
- `SmartRentalManagement/docs/00_CURRENT_STATE.md` (Billing blocker/status and exact next task only)
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md` (report index)

No backend, frontend, Database V1.7, Prisma, migration, seed, Requirement, or API Spec file was changed.

## 23. Current State update

Updated Billing status and blocker to distinguish the safe current fail-closed adapter from the future V1.7-incompatible positive finalize write. Updated the single exact next task to the bounded tariff resolver task above. The latest DB milestone/baseline was not changed. Resident remains deferred and Contract remains PARTIAL.

## 24. Final review result

**REVIEW COMPLETE — NO IMPLEMENTATION.** The project has basic Invoice lifecycle endpoints and correct period helpers, but effectively none of the eleven new V1.7 Billing tables are used by backend code. V1.7 physical schema is already sufficient for approved pricing/item snapshot structures; no immediate schema edit is indicated. Invoice finalization must remain fail-closed until pricing, continuity, complete item/snapshot writes, and API output are implemented together. No tests or live database queries were run in this review.
