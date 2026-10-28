# Database V1.13 candidate — Resident meter submissions

Additive to immutable V1.12. Adds `resident_meter_submissions`: private normalized JPEG, Resident/Contract/Room/Invoice context, confirmed decimal reading, pending state and owner decision audit. Composite foreign keys enforce scope. A partial unique index allows one pending request per Invoice/utility.

Status: PROMOTED_LOCAL on 2026-10-28. Fresh inspection identified Goctro_dev_v18:5433 as exact V1.8, superseding older V1.12 target claims. Verified backup restore, complete canonical V1.8→V1.9→V1.10→V1.11→V1.12→V1.13 rehearsal, then atomic live upgrade passed. All 40 predecessor tables preserved row counts/content. See the Resident assistant implementation report for evidence.

`node scripts/database-v113.mjs rehearse` checks the immutable predecessor, upgrades and seeds a uniquely named disposable database, exports candidate catalog/hashes, and drops only that disposable database. It never migrates or seeds the application target.

Apply prerequisites: reconcile target state, verified backup, exact V1.12 catalog, transaction containing session authorization `goctro.allow_locked_db_migration=V1.13`, migration, exact V1.13 catalog check, rollback on mismatch. No ad hoc schema repair or reset.
