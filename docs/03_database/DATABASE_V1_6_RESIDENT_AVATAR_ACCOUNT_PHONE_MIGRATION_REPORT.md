# Database V1.6 Resident Avatar + Account Phone Uniqueness — Migration Pass

**Date:** 2026-10-12  
**Current status:** `V1.6 LOCKED FOR LOCAL/DEV; Prisma validate/generate, database runtime validation, health, and required regression gates PASS`  
**V1.5 locked source status:** PASS per `Database V1.5/README.md` (PostgreSQL 18.6, 28 public tables, validator 90/90).  
**Historical initial-pass live Goctro_test3 status:** NOT VERIFIED at that time; the resume closure below supersedes it.

## Historical pre-resume snapshot — blocked before database access

The original pass below is retained as audit history. Its status was superseded by the resume closure at the end of this report.

## 1. Executive summary

The migration pass stopped before backup or any write because the mandatory pre-migration baseline could not be verified against the live Goctro_test3 database. `localhost:5432` had no listening socket visible; `localhost:4000/api/health` and `/api/health/db` were unreachable; `psql`, `pg_dump`, `pg_restore`, `pg_ctl` and Docker CLI were unavailable in this environment; and a read-only Prisma connection attempt could not initialize. The service manager could not be queried due permission restrictions.

The locked SQL and Prisma source confirm the two requested gaps: Resident has no avatar storage reference, and `accounts.phone` has no unique constraint/index. Static Auth review also found no phone normalization; login compares phone exactly and Resident profile validation only checks a text value up to 30 characters. The live phone audit, normalized duplicate count, backup, migration, PostgreSQL validator, Prisma generation and app tests were not run. No V1.6 artifacts were created and no source/database files were modified.

## 2. Why V1.6 is needed

Approved Resident self-service requires avatar storage outside PostgreSQL with a stored key, and Resident login requires a unique phone per Account. Application checks alone cannot guarantee phone uniqueness during concurrent account creation or phone changes. These additive physical changes need a new version because V1.5 is locked.

## 3. V1.5 baseline recheck

| Check | Result |
|---|---|
| Locked V1.5 source reports current local/dev baseline | PASS (source README) |
| Locked V1.5 source reports PostgreSQL 18.6 / 28 public tables | PASS (source README) |
| Locked V1.5 source validator result | PASS, 90/90 per README; not rerun here |
| Live target `current_database() = Goctro_test3` | NOT VERIFIED |
| Live PostgreSQL version / port | NOT VERIFIED |
| Live public table count = 28 | NOT VERIFIED |
| Live V1.5 validator | NOT RUN |
| Prisma validate against current source | NOT RUN |
| Resident avatar field in SQL and Prisma | MISSING |
| Unique `accounts.phone` constraint/index in SQL and Prisma | MISSING |

Because the live identity/version/contents could not be confirmed, baseline gate is **FAIL / UNVERIFIED** and migration must not proceed.

## 4. Phone data audit

The required live audit was not possible. Counts and formats below are unknown; no phone values were output or changed.

| Audit item | Result |
|---|---|
| NULL count | NOT RUN |
| Blank/whitespace count | NOT RUN |
| Raw format distribution | NOT RUN |
| Raw duplicate count | NOT RUN |
| Duplicate count after candidate normalization | NOT RUN |
| Admin Account phone presence | NOT RUN |
| Resident Account phone presence | NOT RUN |
| Existing `090…`, `+8490…`, `8490…`, separator variants | NOT RUN |

No conflicting account was deleted, updated or arbitrarily selected.

## 5. Phone normalization assessment

Current `PrismaAuthRepository.findCandidates` compares `{ phone: login }` exactly. `resident.validation.ts` accepts a trimmed string with a 30-character limit; it does not normalize or validate a phone pattern. Test fixtures include `+84…`, but that is not a normalization contract. Thus there is no established project convention to use as canonical format.

No canonical format is selected in this blocked pass. Before migration, decide and test a deterministic input-to-storage/login normalization policy, including Vietnam national `0…`, `84…`, `+84…`, separators, and international/unsupported inputs. Audit normalized collisions before any data update. Do not bulk-rewrite current phone values without a proven one-to-one mapping and explicit approval.

## 6. Duplicate phone analysis

Live raw and normalized conflict totals are unknown. The local migration remains blocked until the database is reachable, the full audit is run without exposing phone values, and any normalized duplicates are manually reconciled. No duplicate is assumed absent.

## 7. Avatar column design assessment

The V1.5 Resident model has no avatar/reference field. Proposed next-version additive field: nullable `residents.avatar_storage_key TEXT`, containing only a backend-generated relative key such as `resident-avatars/YYYY/MM/<uuid>.webp`; no absolute path, URL tied to one environment, or binary data. If keys identify one physical file per Resident, add a unique index for non-null keys. The actual V1.6 schema/migration was not created because the baseline gate failed.

## 8. Phone uniqueness design assessment

V1.5 `accounts.phone` is nullable and has no unique constraint/index. After choosing canonical normalization and resolving live conflicts, V1.6 should add a unique partial index on non-null stored canonical phone values, for example `CREATE UNIQUE INDEX accounts_phone_nonnull_key ON accounts(phone) WHERE phone IS NOT NULL`. This enforces the approved uniqueness invariant while allowing multiple Accounts with no phone. It must not be applied until the pre-migration audit is clean.

## 9. Migration SQL

Not created or applied. The intended scope is limited to adding the nullable Resident storage-key column and its non-null uniqueness, plus non-null Account phone uniqueness after the normalization audit. No invitation table or unrelated Account rule changes are needed.

## 10. Backup

Not attempted because the target database could not be reached and `pg_dump`/`pg_restore` were unavailable. No backup file path exists. Do not proceed to migration until a fresh timestamped backup is produced and `pg_restore --list` confirms it is readable.

## 11. Clean migration test

Not run. No disposable PostgreSQL server/database tools were available. Required V1.5 schema + seed + 90/90 validator → V1.6 migration → V1.6 validator evidence remains pending.

## 12. Populated migration test

Not run. No disposable PostgreSQL runtime was available. Required fingerprints/counts for Accounts, Residents, Occupancies, Properties, Rooms, Room Images, Contracts, Invoices and invitations remain pending.

## 13. Local Goctro_test3 migration

Not run. Target identity was not verified. No `ALTER TABLE`, migration, schema SQL, seed, reset, `db push`, `db pull` or direct SQL write was executed.

## 14. Data preservation

No before/after comparison was possible. No rows or IDs were changed by this pass. Preservation is **NOT VERIFIED**, not PASS.

## 15. Phone concurrency

Not run. The expected future test is two concurrent attempts to persist the same normalized non-null phone: one insert/update succeeds, one fails on the database unique index, and there is no duplicate row.

## 16. Avatar database checks

Not run. After migration, test NULL, a generated storage key, duplicate-key rejection if uniqueness is selected, and existing Resident preservation. No image upload belongs in this database pass.

## 17. Prisma

No Prisma changes. `prisma validate` and `prisma generate` were not run because the baseline gate failed. For a future partial unique phone index, preserve SQL as authority and document Prisma's representation limitation if needed; do not weaken the database index.

## 18. Runtime validator

No V1.6 validator was created or run. It must inherit V1.5 checks and add rollback-only structural/behavior probes for nullable unique avatar keys, unique non-null phone and NULL behavior.

## 19. App health and regressions

Backend `/api/health` and `/api/health/db` were unreachable. Auth CSRF, frontend startup, and Auth/Resident/Contract/Property-Room/Room Images/Invoice-Zalo regressions were not run. Do not report these gates as PASS.

## 20. Typecheck and build

Not run; no code or Prisma source was changed. The previous provisioning report recorded a legacy backend diagnostic baseline but this migration pass did not remeasure it.

## 21. V1.6 version decision

V1.6 artifacts have **not** been created; V1.5 remains the current locked baseline. The two approved additive changes remain a proposed scope only until live prechecks and migration gates pass.

## 22. Rollback guidance

No migration was applied, so no rollback was needed. Once a future V1.6 migration is approved and applied, retain the pre-V1.6 dump. Before application code stores avatar keys or relies on canonical unique phones, rollback may be possible with the reviewed migration/backup. After those values are in use, removal requires explicit reconciliation; do not automatically drop the fields/index.

## 23. Resident provisioning status

Not implemented, as required by the scope. No invitation routes, password setup, Resident login, `/me/profile`, avatar upload, Zalo delivery or Resident Portal E2E were started.

## 24. Exact next task

Restore/access the existing PostgreSQL 18.6 instance and make the current Goctro_test3 connection available to this workspace, without creating another database. Then rerun the read-only identity/version/table/validator/Prisma checks and the privacy-safe phone audit. Continue only if the live baseline matches V1.5 and normalized phone conflicts are resolved. Afterward create/verify the backup, test clean and populated migrations, and only then migrate Goctro_test3.

**Files modified:** this report and `docs/DOCUMENT_CATALOG.md` only. V1.5 SQL/Prisma/validator/seed, runtime database, app code, canonical Requirement/API and V1.6 artifacts were not modified.

## Resume closure — 2026-10-12

### Outcome

Database V1.6 was created, tested, and applied to `Goctro_test3`. The local physical database now includes the V1.6 delta and passed its 97-check runtime validator. V1.6 is **not marked LOCKED** because `prisma generate` could not replace a Windows query-engine DLL (`EPERM`). V1.5 remains the last fully locked baseline until generation and any final lock review pass. No backend business logic, migration runner, seed, or frontend was changed.

### Live target and phone audit

| Check | Result |
|---|---|
| PostgreSQL connection / target | PASS — `Goctro_test3`, localhost port 5432 |
| PostgreSQL | PASS — 18.6, Windows x86_64 |
| V1.5 pre-migration table count | PASS — 28 public tables |
| Existing accounts | 6 total; 6 non-null phone; 0 null; 0 blank |
| Phone formats | 6 local `0…`; 0 prefixed `84…`; 0 prefixed `+84…`; 0 with separators/outer whitespace |
| Unsupported phone formats | 0 |
| Duplicate raw phone groups | 0 |
| Duplicate groups after canonicalization | 0 |
| Admin / Resident Accounts with phone | 2 / 4 |
| Canonical stored form | `+84XXXXXXXXX` |

The audit held phone values in process memory only; reports and fingerprint files contain no raw phone values.

### Backup

- Backup: `D:\codexapp\SmartRentalManagement\.local\backups\Goctro_test3_pre_V1_6_20261012212224.dump`
- Size: 169,905 bytes.
- `pg_restore --list`: PASS, 308 entries.
- Before/after fingerprint manifests (counts and SHA-256 hashes only):
  - `D:\codexapp\SmartRentalManagement\.local\backups\Goctro_test3_pre_V1_6_20261012212224.fingerprints.json`
  - `D:\codexapp\SmartRentalManagement\.local\backups\Goctro_test3_post_V1_6_20261012.fingerprints.json`

### Artifacts and database changes

Created `GocTro-SmartBuilding/Database V1.6/` containing `schema.sql`, canonical synthetic `seed.sql`, `erd.md`, `README.md`, `changelog.md`, `runtime_validator.sql`, and `migrations/V1_5_to_V1_6_resident_avatar_account_phone.sql`.

The migration performs only the approved changes: preflight/normalize existing approved Vietnamese Account phone forms; add nullable `residents.avatar_storage_key TEXT`; add a unique partial index for non-null avatar keys; add a unique partial index for non-null Account phone values. The migration aborts before persistent changes for unsupported phone values or normalized collisions. No table was added; public table count remains 28.

Existing phone values were six supported local forms and became canonical `+84…`. All 14 existing Resident avatar keys are NULL. The database does not store image bytes, absolute filesystem paths, or environment-specific URLs.

### Runtime validation and preservation

| Validation | Result |
|---|---|
| Clean V1.5 source validator before migration | PASS 90/90 |
| Clean V1.5 → V1.6 migration | PASS |
| Clean V1.6 runtime validator | PASS 97/97 |
| Populated V1.5 → V1.6 test migration, including one RoomImage | PASS |
| Populated V1.6 runtime validator | PASS 97/97 |
| Fresh V1.6 `schema.sql` install + canonical V1.6 synthetic seed | PASS |
| V1.4 seed validator on fresh V1.6 schema/seed | PASS 18/18 |
| V1.5 runtime regression validator on fresh V1.6 schema | PASS 90/90 |
| Fresh V1.6 runtime validator | PASS 97/97 |
| Goctro_test3 migration | PASS |
| Goctro_test3 V1.6 runtime validator | PASS 97/97 |
| Goctro_test3 table count after migration | 28 |
| Goctro_test3 existing avatars NULL / phone canonical | PASS — 14 / 6 |

Required live table counts, sorted ID hashes, and normalized row fingerprints matched before/after for all ten tables:

| Table | Before | After | IDs and preserved fields |
|---|---:|---:|---|
| owners | 2 | 2 | PASS |
| accounts | 6 | 6 | PASS; phone differs only by approved canonicalization; fingerprint normalizes it first |
| residents | 14 | 14 | PASS |
| properties | 23 | 23 | PASS |
| rooms | 50 | 50 | PASS |
| room_images | 9 | 9 | PASS |
| room_residents | 17 | 17 | PASS |
| contracts | 10 | 10 | PASS |
| invoices | 4 | 4 | PASS |
| account_invitations | 2 | 2 | PASS |

Three disposable databases used for tests were dropped after validation. The V1.5 validator previously run directly against populated Goctro_test3 stopped only at its migration/seed-specific assertion that `contract_idempotency_requests` must be empty; the table contains 12 legitimate rows. The V1.5 source validator was not changed. Its clean 90/90 result is verified. V1.6 validator replaces that single non-populated-safe assertion with a structural existence check, preserving the other 89 V1.5 checks and adding seven V1.6 checks. The idempotency rows and constraints were preserved.

### Phone normalization and race checks

`normalizeVietnamPhone(input)` contract was exercised in a one-off validation script (not committed as backend code):

- Accepted to `+84901234567`: `0901234567`, `090 123 4567`, `090-123-4567`, `090.123.4567`, `84901234567`, `+84901234567`.
- Rejected: a `+1` number, malformed short input, too-short local input, and a malformed `84…` input.
- Result: 10/10 cases PASS.

A real two-connection PostgreSQL race attempted to set two Accounts to the same canonical phone on a disposable populated database. Exactly one write committed; the second received SQLSTATE `23505`; cleanup left no duplicate. PASS.

One shared backend utility, `normalizeVietnamPhone(input)`, is specified for Auth login, Resident profile phone changes, and account provisioning. This database task documents the rule but does not implement it. Resident provisioning, Zalo delivery, avatar upload, and Resident Portal E2E remain OUT OF SCOPE and were not started.

### Prisma, app health, regressions, and build at the initial recovery checkpoint (superseded below)

| Check | Result |
|---|---|
| Prisma schema mapping updated | PASS — Account phone uniqueness annotation and Resident `avatarStorageKey` mapping |
| `prisma validate` | PASS |
| `prisma generate` | BLOCKED — `EPERM` on rename/replace of `node_modules/.prisma/client/query_engine-windows.dll.node`; existing file could not be safely removed/replaced even after copying it to a backup; generated app Client therefore remains stale relative to V1.6 schema mapping |
| `/api/health` | PASS — 200 |
| `/api/health/db` | PASS — 200 |
| `/api/v1/auth/csrf` | PASS — 200 |
| Auth | PASS — 20/20 |
| Resident/Occupancy | PASS — 49/49 |
| Contract | PASS — 132/132 |
| Property/Room | PASS — 44/44 |
| Room Images | PASS — 21/21 |
| Invoice/Zalo | PASS — 36/36 |
| Backend typecheck | FAIL — 174 TS diagnostics: 173 in legacy `src/app.ts`, 1 in `src/residents/resident.test.ts` |
| Backend build | FAIL — same 174 legacy diagnostics |

The test runs and health checks succeeded. Typecheck/build diagnostics reference legacy Prisma model names and shapes (`tenant`, `userAccount`, `leaseContract`, old property/room IDs, etc.) and one Resident test fixture type. No backend source was changed, and no diagnostic references the two new V1.6 fields. Exact local test/typecheck logs are under `SmartRentalManagement/.local/v16-*.log`.

The Prisma `@unique` mapping represents non-null uniqueness for normal Client selectors; Prisma does not fully express the PostgreSQL partial-index predicate. `schema.sql` and PostgreSQL remain authoritative. Do not run `db push` to reconcile this mapping.

### Canonical docs and lock status at the initial recovery checkpoint (superseded below)

- `docs/01_REQUIREMENTS.md` records canonical Vietnam phone normalization/uniqueness and Resident avatar storage policy.
- `docs/04_API_SPEC.md` records phone login normalization and the shared helper contract, and notes that profile storage keys are server-managed and the flow is not yet implemented.
- `docs/DATABASE_CHANGELOG.md`, `Database V1.6/README.md`, `Database V1.6/changelog.md`, V1.5 README, and `docs/DOCUMENT_CATALOG.md` reflect the actual migrated/validated state.
- Business decisions: APPROVED. Goctro_test3 physical V1.6 migration: PASS. Runtime validator: 97/97. **Database V1.6 LOCK: NOT YET** because `prisma generate` remains blocked. Database V1.5 is the last fully locked baseline; it no longer describes the physical schema currently present in Goctro_test3.

### Files changed and next task

Changed: `GocTro-SmartBuilding/Database V1.6/*` including the canonical V1.6 seed; `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`; `GocTro-SmartBuilding/docs/04_API_SPEC.md`; `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`; `GocTro-SmartBuilding/Database V1.5/README.md`; `SmartRentalManagement/database/schema.prisma`; this report; and `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`. No backend/frontend business logic, V1.4 seed source, V1.5 schema, migration history, or V1.5 validator changed. A canonical synthetic `Database V1.6/seed.sql` was added.

Next task recorded at that checkpoint: **RESIDENT ACCOUNT PROVISIONING + SELF-SERVICE IMPLEMENTATION — RESUME AFTER DATABASE V1.6**. This checkpoint has since been superseded: provisioning remains paused, and the next project task is recorded in the final lock section below.

## Prisma generate recovery and final lock — 2026-10-12

### EPERM cause and recovery

The initial `prisma generate` failure was caused by the project backend process having the Prisma query-engine DLL loaded. Before stopping anything, the DLL could not be opened exclusively. The verified listener on port 4000 was project backend PID 11300, launched by the `tsx watch src/server.ts` process PID 22888; a second project `tsx watch` process PID 27124 was also present. Stopping the confirmed SmartRentalManagement backend/watch and frontend dev processes released the DLL; a subsequent exclusive-open probe passed. PostgreSQL PID 6252 was left running. The exact Windows handle owner could not be distinguished between the two project backend runtimes before they were stopped, so PID 11300 is the confirmed backend listener associated with the lock, not a uniquely proven handle attribution. After restart, backend PID 14156 was confirmed to have the generated `query_engine-windows.dll.node` loaded.

The first retry while project files/processes were inaccessible also returned `EPERM` resolving `node_modules/@prisma/client`. After using the host environment and stopping the project runtimes, the repository command `npm run db:generate --workspace=@goctro/backend` completed successfully with Prisma 6.12.0. No database command was executed by Prisma.

### Final verification

| Gate | Result |
|---|---|
| Prisma `validate` against `database/schema.prisma` | PASS |
| Prisma `generate` using the backend package script | PASS |
| Generated Client | PASS — generated V1.6 schema/types contain `Resident.avatarStorageKey`; Account phone selector uses the V1.6 unique mapping `accounts_phone_nonnull_key` |
| Goctro_test3 read-only identity | PASS — PostgreSQL 18.6, database `Goctro_test3`, port 5432, 28 public tables |
| V1.6 physical objects | PASS — `residents.avatar_storage_key` and `accounts_phone_nonnull_key` exist |
| V1.6 rollback-only runtime validator | PASS — 97/97; transaction ended with `ROLLBACK` |
| `/api/health`, `/api/health/db`, `/api/v1/auth/csrf` | PASS — HTTP 200 after backend restart |
| Auth | PASS — 20/20 |
| Resident/Occupancy | PASS — 49/49 |
| Contract | PASS — 132/132 |
| Property/Room | PASS — 44/44 |
| Room Images | PASS — 21/21 |
| Invoice/Zalo | PASS — 36/36 |
| Backend typecheck/build | Existing baseline — 174 diagnostics each; zero refer to V1.6 avatar/phone mapping |
| Database/data changed during this recovery | NO — only read-only SQL and a rollback-only validator were run |

The first test attempt from the restricted sandbox failed with loopback `EACCES`; rerunning the same six suites with local host access produced the PASS totals above. Typecheck/build continue to fail on the known legacy Prisma references and one legacy Resident test fixture; no V1.6-specific diagnostic was introduced.

### Final baseline decision

All required V1.6 lock gates passed. **Database V1.6 is LOCKED FOR LOCAL/DEV. Database V1.5 is the historical locked predecessor.** `LOCK` prevents ad hoc schema changes during implementation; a future approved rule change requires a new version/migration and runtime validation before it can replace this baseline.

Next project task, as directed: **BILLING / INVOICE CURRENT-STATE AUDIT + MIGRATION GAP CHECK**. This recovery pass did not start that task or Resident provisioning.
