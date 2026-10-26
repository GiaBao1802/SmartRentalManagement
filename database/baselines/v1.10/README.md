# Database V1.10 distribution baseline

This is the complete 42-table PostgreSQL 18.6 schema for a **new** database. It preserves the reviewed V1.9 Flexible Service configuration and adds `auth_sessions` for durable login sessions. V1.9 remains under `database/baselines/v1.9/` without alteration. `Goctro_test3` on this machine was promoted to V1.10 after a verified backup and a populated-data rehearsal; AWS has not been deployed.

- `schema.sql` builds V1.10 directly on a new, empty database. Never run it over a populated database.
- `migrations/V1_9_to_V1_10_auth_sessions.sql` upgrades the canonical V1.9 Flexible Service schema. It refuses a repeat and requires a session-local authorization setting for protected local targets.
- `migrations/V1_8_auth_to_V1_10_flexible_service_modes.sql` handles the single local branch where auth sessions were added before the team's V1.9 Flexible configuration. It refuses any target without exactly 41 tables, `auth_sessions` and the V1.8 pricing key.
- `seed.sql` is the V1.9 synthetic sample data, unchanged in V1.10. It is optional for an isolated demo database and must never be run on a populated target. `runtime_validator_fixture.sql` adapts the inherited synthetic fixture to the 42-table V1.10 schema and passes 171/171 on a seeded disposable database; never run it on a populated target.
- `runtime_validator.sql` runs 89 rollback-only CORE checks. `expected-catalog.json` captures the exact clean V1.10 structure; `PROVENANCE.json` records artifact hashes. `auth_sessions` is intentionally accessed through backend SQL instead of a Prisma model.

Clean installation and both upgrade paths passed the 89/89 CORE validator on disposable databases. The clean and local auth-first upgrade paths produced the same structural catalog. The synthetic fixture passed 171/171 on a seeded disposable V1.10 database. Local `Goctro_test3` retained matching old-row fingerprints before and after its V1.10 upgrade. Details are in `docs/10_operations/LOCAL_DATABASE_V1_10_PROMOTION_2026_10_27.md`.
