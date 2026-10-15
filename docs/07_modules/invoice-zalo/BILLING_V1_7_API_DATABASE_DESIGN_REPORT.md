# Góc Trọ — Billing V1.7 API + Database Design Report

- **Date:** 2026-10-13
- **Status:** **REFERENCE — APPROVED DESIGN PROPOSAL; see `DATABASE_V1_7_DESIGN_REVIEW_APPROVAL_REPORT.md` for the decision**
- **Scope:** Proposed additive Database V1.7 and API contract for approved Billing/Pricing rules. Design only; approved for a separate migration implementation pass. This report remains proposal detail; the linked review report records the final decision and readiness.
- **Authority:** Canonical docs/01_REQUIREMENTS.md is the business authority. This report is a technical proposal, not a new business requirement.

## Sources checked

- SmartRentalManagement/docs/DOCUMENTATION_RULES.md and DOCUMENT_CATALOG.md
- Canonical Requirement, API Spec, and Database Changelog in GocTro-SmartBuilding/docs/
- GocTro-SmartBuilding/Database V1.6/schema.sql, erd.md, and runtime_validator.sql
- SmartRentalManagement/database/schema.prisma
- backend/src/invoices/* and backend/src/zalo/*
- Amenity/Parking schema and legacy API documentation
- PROJECT_CURRENT_STATE_AUDIT_2026_10_12.md, BILLING_V1_PRICING_SNAPSHOT_SCHEMA_GAP_AUDIT.md, BILLING_V1_7_CANONICAL_REQUIREMENT_SYNC_REPORT.md, REQUIREMENT_IMPLEMENTATION_COVERAGE_AUDIT_2026_10_13.md, and BILLING_V1_7_PRODUCT_DECISION_CLOSURE_REPORT.md

Current-source search found no V1 Amenity or Parking backend route/repository module. No source files were changed.

## 1. Current V1.6 gaps

V1.6 is the locked local/development baseline: PostgreSQL 18.6, 28 public tables, schema/seed PASS, runtime validator 97/97 PASS, Prisma validate/generate PASS.

- No utility tariff identity/version or official source metadata.
- No electricity tier model or water price-per-m³ version.
- Invoice contains aggregate rent/electricity/water/service amounts and total, but no first-class item/tier snapshots.
- Finalized Invoice immutability exists at backend level but has no physical DB guard for financial fields/items.
- Amenity schema requires Pool/Gym subscriptions on 720-hour cycles and limits “other” to information; it cannot represent Facility vs Fixed/Flexible Paid Service.
- Amenity price history has no append-only DB trigger.
- Parking tables model area/slot/vehicle/assignment, not entitlement or price.
- Invoice pricing adapter returns null and keeps finalization fail-closed. Its source comment still says pricing rules are “not approved yet”; that explanation is stale because business decisions are now approved, while implementation/configuration is still absent.
- Current draft beginning-reading lookup searches earlier invoices under the same Contract, then falls back to Contract initial values; successor Contract continuity requires a new resolver under this approved rule.
- Current Prisma mapping is V1.6 and has no proposed V1.7 models.

## 2. Proposed V1.7 entities

Twelve additive tables:

| Table | Purpose |
|---|---|
| utility_tariffs | Property-scoped ELECTRICITY/WATER tariff identity |
| utility_tariff_versions | Effective-dated published price and source versions |
| electricity_tariff_tiers | Progressive kWh ranges and prices |
| property_facilities | Informational facilities, independent of charges |
| property_pricing_items | One Property pricing catalog for fixed/flexible services and parking |
| property_price_versions | Append-only effective-dated catalog prices |
| flexible_service_charges | Valid service events, priced by backend |
| parking_entitlements | Paid/free slot or vehicle/card entitlement |
| meter_readings | Immutable manually captured observations |
| invoice_meter_reading_snapshots | Exact opening/ending provenance used at finalization |
| invoice_items | Immutable invoice line snapshots |
| invoice_item_electricity_tiers | Applied tier boundary, quantity, rate, and amount |

Add columns to existing invoices for snapshot provenance/calculation metadata and to parking_slot_assignments for an entitlement reference. Add append-only triggers to amenity_price_history. Retain the remaining V1.6 schema and rows unchanged. No tax engine, accounting ledger, OCR, refund engine, or generic EAV model is proposed.

## 3. Utility tariffs and selection

utility_tariffs belongs to one Property/Owner and stores utility_type (ELECTRICITY or WATER), stable code/name, source/provider/locality metadata, and active/retired state. Enforce unique Property + utility type + code and tenant-safe composite FKs.

utility_tariff_versions stores tariff ID, repeated Property/Owner/utility type for composite constraints, version_no, effective_from DATE, unit, calculation mode, water flat rate where applicable, source name/reference/snapshot, publication metadata, creation actor/time, and optional correction/supersedes reference. Use a unique tariff + effective date + version number. This allows a correction to be an additional immutable version, including a same-date correction, without overwriting history.

For Invoice period_start D, select only published versions in the authenticated Owner’s Property and utility scope where effective_from <= D; choose greatest effective_from, then greatest version_no for a documented same-date correction. Never select by period_end, current date, or client input. Index tariff + effective_from DESC + version_no DESC. Serialize publication by locking the tariff identity in a serializable transaction and retain the unique key as the race backstop.

The operational electricity source import/update process remains open; water provider/locality provenance fields are approved as audit metadata only, with no live provider subsystem. Records retain available source metadata regardless of import method.

## 4. Electricity tiers

Each electricity tier stores version ID, tier_no, lower_kwh (inclusive), upper_kwh (exclusive; nullable only for final tier), and nonnegative unit_price. Require upper > lower, unique (version, tier_no), unique lower bound, and at most one open-ended tier.

For usage U, quantity in range [L,U) is max(0, min(U, upper) - L); the final open tier has no upper cap. Tier quantities must sum to usage.

- CHECK/unique/partial index: nonnegative values, positive tier order, upper > lower, no duplicate order/lower, at most one null upper.
- Publish-time trigger: lock the version; require a first tier at zero, contiguous ranges, exactly one open-ended last tier, and at least one tier.
- Backend: calculate tier quantities and validate input readings.
- Published versions and tiers cannot be edited/deleted; corrections append a new version.

Usage retains exact stored decimal precision; Electricity tier amounts are rounded individually half-up to whole VND, Water final line is rounded half-up, and the Invoice total is derived from rounded item amounts. Use decimal-safe arithmetic.

## 5. Water pricing

Water uses no tier rows. Its tariff version has unit m3, FLAT mode, and one required nonnegative flat_unit_price. Electricity versions have no flat water rate. A CHECK can enforce this by repeating utility type in the version and a composite FK to the tariff identity. Amount = (current reading - beginning reading) × selected version rate, calculated server-side with approved rounding.

## 6. Meter design

**Recommend Option B: first-class meter readings plus finalized invoice reading provenance snapshots.** Invoice/Contract numeric columns alone cannot identify manual reading time/actor or explain whether an opening value came from a same-continuity prior Invoice versus Contract initial reading.

meter_readings records immutable observations: Owner/Property/Room/Contract, utility type, nonnegative value, reading_at, manual source, recording Account, optional note, and optional superseded-reading link. Use composite tenant/context FKs and indexes by Owner+Contract+utility+reading time and Room+utility+reading time. Correct by inserting a new observation, never overwriting; tariff changes do not create observations.

invoice_meter_reading_snapshots records one OPENING and one ENDING snapshot per invoice/utility on V1.7 finalization. Each stores invoice context, value, optional reading time, source kind (MANUAL_READING, FINALIZED_INVOICE, CONTRACT_INITIAL, PREDECESSOR_CONTRACT_CLOSE), and the corresponding meter_reading/source_invoice/source_contract reference. Unique invoice + utility + role. A deferred trigger checks context and that existing Invoice previous/current numeric columns match these snapshots. Contract initial values with no known clock time retain a null timestamp; do not fabricate one.

Beginning resolution uses latest eligible finalized Invoice in the same rental continuity; otherwise Contract initial. Renewal uses predecessor final/closing reading, then latest eligible predecessor Invoice at the boundary. Backend validates continuity; unrelated Room history cannot be selected. Missing reliable opening reading permits draft but blocks finalization. OCR is excluded.

## 7. Fixed Services

Use property_pricing_items with item_kind FIXED_SERVICE, Property/Owner, stable code/name/description, PER_ROOM_PERIOD basis, unit, active flag, and recurring-period configuration. property_price_versions stores effective date, VND rate, version, source/reason, and publication state. There is no Contract override.

Select price at period_start and charge each eligible Room for the whole period. Price changes apply next period and do not prorate. An enabled Fixed Service applies to all eligible Rooms at its Property in V1. Do not add a per-Room applicability table; exceptions require a future approved change.

## 8. Facility vs Paid Service

**Recommend separate property_facilities and paid pricing catalog**, not broadening V1.6 amenities: current CHECK constraints hardcode Pool/Gym subscription semantics and “other” as informational. Reusing it would preserve wrong semantics or require reinterpretation.

property_facilities stores Property, name/type/code, description/location/opening information, active state, and optional unique legacy_amenity_id mapping. A Facility is never billable by existence.

property_pricing_items has kinds FIXED_SERVICE, FLEXIBLE_SERVICE, PARKING and stores billing configuration, not attendance or Spa/Restaurant/Pet Care operations. Safely map descriptive Amenity rows to new Facility records where clear, preserving source IDs and all old Amenity, price, subscription, and cycle rows. Do not reinterpret old cycles as current charges.

## 9. Flexible charge model

flexible_service_charges stores a valid event against one Property FLEXIBLE_SERVICE item: Property/Owner, Room/Contract, optional Resident, service occurrence date/time, quantity/unit, source system/event key, resolved Property price version, server-calculated unit price/amount, READY/INVOICED/VOID status, optional Invoice link, actor/time. Composite FKs enforce tenant and Contract context.

Source event supplies service identity, eligible context, time, quantity/unit, and stable event key; it never supplies authoritative total or unit price. Backend authenticates the source, validates Owner/Contract/Room, resolves price and charging mode, calculates amount, then records it transactionally. Invoice finalize consumes only READY charges in the same Owner/Contract/period; mark them INVOICED atomically. A unique charge reference on InvoiceItem prevents double-billing. Partial unique source-system/event-key index prevents duplicate ingestion; same key/same payload replays, changed payload conflicts. No refund workflow.

**Approved rule:** Select Flexible price by service occurrence time/date: effective date `<= occurred_at`, choose the latest eligible version. The backend resolves it; clients cannot supply authoritative price. Normalize date-only effective values to the start of the agreed business date/timezone when implementing comparison.

## 10. Parking pricing

parking_entitlements belongs to Property and stores entitlement type: PAID_SLOT, FREE_SLOT, MOTORCYCLE_VEHICLE_CARD, APARTMENT_VEHICLE_CARD, or LEGACY_UNCLASSIFIED. Paid entitlement references a property_pricing_item of kind PARKING; free is explicitly non-billable and has no price item. CHECK enforces the free/paid reference shape; backend validates supported future combinations.

Add nullable entitlement_id to parking_slot_assignments for legacy preservation. Map existing unknown assignments to LEGACY_UNCLASSIFIED; do not invent a paid/free classification or price. New assignments require a concrete entitlement through backend validation; making the reference NOT NULL is unsafe until truthful legacy classification is complete. Parking remains assignment authority, Billing uses the shared Property price source. Lock Room/Contract/assignment context while validating capacity and candidate charges.

Supported charge basis: per slot, vehicle/card, or billing period. No proration. Recurring charge requires active paid entitlement, valid Property price item/version, and eligibility at `period_start`; a mid-period start is first charged next billing period. Free entitlement creates no item; legacy unclassified assignment is not inferred to be paid or free. Any future activation fee is a separate explicit item.

## 11. Invoice items and tier snapshots

invoice_items stores invoice/property/owner/contract context; category RENT/ELECTRICITY/WATER/FIXED_SERVICE/FLEXIBLE_SERVICE/PARKING; stable item_key; explicit nullable source FKs for tariff version, Property price version, Flexible charge, or Parking assignment; label/description snapshots; quantity NUMERIC(12,3), unit, nullable unit price for tier-parent items, VND amount BIGINT, calculation rule version, optional applicable period, created_at. Use composite tenant-safe invoice FKs, unique (invoice_id,item_key), category/source checks, nonnegative quantity/amount, and unique source-charge reference.

**Choose one Electricity parent item + invoice_item_electricity_tiers child rows.** Parent snapshots total kWh, tariff version, label, and total; child rows snapshot tier number, original tier reference, bounds, quantity, unit price, and amount. Deferred trigger and backend require tier quantities to sum to parent usage and child amounts to sum to parent amount. Water is one line with price/version/quantity snapshot.

## 12. Total consistency

For new itemized V1.7 invoices, InvoiceItems are authoritative. In one serializable finalize transaction, backend calculates lines, then derives existing aggregate buckets and total_amount from those lines for API/Payment compatibility. Rent is sourced from Contract and copied into the Invoice and its RENT item. Payment continues using invoices.total_amount.

Deferred constraint trigger checks sum(items)=total_amount, category totals equal compatibility buckets, and electricity tier children reconcile with their parent. Cross-row sums cannot be CHECK constraints. Legacy aggregate invoices are explicitly exempt from item reconciliation because they have no honest item rows.

## 13. Immutability

Add invoices.snapshot_kind: NOT_FINALIZED, LEGACY_AGGREGATE, ITEMIZED. Existing draft rows become NOT_FINALIZED; existing unpaid/paid rows become LEGACY_AGGREGATE. New finalization must transition draft to ITEMIZED.

- Invoice items/tier rows may be inserted only while parent is draft. Reject update/delete after parent is finalized; FK deletion is RESTRICT.
- Draft→unpaid trigger requires ITEMIZED state and all item/tier/meter/price references and totals to reconcile.
- Freeze invoice financial columns, snapshot kind, reading snapshots, items, and tier details after finalization. Permit only unpaid→paid lifecycle transition with all financial fields identical.
- Published utility and property price versions reject UPDATE/DELETE. Corrections append a new version with required actor/reason/supersedes audit.
- Add append-only guards to existing amenity_price_history.
- V1.7 does not add post-finalize financial amendment. If approved later, design an explicit revision-preserving flow; otherwise reject direct mutation.

## 14. Legacy handling

**V1.6 invoices:** mark existing finalized rows LEGACY_AGGREGATE and preserve every aggregate, ID, status, and reading. Do not fabricate rate, version, service split, tier, item, or meter timestamp. API returns existing aggregates, snapshot_kind, itemization_available=false, and no invented breakdown. New finalized rows return ITEMIZED plus line/tier details. Draft remains NOT_FINALIZED.

**Amenity:** keep amenities, price history, subscriptions, and cycles unchanged. Map clear descriptive rows to facilities with a source ID; keep the historical 720-hour records, never convert cycles to flexible charges or Invoice items. Append-only trigger prevents future silent edits to amenity price history.

**Parking:** retain all areas, slots, vehicles, assignments. Legacy unclassified mappings carry no price and are not treated as free. No row deletion or date reinterpretation.

## 15. API proposal

All paths below are **proposed V1.7 additions**, not implemented or locked. Keep /api/v1 envelopes, decimal-string BigInt IDs, pagination, and Owner scoping.

| Capability | Proposed endpoint | Authority |
|---|---|---|
| List Property tariffs/versions | GET /properties/{property_id}/utility-tariffs?utility_type=... | Admin, Owner from session |
| Add utility tariff version | POST /properties/{property_id}/utility-tariffs/{tariff_id}/versions | Admin; server validates source, tiers/rate, and publication |
| Read tariff/version/tier detail | GET /properties/{property_id}/utility-tariffs/{tariff_id}/versions/{version_id} | Admin |
| Pricing catalog | GET/POST /properties/{property_id}/pricing-items | Admin |
| Add price version | POST /properties/{property_id}/pricing-items/{item_id}/price-versions | Admin; append only |
| Facility metadata | GET/POST/PATCH /properties/{property_id}/facilities | Admin; informational only |
| Flexible billable charges | POST/GET /properties/{property_id}/service-charges | Admin/authenticated integration; Owner-scoped, idempotent |
| Reading history/input | GET /contracts/{contract_id}/meter-readings; POST /invoices/{invoice_id}/meter-readings | Admin; context derived server-side |
| Invoice detail | Existing GET /invoices/{invoice_id} enriched with snapshot_kind, itemization_available, line_items, tier_details, meter provenance | Admin scoped; Resident own eligible finalized Invoice read-only |
| Invoice finalization | Existing POST /invoices/{invoice_id}/finalize accepts manual ending readings only; response includes committed snapshots | Admin; never accepts price/tier/total/status |
| Parking assignment | Existing assignment commands add entitlement_id; price is server-resolved | Existing role policy; client cannot provide price |

Proposed write payloads provide only allowed event identity/context, date/time, quantity/unit, meter value/time, and idempotency key. Backend derives Owner, validates eligibility, resolves authoritative price, calculates amounts, and creates item snapshots. No endpoint path/field is committed by this design report.

## 16. API security

- Derive Owner from authenticated session; reject/treat client owner_id as non-authoritative.
- Resident may read own finalized Invoice/items only; no price mutation or access to another Resident.
- Resolve Property under session Owner before all Admin writes.
- Bind meter input to Invoice Contract/Room/utility; validate nonnegative/monotonic value and same-continuity opening.
- Resolve tariff/service/parking prices server-side. Client cannot set total, unit price, tier results/amounts, paid status, revision, or foreign context.
- Service event source must authenticate and use a unique stable event key.
- Preserve current indistinguishable scoped 404 behavior.

## 17. Concurrency and idempotency

- Lock tariff/catalog identity while publishing; unique effective/version key plus serializable transaction handles concurrent Admin edits.
- Partial unique source-system/event key plus request fingerprint protects billable ingestion; same payload replay returns stored result, changed payload conflicts. No additional idempotency table proposed for charges.
- Finalize holds Invoice row lock and serializable transaction; resolve readings/versions/charges, create items/tier details, transition charges, derive aggregates, transition Invoice last. Existing durable Idempotency-Key mechanism remains in use.
- Existing one-active-slot/vehicle indexes remain. Lock Room/Contract and relevant assignments before capacity and parking-charge resolution.
- Bound retry attempts and never replay a changed payload as success.

## 18. Prisma proposal

Add Prisma models: UtilityTariff, UtilityTariffVersion, ElectricityTariffTier, PropertyFacility, PropertyPricingItem, PropertyPriceVersion, FlexibleServiceCharge, ParkingEntitlement, MeterReading, InvoiceMeterReadingSnapshot, InvoiceItem, InvoiceItemElectricityTier. Add Invoice and ParkingSlotAssignment fields/relations while retaining V1.6 mappings; use explicit @map/@@map and disambiguated relations for source/current invoice references. Enum-like values can remain strings with SQL CHECK constraints, matching the current schema style.

Prisma supports scalar models, standard/composite FKs, unique constraints, and normal indexes. PostgreSQL remains authoritative for CHECK rules, partial indexes, deferred cross-row reconciliation triggers, tier publish validation, immutable-history/finalized-item triggers, and any range exclusion constraints. Do not edit the actual schema.prisma in this pass.

## 19. ERD delta

Proposed relationships:

- Property 1:N UtilityTariff; UtilityTariff 1:N UtilityTariffVersion; electricity version 1:N ElectricityTariffTier.
- Property 1:N PropertyFacility; Property 1:N PropertyPricingItem; PropertyPricingItem 1:N PropertyPriceVersion.
- PropertyPricingItem 1:N FlexibleServiceCharge; paid ParkingEntitlement N:1 PropertyPricingItem.
- ParkingEntitlement 1:N ParkingSlotAssignment; legacy assignments may map to LEGACY_UNCLASSIFIED.
- Contract 1:N MeterReading; Invoice 1:N InvoiceMeterReadingSnapshot; snapshot optionally refers to MeterReading, source Invoice, or source Contract.
- Invoice 1:N InvoiceItem; InvoiceItem 1:N InvoiceItemElectricityTier.
- InvoiceItem optionally references UtilityTariffVersion, PropertyPriceVersion, FlexibleServiceCharge, or ParkingSlotAssignment.

## 20. Additive migration strategy (proposal only)

1. Create new tables, type/check conventions, composite unique keys/FKs.
2. Add nullable Invoice snapshot/calculation metadata and nullable assignment entitlement reference.
3. Mark old finalized invoices LEGACY_AGGREGATE, old drafts NOT_FINALIZED; create no fake items, prices, or read timestamps.
4. Preserve and safely map clear legacy Amenity and Parking data without reinterpreting historical charges.
5. Add constraints/indexes and triggers; install append-only guards for new price tables and existing amenity_price_history.
6. Update ERD and Prisma in a separately authorized implementation pass.
7. Update seed and validator; preserve all V1.6 regression checks.
8. Rehearse populated V1.6 preservation and rollback on a disposable PostgreSQL target.
9. Only after design review, create a migration implementation task. Do not apply it to Goctro_test3 here.

## 21. Runtime validator plan

Keep all 97 V1.6 regression checks and add:
- existing 28 tables and records preserved; exactly 12 new tables present;
- Owner/Property isolation across new tables;
- period_start effective-version selection; future version excluded;
- racing same-date publication returns one accepted version or conflict;
- tier negative/inverted/duplicate/gap/overlap/no-zero-start/multiple-open/no-open cases rejected;
- valid tier quantities cover usage and reconcile with line amount;
- Water requires one flat m3 rate and rejects tiers;
- published prices and amenity history reject update/delete; correction is append-only;
- meter context, same-continuity inheritance, predecessor renewal, unrelated-room rejection, and unresolved-opening finalize rejection;
- Fixed price selected at period_start with no mid-period price-change proration;
- Facility existence alone creates no charge; Flexible charge validity, idempotent ingestion, and duplicate billing rejection;
- free Parking creates no item; paid Parking uses shared Property price; cross-Owner reference rejects; existing slot/vehicle/capacity rules remain;
- Invoice item/tier FKs, quantity and aggregate reconciliation; finalized Invoice/items/tiers immutable; unpaid→paid remains possible with financial values unchanged;
- V1.6 legacy invoices remain LEGACY_AGGREGATE with unchanged totals and no invented itemization;
- all Amenity/subscription/cycle legacy records remain intact;
- V1.6 Contract, Room, Resident, Room Images, Auth, Payment transaction, and Zalo regressions still pass.

## 22. Synthetic seed plan

Use synthetic, non-PII fixtures:
- Property A with one multi-tier electricity tariff and one flat water tariff.
- Later effective tariff versions after one sample Invoice start date; prove the sample retains its selected versions.
- Fixed catalog: WiFi, management, trash; one price change between Invoice periods.
- Flexible catalog: Spa and Pet Care plus a valid idempotent service event.
- Pool and Gym Facilities with no paid subscriptions.
- Free slot entitlement with no charge and a paid motorcycle/card entitlement linked to a shared Property price.
- Finalized itemized Invoice: Contract-sourced rent; 120 kWh electricity (50/50/20 tier children); single-rate water; Fixed lines; one Flexible charge; only a full-period eligible Parking assignment.
- Preserve a legacy finalized aggregate Invoice fixture with no fabricated breakdown.
- Keep legacy 720-hour Amenity fixture separate and unchanged.
- Include deterministic rounding fixtures: fractional reading usage retained; each electricity tier half-up; water/flexible/parking line half-up; total equals sum of rounded lines.

## 23. Open decisions

- Electricity tariff import/update/reconciliation process.
- Flexible cancellation/refund behavior beyond the no-auto-refund rule.
- Independent Zalo recipient/provider/queue operations.

Approved decisions remain closed: one tariff per utility per period at period_start, progressive kWh tiers, single-rate water, reading continuity, Fixed period-start pricing/all-eligible-Room scope, Flexible `occurred_at` price resolution, audit-only Water source metadata, Parking no-proration/eligibility, half-up decimal-safe rounding, Facility/Flexible separation, Parking pricing authority, immutable item snapshots and no Contract price override.

## 24. Risks

- Same-date price corrections affect future draft resolution; published versions must be immutable with correction actor/reason and finalized Invoice snapshots remain pinned.
- Tier totals and aggregate reconciliation need PostgreSQL triggers plus backend transaction; Prisma alone cannot enforce them.
- V1.6 legacy Amenity cycles cannot be converted to Invoice charges without inventing semantics.
- Parking eligibility and Flexible `occurred_at` price-date cases are approved and must be implemented fail-closed when their authoritative input is unresolved.
- Rollback must keep nullable additive fields and preserve V1.6 app compatibility before the V1.7 app deploys.
- Current finalization remains fail-closed; this proposal changes no runtime behavior.

## 25. Readiness

**DATABASE V1.7 DESIGN: APPROVED — READY FOR MIGRATION IMPLEMENTATION PASS.** The separate design review report approves the 12-table proposal and closes the product decisions listed there. V1.6 remains the current physical baseline; this document authorizes no database change.

## 26. Exact next task

**GÓC TRỌ — DATABASE V1.7 MIGRATION IMPLEMENTATION + VALIDATION PASS**

Implement the approved additive design and validate preservation on a disposable target. Do not mutate Goctro_test3 unless the implementation task explicitly authorizes that target.




