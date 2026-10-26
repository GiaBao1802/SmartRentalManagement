# Database V1.9 — local setup and V1.8 upgrade

**Date:** 2026-10-26<br>
**Status:** V1.9 is promoted and locked on local `Goctro_dev_v18` after verified backup, exact V1.8 catalog preflight, additive migration, and post-migration validation.

V1.9 is an additive successor to the locked V1.8 baseline. It adds `property_flexible_service_configurations` for Admin Flexible Service weekly hours, booking slot duration/capacity, and month/year packages. It does not create Resident bookings, package enrollment, charges, or payment. It does not modify Fixed Service, Electricity/Water, Parking, or legacy catalog/price/invoice records.

## Upgrade an existing V1.8 database

1. Confirm the exact local PostgreSQL instance and database in pgAdmin. The approved target for this task is `localhost:5432/Goctro_dev_v18`; `Goctro_test3` is out of scope and the V1.9 migration tool refuses it.
2. Create a custom-format backup of the target and verify it with `pg_restore --list`. Do not proceed if the archive is missing, empty, or unreadable.
3. Set `GOCTRO_SETUP_DATABASE_URL` to the exact loopback PostgreSQL URL for that database. Do not place a real password in a committed script or report.
4. Run the read-only state check. It must report `v18_populated` or `v18_empty`:

   ```powershell
   npm run db:state -- --database Goctro_dev_v18
   ```

5. Apply the versioned migration only after the backup check:

   ```powershell
   npm run db:migrate -- --database Goctro_dev_v18
   npm run db:inspect -- --database Goctro_dev_v18
   ```

`db:migrate` accepts only the exact V1.8 catalog, validates the database identity and PostgreSQL 18.6+, takes a transaction-scoped advisory lock, applies the SQL migration in one transaction, and checks the resulting V1.9 catalog before commit. A mismatch or SQL error rolls back. It does not seed or rewrite existing rows. V1.8 Flexible items receive no inferred mode; items with historical price versions must remain unconfigured or be replaced by a new Admin item.

The Windows setup menu recognizes both V1.8 and V1.9. When it detects V1.8, it asks the operator to confirm that a recoverable backup was created and verified before migration. It will not automatically migrate `Goctro_test3`.

## New empty database

Only use a database you have verified is new and empty. Set the explicit setup URL, then run:

```powershell
npm run db:bootstrap -- --database REPLACE_WITH_NEW_EMPTY_DB
# Optional, one-time synthetic seed for a disposable/local demo database only:
npm run db:seed -- --database REPLACE_WITH_NEW_EMPTY_DB
npm run db:inspect -- --database REPLACE_WITH_NEW_EMPTY_DB
```

Bootstrap never upgrades a populated or non-empty schema. Seed refuses any populated application table. `setup.bat` handles V1.9 clean installation and credential provisioning for its supported local target.

## Rehearsal evidence — 2026-10-26

- PostgreSQL 18.6 clean V1.9 schema + seed: PASS; 41 public tables; two demo Flexible configurations.
- V1.9 runtime validator: 85/85 PASS on both clean and migrated disposable databases; fixture writes roll back.
- V1.8→V1.9 populated rehearsal: PASS; all 40 pre-existing tables retained identical row counts and SHA-256 fingerprints. New configuration table started empty.
- Local target `localhost:5432/Goctro_dev_v18`: PostgreSQL 18.6, exact V1.8 preflight PASS, migration PASS, 41 public tables, V1.9 inspect PASS, runtime validator 85/85 PASS, and identical row counts/SHA-256 for all 40 existing tables. The new configuration table contains 0 rows because no legacy service mode was inferred.
- Verified custom-format backup: `database/generated/backups/Goctro_dev_v18_pre_v1_9_20261026_retry.dump`, 265,487 bytes, `pg_restore --list` returned 481 entries, SHA-256 `790C7D1E86FF80809142A2A4F569F6F951DBFE9E7B900643E7479CABA77A8CBB`.
- Catalog comparison normalizes only confirmed equivalent PostgreSQL `ANY` array-cast rendering in CHECK/index definitions; all other structural catalog differences remain errors.
- Backend and frontend typechecks, Prisma validation, and JavaScript syntax checks pass. Feature tests and manual browser walkthrough have not been run.

The baseline folder includes the complete new-install schema, seed, exact expected catalog, and migration. `database/baselines/v1.8/` remains preserved as the predecessor. Read [the Admin implementation report](../07_modules/service/FLEXIBLE_SERVICE_SCHEDULING_ADMIN_IMPLEMENTATION_REPORT.md) for scope and promotion evidence.
