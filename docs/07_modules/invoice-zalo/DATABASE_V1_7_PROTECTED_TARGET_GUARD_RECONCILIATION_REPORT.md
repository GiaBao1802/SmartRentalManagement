# Database V1.7 Protected-Target Guard Reconciliation Report

- **Date:** 2026-10-13
- **Status:** **GUARD RECONCILED — REHEARSAL PASS — NOT PROMOTED**
- **Runtime:** PostgreSQL 18.6, local disposable databases
- **Current physical baseline:** Database V1.6 / `Goctro_test3`; unchanged

## 1. Scope and sources

Reconciled only the V1.7 migration's protected-target safety check, documented the authorized apply-session design, and reran the V1.6→V1.7 disposable rehearsal and clean-install validation. Reviewed the documentation rules/catalog, canonical Requirement and API Spec, Database V1.6/V1.7 schema/seed/validator/migration, current Prisma mapping, V1.7 implementation report, and the prior promotion review. No business schema, API, Requirement, backend, or frontend change was made.

## 2. Original blocker and old behavior

The previous guard unconditionally raised an exception whenever PostgreSQL reported `current_database() = 'Goctro_test3'`. It therefore also blocked a future apply task after explicit promotion authorization. The guard blocker was confirmed in the checked-in migration and in the previous read-only promotion review.

## 3. New fail-closed guard

Before any schema mutation, the transactional migration reads:

```sql
current_setting('goctro.allow_locked_db_migration', true)
```

For the actual protected database name `Goctro_test3`, the migration proceeds only when PostgreSQL's actual `current_database()` is that target and the setting is exactly `V1.7`. Missing and all non-matching values raise SQLSTATE `42501`. `IS DISTINCT FROM` makes an unset/NULL value fail closed. Ordinary disposable databases continue without an authorization setting. The guard remains followed by the existing 28-table V1.6 baseline and duplicate-object checks.

The setting is a custom session GUC: it is not written to a table, migration history, or database configuration. The V1.7 migration is the only code changed to inspect it; it grants no seed, reset, drop, or general database authorization. Closing the `psql` connection discards the session setting.

## 4. Real PostgreSQL guard tests

The checked-in migration contains only the actual protected database name. To exercise the protected branch without connecting to `Goctro_test3`, the disposable test harness made temporary, deleted-at-end copies with the target literal replaced by each test database's own name. The authorization predicate, `current_database()` check, SQLSTATE, baseline checks, and migration body otherwise came directly from the checked-in file. The test names were never added to production migration logic.

| Case | Disposable target | Authorization | Result |
|---|---|---|---|
| A | ordinary disposable database | absent; checked-in migration | **PASS** — migration committed and public table count became 40 |
| B | protected-name test clone | absent | **PASS** — denied with SQLSTATE `42501`; transaction rolled back and 28-table baseline remained |
| C | protected-name test clone | `V1.6` | **PASS** — denied with SQLSTATE `42501`; transaction rolled back and 28-table baseline remained |
| D | protected-name test clone | exact `V1.7` | **PASS** — migration committed; public table count became 40 |

Cases C and D used one `psql` invocation with `-c "SET ..." -f migration.sql`. Case D's successful run confirms `psql` preserved the custom setting from the `-c` action into the migration file on the same PostgreSQL connection/session.

## 5. Safe future apply command

Only a separate approved promotion/apply task may run this command. It must use the verified local credential source; no password is embedded here:

```powershell
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U '<DB_USER>' -d Goctro_test3 `
  -c "SET goctro.allow_locked_db_migration = 'V1.7';" `
  -f "D:\codexapp\GocTro-SmartBuilding\Database V1.7\migrations\V1_6_to_V1_7_billing.sql"
```

This command identifies host, port, and database, sets the exact version-specific signal in the same `psql` session, and retains `ON_ERROR_STOP`. PostgreSQL `current_database()` inside the migration—not a caller-supplied target label—decides whether the protected branch applies. Execute the migration exactly once. Do not reuse the signal as authorization to run a seed or any other operation. This command is a documented mechanism only; no promotion was requested or performed in this task.

## 6. V1.6 → V1.7 upgrade rehearsal

The upgrade path was rerun from a fresh disposable PostgreSQL 18.6 database after changing the guard:

- Database V1.6 `schema.sql`: **PASS**.
- Database V1.6 `seed.sql`: **PASS**.
- Database V1.6 runtime validator: **97/97 PASS**.
- Exact checked-in V1.7 migration on ordinary disposable DB without authorization: **PASS**.
- V1.6 → V1.7 public tables: **40** (28 baseline + 12 approved additive tables).
- V1.7 overlay seed: **PASS**.
- Database V1.7 runtime validator: **171/171 PASS, 0 failed**.
- Legacy preservation: **PASS**. Row counts and deterministic row-content fingerprints for all 28 V1.6 tables matched pre/post migration. The hash comparison intentionally excludes the two additive V1.7 columns (`invoices.snapshot_kind` and `parking_slot_assignments.entitlement_id`); invoice lifecycle validator checks confirm original invoice statuses and totals remain exact. Parking and finalized-Invoice immutability checks passed in the 171-check suite.

## 7. V1.7 clean-install validation

On a separate fresh disposable database, V1.7 `schema.sql` and `seed.sql` both completed successfully; the runtime validator reported **TOTAL=171, PASS=171, FAIL=0**, and public table count was **40**.

## 8. Prisma regression

Using an unreachable placeholder `DATABASE_URL` so Prisma could not connect to any database:

- `prisma format`: **PASS** (a repeat format was content-idempotent; no intentional Prisma schema design/mapping edit was made).
- `prisma validate`: **PASS**.
- `prisma generate`: **PASS**.

No database migration, seed, `db pull`, or `db push` command was run by Prisma.

## 9. Files modified

- `GocTro-SmartBuilding/Database V1.7/migrations/V1_6_to_V1_7_billing.sql` — target guard only.
- `GocTro-SmartBuilding/Database V1.7/README.md` — guard semantics and safe same-session command.
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md` — reconciliation and revalidated rehearsal only; V1.6 remains current.
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md` — indexed this report and marked the prior NO-GO review historical.
- This report.

No Database V1.7 schema/seed/validator design, Prisma mapping, canonical Requirement/API, backend, frontend, or migration history was changed.

## 10. Goctro_test3 and remaining risks

**Goctro_test3 connection/write status: NO CONNECTION, NO CHANGE.** Every PostgreSQL connection in this task selected either the administrative `postgres` database for creating disposable tests or a generated disposable rehearsal database. All generated disposable databases were cleaned up. No target backup, read, migration, seed, reset, or drop was performed.

The guard prevents accidental protected-target execution by default. The exact GUC remains an operator signal rather than an independent approval system; it must only be set by the separately approved target-specific apply task. Promotion still requires rerunning the locked-database review and following its backup, identity, preservation, and post-migration validation gates. V1.6 remains the physical LOCK baseline; V1.7 is **not promoted**.

## 11. Outcome

- Original guard blocker confirmed: **YES**.
- New fail-closed guard implemented: **YES**.
- Missing authorization denied: **PASS**.
- Wrong authorization denied: **PASS**.
- Exact V1.7 authorized path: **PASS**.
- Disposable migration rehearsal: **PASS**.
- V1.7 validator: **171/171 PASS**.
- Clean install: **PASS**.
- Prisma format / validate / generate: **PASS / PASS / PASS**.
- Legacy preservation: **PASS**.
- `Goctro_test3` changed: **NO**.
- **GUARD BLOCKER RESOLVED: YES**.
- **READY TO RERUN PROMOTION REVIEW: YES** (review only; do not apply yet).

### Exact next task

**GÓC TRỌ — DATABASE V1.7 LOCKED-DB PROMOTION REVIEW — RE-RUN**
