# Service Pass 2 — Utility Tariff + Meter Source Closure

**Status: PARTIAL**  
**Date:** 2026-10-14  
**Scope:** PostgreSQL/API and authenticated Admin browser closure for Electricity/Water tariffs and Contract meter sources. No Pass 3 work was started.

## Browser smoke

The user authenticated in the Codex browser against the disposable rehearsal backend. The following checks were visibly verified:

- `/admin/services/utilities` rendered for the Admin session.
- Selecting `Pass 2 Browser Smoke · Đồng Nai` loaded the rehearsal Property's rates.
- Electricity showed one active tariff version with three progressive tiers: 1,100 / 1,600 / 2,100 VND per kWh.
- Water showed the active flat rate of 15,000 VND per m³.
- The meter-source list showed Contract `PASS2-BROWSER-HD`, Room `P2-BROWSER-01`, and both meter sources present.
- Opening the Contract link displayed initial readings of 1,000 kWh and 50 m³.
- `/admin/billing` showed the finalized rehearsal period for that Contract and the amount of 2,131,000 VND.
- Invoice `INV-4004-20260915` displayed the period, 1,000→1,060 kWh and 50→54 m³ readings, rent 2,000,000 VND, electricity 71,000 VND and water 60,000 VND. Expanding the electricity detail showed the three tier calculations (55,000 + 16,000 + 0 VND).

No application error was observed in these browser checks. The earlier interrupted browser attempt was resumed after the user confirmed that the Admin session had opened.

## Responsive verification

**TOOLING LIMITATION.** The available Codex browser controller exposed page navigation, accessibility inspection and interactions, but no viewport override/resizing capability. The requested 320–390px viewport could not be set reliably, so mobile layout is not marked PASS.

## API and PostgreSQL evidence

The authenticated API/PostgreSQL pass completed on a disposable PostgreSQL 18 V1.8 database:

- Schema and seed installed; CORE validator **78/78 PASS**, fixture validator **171/171 PASS**.
- Electricity progressive tariff and Water flat tariff were created with effective dates; Contract initial readings and Invoice ending readings were saved.
- Invoice readiness reached `READY_TO_FINALIZE`; finalization succeeded.
- First period total was **2,131,000 VND**: rent 2,000,000, electricity 71,000, water 60,000.
- The next period used the later tariff versions and totaled **2,317,000 VND**: electricity 189,000, water 128,000, rent 2,000,000.
- Persisted item, tier and meter snapshots retained the earlier Invoice totals after the new tariffs were added.
- Foreign Owner tariff read/write attempts returned 404.

## Automated checks from the completed Pass 2 run

- Utility Service: **9/9 PASS**.
- Contract: **134/134 PASS**.
- Invoice: **157 PASS / 0 FAIL / 3 SKIP** (160 total).
- Auth: **20/20 PASS**.
- Frontend API/UI: **55/55 PASS**.
- Frontend typecheck: **PASS**.
- Backend-wide typecheck retains **174 pre-existing legacy diagnostics**. Production build remains subject to the previously recorded Windows/SWC `Access denied (os error 5)` limitation; this was not rerun for this browser-only continuation.

## Cleanup and restored local environment

- Stopped only the verified SmartRentalManagement backend process tree that served the rehearsal database.
- Confirmed PostgreSQL identity `postgres|5432` before dropping the exact disposable database `goctro_pass2_browser_20261014`.
- Dropped that database; a follow-up catalog query returned zero matching databases. It had zero other client sessions at cleanup.
- Removed the task-specific `.local/service-pass2-browser` temporary directory.
- Started the normal stack with `scripts/dev-all.ps1`; it reused the existing frontend and started the backend from the unchanged `backend/.env`.
- Final checks: `/api/health` **200**, `/api/health/db` **200**, `/api/v1/auth/csrf` **200**, frontend `/` **200**. The `.env` target is `localhost:5432/Goctro_test3`; PostgreSQL showed 9 client sessions on Goctro_test3 and 0 on the removed rehearsal DB. Goctro_test3 still has 40 public tables.
- No migration or seed was run against Goctro_test3. No test records were written there.

## Closure decision

Core API, PostgreSQL and authenticated Admin browser smoke pass. Exact narrow viewport verification remains unavailable through the current Codex browser controller. Therefore Service Pass 2 is **PARTIAL**, pending a supported 320–390px viewport check. Fixed Service, Flexible Service, Parking management, Payment and Pass 3 remain out of scope.
