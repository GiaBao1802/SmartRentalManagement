# Property / Room + Room Images Final Host-Browser Closure Report

**Date:** 2026-10-11  
**Status:** PARTIAL — do not mark Admin E2E complete.  
**Scope:** Admin Property/Room and Room Images on the existing local V1.4 development stack. No backend, schema, Prisma, migration, seed, or product source was changed.

## Executive summary

The local V1.4 runtime and automated regressions pass. In the existing Admin browser session, the 0-image Room creation flow succeeded, survived refresh, and opened in edit mode with the correct empty gallery state. The test Room was then archived using the product's normal recoverable “Ngưng hoạt động” action. The browser automation could not open a native file chooser, so image-selection flows and gallery operations were not exercised on this current host session. E2E closure remains **PARTIAL**.

## Runtime baseline

| Check | Result | Evidence |
|---|---|---|
| Backend | PASS | `GET http://localhost:4000/api/health` returned `status: ok`. |
| Database health | PASS | `GET http://localhost:4000/api/health/db` returned `status: ok`. |
| Actual database | PASS | Read-only PostgreSQL query returned `Goctro_test3`, port `5432`, 27 public tables, and `public.room_images` present. |
| Frontend | PASS | `http://localhost:3000/admin/properties/11/rooms` returned HTTP 200. |
| Database mutation scope | PASS | No migration, schema, seed, reset, or direct SQL write was run. |

## Browser and functional results

| Scenario | Result | Observation |
|---|---|---|
| Admin login/session | PARTIAL PASS | The user authenticated in the existing tab. The protected Admin Room page loaded with the Admin shell and real Property 11 data. The session remained available while the page was refreshed. Login was not repeated by the agent. |
| Single create — 0 images | PASS | Created `SMOKE-E2E-ZERO-1011`; UI confirmed “Đã tạo phòng SMOKE-E2E-ZERO-1011.”. It appeared in the list and remained after refresh. Edit showed `0/5` and “Phòng này chưa có hình ảnh.” with no fake image row. |
| 0-image fixture cleanup | PASS WITH NOTE | Used the normal archive action. UI confirmed “Đã ngừng hoạt động phòng SMOKE-E2E-ZERO-1011.” and its status became “Ngừng hoạt động”. The row remains as an archived Room because the product preserves historical records. No image object was uploaded. |
| Single create — 1 image | NOT VERIFIED | The local PNG fixture was ready, but the in-app browser did not expose a native file chooser. No Room was submitted for this scenario. |
| Single create — 5 images / sixth-image limit | NOT VERIFIED | Requires a functioning native file chooser. |
| Single partial image failure | NOT VERIFIED | Requires selecting valid and malformed files through the UI. No failure message was inferred from unit tests. |
| Bulk shared-image creation | NOT VERIFIED | Requires selecting image files through the real chooser. |
| Bulk partial Room failure | NOT VERIFIED | Not exercised in this browser pass. |
| Bulk partial image failure | NOT VERIFIED | Requires selecting mixed valid/invalid files through the real chooser. |
| Gallery upload, cover, reorder, deletes | NOT VERIFIED IN THIS PASS | No current-session gallery with uploaded images was available, and file selection was blocked. Previous API/runtime evidence in the V1.4 runtime report is not treated as a substitute for these host-browser checks. |
| Shared gallery independence | NOT VERIFIED IN THIS PASS | Requires two Rooms with UI-uploaded shared images. |
| Refresh persistence | PARTIAL PASS | Confirmed for the 0-image Room create. Image, gallery, cover, reorder, delete, and bulk persistence depend on the blocked scenarios. |

The file picker was attempted through both the associated “Chọn ảnh” control and the actual `input[type=file]`. The control was visible and enabled, but no chooser event appeared; the browser locator also reported that it could not dispatch a click to the file input. This is a limitation of the available in-app browser automation in this session, not evidence that the normal Chrome picker is broken. The React markup associates the input with the visible label, and automated picker/workflow tests pass; actual browser upload remains unverified.

## Responsive visual smoke

| Viewport | Result | Evidence |
|---|---|---|
| Desktop 1366 × 900 | PARTIAL PASS | Viewport reported `innerWidth=1366`; document width was 1351, with no horizontal document overflow. Screenshot capture returned only a cropped portion of the wide viewport, so the complete desktop composition could not be visually inspected. |
| Tablet 768 × 1024 | PASS FOR CREATE MODAL | Modal measured about 713 × 822 px at x=20; it fit inside the viewport. Screenshot showed the form, image picker, and actions without overlap. |
| Mobile 390 × 844 | PASS FOR CREATE MODAL | Document width was 375 px (no horizontal overflow). Modal fit within the viewport and used internal vertical scrolling (`scrollHeight=1077`, `clientHeight=792`); controls remained reachable by scrolling. |

The bulk form and image gallery layout could not be checked because they require additional image-selection scenarios.

## Accessibility and network inspection

- **Labels and keyboard focus: PARTIAL PASS.** The Room form exposed named text/number fields, named checkboxes, a labelled image-picker region, and a “Chọn ảnh” button. Tabbing from the Room code field moved to the rent input, which showed a solid 1.6 px focus outline.
- **Gallery alt text, cover announcement, keyboard delete confirmation: NOT VERIFIED.** No image gallery could be populated in the current session.
- **Browser Network panel: NOT VERIFIED.** This browser connection did not expose DevTools Network inspection. Therefore no claim is made about an observed host-browser multipart request, generated boundary, cookie, CSRF header, or response DTO in this pass.
- **Automated contract evidence: PASS.** Frontend tests confirmed multipart boundaries/CSRF credentials in the API helper; backend route tests confirmed CSRF enforcement, safe DTOs, and upload validation. These tests do not replace live Network-panel inspection.

## Automated checks

| Check | Result |
|---|---|
| Frontend typecheck | PASS — `npm run typecheck --workspace=@goctro/frontend` |
| Frontend tests | PASS — 12/12 |
| Frontend production build | PASS — `npm run build --workspace=@goctro/frontend` |
| Room Images backend regressions | PASS — 21/21 |
| Property/Room backend regressions | PASS — 44/44 |
| Auth backend regressions | PASS — 20/20 |

The first sandboxed production-build attempt failed because Windows denied Next.js path canonicalization (`Access is denied`). The same build passed outside the restricted sandbox. Backend and DB health plus frontend HTTP 200 were rechecked afterward.

## Bugs found and fixes

No application defect was confirmed and no source fix was made. The native file picker could not be operated from this in-app browser session. Because the visible label/input association is present and automated tests pass, this limitation is recorded as unverified browser coverage rather than a confirmed product bug.

## Closure decision

**PROPERTY / ROOM + ROOM IMAGES — NOT E2E COMPLETE.** The local runtime, automated regressions, and 0-image flow pass. Mandatory real-file-picker single/bulk upload, partial image-failure UI, gallery management, shared-image independence, image persistence, complete desktop visual review, and live Network-panel checks remain unverified. Do not start the Public Sales Funnel implementation based on this report.

## Recommended next task

Run a focused **Chrome Host File-Picker + Gallery Smoke Pass** in a host Chrome session with native file selection and DevTools Network access. Continue on the current local V1.4 database; do not repeat the already-passing runtime or full regression suites unless the focused pass finds a code defect.
