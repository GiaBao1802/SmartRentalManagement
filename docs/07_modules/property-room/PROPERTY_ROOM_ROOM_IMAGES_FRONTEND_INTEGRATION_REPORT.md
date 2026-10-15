# Góc Trọ — Property/Room Room Images Frontend Integration Report

- Date: 2026-10-11
- Status: **Admin frontend implementation complete; automated validation PASS; host browser/runtime smoke pending**
- Scope: Impact audit and Admin Property/Room Room Images integration for local/dev V1.4.
- Database/Prisma/backend business logic: not modified.

## 1. Executive summary

Integrated optional image selection into single and sequential bulk Room creation, added per-Room gallery management to the existing Room edit modal, and added typed Room Images API helpers. Multipart requests now preserve the browser-generated boundary while continuing to include the existing CSRF token and session cookies. Partial upload failures leave the Room and successful image associations intact and give the Admin a path to the Room gallery for retry.

The Admin list table has no thumbnail column. Images are available in create/bulk-create and the edit gallery as scoped. No public Room listing, detail, contact, cover field, or public gallery was wired.

## 2. Impact audit and prior frontend flow

### Single Room create

- Component/file: `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx`, `PropertyRoomsPage` and its create modal.
- Fields: room code, rent, area, default capacity, active/public flags and public description.
- Submit: `save()` sent a JSON create request through `roomApi.create`; on success it closed the modal and reloaded Room list/counts.
- API helper/error handling: `frontend/src/lib/api/roomApi.ts`; Room create errors remained in the modal; no image API helper or partial-image state existed.

### Bulk create

- `saveBulk()` already created each Room sequentially through `roomApi.create`.
- It tracked successful count and per-room failures but discarded created Room IDs; it had no image attachment step.
- Results were displayed in the create modal. There was no backend bulk Room endpoint.

### Room detail/edit and API

- No standalone Room detail route/component existed. Editing used the same modal opened from the Room table's “Sửa” action.
- That modal is the edit/gallery entry point. Existing `roomApi` helpers remain responsible for Room records; the new `roomImageApi` owns image list/upload/bulk-attach/reorder/cover/delete calls.
- Admin image content is displayed through the authenticated URL returned by the API with credentialed image loading. Storage keys and internal paths are not represented in frontend types or UI.

### Responsive/layout impact

- Kept the current Admin shell, Room table, tabs, form, modal and brand tokens. The modal already scrolls vertically and has a 92vh maximum height (94vh at the narrow breakpoint); its overlay is also scrollable.
- Picker previews and gallery cards use responsive grids, bounded 4:3 image frames and tappable actions. The Admin Room table remains unchanged, including its horizontal-scroll behavior.
- Browser viewport/layout smoke was unavailable in this environment; CSS behavior is not claimed as visually verified.

## 3. API and data mapping

Frontend type contains only the documented safe fields: `image_id`, `url`, `is_cover`, `sort_order`, `created_at`. Bulk outcomes map `file_index`, `status`, `association_count`, and safe `code` values. No storage key field is present.

Helpers use the backend Room Images routes:

- `GET /properties/{property_id}/rooms/{room_id}/images`
- `POST /properties/{property_id}/rooms/{room_id}/images` with multipart `file`
- `POST /properties/{property_id}/rooms/images/bulk-attach` with `room_ids` JSON and repeated `files`
- `PUT /properties/{property_id}/rooms/{room_id}/images/order` with the complete `image_ids` order
- `PUT /properties/{property_id}/rooms/{room_id}/images/{image_id}/cover`
- `DELETE /properties/{property_id}/rooms/{room_id}/images/{image_id}`
- Authenticated content GET uses the per-association URL returned by the list API.

The JSON API client previously set `Content-Type: application/json` for every request body. It now leaves `Content-Type` unset for `FormData`, allowing the browser to attach a correct multipart boundary. Existing credentials, CSRF bootstrap and error handling remain in the shared client.

## 4. Single-create integration

The one-Room form now includes an optional picker with previews, remove-before-submit, 0–5 count, JPEG/PNG/WebP hints, and a 5 MiB per-file hint. It does not transform images. The submit sequence is JSON Room create first, then one image upload per selected file in selection order.

Room create failure remains a Room form error. After a successful Room create, image requests are independent and sequential; there is no Room rollback. Full success returns to the list with a count. Partial failure reports successful/failed counts and selected filenames locally, converts the created Room into edit mode, and exposes its gallery so the Admin can upload replacements. The multipart request includes the browser-selected filename for content validation; the backend does not persist or return it as RoomImage metadata.

## 5. Bulk-create shared-image integration

The existing sequential create orchestration remains unchanged in shape. The UI now stores each successful server-issued Room ID and submits one bulk-attach request after all Room create attempts finish, only when at least one Room succeeded and at least one image was selected. Failed Room IDs are never sent. Zero successful Rooms skips image attachment.

The picker explicitly says “Ảnh dùng chung ban đầu”, explains that selected images apply to successfully created Rooms, and clarifies that later gallery edits are independent per Room. The result shows the Room create count/failures separately from per-file shared-image outcomes and association counts. A bulk endpoint failure is reported without undoing Rooms already created.

## 6. Room gallery and failure UX

The existing edit modal includes “Hình ảnh phòng” after Room fields. It loads the authoritative gallery, shows an empty state, ordered thumbnails, count, cover badge, authenticated content, upload picker capped to remaining capacity, set-cover, previous/next ordering, and confirmed association removal. Cover state is visible as text as well as color. Every mutation has pending/disabled controls and reloads authoritative gallery state; failed reorder restores/refetches order.

Broken content has a per-image fallback and does not hide Room fields. List/load errors have a retry action. Known capacity, retry-required, validation, oversized, storage, not-found and authentication cases receive safe user messages; raw SQL/Prisma information and storage details are never rendered. Delete wording removes an image from this Room and does not promise physical deletion.

## 7. Files changed in this pass

- `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx`
- `frontend/src/app/admin/properties/[propertyId]/rooms/room-image-gallery.tsx`
- `frontend/src/app/admin/properties/[propertyId]/rooms/room-image-picker.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/api/roomImageApi.ts`
- `frontend/src/lib/api/roomImageWorkflow.ts`
- `frontend/src/lib/api/apiClient.ts`
- `frontend/src/lib/api/apiClient.test.ts`
- `frontend/src/lib/api/roomImagePicker.test.tsx`
- `frontend/src/lib/api/roomImageWorkflow.test.ts`
- `frontend/package.json`
- `docs/DOCUMENT_CATALOG.md`
- This report.

## 8. Validation results

| Check | Result |
|---|---|
| Frontend typecheck | **PASS** — `npm run typecheck --workspace=@goctro/frontend` |
| Frontend API/picker/workflow tests | **PASS** — 12/12, including multipart route/CSRF/cookie behavior, picker 0/1/5/over-limit/type/size cases, Room-first upload, sequential upload with partial failure, sequential bulk Room create, successful-ID-only attachment and zero-success skip |
| Frontend production build | **PASS** — Next.js 16.4 production build |
| Room Images backend regression | **PASS** — 21/21 |
| Property/Room backend regression | **PASS** — 44/44 |
| Auth backend regression | **PASS** — 20/20 |
| Initial sandbox test/build attempts | Sandbox blocked ephemeral loopback with `EACCES` and SWC path canonicalization with `Access is denied`; the same validation commands were rerun on the host and passed. |

The current FE test setup uses Node's test runner and has no React DOM/component-rendering library. Picker validation, API contracts and create/upload orchestration are unit tested; gallery control rendering and interaction still require the pending browser smoke. Backend tests were read-only tests with their test fixtures/fakes; no database schema, seed, migration or backend source changes were made.

## 9. Browser/runtime smoke and limitations

At inspection, no listener was available on ports 3000 (frontend), 4000 (backend), or 5432 (PostgreSQL). No local V1.4 environment was available, and this pass did not start a server or create persistent smoke data. Therefore single/bulk creation against V1.4, refresh persistence, gallery upload/cover/reorder/delete in a live browser, image delivery, and visual checks at desktop/tablet/mobile sizes remain **not verified**. The implementation uses the already runtime-verified V1.4 backend routes, but that is not a substitute for this frontend browser smoke.

Source status note: the adjacent canonical API Spec's Room Images section still labels parts of that contract “proposed / implementation pending”, while the current backend implementation and runtime reports record the V1.4 APIs as implemented and runtime verified. This frontend pass used the exact route and DTO behavior in `ROOM_IMAGES_V1_BACKEND_IMPLEMENTATION_REPORT.md` and its tests; the canonical API Spec was not edited in this task.

## 10. Property/Room impact conclusion

Room Images are additive. Owner scope, Room search, filters, effective status, contract summary, occupancy/capacity, activation behavior and pagination were not changed. The Admin Room table does not gain thumbnails in this pass. Public Sales Funnel image fields/list/detail/contact remain out of scope.

## 11. Definition of Done

| Item | Status |
|---|---|
| Impact audit recorded | **DONE** |
| Single create with 0–5 optional images and no Room rollback | **IMPLEMENTED** |
| Bulk shared images target successful Room IDs only | **IMPLEMENTED** |
| Per-Room gallery load/upload/cover/reorder/delete | **IMPLEMENTED** |
| Partial image failures and retry path | **IMPLEMENTED** |
| Frontend typecheck, tests and build | **PASS** |
| Room Images / Property-Room / Auth regressions | **PASS** |
| V1.4 live browser flow, refresh persistence and visual smoke | **PENDING — no local services available** |

**Final module status:** `PROPERTY / ROOM + ROOM IMAGES FRONTEND — IMPLEMENTATION COMPLETE; MANUAL HOST-BROWSER SMOKE PENDING.` This does not claim end-to-end completion until the browser/runtime criteria are verified.

**Recommended immediate task:** run the Admin V1.4 host-browser smoke with an authenticated DEV Admin and disposable V1.4 data. After that verification, the next module named in the task plan is **PUBLIC SALES FUNNEL V1 BACKEND IMPLEMENTATION**, followed by its frontend pass.

