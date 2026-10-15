# Frontend Integration Pass 1 — Auth, Property, Room

**Result:** Auth and Admin Property/Room screens are wired to the current `/api/v1` backend contract. Existing visual layout and brand styles were retained. Resident, Occupancy, Contract, Invoice/Zalo, and Payment screens were not integrated.

## 1. Frontend architecture audited

- Next.js 16 App Router, React 19, TypeScript; root layout loads Be Vietnam Pro and the shared brand stylesheet.
- Authentication and data screens are Client Components where they use state, effects, or event handlers.
- The frontend had no shared V1 API helper or reusable auth provider before this pass. Auth, navigation, and `DataManagement` used legacy `/api/...` endpoints and legacy response fields.
- No frontend `localStorage` or `sessionStorage` use was found. The login page showed demo Admin/Landlord/Tenant credentials; those misleading legacy credentials were removed.

## 2. Routes and screen map

| Screen | Previous source / behavior | Current target / work |
|---|---|---|
| `/login` | Legacy `/api/auth/login`, `{ identifier }`, uppercase legacy roles | `POST /api/v1/auth/login`, `{ login, password }`, CSRF bootstrap, session cookie, safe role routing |
| Admin shell | Legacy `/api/auth/me` and logout, `ADMIN`/`TENANT` roles | V1 `/auth/me`, `/auth/logout`, `admin`/`resident`, shared auth state and Admin-only guard |
| `/admin/properties` | Generic legacy `DataManagement`, mock/legacy fields and `/api/properties` | V1 paginated list, server filters, create, allowlisted PATCH, archive and conflict handling |
| `/admin/properties/[propertyId]/rooms` | Legacy property/room shapes and `/api/...` endpoints | V1 scoped Property detail and paginated Room list, create, changed-fields-only PATCH, deactivate and conflict handling |
| `/tenant` | Existing legacy resident portal and old API routes | Login routes residents here; resident portal data/functionality is intentionally not migrated in Pass 1 |
| Other Admin screens | Generic legacy endpoints and fields | Left unchanged and outside this pass |
| `/` | Public listing calls legacy `/api/public/rooms` and `/api/public/viewing-requests` | Unchanged; this is the existing public marketplace flow, not one of the Admin Property/Room screens migrated here |

## 3. API client and configuration

Added `frontend/src/lib/api/`:

- `apiClient.ts`: centralized base URL, `credentials: "include"`, JSON handling, CSRF header, and 401 notification.
- `authApi.ts`: exact V1 login, `/auth/me`, and logout shapes; roles are only `admin` and `resident`.
- `propertyApi.ts`: Property V1 paths, snake_case request fields, and page metadata.
- `roomApi.ts`: nested Property Room paths, snake_case fields, server-derived status, and string IDs/money.
- `errors.ts`: shared `{ error: { code, message, details, request_id } }` parser and user-facing handling.
- `apiClient.test.ts`: client request and error contract tests.

`frontend/.env.example` sets `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`. The client has no hardcoded production URL. BigInt IDs remain strings and VND amounts remain decimal strings; no unsafe `Number()` conversion is used for IDs or money.

## 4. Auth, cookies, CSRF, and role guards

- `AuthProvider` loads current account context from `GET /auth/me` and distinguishes `loading`, `authenticated`, and `unauthenticated`. Account/profile data is held in memory only.
- Login first calls `GET /auth/csrf`, then sends the exact `X-CSRF-Token` plus `{ login, password }` to `/auth/login`. The backend sets the `HttpOnly` opaque `gt_session` cookie; the frontend never reads or stores the session token.
- Every unsafe V1 request refreshes the backend CSRF token and includes `X-CSRF-Token`; no alternate CSRF scheme was introduced.
- Logout calls the V1 endpoint and only clears local auth state after the API succeeds. A failed logout remains visible so the UI does not claim the server session was revoked.
- A 401 clears in-memory auth state. Admin-shell routes redirect unauthenticated users to `/login?next=...`; a `resident` is redirected to `/tenant` and cannot use the Admin Property/Room UI. Backend role and owner scope remain the security authority.
- Invalid and locked accounts receive the backend's generic unauthenticated message, as required by its privacy behavior. 400, 403, 429, network, and server errors have separate handling.
- Backend CORS already allows only the exact `FRONTEND_ORIGIN` with credentials. Local default is `http://localhost:3000`; cookie is `SameSite=Lax`, session cookie `HttpOnly`, and `Secure` only in production. No backend CORS or cookie change was needed. Separate `localhost` ports remain same-site for local development.

## 5. Property and Room flows

- Property list/detail use owner-scoped V1 routes. Foreign/missing resources surface the backend's indistinguishable 404. List uses server pagination, filters, stable server ordering, and empty/loading/error states.
- Create sends only `property_code`, `name`, `province`, `address`, and optional `manager_name`; it omits owner ID, status, IDs, and timestamps. Update sends only fields changed by the user and uses the documented allowlist. Archive uses `DELETE` and preserves the server's archive semantics. 409 is surfaced without optimistic removal.
- Room list uses `GET /properties/{property_id}/rooms`; Property detail uses `GET /properties/{property_id}`. Both IDs remain strings.
- Create sends the documented room code, string VND amount, fixed-decimal area, default capacity, active/public flags, and optional public description. It does not send owner/property IDs, room ID, or a derived occupancy status.
- Edit PATCH includes changed fields only. Room status and occupancy/contract summary are rendered from server response; `occupied` is never sent. Default capacity is presented as a future/default value and the UI does not mutate Contract capacity.
- Deactivate uses `DELETE /rooms/{room_id}`. A 409 keeps the room row visible and displays the server's conflict message. Mutation controls are disabled while saving.

## 6. Runtime mock and legacy paths

- The Admin Property and Room runtime screens no longer use `DataManagement`, demo rows, or legacy Property/Room payload names.
- Legacy login credential hints were removed. No source or legacy files were deleted.
- Other modules remain on their prior legacy path. The public home marketplace still calls its prior public listing/contact routes; the V1 backend currently exposes Admin Property/Room endpoints in the implementation being consumed in this pass. This pass did not add public marketplace endpoints or integrate Resident functionality.

## 7. Validation results

- Frontend API client tests: **4/4 PASS**.
- Backend Auth tests: **20/20 PASS**.
- Backend Property/Room contract tests: **33/33 PASS**.
- Frontend TypeScript typecheck: **PASS**.
- Frontend production build: **PASS** (Next.js 16.4.0). The initial sandbox build attempt was blocked by Windows SWC path canonicalization; the authorized retry completed successfully.
- Lint: no frontend lint script is configured.
- Backend TypeScript typecheck: **FAIL on existing legacy code** in `backend/src/app.ts`, including removed Prisma legacy models (`userAccount`, `tenant`, `leaseContract`, `amenityBooking`, etc.) and old fields such as `billingYear`/`billingMonth`. No backend file was changed in this pass; the failures are unrelated to the frontend integration.
- `git diff --check`: no whitespace errors. Existing unrelated working-tree changes in backend, Prisma, `.gitignore`, and migration/report files were left untouched.

## 8. Local manual smoke flow

Use a local PostgreSQL 18 database that already has the V1.3 schema and required account data. Do not run migrations or seed as part of this smoke flow.

1. In `D:\codexapp\SmartRentalManagement`, start PostgreSQL using the existing local setup (`npm run db:up` if Docker Compose is the configured runtime).
2. Confirm `backend/.env` has the database connection and `FRONTEND_ORIGIN=http://localhost:3000`; do not copy real secret values into source control.
3. In one terminal run `npm run dev --workspace=@goctro/backend` (backend default port 4000).
4. In another terminal copy `frontend/.env.example` to `frontend/.env.local` if needed, retain `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`, then run `npm run dev --workspace=@goctro/frontend` (frontend default port 3000).
5. Open `http://localhost:3000/login` and sign in using a provisioned V1 Admin account's email/phone and password.
6. Confirm `/admin/properties` loads server data; reload and navigate away/back to confirm cookie session restoration.
7. Create a Property, edit a field, refresh, and confirm persistence. Attempt archive and verify success or useful 409 while active operations exist.
8. Open its room list; create a Room, edit capacity/rent/public fields, refresh, and verify persisted values and server-derived status.
9. Attempt to deactivate a protected Room and confirm 409 leaves it visible. Deactivate an eligible Room and confirm it changes to inactive.
10. Log out; confirm protected Property/Room routes return to login.
11. Sign in as a provisioned Resident and directly open `/admin/properties` and `/admin/properties/{id}/rooms`; confirm the browser routes away from Admin UI to `/tenant`. Resident portal API functionality is deferred and still uses legacy endpoints.

Manual browser/database smoke was not run in this pass because no database/account runtime was started or supplied.

## 9. Files changed in this pass

- `frontend/.env.example`
- `frontend/package.json`
- `frontend/src/app/layout.tsx`
- `frontend/src/app/components/auth-provider.tsx`
- `frontend/src/app/components/admin-shell.tsx`
- `frontend/src/app/login/login-form.tsx`
- `frontend/src/app/admin/properties/page.tsx`
- `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/api/apiClient.ts`
- `frontend/src/lib/api/apiClient.test.ts`
- `frontend/src/lib/api/authApi.ts`
- `frontend/src/lib/api/errors.ts`
- `frontend/src/lib/api/propertyApi.ts`
- `frontend/src/lib/api/roomApi.ts`
- `docs/06_frontend/integrations/FRONTEND_INTEGRATION_PASS_1_AUTH_PROPERTY_ROOM_REPORT.md` (this report)

## 10. Status and next pass

| Area | Status |
|---|---|
| Admin Auth / session / logout / 401 | Integrated |
| Admin Property list/detail/create/edit/archive | Integrated |
| Admin Room list/create/edit/deactivate/conflict | Integrated |
| Resident portal and resident features | Deferred; only role-based routing/guard applied |
| Occupancy, Contract, Invoice/Zalo, Payment | Not integrated |
| Public room marketplace V1 API | Not integrated; existing legacy route remains |

Recommended next step: run the documented local manual smoke flow against a provisioned V1.3 database and accounts, then schedule a separate Resident/public marketplace integration pass. No Pass 2 work was started.

## 11. Room screen bulk-create follow-up (2026-10-09)

Updated the Admin Room screen only; backend API, database, Prisma, and Room business rules were not changed.

- Added a `← Quay trở về` link to `/admin/properties` above the Room heading. It uses the explicit destination rather than browser history.
- Preserved the existing single-room create form and payload. The Add Room modal now has `Thêm 1 phòng` (default) and `Thêm nhiều phòng` tabs; editing an existing Room continues to use the original edit flow.
- Bulk creation accepts a trimmed base code, quantity, default rent, area, capacity, active/public flags, and public description. Codes are generated as `${baseRoomCode}-${sequence}` (for example `A01-1`, `A01-2`, `A01-3`); no number in the base code is incremented.
- Preview shows all codes for batches up to eight and the first/last four for larger batches. Generated codes are rejected client-side if any exceeds the API's 40-character limit.
- Client validation matches the existing Room create API for money, area, capacity, and description; quantity must be an integer from 1 through 100. Invalid input disables the bulk submit button and displays the validation reason.
- Requests are sent sequentially through the existing `roomApi.create` call, with the existing create payload only. While requests run, fields and tabs are disabled and progress is announced as `Đang tạo n / total phòng...`.
- Each failure is associated with its generated Room code. Duplicate-code 409 responses are shown as `Mã phòng đã tồn tại.`; other API errors keep their server message. Remaining requests continue, successful rows are retained, and the Room list refreshes after the batch. No frontend rollback is attempted.
- Partial results remain in the modal until closed. Full success reports the created count and refreshes the list.

### Follow-up verification

- Back link navigated to `/admin/properties`.
- Single create succeeded for `A02-1`.
- Bulk base `A01`, quantity 3 created exactly `A01-1`, `A01-2`, `A01-3`; no `A02`/`A03` codes were generated by that batch.
- Bulk quantity 1 created `ONE-1`.
- Quantity 100 rendered a bounded preview with first and last codes; no 100-room batch was submitted.
- Quantity 0 and 101 were blocked with the validation message and disabled submit.
- A 39-character base with quantity 1 was blocked because the generated code would exceed the API's 40-character maximum.
- Partial failure with existing `A02-1` continued creating `A02-2` and `A02-3`, reported 2 successes and identified `A02-1` as duplicate.
- A duplicate-only request identified `A02-1 — Mã phòng đã tồn tại.`
- Reloaded Room page showed the persisted rooms from the API. Existing edit/deactivate controls were not changed.
- Follow-up layout adjustment removed the duplicate bold Room title and breadcrumb row; the back button remains, with the gap below it reduced to 6px.
- Frontend TypeScript typecheck: **PASS**. Frontend production build: **PASS**.
- Changed files: `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx`, `frontend/src/app/globals.css`, and this report.

Local smoke-created Room records are retained in the development database for review; no backend/API, database, or Prisma files were changed.
