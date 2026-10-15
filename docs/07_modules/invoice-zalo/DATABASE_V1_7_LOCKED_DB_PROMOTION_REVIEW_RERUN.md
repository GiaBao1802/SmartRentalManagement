# Database V1.7 Locked-DB Promotion Review — Rerun

- **Date:** 2026-10-13
- **Decision:** **PROMOTION REVIEW = GO**
- **Promotion status:** **DATABASE V1.7 PROMOTED = NO**
- **Target:** `Goctro_test3` at `127.0.0.1:5432`
- **Inspection:** PostgreSQL 18.6, read-only
- **Current physical baseline:** Database V1.6, LOCK, 28 public tables

## 1. Scope

Reran the promotion gate after the protected-target guard reconciliation and full disposable rehearsal. Reviewed the documentation rules/catalog, canonical Requirement/API/changelog, V1.6 and V1.7 schema/runtime artifacts, current Prisma mapping, migration and supporting reports, then inspected the target read-only. This review did not run a migration, seed, reset, drop, backup, or any target write. No backend/frontend implementation, Prisma, or migration file was changed.

## 2. Previous blocker

The previous review was **NO-GO** because the checked-in migration unconditionally refused `Goctro_test3`. The newer guard reconciliation replaced that unconditional refusal with a protected-by-default, exact-session authorization gate and reran the disposable tests. That blocker is resolved; the previous report remains historical evidence and is not treated as the current decision.

## 3. Guard reconciliation verification

Verified in the current migration and guard reconciliation report:

- `Goctro_test3` remains protected by default.
- Missing or wrong `goctro.allow_locked_db_migration` is rejected with SQLSTATE `42501` before mutation.
- Only exact `V1.7` authorization permits the protected-target branch.
- The guard checks PostgreSQL's actual `current_database()`.
- The custom setting is session-scoped and not persisted; it authorizes only this migration, not seed/reset/drop.
- Migration remains transactional (`BEGIN`/`COMMIT`).
- The authorized `psql` path uses one session and `ON_ERROR_STOP=1`; that same-session behavior passed a disposable guard test.

**Guard blocker resolved: YES.** The target was not authorized or modified during this review.

## 4. Rehearsal evidence

The latest PostgreSQL 18.6 guard-reconciliation report records:

- V1.6 schema + seed: **PASS**; V1.6 validator **97/97 PASS**.
- V1.6→V1.7 migration rehearsal + overlay seed: **PASS**.
- V1.7 validator on upgrade and clean install: **171/171 PASS, 0 failed**.
- Clean-install V1.7 schema + seed: **PASS**.
- Expected public tables: **40**.
- Legacy preservation, Parking refinement, and finalized Invoice immutability: **PASS**.
- Prisma format, validate, generate: **PASS**.
- Guard tests: missing and wrong authorization denied; exact V1.7 same-session authorization succeeded.
- `Goctro_test3` unchanged.

This is disposable rehearsal evidence, not evidence that V1.7 has been promoted.

## 5. Target inspection

Before connecting, the inspection recorded: `host=127.0.0.1`, `port=5432`, `database=Goctro_test3`, `mode=READ ONLY`. The session verified both `default_transaction_read_only=on` and `transaction_read_only=on`, used `BEGIN READ ONLY`, and ended with `ROLLBACK`.

Observed identity: `Goctro_test3`, PostgreSQL **18.6**, server port **5432**. It contains exactly **28 public tables** and matches the V1.6 inventory. All 12 V1.7 tables are absent; `invoices.snapshot_kind` and `parking_slot_assignments.entitlement_id` are absent. No partial V1.7 migration markers were found.

## 6. Target drift

**Schema drift: NONE.** A fresh comparison against V1.6 source found:

- tables: **28/28**, no missing or extra tables;
- columns: **320/320**, with no type, nullability, or identity differences;
- explicit indexes: **44/44**; total indexes **115** (28 PK, 43 unique, 44 explicit);
- constraints: 28 primary keys, 43 unique, 50 foreign keys, 97 CHECK, and 242 NOT NULL; all validated;
- expected triggers: **8/8**, none disabled;
- expected functions: **8/8**.

Row counts above the synthetic V1.6 seed in rooms, residents, and contracts are populated-target data, not schema drift. No provenance was inferred from this read-only review.

## 7. Current target data evidence

Read-only row counts captured as the pre-apply reference:

| Table | Rows |
|---|---:|
| owners | 2 |
| accounts | 6 |
| properties | 23 |
| rooms | 50 |
| residents | 14 |
| contracts | 10 |
| invoices | 4 |
| amenities | 4 |
| amenity_price_history | 6 |
| parking_areas | 2 |
| parking_slots | 3 |
| vehicles | 3 |
| parking_slot_assignments | 3 |
| payment_transactions | 5 |
| invoice_zalo_oa_send_logs | 3 |

Invoice evidence (amounts in VND):

| Invoice | Status | Total | Rent | Electricity | Water | Services | Electricity meter | Water meter | Period |
|---|---|---:|---:|---:|---:|---:|---|---|---|
| 5001 | unpaid | 4,040,000 | 3,500,000 | 280,000 | 210,000 | 50,000 | 1250 → 1330 kWh | 60 → 74 m³ | 2026-09-15–2026-10-14 |
| 5002 | paid | 4,395,000 | 4,100,000 | 175,000 | 90,000 | 30,000 | 500 → 550 kWh | 30 → 36 m³ | 2026-08-24–2026-09-22 |
| 5003 | unpaid | 3,550,000 | 3,300,000 | 175,000 | 75,000 | 0 | 850 → 900 kWh | 35 → 40 m³ | 2026-09-18–2026-10-17 |
| 5004 | draft | 3,200,000 | 3,200,000 | 0 | 0 | 0 | not finalized | not finalized | 2025-10-15–2025-11-04 |

No write, seed, backup, or migration was performed against the target. These values are the evidence the future apply task must recapture and compare immediately before/after migration.

## 8. Migration artifact review

The current checked-in `V1_6_to_V1_7_billing.sql`:

- is one explicit transaction and runs the fail-closed authorization guard before schema mutation;
- adds the 12 approved V1.7 tables and additive columns/constraints; contains no `DROP TABLE` or `DROP COLUMN`;
- adds legacy Parking `entitlement_id` as nullable;
- classifies existing invoices truthfully from existing status (`draft` → `NOT_FINALIZED`; finalized paid/unpaid → `LEGACY_AGGREGATE`);
- does not rewrite Invoice IDs, status, totals, readings, or fabricate legacy Invoice Items;
- checks expected baseline/object conditions to reject a partial or unexpected target state.

The reconciled guard no longer blocks a separately authorized apply task. **Migration suitable for populated V1.6 target: YES**, subject to the backup and pre/post checks below.

## 9. Backup plan

**Backup tooling viable: YES.** Local `pg_dump` and `pg_restore` are PostgreSQL **18.6** tools; the available D: volume had approximately **61.8 GB free** at review. No backup was created. The apply task must create a timestamped full custom-format dump outside the repository immediately before migration, then verify it with `pg_restore --list` before proceeding.

## 10. Apply command review

The reconciled report documents this command shape (supply the verified local database username; no secret is embedded):

```powershell
psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U '<DB_USER>' -d Goctro_test3 `
  -c "SET goctro.allow_locked_db_migration = 'V1.7';" `
  -f "D:\codexapp\GocTro-SmartBuilding\Database V1.7\migrations\V1_6_to_V1_7_billing.sql"
```

It explicitly selects the reviewed host, port, database, exact session authorization, and only the migration file. The `-c` and `-f` same-session semantics were demonstrated in disposable guard case D. It does not run seed. **Authorized apply command valid: YES.** This command was reviewed, not run.

## 11. Backend compatibility

**SAFE WITH KNOWN LIMITATIONS.** The additive schema does not introduce a known break to current non-Billing flows. Current Prisma maps V1.7. `payment_transactions` is unchanged. Existing Parking assignment rows tolerate nullable `entitlement_id`; current Amenity catalog writes do not mutate append-only price history. Invoice finalization remains fail-closed because the active pricing adapter is unconfigured and returns no calculated pricing; the API rejects finalization as incomplete. Zalo delivery is also unconfigured. Database promotion alone does **not** complete Billing or Payment implementation.

## 12. Pre-migration apply plan

A separate target-specific apply task must, in order:

1. Stop relevant backend/dev processes if required.
2. Reconfirm `127.0.0.1:5432/Goctro_test3` from the live connection.
3. Create a timestamped full custom-format `pg_dump` outside the repository.
4. Verify the archive using `pg_restore --list`; stop if verification fails.
5. Capture the V1.6 schema/object fingerprint and table inventory.
6. Capture the critical row counts listed in §7.
7. Capture invoice IDs, states, money amounts, meter readings, and periods listed in §7.
8. Run V1.6 read-only/runtime checks if safe and appropriate.
9. Apply the migration exactly once with the exact V1.7 session authorization and `ON_ERROR_STOP=1`; do not seed the populated target.

None of these apply actions was performed during this review.

## 13. Post-migration validation plan

The apply task must verify target identity; **40 public tables**; all 12 V1.7 tables; both V1.7 columns; V1.7 runtime validator **171/171 PASS**; legacy row/object and Invoice evidence preservation; correct legacy invoice classification; no fabricated Invoice Items; Parking refinement; finalized Invoice immutability; Prisma validate/generate; and backend DB health/startup. Confirm Invoice finalization remains fail-closed until pricing is implemented. On any discrepancy, stop and follow rollback; do not continue feature work on an uncertain target.

## 14. Rollback plan

**Rollback viable: YES, conditional on the apply task verifying the pre-migration dump.** Primary rollback is restoring the verified dump, preferably to a replacement database first, then validating its V1.6 schema, validator, critical counts, and invoice evidence before any controlled connection switch. If in-place restore is unavoidable, it must be a separate explicit controlled recovery action after client disconnection. Do not use manual dropping of V1.7 objects as rollback. No restore was performed in this review.

## 15. Risks

- The target is populated beyond the synthetic seed; the schema comparison is exact, but the apply task must capture fresh target-specific data evidence and a verified dump.
- V1.7 promotion enables the physical model only; Billing pricing/itemization/finalization and Zalo provider work remain incomplete or unconfigured.
- The protected-target GUC is an operator signal, not a general authorization system. It must only be set by the separately scoped apply task after reconfirming the target and verifying the backup.
- A post-commit validation failure requires restore from the verified dump; do not attempt ad hoc object deletion.

## 16. Blocking issues

**No unresolved Database V1.7 promotion blocker found.** Backup and rollback are viable subject to the mandatory apply-time verification. Known Billing/Zalo implementation limitations are disclosed and do not invalidate the database promotion gate; the Invoice path remains fail-closed.

## 17. GO/NO-GO decision

# PROMOTION REVIEW = GO

# DATABASE V1.7 PROMOTED = NO

All promotion-review criteria are met. **GO means only that a separate target-specific apply task may now be authorized. It does not mean migration has happened or authorize this review to write to the target.** V1.6 remains the current physical LOCK baseline until that separate task applies V1.7 and completes all post-migration validation.

## 18. Goctro_test3 changed

**NO.** Target inspection ran read-only with read-only defaults and transaction mode, followed by rollback. No backup, migration, SQL write, seed, reset, or drop was performed. No credentials were emitted.

## 19. Exact next task

**GÓC TRỌ — DATABASE V1.7 LOCKED-DB APPLY + POST-MIGRATION VALIDATION**

That separate task may modify only `Goctro_test3`, and only after explicit target reconfirmation, creation and verification of the full backup, and pre-migration evidence capture.
