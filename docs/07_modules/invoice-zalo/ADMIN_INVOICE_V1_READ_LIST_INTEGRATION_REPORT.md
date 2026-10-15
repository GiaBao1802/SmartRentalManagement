# Admin Invoice V1 Read-List Integration Report

Date: 2026-10-13  
Status: IMPLEMENTED — AUTOMATED CHECKS PASS; BROWSER NOT VERIFIED

## 1. Scope

Replaced the Admin Invoice page's retired legacy data source and generic CRUD presentation with a read-only list over the existing Invoice V1 list API. No detail, meter entry, itemization, finalize, Zalo, Payment, schema, or API contract work was included.

## 2. Legacy problem confirmed

The previous page used the generic `DataManagement` path backed by `/api/invoices`; the backend retires that unversioned endpoint with HTTP 410. The generic page also exposed create/edit/delete and manual payment/status actions unsupported by this V1 list contract.

## 3. Files changed

- `frontend/src/app/admin/invoices/page.tsx` — server page wrapper and title metadata.
- `frontend/src/app/admin/invoices/invoice-list.tsx` — client filters, API loading, retry, and page state.
- `frontend/src/app/admin/invoices/invoice-list-content.tsx` — read-only table and loading/error/empty/pagination states.
- `frontend/src/lib/api/invoiceApi.ts` — typed V1 list helper; only supported query parameters are sent and blank values are trimmed/omitted.
- `frontend/src/app/globals.css` — brand-aligned invoice filters/table/pagination styling and narrow-screen behavior.
- `frontend/src/lib/api/invoiceApi.test.ts` — endpoint/query/response envelope tests.
- `frontend/src/app/admin/invoices/invoice-list-content.test.tsx` — rendered fields, statuses, derived overdue, loading/error/empty, pagination, and no-CRUD checks.

## 4. API used

`GET /api/v1/invoices`, called through the shared `apiRequest` helper. The helper retains the `{ data, meta }` envelope and uses the existing API base URL and cookie credentials. Owner scope is session-derived by the backend; the frontend never sends `owner_id`.

## 5. Fields rendered

Invoice number (or API ID fallback), Invoice ID, Property name, Room code, representative Resident ID, `period_start → period_end`, due date, `total_amount`, lifecycle status, and derived overdue badge. A provisional amount is explicitly labeled for draft rows. Resident display name and itemized breakdown are not present in this list DTO and are not fabricated.

## 6. Filters implemented

The form sends the supported server-side filters: `property_id`, `room_id`, `resident_id`, `status`, `period_start`, and `period_end`, along with `page` and `page_size`. Date range validation rejects an end date earlier than the start. The UI exposes numeric record IDs for Property, Room, and Resident because this contract/page has no lookup endpoint wired to provide filter options or names. No client-only current-page search is presented as a full-data search.

## 7. Pagination

Uses `meta.page`, `meta.page_size`, `meta.total_items`, and `meta.total_pages` from the response. Previous/next controls are bounded by server metadata; changing pages requests another server page.

## 8. Actions removed

The page no longer renders generic Add, Edit, Delete, manual amount/status editing, “Ghi nhận đã thu,” or Invoice detail actions. It is read-only.

## 9. Tests and checks

- Focused Invoice API + list rendering tests: **5/5 PASS**.
- Existing frontend API regression suite: **27/27 PASS**.
- Frontend typecheck: **PASS** (`npm run typecheck --workspace=@goctro/frontend`).
- Frontend production build: **NOT PASS / environment blocked**. Next.js 16.4 SWC failed while canonicalizing `frontend` under Windows with `Access is denied (os error 5)`; this is recorded as a build limitation, not a code pass.
- Backend/API contract, database, and Prisma files were not changed.

## 10. Browser/manual result

**NOT VERIFIED.** At inspection time there was no listening process on localhost ports 3000 or 4000, so the app was not started and no browser request or live Invoice rows could be checked. Automated tests validate the request path/mapping and rendering against the V1 response shape, but do not establish that records currently render from the live database.

## 11. Remaining gaps

- Live Admin browser/data verification remains outstanding.
- Property/Room/Resident filter inputs accept IDs; friendly server-backed lookup options are not part of this task.
- The list API does not return Resident display names or invoice item detail; UI does not invent them.
- Billing remains incomplete: tariff/read/charge resolvers and atomic `ITEMIZED` finalization are still absent; finalization must remain fail-closed. Zalo and Payment remain outside this task.

## 12. Exact next task

**GÓC TRỌ — BILLING V1.7 UTILITY TARIFF RESOLVER (PERIOD_START)** — implement the read-only backend resolver and focused tests described in `BILLING_V1_7_BACKEND_IMPLEMENTATION_GAP_REVIEW_REPORT.md`. Keep `UnconfiguredInvoicePricing` wired; do not add routes or enable finalization as part of that bounded resolver step.
