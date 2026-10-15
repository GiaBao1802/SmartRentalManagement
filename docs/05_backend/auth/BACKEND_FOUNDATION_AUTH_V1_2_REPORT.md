# Backend Foundation + Auth V1.2 Report

## 1. Files changed

- Updated `backend/src/app.ts` and `backend/src/server.ts` to mount the versioned API foundation, shared middleware, and validated runtime configuration. The legacy unversioned demo routes remain separate pending their later domain migrations; V1.2 clients use `/api/v1`.
- Updated `backend/src/lib/prisma.ts` with a development/test reload-safe Prisma singleton.
- Added `backend/src/config/env.ts`, `backend/src/auth/**`, `backend/src/middleware/**`, `backend/src/types/express.d.ts`, and `backend/src/utils/ids.ts`.
- Added `backend/src/auth/auth.test.ts` and the `test:auth` script in `backend/package.json`.
- Updated `backend/.env.example` with session and login-rate-limit settings and removed demo passwords from the example. The actual `.env` was not read or changed.
- Added this report.
- No dependencies were added. Database, Prisma schema, migrations, frontend, and business documents were not changed.

## 2. Previous auth architecture

The legacy monolithic `app.ts` used `UserAccount`, legacy role claims and a signed JSON cookie named `goctro_session`. Legacy routes remain outside `/api/v1` for the later domain migration; they are not used as the V1.2 authentication authority. Their old fallback secret was removed; the retained demo code now reads the configured session secret.

## 3–4. Backend structure and Prisma Client

V1.2 auth is separated into account repository, routes, password verification, session store, typed request context, CSRF/auth/error middleware, environment configuration, and ID utilities. Backend requests use one shared Prisma Client instance; reloads in development/test reuse it.

## 5–7. Account, AuthContext, and Owner isolation

- Auth queries use Prisma `Account` and role values `admin`/`resident` only.
- Every authenticated request loads the current Account from the database and rejects missing or locked accounts; it never trusts role or identity from the client.
- Admin context resolves `Account.ownerId` and confirms the linked Owner.
- Resident context resolves `Account.residentId` and obtains `ownerId` from the linked Resident row. No Resident Owner ID comes from request input.
- `req.auth` is a typed Admin/Resident union. `requireAdmin`, `requireResident`, `requireAuthenticated`, `getAdminOwnerId`, and `getResidentContext` are available for subsequent domains.
- `foreignResourceNotFound()` supplies the common `404 NOT_FOUND` behavior for later scoped resource lookups.
- Account password hashes are selected only during login and are not attached to request context or returned.

## 8–10. Session implementation

- Cookie: `gt_session`; opaque random token; `HttpOnly`, `SameSite=Lax`, `Path=/api/v1`, and `Secure` in production.
- Only an HMAC hash of the token is stored. The token and session secret are never placed in JSON or logs.
- Store interface supports create/read/touch/revoke/revoke-account. The in-memory adapter is limited to development and tests; production startup intentionally fails until a durable server-side store is configured.
- Defaults are 30 minutes idle and 12 hours absolute, configurable by `SESSION_IDLE_MINUTES` and `SESSION_ABSOLUTE_HOURS`.
- Every authenticated request checks account status again. A newly locked account has its sessions revoked and receives `401`.

## 11–14. Password and auth endpoints

- Password verification reuses the existing seed-compatible `scrypt$salt$hex` format, uses timing-safe comparison, and performs a dummy scrypt check for missing/ambiguous accounts.
- `POST /api/v1/auth/login` accepts `login` plus `password`, supports case-insensitive email and exact phone lookup, rejects ambiguous phone matches generically, requires active status, limits attempts per client IP, and returns a safe Account/profile response.
- `GET /api/v1/auth/me` returns safe current Account and derived Owner/Resident profile references.
- `POST /api/v1/auth/logout` revokes the current session and clears the cookie idempotently.
- `GET /api/v1/auth/csrf` issues a signed double-submit CSRF token cookie and response token.
- Login and logout are unsafe cookie-authenticated methods and require the CSRF token and exact configured Origin.

## 15–18. Roles, tenant scope, and IDs

- Admin-only and Resident-only guards return `403` only after authentication and role resolution.
- `/api/v1` rejects client-supplied `owner_id`, `resident_id`, or `role` authority fields/headers. Future domain queries must use `req.auth.ownerId`; scoped misses use `404`.
- PostgreSQL BigInt route IDs are validated as positive decimal values within signed 64-bit range. JSON serialization converts BigInt IDs to decimal strings.

## 19–23. Errors, CSRF, cookies, CORS, and environment

- Common error envelope contains `code`, `message`, `details`, and server-generated `request_id`; request ID is also returned in `X-Request-Id`.
- Prisma unique/FK/not-found codes map to safe `409`/`404` errors. Unknown errors return generic `500`; production responses do not expose SQL, Prisma messages, or stack traces.
- CSRF uses a signed, time-limited double-submit token, requires matching cookie/header, and requires `Origin` to match `FRONTEND_ORIGIN` for unsafe methods.
- CORS allows only the configured exact frontend origin with credentials; wildcard origin is rejected.
- Central env validation covers PostgreSQL URL, exact frontend origin, port, session secret and TTL/rate-limit values. Production requires a non-placeholder session secret and explicit frontend origin.

## 24. Tests and results

Added 20 mock-based tests covering Admin/Resident login, generic/ambiguous/locked/oversized-password failures, `auth/me`, Resident Owner derivation, lock-after-login, role guards, logout/revocation, CSRF absent/valid/wrong-origin, client Owner spoof rejection, BigInt serialization/range validation, request ID envelope, and session TTL defaults.

- Auth tests: **20/20 PASS**. They use an ephemeral loopback server and mock repository/session data; no database connection is made.
- No production or user database was contacted or modified.

## 25. Backend typecheck/build before and after

| Check | Before | After |
|---|---:|---:|
| TypeScript diagnostics | 209 | 209 |
| Backend build | Failed on legacy backend diagnostics | Failed on 209 legacy diagnostics |
| Diagnostics outside monolithic legacy `src/app.ts` | — | 0 |

The new foundation/auth modules introduce no TypeScript diagnostics. No legacy diagnostics were removed in this turn because the remaining failures all originate in the monolithic unversioned demo `app.ts`; rewriting its out-of-scope domains or hiding the file from TypeScript would not be a valid foundation fix.

## 26. Remaining legacy errors grouped by domain

All 209 diagnostics are in `backend/src/app.ts`; the main groups remain:

- Legacy delegates/models: `userAccount`, `tenant`, `leaseContract`, `payment`, `amenityBooking`, `roomViewingRequest`, and `maintenanceRequest`.
- Legacy fields and relations: `id`, `tenantId`, `billingYear`, `billingMonth`, old Room/Property fields, and old relation names.
- Legacy account/role/payment assumptions: `LANDLORD`, `TENANT`, and previous account/payment shapes.
- The old unversioned route set is still present until its corresponding API V1.2 domains are migrated. There are no compatibility Prisma models or aliases.

## 27–28. Security considerations and infrastructure blockers

- The in-memory session store and in-memory login limiter are development/test-only and are not production-safe or multi-instance safe. There is no Redis/durable session-store dependency configured. Production startup fails closed until a durable adapter and distributed rate limiting are supplied.
- The current server retains unversioned demo routes while V1.2 auth lives at `/api/v1/auth`; frontend migration is out of scope. Production use should wait until legacy routes are retired/migrated and durable session infrastructure is configured.
- Password reset/change, enrollment delivery, session-store deployment, and provider-backed rate limiting remain future work per API scope.

## 29. Next step

Implement Property + Room API V1.2 using the shared pattern: authenticate Admin → take `req.auth.ownerId` → scope Prisma query → return indistinguishable `404` for a missing or foreign resource.
