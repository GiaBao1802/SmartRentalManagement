# Admin Billing V1 Business Workflow and Search UX Closure Report

**Date:** 2026-10-14  
**Status:** PARTIAL — frontend implementation and authenticated business-filter browser smoke pass; draft save/finalize browser smoke could not run because the browser remained on the login page after the user reported logging in. The disposable database was removed. Frontend production build is blocked by Windows/SWC access denied.

## 1. Scope

Reworked the Admin Invoice list filters, list presentation, and Invoice detail workflow. No Billing business rules or API contracts changed. Payment, Resident Invoice portal, and production Zalo remain out of scope.

## 2. UX audit findings

- The previous Invoice filters exposed Property ID, Room ID, and Resident ID number inputs.
- Room selection was not presented as a business search scoped to a selected Property.
- Draft, overdue, and legacy states needed clearer business labels and stronger visual distinction.
- Draft readiness needed to distinguish visible data from checks only the server can perform.

## 3. Raw-ID filter problem

Removed the normal manual numeric-ID filter controls. Internal IDs remain opaque values attached to selected combobox options and are submitted only when applying filters.

## 4. Lookup APIs reused

- Property: existing Owner-scoped `GET /api/v1/properties` list/search.
- Room: existing `GET /api/v1/properties/:property_id/rooms`, scoped to selected Property.
- Resident: existing Owner-scoped resident list, fetched by pages and searched locally over fields already returned by the API: name, CCCD, and phone.
- Invoice list: existing server-side `GET /api/v1/invoices` filters for `property_id`, `room_id`, `resident_id`, status, and period.

No endpoint or request/response contract was added or changed.

## 5. Filter and search redesign

Property is selected by “Tòa nhà / Khu trọ” name or address. A no-result API search falls back to paginated Owner-scoped Property data and normalized local matching, including Vietnamese text without diacritics. Stale suggestions are cleared while a new search is pending. Room selection is disabled until a Property is selected; options come from that Property’s room endpoint. Changing Property clears the selected Room and its options. “Người thuê” search matches full name, CCCD, and phone. Unicode, alphabetic text, digits, and normal punctuation are accepted by text combobox inputs.

Apply sends the selected opaque IDs to the existing server filters. Reset clears selections/date/status and restores the unfiltered server list.

## 6. Invoice list redesign

The list uses business-facing columns for invoice number, building/property, room, renter, period, due date, total, status, and explicit detail action. It shows “Đang chuẩn bị”, “Chưa thanh toán”, “Đã thanh toán”, “Quá hạn”, and the secondary “Hóa đơn cũ” marker for legacy aggregate data. It does not display technical enum names or a raw ID as a fallback label. Existing server pagination, provisional-total notice, loading, empty, retry, and error states remain visible.

## 7. Workflow state redesign

The detail page shows the invoice’s business status, period, due date, finalization date, renter/property/room context, and total. Drafts expose meter entry and server-verified readiness guidance. Finalized and paid records show read-only meter readings and their server-provided financial details.

## 8. Readiness UX

Draft checklist items report only known contract linkage, rent presence, opening readings, and whether each entered closing reading passes client input validation. Utility tariffs and service/parking price resolution are explicitly labeled “Sẽ được hệ thống kiểm tra khi chốt.” The checklist does not claim that the invoice is ready for finalization based on frontend inference.

## 9. Meter UX

Electricity and Water have separate cards with read-only opening readings, closing-reading inputs, and informational usage previews. Validation accepts non-negative values with up to three decimals and rejects malformed, scientific, and decreasing values. The browser calculates usage only; all prices and totals remain backend-owned.

## 10. Finalize UX

“Lưu bản nháp” and “Chốt hóa đơn” are distinct actions. Finalize opens a confirmation dialog summarizing invoice, room, period, and ending readings and explains that the server checks pricing before locking financial data. Existing pending guards, CSRF/idempotency behavior, server error mapping, and reload-after-success remain in place.

## 11. Finalized itemized UX

The detail renders the server’s persisted total and item snapshots for Rent, Electricity, Water, Fixed Service, Flexible Service, and Parking. Electricity tiers expose their stored quantities, bounds, unit prices, and amounts. The frontend does not calculate authoritative money.

## 12. Electricity tier UX

Tier rows remain expandable and clearly distinguish each persisted tier’s quantity, rate, and amount. Drafts do not fabricate tier rows.

## 13. Legacy UX

Legacy aggregate invoices display “Hóa đơn cũ” and aggregate-only amounts. No category or tier breakdown is invented when item snapshots are absent.

## 14. Loading, empty, and error states

Comboboxes expose loading/no-result states and visible labels. Invoice list retains server loading, empty, retry, and error states. Detail retains loading, not-found, validation, permission, server error, and success feedback.

## 15. Responsive and accessibility

Comboboxes have visible labels, listbox/option roles, keyboard navigation, clear controls, and active-option state. Invoice filters and detail cards use responsive CSS; the readiness checklist collapses to one column at the mobile breakpoint. **A new narrow-browser viewport check was not performed** because the browser remained on the login page; prior detail responsive evidence is recorded in `ADMIN_BILLING_V1_FINAL_OPERATIONAL_CLOSURE_REPORT.md`.

## 16. Frontend tests

- `npm run typecheck --workspace=@goctro/frontend`: **PASS**.
- `npm run test:api --workspace=@goctro/frontend`: **46/46 PASS**.
- Focused assertions cover accent-insensitive Property search, Resident search by name/CCCD/phone, opaque-ID API mapping, reset mapping, status labels, raw-ID-free list display, draft readiness, meter validation/preview, item groups, tier details, and legacy aggregate behavior.
- `git diff --check`: **PASS** (Git emitted line-ending notices for existing working-tree files).
- `npm run build --workspace=@goctro/frontend`: **FAIL / environment limitation**. Next.js 16.4 Turbopack/SWC failed canonicalizing `frontend` `jsc.baseUrl` with `Access is denied (os error 5)`.

## 17. Local stack startup

The existing project frontend on port 3000 serves the current source. The project backend on port 4000 was restarted with a process-local `DATABASE_URL` pointing to disposable PostgreSQL 18 rehearsal port 55438; `/api/health` and `/api/health/db` returned `200`, and PostgreSQL activity confirmed the connection to `goctro_billing_ux_20261014`. `backend/.env` was not modified. After the browser session expired, the user reported logging in, but direct browser inspection still showed `/login?next=/admin/invoices/5011`; no credentials were entered or submitted by the agent. The disposable database was dropped and its PostgreSQL cluster stopped. The backend was then restarted using the unchanged `backend/.env` (`localhost:5432/Goctro_test3`). At final verification the listener existed, but an HTTP request to `/api/health` timed out; `/api/health/db` therefore could not be confirmed on the restored configuration. No password or session secret was printed.

## 18. Business-filter browser smoke

**PASS** on the authenticated local Admin page before switching the backend:

- The Property combobox accepted alphabetic “Binh An” and found “Nhà mẫu Bình An” through normalized Vietnamese search.
- Property selection enabled and populated the Room combobox with rooms belonging to that Property; “A101” was selectable.
- The Renter combobox accepted “cu dan mau An” and found “Cư dân mẫu An”.
- Changing Property cleared and disabled the previous Room selection until the new Property was selected.
- Applying the selected Property/Room/Renter filters returned exactly one matching invoice for A101; Reset restored the complete two-invoice list.

The browser list displayed business names/statuses and no manual raw ID controls.

## 19. Billing workflow browser smoke

**NOT RUN — blocked at authentication.** A disposable V1.8 rehearsal database contained draft Invoice `5011` and the intended synthetic charge fixture, and the backend connected to it. However, after the user reported signing in, the inspected browser tab still showed the login page. No draft changes or finalization were made. The disposable database was subsequently dropped. Save/reload/finalize/reload/itemization/read-only/narrow-view browser checks remain unverified.

## 20. Database impact

Database V1.8 schema and Prisma were not modified. The original `Goctro_test3` database on port 5432 received no writes from this pass; initial browser filter smoke was read-only. Rehearsal schema/seed/fixture data existed only in `goctro_billing_ux_20261014` on port 55438; that database was dropped and its dedicated PostgreSQL cluster stopped. No migration ran against `Goctro_test3`.

## 21. Remaining UX debt

- Recreate the disposable rehearsal database and complete the Admin browser workflow and narrow viewport smoke after the browser is authenticated.
- Diagnose why the restored backend on port 4000 timed out at final HTTP health verification; `backend/.env` still names `localhost:5432/Goctro_test3` and was not edited.
- Resolve the host’s Windows/SWC production-build access error before treating a production build as verified.
- The invoice detail relies on the current API’s available property/renter context; no new data source was added.

## 22. Billing UX completion status

**PARTIAL — implementation, automated validation, and business-filter browser smoke pass; mandatory draft-to-finalized browser workflow and narrow viewport check were not completed. Final backend health after restoring its original database configuration also timed out.** No Billing business rule or API contract changed.

## 23. Recommended next module

After completing this Billing UX pass and reconciling remaining Billing blockers, review Resident / Occupancy as the next module. Do not start Payment in this pass.
