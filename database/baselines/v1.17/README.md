# Database V1.17 — Cloudy unresolved feedback

Status: **REHEARSED_ON_DISPOSABLE_NEON_BRANCH; NOT APPLIED TO SHARED-DEV PRODUCTION OR LOCAL DATABASES**. This additive version extends account roles/consent and adds the opt-in Cloudy unresolved-message inbox plus append-only review history. It preserves all V1.16 rows. Retention is 30 days from first capture; duplicate occurrences do not extend the deadline.

The migration was rehearsed on Neon branch `goctro-cloudy-v117-test-20261029` (ID `br-small-tree-a1mhsspy`), cloned from shared-dev `production` and expiring `2026-11-05T00:00:00Z`. The parent branch and local `Goctro_dev_v18` were not changed. Do not apply this version to either target or create/invite a Superadmin account without separate authorization and a verified email.

Run `node scripts/rehearse-cloudy-v117-neon.mjs` only with the selected branch's connection URL supplied through `CLOUDY_V117_TEST_DATABASE_URL`; the runner rejects other hosts and the parent branch.
