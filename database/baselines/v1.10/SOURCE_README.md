# Góc Trọ Database V1.8 — recurring Parking Invoice linkage

- **Status:** Database V1.8 is LOCKED as the current local/development physical baseline on `Goctro_test3`, PostgreSQL 18.6, with 40 public tables. V1.7 is the historical locked predecessor. This is not a production deployment claim.
- **Purpose:** allow a recurring `parking_assignment_id` to be invoiced in different periods while preventing that assignment from appearing more than once on one Invoice.
- **Physical delta:** only `invoice_items` uniqueness changes. V1.8 removes the global `UNIQUE(parking_assignment_id)` and uses `invoice_items_invoice_parking_assignment_unique(invoice_id, parking_assignment_id) WHERE parking_assignment_id IS NOT NULL`. Existing item rows, amounts, invoices, foreign keys, and triggers are preserved.
- **Inventory:** 40 public tables. The clean-install schema is the V1.7 schema with this approved index rule; no new table or column is introduced.
- **Prisma:** Prisma 6.12 cannot encode the partial predicate. `database/schema.prisma` therefore maps the scalar/relation but does not declare a false full composite `@@unique`. SQL remains authoritative for this invariant.

## Files

- `schema.sql`: direct V1.8 clean-install schema.
- `seed.sql`: synthetic V1.7 baseline seed, unchanged in business data and suitable only for disposable clean installs.
- `migrations/V1_7_to_V1_8_recurring_parking_invoice_linkage.sql`: transactional V1.7 upgrade, guarded on protected `Goctro_test3`; it fails closed on schema drift, duplicates, non-Parking links, or orphan/cross-tenant links.
- `runtime_validator.sql`: populated-target-safe, rollback-only CORE validator (77 checks), including V1.8 index definition and recurring-link behavior.
- `runtime_validator_fixture.sql`: inherited V1.7 seed-dependent 171-check regression suite. It is only for a disposable database populated with the combined V1.8 seed; never run it on a populated target.
- `erd.md`: V1.8 physical relations and rule.

## Validation paths

Use disposable PostgreSQL 18 databases only for rehearsal and clean-install tests. On an upgrade rehearsal, install V1.7 schema and synthetic seed, run the V1.7 validators, capture deterministic data fingerprints, apply the V1.8 migration, then run the V1.8 CORE validator and compare fingerprints. On a separate empty database, run V1.8 `schema.sql`, `seed.sql`, CORE and FIXTURE validators. Do not seed a populated target.

The migration is one transaction and takes an `ACCESS EXCLUSIVE` lock on `invoice_items` across preflight and DDL, leaving no write gap. A rollback to V1.7 is possible only while no assignment occurs on multiple invoices. Once recurring invoice rows exist, do not restore global uniqueness or delete/rewrite financial rows; require a forward fix or explicit recovery decision.

`Goctro_test3` was promoted only after disposable upgrade/clean-install validation, Invoice integration, Prisma checks, backup verification, and target preflight. The exact session authorization `goctro.allow_locked_db_migration = 'V1.8'` is checked by the migration and is not persisted. No seed was run on the populated target. The database lock is versioned, not permanent: a future approved rule change needs a new migration and runtime validation.

## Unchanged business rules

Paid entitlement and eligibility, Parking price at `period_start`, no prorating, invoice snapshots/reconciliation, all utility/service/meter rules, historical aggregates, and Payment scope are unchanged. Database V1.8 does not itself enable production Invoice finalization.
