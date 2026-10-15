# Database V1.7 Populated-Target Validator Compatibility Report

- **Date:** 2026-10-13
- **Status:** **POPULATED-TARGET VALIDATOR COMPATIBILITY = PASS — V1.7 NOT PROMOTED**
- **Runtime:** PostgreSQL 18.6, isolated disposable cluster on port 55432
- **Current physical baseline:** Database V1.6 / `Goctro_test3`; unchanged

## 1. Scope and authority

Resolved the mismatch between V1.7 core model validation and seed-specific demo assertions. Read the documentation rules/catalog, canonical Requirement/API/Database Changelog, Database V1.6 and V1.7 schema/seed/validators/migration, and the V1.7 implementation, promotion, guard, and blocked-apply reports. No database business schema, seed, migration, Prisma mapping, backend, or frontend design was changed. Prisma CLI format/validate/generate was run as requested; formatting was idempotent on the final check.

## 2. Original blocker

**Confirmed: YES.** The sole V1.7 validator required seeded values such as Invoice `5010`, Property `11`, tariff/version `10001`/`10101`, the exact 120 kWh 50/50/20 sample, and exact service, facility, and Parking fixtures. Its 171 assertions combined V1.6 regression and V1.7 behavior with fixed baseline/demo identifiers, so it was not safe to run against a populated migration target without applying synthetic seed data.

## 3. Original V1.7 check classification

Classification below is for the original V1.7-01..74 assertions **as written**, based on their query/probe inputs:

| Classification | Check IDs | Reason |
|---|---|---|
| CORE / populated-target safe (8) | `01`, `02`, `04`, `13`–`17` | Table inventory, legacy aggregate/no-fabricated-item invariant, column type, index/trigger existence, and absence of Room price applicability table; no required demo ID/value. |
| FIXTURE / synthetic-only (66) | `03`, `05`–`12`, `18`–`74` | Exact seed invoice/property/parking/tariff/service/facility values, or probes tied to fixed V1.6 owner/property/account/contract IDs and fixed validator IDs. |

Several business probes in the second group were made portable equivalents in the new CORE validator using transaction-generated records; the original checks remain in the fixture suite unchanged.

## 4. Validator architecture and behavior

- `Database V1.7/runtime_validator.sql`: **CORE, 71 checks**. Verifies table/column inventory, utility tariff shapes, progressive Electricity tier rules (including zero start, contiguous ranges, one open tier, and final open tier), Water rates, immutable published prices/Amenity history, meter precision/context, invoice meter snapshots, all six valid Invoice item categories, source/tenant constraints, quantity/amount tier reconciliation, Flexible Service idempotency, Parking entitlement billability (including rejecting `LEGACY_UNCLASSIFIED` billing inference), Facility independence, finalized financial immutability, payment status transition, snapshot lifecycle, and legacy aggregate safety.
- Probe business rows use generated `max(id)+1` values, `OVERRIDING SYSTEM VALUE`, and transaction-scoped context. The validator obtains the affected table locks to prevent concurrent max-ID collisions. It does not call `nextval`/`setval`; the ending `ROLLBACK` removes probe records and temporary state.
- `Database V1.7/runtime_validator_fixture.sql`: **FIXTURE, 171 checks** (97 V1.6 regression + 74 original V1.7 behavioral/structural checks). It keeps the prior full suite and is clearly marked as requiring V1.6 baseline seed plus V1.7 overlay seed, or the combined V1.7 clean-install seed.
- CORE is selected for populated migration targets, including `Goctro_test3` after any separately authorized migration. The fixture suite and V1.7 seed are not for populated targets.

## 5. Files changed

- `GocTro-SmartBuilding/Database V1.7/runtime_validator.sql`
- `GocTro-SmartBuilding/Database V1.7/runtime_validator_fixture.sql`
- `GocTro-SmartBuilding/Database V1.7/README.md`
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`
- This report.

Not changed: V1.7 `schema.sql`, `seed.sql`, `seed.v1_7.sql`, migration, Prisma field/type/relation mapping, canonical Requirement/API, backend, frontend, and Goctro_test3. Prisma `format` was run as required and was idempotent on the final check; `schema.prisma` was already marked modified before this task began.

## 6. Populated migration-only rehearsal (Path A)

Fresh disposable PostgreSQL 18.6 database:

1. V1.6 `schema.sql`: **PASS**.
2. V1.6 `seed.sql`: **PASS**.
3. V1.6 `runtime_validator.sql`: **97/97 PASS**.
4. Added three non-PII synthetic Rooms, three Residents, and three draft Contracts to simulate a populated target; the V1.6 seed also supplied legacy invoices and active Parking assignments.
5. Captured all 28 V1.6 table row counts and stable content fingerprints.
6. Applied the checked-in V1.7 migration; public table count became **40**.
7. Did **not** run `seed.v1_7.sql` or the fixture validator.
8. V1.7 CORE: **71/71 PASS, 0 failed**.

### Legacy preservation

**PASS.** All 28 original tables retained their row counts and stable row-content fingerprints. Three finalized legacy invoices remained `LEGACY_AGGREGATE`; no `invoice_items` were fabricated. Three active pre-existing Parking assignments remained with `entitlement_id IS NULL`. The validator inserted no persistent records; all probe data rolled back.

## 7. Synthetic upgrade rehearsal (Path B)

Fresh disposable PostgreSQL 18.6 database: V1.6 schema + seed + runtime **97/97 PASS** → V1.7 migration → `seed.v1_7.sql` → V1.7 CORE **71/71 PASS** → FIXTURE **171/171 PASS**. Public table count: **40**. **Path B = PASS.**

## 8. Clean-install rehearsal (Path C)

Separate fresh disposable PostgreSQL 18.6 database: V1.7 `schema.sql` + combined `seed.sql` → CORE **71/71 PASS** → FIXTURE **171/171 PASS**. Public table count: **40**. **Path C = PASS.**

For Paths B/C, 242 checks were executed per path (71 CORE + 171 FIXTURE). This is an execution total; some invariants intentionally overlap, so it is not a count of unique assertions.

## 9. Prisma

Used a deliberately unreachable placeholder `DATABASE_URL`; these commands did not connect to any database:

- `prisma format`: **PASS**, final format idempotent.
- `prisma validate`: **PASS**.
- `prisma generate`: **PASS**. Initial sandbox call hit Windows `EPERM` resolving `node_modules/@prisma/client`; the same generation command succeeded with the required local filesystem access. No Prisma mapping change was needed.

No `db pull`, `db push`, migrate, seed, or SQL write was run by Prisma.

## 10. Goctro_test3

**NO CONNECTION — NO CHANGE.** All SQL rehearsals used three generated disposable database names on the isolated temporary cluster at port 55432. Those databases were dropped after results were captured. `Goctro_test3` was neither connected to nor queried, migrated, seeded, backed up, or modified.

## 11. Remaining risks and limits

- CORE takes `SHARE ROW EXCLUSIVE` locks on the tables it probes to make explicit max-ID allocation safe from concurrent inserts. Run it in a controlled maintenance/validation window with the required table privileges.
- The original FIXTURE suite remains intentionally seed-dependent. Running it on an arbitrary populated target is unsupported.
- This proves disposable schema/migration compatibility only. It does not promote V1.7, authorize an apply, or prove application/backend billing behavior.

## 12. Outcome and next task

- Original validator blocker confirmed: **YES**.
- CORE/FIXTURE split implemented: **YES**.
- CORE: **71/71 PASS**.
- FIXTURE: **171/171 PASS**.
- Populated migration-only rehearsal without V1.7 seed: **PASS**.
- Populated simulation: **PASS**.
- Legacy preservation: **PASS**.
- Synthetic upgrade: **PASS**.
- Clean install: **PASS**.
- Prisma format / validate / generate: **PASS / PASS / PASS**.
- `Goctro_test3` changed: **NO**.
- V1.7 promoted: **NO**; V1.6 remains current physical LOCK baseline.
- **POPULATED-TARGET VALIDATOR COMPATIBILITY: PASS.**

Exact next task:

> **GÓC TRỌ — DATABASE V1.7 LOCKED-DB APPLY + POST-MIGRATION VALIDATION — RE-RUN**
>
> Back up `Goctro_test3`, apply the V1.7 migration only, run the CORE validator only (71 checks), do not run either V1.7 seed or the fixture validator on the populated target, validate preservation, and update the baseline only if every required check passes.

Disposable logs and the temporary rehearsal harness are retained under `D:\codexapp\.tmp-v17-validator-rehearsal\logs` for audit. No temporary database remains.
