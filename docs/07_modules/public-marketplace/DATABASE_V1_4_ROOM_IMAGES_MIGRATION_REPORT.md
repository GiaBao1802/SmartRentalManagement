# Database V1.4 Room Images Migration Implementation Report

- Date: 2026-10-11
- Status: **PASS — Database V1.4 LOCKED as current development baseline**
- Scope: additive Database V1.4 artifacts, Prisma mapping, PostgreSQL 18 clean-install/migration/constraint/concurrency validation.
- Authorities reviewed: `docs/DOCUMENTATION_RULES.md`, canonical Requirement and API Spec, Room Images design, Database V1.3 schema/ERD/seed/runtime validator, changelog, current Prisma mapping, and versioning convention.

## Executive summary

Database V1.4 adds the approved Room Images association table to the unchanged V1.3 baseline. Clean install, seed, runtime checks, populated V1.3 migration/preservation, concurrency protection, original V1.3 regression, and Prisma format/validate/generate all passed. Database V1.4 is now the current locked development baseline with 27 public tables; V1.3 remains the historical locked predecessor.

All runtime validation used disposable databases on an isolated PostgreSQL 18 cluster at `127.0.0.1:55432`. No connection was made to port 5432 or `Goctro_test3`. Backend, frontend, storage adapters, Requirement, and API Spec were not changed.

## Files changed

- `GocTro-SmartBuilding/Database V1.4/schema.sql`
- `GocTro-SmartBuilding/Database V1.4/erd.md`
- `GocTro-SmartBuilding/Database V1.4/seed.sql`
- `GocTro-SmartBuilding/Database V1.4/runtime_validator.sql`
- `GocTro-SmartBuilding/Database V1.4/migrations/V1_3_to_V1_4.sql`
- `GocTro-SmartBuilding/Database V1.4/migration_validator.sql`
- `GocTro-SmartBuilding/Database V1.4/concurrency_validator.ps1`
- `GocTro-SmartBuilding/Database V1.4/README.md`
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`
- `SmartRentalManagement/database/schema.prisma`
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`
- This report.

Database V1.3 source artifacts, Requirements, API Spec, backend, frontend, storage adapters, and legacy migrations were not modified.

## V1.4 schema and migration

`room_images` contains the approved fields, a Room FK with `ON DELETE RESTRICT`, positive `sort_order` and nonblank-key checks, and `UNIQUE(room_id, storage_key)`. The key is not globally unique. Indexes cover ordered gallery reads and storage-key reference lookups; a partial unique index permits at most one cover per Room. The seed intentionally contains no image metadata without real binary fixtures.

The V1.3 → V1.4 migration is additive and transactional. Its preservation validator snapshots rows from all 26 existing public tables, runs the migration, and verifies those row values remain unchanged, public table count is 27, and `room_images` begins empty.

### Concurrency finding and implemented guard

The initial approved-style parent row lock plus statement count check allowed two simultaneous inserts to commit as the sixth image. PostgreSQL 18 showed that a blocked INSERT could retain its pre-wait statement snapshot. A deferred count check did not resolve that snapshot behavior and was removed.

The validated implementation uses a nonblocking, per-Room transaction advisory lock in the BEFORE INSERT trigger. A competing transaction receives retryable SQLSTATE `40001` instead of waiting and checking a stale snapshot. After obtaining the advisory lock, the trigger updates the Room's `updated_at` (also recording the gallery mutation); a writer using a stale `REPEATABLE READ` snapshot then receives a serialization failure. The statement-level post-insert count check remains for the five-image bound within an INSERT statement.

With four existing associations, the concurrent fifth insert committed, the competing sixth insert failed with SQLSTATE `40001`, and the final count was five. A separate stale `REPEATABLE READ` case confirmed that the older transaction fails with serialization SQLSTATE `40001` after a newer insert commits; final count was one. A nonblocking conflict may require the application to retry later; backend behavior remains out of scope.

## Prisma mapping

`Room.images` and `RoomImage` are mapped with the approved physical names and types. Prisma `format`, `validate`, and `generate` all **PASS**. No Prisma database mutation command was run.

Prisma does not fully model the partial unique cover index, CHECK constraints, the statement-level maximum trigger, or immutable identity trigger. PostgreSQL remains authoritative for these rules.

## Validation results

| Gate | Result | Evidence |
|---|---|---|
| V1.4 clean-install schema | PASS | `schema.sql` executed on a fresh PostgreSQL 18 test database. |
| V1.4 seed | PASS | `seed.sql` executed; no RoomImage seed rows. |
| V1.4 runtime validator | PASS | **87/87**: 64 inherited V1.3 regression checks + 23 Room Images checks. |
| Populated V1.3 → V1.4 migration | PASS | V1.3 schema + seed upgraded successfully on a disposable PostgreSQL 18 database. |
| Existing row values/IDs preserved | PASS | Migration validator compared JSON row values across all 26 existing tables; no differences. |
| New table after migration | PASS | 27 public tables; `room_images` count = 0; existing Room count = 8. |
| RoomImage rules | PASS | Runtime checks cover shared key across Rooms, duplicate same-Room key, one cover, blank key, sort order, missing Room, max five, immutability, and FK RESTRICT. |
| Concurrent fifth/sixth insert | PASS | Fifth committed; competing sixth rejected with retryable SQLSTATE `40001`; final count = 5. |
| Stale `REPEATABLE READ` writer | PASS | Old-snapshot insert rejected with serialization SQLSTATE `40001`; final count = 1. |
| Storage key lookup index | PASS | Required index existence checked by runtime validator; no performance benchmark was required. |
| Original V1.3 baseline regression | PASS | Unchanged V1.3 schema + seed + runtime validator: **64/64 PASS** on a separate disposable database. |
| Prisma format | PASS | `prisma format --schema database/schema.prisma`. |
| Prisma validate | PASS | `prisma validate --schema database/schema.prisma`. |
| Prisma generate | PASS | Prisma Client v6.12.0 generated successfully. |
| Requirement/API Spec mismatch | NONE FOUND | Reviewed; neither document changed. |

## Final baseline decision

**Database V1.4 — PostgreSQL 18, 27 public tables, schema PASS, seed PASS, runtime 87/87 PASS, populated migration PASS, concurrency PASS, Prisma generate PASS — LOCKED.**

V1.4 is the current development baseline. V1.3 remains an unchanged historical locked predecessor. The migration was tested only on disposable local databases; applying it to any shared, staging, or production database remains subject to the project's backup and deployment process.

## Next recommended task

Implement the Room Images backend/API integration against the locked V1.4 schema and existing approved Requirement/API contract. Keep object storage lifecycle and frontend gallery work in their own scoped passes.
