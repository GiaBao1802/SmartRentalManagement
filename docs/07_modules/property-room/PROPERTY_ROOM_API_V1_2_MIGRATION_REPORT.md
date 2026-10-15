# Property + Room API V1.2 Migration Report

**Status:** Implemented; 33/33 domain tests pass. Backend typecheck/build remain blocked by legacy code in `backend/src/app.ts` (173 diagnostics, down from 209).

## 1. Sources and scope

- `GocTro-SmartBuilding/docs/04_API_SPEC.md`, §3, §4, §5.4 (Properties and Rooms), and §6 lifecycle/consistency rules.
- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`, Property/Room capacity rules.
- `database/schema.prisma` V1.2 models `Property`, `Room`, `Contract`, and `RoomResident`.
- `GocTro-SmartBuilding/Database V1.2/schema.sql`, `properties`, `rooms`, `contracts`, and `room_residents` definitions.

No API/Database field or relationship mismatch was found for these domains. The API Spec defines the endpoint behaviors and patch allowlists, but does not provide complete JSON examples for Property/Room create, detail, and list responses. The implementation maps the documented domain fields to the physical schema names in snake_case; this mapping is recorded below for review.

Only Property and Room management APIs were migrated. Guest room search/contact (§5.3), Resident CRUD/occupancy, Contracts, and every other domain remain outside this migration.

## 2. Endpoint implementation matrix

Successful endpoints use `{ "data": ... }`; collection responses also include the documented pagination `meta`. IDs are decimal strings. Errors use the shared request-ID error envelope.

| API Spec endpoint | Implemented route | Test coverage | Status |
|---|---|---|---|
| `GET /properties` | `GET /api/v1/properties` | Owner scope, filters/pagination, unknown query | Implemented |
| `POST /properties` | `POST /api/v1/properties` | Session-derived Owner, valid/invalid body, authority spoof | Implemented |
| `GET /properties/{property_id}` | `GET /api/v1/properties/:property_id` | Foreign/missing scope → 404, invalid ID | Implemented |
| `PATCH /properties/{property_id}` | `PATCH /api/v1/properties/:property_id` | Allowed field, foreign → 404, identity/unknown field rejected | Implemented |
| `DELETE /properties/{property_id}` | `DELETE /api/v1/properties/:property_id` | Archive lifecycle and active-operation conflict | Implemented |
| `GET /properties/{property_id}/rooms` | `GET /api/v1/properties/:property_id/rooms` | Parent scope, filters, invalid boolean | Implemented |
| `POST /properties/{property_id}/rooms` | `POST /api/v1/properties/:property_id/rooms` | Derived Owner/Property, identity spoof, capacity/amount validation | Implemented |
| `GET /rooms/{room_id}` | `GET /api/v1/rooms/:room_id` | Foreign → 404, Decimal serialization | Implemented |
| `PATCH /rooms/{room_id}` | `PATCH /api/v1/rooms/:room_id` | Foreign → 404, derived status rejected, restore conflict | Implemented |
| `DELETE /rooms/{room_id}` | `DELETE /api/v1/rooms/:room_id` | Deactivate lifecycle and active-operation conflict | Implemented |

## 3. Request and response mapping

The API surface maps the physical `properties` and `rooms` fields to snake_case JSON. Unknown fields are rejected. Property create accepts `property_code`, `name`, `province`, `address`, and optional `manager_name`; `status` starts at the database default `active`. Property PATCH accepts only the §5.4 allowlist: `name`, `province`, `address`, `manager_name`, `status`.

Room create accepts `room_code`, `default_rent`, `area_m2`, `default_capacity`, and optional `is_active`, `is_public`, `public_description`, and initial lifecycle `status`. Room PATCH accepts those mutable schema fields. It does not accept `owner_id`, `property_id`, `room_id`, `occupied`, or legacy fields such as `roomNumber`, `floor`, `condition`, `rentOverrideVnd`, and `isListed`.

Property list supports only `status`, `province`, `search`, `page`, and `page_size`; search checks `name`, `address`, and `property_code`. Room list supports only `status`, `is_active`, `is_public`, `page`, and `page_size`. Page defaults to 1, page size defaults to 20 and is capped at 100. Stable ordering appends the resource ID.

BigInt values (including VND rent) serialize as decimal strings. Prisma Decimal area values serialize as fixed two-decimal strings. Date-only contract dates serialize as `YYYY-MM-DD`; timestamps serialize as RFC 3339.

## 4. Prisma and tenant-scope mapping

### Property

Uses `Property.propertyId`, `ownerId`, `propertyCode`, `name`, `province`, `address`, `managerName`, `status`, and timestamps. Owner-scoped unique constraints remain enforced by Database V1.2 (`owner_id + property_code`, plus composite Property/Owner identity).

### Room

Uses `Room.roomId`, `propertyId`, `ownerId`, `roomCode`, `status`, `areaM2`, `defaultRent`, `defaultCapacity`, `isActive`, `isPublic`, `publicDescription`, and timestamps. Room creation derives both `propertyId` and `ownerId` from the in-scope parent Property and authenticated Admin; the client supplies neither.

Every Admin handler uses `req.auth.ownerId`. Property reads/mutations use scoped `findFirst`/composite updates. Room detail/update/deactivate queries include `ownerId`; Room lists/creation first resolve the parent with `{propertyId, ownerId}`. Foreign IDs receive the same `404 NOT_FOUND` envelope as missing IDs. The global V1 authority-field middleware rejects client `owner_id`, `resident_id`, and `role` values.

## 5. Validation and lifecycle behavior

- Property statuses are limited to `active`, `building`, `paused`, and `archived`; required strings and SQL varchar limits are validated before Prisma.
- Room code, positive area (maximum two decimal places), non-negative integer VND rent, and integer capacity `>= 1` are validated. Values are not converted through floating-point arithmetic for persistence.
- Persisted inactive state is represented consistently by `status=inactive` and `is_active=false`. Client cannot set `occupied`; effective Room status is derived from an active Contract or active occupancy, unless the Room is inactive.
- Room default capacity updates affect future contracts; they do not modify existing `contracts.resident_capacity` snapshots.
- Room DELETE deactivates the record; it never hard-deletes history. Deactivation and restore-to-available are rejected with 409 when active Contract/occupancy exists.
- Property DELETE sets `status=archived`, preserving history. Archiving is rejected with 409 if an active Contract or occupancy exists. PATCH to `status=archived` applies the same guard.
- These lifecycle checks read Contract and occupancy records using V1.2 relations; no Contract or occupancy API/domain was migrated.

## 6. Public endpoints

No public search/detail/contact endpoint was added. Guest room search/contact is the separate §5.3 domain and stays on the legacy implementation pending its own API migration.

## 7. Legacy Property/Room retirement

The unversioned route blocks for `GET/POST/PATCH/DELETE /api/properties`, `POST /api/properties/:id/rooms`, `GET /api/properties/:id/rooms`, and `PATCH/DELETE /api/rooms/:id` were removed from `app.ts`. A scoped mount guard returns `410 ENDPOINT_RETIRED` for legacy `/api/properties` and `/api/rooms` paths. The old option-list endpoints (`/api/options/properties`, `/api/options/rooms`, etc.) remain untouched because they are legacy integration points for other unmigrated domains; they are not substitutes for the V1.2 management endpoints. Legacy ownership helpers also remain where other legacy domains still call them.

## 8. Tests and validation

- Added `backend/src/properties/property-room.test.ts`: **33/33 PASS**, using a mock repository and HTTP loopback. Covers tenant scope, Admin role, client authority rejection, foreign-resource 404, CRUD validation, pagination, decimal/money handling, archive/deactivate semantics, and active-operation conflicts.
- Existing Auth regression suite: **20/20 PASS**.
- No test used PostgreSQL or mutated any database.
- `prisma db push`, migrations, seed, and SQL writes were not run.
- `database/schema.prisma`, Database V1.2 SQL, migrations, and frontend were not changed in this task.

### Typecheck/build

| Check | Before migration | After migration |
|---|---:|---:|
| Backend typecheck | 209 errors | 173 errors |
| Backend build | 209 errors | 173 errors |

The 36-error decrease is from retiring the legacy Property/Room handler blocks. **All 173 remaining diagnostics are in `backend/src/app.ts`; there are zero diagnostics in the new Property/Room modules.** Current legacy diagnostics grouped by app sections:

| Legacy area in `app.ts` | Diagnostics |
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

The Property/Room route blocks were removed, but legacy scope helpers and option endpoints remain because other legacy domains still use them. No TypeScript compatibility aliases or suppressed diagnostics were added.

## 9. Files modified

- `backend/src/app.ts`
- `backend/src/auth/v1.router.ts`
- `backend/src/properties/property-room.routes.ts`
- `backend/src/properties/property-room.repository.ts`
- `backend/src/properties/property-room.validation.ts`
- `backend/src/properties/property-room.test.ts`
- `backend/package.json`
- `PROPERTY_ROOM_API_V1_2_MIGRATION_REPORT.md`

No blocker was found between the Property/Room Prisma models and Database V1.2. Before treating this API surface as fully locked, consider adding explicit Property/Room request and response examples to §5.4; current field mapping follows the locked Prisma/SQL physical names and the API Spec's stated allowlists.

**Next recommended domain:** Resident + Room Occupancy API V1.2 migration. No follow-on migration was started.
