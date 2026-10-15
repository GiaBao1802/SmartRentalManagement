# Resident + Room Occupancy API V1.2 Migration Report

**Status:** Domain routes and repository implemented. Mock-backed API tests and existing Auth/Property/Room regressions pass. Durable idempotency is an infrastructure blocker; the API is not fully conformant with §7 replay guarantees until that is resolved.

## 1. API Spec sections used

- §2 authentication and Owner/Resident identity scope.
- §5.5 Residents and occupancy, including listed routes, filters, archive behavior, occupancy history, scoped CCCD search, and `/me/rental`.
- §6 transaction-sensitive transfer rules.
- §7 Idempotency-Key requirements.
- §8 server-owned identity/capacity state.
- §9.1 create Resident and the documented `RESIDENT_NATIONAL_ID_ALREADY_EXISTS_IN_OWNER` conflict.
- Requirements §§7 and 21.3 for capacity snapshot and Resident lifecycle rules.

## 2. Prisma models audited

`Resident`, `RoomResident`, `Room`, `Property`, and `Contract`, including account-to-resident authentication context and the composite Owner/Property/Room/Contract relationships needed for scope validation. No legacy `Tenant` model or fields are used in the V1.2 routes.

## 3. Endpoints implemented

Mounted under `/api/v1`:

- `GET/POST /residents`
- `POST /residents/search`
- `GET/PATCH/DELETE /residents/:resident_id`
- `GET/POST /rooms/:room_id/residents`
- `POST /occupancies/:occupancy_id/end`
- `POST /residents/:resident_id/transfer`
- `GET /me/rental`

No additional endpoint was added.

## 4. Resident request/response mapping

Create and update validate schema-backed profile fields only: `national_id`, `full_name`, `phone`, `email`, `birth_date`, `gender`, `residence_status`, and `residence_registration_status`. `owner_id`, archive timestamps, and other server-managed values are never accepted. Create returns 201; detail/update/archive return 200; list uses the shared page metadata. BigInt IDs serialize as decimal strings, dates as `YYYY-MM-DD`, timestamps as RFC 3339, and JSON names as snake_case.

Resident status allowlists follow the database: `living|left` and `not_completed|temporary_resident|temporary_absence`. Nullable CCCD/contact/date/gender fields are supported.

## 5. CCCD privacy and uniqueness

- Search is an exact body-based query scoped by authenticated `ownerId`; it does not query globally.
- A missing match returns 404 `RESIDENT_NOT_FOUND_IN_OWNER_SCOPE` with empty details, including when a foreign Owner has the CCCD.
- PostgreSQL's `(owner_id, national_id)` unique constraint is the create-time duplicate guard; a same-Owner collision maps to `RESIDENT_NATIONAL_ID_ALREADY_EXISTS_IN_OWNER`. Patch checks for a duplicate in the same Owner before updating.
- CCCD is not included in route URLs or error messages. Request middleware records only request IDs; error logging records request ID/error class and not request bodies.

## 6. Owner tenant isolation

Every Admin query/mutation derives scope from `req.auth.ownerId`. Resident, Room, Contract, and occupancy lookups include authenticated Owner scope, so a foreign resource resolves to a generic 404. `property_id` and `room_id` list filters are applied only through Owner-scoped occupancy rows. Resident self-read uses both authenticated `ownerId` and `residentId`; client identity fields never set either value.

## 7. Occupancy model and lifecycle

`room_residents` is the sole occupancy source. Lists include active and ended history. Add creates a new row; end updates `ended_at` and `status=ended`; transfer closes the selected source and creates a destination row in one transaction. No row is hard-deleted. Duplicate active occupancy in the same Room is rejected, while the backend does not impose a platform-wide one-active-occupancy-per-Resident rule.

Transfer currently accepts `source_occupancy_id`, `room_id`, optional `contract_id`, and `started_at`. The API Spec describes the transfer intent but does not lock this exact request/response shape; confirm and lock it in the planned Resident/Occupancy contract-hardening step before client implementation.

## 8. Capacity enforcement

Capacity checks run inside a Serializable Prisma transaction. The repository locks affected Room rows with parameterized `SELECT ... FOR UPDATE`, in stable ID order, and retries PostgreSQL serialization conflicts. Occupancy count uses active rows that have started by the requested effective date. An applicable active Contract covering that date supplies `resident_capacity`; it is not overridden by `rooms.default_capacity`. When no applicable Contract exists, Requirements define the configured Room default as the limit. Capacity overflow returns `409 ROOM_CAPACITY_EXCEEDED`.

## 9. Transfer transaction design

The transaction validates the source occupancy and Resident, locks source/destination Rooms in stable order, resolves the destination Room and optional in-scope Contract, checks duplicate occupancy and capacity, then ends the source and inserts the destination. Database transaction rollback prevents partial transfer if either write fails. Contract/Room/Property and Resident/Owner composite foreign keys remain the database's final consistency guard.

## 10. `/me/rental` behavior

Resident-only route; it derives identity from `req.auth.residentId` and `req.auth.ownerId`. The repository returns the authenticated profile's occupancy history with related Room/Property context, linked Contract summary, and contracts where the Resident is the representative. It does not load other Residents' profile data.

## 11. Idempotency status

The four required mutation commands validate presence/shape of `Idempotency-Key`. The current backend foundation has no durable generic idempotency store, and the database has no idempotency table. No in-memory or fake persistence was added. Consequently replaying a successful POST is not yet guaranteed to return its original result, and repeated commands may repeat a transition or create duplicate rows where database constraints allow it. This remains a blocker to claiming full §7 compliance; add an approved durable infrastructure store before production/client rollout. No database schema was changed.

## 12. Legacy Resident/Tenant routes

Unversioned `/api/tenants`, tenant portal, tenant option, and tenant-dependent legacy domain handlers remain isolated in `backend/src/app.ts`. Other unmigrated demo domains still reference the legacy Tenant model, so removing them would exceed this migration scope. No compatibility Prisma alias was introduced. They are not the V1.2 Resident API.

## 13–16. Tests and regression

- Resident/Occupancy: **37/37 PASS**, mock repositories plus fake transaction clients; no database connection or write.
- Auth regression: **20/20 PASS**.
- Property/Room regression: **33/33 PASS**.
- CCCD scoping, generic foreign-owner 404, input validation, capacity source precedence, occupancy end, and transaction write ordering are covered. Runtime PostgreSQL integration/concurrency testing was not performed.

## 17. Backend typecheck/build

| Check | Before this migration | After this migration |
|---|---:|---:|
| TypeScript diagnostics | 173 | 173 |
| Backend build | 173 legacy diagnostics | 173 legacy diagnostics |
| New Resident/Occupancy/Auth/Property module diagnostics | — | 0 |

`typecheck` and `build` remain blocked by the pre-existing legacy errors in `backend/src/app.ts`; the count is unchanged from the Property/Room migration baseline. No `app.ts` suppression or compatibility alias was added.

Remaining diagnostics grouped by legacy area (baseline inventory):

| Legacy area | Diagnostics |
|---|---:|
| Session/auth and tenant/resource-scope helpers | 14 |
| Legacy auth, public/admin, and option routes | 61 |
| Resident/Tenant mutation routes | 4 |
| Contract routes | 19 |
| Invoice routes | 17 |
| Amenity and booking routes | 14 |
| Viewing and maintenance routes | 8 |
| Tenant reads | 7 |
| Contract/Invoice reads | 14 |
| Amenity/Maintenance reads | 15 |
| **Total** | **173** |

## 18. Blockers and ambiguities

1. Durable idempotency/replay support is missing as described in §11.
2. The transfer request/response shape needs API contract hardening before client implementation.
3. Backend `typecheck`/`build` still fail on 173 existing `app.ts` diagnostics. The migrated modules add none.
4. The repository tests use mock/fake clients. A disposable PostgreSQL concurrency/integration pass remains outstanding; no user database was used.

## 19. Files changed

- `backend/src/residents/resident.validation.ts`
- `backend/src/residents/resident.repository.ts`
- `backend/src/residents/resident.routes.ts`
- `backend/src/residents/resident.test.ts`
- `backend/src/auth/v1.router.ts`
- `backend/src/middleware/auth.ts`
- `backend/src/app.ts`
- `backend/package.json`
- `docs/07_modules/resident-occupancy/RESIDENT_OCCUPANCY_API_V1_2_MIGRATION_REPORT.md`

Database V1.2 files, Prisma schema/migrations, API Spec, business requirements, and frontend were not changed.

## 20. Next recommended domain

Complete **RESIDENT/OCCUPANCY CONTRACT HARDENING** first: lock transfer input/output, define lifecycle edge cases, and provide durable idempotency storage. Then proceed to Contract API V1.2 migration after review.
