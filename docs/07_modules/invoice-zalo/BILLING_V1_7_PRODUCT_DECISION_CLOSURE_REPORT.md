# Góc Trọ — Billing V1.7 Product Decision Closure Report

- **Date:** 2026-10-13
- **Status:** `CURRENT` — canonical business/API decision closure. This is not V1.7 database or implementation approval.
- **Scope:** Close approved Billing/Pricing decisions and resync the canonical Requirement and API Spec. No database or application implementation was performed.

## Sources checked

- `SmartRentalManagement/docs/DOCUMENTATION_RULES.md`
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`
- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`
- `GocTro-SmartBuilding/docs/04_API_SPEC.md`
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`
- `SmartRentalManagement/docs/11_project-reports/PROJECT_CURRENT_STATE_AUDIT_2026_10_12.md`
- `SmartRentalManagement/docs/07_modules/invoice-zalo/BILLING_V1_PRICING_SNAPSHOT_SCHEMA_GAP_AUDIT.md`
- `SmartRentalManagement/docs/07_modules/invoice-zalo/BILLING_V1_7_CANONICAL_REQUIREMENT_SYNC_REPORT.md` (historical wording retained; its former tariff-split decision is superseded by this closure)
- `SmartRentalManagement/docs/11_project-reports/REQUIREMENT_IMPLEMENTATION_COVERAGE_AUDIT_2026_10_13.md`

## Decisions finalized

1. **Utility tariff selection:** Exactly one version per utility and Invoice billing period, selected by the tariff effective at `period_start` and held through the period. A mid-period change applies to the next billing period. No tariff split, day-based allocation, repricing, or intermediate reading solely for a tariff boundary.
2. **Electricity:** Official/regulatory progressive multi-tier tariff, measured in kWh. Each tariff version is effective-dated and has multiple tiers/ranges and unit prices. Finalized Invoice snapshot records the version and applied tier quantities, prices, amounts, and electricity total.
3. **Water:** Meter usage is current minus previous reading in m³. One effective price per m³ applies for the whole Invoice period; tiered water is out of V1.
4. **Meter continuity:** Beginning reading prefers the latest eligible finalized Invoice in the same rental continuity, otherwise Contract initial reading. Renewal follows predecessor closing/final reading, then a finalized predecessor Invoice at the continuity boundary. Never use an unrelated latest Room Invoice. Unresolved reliable reading permits draft but blocks finalization. V1 readings are entered manually; OCR is out of scope.
5. **Fixed Service:** Configured at Property level and charged per Room, without Contract price override. Select the effective-dated price at `period_start` and hold it for the full period. Price changes apply next period and do not cause price-change proration. Room applicability detail remains open only if needed by design.
6. **Flexible Paid Service:** Supports valid one-time, per-use, quantity-based, booking-based, or service-appropriate recurring charges. It is distinct from Facility and is not the former Pool/Gym 30-day/720-hour subscription. V1 does not automatically refund or rewrite billed/finalized invoices; detailed cancellation/refund policy remains open.
7. **Facility:** A Property facility (including Pool/Gym) is not automatically a paid subscription.
8. **Parking:** Parking owns area, slot, vehicle/card, entitlement, assignment, capacity, and context. Paid/free slot and vehicle-card entitlement concepts are supported; free entitlement costs zero and not every assignment is billable. Paid Parking uses one Property pricing authority. Supported charge basis is per slot, vehicle/card, or billing period. Only mid-period assignment proration remains an open product decision.
9. **Price history:** Append-only, versioned, effective-dated history. Used historical price versions are not silently updated/deleted; corrections use a controlled superseding/correction path.
10. **Invoice snapshot:** Finalized invoice items preserve category, historical label, quantity/unit, unit price, amount, source/version, and applicable period/calculation version as needed. Electricity must explain applied tiers. Database design may choose parent-plus-tier rows or tier item rows. Finalized financial data is immutable and does not re-resolve current price/labels.
11. **Contract boundary:** Contract carries rent and tenancy terms/context, capacity/lifecycle, and applicable initial/final meter readings. It does not override utility tariffs, service prices, or Parking prices; rent remains Contract-sourced.

## Superseded decisions

- **SUPERSEDED / REPLACED (2026-10-13):** The earlier requirement to split an Invoice at mid-period tariff changes using intermediate meter readings. The replacement is one tariff version per utility per billing period, selected at `period_start` and held for the entire period; a new version applies from the next period.
- **SUPERSEDED / REPLACED:** The former Pool/Gym mandatory paid subscription and 30-day/720-hour cycle model. Facility versus Flexible Paid Service is the current product distinction.

## Canonical sections updated

### `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`

- §10: utility version selection, electricity tiers, single-rate water, meter inheritance, Fixed/Flexible Service, Parking pricing, append-only history, immutable invoice snapshots, and Contract pricing boundary.
- §21.4: Billing/Pricing acceptance criteria aligned with one tariff per period, meter continuity, invoice snapshots, Fixed Service, and Parking.
- §21.6: replaced stale Fixed Service price-change and Parking charge-basis open statements; only Parking proration and other genuinely unresolved details remain open.
- Billing/Pricing decision history: dated superseded tariff-split rule and its replacement recorded.
- “Các điểm còn chưa xác định”: removed tariff split and Fixed Service price behavior as open decisions; retained only unresolved import/source metadata, rounding, conditional Room applicability, Flexible cancellation/refund, Parking proration, and exact V1.7 schema/API design.

### `GocTro-SmartBuilding/docs/04_API_SPEC.md`

- §5.8 and Invoice lifecycle/finalization/DTO paragraphs: one tariff per period, meter continuity, electricity tier and water single-rate calculation, Fixed Service selection, snapshot target, fail-closed behavior, and V1.7 design-pending boundaries.
- §5.10–§5.11: Facility/Paid Service and Parking responsibility/pricing boundary.
- Request examples, validation/checklist, and implementation gate: marked current behavior versus V1.7 design work; exact endpoints/DTOs are not invented. Clarified that V1.7 meter-reading design does not mean an intermediate reading is required for a tariff change.

## Open decisions remaining

- Electricity tariff source/version import process.
- Water provider/locality source metadata.
- Rounding rules.
- Fixed Service Room applicability details, if required.
- Flexible Service cancellation/refund details.
- Parking assignment mid-period proration.
- Exact V1.7 physical schema, API endpoints/DTO fields, charge-input contract, and tier/item representation.
- Separate Invoice/Zalo operational gaps already documented in the API Spec, including recipient policy and production queue/provider/replay/concurrency integration.

The former tariff-split behavior is **not** an open decision.

## Conflicts and implementation gaps

- The prior `BILLING_V1_7_CANONICAL_REQUIREMENT_SYNC_REPORT.md` records the earlier approved mid-period tariff-split rule and is retained unchanged as historical evidence. Its decision is superseded by the canonical Requirement dated 2026-10-13 and this closure record.
- Database V1.6/Prisma and the current implementation do not yet provide all approved V1.7 tariff, tier, beginning-reading continuity, charge-input, and immutable Invoice item snapshot capabilities. These remain design/implementation gaps; finalization stays fail-closed until required authoritative data and snapshot support are available.
- No DB, Prisma, migration, backend, frontend, Payment, or live database changes/commands were made. No application/runtime tests were run; consistency was checked by reading the sources and searching the two canonical documents for stale/conflicting wording.

## Exact next task

`GÓC TRỌ — BILLING V1.7 API + DATABASE DESIGN PASS`

Design the API and database delta for review. Do not migrate until the design has been reviewed.
