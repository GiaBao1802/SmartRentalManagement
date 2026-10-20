# Database V1.8 Recurring Parking Migration Implementation Report

**Status: FULL PASS — V1.8 is LOCKED as the current local/development baseline.**

## Scope and approved change

Implemented the approved Database V1.7 → V1.8 change. A `parking_assignment_id` can appear on invoices from multiple billing periods, while the same assignment cannot appear twice on one invoice. PostgreSQL enforces this with the partial unique index:

```sql
UNIQUE (invoice_id, parking_assignment_id)
WHERE parking_assignment_id IS NOT NULL
```

No table or column was added. Invoice amounts, finalized snapshots, legacy aggregates, invoice items, parking assignments, and entitlements were not rewritten or deleted. Existing foreign keys and the Parking source-shape trigger remain.

## Files changed

- `database/baselines/v1.8/schema.sql`
- `database/baselines/v1.8/seed.sql` — versioned clean-install header only; synthetic fixture data is unchanged.
- `database/baselines/v1.8/erd.md`
- `database/baselines/v1.8/README.md`
- `database/baselines/v1.8/runtime_validator.sql`
- `database/baselines/v1.8/migrations/V1_7_to_V1_8_recurring_parking_invoice_linkage.sql`
- `SmartRentalManagement/database/schema.prisma`
- `SmartRentalManagement/backend/src/invoices/invoice-itemized.postgres.integration.test.ts`
- `SmartRentalManagement/docs/00_CURRENT_STATE.md`
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`
- `SmartRentalManagement/docs/07_modules/invoice-zalo/DATABASE_V1_8_RECURRING_PARKING_MIGRATION_IMPLEMENTATION_REPORT.md`
- `docs/DATABASE_CHANGELOG.md`

No Requirement, API Spec, backend production logic, frontend, V1.7 source, migration history, seed data on a populated database, or Payment code was changed.

## Migration and runtime results

The migration first verifies the V1.7 table inventory, exact old unique constraint, absence of the new index, duplicate pairs, invalid non-PARKING references, composite Owner/Property links, and critical source trigger. It holds an `ACCESS EXCLUSIVE` lock on `invoice_items` across preflight and DDL, then drops only the old global constraint and creates the new partial unique index in one transaction.

- PostgreSQL version: **18.6**.
- V1.7→V1.8 upgrade rehearsal: **PASS**. V1.7 schema/seed installed; V1.7 CORE 71/71 and FIXTURE 171/171 passed before migration; migration succeeded; V1.8 CORE **78/78 PASS** afterward.
- Negative preflight: a deliberately invalid non-PARKING row referencing a Parking assignment was rejected. The transaction rolled back; the old constraint remained and the V1.8 index was absent.
- Rehearsal fingerprints before → after were identical:

| Data set | Rows | Fingerprint before / after |
|---|---:|---|
| Invoices | 5 | `84c0cc538863560c1acc0208238b2f87` |
| Invoice items | 8 | `5ecb81cf5ce9c224fecda89e37f7205b` |
| Finalized legacy invoices | 3 | `c99925c23b42ffead3369e1ade2d5580` |
| Parking assignments | 4 | `fcc235c4d0688324a5d13c31b1688137` |
| Parking entitlements | 5 | `6614baddc3eec48e5bfae9365640cfe0` |

## Clean-install result

Installed V1.8 `schema.sql` and synthetic `seed.sql` directly in a separate empty disposable database; no V1.7 migration was needed. The database had **40 public tables**. V1.8 CORE passed **78/78**, and the inherited seed-dependent V1.7 FIXTURE suite passed **171/171**.

## Prisma result

`prisma format`, `prisma validate`, and `prisma generate` passed on Prisma 6.12. The `InvoiceItem` ↔ `ParkingSlotAssignment` mapping now reflects the actual composite Owner/Property foreign key and the one-to-many relationship. Prisma 6.12 cannot represent the partial-index predicate, so the mapping intentionally has no fake full composite `@@unique`; the database index remains authoritative.

`npm run typecheck --workspace=@goctro/backend` still reports **174 existing legacy diagnostics**. None refer to the changed Invoice integration test, repository, or pricing files.

## Invoice integration and atomic rollback

`npm run test:invoices --workspace=@goctro/backend` passed **138/138**, with `GOCTRO_V18_REHEARSAL_DATABASE_URL` set to the disposable migrated V1.8 database and PostgreSQL integration enabled.

The runtime test proved:

- Existing active paid assignment `8404`, already billed by prior Invoice `5010`, was billed again on the later eligible Invoice and finalized successfully.
- Rent, Electricity and its tier rows, Water, Fixed Service, Flexible Service, and Parking lines were persisted; four meter snapshots and `finalized_at` were written; aggregate amounts reconciled; status moved from draft to unpaid; the Flexible charge was consumed.
- Retrying finalization returned `INVOICE_ALREADY_FINALIZED` and kept the eight original item rows.
- Two concurrent attempts to insert the same assignment on the same Invoice had exactly one successful insert.
- An injected PostgreSQL trigger failure (`23514`) rolled back all target Invoice items, electricity tiers, meter snapshots and meter readings; the Flexible charge remained READY and unlinked, and the Invoice remained `draft / NOT_FINALIZED`.

## Goctro_test3 promotion

Before promotion, read-only preflight verified `Goctro_test3`, port 5432, PostgreSQL 18.6, 40 public tables, the expected old V1.7 constraint, no V1.8 index, no duplicate pair, and no non-PARKING assignment link. The required backup was created and verified before writes:

- Backup: `C:\Users\PHUONG\AppData\Local\Temp\Goctro-db-backups\Goctro_test3_pre_v1_8_20261014_003237.dump`
- Size: **281,708 bytes**
- `pg_restore --list`: **PASS**
- SHA-256: `3809EA398CB0665C6A041F0418413D5DC0D9617BA436E8B4D2EE999D2DDBFC9E`
- Migration SHA-256: `0F410921589C07348860375ECE2356E566A901FBA76D1DA258EEDB89F23AB400`

The guarded migration passed with the exact one-session authorization `goctro.allow_locked_db_migration = 'V1.8'`. The post-migration target remained `Goctro_test3|5432|40` public tables; the old constraint count is zero and the new partial index exists. Target CORE validation passed **78/78, 0 failed**. No seed was run.

Target data fingerprints before → after:

| Data set | Rows | Fingerprint before / after |
|---|---:|---|
| Invoices | 4 | `34d75f4209018c634eb7dbefab652c87` |
| Invoice items | 0 | `d41d8cd98f00b204e9800998ecf8427e` |
| Finalized legacy invoices | 3 | `ea7c705550226503b3136cb4191ca99b` |
| Parking assignments | 3 | `2fea8a5e6aebdbf7d22de08d17f38eed` |
| Parking entitlements | 0 | `d41d8cd98f00b204e9800998ecf8427e` |

## Final state and remaining boundary

- Database V1.8: **LOCKED**, PostgreSQL 18.6, 40 public tables, current local/development baseline.
- Database V1.7: historical locked predecessor.
- Rehearsal, clean install, validator, fingerprints, Prisma, Invoice integration, retry, concurrency and rollback: **PASS**.
- Production Invoice finalization: **still fail-closed**. Production app continues to use `UnconfiguredInvoicePricing`; this task did not wire or enable it.
- Payment: **not started**.
- Next task: separately review/authorize and implement the production Invoice finalization wiring; do not start Payment until that review closes.
