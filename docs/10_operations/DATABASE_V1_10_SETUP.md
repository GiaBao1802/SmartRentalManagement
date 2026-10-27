# Database V1.10 — historical pre-release booking setup note

**Status: SUPERSEDED.** This uncommitted draft assigned Resident bookings to V1.10 before the team's durable-auth V1.10 baseline was integrated. Do not use this document for setup, migration or current physical status. The corrected booking release and instructions are in [Database V1.11 setup](DATABASE_V1_11_SETUP.md); the official V1.10 auth-session baseline remains unchanged.

**Purpose:** install the Resident service-booking schema required by the Resident booking page and Admin approval queue. V1.10 is an additive successor to V1.9 and creates `resident_service_bookings`; it does not rewrite V1.9 service, pricing, charge, invoice, or resident rows.

**Status: LOCKED LOCAL/DEVELOPMENT BASELINE.** V1.10 provenance and catalog are verified. The exact local `Goctro_dev_v18` PostgreSQL 18.6 database was upgraded from V1.9 after a verified backup; migration, catalog check, 41-table preservation check, and rollback-only CORE validator passed.

## Existing local installation

After pulling a revision containing V1.10, run `setup.bat` and choose **2. Cập nhật và khởi động**. Confirm the displayed local PostgreSQL target. When the setup menu detects V1.8 or V1.9, it asks the operator to confirm that a fresh backup was created and verified before applying migrations. V1.8 is migrated in order through V1.9 and then V1.10; V1.9 is upgraded directly. The setup preserves existing rows and web credentials, does not seed a populated database, then generates Prisma and restarts/checks the local app. Pulling code alone does not update a local database.

If using another setup path, first make and verify a recoverable PostgreSQL backup. Then run the guarded migration for the exact confirmed local database. The tool accepts only PostgreSQL 18.6+ on localhost, checks the full V1.9 catalog, applies the migration transactionally, verifies the V1.10 catalog, and refuses `Goctro_test3` and schema drift. Never use `prisma db push`, reset, or bootstrap as an upgrade shortcut.

## Clean install

`setup.bat` option 1 creates a supported local empty database, installs the V1.10 baseline, and offers sample seed data only while all application tables are empty. Existing database credentials are preserved; no setup path silently resets passwords. Seeded demo login passwords are shown by the setup tool only when that fresh seed succeeds.

## Booking and invoice behavior

Resident booking requests are stored in `resident_service_bookings`. `PENDING` and `APPROVED` requests hold capacity. A pending request has a quoted service/slot/price snapshot but no charge. Admin approval creates a `READY` Flexible Service charge at that quote; the existing Billing flow includes it in the normal Contract Invoice period. This does not immediately create, finalize, send, or pay an Invoice. Package enrollment and payment-provider setup remain outside V1.10.

## Validation status

The implementation and physical target evidence are summarized in [Resident service booking implementation](../07_modules/resident-occupancy/RESIDENT_FLEXIBLE_SERVICE_BOOKING_IMPLEMENTATION_REPORT.md) and [Database Changelog](../DATABASE_CHANGELOG.md).

- Exact V1.9 preflight and V1.10 catalog: PASS; 41→42 public tables.
- Backup: `database/generated/backups/Goctro_dev_v18_pre_v1_10_20261027_093100.dump`, 272,361 bytes, 490 archive entries, SHA-256 `1231C94ED903D167E02DF0C09378C45267E44D44F8D2798CA94835491B223144`.
- All 41 pre-existing tables have unchanged row counts/content fingerprints: PASS.
- V1.10 CORE runtime validator: 97/97 PASS; probes rolled back.
- Prisma and frontend/backend typechecks: PASS. Authenticated browser flow and feature-specific automated tests: NOT RUN; user review remains next.
