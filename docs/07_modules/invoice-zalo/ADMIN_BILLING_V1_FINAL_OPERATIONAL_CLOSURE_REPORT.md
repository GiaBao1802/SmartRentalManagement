# Admin Billing V1 Final Operational Closure Report

**Date:** 2026-10-14  
**Status:** PARTIAL — authenticated browser invoice flow and narrow layout pass; direct browser-console inspection is unavailable in the connected browser interface, and production build remains blocked by the recorded Windows/SWC access error.

## 1. Scope and previous blocker

This pass closes the Admin Invoice detail contract, server response, itemized UI, and draft meter/finalize flow. The confirmed blocker was that the Admin detail query/DTO omitted `invoiceItems` and Electricity tier children, so the existing detail page could not show the finalized billing snapshot.

Payment, Resident Invoice portal, production Zalo delivery, Database V1.8 source, migrations, and Prisma were outside scope and were not implemented or changed.

## 2. API contract and backend

The canonical `GET /api/v1/invoices/{invoice_id}` Admin detail contract is documented in the adjacent canonical `GocTro-SmartBuilding/docs/04_API_SPEC.md` (§5.7). Admin ITEMIZED detail returns `itemization_available` and ordered `invoice_items`; the Electricity item also returns ordered tier snapshots. The response exposes only the UI fields and omits internal source references. Existing authenticated Owner scoping and Resident detail behavior are preserved.

The Admin repository uses one detail include for Invoice Items and their tier children. The serializer projects the DTO instead of returning Prisma records. `LEGACY_AGGREGATE` and `NOT_FINALIZED` details return an empty item list and `itemization_available=false`; no old or draft lines are fabricated.

## 3. Frontend behavior

The shared API client now types item categories, line snapshots, and Electricity tiers. Finalized ITEMIZED detail renders Rent, Electricity, Water, Fixed Service, Flexible Service, Parking, and the server-provided total. Tier rows show their recorded bounds, quantity, rate, and amount; the browser does not recalculate authoritative money. Legacy invoices show the aggregate-only message.

Draft meter readings remain editable only while `status=draft` and `snapshot_kind=NOT_FINALIZED`. Opening readings remain read-only. Save reloads server state; finalize confirms, sends the supported meter payload and idempotency key, then reloads the detail. Finalized controls are read-only. No frontend business rule or Payment action was added.

## 4. Automated validation

- Backend `npm run test:invoices --workspace=@goctro/backend`: **143 passed, 0 failed, 1 skipped**. The skipped case is the existing PostgreSQL integration test gated by `GOCTRO_V18_REHEARSAL_DATABASE_URL`; route, Owner-scope, legacy/draft, itemized/tier, and auth tests passed.
- Frontend `npm run test:api --workspace=@goctro/frontend`: **37/37 passed**, including the itemized/tier, legacy, draft and meter-validation tests.
- Frontend typecheck: **PASS** (`tsc --noEmit`).
- `git diff --check`: **PASS** (only Git line-ending warnings were emitted).
- Frontend production build: **FAIL / environment limitation**. Next.js Turbopack/SWC failed while canonicalizing `jsc.baseUrl` at `D:\codexapp\SmartRentalManagement\frontend` with Windows `Access is denied (os error 5)`. Dev-mode verification remains available.

## 5. Local stack and isolated test data

The existing frontend remained on port 3000. The previously verified project backend listener was stopped and restarted on port 4000 with a process-local `DATABASE_URL` override; `backend/.env` was not changed. `/api/health`, `/api/health/db`, and `/api/v1/auth/csrf` returned HTTP 200. PostgreSQL activity metadata confirmed the backend connected to `goctro_billing_closure_20261014` on local PostgreSQL 18, not `Goctro_test3`.

A disposable database was created from the locked V1.8 schema and synthetic seed. It contains 40 public tables, the synthetic active Admin account, seeded finalized ITEMIZED invoice `5010`, and a clearly marked draft invoice `5011` for Contract `3001` in period `2026-12-15`–`2027-01-14`. A synthetic Flexible Service charge was added for that period so a successful finalize can exercise all six item categories. Only the disposable rehearsal database was modified. No SQL, migration, seed, or write was run against `Goctro_test3`; the canonical Database V1.8 files, Prisma, backend `.env`, and migrations were not modified.

The disposable Admin credential was provisioned with the backend's current Auth V1 scrypt format. The user's login attempt initially failed because no process was listening on port 4000; the request could not reach password verification. The project backend was restarted on port 4000 with the rehearsal-only connection override. After restart, HTTP checks passed: CSRF `200`, login `200`, `gt_session` issued, and `/auth/me` `200` with `role=admin` and valid Owner context. No credential, cookie, or hash was printed. The browser remains at `/login?next=%2Fadmin%2Finvoices` until the user completes browser login; manual form submission is not automated.

## 6. Authenticated browser smoke and remaining gates

The authenticated browser smoke used the seeded draft invoice `5011` in the disposable rehearsal database:

- Admin Invoice list rendered four rows, including the intended draft; opening its detail route rendered the correct room, contract, period, initial meter readings, and draft state.
- Saved electricity `1510` and water `85`; the success message appeared and both values remained after a full reload.
- Finalization succeeded. The page reloaded server state as `unpaid`, `Có chi tiết khoản thu`, with total `3.906.000 ₫`.
- All six groups rendered from persisted items: rent, electricity, water, fixed services, flexible service, and parking. Electricity showed three persisted tiers (50 kWh × 1.100 ₫, 10 kWh × 1.600 ₫, 0 kWh × 2.100 ₫). Reload retained all groups and amounts. The finalized detail exposes no meter edit or finalize buttons.
- Narrow viewport screenshot (about 304 px wide) showed the detail and all groups without horizontal clipping. Initial screenshots exposed wrapped currency digits; a CSS-only adjustment keeps line and total amounts on one line. The refreshed screenshot showed full amounts clearly.
- Direct browser-console log inspection is unavailable through the connected CUA tab API, so console is **NOT VERIFIED**. No visible error overlay occurred during the flow.

The required save/reload/finalize/reload/breakdown/read-only browser flow and narrow layout check are **PASS**. Direct console log inspection remains **NOT VERIFIED** because the connected CUA browser interface exposes page state/screenshots but no console-log API. The production build remains blocked by the recorded Windows/SWC access error. Billing Admin remains **PARTIAL**, not fully closed.

## 7. Database impact and next step

Database V1.8 source remains the current locked physical baseline. The populated `Goctro_test3` target was not written. After browser evidence was captured, the disposable rehearsal database `goctro_billing_closure_20261014` was dropped, and backend restarted using the unmodified `backend/.env`. Final checks: frontend `http://localhost:3000` = 200, backend health and DB health = 200, database `Goctro_test3` on port 5432. No migration or seed ran against `Goctro_test3`.

**Next action:** capture the browser console through a supported host-browser console tool if available; otherwise retain the explicit limitation and close only after the project owner accepts that evidence gap. The production build limitation also remains recorded. Payment has not been started.
