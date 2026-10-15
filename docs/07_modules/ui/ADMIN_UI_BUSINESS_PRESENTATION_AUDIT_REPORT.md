# Admin UI Business Presentation Audit Report

- Date: 2026-10-12
- Scope: Admin-facing presentation in `frontend/src/app/admin`, shared Admin data views, with Contract History first.
- Status: UI cleanup implemented; frontend typecheck, API/presentation tests, and production build pass. Exact-width viewport smoke remains unverified due environment restrictions noted below.
- Authority: existing API responses and frontend route inventory. No business rules, database, Prisma, backend, or API contracts were changed.

## Screens inspected

Current Admin routes include Property, Room, Resident, Contract and Contract detail/history, Invoice, Accounts, Amenities, Bookings, Complaints, Contact Requests, Viewings, and related legacy utility screens. There is no Admin Dashboard route and no Settings route in this source tree; neither has a screen to audit.

## Findings and disposition

The audit grouped 16 distinct presentation/integration findings. 12 were fixed in the frontend; 4 remain as route/data-contract gaps or verification limitations.

| # | Type | Finding | Disposition |
|---|---|---|---|
| 1 | A | Contract history rendered raw snapshot JSON and technical diff keys. | Fixed: summary rows use Vietnamese field labels; unknown technical keys are omitted. |
| 2 | C | Contract history showed internal room, resident, predecessor, and actor IDs. | Fixed: maps to current Room/resident relations when available; predecessor is described as a prior contract; actor is shown as “Tài khoản quản trị”. |
| 3 | B | Contract history exposed raw action/state names. | Fixed: actions and contract states use business labels. |
| 4 | A | Contract audit time, dates, amounts, and meter readings lacked consistent presentation. | Fixed: shared VN date/time and VND formatters; meter units are explicit. |
| 5 | C | Contract list leaked database IDs and used IDs as missing relation fallbacks. | Fixed: only contract code and available business names/codes are shown; missing relation uses neutral copy. |
| 6 | D | Each history event’s action label could be inferred from the current Contract status rather than that event’s snapshot. | Fixed: event status is derived from its own before/after snapshot, safely falling back to current status. |
| 7 | D | Resident list described every `left` record as “Đã rời đi”, despite lacking history in its list response. | Fixed: list/filter/count now say “Không có lượt ở hiện tại”; detail distinguishes never-resided from formerly-resided only when history is present. |
| 8 | C | Resident detail displayed its internal ID and used Room IDs as fallback text. | Fixed: removed the ID display and replaced missing Room summaries with neutral wording. |
| 9 | A/B | Room list showed raw Contract status values and unformatted ISO dates; money formatting could throw on invalid input. | Fixed: safe shared status/date/money presentation. |
| 10 | A | Shared legacy Admin table mixed unrelated states into “active/pending” summary counts. | Fixed: one explicit loaded-list count; no cross-domain state aggregation. |
| 11 | A/B | Shared legacy table formatting was inconsistent for date, money, and unmapped statuses. | Fixed: shared formatters, with unknown status mapped to “Chưa xác định”. |
| 12 | B | Shared legacy API errors could expose internal response text; delete confirmation could fall back to an internal row ID. | Fixed: safe localized status errors (including 410), generic fallback, and no ID fallback in confirmation. |
| 13 | E | Invoice and other legacy Admin utility pages still depend on unversioned/retired endpoints (Invoice endpoint returns 410). | Recorded; intentionally not migrated or changed by this UI presentation pass. |
| 14 | E | Contract History API provides `changed_by_account_id` but no actor display name/role. | Recorded; UI uses a neutral role label and makes no lookup calls. |
| 15 | E | Historical snapshot IDs may not resolve to a Room/resident name; history response has no historical relation summaries. | Recorded; current relation/list data is reused where safe, otherwise a neutral “chưa có trong hồ sơ” value is shown. No N+1 requests. |
| 16 | A | Exact 1440 / 768 / 390 px viewport comparison could not be established in this run. | Not verified; Chrome was already displaying the authenticated Contract detail page at its existing window size. Direct local HTTP checks were blocked by the command sandbox, and device-toolbar invocation did not open responsive mode. |

## Contract History before / after

Before: version events could expose raw field names, internal IDs, raw before/after objects, and technical states.

After: each event is presented as a version and business action, with localized timestamp, a short reason/actor label, and labeled business changes. Money, dates, capacity, and meter values are formatted. Unknown fields are omitted. Room/resident values use already-loaded relations when available; unresolved historical values are explicitly neutral. The UI does not issue per-event lookups.

## Remaining UI and API gaps

- Historical actor display name and role are absent from the Contract History response.
- Historical Room/resident/previous-contract business summaries are absent when the old entity is no longer among current loaded relations. The UI does not guess or reveal the IDs.
- Invoice and several older Admin modules still use legacy endpoints; Invoice’s endpoint currently returns 410. This report does not migrate those screens.
- Dashboard and Settings are not implemented as Admin routes in the inspected tree.
- Other legacy module redesign remains outside this presentation cleanup; this pass corrected shared safe formatting and error treatment only.

## Files changed

- `frontend/src/lib/ui/admin-presentation.ts` — shared business formatting helpers.
- `frontend/src/lib/ui/admin-presentation.test.ts` — focused money/date/status/null/residence tests.
- `frontend/src/lib/api/contractView.ts` — humanized Contract History mapping and safe Contract errors.
- `frontend/src/lib/api/contractView.test.ts` — history mapping/identifier-suppression test.
- `frontend/src/app/admin/contracts/[contractId]/contract-detail.tsx` — history and Contract detail presentation.
- `frontend/src/app/admin/contracts/contract-management.tsx` — Contract list presentation.
- `frontend/src/app/admin/tenants/resident-management.tsx` and `frontend/src/app/admin/tenants/[residentId]/resident-detail.tsx` — residence semantics and safe relation fallbacks.
- `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx` — shared status/date/money display.
- `frontend/src/app/admin/contact-requests/contact-request-inbox.tsx` — consistent timestamp formatting.
- `frontend/src/app/components/data-management.tsx` — safe legacy table formatting, summary, errors, and confirmation copy.
- `frontend/src/app/globals.css` — compact, wrapping Contract History change rows for narrow screens.
- This report.

## Validation

- Frontend typecheck: PASS (`npm run typecheck --workspace=@goctro/frontend`).
- Frontend API tests: PASS, 27/27 (`npm run test:api --workspace=@goctro/frontend`).
- New presentation tests: PASS, 4/4 (`npx tsx --test src/lib/ui/admin-presentation.test.ts`).
- Production build: PASS (`npm run build --workspace=@goctro/frontend -- --webpack`). Initial sandbox build was blocked by Windows Access Denied during SWC path canonicalization; the approved build outside the restricted sandbox compiled, typechecked, generated all static pages, and completed successfully.
- Browser: confirmed the already-open authenticated Contract detail view at `http://localhost:3000/admin/contracts/[contractId]`; the history card showed localized event labels, formatted values, and no raw JSON/IDs at the existing Chrome window size. Exact 1440/768/390 viewport tests were not completed.
- Backend modified: NO. Database/Prisma modified: NO. API/business contract modified: NO.
