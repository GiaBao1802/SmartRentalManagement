# Database V1.7 Locked-DB Promotion Review

- **Date:** 2026-10-13
- **Decision:** **NO-GO — DO NOT APPLY YET**
- **Review target:** `Goctro_test3` at `127.0.0.1:5432`
- **Inspection mode:** READ ONLY
- **Current baseline:** Database V1.6, PostgreSQL 18.6, 28 public tables
- **Promotion status:** V1.7 is not promoted; this review did not write to the target.

## 1. Scope

Reviewed the approved V1.7 design, canonical Requirement/API/changelog, V1.6/V1.7 SQL and ERDs, Prisma mapping, implementation/validation report, target database shape/data, current backend compatibility, and backup/rollback feasibility. No migration, seed, reset, drop, code implementation, or backup was run. Target sessions set `default_transaction_read_only=on`; multi-query inspections used `BEGIN READ ONLY` and were rolled back or closed without writes.

## 2. Rehearsal evidence reviewed

The current V1.7 implementation report records PostgreSQL 18.6 rehearsal evidence:

- V1.6 schema + seed + validator: **97/97 PASS**.
- V1.6→V1.7 upgrade migration and overlay seed: **PASS**.
- V1.7 validator: **171/171 PASS** on both upgrade and clean-install paths.
- Clean-install V1.7 schema + seed: **PASS**.
- Prisma format, validate, generate: **PASS**.
- Runtime table inventory: **40**.
- Legacy preservation, Parking refinement, and finalized Invoice immutability: **PASS**.

The evidence is consistent with the report and changelog. It is rehearsal evidence only; it does not mean V1.7 was promoted.

## 3. Target database inspected

- Target: `Goctro_test3`
- Host/port: `127.0.0.1:5432`
- Operation mode: READ ONLY / INSPECTION
- Runtime: PostgreSQL 18.6 on Windows
- Database size observed: 11 MB

No credentials were printed. No write command was issued against the target.

## 4. Target baseline

**V1.6-compatible: YES.** The target has exactly 28 public tables and matches the V1.6 source inventory. Its current invoices are IDs 5001–5004 with statuses unpaid, paid, unpaid, draft and totals 4,040,000; 4,395,000; 3,550,000; and 3,200,000 VND. Their rent, utility amounts, and historical meter readings match the V1.6 seed evidence.

The target has no `invoices.snapshot_kind`, no `parking_slot_assignments.entitlement_id`, and none of the 12 V1.7 tables. These markers confirm V1.7 is not partially applied.

## 5. Drift assessment

**SAFE NON-BLOCKING** — no schema drift detected. Compared with V1.6 source:

- tables: 28 expected / 28 actual; no missing or extra table;
- columns: 320 expected / 320 actual; no missing or extra column;
- explicit V1.6 indexes: all 44 present; total 115 indexes matches 28 primary-key + 43 unique-constraint + 44 explicit indexes;
- constraints: primary key 28, unique 43, foreign key 50, CHECK 97; all validated;
- triggers/functions: all 8 expected triggers and 8 expected functions present; no disabled user triggers.

There are more persisted rows than the V1.6 synthetic seed in `contracts` (10 vs. 5), `residents` (14 vs. 6), and `rooms` (50 vs. 8). These count differences are expected for a populated target and are not schema differences; their provenance is not inferred from this read-only review. Other critical observed counts include accounts 6, owners 2, invoices 4, amenities 4, amenity price history 6, parking areas 2, slots 3, vehicles 3, assignments 3, payment transactions 5, and Zalo send logs 3. No data was changed.

## 6. Migration artifact review

Reviewed `V1_6_to_V1_7_billing.sql`:

- It is a single explicit `BEGIN`/`COMMIT` transaction.
- It adds the approved 12 tables and V1.7 fields/constraints; it contains no `DROP TABLE`, `DROP COLUMN`, or other destructive DROP statement.
- It adds `parking_slot_assignments.entitlement_id` nullable, preserving legacy assignments without inferred paid/free state.
- It adds `invoices.snapshot_kind` and backfills only by existing Invoice status: draft → `NOT_FINALIZED`; finalized unpaid/paid → `LEGACY_AGGREGATE`.
- It does not rewrite Invoice IDs, statuses, totals, readings, or fabricate legacy Invoice Items.
- It rejects an unexpected public-table count and already-present V1.7 objects.

**Blocking artifact issue:** the migration explicitly raises `Refusing to migrate protected database Goctro_test3` when `current_database()` matches the requested target. Therefore the migration as currently checked in will abort against the exact target under review. This review is prohibited from changing the guard or migration.

## 7. Legacy data risk

The migration shape is safe for the observed populated V1.6 data apart from the target-name guard blocking execution. It preserves the existing Invoice IDs, statuses, financial values and historical meter readings; preserves Contract, Resident, Room, Account, Amenity/history, Parking, Payment transaction and Zalo rows; classifies finalized existing invoices as `LEGACY_AGGREGATE`; leaves draft invoices `NOT_FINALIZED`; and creates no legacy Invoice Items. Parking entitlement stays NULL for old assignments.

The disposable migration rehearsal also passed its pre/post preservation checks. A target-specific backup and fresh pre-migration evidence remain mandatory in the future apply task.

## 8. Runtime/backend compatibility

**SAFE WITH KNOWN LIMITATIONS** based on static review; no backend was started for this read-only review.

- The current Prisma mapping is V1.7. Its Invoice API uses V1.7 columns/tables, so those Invoice routes need the V1.7 physical schema; the present V1.6 target does not provide them.
- The app currently binds `UnconfiguredInvoicePricing`; `calculate()` returns null and finalization returns a conflict before financial update. Thus Billing is not claimed complete and cannot silently finalize a partial itemized invoice.
- The Zalo provider is unconfigured; migration does not provide delivery integration.
- Current Contract code updates existing Parking assignment end/status fields; the new entitlement field is nullable, and no current backend Parking assignment-creation route was found. New Parking flows must later require and enforce explicit entitlement and capacity rules.
- Existing Payment transaction reads use the unchanged table. Payment V1.7 implementation is out of scope.
- Amenity history is protected as append-only; inspected current Amenity handlers update the catalog row and do not mutate history.

No known V1.7 addition makes existing non-Billing reads/writes fail. After promotion, draft Invoice operations can use the V1.7 mapping while finalization remains fail-closed until authoritative pricing/itemization is implemented.

## 9. Backup plan

**VIABLE: YES.** PostgreSQL 18.6 `pg_dump` and `pg_restore` are installed. The target is approximately 11 MB and the inspected D: drive had about 66.4 GB free. No backup was created in this review.

The apply task should create a timestamped custom-format full dump outside the repository in a dedicated protected backup directory, record the exact path, run `pg_restore --list` to verify the archive is readable, and capture pre-migration schema/table/critical-row/Invoice evidence before applying SQL. Command shape (credentials supplied interactively/environment-side, never logged): `pg_dump --host 127.0.0.1 --port 5432 --username <DB_USER> --format=custom --file "<protected-backup-dir>\Goctro_test3-pre-V1.7-<UTC_TIMESTAMP>.dump" Goctro_test3`.

## 10. Rollback plan

**VIABLE: YES, conditional on the apply task verifying the dump before migration.** SQL errors inside the migration transaction roll back when `psql` stops and closes the failed transaction. If post-commit validation fails, stop the backend and restore the pre-migration custom dump, preferably into a replacement database first. Restore command strategy: `pg_restore --host 127.0.0.1 --port 5432 --username <DB_USER> --dbname <REPLACEMENT_DB> --exit-on-error "<verified-archive>"`; validate the restored schema fingerprint, V1.6 validator, critical counts, Invoice financial/meter snapshots, and app DB health before a controlled connection switch. If restoring in place is unavoidable, disconnect clients and use `pg_restore --clean --if-exists --exit-on-error --dbname Goctro_test3` only as the explicit rollback operation. Do not rely on manually dropping V1.7 objects as rollback.

## 11. Promotion validation plan

**Before:** reconfirm host `127.0.0.1`, port `5432`, and database `Goctro_test3`; verify the timestamped dump and `pg_restore --list`; rerun/read V1.6 validator; capture the 28-table/object fingerprint, critical row counts, and Invoice IDs/status/totals/readings.

**Apply:** execute the migration exactly once with `psql -v ON_ERROR_STOP=1 -f ...`; stop at the first error and do not continue. Do not seed the production-like target.

**After:** verify PostgreSQL target identity; confirm 40 public tables, V1.7 columns and constraints; run V1.7 validator (171/171); compare all captured legacy evidence; run Prisma validate/generate as appropriate; verify backend DB health/startup and that Invoice finalization remains fail-closed. On any failure, stop backend work and restore the verified dump.

## 12. Risks

- **Blocking now:** the migration guard rejects `Goctro_test3`, so the proposed apply task cannot execute the current artifact as-is.
- The Billing pricing engine and Zalo provider are intentionally unconfigured; database promotion alone does not finish those integrations.
- The target is populated beyond seed counts. The structural V1.6 comparison is exact, and the upgrade rehearsal demonstrates preservation, but the apply task must capture target-specific row evidence and use its verified dump.
- No backup was created or restore performed here, by scope.

## 13. Blocking issues

One blocker: reconcile the explicit `Goctro_test3` refusal guard with the approved, separately authorized target-specific apply workflow. This review did not edit the migration. Keep the target protected until a narrowly scoped guard change is reviewed and retested on disposable PostgreSQL.

## 14. GO/NO-GO decision

# NO-GO

The target baseline, disposable rehearsal evidence, backup tooling, rollback strategy, and current backend fail-closed behavior are acceptable. Promotion is **not authorized** because the migration file deliberately refuses the target. After that single guard blocker is resolved and validated, repeat this review before any target write.

## 15. Goctro_test3 changed

**NO.** Inspection used SELECT statements with the PostgreSQL session set to read-only. No schema, row, seed, migration, reset, drop, or backup operation was issued.

## 16. Exact next task

**GÓC TRỌ — DATABASE V1.7 PROTECTED-TARGET GUARD RECONCILIATION**

Limit that task to reconciling the migration's explicit target refusal with the authorized Goctro_test3 apply workflow, while preserving disposable-target protections and re-running the full V1.7 rehearsal. Do not apply to Goctro_test3 in that guard-fix task. Then rerun the promotion review.
