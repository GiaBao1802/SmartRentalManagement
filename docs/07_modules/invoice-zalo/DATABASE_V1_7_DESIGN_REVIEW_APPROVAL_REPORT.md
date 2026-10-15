# Góc Trọ — Database V1.7 Design Review + Approval Report

- **Date:** 2026-10-13
- **Status:** **DATABASE V1.7 DESIGN APPROVED — READY FOR MIGRATION IMPLEMENTATION PASS**
- **Scope:** Review Billing V1.7 API/database proposal, lock the approved business rules, synchronize canonical docs, and assess migration readiness.
- **Not performed:** No database connection/write, migration, SQL execution, Prisma edit, backend/frontend/Payment/Zalo implementation, commit, or push.
- **Current physical baseline:** Database V1.6, local/development locked baseline, PostgreSQL 18.6, 28 public tables. V1.7 does not exist physically.

## 1. Review scope and sources

Reviewed the documentation rules/catalog, canonical Requirement/API/Database Changelog, V1.6 schema/ERD/runtime validator, current V1.6 Prisma mapping, and the Billing V1.7 product decision, design, pricing-gap, and requirement-coverage reports. The technical proposal reviewed was `BILLING_V1_7_API_DATABASE_DESIGN_REPORT.md`.

Canonical business sources after this pass: `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` and `docs/04_API_SPEC.md`. Database physical authority remains V1.6 until a separately authorized implementation/validation pass succeeds.

## 2. Decision summary

All approved V1.7 business decisions are documented in the canonical Requirement and API Spec. The proposal is suitable for additive migration implementation. Exact endpoint paths/DTO details remain implementation-contract work; they do not block physical schema design because the approved business invariants and required data are clear.

### Locked decisions

- Utility tariffs remain Property-scoped, immutable/versioned, with one version per utility selected at Invoice `period_start`; electricity is progressive tiered kWh, Water is one price per m³, and mid-period changes do not split a billing period.
- Flexible Service price is resolved server-side from the latest eligible price version at the service occurrence time/date (`effective_from <= occurred_at`); client-supplied price is never authoritative.
- Meter readings retain up to three decimal places; usage is not rounded prematurely. Electricity rounds each tier amount to whole VND using half-up; Water rounds the final line amount half-up; Flexible/Parking round each line half-up; Fixed VND prices are whole VND. The invoice total is the sum of rounded item amounts. Use decimal-safe arithmetic, never binary floating-point for money.
- One enabled Fixed Service applies to every eligible Room in its Property in V1. No per-Room applicability table is needed.
- Water provider/locality/source/publication fields are optional provenance/audit metadata only. No live Water-provider API or operational subsystem is required.
- Parking recurring charges require an active paid entitlement, valid Property pricing item/version, and eligibility at `period_start`. If it becomes active after that point, the recurring charge begins next period; if eligible at the start, charge the whole period. No proration. Any future one-time activation fee is a separate explicit item. Free creates no Invoice Item; legacy unclassified is never inferred as paid or free.
- A shared Property pricing authority remains for Fixed Service, Flexible Service and Parking. Facility metadata is separate and never billable merely by existing.
- New finalized V1.7 invoices use `invoice_items` as financial-detail authority. Existing aggregate Invoice columns are compatibility snapshots derived during finalization. The total is derived from rounded items and reconciled before finalization.
- Electricity uses one parent Invoice Item and tier child snapshots. Tier quantity and rounded amount sums reconcile to the parent. Finalized display never consults live tier data.
- `meter_readings` is the historical manual observation record; `invoice_meter_reading_snapshots` stores the exact reading and provenance used at invoice finalization. Existing Invoice reading fields are compatible copies that must reconcile. Do not create tariff-boundary readings.
- Finalized V1.6 invoices remain `LEGACY_AGGREGATE`, retain their exact totals and get no fabricated item/tier/rate/timestamp; API reports `itemization_available=false`. New finalized V1.7 invoices are `ITEMIZED`.
- Preserve legacy Amenity, price history, subscription, and cycle records. Old Pool/Gym 720-hour cycles remain historical; do not convert them into current Invoice charges. Map a descriptive Amenity to Facility only when an exact safe mapping exists.
- Published tariff/property price versions and Amenity price history are append-only. Corrections append a new version with reason/actor/audit and optional supersedes link. Finalized snapshots pin the actual version used.

## 3. Decisions changed or clarified by this review

- **Flexible price date:** Locked to service `occurred_at`; the prior design's review question is resolved. The price version is server-selected, not client-provided. Effective-date comparison must use a consistent business timezone; a date-only effective value is inclusive from the start of that business date.
- **Rounding:** Previously open in the proposal; now locked to line/tier half-up rules above and a total formed by summing rounded item amounts.
- **Fixed Service scope:** Previously conditional; now applies to all eligible Property Rooms in V1. A room-specific inclusion/exclusion table is expressly excluded.
- **Water source metadata:** Previously listed as operationally open; basic provider/locality/source metadata is approved as audit-only. Only official electricity import/update operations remain an operational design item.
- **Parking partial period:** Previously unresolved; now explicitly no proration. Charge starts next billing period after a mid-period paid activation.
- **Parking billability:** Refined to require active paid entitlement + valid shared price/version + eligibility at period start. No automatic charge from an assignment alone; free has no line; legacy unclassified cannot be silently classified.
- **Invoice financial authority:** Made explicit: item rows are authoritative for new itemized V1.7 invoices; aggregate columns are derived compatibility snapshots, not a second editable amount source.

## 4. Table-by-table review

All 12 proposed tables are retained as additive entities. Eleven are **APPROVE** as proposed; `parking_entitlements` is **CHANGE REQUIRED** at the column/constraint level so the database can distinguish entitlement shape (slot/card) from billability (paid/free/legacy-unclassified). No rename, merge, removal, or extra table is required.

| Proposed table | Decision | Review result / implementation guard |
|---|---|---|
| `utility_tariffs` | APPROVE | Property-scoped identity; constrain utility to `ELECTRICITY`/`WATER`; composite Property/Owner FK and stable Property/type/code uniqueness. |
| `utility_tariff_versions` | APPROVE | Effective version, rate/mode, source metadata and actor/time. Unique version/effective-date keys; composite tariff/Property/Owner identity; published versions immutable. Water provenance remains optional audit metadata. |
| `electricity_tariff_tiers` | APPROVE | Version-scoped progressive ranges; inclusive lower/exclusive upper; exactly one final open tier and contiguous published tier set. CHECK/unique/index plus publish-time DB trigger and backend validation. |
| `property_facilities` | APPROVE | Informational facility only; Property/Owner scope; optional unique legacy Amenity reference. Never creates an Invoice line by existence. |
| `property_pricing_items` | APPROVE | Shared Property price catalog for explicit kinds `FIXED_SERVICE`, `FLEXIBLE_SERVICE`, `PARKING`; no Facility prices and no Contract override. Fixed Service is automatically applicable to all eligible Rooms; no applicability table. |
| `property_price_versions` | APPROVE | Append-only effective price snapshots under one pricing item; unique version/effective keys and immutable once published. Actor/reason/source and correction lineage are retained. |
| `flexible_service_charges` | APPROVE | Event/charge input with Owner/Property/Room/Contract and optional Resident context; stable source event key, idempotent same-payload replay, changed-payload conflict. Server resolves price at `occurred_at`, computes amount and controls READY/INVOICED/VOID; no client authority over price/amount. |
| `parking_entitlements` | CHANGE REQUIRED | Keep the requested `entitlement_type` values (`PAID_SLOT`, `FREE_SLOT`, `MOTORCYCLE_VEHICLE_CARD`, `APARTMENT_VEHICLE_CARD`, `LEGACY_UNCLASSIFIED`) and add a separate billability dimension (`PAID`, `FREE`, `UNCLASSIFIED` or equivalent). A vehicle-card type may itself be paid or free; the type list alone cannot state whether recurring billing is allowed. CHECK/FK rules require a same-Property PARKING price item/version for `PAID`, forbid price reference/Invoice Item for `FREE`, and prohibit inferring `PAID`/`FREE` for legacy unclassified. Existing assignment FK remains nullable for legacy rows. A `PAID_SLOT`/`FREE_SLOT` type must agree with billability. This is a column/constraint refinement, not a new table or product decision. |
| `meter_readings` | APPROVE | Immutable manual observation, utility, value, reading time, context, source Account and optional correction link. NUMERIC precision preserves up to 3 decimals; corrections append. |
| `invoice_meter_reading_snapshots` | APPROVE | Unique invoice/utility/role opening and ending provenance, including manual, prior finalized invoice, contract initial, or predecessor closing. Composite context FKs; backend checks rental continuity; snapshots reconcile to retained Invoice reading fields. |
| `invoice_items` | APPROVE | Authoritative rounded financial lines with category, label, quantity/unit, price, amount, source/version and applicable period/calculation metadata. Unique invoice/item key and one-time source-charge references; tenant-safe invoice/source FKs and category/source-shape checks. |
| `invoice_item_electricity_tiers` | APPROVE | Child tier snapshots under one ELECTRICITY parent; copy tier boundaries/rate/quantity/rounded amount. Deferred DB reconciliation plus backend validation; historical display does not query live tiers. |

Expected additive table count remains 12 (28 V1.6 + 12 = 40 public tables if implementation adds exactly this proposal). This is a design estimate, not a validated V1.7 table count.

## 5. Column, FK, uniqueness, and deletion review

- New Owner-scoped rows carry `owner_id` and Property context where applicable. Use composite unique keys and foreign keys compatible with V1.6's Owner/Property/Room/Contract context pattern so a child reference cannot cross Owner or Property.
- Every Account actor reference must match the row's Owner. Resident/Room/Contract/Vehicle context must be validated by composite FK where keys exist; where rental continuity or temporal eligibility cannot be expressed as a simple FK, backend transaction validation is required.
- Invoice-related children carry enough invoice/contract/property/owner context for composite FKs. Item source references (tariff version, property price version, flexible charge, parking assignment) must match category and the same tenant/property context.
- `invoice_meter_reading_snapshots` source Invoice/Contract must match owner/property/room context. Whether it is the immediately prior eligible invoice in the same rental continuity is temporal and remains a backend transaction check.
- `parking_slot_assignments.entitlement_id` stays nullable to preserve V1.6 legacy rows. New assignments require explicit entitlement. Entitlement carries distinct type and billability classification; paid price item must match Owner/Property and have kind `PARKING`; active slot, vehicle and Contract capacity rules remain in force.
- Use `ON DELETE RESTRICT` for financial, version, assignment, reading, and audit history references. No cascade may erase finalized invoice items, price versions, meter provenance, legacy Amenity history, or assignments. Mutable catalog visibility uses status/archive flags instead of historical hard delete.
- Use unique constraints for stable codes, per-parent version/order keys, invoice/item keys, one snapshot per invoice/utility/role, source event keys, and payment/item source anti-duplication. Partial uniqueness, cross-row sums, tier contiguity, append-only rules and temporal checks need PostgreSQL indexes/triggers/backend checks as appropriate.

## 6. Types, precision, and PostgreSQL-specific rules

Use PostgreSQL `NUMERIC` for meter/quantity and any fractional calculation inputs; keep VND monetary snapshots in whole-VND integer storage after approved rounding. Avoid JS/TS binary floating-point conversion for authoritative money. Use project-consistent PostgreSQL varchar/text plus CHECK constraints and Prisma `String` for enum-like codes: utility, invoice item category, pricing kind, snapshot kind, meter utility, parking entitlement type, state, and snapshot role.

Approved value sets include utility `ELECTRICITY`/`WATER`; item categories `RENT`/`ELECTRICITY`/`WATER`/`FIXED_SERVICE`/`FLEXIBLE_SERVICE`/`PARKING`; pricing kinds `FIXED_SERVICE`/`FLEXIBLE_SERVICE`/`PARKING`; snapshot kinds `NOT_FINALIZED`/`LEGACY_AGGREGATE`/`ITEMIZED`; meter utility `ELECTRICITY`/`WATER`; and the five Parking `entitlement_type` values in the table review. Parking billability is a separate constrained field and must not be collapsed into these entitlement types.

Prisma mapping cannot fully represent CHECK constraints, partial unique indexes, deferrable/cross-row reconciliation, tier-publication validation, immutable-history triggers, finalize-state guards, or temporal same-continuity rules. PostgreSQL remains authority for DB-expressible invariants; backend performs Owner/eligibility/continuity checks in transactions. No change to V1.6 conventions is requested here.

## 7. Utility / meter / Facility / service review

- **Utility:** Approve Property tariff identity and append-only effective versions. Keep one selected version per utility per invoice period at `period_start`, no intra-period split. Electricity uses progressive tier snapshots; Water uses one flat m³ price. Official Electricity tariff import/version reconciliation remains operational work, not a schema blocker.
- **Water metadata:** Keep optional provider/locality/source/reference/publication/note fields only as provenance. No provider table/service/API integration is needed for V1.
- **Meter:** Approve the two-role model: source observations in `meter_readings`; exact finalization snapshot and source provenance in `invoice_meter_reading_snapshots`. Existing numeric Invoice fields are copies for compatibility, not a third authority. Do not mint readings at tariff boundaries.
- **Facility/Paid Service:** Approve separate `property_facilities` and shared paid-price catalog. Facility existence is never billable. `property_pricing_items` covers Fixed, Flexible, Parking explicitly. Fixed items apply to every eligible Room in the Property; no room-override table.
- **Flexible charge:** Approve occurrence-driven, backend-priced event ingestion. Price version selection uses `effective_from <= occurred_at`, latest eligible. Source event identity/time/quantity may be accepted after authorization; unit price and amount are computed by the server. Idempotency key/source event uniqueness prevents duplicate charges.
- **Legacy Amenity:** Preserve every existing row and 720-hour meaning as historical data. Optional descriptive Facility mapping must be lossless. Do not convert old subscription cycles into new charges.

## 8. Parking review

Parking is the authority for assignment/entitlement status; Billing/Pricing is the amount authority. An assignment alone is not billable. Billable recurring Parking requires active assignment/entitlement, paid classification, a valid same-Property `PARKING` item/version and eligibility at `period_start`. A mid-period start is first charged next period; eligibility at `period_start` means a full period amount, regardless of a mid-period end because there is no proration. Free produces no item. Legacy unclassified cannot be charged or treated as free by inference; if classification is required to determine a charge, fail closed until resolved. One-time activation charge must be a separate explicit priced line if approved in a future decision.

Keep assignment history, physical slot exclusivity, vehicle exclusivity, Owner/Property checks, and Contract capacity locking. No silent deletion when capacity changes. Preserve unknown existing assignments and do not invent entitlement/payment state. The implementation schema must store paid/free as a field independent of slot/card type so vehicle-card entitlements are not implicitly billable.

## 9. Invoice item / legacy / rounding review

- Approve one Electricity parent item plus tier children. Parent is the invoice's Electricity line; child tier quantity and rounded amount sums equal parent quantity and amount. Store enough copied labels, ranges, rates, version and calculation rule metadata to reproduce the explanation without a live tariff lookup.
- Water is one line with reading/usage, price version, unit price and rounded amount. Fixed, Flexible and Parking each create explicit item lines according to the approved billing predicate. Rent comes from Contract and is represented as a RENT item.
- Finalize transaction order: (1) lock Invoice; (2) verify draft; (3) resolve Contract/Room/Property; (4) resolve opening/ending readings; (5) resolve tariff versions; (6) calculate electricity tiers; (7) calculate Water; (8) resolve Fixed Services; (9) consume eligible Flexible charges; (10) resolve eligible Parking charges; (11) create Invoice Items; (12) create tier snapshots; (13) create meter snapshots; (14) derive compatibility aggregates; (15) reconcile item/tier/bucket/total sums; (16) transition consumed Flexible charges; (17) transition Invoice to unpaid/ITEMIZED; (18) commit. Any missing or conflicting authoritative input rolls back the transaction and leaves the draft unchanged.
- Every monetary line/tier is rounded half-up to whole VND before total calculation. Total is exactly the sum of rounded items. No independent final rounding of aggregate raw values. Preserve reading/usage precision through calculation. Use decimal arithmetic in database/backend.
- Existing finalized V1.6 invoices are marked legacy aggregate only; do not create synthetic rates, details or timestamps. `itemization_available=false`; values and status remain exact. New V1.7 finalization yields `ITEMIZED`, item details and `itemization_available=true`.

## 10. Immutability and allowed lifecycle changes

Published utility/property price versions, their published tiers, Amenity history, invoice reading snapshots, finalized Invoice Items and tier rows are immutable. Corrections append a new version/observation with reason/actor; final snapshots remain pinned. Draft item edits are permitted only within the draft/finalization transaction; after finalize, financial snapshots cannot update/delete. The existing unpaid→paid lifecycle may change status/payment lifecycle fields while financial snapshot fields stay byte-for-byte unchanged. Foreign keys use restrictive delete behavior.

## 11. API review

The proposed API capabilities are approved as the implementation target: list/read/add immutable tariff versions and tier details; pricing catalog and append-only versions; informational Facility metadata; valid/idempotent Flexible charge ingestion with occurrence time; manual meter readings/history and resolved opening readings; enriched Invoice detail with legacy flag, items, tiers and reading provenance; finalize accepts only authorized readings and returns committed snapshots; Parking assignment/entitlement has no client-set price. Owner comes from session; Resident sees only own eligible finalized invoice. Client cannot send owner context, authoritative price/total, tier results, final status, payment eligibility or arbitrary snapshot state.

No exact V1.7 path/DTO is locked here. Implementation must follow `/api/v1`, current envelopes, decimal-string BigInt IDs, pagination, Owner scoping, allowlists and idempotency conventions. Keep existing Invoice/Zalo/Payment contract boundaries; do not claim these endpoints are implemented. Zalo OA recipient/provider/queue/retry operations remain separate runtime/operational work.

## 12. Canonical documents updated

- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`: §10 billing rules, §21.4 invoice acceptance criteria, §21.6 Facility/Parking acceptance criteria, dated decision history, and remaining-unknowns list now contain the approved decisions.
- `GocTro-SmartBuilding/docs/04_API_SPEC.md`: Invoice status and billing descriptions, §5.10, §5.11, finalize/legacy/rounding summaries, validation checklist, and implementation gate now distinguish approved design from unimplemented physical/API details.
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`: added a V1.7 approved design/planned entry; explicitly keeps V1.6 as current physical baseline.
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`: lists this report and the V1.7 proposal with distinct status.

The earlier canonical sync/product closure reports remain historical evidence of earlier decisions; this review does not rewrite their dated findings.

## 13. Remaining non-blocking decisions and implementation work

- Official Electricity tariff import/update/reconciliation workflow.
- Flexible cancellation/refund detail beyond the existing no-automatic-refund rule.
- Zalo provider/OA account/template, queue/retry and recipient operation.
- Future Room-specific Fixed Service exceptions or Parking activation fees/proration require a new approved business decision; neither is in V1.7.
- Exact API paths/fields/DTOs, SQL objects/triggers, Prisma models, seed and runtime validator are implementation artifacts for the next task.

None blocks migration implementation design. Until the implementation and runtime checks succeed, V1.6 remains the current physical baseline and Invoice finalization stays fail-closed when authoritative V1.7 sources/snapshots are missing.

## 14. Blocking issues

**None identified for the additive V1.7 migration implementation pass.** One non-blocking schema refinement is required for `parking_entitlements`: explicit billability separate from slot/card type, as recorded in the table review. The implementer must preserve all V1.6 rows and regressions, use composite tenant-safe references and restrictive history deletion, and implement the approved temporal/rounding/reconciliation rules. These are implementation acceptance conditions, not unresolved product decisions.

## 15. Readiness and exact next task

**DATABASE V1.7 DESIGN APPROVED — READY FOR MIGRATION IMPLEMENTATION PASS.** This is a design approval only. Database V1.7 is **NOT YET MIGRATED**; V1.6 remains the current locked physical baseline. No permission is granted here to alter Goctro_test3 or another locked/shared database.

**Exact next task:** `GÓC TRỌ — DATABASE V1.7 MIGRATION IMPLEMENTATION + VALIDATION PASS`.

That pass may create the V1.7 migration artifacts, update schema/ERD/Prisma/seed/validator, rehearse on a disposable database, and validate legacy preservation. It must explicitly authorize any target before changing a main/dev database.
