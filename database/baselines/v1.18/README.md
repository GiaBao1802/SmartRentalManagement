# Database V1.18 — Superadmin after team Cloudy V1.17

Status: **APPLIED_SHARED_NEON_20261029** on project `goctro-shared-dev`, branch `production`, database `neondb`. The team Cloudy V1.17 migration was applied first, then `migrations/V1_17_to_V1_18_platform.sql` in the same guarded transaction. V1.18 adds nine platform tables, normalized email indexes and `properties.public_report_code`; it keeps the Cloudy feedback tables, `accounts.cloudy_feedback_opt_in_at`, Marketplace amenities, Parking, meter and room-request structures.

The source V1.16 catalog matched exactly before the upgrade. A fresh protected `pg_dump` backup was restored to a new local PostgreSQL database and the exact catalog, row counts and UTC-normalized contents of all 47 predecessor tables matched. In the upgrade transaction, the exact V1.17 and V1.18 catalogs, intentional new columns, 47 predecessor contents and runtime validator passed. The same checks passed after commit. See [promotion evidence](../../../docs/10_operations/NEON_PLATFORM_V118_APPLY_20261029.md). No seed, reset, demo account or permission grant was run.

`PROVENANCE.json` pins the SHA-256 bytes of the V1.18 schema, catalog, validator and migration. Setup has no automatic migration path. Code and database version are separate: this integration worktree remains uncommitted and unpushed.
