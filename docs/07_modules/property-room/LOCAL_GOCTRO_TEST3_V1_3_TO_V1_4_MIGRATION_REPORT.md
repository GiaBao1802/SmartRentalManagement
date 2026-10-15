# Local Goctro_test3 Database V1.3 → V1.4 Migration Report

**Date:** 2026-10-11  
**Status:** Local database migrated to V1.4; authenticated Room Images API check remains pending.  
**Scope:** Backup, additive migration, data preservation, V1.4 validation, Prisma validation/generation, local stack restart, health, and local Room Images storage.  
**Authoritative migration:** `GocTro-SmartBuilding/Database V1.4/migrations/V1_3_to_V1_4.sql`  
**Rules:** `docs/DOCUMENTATION_RULES.md` (module-first placement).

## Executive summary

`localhost:5432/Goctro_test3` was confirmed as PostgreSQL 18.6 with the expected V1.3 shape: 26 public base tables and no `room_images`. A verified custom-format backup was made before running the unchanged, transactional V1.3 → V1.4 migration. The migration committed successfully. All 26 existing tables retained identical row counts and data fingerprints; V1.4 now has 27 public tables and an empty `room_images` table. The locked V1.4 runtime validator passed 87/87 and rolled back its fixtures. Prisma validation/generation and `npm run dev:all` passed.

The Admin Room Images route was reached without an authenticated session and returned `401 UNAUTHENTICATED`. Thus the missing-table failure is no longer observed, but a successful authenticated gallery response was not established in this pass. No credential was reset or new account created.

## Target and pre-migration state

Target was read from `backend/.env` without printing its credential: `localhost:5432/Goctro_test3`.

| Check | Before migration |
|---|---|
| `current_database()` / port | `Goctro_test3` / `5432` |
| PostgreSQL | `18.6` |
| Public base tables | `26` |
| `public.room_images` | Absent (`NULL`) |
| Database size | Approximately `11 MB` |
| Representative records | 2 owners, 23 properties, 39 rooms, 7 residents, 5 contracts, 4 invoices, 0 contract change history rows |

Counts by existing table were recorded in the local pre-migration snapshot at `.local/backups/Goctro_test3_pre_V1_4_20261011_snapshot.tsv`. The snapshot contains only table names, row counts, and MD5 fingerprints of canonically sorted JSON row values; it contains no row contents or credentials.

## Backup

- **Result:** PASS.
- **Format:** PostgreSQL custom archive from `pg_dump` (schema and data; no owner/ACL restoration requirements).
- **Path:** `.local/backups/Goctro_test3_pre_V1_4_20261011.dump`.
- **Size:** 137,473 bytes.
- **Readability:** `pg_restore --list` succeeded and reported 264 archive entries.
- The backup and snapshot are under the ignored local `.local` path and are not tracked by Git. Keep this backup until the local V1.4 environment is no longer needed or a separate retention decision is made.

## Migration and preservation

Before migration, `npm run dev:stop` stopped the verified project frontend/backend process trees and left PostgreSQL running. Remaining connections to Goctro_test3 were idle pgAdmin sessions; none had an active transaction.

The approved migration file was run unchanged using `psql -X -v ON_ERROR_STOP=1 -f ...` with a five-second lock timeout. It completed `BEGIN`, preflight, table/index/function/trigger creation, and `COMMIT`.

| Post-migration check | Result |
|---|---|
| Database / PostgreSQL | `Goctro_test3` / `localhost:5432`, PostgreSQL `18.6` |
| Public base tables | `27` |
| `public.room_images` | Exists |
| RoomImage rows | `0` |
| Original Room rows | `39` |
| All original 26 tables | Present |
| Original data preservation | PASS — each table's count and sorted-row JSON fingerprint exactly matches the pre-migration snapshot |
| Room data changed | No — the `rooms` count and fingerprint match |

The shipped `migration_validator.sql` was not run against this database: its own preflight deliberately permits only database names matching `goctro_v14_validation...` and documents disposable populated V1.3 databases. The local preservation comparison instead used the pre-migration count/fingerprint snapshot without changing that validator or bypassing its safety guard.

## Runtime and Prisma validation

- V1.4 `runtime_validator.sql`: **87/87 PASS**. It ran in a transaction and reached its explicit final `ROLLBACK`; a second 26-table count/fingerprint comparison after the validator confirmed no fixture changes remained.
- `prisma validate --schema ../database/schema.prisma`: **PASS**.
- `prisma generate --schema ../database/schema.prisma`: **PASS**, Prisma Client `6.12.0`. The first sandboxed attempt received Windows `EPERM` while resolving `node_modules/@prisma/client`; rerunning with host permissions completed generation. No database mutation command was run.
- No `prisma db push`, Prisma migration, schema install, or seed was run.

## Local stack and health

`npm run dev:all` completed successfully:

- PostgreSQL prerequisite: OK.
- Backend: started.
- Database health: OK.
- Frontend: started.
- CSRF check: OK.
- Frontend: `http://localhost:3000` (HTTP 200).
- Login: `http://localhost:3000/login`.
- Backend: `http://localhost:4000`.
- `GET /api/health`: HTTP 200, `{"status":"ok","service":"backend"}`.
- `GET /api/health/db`: HTTP 200, `{"status":"ok","database":"postgresql"}`.
- Backend is connected to `Goctro_test3`; the direct PostgreSQL identity query returned port 5432 and 27 public tables.

## Room Images API and storage

- `GET /api/v1/auth/csrf`: HTTP 200.
- The real Room Images route checked was `GET /api/v1/properties/11/rooms/101/images` (Property 11, Room 101 / A101).
- Result without a browser Admin session: HTTP 401 `UNAUTHENTICATED`. The response came from the authentication guard, so this did not verify the authenticated database-backed gallery query. No Admin password was reset and no account was created. Recheck with an existing authorized Admin session; expect HTTP 200 with an empty gallery.
- `backend/.local-storage/room-images` exists, is outside `frontend/public`, and passed a local create/write/read/delete probe. Backend storage configuration points to this private development storage root.
- No RoomImage row or file was added by this task.

## Rollback reference and final status

Backup reference: `.local/backups/Goctro_test3_pre_V1_4_20261011.dump` (schema and data). No rollback was needed. Restore would require a deliberate recovery operation; do not overwrite the migrated database automatically.

**Local development database:** `Goctro_test3` — migrated to the locked Database V1.4 baseline (PostgreSQL 18, 27 tables, schema migration committed, data preserved, runtime validator 87/87 PASS). The backup is retained locally. The Admin gallery API success check remains pending only because no authenticated session was available; the route is protected and returned 401 rather than a missing-table error.

**Next task:** Resume **PROPERTY/ROOM + ROOM IMAGES MANUAL HOST-BROWSER FINAL SMOKE**. Re-test single Room create with the image picker, mixed image-upload failure presentation, bulk shared image picker, and desktop/tablet layout. Start with an authenticated Admin session.
