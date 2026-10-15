# Billing Workspace Authenticated Browser Smoke + Failure Diagnosis

**Date:** 2026-10-14  
**Status:** Core browser flow PASS through itemized finalization; workspace post-finalize queue/filter and exact narrow viewport remain NOT VERIFIED. Billing remains PARTIAL.

## Scope and environment

- Used PostgreSQL 18.6 on local port 5432 and the disposable database `goctro_billing_ui_smoke_20261014`. Installed the locked V1.8 schema/seed and ran CORE and fixture validators: **78/78 PASS** and **171/171 PASS**.
- The backend was temporarily connected to that disposable database; the Admin signed in manually. No credentials were entered by the agent.
- No test Invoice, seed, migration, or schema change was applied to `Goctro_test3`.
- After browser/API work, the verified project dev process tree was stopped, the disposable database was dropped, and `npm run dev:all` restored the normal local stack. Final DB identity was `Goctro_test3` on port 5432; health, DB health, CSRF, and frontend all returned HTTP 200.

## Readiness and failure diagnosis

The browser workspace showed one draft requiring action for Owner 1, Property 11, Room A102, active Contract `DEMO-HD-002`, Invoice `INV-3002-20261024`, period 2026-10-24 through 2026-11-23. The period was anchored to the Contract and followed its already finalized prior period.

Before meter entry, server readiness was `MISSING_DATA` with exactly two blockers:

- `ELECTRICITY_ENDING_MISSING`
- `WATER_ENDING_MISSING`

No tariff, Fixed Service, Flexible Service, or Parking blocker was shown for this fixture. The visible “thiếu dữ liệu” state in this controlled rehearsal was explained by the two missing ending readings. It does not establish the cause for any other Invoice.

After entering 950 kWh and 44 m³ and saving, a full page reload retained both values, including usage of 50 kWh and 4 m³. The workspace then displayed `Sẵn sàng chốt`; the missing-data queue cleared for this draft.

## Browser finalization evidence

- The detail page displayed the invoice, Room A102, Contract, billing dates, and saved meter values. The confirmation dialog described server-side recalculation and the no-finalize-on-rejection behavior.
- Confirming the action returned the visible success status `Đã chốt hóa đơn. Trạng thái và số liệu được tải lại từ máy chủ.`
- The resulting server-loaded detail showed status `Chưa thanh toán`, a total of **3,585,000 ₫**, and itemized lines: rent 3,300,000; electricity 50,000; water 60,000; WiFi 50,000; management 100,000; waste 25,000. The six lines sum to the displayed total. Electricity showed a three-tier detail control.
- The browser interaction was interrupted by the computer-use controller immediately after the successful response when requesting the next page observation. Therefore a deliberate post-finalize reload, post-finalize workspace row/counter update, browser filter interactions, and an exact 320–390 px viewport check were not completed. No claim is made for those gates.

## Scoped bug previously fixed

The workspace Resident filter uses `resident_id`. The shared `rejectClientAuthority` middleware previously rejected it on `GET /api/v1/billing/workspace` before the Owner-scoped repository could apply the filter. The middleware now permits this read-only query parameter on that route only; Owner identity remains session-derived. An Auth regression assertion covers the allowed workspace filter and retained rejection on `/auth/me`. This change was already present during this pass; no source code was changed in this turn.

## Tests

- Backend Invoice suite: **157 PASS / 0 FAIL / 3 SKIP**. The skipped cases require a dedicated PostgreSQL integration test target.
- Backend Auth suite: **20/20 PASS** (previous scoped run, including the workspace filter regression).
- Frontend API/UI tests: **53/53 PASS** (previous scoped run).
- Frontend typecheck: **PASS** (previous scoped run).
- Production build was not run in this pass. Earlier Windows/SWC build access errors remain documented separately.

## Cleanup and restored environment

- Dropped only `goctro_billing_ui_smoke_20261014`. A guarded cleanup connection first verified `current_database() = Goctro_test3` and `inet_server_port() = 5432`; the target rehearsal database no longer exists.
- Restarted the local project with `npm run dev:all`. The launcher confirmed Backend, Database health, Frontend, and CSRF are ready.
- A separate read-only check confirmed the eight core V1.8 tables `accounts`, `owners`, `residents`, `properties`, `rooms`, `contracts`, `invoices`, and `contract_change_history` exist in Goctro_test3.
- `backend/.env`, Database V1.8 schema/seed, and Prisma schema were unchanged. This turn changed no frontend/backend source or database schema.
- Task scratch logs matching `.tmp-billing-ux-*` were identified. The persistent `.local/dev-all` launcher logs are owned by the restored running processes and were left in place.

## Final status

Disposable V1.8 rehearsal: schema/seed/validators PASS; browser login completed manually; initial missing-meter blockers, save/reload, READY state, successful itemized finalization, and server-loaded finalized detail PASS. Backend Invoice suite PASS with three PostgreSQL integration tests skipped. Cleanup and restoration to Goctro_test3 PASS, with no test Invoice or seed written there.

The workspace browser smoke is **PARTIAL** because post-finalize workspace state, browser filtering, and exact narrow-viewport behavior remain unverified after the computer-use controller stopped the browser observation. Remaining service-data source gaps, Zalo delivery, Payment, and Resident Invoice UX are separate scopes.
