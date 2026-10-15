# Property / Room + Room Images Admin V1.4 Host-Browser Smoke Report

**Date:** 2026-10-11  
**Status:** PARTIAL — required host-browser coverage is incomplete; do not mark Admin E2E complete.  
**Scope:** Admin Property/Room and Room Images against a disposable PostgreSQL 18 V1.4 database, using the local frontend, backend, and private image storage.  
**Source:** Current SmartRentalManagement frontend/backend and the locked Database V1.4 schema and seed in the adjacent `GocTro-SmartBuilding` workspace.

## Environment and safety

- Frontend ran at `http://localhost:3000`; backend ran at `http://localhost:4000`.
- The smoke database was `goctro_v14_smoke` on `127.0.0.1:55433`, created from the V1.4 schema and seed. It reported PostgreSQL 18 and 27 public tables.
- The original `localhost:5432/Goctro_test3` connection and its data were not changed. No migration, reset, or seed was run against it.
- The seeded DEV Admin was used only in the disposable database. No password hash or credential is recorded here.
- Smoke-created image files and both task-created scratch cluster directories were removed. The disposable server stopped; port 55433 has no listener. Port 5432 was left untouched.
- The backend was restored to its normal local environment. `/api/health` and `/api/health/db` both returned `status: ok`. The existing frontend on port 3000 was left running.
- No source, schema, Prisma, or business-logic file was changed. This report and the documentation catalog are the only files changed.

## Results

| Area | Result | Evidence |
|---|---|---|
| Health | PASS | Disposable run: `/api/health` and `/api/health/db` returned OK. After cleanup, both endpoints also returned OK on the restored local backend. |
| Auth and tenant context | PASS | Browser Admin login succeeded; API CSRF and login returned 200, issued `gt_session`; `/auth/me` returned Admin with Owner context. |
| Property and Room list | PASS | Seeded Property 11 showed Rooms A101/A102. Room list returned actual rows. |
| Room create and persistence | PASS | Created `HOST-SMOKE-0` without images; it remained after refresh. |
| Bulk Room create / partial result | PASS | A batch containing an existing code and a new code reported 1/2 created, identified the duplicate, and retained the successful new Room. |
| One-Room image API | PASS, API exercised | Uploaded five valid synthetic PNGs to one Room; sixth was rejected with 409 `ROOM_IMAGE_LIMIT_REACHED`; invalid image returned 422. Database inspection showed five associations and one cover before gallery operations. |
| Shared gallery attach | PASS, API exercised | Bulk attach with one valid and one invalid file returned per-file attached/failed results. The shared object had two Room associations. |
| Gallery UI management | PASS | Browser showed 5/5; cover change, reorder, non-cover deletion, and current-cover deletion all showed successful updates. Deleting the cover promoted another image. |
| Shared image independence | PASS | Removing the shared image association from A101 left A102's association and underlying storage object intact after refresh. |
| One-image Room | PASS | Uploaded one image through the multipart API for `HOST-BULK-1`; after refresh its UI gallery showed 1/5 and the cover. |
| Persistence | PASS | Room rows and image associations remained after page refresh/reopen during the disposable run. |
| Owner isolation / CSRF | PASS | Authenticated Owner 1 request for another Owner's Property returned 404. Mutation without CSRF returned 403. |
| Private image delivery | PASS | Authenticated image fetch returned 200 `image/png` with private cache control; anonymous fetch returned 401. |
| Small viewport / keyboard | PARTIAL PASS | Browser rendered at approximately 360px wide; cards/forms remained usable with scrolling. Keyboard Tab produced a visible focus indicator; accessible labels and image alt text were present. |
| Desktop/tablet responsive layout | NOT VERIFIED | The available in-app browser exposed only a narrow viewport and did not permit resizing to representative desktop/tablet widths. |
| Browser file selection and upload | NOT VERIFIED | Clicking the native file-picker control did not expose an operating-system chooser in this browser automation environment. Multipart behavior was tested directly against the API, not by selecting files in the UI. |
| FE multipart partial-failure rendering | NOT VERIFIED | Backend returned mixed per-file success/failure as expected, but the browser could not select files to verify the corresponding FE rendering end to end. |

## Detailed observations

- The first browser login attempt used an email already populated by the form and appended text to it, so that submission was rejected. Replacing the field value exactly allowed login; this was input handling during the smoke, not a backend Auth failure.
- On the Room list, keyboard focus was visible. At the available narrow viewport the page remained navigable, though this does not establish desktop or tablet layout quality.
- The API upload checks used locally generated synthetic PNGs with no personal data. The private file root was absent before the run; the five resulting stored files were removed during cleanup.
- No implementation defect requiring a code change was confirmed. The native chooser limitation prevents claiming that the Admin image upload flow was fully exercised in a real browser.

## Conclusion and remaining verification

Room CRUD, gallery associations, ordering/cover management, capacity limit, private image access, Owner isolation, CSRF enforcement, and persistence passed on the disposable V1.4 runtime. The browser smoke remains **PARTIAL** because the available host browser could not operate the OS file chooser, and desktop/tablet viewports could not be inspected. The browser did not verify FE multipart upload or mixed upload-result presentation. Therefore this pass does **not** establish full Property/Room + Room Images Admin E2E completion.

No subsequent Public Sales Funnel implementation is authorized by this partial result. Re-run the remaining browser checks in an environment with native file-chooser access and adjustable desktop/tablet viewports before closing Admin E2E.
