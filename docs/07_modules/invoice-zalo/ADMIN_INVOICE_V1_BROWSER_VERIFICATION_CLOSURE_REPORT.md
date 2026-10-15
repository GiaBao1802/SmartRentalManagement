# Admin Invoice V1 Browser Verification Closure Report

Date: 2026-10-13  
Scope: Local verification of `/admin/invoices`; one directly related filter middleware fix.  
Result: **PASS WITH LIMITATION**

## 1. Scope

Verified the authenticated Admin Invoice list against the local V1 API. No invoice, account, or database records were changed. No migration, seed, or reset was run. Frontend code and API contract were not changed.

## 2. Auth session result

- Before the filter fix, the existing DEV Admin session rendered the Admin shell, `Đăng xuất`, and the Invoice list, and survived a browser reload.
- The backend dev watcher restarted after the middleware source change; its in-memory sessions were lost and the browser redirected to `/login?next=%2Fadmin%2Finvoices`.
- An authenticated local API check was then run using the existing DEV Admin through the normal CSRF/login flow; the temporary session was logged out (HTTP 200). No test account was created.
- The browser itself is currently at the login page. The final post-fix browser filter rerun is therefore pending a new user login.

## 3. Network result

- Browser DevTools Network capture is unavailable in the current in-app browser; the exact browser-originated request event could not be captured directly.
- Frontend config is `NEXT_PUBLIC_API_BASE_URL=http://localhost:4000/api/v1`. `invoiceApi.list` calls `/invoices` with `page` and `page_size`, so its target is `GET http://localhost:4000/api/v1/invoices`.
- The frontend invoice helper and its focused test use the versioned route and explicitly assert that it does not call `/api/invoices`. The old backend route is retired with HTTP 410.
- An authenticated local HTTP check against the V1 list route returned HTTP 200. The normal list used `page=1&page_size=20`; filter checks appended the relevant exact query keys.
- Conclusion: **API target and response verified; raw browser Network capture NOT VERIFIED.** No evidence of a `/api/invoices` request was found in the frontend source or tests.

## 4. Live API response and UI mapping

Unfiltered API response: **HTTP 200**, envelope `{ data, meta }`, `meta = { page: 1, page_size: 20, total_items: 2, total_pages: 1 }`.

| Field | `DEMO-INV-003` | `DEMO-INV-001` |
|---|---|---|
| Invoice ID | 5003 | 5001 |
| Property | Nhà mẫu Bình An (ID 11) | Nhà mẫu Bình An (ID 11) |
| Room | A102 (ID 102) | A101 (ID 101) |
| Representative Resident | 1003 | 1001 |
| Period | 2026-09-18 → 2026-10-17 | 2026-09-15 → 2026-10-14 |
| Due date | 2026-10-13 | 2026-10-13 |
| Total | 3,550,000 | 4,040,000 |
| Status | `unpaid` | `unpaid` |

The authenticated page previously displayed both invoice numbers, IDs, property/room/resident labels, periods, due dates, totals and “Chưa thanh toán” matching those API rows. Dates and currency were formatted for display. The browser UI was not rerun after the backend-only fix because the session expired.

## 5. Filters

Each API check used the authenticated Admin route after the fix.

| Filter | Result | Evidence |
|---|---|---|
| `property_id` | PASS (API) | `11` returned both invoices; total 2. |
| `room_id` | PASS (API) | `101` returned only `DEMO-INV-001`; total 1. |
| `resident_id` | PASS (API after fix) | `1001` returned only `DEMO-INV-001`; total 1. Before the fix the browser showed a middleware validation error. Post-fix browser submission remains unverified. |
| `status` | PASS (API) | `unpaid` returned both invoices; total 2. |
| `period_start` | PASS (API) | `2026-09-18` returned only `DEMO-INV-003`. |
| `period_end` | PASS (API) | `2026-10-14` returned only `DEMO-INV-001`. |
| Reversed date range | PASS (API) | Start `2026-10-14`, end `2026-09-18` returned HTTP 400 `VALIDATION_ERROR`. |
| Reset button | NOT VERIFIED | Browser session expired before reset could be exercised. |

The three ID fields are numeric-only intentionally: the API accepts positive integer record IDs. The form uses `type=number`, `min=1`, and `step=1`. There is still a UX gap because the form does not provide an ID lookup/name selector.

## 6. Pagination

**PASS FOR SINGLE-PAGE STATE.** API metadata reports page 1/1, 2 total rows, page size 20. The rendered page showed “Hiển thị 1–2 trong 2 hóa đơn”; Previous and Next were disabled. **Multi-page live behavior was not exercised** because this dataset contains only one page; no records were added.

## 7. Legacy actions

**PASS on the rendered page.** The browser-visible list contained filters, retry/reset, and pagination only. No Add Invoice, Edit, Delete, manual amount/status edit, or “Ghi nhận đã thu” action was present. The focused render test also asserts the absence of these actions.

## 8. Status display

Live data contains only `unpaid`, and both rows displayed “Chưa thanh toán”. No `draft` or `paid` row was available, so those labels were not live-verified. No overdue state is claimed.

## 9. Responsive result

**PARTIAL.** A narrow, approximately 360 px browser view showed the filter fields stacked and no major overlap in the visible area. Desktop viewport was not checked. Horizontal table scrolling is implemented with an overflow container and a 1120 px table minimum width, but the post-fix horizontal-scroll interaction was not exercised.

## 10. Console and requests

- Browser console error/warning inspection returned no entries before the session expired.
- The pre-fix `resident_id=1001` browser filter returned the middleware validation message “Không được gửi trường xác định vai trò hoặc phạm vi Owner/Resident.”
- After the fix, authenticated direct API queries returned the statuses and rows listed above. Health and database health both returned `ok`.
- No other failed request or React hydration/runtime error was observed. Because browser Network capture is unavailable, this report does not claim to have captured the page's raw request log.

## 11. Fixes made

The shared authority-field middleware rejected `resident_id` on every query route, even though the Invoice V1 contract and invoice validator permit an Admin to filter invoices by this ID. It now permits that query key only for the exact `GET /api/v1/invoices` list route. Authentication still derives Owner scope from the session; Invoice validation rejects the filter for a Resident. Other routes still reject client-supplied `resident_id`.

Files changed:

- `backend/src/middleware/auth.ts`
- `backend/src/invoices/invoice.routes.test.ts`
- `backend/src/auth/auth.test.ts`

Database, Prisma, frontend and API contract: **NOT modified**.

## 12. Tests

- Backend Invoice tests: **37/37 PASS**.
- Backend Auth tests: **20/20 PASS**.
- Frontend Invoice list component tests: **3/3 PASS**.
- Frontend Invoice API tests: **2/2 PASS**.
- Frontend typecheck: **PASS**.
- The frontend package has no generic `test` script; the two focused test files were run directly through the existing `tsx` runner. Initial sandbox test attempts could not bind their ephemeral localhost mock ports (`EACCES`); rerunning with local host access passed. No production build was needed for the backend-only change.

## 13. Remaining UX/runtime gaps

- Re-login in the current browser, rerun the Resident ID filter and reset button after the middleware fix.
- Capture frontend-originated Network request/status in a browser with an available Network inspector.
- Desktop viewport and horizontal table-scroll interaction remain unverified.
- Multi-page behavior, and `draft`/`paid` label rendering with live rows, remain unverified because no such data was available; no test data was added.

## 14. Final result and next task

**PASS WITH LIMITATION.** The live API list, all supported server filters, date-range rejection, single-page metadata, data mapping, lack of legacy actions, focused tests, and typecheck pass. The one real Resident ID filter defect was fixed with role/route-scoped enforcement. Final browser rerun and raw Network capture are not complete because the backend restart invalidated the browser session and the current browser tool has no Network panel.

Exact next task: re-authenticate the existing DEV Admin in the open local tab, rerun `resident_id=1001` plus Reset through the browser, inspect the horizontal table scroll at narrow width and the layout at desktop width, and capture the frontend request in a browser Network inspector if available. Do not add invoice rows or write to the database.
