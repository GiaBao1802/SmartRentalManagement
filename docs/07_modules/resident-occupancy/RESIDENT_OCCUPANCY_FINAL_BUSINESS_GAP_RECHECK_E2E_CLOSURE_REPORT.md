# Resident / Occupancy Final Business Gap Recheck + Authenticated E2E Closure

**Ngày:** 2026-10-12  
**Trạng thái:** `PARTIAL — NOT LOCKED`  
**Phạm vi:** Recheck Requirement/API/backend/DB/frontend hiện hành; Admin Resident/Occupancy authenticated E2E; browser verification; Resident portal readiness.  
**Database:** Local `Goctro_test3`, PostgreSQL 18.6. Không chạy migration, seed hay sửa schema.

## 1. Kết luận

Các lifecycle cốt lõi phía Admin đã qua authenticated API E2E và browser E2E: tạo hồ sơ, sửa, tra cứu CCCD theo Owner, thêm cư dân, kiểm tra sức chứa, chuyển phòng atomic, kết thúc lượt cư trú, tính lại trạng thái, lưu trữ hồ sơ và giữ lịch sử. Kiểm tra Owner isolation và payload do client tự gửi cũng đạt.

Chưa thể đóng toàn bộ Resident/Occupancy vì chưa có cách provisioning/đặt mật khẩu V1 Resident an toàn để đăng nhập thật. Do đó chưa xác minh runtime `/me/rental`, privacy bằng session Resident, hay browser portal. Còn một sai lệch hiển thị nhỏ: list và nội dung hướng dẫn tạo mới gọi Resident không có lịch sử là “Đã rời đi”, trong khi detail phân biệt đúng “Chưa lưu trú”. Kết luận cuối: `PARTIAL / NO LOCK`.

## 2. Nguồn đối chiếu

- Canonical Requirement: `../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`, §§7, 16, 21.3.
- Canonical API Spec: `../GocTro-SmartBuilding/docs/04_API_SPEC.md`, §§2, 5.2, 5.5, 6–9.
- Current DB: `../GocTro-SmartBuilding/Database V1.5/schema.sql`.
- ORM mapping: `database/schema.prisma`.
- Backend: `backend/src/residents/`, `backend/src/auth/`, Contract termination code/tests.
- Frontend: Resident list/detail, Room resident panel, Resident API helpers, `/tenant` portal.
- Supporting reports: Resident business audit, API V1.2 migration, Pass 2 integration, Contract authenticated E2E closure.

## 3. Authority and stale audit reconciliation

Requirement §§7 and 21.3 now explicitly define `residence_status` as backend-derived from all active occupancy rows: at least one means `living`; none means `left`. New Resident without occupancy starts `left`; clients cannot set the field. The older business audit's statement that synchronization was unclear is stale and superseded by the current Requirement and implementation evidence.

The older audit also described missing Contract detail in Resident UI. Current source and Contract integration evidence show safe Contract summary/detail/document links are integrated. Full Contract lifecycle remains outside this Resident/Occupancy closure.

## 4. Requirement-to-implementation matrix

| Capability | Requirement / API | Backend / DB | Frontend | Verification | Classification |
|---|---|---|---|---|---|
| Owner-scoped Resident list/detail/create/update/archive | Required; §5.5 | Implemented with session Owner scope and soft archive | Integrated | Authenticated API + browser | PASS |
| CCCD exact search and privacy | Owner-only lookup; generic foreign/missing behavior | Query scoped by authenticated Owner; tenant unique key | Search helper integrated | Same-Owner duplicate and foreign detail/search checks | PASS |
| Occupancy add/end/history | Active/ended rows and history retained | Transactional routes/repository | Integrated in detail and Room panel | Admin API + browser | PASS |
| Transfer | Atomic source close and destination insert | Serializable transaction, capacity and Owner checks | Integrated | Valid and invalid transfer | PASS |
| Capacity | Active Contract snapshot, otherwise Room default | Enforced on backend | UI presents server result | Capacity boundary and slot-freeing transfer | PASS |
| Derived residence status | Backend-owned; client cannot set | Synchronized in occupancy transaction | Detail correct; list/copy discrepancy | API and UI | PARTIAL |
| Resident self rental | Resident-only `/me/rental` | Route and repository present | Portal integrated | Unit tests only; no Resident session | BLOCKED |
| Resident profile self-service | Requirement/API `/me/profile` | Route is not mounted | No verified working flow | Source audit | GAP — Auth/Self-service |
| Resident account provisioning | Account association and usable login required | No safe V1 enrollment/password setup route found | No usable path verified | Auth/runtime precondition | BLOCKER — Auth |
| CT01 registration/export | Requirement supports owner preparation | Separate registration workflow | Not part of occupancy UI | Source audit | SEPARATE DOMAIN |
| Vehicles/Parking | Separate domain dependency | Not implemented in this pass | Not tested | Scope audit | DEFERRED |
| Complaints | Separate domain | Not implemented in this pass | Not tested | Scope audit | DEFERRED |

## 5. Environment and database baseline

Read-only runtime check confirmed `Goctro_test3` on `localhost:5432`, PostgreSQL 18.6; `/api/health`, `/api/health/db`, Auth CSRF and frontend root returned HTTP 200. The database contains 28 public tables. Comparing the V1.5 SQL source, Prisma `@@map` table set and live catalog returned 28/28 matching table names. No schema drift was found.

No migration, seed, schema SQL, direct database mutation, or Prisma change was performed. Synthetic E2E profiles/occupancy were created only through authenticated application APIs/UI and then soft-archived / ended. Their historical rows remain in the local development database by design; they were not hard-deleted.

## 6. Authentication preconditions

Admin Auth V1 succeeded using the existing local Admin account after the user authenticated in the browser. Credentials and session secrets are omitted. Existing V1 Resident accounts were present, but no known valid plaintext password or supported provisioning/reset path was found. The legacy `DEV_TENANT_PASSWORD` applies to the legacy account model and is not evidence of a V1 Resident credential; it was not used or retried.

## 7. Admin authenticated API flow

The flow used GET CSRF → POST login → session cookie → GET `/auth/me`. The authenticated identity resolved to Admin, Owner 1. Mutations used normal API routes; no direct DB writes were used to simulate business behavior.

## 8. Resident CRUD and validation

Four synthetic residents (IDs 2013–2016) were created. Profile update and exact CCCD search succeeded. Same-Owner duplicate synthetic national ID returned 409. Client-supplied `owner_id` and `residence_status` on create, and attempted `residence_status` PATCH, were rejected with 400. Missing name, invalid synthetic CCCD and invalid phone were each rejected with 400 and persisted no invalid rows.

## 9. Owner scope and privacy

Foreign Owner Resident detail and cross-Owner occupancy/transfer requests returned generic 404. A foreign Room could not be used to add an occupancy. A failed cross-Owner transfer left the source occupancy active. Search behavior and same-Owner duplicate handling matched the Owner-scoped privacy contract; no global CCCD lookup was used.

## 10. Occupancy, capacity and transfer API E2E

The verified Rooms were 213 (capacity 2, Property 11) and 214 (capacity 1), both under the authenticated Owner; Room 211 was the foreign-owner fixture. Adding two Residents to Room 213 succeeded; a third returned 409 `ROOM_CAPACITY_EXCEEDED`. Transfer 213→214 ended the source and created the destination within one request, while status remained `living`. Freed capacity was then reusable. Ending the final active occupancy changed status to `left`; history remained available.

## 11. Multiple active Room behavior

Resident 2018 was successfully assigned active occupancy in Rooms 213 and 214 simultaneously. Ending only one kept `residence_status=living`; ending the final one changed it to `left`. This matches V1, which does not impose one active occupancy per Resident platform-wide. Both rows were retained as ended history afterward.

## 12. Archive behavior

Archive was rejected with 409 while an active occupancy existed. After all active occupancy rows ended, the four API fixtures and browser fixture could be archived. Archive preserved Resident and occupancy history; the UI refresh continued to show archived state.

## 13. Contract side effects

Source and Contract regression tests confirm Contract termination closes the Contract-linked occupancy rows in the same transaction and recomputes every affected Resident status from all remaining active occupancy. This report does not re-run or claim a full Contract lifecycle E2E.

## 14. Filter and pagination checks

The authenticated Resident list accepted residence and registration filters with pagination. A page-size-2 result returned matching records and metadata. Browser list controls rendered against real backend data without a generic load error.

## 15. Admin browser lifecycle

In the authenticated browser, `/admin/tenants` loaded the seeded Resident list. The UI-created fixture (Resident 2019) was added to Room 213, transferred to Room 214, ended, and archived. Success notices and refreshed server-backed data appeared at each step. After reload `/admin/tenants/2019` showed archived state, `left`, no active Room and two ended occupancy rows.

## 16. Detail residence labels

Resident detail correctly distinguishes `left` without history as “Chưa lưu trú” from `left` with ended history as “Đã rời đi”. Runtime browser evidence covered both cases (IDs 2016 and 2006 respectively).

## 17. List and create-copy discrepancy

The Resident list label map renders every `left` row as “Đã rời đi”; list response contains only active occupancy relations and does not expose a history-presence signal. Therefore a never-occupied Resident is mislabeled in the list. The new Resident modal helper text also says a new profile will be “Đã rời đi”, contradicting the detail's “Chưa lưu trú”. Do not infer history from `left` alone. This needs an explicit list-safe history signal or a neutral label, plus matching helper copy.

## 18. Resident portal and self-service

`GET /me/rental` route/repository and tests exist, and tests enforce Resident-self access / Admin denial. No valid V1 Resident session was available, so the route was not runtime-tested as Resident and `/tenant` could not be verified authenticated. API Spec also includes `GET/PATCH /me/profile`, but current V1 router does not mount those routes. These are Auth/self-service gaps, not evidence that Admin Occupancy state is incorrect.

## 19. Resident account provisioning blocker

Physical `account_invitations` exists, but no supported application route or verified out-of-band onboarding/password setup path is mounted for V1 Resident. Existing accounts alone do not provide a safe test credential. The next implementation should define Owner-scoped invitation/provisioning, verified token lifecycle and password setup/reset, then use the resulting real Resident session for `/auth/me`, `/me/rental`, privacy and portal E2E.

## 20. Responsive browser inspection

The available browser rendered the admin detail at a narrow mobile-like width. Content remained usable and the wide table scrolled inside its own container. Exact controlled 1440/768/390/360 viewport measurements were unavailable in the current browser tool, so this is a visual smoke only, not a full responsive matrix pass.

## 21. Accessibility smoke

Accessibility tree inspection found semantic headings, labeled form fields, table cell semantics, dialog role/`aria-modal`/`aria-labelledby`, textual status labels, semantic buttons, and alert/status notices. Keyboard focus trap/restore, complete keyboard-only traversal, and screen-reader behavior were not tested; no formal accessibility conformance claim is made.

## 22. Frontend automated checks

- Frontend typecheck: **PASS**.
- Frontend API tests: **26/26 PASS**.
- Frontend production build: **PASS**.

## 23. Backend automated checks

- Resident/Occupancy: **49/49 PASS**.
- Auth: **20/20 PASS**.
- Property/Room: **44/44 PASS**.
- Contract: **132/132 PASS**.
- Room Images: **21/21 PASS**.
- Invoice/Zalo: **36/36 PASS**.

Backend test suites initially could not open their temporary localhost listener in the restricted sandbox (`EACCES`); reruns in the permitted host environment passed. No test implementation was changed.

## 24. Backend typecheck and build

Both remain **FAIL** on pre-existing legacy Prisma references. There are 174 diagnostics: 173 in `backend/src/app.ts`, plus one test typing diagnostic in `backend/src/residents/resident.test.ts:256` (`ResidentCreate` has no `residenceStatus`). There are zero diagnostics in the Resident route/repository implementation. Build reports the same diagnostics. No backend source was modified in this closure pass.

## 25. Database and synthetic fixture cleanup

Schema, Prisma, migrations and seed were untouched. Synthetic Residents 2013–2016, 2018 and browser Resident 2019 are archived; all occupancy IDs 10–15 and browser-created history are ended. A read-only final check confirmed no active occupancy remained in Rooms 213/214. These local test history rows remain for auditability and were not deleted.

## 26. Gap classification

| Finding | Classification | Closure status |
|---|---|---|
| List/create copy conflates never-occupied with departed | Resident/Occupancy UI correctness | Open, small fix |
| V1 Resident account provisioning and usable credential absent | Auth/account onboarding dependency | Blocks Resident E2E |
| `/me/profile` spec route not mounted | Auth/self-service API gap | Open |
| `/me/rental` real authenticated runtime/browser unverified | Resident portal verification | Blocked by provisioning |
| CT01 registration/export | Separate residency-registration domain | Out of this core closure |
| Vehicle/Parking | Separate domain | Deferred |
| Complaints | Separate domain | Deferred |
| Legacy backend typecheck/build diagnostics | Cross-repository legacy migration debt | Existing; not introduced here |

## 27. Prior audit gap updates

The prior estimate of 66% was a dated source audit, not a current completion metric. Occupancy status synchronization is now specified and implemented; Contract detail integration is present. Those statements should not be carried forward as current blockers. The newly confirmed list/create label discrepancy and the Resident account/self-service gap remain open.

## 28. Files and scope

This pass changes documentation only: this report and its catalog row. Backend, frontend, DB schema, Prisma, migrations, seed and business logic were not modified. The local development DB does contain synthetic application-level E2E history described in §25.

## 29. Lock decision

Resident/Occupancy is **not locked as fully end-to-end complete**. Admin lifecycle and privacy gates pass, but the Resident authenticated portal gate is incomplete and the list/create status wording is inconsistent. Do not describe the whole domain as `LOCKED` based on Admin-only evidence.

## 30. Recommended next work

1. Correct the Resident list/create status wording using a reliable history signal or neutral label; do not infer “departed” from `left` alone.
2. Implement the approved V1 Resident account provisioning/self-service path, including secure credential setup and `/me/profile` contract support.
3. Run authenticated Resident API and browser E2E for `/auth/me`, `/me/rental`, own-profile privacy and portal refresh behavior.
4. Re-run focused Resident/Occupancy checks and reconsider lock only after those gates pass.

## 31. Completion gate summary

| Gate | Result |
|---|---|
| V1.5 schema/Prisma/live table inventory | PASS, 28/28; no drift |
| Admin Auth/session | PASS |
| Admin Resident lifecycle API | PASS |
| Admin browser lifecycle | PASS |
| Owner isolation/capacity/derived state | PASS |
| Resident authenticated API/browser | BLOCKED — no usable V1 credential/provisioning path |
| List/create status wording | PARTIAL — discrepancy documented |
| Frontend typecheck/API tests/build | PASS |
| Backend module regression suites | PASS |
| Backend global typecheck/build | FAIL — legacy diagnostics |
| Full Resident/Occupancy lock | NO |

## 32. Final status

**Resident / Occupancy: PARTIAL / NO LOCK.** Admin lifecycle behavior is verified against the current V1.5-backed local environment. The outstanding closure dependency is a supported Resident account onboarding path so the real Resident session and portal can be verified; fix the list/create “Chưa lưu trú” wording discrepancy as well. No schema changes or migrations are needed based on this audit.
