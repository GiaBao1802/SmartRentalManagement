# Authenticated Admin Browser Smoke Setup Report

Date: 2026-10-13  
Status: **SETUP PASS — existing DEV Admin authenticated in local browser**

## 1. Scope

Prepared an authenticated local Admin browser session for Admin Invoice verification. No application code, schema, migration, seed, or database rows were changed.

## 2. Auth flow

- Frontend route: `/login?next=/admin/invoices`.
- Auth API flow: `GET /api/v1/auth/csrf` → `POST /api/v1/auth/login` → `GET /api/v1/auth/me`.
- Login uses the existing password verifier and requires an active account with a valid role-specific profile. Successful login issues an HttpOnly `gt_session` cookie scoped to `/api/v1`; refresh validates the server-side session through `/auth/me`.
- No middleware, CSRF, password verification, or session controls were bypassed.

## 3. Existing DEV Admin

Read-only inspection of `Goctro_test3` / PostgreSQL 5432 found the existing account:

- Account ID: `1`
- Email: `admin.one@example.test`
- Phone: `+84000000001`
- Role/status: `admin` / `active`
- Owner ID: `1`; valid Owner relation.

The local DEV credential was verified against this account with the backend's existing scrypt verifier. The credential and password hash are intentionally omitted.

## 4. Account and database changes

- New test account: **NO**.
- Existing account or Owner rows changed: **NO**.
- Seed, migration, schema, or database writes: **NO**.

## 5. Browser login and session

**PASS.** The user completed the local login flow. The browser reached `http://localhost:3000/admin/invoices`, displayed the Admin shell and `Đăng xuất`, and remained authenticated after a page reload. The session cookie itself is HttpOnly and was not exposed/read by the agent.

## 6. Admin Invoice page

**PASS — initial read-only list visible.** The page rendered 2 invoices from the server, including `DEMO-INV-003` and `DEMO-INV-001`, with the expected invoice table fields, filter controls, and pagination showing page 1 of 1. No records were created or modified.

## 7. Console and remaining verification

- Browser console errors/warnings: none returned by the browser inspection.
- Full network capture, filter submission, pagination beyond the available single page, narrow viewport, and detailed `/auth/me` response inspection: **not performed** in this setup task.
- Backend health was previously confirmed HTTP 200 at `/api/health` and `/api/health/db`; no service restart was needed for this authenticated browser step.

## 8. Cleanup

No account was created, so no test-account cleanup is needed. Keep the existing DEV account for future local smoke tests; do not delete it because it is linked to Owner and local business data.

## 9. Result and next task

**Authenticated Admin browser setup: PASS.** Continue the bounded Admin Invoice browser verification for live request/filter behavior and responsive layout. Do not create test records or change database state.
