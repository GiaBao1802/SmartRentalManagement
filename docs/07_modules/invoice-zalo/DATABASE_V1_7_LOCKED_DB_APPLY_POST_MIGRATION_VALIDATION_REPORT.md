# Database V1.7 Locked-DB Apply + Post-Migration Validation Report

- **Date:** 2026-10-13
- **Latest result:** **DATABASE V1.7 PROMOTION = PASS / LOCKED LOCAL-DEV** (authorized rerun recorded at the end of this report)
- **Historical first attempt:** Blocked before backup/migration because the original populated-target validator required fixtures. That blocker was subsequently resolved; the historical record is retained below.
- **Target:** `Goctro_test3` at `127.0.0.1:5432`
- **Observed baseline:** Database V1.6, PostgreSQL 18.6, 28 public tables
- **Latest run:** target migration and all required post-migration gates passed; detailed evidence is at the end of this file
- **Historical first-attempt stop point:** pre-apply validator compatibility review; before backup and before any target write

## Historical first attempt — blocked before apply

The following sections (1–12) preserve the earlier attempt's evidence. Its statements that the target was unchanged and V1.7 was not promoted describe that earlier point in time only. The completed authorized rerun is authoritative for the current state.

## 1. Scope

Started the explicitly authorized target-specific promotion task, read the canonical Requirements/API/changelog, Database V1.6/V1.7 sources, Prisma mapping, and current promotion/rehearsal reports. Reconfirmed the target read-only and inspected the V1.7 validator/overlay seed before any write. A blocker was found: the checked-in 171-check V1.7 runtime validator includes mandatory assertions against synthetic V1.7 seed fixtures, while this task expressly prohibits running any V1.7 seed on `Goctro_test3`. Migration therefore was not attempted.

## 2. Target identity

Preflight logged `127.0.0.1:5432/Goctro_test3`, operation `READ ONLY`. Live query returned:

- `current_database()`: `Goctro_test3`
- `inet_server_port()`: `5432`
- PostgreSQL: `18.6`
- `default_transaction_read_only=on`, `transaction_read_only=on`
- public tables: **28**
- V1.7 table markers: **0/12**
- `invoices.snapshot_kind`: absent
- `parking_slot_assignments.entitlement_id`: absent

The preflight transaction ended with `ROLLBACK`. The target is still V1.6; no partial V1.7 migration was detected.

## 3. Backend processes stopped

No project-local backend process or listener on port 4000 was present in the process/port inspection. The only SmartRentalManagement Node processes identified were the frontend dev server on port 3000; PostgreSQL was listening on port 5432. No project process was stopped. The backend was not restarted.

## 4. Backup and verification

- Backup created: **NO**.
- Backup path: **not applicable**.
- `pg_restore --list`: **NOT RUN**.

Stopped before backup because the required post-migration success gate cannot be met by the current validator without violating the no-seed rule. No backup/migration operation was started.

## 5. Pre-migration evidence

A limited fresh read-only preflight was captured: target identity, server version, read-only flags, 28-table count, absence of all 12 V1.7 tables and both V1.7 columns, and current Invoice IDs/status/totals. The full migration-grade object fingerprint, all required row-count capture, and complete Invoice money/meter/period capture were **NOT completed**, because this task stopped before an apply could be safely prepared.

Fresh Invoice evidence observed:

| Invoice | Status | Total (VND) |
|---|---|---:|
| 5001 | unpaid | 4,040,000 |
| 5002 | paid | 4,395,000 |
| 5003 | unpaid | 3,550,000 |
| 5004 | draft | 3,200,000 |

The preceding read-only promotion review captured the full Invoice component/meter/period evidence, but the apply task requires recapture immediately before migration; that full recapture was not completed in this stopped run.

## 6. V1.6 validator

**NOT RUN.** The apply flow stopped before backup/migration after discovering that the required post-migration V1.7 validator would depend on prohibited seed fixtures. Existing V1.6 populated-target validation evidence remains in the migration reports; it is not represented as a fresh run in this task.

## 7. Validator compatibility blocker

The checked-in `Database V1.7/runtime_validator.sql` is not compatible with migration-only validation of a populated V1.6 target without the V1.7 fixture overlay. Its V1.7-01–17 section contains structural checks mixed with hard assertions for synthetic seed data. For example:

- V1.7-05 and V1.7-06 require itemized Invoice `5010` and its seeded 120 kWh tier split. Fresh target inspection confirmed Invoice `5010` is absent.
- V1.7-07 requires exactly three `FIXED_SERVICE` pricing items for Property 11.
- V1.7-08 requires two seeded facilities mapped to legacy amenities.
- V1.7-09 and V1.7-10 require seeded paid/free parking and vehicle-card entitlements.
- V1.7-12 requires the seeded published future tariff `utility_tariff_id=10001`, version effective 2026-12-01. Fresh target inspection confirmed all V1.7 tables, including its tariff table, are absent before migration.

The overlay `seed.v1_7.sql` supplies those examples and also inserts demo Invoice/parking/reading/item records and adjusts sequences. Running it against `Goctro_test3` would violate the explicit “DO NOT seed” instruction and would add synthetic business data to this populated target. The validator's transactional rollback does not authorize that seed, and manually inserting equivalent fixtures would have the same problem.

Therefore the prescribed state cannot simultaneously satisfy both requirements as currently written:

1. no seed or manual synthetic fixture writes to `Goctro_test3`; and
2. run the current exact V1.7 validator and require all 171 checks to pass.

This is a **blocking validation-artifact compatibility issue**, not evidence of a database schema failure. The expected 171/171 rehearsal result remains valid for the documented disposable upgrade path that ran the V1.7 overlay seed first.

## 8. Migration command and result

The reviewed same-session command was not executed. **Migration result: NOT RUN.** No SQL migration file was applied.

## 9. Post-migration checks

Not run because migration was not applied:

- 40-table inventory and 12 V1.7 objects;
- legacy Invoice `snapshot_kind` classification and full financial/meter/period comparison;
- legacy row/content preservation;
- V1.7 171-check runtime validator;
- Parking and immutability checks;
- Prisma format/validate/generate;
- backend health, Payment/Zalo smoke, Billing fail-closed verification.

These are **NOT PASS**, not inferred from rehearsal evidence.

## 10. Database and files changed

- `Goctro_test3` changed: **NO**.
- Migration applied: **NO**.
- Seed run: **NO**.
- Backup created: **NO**.
- Database changelog updated: **NO**; its promotion status remains accurate because no migration completed.
- Prisma/backend/frontend/migration/seed files changed: **NO**.
- Documentation changed: this report and the document catalog entry only.

## 11. Current physical baseline and rollback

Database V1.6 remains the current local/development physical LOCK baseline. V1.7 is **not promoted**. Rollback was not required because no target write occurred. The prior review found PostgreSQL 18.6 backup/restore tooling and a viable rollback procedure, but this apply attempt did not create or verify a target backup.

## 12. Exact next task

**GÓC TRỌ — DATABASE V1.7 POPULATED-TARGET VALIDATOR COMPATIBILITY FIX + REHEARSAL**

Make the V1.7 runtime validator distinguish schema/behavior checks from clean-seed fixture expectations so the populated migration path can be validated without inserting synthetic billing data into `Goctro_test3`. Rehearse the revised migration-only populated-target validator on disposable PostgreSQL 18.6 databases, preserve the clean-install/overlay fixture coverage separately, and demonstrate no seed is required on a populated upgrade path. Do not apply V1.7 to `Goctro_test3` in that task. Then rerun the target apply task with the exact backup, evidence, and post-validation gates.

## Latest authorized rerun — 2026-10-13

- **Result:** DATABASE V1.7 PROMOTION = **PASS**. `Goctro_test3` is the current locked local/development V1.7 baseline; V1.6 is its historical predecessor.
- **Target/preflight:** `127.0.0.1:5432/Goctro_test3`, PostgreSQL 18.6; before migration it had exactly 28 public tables, 0/12 V1.7 tables, and neither `invoices.snapshot_kind` nor `parking_slot_assignments.entitlement_id`. Read-only transaction flags and the actual server/database identity were verified.
- **Backup:** A fresh full custom-format backup was created outside the repository: `C:\Users\PHUONG\AppData\Local\Temp\Goctro-db-backups\Goctro_test3_pre_v1_7_20261013_193214.dump`. Size: 171,618 bytes. `pg_restore --list`: PASS. SHA-256: `F2791FEDE704E9C8EB5DB15BFA7416F6CA2813B93CA03D9BB1E725F0018439C1`.
- **Migration artifact:** `Database V1.7/migrations/V1_6_to_V1_7_billing.sql`, 36,993 bytes, SHA-256 `1D7D5AA2D23CA571FF3FDD86374860BE2CE03AF1671E9E273F54339910CF014D`. Its checked-in path is the same one invoked by the latest rehearsal harness; the file timestamp precedes the rehearsal scripts, and it was applied once with `ON_ERROR_STOP=1` plus exact `goctro.allow_locked_db_migration='V1.7'` authorization in the same session. Transaction committed successfully.
- **Schema:** Public tables changed from 28 to 40. All 12 expected V1.7 tables and both marker columns exist; no table from the V1.6 baseline is missing.
- **Legacy preservation:** All 28 prior tables matched both row counts and stable row-content fingerprints before and after (**28/28 PASS**). The four invoices kept their prior IDs, status, period, rent, electricity, water, service and total amounts, meter readings, finalized/due dates, and revisions. Invoices 5001–5003 are `LEGACY_AGGREGATE`; draft Invoice 5004 is `NOT_FINALIZED`. No invoice item, tariff, or other V1.7 synthetic data was added: each of the 12 new tables has zero rows. All three existing parking assignments remain, each with NULL `entitlement_id` (no paid/free inference).

### Invoice evidence captured before and after migration

Amounts are VND. The recorded values below were compared across the migration; every field remained unchanged.

| Invoice | Status | Period | Rent | Electricity | Water | Service | Total | Electricity reading | Water reading | Finalized at | Due date | Revision | V1.7 snapshot |
|---|---|---|---:|---:|---:|---:|---:|---|---|---|---|---:|---|
| 5001 | unpaid | 2026-09-15–2026-10-14 | 3,500,000 | 280,000 | 210,000 | 50,000 | 4,040,000 | 1250→1330 kWh | 60→74 m³ | 2026-10-08 19:23:27 +07 | 2026-10-13 | 2 | `LEGACY_AGGREGATE` |
| 5002 | paid | 2026-08-24–2026-09-22 | 4,100,000 | 175,000 | 90,000 | 30,000 | 4,395,000 | 500→550 kWh | 30→36 m³ | 2026-10-08 19:23:27 +07 | 2026-10-13 | 1 | `LEGACY_AGGREGATE` |
| 5003 | unpaid | 2026-09-18–2026-10-17 | 3,300,000 | 175,000 | 75,000 | 0 | 3,550,000 | 850→900 kWh | 35→40 m³ | 2026-10-08 19:23:27 +07 | 2026-10-13 | 1 | `LEGACY_AGGREGATE` |
| 5004 | draft | 2025-10-15–2025-11-04 | 3,200,000 | 0 | 0 | 0 | 3,200,000 | not finalized | not finalized | NULL | NULL | 1 | `NOT_FINALIZED` |
- **CORE validation:** `Database V1.7/runtime_validator.sql` passed **71/71, 0 failed**. The fixture validator and all V1.7 seeds were not run. A post-validator comparison confirmed probe rows were rolled back and row counts/content across the 40-table database remained identical to the immediate post-migration snapshot.
- **Prisma:** `format` PASS; `validate` PASS; `generate` PASS. The first sandbox generation attempt returned Windows `EPERM`; no backend process was running then, and retry in the local filesystem context succeeded. Prisma used a placeholder URL and did not connect to the database.
- **Backend:** No backend listener existed at the start of this task. The local backend was started for smoke checks. `/api/health` returned HTTP 200 and `/api/health/db` returned HTTP 200. No Billing implementation was changed; database promotion does not mean Billing is complete.
- **Other changes:** No seed, fixture validator, database reset, Prisma `db push`, or unrelated migration was run. No backend/frontend business logic, Requirement, API Spec, or Prisma mapping design was changed. Documentation was synchronized after all promotion gates passed.
- **Files updated:** `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`, `GocTro-SmartBuilding/Database V1.7/README.md`, `SmartRentalManagement/docs/00_CURRENT_STATE.md`, `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`, and this report. `00_CURRENT_STATE.md` did not exist after the docs reorganization, so it was created at the exact path required by the apply task.
- **Evidence files:** Pre-migration row-count/fingerprint snapshot and post-migration snapshots are under the local temp backup directory; migration and CORE logs are under `D:\codexapp\.tmp-v17-validator-rehearsal\logs`. No credential was recorded in this report.
- **Current state:** Database V1.7, PostgreSQL 18.6, 40 tables, schema/migration/CORE PASS, Prisma PASS/PASS/PASS, backend health PASS, **LOCKED LOCAL/DEV**. This lock does not claim production deployment or completed Billing implementation.
