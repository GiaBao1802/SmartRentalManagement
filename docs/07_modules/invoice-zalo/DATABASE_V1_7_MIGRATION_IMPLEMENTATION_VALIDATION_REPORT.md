# Database V1.7 Migration Implementation + Validation Report

- **Date:** 2026-10-13
- **Status:** **REHEARSAL PASS — READY FOR SEPARATE LOCKED-DB PROMOTION REVIEW; NOT PROMOTED**
- **Runtime:** PostgreSQL 18.6
- **Current physical baseline:** Database V1.6 remains LOCKED (28 public tables). V1.7 has only been exercised on disposable rehearsal databases.
- **Authority:** Approved V1.7 design, canonical Requirement/API, Database V1.6 baseline, and V1.7 migration artifacts.

## 1. Recovery scope

Completed the Prisma relation/generation recovery, V1.7 validator completion, real PostgreSQL 18.6 migration rehearsal from V1.6, clean-install rehearsal, and preservation checks. `Goctro_test3` was never connected to. No backend, frontend, migration promotion, or business-rule change was performed.

## 2. Prisma relation fixes

Added Prisma relations for UtilityTariff → UtilityTariffVersion; UtilityTariffVersion → ElectricityTariffTier; Property → PropertyFacility/PricingItem; PricingItem → PriceVersion/FlexibleServiceCharge; ParkingEntitlement → ParkingSlotAssignment; Contract → MeterReading; Invoice → MeterReadingSnapshot/InvoiceItem; InvoiceItem → InvoiceItemElectricityTier; and representable source, publisher, creator, supersession, and cross-reference relations. Composite keys/uniques already present in physical SQL support the mapped composite relations. Existing V1.6 models and physical names were preserved.

## 3. Prisma generate failure cause

The initial `EPERM` was a Windows file lock: project-local `tsx watch src/server.ts` (PID 27896) had a child Node process (PID 28564) holding `query_engine-windows.dll.node`. A subsequent attempt also encountered a Windows realpath permission failure. This was an environment/process lock, not a schema validation error.

## 4. Prisma generate recovery result

Stopped only the verified project-local backend watcher and its engine-locking child. Recovery attempts then completed successfully, including the required elevated retry after the remaining Windows filesystem permission failure. Final `prisma format`, `prisma validate`, and `prisma generate`: **PASS**. Validation used a non-secret placeholder `DATABASE_URL`; no database connection was made by Prisma. The local backend watcher was stopped during recovery and may need restarting for app development.

## 5. PostgreSQL discovery

Found the local PostgreSQL service and PostgreSQL 18.6 client/runtime. Rehearsals used `127.0.0.1:5432`. Database credentials were read locally for the disposable targets and were not emitted in command output or this report.

## 6. Disposable databases

- Upgrade rehearsal: `goctro_v17_rehearsal_20261013_r2` — disposable/non-production.
- Clean-install rehearsal: `goctro_v17_clean_install_20261013` — disposable/non-production.
- An earlier disposable attempt, `goctro_v17_rehearsal_20261013`, exposed a seed-trigger issue, was not used for final PASS evidence, and is not a production target.

Every SQL command in this pass named a disposable database before execution. `Goctro_test3` was excluded.

## 7. V1.6 baseline result

On the upgrade rehearsal target, Database V1.6 `schema.sql` PASS, `seed.sql` PASS, and `runtime_validator.sql` **97/97 PASS**. The validator's transactional probes rolled back.

## 8. Pre-migration evidence

Recorded before migration on the disposable V1.6 target: 28 public tables; accounts 6; invoices 4; amenities 4; amenity price history 6; contracts 5; residents 6; rooms 8; parking areas 2; parking slots 3; vehicles 3; parking assignments 3; payment transactions 5; Zalo send logs 3.

Invoice baseline:

| ID | Status | Total VND | Electricity kWh | Water m³ |
|---|---|---:|---:|---:|
| 5001 | unpaid | 4,040,000 | 1250 → 1330 | 60 → 74 |
| 5002 | paid | 4,395,000 | 500 → 550 | 30 → 36 |
| 5003 | unpaid | 3,550,000 | 850 → 900 | 35 → 40 |
| 5004 | draft | 3,200,000 | not finalized | not finalized |

## 9. Migration SQL fixes

Fixed `reject_finalized_invoice_child_mutation()` so it branches on the triggering table before reading table-specific `OLD`/`NEW` fields. This avoids trying to read `invoice_id` from electricity tier rows during finalized-child checks. Clean-install review also found that the four legacy seed invoices inherited `NOT_FINALIZED`; `seed.sql` now explicitly marks finalized historical invoices `LEGACY_AGGREGATE` and the draft `NOT_FINALIZED`, matching the V1.7 lifecycle check. No constraint was weakened.

## 10. Migration result

Applied `V1_6_to_V1_7_billing.sql` successfully to `goctro_v17_rehearsal_20261013_r2` after the V1.6 baseline passed. Migration added the approved 12 tables and V1.7 invoice/Parking fields and constraints.

## 11. Seed result

The V1.7 overlay seed passed on the migrated V1.6 target and includes electricity tiers, flat water rate, fixed and flexible services, facilities, paid/free parking entitlements, meter readings, itemized invoice 5010, and 120 kWh split 50/50/20.

The combined clean-install `seed.sql` initially exposed the legacy `snapshot_kind` mismatch described in §9. After the explicit snapshot values were added, the seed completed successfully on the clean-install database, including the V1.7 fixture and sequence resets.

## 12. Validator expansion

Retained all 97 V1.6 regression checks and expanded V1.7 behavioral/structural coverage to 74 checks: utility tariff/version selection; positive/negative progressive tiers and Water rules; published price history; meter readings; invoice meter snapshots; item/category/source/tenant rules; tier amount/quantity reconciliation; finalized invoice immutability and unpaid→paid; flexible charge idempotency; parking type/billability; facility independence; legacy invoice preservation; and 40-table inventory. Rejection probes assert the expected database errors; fixture transactions roll back.

## 13. V1.7 validator result

On the migrated upgrade target: **TOTAL=171, PASS=171, FAIL=0**. On the clean-install target after `schema.sql` + corrected `seed.sql`: **TOTAL=171, PASS=171, FAIL=0**. The output explicitly reported `DATABASE V1.7 VALIDATION = PASS`; no required probe was skipped.

## 14. Legacy preservation comparison

Pre/post comparison on the upgrade target passed. Existing IDs and counts for Accounts, Contracts, Residents, Rooms, Amenities and amenity history, Parking areas, Payment transactions, and Zalo logs remained intact. Original invoice IDs 5001–5004 retained their statuses, totals, and historical meter values. Finalized old invoices were truthfully classified as `LEGACY_AGGREGATE`; draft 5004 remained not finalized. No synthetic invoice items were added to legacy invoices. V1.7 added invoice 5010 and expected new Parking demo rows only.

## 15. Table inventory

Both final rehearsal paths had **40 public tables = 28 V1.6 + 12 V1.7**. The inventory matched the approved additive design.

## 16. Parking refinement validation

PASS. Runtime probes confirmed free entitlement has no paid price reference, paid entitlement references same-Property PARKING pricing, paid/free vehicle-card entitlements are valid, `LEGACY_UNCLASSIFIED` is not inferred billable, invalid type/billability pairs are rejected, and conflicting/cross-tenant assignments are rejected by the database rules.

## 17. Invoice immutability validation

PASS. Finalized invoice item/tier mutations and financial changes were rejected; unpaid→paid was accepted without changing financial values. Legacy aggregate invoices retained exact statuses/totals and no fabricated item rows.

## 18. Prisma final result

- `prisma format`: **PASS**
- `prisma validate`: **PASS**
- `prisma generate`: **PASS**

Prisma represents the ordinary supported relations. CHECK constraints, partial indexes, deferred triggers, immutable-history rules, and cross-row reconciliation remain PostgreSQL-authoritative.

## 19. Files changed

- `GocTro-SmartBuilding/Database V1.7/schema.sql`
- `GocTro-SmartBuilding/Database V1.7/migrations/V1_6_to_V1_7_billing.sql`
- `GocTro-SmartBuilding/Database V1.7/seed.sql`
- `GocTro-SmartBuilding/Database V1.7/seed.v1_7.sql`
- `GocTro-SmartBuilding/Database V1.7/runtime_validator.sql`
- `GocTro-SmartBuilding/Database V1.7/README.md`
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`
- `SmartRentalManagement/database/schema.prisma`
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`
- this report

No Requirement, API Spec, backend business logic, frontend, or V1.6 baseline artifact was changed.

## 20. Goctro_test3 status

**UNCHANGED.** No connection, SQL, migration, seed, reset, or drop was issued against `Goctro_test3`.

## 21. Remaining risks

Rehearsal evidence is local and disposable; it does not establish that V1.7 is deployed to or approved for a shared/local locked database. Review the exact migration and preservation evidence before any separate promotion decision. V1.6 remains the current physical LOCK baseline until that review authorizes promotion. No Payment implementation was started.

## 22. Promotion readiness

**READY FOR LOCKED-DB PROMOTION REVIEW = YES.** All rehearsal gates passed. This is readiness for review only; V1.7 was not promoted.

## 23. Exact next task

**GÓC TRỌ — DATABASE V1.7 LOCKED-DB PROMOTION REVIEW**
