# Billing V1 Period Workspace + Readiness / Missing-Data Queue

**Date:** 2026-10-14  
**Status:** IMPLEMENTED; disposable PostgreSQL and automated checks PASS; authenticated browser closure PENDING  
**Scope:** Admin Billing period workspace and read-only readiness/read model. No Payment, Resident Invoice portal, production Zalo delivery, financial-rule change, or Database V1.8 change.

## 1. Previous gap and target flow

The Invoice list/detail supported lookup, meter entry, review and finalization, but did not provide an operational view of each Contract's current billing period, missing inputs, expected draft, or readiness. The target is a Contract-anchored work queue:

`period → Contract/Room → readiness and blockers → draft → ready → finalized → unpaid/overdue`

`/admin/invoices` remains the invoice history/list. `/admin/billing` is the operational workspace.

## 2. Readiness model and backend/API changes

Added Admin-only `GET /api/v1/billing/workspace`. Owner context comes from the authenticated session. The request supports stable paging, Property/Room/Resident, invoice status, period-range and readiness-state filters; the response includes per-page queue counters and Owner-filtered finalized/unpaid/paid/overdue counts.

Rows expose business labels, Contract number and each Contract's independently calculated period; internal resource IDs are retained only for API navigation/filter plumbing. State codes include `UPCOMING`, `IN_PROGRESS`, `REMINDER_DUE`, `MISSING_DRAFT`, `MISSING_DATA`, `READY_TO_FINALIZE`, `FINALIZED_UNPAID`, `OVERDUE` and `PAID`. Blockers are structured as `{code, category, message}`.

Draft preflight calls the same meter-continuity, utility-tariff, Fixed Service, Flexible Service and Parking resolvers used by finalization. It neither finalizes nor writes item/reading snapshots, changes Invoice lifecycle fields, nor consumes charges. The additional check compares each eligible Flexible Service charge amount with its quantity and resolved unit price so an inconsistent stored amount cannot be displayed as ready when the calculator would reject it. Draft totals stay explicitly provisional.

Filter semantics are applied before pagination when state/invoice status requires resolver-derived selection. That mode inspects all candidates scoped to the authenticated Owner before slicing to produce exact filtered metadata; unfiltered lists use database pagination. This has a higher read cost for filtered scans and should be monitored as Owner Contract counts grow.

## 3. Workspace UI, counters and actions

The workspace provides summary counters, a missing-data/closeout queue, a ready-to-finalize queue, current-period monitoring, finalized/unpaid/overdue overview, business-text filters and a direct link to invoice history. Periods are per Contract; the UI does not imply one shared calendar month.

- Missing meter ending → existing Invoice detail for meter entry.
- Missing opening → existing Contract detail for source inspection.
- Missing configuration/service source → informational disabled action because no supported management destination exists in this scope.
- Ready/finalized/unpaid/overdue → existing Invoice detail; finalize remains the existing detail action.
- Expected but absent draft → visible `MISSING_DRAFT` warning and no write/recovery action. The scheduler remains responsible for creation.

The workspace reads the existing durable closeout notification state and does not enqueue duplicate reminders. Accessible labels, keyboard-operable business comboboxes, semantic status text and responsive layout rules are in place. Browser verification at a narrow viewport is still pending.

## 4. Security and data impact

Every read-model query is scoped from the authenticated Owner. PostgreSQL integration verifies each Owner sees only its own Property rows and Owner 2's paid Invoice is not returned to Owner 1. There is no client-supplied `owner_id` authority.

Database V1.8 artifacts, Prisma mapping and `Goctro_test3` were not modified. Runtime test rows were written only to the disposable PostgreSQL 18 database `goctro_billing_workspace_rehearsal` on loopback port 55439. The integration test removed its rows in `finally`; the disposable cluster/database are removed after verification. No test rows were written to `Goctro_test3`.

## 5. Validation

- Backend Invoice regression: **158 PASS / 0 FAIL / 2 SKIP**. The skipped tests are separate PostgreSQL itemized-finalize and scheduler integrations; the workspace PostgreSQL integration was enabled and passed in this run.
- Workspace PostgreSQL integration: **1/1 PASS**. It covered missing Electricity ending, missing Water ending, a resolver-complete draft, Flexible Service amount mismatch, inspection read-only behavior, existing unpaid/paid visibility by Owner, derived overdue, expected missing-draft anomaly and Owner isolation. A missing tariff, Fixed Service price, or Parking price was not constructed as a separate PostgreSQL fixture in this run; those failure modes were not claimed as PostgreSQL runtime-verified here.
- Frontend typecheck: **PASS**.
- Frontend API/UI suite: **53/53 PASS**.
- Scoped workspace diagnostics: no new TypeScript diagnostics were found. Backend project typecheck still reports 174 pre-existing legacy diagnostics (173 in `backend/src/app.ts`, 1 in `backend/src/residents/resident.test.ts`).
- Frontend production build: previously attempted and blocked before source compilation by Windows/SWC `Access is denied (os error 5)` resolving `jsc.baseUrl`.
- Authenticated browser flow and narrow viewport: **NOT RUN**. The connected computer-use tool stopped because it could not identify the active browser URL confidently enough to enforce its policy. No browser interaction or login was attempted after that stop. Accordingly, UI navigation, filter behavior in-browser, meter save/readiness refresh, finalization from the workspace, read-only finalized reload, and responsive browser rendering are not claimed as PASS.

## 6. Current flow vs remaining gaps

Implemented and automated: period-oriented Owner-scoped workspace, resolver-backed readiness/blockers, missing-draft detection, filters/pagination, history/detail handoff, ready queue and unpaid/overdue overview. The existing finalize operation is reachable through the workspace's Invoice detail link, but this new entry path is not browser-verified.

Remaining Billing gaps are operational service-data source readiness (including separate PostgreSQL fixture coverage for missing tariff/Fixed Service/Parking prices) and authenticated browser closure. Zalo durable recipient/delivery operations, Payment, and Resident Invoice UX remain separate domains; no work on those domains started here.

## 7. Exact next task

First complete authenticated browser and narrow-viewport closure on disposable V1.8 data, verifying the workspace filters, missing meter save/readiness refresh, finalize path, finalized read-only detail, and resulting counts. Do not mutate `Goctro_test3`.

After FULL PASS, audit the remaining Billing-adjacent domains in this order and do not start them automatically:

1. Billing service-data source gaps.
2. Zalo durable delivery/recipient flow.
3. Payment.
4. Resident Invoice UX.

