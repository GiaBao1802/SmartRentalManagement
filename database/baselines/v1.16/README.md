# Database V1.16 — Marketplace amenities

Status: **APPLIED_TO_NEON_SHARED_DEV; LOCAL_REHEARSED_NOT_APPLIED**. This additive version adds `rooms.marketplace_amenities`, an owner-confirmed array of public amenity codes, with a database allowlist and GIN index. Neon shared-dev `production` is exact V1.16; local `Goctro_dev_v18` remains V1.15. Existing Neon V1.15 rows keep the empty default; descriptions are never parsed or backfilled.

Run `node scripts/prepare-v116.mjs` to regenerate the artifacts and rehearse both clean and populated V1.15 installs on disposable PostgreSQL 18. The script checks exact catalogs, predecessor row fingerprints, empty defaults, exact all-requested-amenity matching, and rejection of unknown codes. The Neon `production` migration was also rehearsed on an expiring branch and applied after a verified backup; applying V1.16 to local `Goctro_dev_v18` still requires its own verified backup and protected-target workflow.
