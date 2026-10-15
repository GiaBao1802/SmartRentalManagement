# Database V1.4 → V1.5 Contract Idempotency Migration — Final Report

- **Date:** 2026-10-12
- **Status:** **MIGRATED + VALIDATED FOR LOCAL/DEV; DATABASE V1.5 LOCKED**
- **Scope:** Approved additive database table, Prisma mapping, runtime validation and local/dev startup/regression gates. Contract idempotency backend behavior is not implemented by this pass.
- **Authority:** `GocTro-SmartBuilding/Database V1.5/` and `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`.

## 1. Result

Database V1.5 is the current local/development physical baseline: PostgreSQL 18.6, 28 public tables, schema and seed pass, V1.5 runtime validator 90/90 PASS, and Prisma validate/generate pass. V1.4 remains the historical locked predecessor at 27 public tables. Contract idempotency routes/services and durable replay are still **NOT IMPLEMENTED**; this lock only establishes the physical schema baseline.

## 2. Scope and migration

The approved additive migration [`V1_4_to_V1_5_contract_idempotency.sql`](../../../../GocTro-SmartBuilding/Database%20V1.5/migrations/V1_4_to_V1_5_contract_idempotency.sql) creates exactly one table, `contract_idempotency_requests`, with Owner and composite Account/Owner foreign keys, scoped key-hash uniqueness, fingerprint/state/response checks, and one supporting index. No existing table was altered. No TTL, cleanup, backend, API, frontend, or business logic was added.

The migration ran in a transaction on local `Goctro_test3` at `localhost:5432`, PostgreSQL 18.6. V1.5 reused the V1.4 seed; no request rows were seeded or retained by validation.

## 3. Baseline, backup and preservation evidence

Before migration, the database had 27 public tables, no `contract_idempotency_requests` table, and 9 `room_images` rows. The V1.4 runtime validator passed 69/69; its seed-only validator passed 18/18.

- Verified, readable pre-migration backup: `SmartRentalManagement/.local/backups/Goctro_test3_pre_V1_5_20261012_105849.dump` (145,755 bytes; `pg_restore --list` succeeded).
- Local pre-migration counts and sorted-row SHA-256 fingerprints: `SmartRentalManagement/.local/backups/Goctro_test3_pre_V1_5_20261012_105849.fingerprints.tsv`.
- Populated disposable comparison: `SmartRentalManagement/.local/backups/Goctro_V1_5_pop_pre_20261012110649.fingerprints.tsv` and `Goctro_V1_5_pop_post_20261012110649.fingerprints.tsv`.
- After local migration: 28 public tables, all 27 old table fingerprints unchanged, 9 RoomImage rows preserved, and the new table empty. The validator's temporary probes rolled back.

The three disposable PostgreSQL 18 paths passed: clean V1.4 schema+seed then migration; populated V1.4 with two RoomImage associations then migration; fresh V1.5 schema with V1.4 seed. Each ended at 28 tables and passed V1.5 runtime validation 90/90. V1.4 baseline validation was 69/69 and seed-only validation 18/18. All disposable databases were dropped after evidence capture.

## 4. Runtime and Prisma validation

- Local `Goctro_test3` V1.5 runtime validator: **90/90 PASS, 0 failed**. It retains 68 V1.4 behavior checks, updates the inventory check to 28 tables, and adds 21 V1.5 structure/constraint/rollback-only probe checks.
- Prisma `validate`: **PASS**.
- Prisma `generate`: **PASS**.
- Rollback-only Prisma create/read probe for BigInt, Bytes and Owner/Account relations: **PASS**; transaction rolled back and row count remained zero.
- No `db pull`, `db push`, migration command, seed write to Goctro_test3, or SQL command other than the approved additive migration and rollback-only validator probes was used.

## 5. Application and regression checks

`npm run dev:all` started the existing local stack. These requests returned HTTP 200:

- `http://localhost:4000/api/health`
- `http://localhost:4000/api/health/db`
- `http://localhost:4000/api/v1/auth/csrf`
- `http://localhost:3000/login`

The checked-in frontend example config points `NEXT_PUBLIC_API_BASE_URL` to `http://localhost:4000/api/v1`. No frontend configuration was changed in this pass.

Backend regression suites passed (**295/295**):

| Suite | Result |
|---|---:|
| Auth | 20/20 |
| Contract | 125/125 |
| Property/Room | 44/44 |
| Resident/Occupancy | 49/49 |
| Invoice/Zalo | 36/36 |
| Room Images | 21/21 |
| **Total** | **295/295** |

The initial sandboxed run could not open local ephemeral HTTP sockets (`EACCES`); the same suites were rerun with loopback access and all passed.

Backend `npm run typecheck` and `npm run build` both **fail with 174 TypeScript diagnostics**. All are in `backend/src/app.ts` (legacy Prisma models/fields, old `id`/string ID assumptions) or `backend/src/residents/resident.test.ts` (`residenceStatus`). Neither command reports a diagnostic in `database/schema.prisma` or a V1.5 idempotency mapping reference. These diagnostics are outside this database-only scope; no backend files were edited to address them.

## 6. Lock decision and limits

```yaml
Database V1.5: LOCK
Baseline: current local/development physical baseline
Database V1.4: historical locked predecessor
PostgreSQL: 18.6
Public tables: 28
Schema: PASS
Seed: PASS
Runtime validation: 90/90 PASS
Prisma validate/generate: PASS
Backend regressions: 295/295 PASS
Backend typecheck/build: BLOCKED by existing legacy Prisma references
Contract durable idempotency runtime: NOT IMPLEMENTED
Production deployment: NOT CLAIMED
```

`LOCK` prevents ad hoc schema changes during backend/frontend implementation. Future physical changes require an approved requirement/business-rule change, a new migration/version, and runtime validation before a new baseline is locked.

## 7. Rollback guidance

A verified pre-migration restore point is available at the backup path above. No rollback was performed. Since no replay rows or backend idempotency writes exist yet, a reverse migration that drops the new index/table is structurally possible after stopping application writes and confirming the table remains empty. If any V1.5 request rows are later written, dropping this table would erase replay protection; do not drop it while the covered backend is serving traffic. Retain the table during a backend rollback or require an explicit operations decision and reconciliation plan before destructive rollback.

## 8. Files changed in this pass

**Database source project:**

- `GocTro-SmartBuilding/Database V1.5/README.md`
- `GocTro-SmartBuilding/Database V1.5/changelog.md`
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`

**Application documentation:**

- `SmartRentalManagement/docs/07_modules/contract/DATABASE_V1_4_TO_V1_5_MIGRATION_FINAL_REPORT.md` (this report)
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`
- `SmartRentalManagement/docs/07_modules/contract/DATABASE_V1_5_CONTRACT_IDEMPOTENCY_DESIGN.md` (baseline status note only)

Physical migration and Prisma/schema artifacts were prepared in the resumed implementation pass; no backend/frontend business logic was modified.
