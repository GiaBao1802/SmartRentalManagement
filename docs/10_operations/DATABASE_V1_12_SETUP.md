# Database V1.12 — demo payment setup

**Status:** V1.12 is applied to the database currently configured in `backend/.env`: `Goctro_dev_v18`. Exact-catalog inspection passed. `Goctro_test3` is absent on this PostgreSQL instance.

## Change

V1.12 changes only the provider CHECK on `payment_transactions` to accept `demo` alongside the unchanged real provider values `momo` and `zalopay`. This allows explicit presentation attempts to use the existing transaction ledger without representing them as real MoMo/ZaloPay transactions. Existing Complaint, ComplaintHistory and Notification tables are reused for feedback and in-app notifications.

The additive SQL is [`V1_11_to_V1_12_demo_payment.sql`](../../database/baselines/v1.12/migrations/V1_11_to_V1_12_demo_payment.sql). The clean-install schema, expected catalog and runtime validator are under [`database/baselines/v1.12/`](../../database/baselines/v1.12/). V1.11 and earlier artifacts remain unchanged.

## Apply to the local application database

1. The current backend configuration pointed to `Goctro_dev_v18`; read-only inspection confirmed populated V1.11. `Goctro_test3` was absent on this local PostgreSQL instance.
2. Before migration, a custom-format backup was created at `.local/backups/Goctro_dev_v18_pre_V1_12_20261027.dump` and verified with `pg_restore --list` (508 entries; SHA-256 `4FDEAD23131431D96D5867BE504464E82CDAA4F8FEFB60BA5793D3C63434794A`).
3. The exact-catalog-guarded V1.11→V1.12 migration ran transactionally on `Goctro_dev_v18` after the verified backup. No seed/reset ran.
4. Post-migration read-only `state` returned `v112_populated` and `inspect` returned `PASS`. Populated databases are not seeded or reset.

The setup path supplies the protected-target migration authorization only after the operator confirms the backup. The standalone SQL requires the exact session setting `goctro.allow_locked_db_migration='V1.12'` on protected local database names. Do not use `db push`, clean-install SQL, or reset to upgrade a populated database.

## Demo boundary

The demo route is available only outside production. It records `provider=demo`; no bank/wallet request, external transfer, or provider callback is used. The QR in the Resident screen is explicitly non-scannable artwork. Failed attempts do not pay the Invoice; successful attempts use the full finalized Invoice total.

## Verification status

V1.12 migration and exact-catalog verification passed on `Goctro_dev_v18`. Frontend/backend typechecks and baseline-integrity verification passed. API health, database health and the local login page returned HTTP 200; the unauthenticated demo-payment history route returned the expected 401. Automated tests and authenticated browser review remain pending.
