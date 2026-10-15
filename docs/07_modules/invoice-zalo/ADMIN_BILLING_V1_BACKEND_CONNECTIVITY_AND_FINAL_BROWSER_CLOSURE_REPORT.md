# Admin Billing V1 Backend Connectivity and Final Browser Closure Report

**Date:** 2026-10-14 · **Status:** OPERATIONALLY CLOSED WITH TOOLING LIMITATIONS
**Environment:** Local development; PostgreSQL 18.6; disposable Database V1.8 rehearsal

## 1. Original connectivity problem

The login page rendered at `http://localhost:3000`, but its Auth request displayed “Không thể kết nối máy chủ”. The project backend on port 4000 accepted a TCP connection but did not return an HTTP response, so the failure was in the local backend process/HTTP layer rather than the login form or the database.

## 2. Root cause

The port was held by a stale SmartRentalManagement backend process. The project startup script identified the stale process in the project process tree and restarted that tree only. Startup then reported PostgreSQL, backend, database health, frontend, and CSRF ready. Earlier sandbox-only PostgreSQL probes were not evidence of the host database being down; host `pg_isready` accepted connections.

## 3. Backend fix

Restarted with the repository-supported `npm run dev:all`. No source or local `.env` change was needed. The frontend process on port 3000 was reused. For Billing rehearsal only, the backend was separately launched with a process-local `DATABASE_URL` override; `backend/.env` remained unchanged. After smoke, `npm run dev:all` restored the normal backend.

## 4. Health checks

After normal restoration, these returned HTTP 200:

- `GET http://localhost:4000/api/health`
- `GET http://localhost:4000/api/health/db`
- `GET http://localhost:4000/api/v1/auth/csrf`

The final port 4000 listener was verified as the project Node/tsx backend. PostgreSQL 18.6 was accepting connections on port 5432.

## 5. Frontend API connectivity

The frontend API client uses `http://localhost:4000/api/v1`; no conflicting local `NEXT_PUBLIC_*` override was present. Browser login/Auth requests reached the backend and completed, rather than failing at network connection or CORS.

## 6. Auth/login result

Auth CSRF bootstrap and login returned success with a session cookie. `GET /api/v1/auth/me` returned an Admin profile and Owner context. The rehearsal browser reached `/admin/invoices` and showed the authenticated Admin shell before Billing interactions. Credentials and cookie values were not recorded.

## 7. Rehearsal database identity

Created a disposable PostgreSQL 18.6 cluster on `127.0.0.1:55438` with database `goctro_billing_ux_20261014`. Installed the locked V1.8 schema and seed, ran the V1.8 runtime validator and fixture validator, and created only synthetic Admin, draft Invoice `5011`, and related billing fixtures in that disposable environment.

## 8. Business-filter browser smoke

**PASS.** Property search for `Binh An` found “Nhà mẫu Bình An” despite missing Vietnamese diacritics. Selecting it enabled its Room lookup; `A101` appeared and was selectable. Resident search for `cu dan mau An` found “Cư dân mẫu An”. Applying the Property + Room + Resident filters returned the three matching A101/An invoices. Clearing the Property cleared and disabled Room; Reset restored all four invoices. The rehearsal data had one selectable Property, so a switch between two different Properties was not available to test.

## 9. Draft save and reload

**PASS.** Invoice `5011` opened in “Đang chuẩn bị” with opening readings 1450 kWh and 81 m³ and readiness guidance that deferred price checks to the server. Entered 1510 kWh and 85 m³, saved, and received the success message. A full page reload preserved both readings and displayed usages of 60 kWh and 4 m³.

## 10. Finalize result

**PASS.** The confirmation dialog showed Invoice, Room, period, and the submitted ending readings. Confirming called the existing finalization flow. The UI reported success and reloaded authoritative server data. The resulting status was “Chưa thanh toán”.

## 11. Itemized breakdown

**PASS.** The server-rendered breakdown contained all six groups:

- Rent: 3,500,000 ₫, full period, no proration.
- Electricity: 71,000 ₫ for 60 kWh.
- Water: 60,000 ₫ for 4 m³.
- Fixed Services: WiFi 50,000 ₫, management 100,000 ₫, waste 25,000 ₫.
- Flexible Service: Spa 20,000 ₫.
- Parking: paid slot 80,000 ₫.

The displayed total was **3,906,000 ₫**.

## 12. Electricity tier display

**PASS.** Expanding the persisted tier snapshot showed 50 kWh × 1,100 ₫ = 55,000 ₫; 10 kWh × 1,600 ₫ = 16,000 ₫; and 0 kWh × 2,100 ₫ = 0 ₫. The three rows summed to the displayed 71,000 ₫ Electricity amount.

## 13. Finalized reload persistence

**PASS.** A second full reload retained the unpaid state, 3,906,000 ₫ total, meter values, and all item snapshots. The detail page exposed no meter input, “Lưu bản nháp”, or “Chốt hóa đơn” controls after finalization.

## 14. Responsive result

**PASS at approximately 304 px viewport width.** The invoice summary, meter section, item groups, tier disclosure, and total remained readable with vertical scrolling. Amounts stayed on one line and no horizontal clipping was visible in the inspected areas.

## 15. Console/tool limitation

The connected CUA browser interface did not expose a direct console API, so browser console logs are **NOT VERIFIED**. There was no visible runtime-error overlay or failed UI state during the completed network/business flow. This tooling limitation is not treated as a functional blocker for this local operational closure.

## 16. Rehearsal cleanup

Stopped the rehearsal backend process tree, removed the temporary PostgreSQL cluster directory and synthetic fixture/log files, and verified no listener remained on port 55438. The database disappeared with its disposable cluster. No rehearsal database was left available to the application.

## 17. Final Goctro_test3 backend restore

Restarted with `npm run dev:all` and left the local development servers running. Read-only database identity returned `Goctro_test3 | 5432`. Required tables `accounts`, `owners`, `residents`, `properties`, `rooms`, `contracts`, `invoices`, and `contract_change_history` were present. The rehearsal invoice number returned count `0` in Goctro_test3.

## 18. Tests

- Frontend typecheck: **PASS** (`npm run typecheck --workspace=@goctro/frontend`).
- Frontend API/UI suite: **46/46 PASS** (`npm run test:api --workspace=@goctro/frontend`).
- Backend Auth + Invoice + Zalo unit suite: **163/163 PASS**. The standalone PostgreSQL integration test file was excluded from this unit command; real PostgreSQL finalization was exercised in the disposable browser rehearsal and the preceding V1.8 route closure.
- Production build was not rerun in this pass. The prior documented Windows/SWC `Access is denied (os error 5)` while resolving frontend `jsc.baseUrl` remains a toolchain limitation.

## 19. Database impact

Database/Prisma V1.8 sources were not changed. No migration, schema install, seed, or Billing fixture write was run against Goctro_test3. The final read-only query confirmed that the rehearsal invoice number is absent there. Synthetic billing mutations were confined to the disposable rehearsal database and removed with its cluster.

## 20. Billing Admin completion status

**OPERATIONALLY CLOSED WITH TOOLING LIMITATIONS** for the scoped Admin V1 list/filter/detail/draft-meter/finalize/itemized workflow in local development. The functional gates passed and normal backend health was restored. This is not a production deployment or production-build claim. Direct console capture is unavailable, production build has the previously recorded Windows/SWC limitation, backend typecheck retains 174 known legacy diagnostics, and Zalo delivery/durable command replay remain separate debt.

## 21. Exact next module

**Resident / Occupancy — scope and gap review only.** This task did not start Resident portal implementation, Payment, or Zalo. Start any later module only in its own explicitly scoped task.
