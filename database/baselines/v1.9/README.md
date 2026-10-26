# Database V1.9 distribution baseline

Versioned installation baseline for SmartRentalManagement. V1.9 is a new versioned baseline built additively on locked V1.8; V1.8 artifacts remain preserved under `database/baselines/v1.8/`. This folder makes a Git checkout self-contained for NEW database installation. Changes must use the approved database version process.

- `schema.sql` creates 41 application tables and adds `property_flexible_service_configurations`. Existing V1.8 tables remain unchanged. The V1.8 Parking partial unique index remains SQL authority; Prisma 6.12 cannot fully map its predicate.
- `seed.sql` contains synthetic identities and discarded-random-secret password hashes. It includes two booking-configured sample Flexible items but does not provide a known login password. It is not an idempotent operational data migration; the wrapper only permits it once on a verified V1.9 schema with all application tables empty.
- `runtime_validator.sql` checks the V1.9 schema and both Flexible modes (85 rollback-only checks). The inherited `runtime_validator_fixture.sql` is a historical V1.7 synthetic fixture and is not the V1.9 core validator.
- `migrations/V1_7_to_V1_8_recurring_parking_invoice_linkage.sql` preserves the prior transition; `migrations/V1_8_to_V1_9_flexible_service_modes.sql` is the additive upgrade artifact. Bootstrap never executes either migration.
- `PROVENANCE.json` records SHA-256 hashes. `expected-catalog.json` was captured from the exact V1.9 schema on a disposable PostgreSQL 18.6 database before seed. It records structural catalog objects but excludes row data and environment-specific ownership/OIDs.

## 2026-10-26 rehearsal evidence

- Clean V1.9 schema + seed: PASS; 41 public tables and two configured sample Flexible services.
- V1.9 CORE runtime validator: 85/85 PASS on clean seeded and migrated databases; all probes roll back.
- V1.8 → V1.9 populated-data rehearsal: PASS; row counts and SHA-256 matched for all 40 existing tables. The new configuration table starts empty; legacy Flexible items are not assigned an assumed mode.
- PostgreSQL 18.6 rendering can spell equivalent `ANY` array casts differently after restoring a dump. V1.9 setup normalizes only these confirmed equivalent CHECK/index expressions before catalog comparison; structural differences still fail.
- Local `Goctro_dev_v18` promotion remains separate from rehearsal and requires a verified backup before migration.

Use the guarded npm commands in the V1.9 setup guide. Do not bootstrap/seed a populated target. Do not regenerate catalog/hashes to make unknown drift pass: investigate the difference and obtain an approved version/migration decision.
