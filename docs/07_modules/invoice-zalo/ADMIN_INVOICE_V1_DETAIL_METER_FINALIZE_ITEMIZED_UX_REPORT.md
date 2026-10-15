# Admin Invoice Detail + Meter + Finalize UX Report

## 1. Scope

Implemented the Admin invoice detail route and draft meter save/finalize UI using the existing V1 invoice API. Payment, Resident Invoice UI, production Zalo delivery, and Database V1.8 were not changed.

## 2. State before this task

Admin had a server-filtered, paginated read-only Invoice list. The existing backend already exposed `GET /invoices/{invoice_id}`, draft-only `PATCH /invoices/{invoice_id}`, and `POST /invoices/{invoice_id}/finalize`.

## 3. Files changed

- `frontend/src/lib/api/invoiceApi.ts`
- `frontend/src/lib/api/invoiceApi.test.ts`
- `frontend/src/app/admin/invoices/invoice-list-content.tsx`
- `frontend/src/app/admin/invoices/[invoiceId]/page.tsx`
- `frontend/src/app/admin/invoices/[invoiceId]/invoice-detail.tsx`
- `frontend/src/app/globals.css`
- `frontend/package.json`

## 4–8. Detail, draft meter UX, save behavior, and finalize

Invoice number links from the list to `/admin/invoices/[invoiceId]`. Detail loads through the API helper and presents property, room, representative resident, contract, period, due date, status, snapshot kind, and aggregate totals.

Draft meter fields show read-only opening readings and editable ending readings. The UI validates non-negative decimal input with at most three fractional digits and prevents values below opening readings. “Lưu chỉ số” calls the existing draft PATCH and reloads the detail without finalizing.

“Chốt hóa đơn” requires both readings in the UI and opens a confirmation explaining financial data becomes locked. It calls the existing finalize route with the entered readings, CSRF from the shared API client, and an `Idempotency-Key`. It disables concurrent clicks and reloads the invoice from the server after success. API errors are mapped to Vietnamese messages; backend remains authoritative.

## 9–10. Itemized breakdown and electricity tiers

**Blocked by the current detail response.** The backend detail repository's `invoiceInclude` loads the Contract and payment transactions, but does not include `invoiceItems` or `electricityTiers`; the response serializer consequently cannot return item rows or tier rows. The canonical API Spec also says the exact V1.7 finalized response fields remain implementation-contract work. The UI displays only server-returned aggregate buckets and explicitly says when item/tier details are unavailable. It does not invent line items or tier data.

To close the itemized portion, first approve/define the detail response shape in the canonical API contract, then wire the backend serializer/repository and add route tests. No backend/API contract edits were made in this task.

## 11–13. Legacy, error, and responsive behavior

Legacy aggregate invoices show “Hóa đơn cũ — chỉ có dữ liệu tổng hợp” and only the available aggregate buckets. Finalized/paid invoices have read-only readings and no save/finalize controls. Layout stacks cards and meter fields on narrow screens; the finalize confirmation remains viewport-constrained.

## 14–16. Tests, integration, and browser

- Frontend API/component suite: **33/33 PASS**.
- Frontend TypeScript typecheck: **PASS**.
- Frontend production build: **BLOCKED** by Windows SWC/Turbopack failing to canonicalize the workspace `baseUrl` (`Access is denied`, OS error 5) while loading `next.config.ts`.
- Backend Invoice regression command: **129 passed, 10 failed, 1 skipped**. All 10 failures were route tests unable to bind/connect to the test listener (`connect EACCES 127.0.0.1:49194`) in this environment; the optional PostgreSQL integration test was skipped because its disposable rehearsal URL was not configured. These are environment-blocked checks, not claimed as pass.
- Browser smoke: **NOT RUN**. No process was listening on local ports 3000/4000, so authenticated backend flow and persistent finalize could not be verified safely. No test Invoice was mutated.

## 17. Database impact

None. No schema, migration, seed, or database command was run.

## 18. Remaining blockers

1. Define and expose authorized Invoice item/tier data from the detail API; until then itemized lines/electricity tiers cannot be rendered.
2. Re-run backend route tests where local TCP bind is allowed, frontend production build in an environment where SWC can canonicalize the workspace, and authenticated browser flow with a safe disposable draft.

The Admin workflow is **PARTIAL**, not FULL PASS: list-to-detail navigation, draft meter save, and finalize UX are implemented, but item/tier breakdown and runtime/browser persistence were not verified.

## 19. Exact next task

Approve and implement the Invoice detail item/tier response contract (including legacy aggregate behavior), then run backend route tests and authenticated browser verification against a disposable development draft. After that, choose Payment, Zalo delivery, or Resident Invoice portal based on the updated Billing dependency state; none was started here.
