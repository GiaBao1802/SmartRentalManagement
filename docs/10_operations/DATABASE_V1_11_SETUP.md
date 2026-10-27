# Database V1.11 — Resident service booking setup

**Status:** Locked local/development baseline on `Goctro_dev_v18`; V1.10 remains the unchanged predecessor and the separate `Goctro_test3` target remains at V1.10.

## Existing installation

After pulling the release, run `setup.bat` and choose **2. Cập nhật và khởi động**. Confirm the database target shown by setup and confirm that a recoverable backup was created and verified before an upgrade. The setup tool inspects the full catalog and upgrades only exact supported schemas in order: V1.8 → V1.9 → V1.10 → V1.11. A pre-release booking-first schema is accepted only on `Goctro_dev_v18`, where a narrow recovery migration adds the missing V1.10 auth-session table. `Goctro_test3` is blocked from this module's migration.

The migrations are additive and transactional. Setup does not seed a populated database, reset credentials, or run `db push`. Pulling source does not itself migrate a database; the setup update step does that after target and backup confirmation.

## New installation

`setup.bat` option 1 installs the V1.11 baseline in a new empty supported local database. Sample seed data is optional and accepted only when every application table is empty. The new baseline has 43 public tables and contains no local user records or credentials.

## Manual guarded commands

For a new empty database only, `npm run db:bootstrap -- --database NAME` followed by optional `npm run db:seed -- --database NAME` installs V1.11. For a populated V1.10 database, `npm run db:migrate -- --database NAME` applies the guarded V1.10→V1.11 migration. Set `GOCTRO_SETUP_DATABASE_URL` to the same verified local target and remove it after the command. Do not call bootstrap/seed as an upgrade path.

## Booking and Billing behavior

The Resident request is stored as `PENDING` and reserves one place; it creates no fee at request time. Admin approval rechecks the schedule, capacity, Resident/Contract and quoted price, then atomically creates one `READY` Flexible Service charge. Normal Contract Billing adds that charge in its applicable invoice period. Booking or approval does not create, finalize, send or pay an Invoice. Package enrollment and Payment are outside this release.

## Validation and remaining review

Verified on PostgreSQL 18.6: clean V1.11 bootstrap/seed/inspect **PASS** (43 public tables); clean CORE **89/89**, Resident booking **17/17**, and synthetic fixture **171/171** validators **PASS**. The standard populated V1.10→V1.11 migration rehearsal preserved counts and row-content fingerprints for **42/42** prior tables. The existing local target V1.11 catalog and rollback-only CORE/booking validators also passed. The setup regression suite passed **18/18**; see the [Resident Flexible Service implementation report](../07_modules/resident-occupancy/RESIDENT_FLEXIBLE_SERVICE_BOOKING_IMPLEMENTATION_REPORT.md) and [Database Changelog](../DATABASE_CHANGELOG.md) for exact target and backup evidence.

The authenticated browser walkthrough of the Resident page and Admin approval queue remains the next review task. After pulling source, run `setup.bat` and choose **2. Cập nhật và khởi động**: Git pull alone does not run database migrations or restart the local app.
