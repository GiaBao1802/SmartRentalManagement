# Database V1.4 → V1.5 Contract Idempotency Migration Report

- **Date:** 2026-10-12
- **Status:** **BLOCKED BEFORE MIGRATION — V1.5 NOT LOCKED**
- **Approved design:** [`DATABASE_V1_5_CONTRACT_IDEMPOTENCY_DESIGN.md`](DATABASE_V1_5_CONTRACT_IDEMPOTENCY_DESIGN.md), approved for migration implementation.
- **Scope:** Pre-migration gate only. Per instruction, no migration or backup was started after the current V1.4 validator failed on the target database.

## 1. Executive summary

The local target connection was verified as `Goctro_test3`, PostgreSQL `18.6`, port `5432`, with **27 public tables**. The approved table `contract_idempotency_requests` is absent. The V1.4 validator then stopped at check `V1.4-09`: it expects `room_images` to contain zero rows because its header says to run after a fresh V1.4 schema and seed, while the populated local database currently has **9** RoomImage associations.

The task explicitly says to stop before migration if the current validator fails. Therefore no V1.5 backup, migration artifact, disposable database, local DDL, Prisma change, validator extension, changelog/ERD baseline change, startup, or regression suite was performed. V1.4 remains the only current LOCK baseline. No V1.5 status is claimed.

The failed validator ran inside `BEGIN` and the psql connection closed after the error; PostgreSQL rolled the open transaction back. A subsequent read-only check still showed 27 public tables and 9 RoomImage rows. No validator fixture was committed.

## 2. Approved V1.5 design

Design status was confirmed as **APPROVED FOR MIGRATION IMPLEMENTATION**. It approves one additive table, `contract_idempotency_requests`, for database-atomic Contract create, activate, renew, and terminate commands. It defers durable document-upload replay because PostgreSQL and object storage cannot commit atomically. Design approval did not authorize bypassing this pass's migration preconditions.

## 3. Pre-migration target and baseline evidence

Connection details were read without printing credentials:

| Check | Observed |
|---|---|
| Database | `Goctro_test3` |
| PostgreSQL | `18.6` |
| Server port | `5432` |
| Public base-table count | `27` |
| `contract_idempotency_requests` | Absent |
| Current V1.4 validator | **FAIL at V1.4-09** |

Exact public table inventory:

```text
account_invitations
accounts
amenities
amenity_price_history
amenity_subscription_cycles
amenity_subscriptions
complaint_history
complaints
contact_requests
contract_change_history
contract_documents
contracts
invoice_zalo_oa_send_logs
invoices
notification_preferences
notifications
owners
parking_areas
parking_slot_assignments
parking_slots
payment_transactions
properties
residents
room_images
room_residents
rooms
vehicles
```

### Validator result

- Validator source: `GocTro-SmartBuilding/Database V1.4/runtime_validator.sql`.
- `psql` exit code: `3`.
- Checks recorded before stop: **72 PASS**.
- First failing check: `V1.4-09 seed intentionally contains no RoomImage rows`.
- Safe follow-up count: `room_images = 9`; public table count remained 27.

The validator's own header says it is intended for a fresh database after V1.4 schema and seed. Running it on the live populated `Goctro_test3` applies that seed-only assertion to normal existing data. Regardless of the reason, this is a failed required gate and migration did not proceed.

## 4. Fingerprints and backup

- Full pre-migration table row-count/data fingerprints: **NOT CREATED**; the validator gate failed before this step.
- Restorable V1.5 pre-migration backup: **NOT CREATED**; backup must be taken only after the baseline gate is resolved and before any migration write.
- Existing prior V1.4 backup remains documented at `.local/backups/Goctro_test3_pre_V1_4_20261011.dump`; it predates the current V1.4 post-smoke state and is not represented as a V1.5 pre-migration backup.

## 5. Migration and remaining gates

No `Database V1.5/` physical artifacts were created or applied in this pass. No SQL migration, schema, ERD, seed, runtime validator, changelog, or Prisma mapping was changed. No clean/populated disposable migration, Goctro_test3 migration, table/constraint probe, data-preservation comparison, Prisma validate/generate, app health check, or regression test was run.

| Gate | Result |
|---|---|
| Approved design precondition | PASS |
| Target name/version/port | PASS |
| Public table count is 27; V1.5 table absent | PASS |
| Current V1.4 validator | **FAIL — stop condition** |
| Fingerprints / backup | NOT RUN |
| Clean and populated disposable migration | NOT RUN |
| Local migration / preservation | NOT RUN |
| V1.5 Prisma / validator / startup / regressions | NOT RUN |

## 6. Database version and runtime status

**Database V1.4 remains current LOCK baseline. Database V1.5 is NOT MIGRATED and NOT LOCKED.** No unrelated schema change was made. Contract durable idempotency remains **runtime pending**; the approved design is not implementation.

## 7. Required next task

First make the V1.4 validation gate suitable for both a clean seeded database and a populated V1.4 database without weakening any actual schema/business constraint. Keep seed-only checks explicit and scoped to their seed fixture context. Then rerun the V1.4 validator against `Goctro_test3`. Proceed with backup and the V1.5 migration only if the required baseline validator passes. Do not remove the nine existing RoomImage associations to satisfy the seed-only assertion.

After the gate passes, resume the approved sequence: fingerprints → verified backup → clean and populated disposable migration → local additive migration → preservation/structure checks → V1.5 validator → Prisma validate/generate → app health/regressions → lock decision.
