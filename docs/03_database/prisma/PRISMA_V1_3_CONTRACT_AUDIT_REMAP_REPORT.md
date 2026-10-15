# Prisma V1.3 Contract Audit/Revision Remap Report

## Result

Prisma is now mapped to the Database V1.3 Contract Audit/Revision additions. The physical database was not connected to or changed during this work.

## Source and retained snapshot

- Physical source of truth: `Database V1.3/schema.sql`, checked against the V1.3 ERD, seed, validator, and changelog.
- The pre-change Prisma schema was copied unchanged to `SmartRentalManagement/database/schema.v1_2.prisma` before editing the current mapping.
- `SmartRentalManagement/database/schema.prisma` remains the current Prisma schema and retains the previous V1.2 models, fields, relations, and mappings. Its diff adds only the Contract revision/history mapping and required reverse relations/unique key.
- No SQL schema, seed, migration, backend business logic, frontend, Requirement, or API Spec was modified.

## V1.3 mapping

| Physical table | Prisma model | Mapping |
| --- | --- | --- |
| `contract_change_history` | `ContractChangeHistory` | `change_id`, `contract_id`, `owner_id`, `changed_by_account_id`, `revision`, `change_type`, `change_reason`, `before_data`, `after_data`, `created_at` mapped with `@map`; model mapped with `@@map` |

`Contract.revision` maps to `contracts.revision` with `Int @default(0)`. `Contract` has the composite unique key `(contract_id, owner_id)` needed by the history relation. The history model maps:

- composite Contract relation `(contract_id, owner_id)` → `(contract_id, owner_id)`;
- Owner relation through `owner_id`;
- composite actor Account relation `(changed_by_account_id, owner_id)` → `(account_id, owner_id)`;
- unique `(contract_id, revision)`;
- index `(owner_id, contract_id, revision DESC)`.

The matching reverse collections were added to `Owner`, `Account`, and `Contract`. Existing mappings were preserved.

## Database-enforced rules not fully represented in Prisma

Prisma models the columns, relations, unique key, and index, but the database remains authoritative for SQL-only behavior, including:

- revision/status consistency and non-negative revision checks;
- allowed `change_type` values and required reason rules;
- JSON object/content checks on before/after snapshots;
- append-only / immutable history enforcement implemented by database triggers;
- any other CHECK, partial-index, trigger, or advanced invariant in the locked V1.3 SQL schema.

No attempt was made to weaken or reproduce those rules in Prisma or alter the database schema.

## Tool results

- `prisma validate --schema ../database/schema.prisma`: **PASS**.
- `npm run db:generate --workspace=@goctro/backend`: **PASS**, Prisma Client 6.12.0 generated. No database command was run.
- Backend typecheck before and after remapping: **173 TypeScript errors** both times, all in legacy references in `backend/src/app.ts`; delta: **0 new errors** from the Prisma remap.
- Auth regression: **20/20 PASS**.
- Property/Room regression: **33/33 PASS**.
- Resident/Occupancy regression: **37/37 PASS**.

The initial test attempts inside the restricted sandbox could not bind/connect to the local test server (`EACCES`). The final test runs with loopback access passed at the counts above.

## Documentation status note

The approved Contract audit/revision business rules were consistent across the reviewed sources. Some status metadata remains stale in out-of-scope documents: `docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`, and the V1.3 change request still contain wording that describes V1.2 as current or V1.3 as not yet physically implemented. Those files were not edited because this remap was explicitly limited to Prisma and this report. This is a documentation synchronization item, not a Prisma validation or mapping failure.

## Files and next step

Files changed/created:

- `SmartRentalManagement/database/schema.prisma`
- `SmartRentalManagement/database/schema.v1_2.prisma` (retained pre-change snapshot)
- `SmartRentalManagement/docs/03_database/prisma/PRISMA_V1_3_CONTRACT_AUDIT_REMAP_REPORT.md`

Recommended next step: reconcile the stale source-document status metadata in its own authorized documentation change, then continue the Contract API V1.3 migration when requested. No backend migration was started here.
