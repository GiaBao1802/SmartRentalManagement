# Database V1.4 Runtime Validator — Populated Database Compatibility

**Date:** 2026-10-12
**Status:** PASS — V1.4 validator is compatible with clean-seeded and populated databases
**Scope:** `Database V1.4/runtime_validator.sql`, its seed-only counterpart, and documentation catalog. No schema or application changes.

## Source and classification

The locked physical source used was `GocTro-SmartBuilding/Database V1.4/schema.sql` and its matching `seed.sql`. The validator was audited by assertion name and purpose:

| Classification | Checks | Meaning |
|---|---:|---|
| Schema inventory/shape | 12 | `V1.4-00`, `V1.3-29..31`, `V1.4-01..08`: table inventory, required RoomImage columns/types, keys, indexes, triggers, and checks. |
| Database/business invariants | 57 | `V1.1-03,09..12,14..15,17..18,20..21`; `V1.2-02..11`; `V1.3-02..22,28`; `V1.4-10..23`. These exercise database-enforced tenant, invoice, payment, contract-history, and RoomImage behavior. |
| Seed-fixture expectations | 18 | Moved into `Database V1.4/seed_validator.sql`; these assert intentional demo rows and the clean-seed no-image state. |

The main runtime validator now records **69 checks**. The seed validator records **18 checks** and is intended only after `schema.sql` plus `seed.sql` on a clean disposable database.

## Seed-only checks moved

The 18 seed assertions retain their original meanings and are scoped to their actual seeded examples:

- `V1.1-02,04,05,06,07,08,13,16,19`
- `V1.2-01,12`
- `V1.3-23,24,25,26,27,32` — the five seeded Contract IDs are explicitly scoped as `(3001, 3002, 4001, 4002, 4003)`, matching `seed.sql`.
- `V1.4-09` — a clean seed intentionally has no `room_images` rows.

No database constraint or business rule was weakened. The populated runtime validator no longer asserts a global seed row count or requires `room_images` to be empty.

## Runtime probe compatibility change

RoomImage behavior probes now select existing Room IDs dynamically and use transaction-specific storage keys. The validator finds one image-free Room with no dependent contract, occupancy, parking assignment, complaint, or contact request for the delete-restrict case, and three other image-free Rooms for shared-key, independent-capacity, and identity probes. The clean V1.4 seed has exactly four suitable empty rooms; populated data with existing image associations is supported as long as four image-free probe rooms remain. All probe inserts and attempted mutations run in the validator transaction and are rolled back.

## PostgreSQL 18 validation

| Target | Setup | Runtime validator | Seed validator | Before/after data |
|---|---|---:|---:|---|
| Disposable clean V1.4 | `schema.sql` PASS; `seed.sql` PASS | **69/69 PASS** | **18/18 PASS** | Disposable database removed after validation. |
| Disposable populated V1.4 | `schema.sql` PASS; `seed.sql` PASS; two legitimate RoomImage associations added | **69/69 PASS** | Not run (seed validator is intentionally clean-seed-only) | Disposable database removed after validation. |
| Local `Goctro_test3` | Existing V1.4 database; validator only | **69/69 PASS** | Not run | **27 public tables and 9 `room_images` rows before and after.** |

The local runtime validator completed its transaction with `ROLLBACK`; no persistent rows were added or removed. The two disposable test databases were created for this pass and then dropped. PostgreSQL version was **18.6**.

## Result and gate

- `runtime_validator.sql`: clean and populated compatibility PASS; 69/69 checks.
- `seed_validator.sql`: clean V1.4 seed PASS; 18/18 checks.
- Local `Goctro_test3`: runtime PASS; 27-table/9-image baseline unchanged.
- `schema.sql`, `seed.sql`, Prisma, backend, frontend, migrations, and V1.5 artifacts were not modified or executed. No V1.5 migration was run.
- The prior V1.4 populated-database validator blocker is resolved. The V1.5 migration gate is ready for its own authorized migration pass; this report does not perform that migration.

## Files changed

- `GocTro-SmartBuilding/Database V1.4/runtime_validator.sql`
- `GocTro-SmartBuilding/Database V1.4/seed_validator.sql` (new)
- `SmartRentalManagement/docs/07_modules/property-room/DATABASE_V1_4_RUNTIME_VALIDATOR_POPULATED_DB_COMPATIBILITY_REPORT.md` (this report)
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`
