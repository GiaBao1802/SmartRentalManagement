# Frontend Integration Pass 2 — Resident and Occupancy

**Status:** frontend integration implemented; authenticated browser smoke remains pending because no usable V1.3 Resident DEV credential was available in the current browser session.

## 1. Screens audited

| Screen | Before | Current V1 source | Work |
|---|---|---|---|
| Admin Resident list (`/admin/tenants`) | Generic `DataManagement` called legacy `/api/tenants`, client-filtered unpaged rows and legacy camelCase fields | `GET /api/v1/residents` | Replaced with server pagination/filters, exact CCCD search, create, archive and detail navigation |
| Admin Resident detail (`/admin/tenants/[residentId]`) | No V1 detail route | `GET/PATCH/DELETE /api/v1/residents/{resident_id}` | Added profile edit, history, archive, end occupancy and transfer |
| Room Resident panel (`/admin/properties/[propertyId]/rooms`) | Room table only; no real occupancy view | `GET/POST /api/v1/rooms/{room_id}/residents`; `POST /api/v1/occupancies/{occupancy_id}/end` | Added occupancy history, exact CCCD selection, add and end flows |
| Resident portal (`/tenant`) | Called legacy `/api/tenant-portal/summary`, requests, invoices, bookings, and legacy logout | Auth session plus `GET /api/v1/me/rental` | Replaced with own-profile, own-occupancy and safe representative-contract summaries |

The unused legacy component `frontend/src/app/tenants/tenant-management.tsx` and legacy backend routes/source were not deleted. The active `/admin/tenants` route no longer imports or calls them.

## 2. Legacy/mock paths found

- The former active admin list used `/api/tenants`, `pageSize`, `pagination.total`, camelCase properties, browser-side search/filtering, and generic hard-delete UI.
- The former Resident portal used `/api/tenant-portal/summary`, `/api/tenant-portal/requests`, and `/api/auth/logout`; it also rendered legacy invoice, support-request, and amenity-booking data.
- No mock arrays were used by the new active Resident/Occupancy runtime paths.
- The V1 API does not offer list search by name or phone. The UI therefore provides only the supported exact CCCD search endpoint; residence/property/room filters and pagination use the server.

## 3. Resident API mapping

Central helpers are in `frontend/src/lib/api/residentApi.ts`; they use `apiRequest`, which sends `credentials: "include"`, CSRF for unsafe methods, `cache: "no-store"`, and the shared API error mapping.

- List: `GET /residents?page&page_size&residence_status&residence_registration_status&property_id&room_id`.
- Search: `POST /residents/search` with exactly `{ "national_id": "…" }`; exact 12-digit CCCD only, never placed in URL/query. No match is rendered with the API's scoped not-found message.
- Detail: `GET /residents/{resident_id}`. IDs stay strings, including values larger than JavaScript's safe integer range.
- Create: `POST /residents` with only user-editable profile fields and an `Idempotency-Key`. No owner, resident ID, timestamps, archive state, or role is sent.
- Edit: `PATCH /residents/{resident_id}` with changed fields only. Nullable profile fields are cleared using `null`; read-only and server-owned fields are excluded.
- Archive: `DELETE /residents/{resident_id}`. This is presented as **Lưu trữ**, not hard deletion. The row is not removed optimistically; the list reloads only after backend success. Active relationship conflicts are shown from the backend response.
- Pagination uses the response `meta.page`, `meta.total_pages`, and `meta.total_items`. When archiving the only row on the last page, the list backs up to the new last page.

## 4. Resident detail and role handling

The Admin detail screen renders only the selected Resident plus that Resident's occupancy history returned by the scoped API. Foreign and missing IDs use the same shared API not-found presentation. Admin-only screens render inside `AdminShell`; its session/role gate redirects a Resident to `/tenant` before the admin page body is rendered.

Admin CCCD display is limited to the Admin Resident list/detail and the specific CCCD lookup workflow required to choose a Resident. The Room occupancy history does not display CCCD. No Owner or authority ID is accepted from UI form state.

## 5. Occupancy mapping and behavior

Central helpers are in `frontend/src/lib/api/occupancyApi.ts`.

| Flow | Request | UI behavior |
|---|---|---|
| Room residents/history | `GET /rooms/{room_id}/residents` | Renders active and ended occupancy rows returned by backend; no local inference from a stale Resident array |
| Add to Room | `POST /rooms/{room_id}/residents` with `{ "resident_id": "…", "started_at": "YYYY-MM-DD" }` | Resident can be selected via exact scoped CCCD search or the backend-paginated resident list (including profiles without optional CCCD). Optional `contract_id` is omitted so backend selects the applicable Contract or stores null. Idempotency key and CSRF are sent. |
| End occupancy | `POST /occupancies/{occupancy_id}/end` with exactly `{ "ended_at": "YYYY-MM-DD" }` | Confirms date, shows selected-row pending state, then reloads Room list or Resident detail from backend. History is preserved. |
| Transfer | `POST /residents/{resident_id}/transfer` | Destination selector lists backend Rooms returned under the Admin session, excludes source/inactive Rooms, and displays current/source and target context. |

Transfer body is exactly the locked shape, including explicit null for backend-selected Contract:

```json
{
  "source_occupancy_id": "…",
  "room_id": "…",
  "contract_id": null,
  "started_at": "YYYY-MM-DD"
}
```

No `owner_id`, `resident_id` authority, `source_room_id`, status, or transfer metadata is sent. On success, source and destination history reload from the server; no optimistic state is applied.

## 6. Capacity and conflicts

The Room panel displays the Room capacity/current Contract capacity summary supplied by the Room API and explicitly leaves the date-specific decision to backend. Frontend does not calculate or override capacity. Backend remains authoritative: applicable `contracts.resident_capacity` takes precedence over `rooms.default_capacity`; otherwise the Room default applies.

`409 ROOM_CAPACITY_EXCEEDED`, duplicate same-Room occupancy, invalid date, ended source, missing/foreign destination, missing Contract, and archive conflicts are surfaced through the shared API message/code handling. The frontend does not invent public error codes or bypass Owner/Room/Contract validation. Add/end success refreshes both the Room's occupancy history and the parent Room list/statistics; Resident detail end/transfer success refreshes the Resident history.

## 7. Resident self-service and privacy

`/tenant` waits for the shared Auth session, redirects unauthenticated users to login and redirects Admin users to the Admin area. A Resident invokes only `GET /api/v1/me/rental`, with no Resident ID in URL, query or body. It displays the authenticated Resident's contact/registration state, own current/historical occupancy, Room/Property details returned by that endpoint, and read-only representative Contract summary fields. It does not render CCCD, other Residents, Contract audit data, invoices, payment controls, requests or amenity bookings.

Logout uses shared `authApi.logout()` and CSRF/session handling. The backend remains the privacy and authorization authority; frontend routing is only UX.

## 8. Pending, success, errors, and refresh

Create, edit, archive, add occupancy, end occupancy, and transfer have pending labels/disabled relevant actions, success notices, and backend/network error messages. Double submit is guarded. Mutation success reloads the relevant list/detail from backend. Failure preserves displayed rows and does not simulate a successful status change.

## 9. Browser/local smoke

- `npm run dev:all`: **PASS**. Existing PostgreSQL, backend and frontend processes were reused; database health and CSRF bootstrap passed. No duplicate servers were started; no migration or seed was run.
- Frontend route opened previously redirected to the login page because this browser session had no authenticated session. Authenticated Admin and Resident browser workflows (create/edit/archive/add/end/transfer, role restriction, refresh persistence) could not be honestly marked PASS in this session.
- The available `DEV_TENANT_PASSWORD` entry is part of the legacy seed's `UserAccount` model, not a documented usable V1.3 `Account` credential. It was not used. No account was created or reset.
- No live Resident data mutation was performed.

## 10. Tests and build

- Frontend API client tests: **5/5 PASS**, including new assertions for V1 Resident filters, CCCD body search, changed-field PATCH, archive, occupancy routes, exact transfer JSON, credentials, CSRF and idempotency headers.
- Frontend TypeScript typecheck: **PASS**.
- Frontend production build: **PASS**. Routes `/admin/tenants`, `/admin/tenants/[residentId]`, `/admin/properties/[propertyId]/rooms`, and `/tenant` compile.
- Backend Resident/Occupancy suite: **37/37 PASS**. These are the existing route/repository mock-based tests; they did not modify backend source or database.
- An initial run of the backend suite in the restricted sandbox could not open its temporary localhost test port (`EACCES`); rerun with permitted local networking passed all 37 tests.

## 11. Files changed

- `frontend/src/lib/api/residentApi.ts` (new)
- `frontend/src/lib/api/occupancyApi.ts` (new)
- `frontend/src/lib/api/apiClient.test.ts`
- `frontend/src/app/admin/tenants/page.tsx`
- `frontend/src/app/admin/tenants/resident-management.tsx` (new)
- `frontend/src/app/admin/tenants/[residentId]/page.tsx` (new)
- `frontend/src/app/admin/tenants/[residentId]/resident-detail.tsx` (new)
- `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx`
- `frontend/src/app/admin/properties/[propertyId]/rooms/resident-room-panel.tsx` (new)
- `frontend/src/app/tenant/tenant-portal.tsx`
- `docs/07_modules/resident-occupancy/FRONTEND_INTEGRATION_PASS_2_RESIDENT_OCCUPANCY_REPORT.md` (this report)

Backend modified: **NO**. Database/Prisma/migrations modified: **NO**. Contract, Invoice/Zalo, Payment, and Public Marketplace frontend: **NOT integrated**.

## 12. Blockers and next pass

No Resident/Occupancy API contract gap was found. The remaining verification gap is authenticated browser smoke with valid local Admin and Resident V1.3 accounts; no usable Resident plaintext DEV password was found, and this pass did not provision/reset one. Next, run the prescribed Admin and Resident smoke flow when those credentials are available. Do not begin Contract frontend integration as part of this pass.
