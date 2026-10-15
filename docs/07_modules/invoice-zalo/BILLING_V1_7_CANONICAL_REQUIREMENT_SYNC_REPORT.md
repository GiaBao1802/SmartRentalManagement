# Góc Trọ — Billing V1.7 Canonical Requirement Sync Report

- **Ngày:** 2026-10-13
- **Trạng thái:** `CURRENT` — records the canonical business/API sync; it is not Database V1.7 design or implementation approval.
- **Phạm vi:** canonical Billing/Pricing business rules and the API Spec wording needed to align with them. No implementation or database operations were performed.

## Sources checked

- `docs/DOCUMENTATION_RULES.md`, `docs/DOCUMENT_CATALOG.md`
- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`
- `GocTro-SmartBuilding/docs/04_API_SPEC.md`
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`
- `docs/11_project-reports/PROJECT_CURRENT_STATE_AUDIT_2026_10_12.md`
- `docs/07_modules/invoice-zalo/BILLING_V1_PRICING_SNAPSHOT_SCHEMA_GAP_AUDIT.md`

## Business rules added or clarified

- Electricity and water use current official tariffs/rules scoped to Property, with effective-dated versions and source/reference. Contract-level overrides are disallowed. V1 does not require a live government API; meter OCR is out of scope.
- A mid-period utility tariff change requires tariff-segment billing from actual meter readings, including a boundary reading. Usage must not be allocated by days or guessed proportions; Admin may enter readings manually.
- Fixed Service is Property-configured and charged per Room, with versioned/effective-dated prices and historical preservation. Applicability details remain open.
- Facility is distinguished from Paid Service. Flexible Paid Service is not inherently Pool/Gym or a 30-day subscription; valid charges may be one-time, per-use, quantity-based, booking-based, or recurring as appropriate. Góc Trọ is not a POS.
- Parking owns entitlement and assignment state; Billing/Pricing owns its amount under one Property pricing authority. Free entitlements create no charge; paid entitlements use that same authority.
- Price history is append-only. Finalized invoices preserve immutable item snapshots sufficient to explain category, historical label, quantity/unit, unit price, source/version, applicable period where needed, and amount. Utility segment lines may repeat within an invoice.
- Contract does not override utility/service prices. Rent remains Contract-sourced and outside the Property service catalog.

## Superseded rules

- The former rule that Pool/Gym must be a paid subscription with 30-day/720-hour cycles, renewal/cancellation-at-cycle-end behavior, and cycle price snapshots is explicitly marked `SUPERSEDED / REPLACED`. Pool/Gym may instead be a Property Facility and is not the default Flexible Paid Service model. Historical wording remains only where labeled as historical/superseded.
- Old Invoice/Zalo `LOCKED / DOCUMENTED` status is scoped to the previous contract snapshot; it does not claim the new Billing/Pricing and item-snapshot rules are implemented.

## Requirement sections changed

- Header/database alignment and Contract baseline metadata: Database V1.6 is identified as the current local/development physical baseline; V1.1–V1.5 are historical.
- §9: removed the former assumption of recurring Pool/Gym enrollment from Contract-end handling.
- §10: added tariff authority/versioning, actual-reading segmentation, meter-reading business concepts, Fixed/Flexible Service, Parking pricing boundary, append-only price history, invoice-item snapshots, and the Contract/Rent boundary. Open decisions are explicitly retained.
- §13 and §14: separated Facility from Paid Service and recorded Parking entitlement/pricing responsibilities and unresolved charging units.
- §21.4 and §21.6: added Billing/Pricing acceptance criteria and a business-decision history, marking the former Pool/Gym model superseded.
- “Các quyết định thay đổi” and “Các điểm còn chưa xác định”: recorded the decision history and retained only unresolved product/technical decisions.

## API Spec sections changed

- Header, Database alignment, source-of-truth and Contract baseline metadata: aligned to Database/Prisma V1.6 as current local/dev baseline.
- §5.8: documented Property tariff authority, actual-reading tariff segmentation, charge/input and item-snapshot requirements, immutability, and V1.7 design-pending boundaries; distinguished current aggregate-only V1.2 DTO from the approved future breakdown.
- §5.10–§5.11: distinguished Facility, Fixed/Flexible Paid Service, and Parking entitlement versus pricing authority; former Pool/Gym subscription APIs are labeled superseded.
- Transaction, idempotency, derived-state, request-example, route-index, permission, scope, blocker, validation-checklist and implementation-gate wording was aligned where old Pool/Gym/current-baseline assumptions would conflict. No final new endpoint or field names were invented.

## Stale wording removed or classified

- Corrected stale claims that Database V1.3/V1.5 is the current physical baseline and stale V1.7-not-yet-implemented metadata; current local/dev baseline is Database V1.6, while V1.1–V1.5 remain historical snapshots.
- Removed the old Pool/Gym model from current business/API behavior and marked retained examples/operations as superseded history.
- Replaced generic “pricing undecided” statements with approved business authority and the exact still-open decisions. The existing fail-closed implementation status remains explicit.

## Open product decisions retained

- Electricity flat/tier tariff model, locality/provider water tariff details, and rounding.
- Fixed Service price changes within an invoice period and detailed Room applicability.
- Flexible Paid Service cancellation/refund behavior.
- Parking charge unit and mid-period assignment/proration.
- Exact API/DTO and physical schema fields, meter-reading/item representation, and V1.7 design.

These remain `PRODUCT DECISION REQUIRED` or `DESIGN PENDING / V1.7 DESIGN REQUIRED`; this sync does not choose them.

## Conflicts and implementation gaps remaining

- Database V1.6 and current backend do not yet supply the newly required utility tariff segmentation, Property/Room service pricing, billable-charge intake, or immutable invoice-item snapshot capabilities. This is an implementation gap, not a conflicting business rule. The API Spec keeps finalization fail-closed until authoritative data and V1.7 design/implementation are available.
- Database V1.6 retains prior Amenity/subscription structures physically. Their presence does not reinstate the superseded Pool/Gym business model.
- No Database, Prisma, backend, frontend, migration, seed, or Payment implementation was changed or run.

## Files modified

- `../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`
- `../GocTro-SmartBuilding/docs/04_API_SPEC.md`
- `BILLING_V1_7_CANONICAL_REQUIREMENT_SYNC_REPORT.md` (this report)

## Exact next task

`GÓC TRỌ — FULL REQUIREMENT ↔ IMPLEMENTATION COVERAGE AUDIT`

Compare the updated Requirement with current source before designing Database V1.7. Do not begin V1.7 implementation as part of this sync.
