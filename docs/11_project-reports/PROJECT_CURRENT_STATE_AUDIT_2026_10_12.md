# Góc Trọ — Full Project Current-State Audit

**Ngày audit:** 2026-10-12  
**Phạm vi:** SmartRentalManagement và nguồn tài liệu/cơ sở dữ liệu kề bên `GocTro-SmartBuilding`  
**Loại:** Read-only audit; không sửa source, canonical docs hay database; không chạy migration, seed, reset, `prisma db push/pull`, commit hoặc push.  
**Runtime:** Local Windows; PostgreSQL `Goctro_test3`; kết quả kiểm tra ghi trong báo cáo là snapshot tại thời điểm audit, không phải cam kết service luôn tiếp tục chạy.

## 1. Tóm tắt cho kỹ sư tiếp nhận

- **Database hiện tại:** Database V1.6, PostgreSQL 18.6, `Goctro_test3`, 28 public tables. Đây là baseline `LOCK` cho local/development; V1.5 là historical locked predecessor. Không có bằng chứng trong lượt này về việc áp dụng V1.6 lên staging/production.
- **Prisma:** `database/schema.prisma` là mapping V1.6 hiện hành; `prisma validate` PASS. Report triển khai V1.6 ghi `prisma generate` PASS. Runtime DB có 6 Account, tất cả có số điện thoại, đều theo dạng `+84…`; không có số trùng. 14 Resident hiện chưa có `avatar_storage_key` khác NULL.
- **Migration gần nhất:** `Database V1.6/migrations/V1_5_to_V1_6_resident_avatar_account_phone.sql`; report V1.6 ghi migration/fingerprint preservation và validator 97/97 PASS. Full dump mới nhất còn trong thư mục backup là **pre-V1.6**, không thấy full dump hậu migration; sau migration có file fingerprints.
- **Backend V1 đã mount:** Auth, Property/Room, Room Images, Public Marketplace, Resident/Occupancy, Contract/Contract Documents, Invoice/Zalo. V1 router thực tế không mount Payment, Amenities, Parking, Complaints, CT01, Notifications hoặc dashboard/report API.
- **Frontend đã nối V1:** public marketplace; Auth; Admin Property/Room/Room Images; Resident/Occupancy; Contract. Invoice/Amenities/Booking/Complaints/Accounts và một số trang cũ vẫn gọi `/api/...` unversioned.
- **“Đã migrate” không đồng nghĩa “đã hoàn chỉnh”:** Invoice/Zalo có API/repository/test nhưng pricing và provider vẫn fail-closed/chưa cấu hình; Admin Invoice hiện gọi endpoint đã retire 410; Resident Portal chưa có Invoice UI; do đó Billing không dùng được đầu-cuối.
- **Tests lần audit:** Backend domain suites 309/309 PASS; Frontend API tests 26/26 PASS; Frontend typecheck/build PASS. Backend project typecheck FAIL với 174 TypeScript diagnostics, đều từ phần legacy trong `backend/src/app.ts`; lọc lỗi liên quan các trường V1.6 được thêm (avatar/phone) có 0 kết quả.
- **Runtime:** `/api/health`, `/api/health/db`, `/api/v1/auth/csrf` đều HTTP 200; Frontend `/` HTTP 200. Thời điểm kiểm tra port 3000/4000/5432 lần lượt do Next dev, backend Node và PostgreSQL chiếm giữ.
- **Resident development:** dừng ở foundation hiện có sau V1.6 theo chỉ đạo; không tiếp tục invitation, thiết lập mật khẩu, `/me/profile`, avatar upload hay Resident Portal E2E.

### Trạng thái tổng quan

| Module | DB | Backend | Frontend | Runtime/E2E | Trạng thái |
|---|---|---|---|---|---|
| Auth / Account | Có | Auth V1 có; quản trị account chưa migrate | Login V1; màn Accounts còn legacy | Auth/CSRF đã smoke local; Account admin chưa | **G — Partial** |
| Property | Có | V1 CRUD/list/filter, owner scope | Nối V1 | Local Admin E2E lịch sử PASS; còn một số DoD gaps | **G — Partial** |
| Room | Có | V1 CRUD/list/filter/capacity | Nối V1 | Local Admin E2E lịch sử PASS; full DoD chưa đóng | **G — Partial** |
| Room Images | `room_images` + storage key | V1 upload/list/delete; local disk adapter dev | Gallery gọi V1 | Automated PASS; native file-picker/browser scenario còn thiếu | **G — Partial** |
| Public Room Marketplace | Có | V1 public listing/detail/contact + Admin inbox | Public pages/helpers gọi V1 | Automated PASS; full Admin/browser E2E còn giới hạn | **G — Partial** |
| Resident | Có, gồm avatar key nullable | Admin CRUD/search/detail V1; thiếu self-profile/avatar | Admin V1; portal một phần | 49 suite tests PASS; authenticated Resident browser E2E chưa đóng | **G — Partial** |
| Occupancy | `room_residents` | V1 add/end/transfer/list, capacity/tenant scope | Admin room panel dùng V1; portal rental read | Automated PASS; module report còn gap/partial | **G — Partial** |
| Resident Account Provisioning | Account/invitation schema | Chưa có V1 provisioning flow | Chưa có thiết lập tài khoản V1 | Chưa E2E; cố ý tạm dừng | **B — Database only** |
| Resident Portal | Có Resident/Contract/Occupancy | `/me/rental`, `/me/contracts`, detail/docs read | `/tenant` nối các luồng rental/contract | Chưa có Resident-auth final browser E2E | **G — Partial** |
| Contract | Có audit/revision/idempotency/document metadata | V1 lifecycle, history, renew/terminate | Admin + Resident contract screens gọi V1 | 132 automated PASS; authenticated full browser closure chưa | **G — Partial**; contract API §5.7 được lock riêng |
| Contract Documents | `contract_documents` | Metadata/version API; binary storage chưa cấu hình | UI có workflow | Storage thật trả unavailable/503; chưa E2E file | **G — Blocked** |
| Billing / Invoice | `invoices`, kỳ, readings, totals; không có `invoice_items` | Invoice V1 route/repository; pricing chưa cấu hình | Admin vẫn gọi `/api/invoices`; portal không có hóa đơn V1 | Tests PASS; finalize thật fail-closed; UI legacy nhận 410 | **G — Partial** |
| Meter Reading điện/nước | Các reading là cột trên Invoice/Contract | Draft Invoice cho phép cập nhật reading; không có meter-reading service riêng | Invoice UI chưa nối V1 | API tests có; chưa có luồng đọc/chốt meter hoàn chỉnh | **G — Partial** |
| Zalo Invoice Delivery | `invoice_zalo_oa_send_logs` | Service/log + provider interface; OA provider chưa cấu hình | UI Invoice chưa nối V1 | Tests với fake; gửi thật chưa | **G — Partial**; API contract LOCKED/DOCUMENTED |
| Payment | `payment_transactions`, `payment_session_id`; không có session table | Không có V1 payment route/provider/callback | Không có V1 payment UI | Chưa E2E; chưa migrate | **B — Database only** |
| Service / Amenities | Catalog + price history + subscription/cycles | Không có V1 service/API | Admin pages còn endpoint legacy | Không có V1 runtime flow | **B — Database only** |
| Amenity Subscription / Cycles | Có subscription/cycle và invoice relation | Không có V1 lifecycle API | Booking UI gọi legacy | Chưa E2E; không tích hợp thực vào Invoice | **B — Database only** |
| Parking | Areas/slots/assignment schema | Không có V1 API | Không có trang V1 | Chưa E2E | **B — Database only** |
| Vehicles | `vehicles` | Không có V1 vehicle API | Không có trang V1 | Chưa E2E | **B — Database only** |
| Complaints | `complaints`, `complaint_history` | Không có V1 complaint API; legacy maintenance endpoints còn trong app | Trang khiếu nại gọi `/api/maintenance-requests` | Không có V1 E2E | **B — Database only**; legacy UI chưa tương thích |
| Residence Registration / CT01 | Có trạng thái cư trú cần thiết trong Resident/Occupancy model | Không có CT01 export route | Không có V1 CT01 flow xác nhận từ source hiện tại | Chưa E2E; mẫu CT01 chính thức còn là open decision | **B — Database only** |
| Notifications | `notifications`, `notification_preferences` | Không có V1 notification delivery/API | Không có V1 screen/flow xác nhận | Chưa E2E | **B — Database only** |
| Reports / Dashboard | Dữ liệu nguồn có; aggregate không lưu riêng | Không có V1 `/dashboard/summary` mount | Chưa có dashboard V1 nối API | Chưa E2E | **A — Not started** |
| Foxi / AI | Không có V1 AI schema cần thiết | Không có V1 AI assistant | Mascot/chat chỉ nằm trong legacy/demo | Không có AI runtime | **A — Not started / out of V1** |
| OCR | Không có OCR workflow trong DB V1 | Không có OCR service | Không có OCR flow V1 | Không có OCR runtime; Requirement đưa khỏi V1 | **A — Not started / out of V1** |

**Ý nghĩa trạng thái:** A chưa bắt đầu; B chỉ có cấu trúc DB; C backend migrate; D backend + frontend nối; E local E2E xác nhận; F module được khóa; G một phần/bị chặn. Trạng thái trong bảng là tình trạng module toàn cục, không nâng lên F chỉ vì một hợp đồng API hoặc database riêng lẻ đã LOCK. `E2E` là kiểm tra từ giao diện/API qua persistence thật; unit/API tests không tự chứng minh E2E.

## 2. Kiến trúc repository

| Vị trí | Vai trò / công nghệ |
|---|---|
| `frontend/` | Next.js App Router, React, TypeScript. Public website ở `/`, `/rooms`, `/rooms/[roomId]`; Admin pages dưới `/admin/*`; Resident portal dưới `/tenant`. |
| `backend/` | Node.js + Express 5 + TypeScript; runtime qua `tsx` khi dev, TypeScript build cho backend. V1 route factories/service/repository được nhóm theo domain trong `backend/src/{auth,properties,room-images,public-marketplace,residents,contracts,contract-documents,invoices,zalo}`. |
| `database/` | Prisma 6.12 mapping tại `database/schema.prisma`; Prisma Client được sinh vào package backend. Không phải nguồn physical schema authority. |
| `../GocTro-SmartBuilding/Database V1.6/` | Source physical baseline kề bên: `schema.sql`, `erd.md`, `seed.sql`, `runtime_validator.sql`, migration V1.5→V1.6, README/changelog. |
| `../GocTro-SmartBuilding/docs/` | Canonical Requirement, API Spec, Database Changelog, function scope/matrix và reports về DB V1.6. |
| `backend/src/app.ts` | Mount V1 tại `/api/v1`, health routes, đồng thời còn các handler unversioned legacy/demo bên dưới. |
| `backend/.local-storage/` | Thư mục local file storage; `LocalRoomImageStorage` mặc định lưu ảnh phòng tại `.local-storage/room-images`. Contract binary storage chưa có adapter thật. |
| `legacy/` | Ứng dụng demo tĩnh cũ: `index.html`, scripts, `demo-database.json`, local/session storage và `server.js`; không phải Next frontend V1. |
| `backend/src/**/*.test.ts` | Node test runner + `tsx --test`, gồm domain tests và test route/repository/service; phần lớn test dùng fake repository/provider, không tương đương kiểm thử mọi thứ trên PostgreSQL/browser. |
| `frontend/src/lib/api/*.test.*` | Node test runner + `tsx --test` cho API client/helpers/workflow; không phải browser E2E suite. |

### Phân biệt hai app và persistence

- Next app tại `frontend/` là UI đang chạy ở `localhost:3000`; backend V1 ở `localhost:4000`; PostgreSQL ở `localhost:5432`.
- `legacy/index.html` chạy bằng `legacy/server.js` là demo cũ, với JSON/localStorage/sessionStorage. Nó giữ riêng dữ liệu mẫu trong `legacy/demo-database.json`; không được dùng làm bằng chứng PostgreSQL persistence cho app Next.
- Dữ liệu V1 Auth/Property/Room/Resident/Contract/Invoice/public listing đi qua `/api/v1` và Prisma/PostgreSQL khi module đó được nối. Các trang unversioned vẫn phụ thuộc legacy routes/Prisma models và không nên được hiểu là đã migrate.

## 3. Database, Prisma và baseline

### Baseline hiện tại

| Hạng mục | Kết quả |
|---|---|
| Database local | `Goctro_test3` |
| Engine/version | PostgreSQL 18.6, cổng 5432 |
| Physical version | Database V1.6; 28 public base tables |
| V1.6 status | `LOCK` cho local/development; không đồng nghĩa đã deploy production |
| Historical baseline | Database V1.5 là predecessor LOCKED lịch sử |
| Last migration artifact | `../GocTro-SmartBuilding/Database V1.6/migrations/V1_5_to_V1_6_resident_avatar_account_phone.sql`; migration report ghi đã áp dụng lên `Goctro_test3` |
| Validator | V1.6 runtime validator 97/97 PASS theo report V1.6; validator có 90 V1.5 checks populated-safe + 7 V1.6 checks. Không rerun validator trong lượt audit này |
| Prisma mapping | `database/schema.prisma` map physical V1.6; `npx prisma validate --schema ../database/schema.prisma` PASS trong lượt này; report V1.6 ghi `prisma generate` PASS |
| Current local data spot-check | 14 Residents / 0 avatar keys non-NULL; 6 Accounts / 6 phone values; 0 phone ngoài dạng `+84` + 9 số; 0 duplicate non-null phone groups; partial unique index `accounts_phone_nonnull_key` tồn tại |
| Backup | Full backup mới nhất tìm thấy: `.local/backups/Goctro_test3_pre_V1_6_20261012212224.dump` (169,905 bytes). Không tìm thấy full post-V1.6 dump; có `Goctro_test3_post_V1_6_20261012.fingerprints.json` làm bằng chứng fingerprint sau migration |

### V1.6 delta và giới hạn enforce

- `residents.avatar_storage_key` tồn tại nullable; partial unique index ngăn hai Resident dùng cùng non-null storage key. Dữ liệu live hiện chưa có avatar storage key.
- `accounts_phone_nonnull_key` unique cho phone khác NULL. Migration V1.6 chuẩn hóa số hiện hữu theo dạng mã quốc gia, bao gồm `0…` Việt Nam thành `+84…`; live check hiện tại không thấy số sai dạng hay trùng.
- DB unique index không tự chứng minh mọi input mới sẽ được canonicalize đúng; canonicalization phải được gọi trong luồng ghi account khi luồng đó được implement. Hiện chưa có Account management V1 API.
- Prisma biểu diễn phần lớn model/relation/index/composite FK. CHECK, partial indexes, triggers/invariants PostgreSQL và một số rule concurrency vẫn thuộc physical DB/backend transaction, không thể kết luận từ `schema.prisma` riêng.

### 28 public tables

`owners`, `properties`, `rooms`, `residents`, `accounts`, `account_invitations`, `contracts`, `contract_change_history`, `contract_documents`, `contract_idempotency_requests`, `room_residents`, `invoices`, `payment_transactions`, `invoice_zalo_oa_send_logs`, `amenities`, `amenity_price_history`, `amenity_subscriptions`, `amenity_subscription_cycles`, `parking_areas`, `parking_slots`, `vehicles`, `parking_slot_assignments`, `complaints`, `complaint_history`, `contact_requests`, `notifications`, `notification_preferences`, `room_images`.

### Alignment matrix: physical DB ↔ Prisma ↔ repository

| Domain | Physical DB / Prisma | Backend repository alignment |
|---|---|---|
| Auth / account login | `accounts`, `owners`, sessions | Auth V1 repository dùng models V1; login runtime smoke đạt. Quản trị/tạo account legacy chưa map V1 flow. |
| Property / Room | owner-scoped composite relations | Prisma PropertyRoom repo dùng V1 fields, FE gọi V1. |
| Room Images / Marketplace | V1.4 room images + public fields | V1 repositories/storage public endpoints có mặt. |
| Resident / Occupancy | owner-scoped Resident, `room_residents`, account relation | V1 resident repository dùng schema hiện hành; avatar key chưa có route storage upload. |
| Contract | V1.3 audit/revision, V1.5 idempotency, documents | Contract repository và durable idempotency dùng schema V1; file binary storage chưa configured. |
| Invoice / Zalo | invoice period + transaction/send-log data | Invoice repo dùng V1 schema; adapter pricing/Zalo không configured. |
| Payment/Amenities/Parking/Complaints/Notifications | Các bảng V1 có trong Prisma | Chưa có V1 domain repositories/routes tương ứng. |
| Legacy endpoints | Không còn model đích tương ứng trong Prisma V1.6 | `app.ts` vẫn tham chiếu `tenant`, `userAccount`, `leaseContract`, `contractExtension`, `contractTermination`, `payment`, `amenityBooking`, `roomViewingRequest`, `maintenanceRequest` và legacy field/enum. Đây là nguồn của phần lớn type errors. |

## 4. V1 routes thật và V1.6/Prisma typecheck

`backend/src/auth/v1.router.ts`, được mount dưới `/api/v1`, hiện mount:

- Auth/session/CSRF.
- Property + Room.
- Room Images.
- Public rooms, public contact request và Owner-scoped contact request inbox.
- Resident + Room Occupancy, bao gồm `/me/rental`.
- Contract lifecycle/history/idempotency + Contract Documents.
- Invoice + Zalo send-log operations.

Không thấy V1 router cho Account invitations/provisioning, Payment, Amenities/subscriptions, Parking/vehicles, Complaints, CT01, Notifications hay Dashboard.

`npm run typecheck --workspace=@goctro/backend` được chạy trong lượt audit: **EXIT 2, 174 TypeScript diagnostics**. Ví dụ lỗi đầu tập trung `backend/src/app.ts` gọi Prisma legacy `userAccount`, `tenant`, `leaseContract`, đồng thời dùng ID `string`/field `id` không khớp V1 `BigInt`/`propertyId`/`roomId`. Lọc diagnostics có `avatarStorageKey`, `accounts_phone_nonnull_key` hoặc `phone` trả **0**; không có bằng chứng type mismatch do V1.6 delta. Đây là lỗi compile của legacy compatibility/routes, không phải kết quả `prisma validate`.

Không chạy backend build riêng trong lượt audit; typecheck đã chứng minh project-wide TS build gate hiện không sạch. Không sửa hoặc tắt legacy code trong task này.

## 5. Module inventory chi tiết

### 5.1 Auth / Account

- **Database:** `accounts`, `owners`, `account_invitations`; V1.6 thêm unique phone non-null.
- **Backend:** Auth V1 có session, CSRF, login, `/auth/me`, logout; account lookup/password/session dùng V1. Quản trị account/invitation, password setup và provisioning cư dân chưa có V1 routes.
- **Frontend:** login V1 dùng `/api/v1`; `/admin/accounts` vẫn gọi `/api/admin/accounts` và `/api/tenants` unversioned.
- **Runtime:** `/api/v1/auth/csrf` trả 200 hiện tại. Auth suite 20/20 PASS; Auth completion report ghi local Admin login E2E. Không coi điều đó là E2E của Account management hoặc Resident login.
- **Gap/status:** Tách Auth login đã chạy khỏi Account admin/provisioning. Toàn module **G Partial**.

### 5.2 Property / Room

- **Database:** Owner → Property → Room, capacity/rent/status và quan hệ contract/occupancy.
- **Backend:** V1 CRUD/list/filter/detail, owner scope, validation, trạng thái và capacity.
- **Frontend:** Admin pages/helpers gọi Property/Room V1 API; các đường cũ đã được retire 410.
- **Runtime:** module report ghi local Admin Property/Room core E2E; automated suite hiện 44/44 PASS. Báo cáo E2E nêu DoD chưa đóng trọn (ví dụ keyword search/pagination/browser scenarios còn giới hạn tại thời điểm report).
- **Gap/status:** Có thể dùng core flow local/dev nhưng không ghi “locked/full completion”. **G Partial**.

### 5.3 Room Images / Public Marketplace

- **Database:** `room_images` có trong V1.6; Marketplace dựa trên các field Property/Room và association ảnh.
- **Backend:** V1 admin image list/upload/bulk attach/delete/content, public room list/detail/image/contact, Admin inbox. Local dev dùng file system `.local-storage/room-images`; production adapter chưa được audit là configured.
- **Frontend:** `/`, `/rooms`, `/rooms/[roomId]` gọi public-room V1 helper; gallery quản lý ảnh gọi V1.
- **Runtime:** Room Images suite 21/21, Public Marketplace 7/7; report hiện hành ghi list/detail/contact có HTTP smoke; native picker/gallery authenticated host browser và full responsive matrix còn giới hạn.
- **Gap/status:** Automated/API tests không thay cho native file-picker + đầy đủ browser path; **G Partial**.

### 5.4 Resident / Occupancy / Resident Portal / Provisioning

- **Database:** `residents.owner_id`, `residence_status`, `avatar_storage_key`, `room_residents`, `account_invitations`, Account↔Resident relation; V1.6 avatar key nullable.
- **Backend:** Resident CRUD/search/detail/archive, room occupancy list/add/end/transfer, capacity checks, `/me/rental`, `/me/contracts` và contract reads. Không thấy account invitation delivery, password setup, `/me/profile`, avatar upload/storage API.
- **Frontend:** Admin Resident/Room occupancy pages nối V1; `/tenant` có Rental/Contract portal. Chưa có evidence về hóa đơn/thanh toán/dịch vụ cư dân nối V1.
- **Runtime:** Resident/Occupancy suite hiện 49/49 PASS. Report closure vẫn `PARTIAL` do Resident-auth browser E2E/list-label/privacy scenarios chưa được đóng đủ. Không tiếp tục Resident feature trong task này theo freeze direction.
- **Gap/status:** Resident data/occupancy foundation và một phần portal đã có; provisioning/self-service/avatar và authenticated resident E2E chưa làm. Provisioning riêng **B Database only**; Resident, Occupancy, Portal **G Partial**.

### 5.5 Contract / Contract Documents

- **Database:** Contract audit/revision/history, renewal lineage, documents metadata/version, idempotency.
- **Backend:** V1 create/edit/activate/renew/terminate/history; durable idempotency đã triển khai cho create/activate/renew/terminate; docs metadata routes có.
- **Frontend:** Contract Admin/Resident views có V1 API integration.
- **Runtime:** Contract suite 132/132 PASS trong audit. Contract report ghi authenticated Admin API lifecycle đã qua; Resident auth/privacy và full host-browser/responsive/a11y closure còn pending. Không nâng Contract lên LOCK toàn module vì §5.7 API contract riêng được harden/lock.
- **Storage gap:** `UnconfiguredObjectStorage` được wire trong `app.ts`; upload/read binary Contract Document không có object storage thật, nên request storage operation fail closed/unavailable (503/error). Metadata không đồng nghĩa tệp đã lưu.
- **Gap/status:** **Contract G Partial; Contract Documents G Blocked** cho binary lifecycle.

## 6. Billing / Invoice — audit kỹ

### Database

- Có `invoices` với `period_start/period_end`, due/finalized/status/revision, rent/electricity/water/service/total amount và reading columns.
- **Không có `invoice_items` table** trong 28 tables. Chi tiết tài chính nằm trong amount buckets của Invoice; không có ledger item rows độc lập.
- Meter readings điện/nước lưu thành các cột current/previous trên Invoice; Contract cũng giữ các reading ban đầu/cuối theo model. Không có bảng meter-reading history/service độc lập.
- Có relation Invoice → Contract, Owner/Property context; Contract nối Room và Resident occupancy. `payment_transactions` và `invoice_zalo_oa_send_logs` tham chiếu Invoice.
- Amenity subscription cycle có thể liên hệ hóa đơn theo schema, nhưng hiện không có V1 Amenity invoicing lifecycle.
- Có service amount field nhưng không có authoritative active tariff/rate configuration backend đã nối. Physical schema không cung cấp đủ bằng chứng rằng có giá điện/nước/dịch vụ dùng được cho finalize.

### Backend/API

- Invoice V1 routes được mount: list/detail; create draft; generate kỳ đủ điều kiện; update meter readings trên draft; finalize; yêu cầu gửi Zalo; đọc send logs.
- Repository là Prisma V1 và có logic tính kỳ neo từ `contracts.start_date`, anniversary clamp/no-drift, kết thúc sớm dùng `termination_date`, normal expiry dùng `end_date`, overdue derived; unit/service tests cover các quy tắc này.
- Trạng thái Invoice lưu là `draft`, `unpaid`, `paid`; overdue là derived. Invoice endpoint không tự đánh dấu paid; Payment chưa migrate.
- Generate là API operation retry-safe, nhưng không có production scheduler/queue thực để tự tạo invoice theo lịch.
- `app.ts` wire `UnconfiguredInvoicePricing`; adapter trả null. Finalize vì vậy fail-closed (không tự bịa giá, không chuyển draft sang unpaid) cho tới khi có pricing service đáng tin cậy.
- Invoice suite **36/36 PASS** kiểm tra validation, billing periods/final boundaries, repository/routes, Zalo service với test doubles. Đây không chứng minh pricing production, scheduler, PostgreSQL race/concurrency integration hoặc external Zalo delivery.

### Frontend / Zalo

- `/admin/invoices` đang dùng `DataManagement` với endpoint `/api/invoices` unversioned. `backend/src/app.ts` trả endpoint này **410 ENDPOINT_RETIRED** để thay bằng `/api/v1/invoices`.
- `/tenant` không có Invoice/Payment V1 screen/helper path hiện tại. Vì vậy cả Admin UI và Resident invoice/payment self-service bị đứt ở frontend.
- `UnconfiguredZaloProvider` được wire vào thật runtime; API/service/send-log abstraction có nhưng provider/queue OA không configured. Test fake chỉ lưu job trong memory; không phải Zalo OA send.
- `invoice_zalo_oa_send_logs` lưu trạng thái/log, không thể chứng minh người nhận đã nhận tin.
- OCR chưa có implementation: không thấy meter image upload → OCR parse → review/approval → reading write flow; không có OCR route/service. Requirement đặt OCR ngoài V1.

**Kết luận: `BILLING MIGRATION STATUS = PARTIAL`.** Invoice backend/API đã migrate sang V1/PostgreSQL mapping, nhưng người dùng chưa có luồng Invoice V1 trên frontend; finalize chưa tính được tariff; tự động tạo theo lịch, complete billing UI, provider Zalo thật và payment status transition chưa có. Không nên diễn đạt là “Billing fully migrated” hoặc “Invoice end-to-end PASS”.

## 7. Payment — audit kỹ

- **Database:** `payment_transactions` lưu từng attempt; `payment_session_id` UUID nhóm nhiều attempts. Không có `payment_sessions` table riêng. Có invoice relation/provider identifiers/status/idempotency-related uniqueness trong physical schema.
- **Backend:** Không có `payments` route/service/repository được mount; không có callback/webhook verify pipeline; không có provider client/signature configuration; không có application transition transaction success → Invoice `paid`.
- **Frontend:** Không có V1 checkout/payment UI; Invoice screen hiện là legacy.
- **Provider:** Không tìm thấy MoMo/ZaloPay runtime adapters; payment session rules trong Requirement/API spec chưa đồng nghĩa provider đã tích hợp.
- **Runtime:** Chưa có E2E transaction/callback/payment → Invoice.

**Kết luận: `PAYMENT MIGRATION STATUS = DATABASE ONLY`.** Trước payment cần một Invoice V1 finalize path tạo outstanding amount đáng tin cậy. Sau đó implement session/attempt orchestration, provider security/callback/reconciliation và UI. Database không tự đảm nhận các việc đó.

## 8. Service / Amenities — audit kỹ

- **Database:** `amenities`, `amenity_price_history`, `amenity_subscriptions`, `amenity_subscription_cycles`; cycle/price snapshots theo decisions V1.1+.
- **Backend:** Không có Amenity route/repository/service V1 mount. Invoice pricing unconfigured nên amenity charges chưa được nối vào finalized Invoice.
- **Frontend:** `/admin/amenities` gọi `/api/amenities`; `/admin/bookings` gọi `/api/amenity-bookings` qua legacy generic `DataManagement`, không gọi V1.
- **Runtime:** Không có V1 flow subscription, cycle renewal/cancel, pricing update, Resident signup hoặc persisted use history.

**Kết luận: `SERVICE / AMENITIES MIGRATION STATUS = DATABASE ONLY`.** Schema đã chứa domain nhưng UI/API hiện không chạy trên DB contract này.

## 9. Parking — audit kỹ

- **Database:** Có `parking_areas`, `parking_slots`, `vehicles`, `parking_slot_assignments`; khóa/partial unique indexes có ràng buộc slot và assignment đang active. Quan hệ owner/property/room/resident đủ dữ liệu cho backend validation; schema/report V1 đã quy định giới hạn theo sức chứa Contract.
- **Backend:** Không có Parking/Vehicle V1 module routes/repositories hoặc assignment transaction/concurrency command path. Constraint DB là last guard nhưng không thay application workflow kiểm tra capacity/contract.
- **Frontend:** Không thấy Parking/Vehicle V1 app route/API helper.
- **Runtime:** Không có assign/revoke/capacity update E2E; không có camera/ANPR trong V1 core (không tính thành gap V1).

**Kết luận: `PARKING MIGRATION STATUS = DATABASE ONLY`.**

## 10. Requirement và API contract ≠ implementation

| Domain | Defined in Requirement / API | Implemented in current source |
|---|---|---|
| Auth + multi-tenant | Có | Auth V1 và owner scope có; Admin Account management/invitations chưa migrate |
| Property/Room | Có | V1 backend + FE, core local E2E evidence |
| Resident/Occupancy | Có | Một phần V1 API/UI; account provisioning, avatar/self-service và full Resident E2E còn thiếu |
| Contract | Có | V1 backend + FE; document binary storage và full E2E còn thiếu |
| Billing/Invoice | Có kỳ, lifecycle, finalization và security contract | V1 backend logic/tests; FE còn legacy; pricing/scheduler incomplete |
| Payment | Có MoMo/ZaloPay/session/callback rules | DB attempt table only; no provider/backend/frontend |
| Zalo OA | Có send/log behavior | Service abstraction/log có; real OA provider/queue chưa cấu hình |
| Amenities | Có catalog/subscription/30-day cycle/price history | DB only; no V1 routes/UI connection |
| Parking/vehicles | Có slots/assignment/capacity rules | DB only; no V1 routes/UI |
| Complaints/CT01/Notifications | Có spec/rules | DB records partly present; no V1 workflows; CT01 official form/provider details remain open |
| OCR/Foxi AI | Requirement ghi out of V1 | Không có V1 implementation; mascot trong legacy/demo không phải AI |

### Canonical document status mismatches discovered (not edited)

- `../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` header names Database V1.6 but its opening “Database alignment” still claims V1.5 is current and Prisma V1.5 is current. Section 9 Contract text also calls V1.3 the current development baseline. Both conflict with V1.6 report, live database and current Prisma mapping.
- `../GocTro-SmartBuilding/docs/04_API_SPEC.md` header says V1.6 Prisma generation is pending, V1.5 remains locked/current, and V1.6 is not LOCKED; §1/source-of-truth and implementation-gate wording repeats V1.5 as current. This conflicts with V1.6 runtime report and the `prisma validate` result in this audit. Historical V1.5 references are valid only when labelled historical.
- These canonical files were inspected but intentionally **not changed**. Treat the actual Database V1.6 artifacts and migration report as current physical baseline, and reconcile those stale metadata paragraphs in a separately authorized documentation-only pass.

## 11. Migration history and last domain

Sequence supported by current module migration reports, baseline artifacts and existing source:

```text
Database/Auth foundation
        ↓
Property + Room API V1.2
        ↓
Room Images + Public Marketplace (Database V1.4)
        ↓
Resident + Occupancy API V1.2
        ↓
Contract API V1.3 + durable Contract idempotency (Database V1.5)
        ↓
Invoice + Zalo OA API migration/hardening (V1 routes; no real pricing/OA provider)
        ↓
Database V1.6 Resident avatar key + Account phone uniqueness/canonicalization
```

**Last business domain with V1 backend migration code present: Invoice + Zalo OA.** It is not the last fully completed module: adapters and UI are incomplete as detailed above. **Last physical database version applied: V1.6.** Resident provisioning/self-service remained paused after the V1.6 schema change; do not infer implementation from the table columns. Property/Room is the strongest local Admin core E2E completion evidence, though its project report leaves some DoD items open.

The requested order Billing → Payment → Amenities → Parking has no discovered hard dependency that forces a different order. It does have practical prerequisites: invoice pricing/finalization must produce a trustworthy payable amount before Payment can settle it; amenity invoice integration depends on pricing/finalization; parking rules depend on Contract/Occupancy resident capacity that already exists. Therefore close Billing first, then Payment, then Amenity lifecycle/invoice integration, then Parking.

## 12. Legacy dependency audit

| Classification | Evidence / examples | Effect |
|---|---|---|
| **USED — V1** | `/api/v1` modules above; modern `apiClient` defaults to `NEXT_PUBLIC_API_BASE_URL` (`http://localhost:4000/api/v1`); Auth uses session cookie/CSRF; V1 FE helpers under `frontend/src/lib/api`. | Current supported integration path for migrated domains. |
| **USED — stale frontend consumer** | Admin Invoice → `/api/invoices`; Amenities → `/api/amenities`; Bookings → `/api/amenity-bookings`; Complaints → `/api/maintenance-requests`; Accounts → `/api/admin/accounts` + `/api/tenants`. Generic `DataManagement` directly fetches unversioned `NEXT_PUBLIC_API_URL` (`http://localhost:4000`) rather than V1 `apiClient`. | These screens are not wired to V1 domain APIs. Invoice specifically reaches a retired route (410); other paths invoke legacy handlers/models. |
| **USED — legacy backend handlers** | `backend/src/app.ts` retains unversioned auth/admin/property/tenant/room/contract/invoice/amenity/viewing/maintenance handlers using old Prisma model names, role names and scalar IDs. | Produces typecheck failure; creates a runtime integration trap for stale UI. |
| **RETIRED** | `/api/properties`, `/api/rooms`, `/api/contracts` return 410; `/api/invoices` returns 410 and points callers to V1. | Old callers must move to the V1 equivalent; endpoints are not silently compatible. |
| **REFERENCE ONLY** | `legacy/index.html`, `legacy/server.js`, `legacy/demo-database.json`, legacy JS/wireframes/Foxi. | Demo/reference persistence only; separate from current PostgreSQL-backed Next/V1 flows. |
| **MOCK / unconfigured adapter** | `UnconfiguredInvoicePricing`, `UnconfiguredZaloProvider`, `UnconfiguredObjectStorage`; fake providers/storage in tests. | Fail-closed/external delivery unavailable; tests using fakes do not show production integration. |
| **DEAD/UNKNOWN** | No static proof that every old unversioned handler or legacy asset is called by a deployed user flow. | Retained code is not deleted or adjudged fully dead in this read-only pass. |

## 13. Runtime and test inventory

### Live checks executed in this audit

| Check | Result |
|---|---|
| PostgreSQL read-only SELECT | PASS: `current_database()=Goctro_test3`, PostgreSQL 18.6, server port 5432; public base table count 28 |
| V1.6 field/index spot-check | PASS: Resident avatar column present; Account phone partial unique index present; counts/canonical format/duplicates as stated in §3 |
| `/api/health` | HTTP 200 |
| `/api/health/db` | HTTP 200 |
| `/api/v1/auth/csrf` | HTTP 200 |
| Frontend `/` | HTTP 200 |
| Current listeners | 3000 Next Node PID 17064; 4000 backend Node PID 14156; 5432 postgres PID 6252 (recorded only; not stopped) |
| Prisma validate | PASS: `npx prisma validate --schema ../database/schema.prisma` |
| Frontend typecheck | PASS |
| Frontend production build | PASS |
| Backend project typecheck | **FAIL, 174 TS diagnostics**; legacy `app.ts` references old models/fields/IDs; 0 diagnostics matched V1.6 avatar/phone terms |
| Backend production build | Not separately run; typecheck failure means no clean project-wide compile claim |
| V1.6 runtime validator | Not rerun in audit; current source report records 97/97 PASS |
| Authenticated browser flow in this audit | Not run; GET health/page status is not browser E2E |

### Automated test suites executed

| Backend suite | Result | What it exercises / what it does not prove |
|---|---:|---|
| Auth | 20/20 PASS | CSRF/session/login/authz and repository/service contracts with test fixtures; separate from full end-user role/account admin coverage |
| Property / Room | 44/44 PASS | V1 routes/repository behavior, validation, owner scope, status/capacity/filter/pagination; not a full new browser session |
| Resident / Occupancy | 49/49 PASS | Resident/occupancy API contracts, tenant scope/privacy, capacity/transfer/archive; not Resident account setup/final Portal browser E2E |
| Room Images | 21/21 PASS | Storage/repo/routes and validation; unit/local adapters do not prove hosted object storage |
| Public Marketplace | 7/7 PASS | Public listing/contact and Admin inbox route behavior; not every browser/responsive/Admin interaction |
| Contract | 132/132 PASS | Contract validators/repository/routes/idempotency/doc service tests; fake storage does not prove binary production storage |
| Invoice / Zalo | 36/36 PASS | Billing periods/lifecycle validation, repository/routes, Zalo logging behavior with fake provider; does not prove tariff, schedule, payment, or external OA |
| **Backend total** | **309/309 PASS** | Domain suite result only; coexists with project-wide typecheck failure |
| Frontend API | 26/26 PASS | Shared API client/helpers/document/image workflow contracts; not page-wide browser E2E |

### Current host runtime ≠ all module E2E

The current services are reachable. Earlier module reports contain targeted browser and local API E2E evidence for selected Admin Property/Room, public funnel, Contract and Resident/Occupancy flows, with explicit limits. This audit did not repeat authenticated/destructive browser operations. Treat each report’s dated scope/limitation as binding; the current HTTP 200s alone only prove listeners/responders are healthy.

## 14. Exact frontend → backend chain status

| Screen/flow | Chain | Result |
|---|---|---|
| Login | `/login` → V1 auth helper/apiClient → `/api/v1/auth/*` → Auth repository → PostgreSQL | Connected; live CSRF 200 and previous Admin local login E2E report. |
| Property/Room | `/admin/properties`, property rooms → V1 property/room helpers → `/api/v1/properties/*`, `/rooms/*` → Prisma repos → PostgreSQL | Connected; local core Admin E2E evidence. |
| Room Images | Admin gallery → V1 room image helper → `/api/v1/properties/.../images` → Prisma + local filesystem storage | Connected in local/dev; browser native picker/production storage limits remain. |
| Public Marketplace | `/`, `/rooms`, `/rooms/[roomId]` → `publicRoomApi` → `/api/v1/public/rooms*` → Marketplace repository → PostgreSQL | Connected; HTTP/route tests pass. |
| Resident/Occupancy | `/admin/tenants`, room resident panel, `/tenant` → V1 resident/occupancy helpers → `/api/v1/residents`, `/rooms/:id/residents`, `/occupancies`, `/me/rental` → Resident repo → PostgreSQL | Connected for implemented flows; account provisioning/avatar/resident final browser E2E missing. |
| Contract | Admin/tenant Contract screens → V1 Contract helper → `/api/v1/contracts*`, `/me/contracts` → Contract repo/idempotency → PostgreSQL | Connected for supported lifecycle; binary docs depend on unavailable storage. |
| Admin Invoice | `/admin/invoices` → generic DataManagement → `GET /api/invoices` → explicit 410 | **Broken integration:** route is retired; V1 invoice helper is not used by this page. |
| Resident Invoice | `/tenant` → no invoice V1 page/helper → no request | **Missing** |
| Amenities/Bookings | Admin pages → `DataManagement` → `/api/amenities`, `/api/amenity-bookings` → legacy handlers/models (not V1) | **Legacy path** |
| Complaints | `/admin/complaints` → `DataManagement` → `/api/maintenance-requests` → legacy MaintenanceRequest model | **Legacy path; not V1 complaints** |
| Accounts | `/admin/accounts` → direct fetch → `/api/admin/accounts`, `/api/tenants` → legacy handlers/models | **Legacy path; not V1 account administration** |
| Payment/Parking/CT01/Notifications | No current V1 FE/API chain | **Missing** |

## 15. Requirement coverage mapping

Requirement and API Spec establish intent/contracts; code, DB and runtime evidence determine implementation status.

| Requirement domain | Defined? | Implementation conclusion |
|---|---|---|
| Auth, roles, tenant isolation | Yes | Auth V1 implemented and smoke verified; account management/invitations partial. |
| Property/Room, occupancy/capacity | Yes | Implemented V1 core; selected local E2E; outstanding module gaps remain. |
| Resident profile/registration status | Yes | Resident V1 and status data exist; self-service/avatar/account setup not done. |
| Contract lifecycle, audit/revision | Yes | Backend + FE V1, strong automated coverage; full authenticated browser/storage closure partial. |
| Invoice periods, due/overdue, meter readings, finalization | Yes | Backend behavior/tests exist; no usable FE V1, pricing unconfigured, no scheduler. |
| Payment sessions/providers/callbacks | Yes | Physical attempt data only; no provider/payment implementation. |
| Zalo OA send/log | Yes | Log and provider boundary exist; external OA is unconfigured. |
| Amenity catalog/30-day subscription/price history | Yes | Database model only; no V1 workflow or Invoice pricing connection. |
| Parking/vehicles/capacity/slot rules | Yes | Database model/constraints only; no V1 API or UI flow. |
| Complaints, CT01, notification | Yes | Schema/spec only or partly represented; no V1 business route/FE workflow. CT01 official form remains unresolved. |
| Foxi AI, OCR | Explicitly outside V1 | No V1 backend; any mascot/demo code is not an AI implementation. |

## 16. Recommended next task/order

**Exact next task:** `GÓC TRỌ — BILLING / INVOICE V1 CURRENT-STATE GAP CLOSURE PLAN + APPROVED PRICING DECISIONS`.

Recommended sub-order:

1. Keep Resident frozen. Resolve the remaining Invoice inputs required for a truthful finalization: authoritative rent/utility/service tariff source and any service charge policy, invoice generation cadence/operations, and whether/when a controlled amendment/revision workflow is needed. Do not invent rates in code or let the client submit totals.
2. Implement/configure the approved Invoice pricing/calculation path and scheduled/manual generation behavior around the existing locked DB/API rules; add PostgreSQL integration for idempotency/concurrency if required by the completion gate.
3. Migrate Admin Invoice UI from retired `/api/invoices` to existing V1 helpers, add Resident invoice read UI, and verify `draft → finalized/unpaid → overdue derived` against Goctro_test3/local test setup without running a seed/migration as part of this audit.
4. Configure real Zalo OA delivery/queue or explicitly keep that delivery adapter blocked while preserving audit send logs.
5. Close Billing E2E and lock its implementation baseline. Then begin Payment: Payment needs finalized, priced Invoice outstanding balance and a well-defined transition to paid.
6. Continue in requested sequence: Payment → Amenities (including Invoice/cycle integration) → Parking (using Contract/Occupancy capacity rules). No evidence in this audit requires changing that order.

This recommendation aligns with the V1.6 migration report’s stated next task: Billing/Invoice current-state audit + migration gap check; this audit performs that gap check and identifies pricing + frontend integration as the main next closure items. It does **not** authorize or perform implementation.

## 17. Sources and limits

### Sources read/inspected

- `docs/DOCUMENTATION_RULES.md`, `docs/DOCUMENT_CATALOG.md`.
- Canonical adjacent documents: `../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`, `04_API_SPEC.md`, `DATABASE_CHANGELOG.md`, function scope/matrix.
- `../GocTro-SmartBuilding/Database V1.6/{README.md,schema.sql,erd.md,seed.sql,runtime_validator.sql,migrations/V1_5_to_V1_6_resident_avatar_account_phone.sql}`.
- V1.6 migration report: `docs/03_database/DATABASE_V1_6_RESIDENT_AVATAR_ACCOUNT_PHONE_MIGRATION_REPORT.md`.
- Existing module reports under `docs/07_modules/{auth,property-room,public-marketplace,resident-occupancy,contract,invoice-zalo}/`.
- Current `backend/src/app.ts`, `backend/src/auth/v1.router.ts`, domain routes/repositories/adapters/tests; `database/schema.prisma`; frontend app routes, API helpers, Admin pages and `DataManagement`; legacy HTML/server/data files; local backup filenames.

### Limits

- Database checks in this audit were read-only SELECTs; no validator was rerun. The validator result is attributed to the V1.6 migration report.
- No authenticated browser flow or destructive UI operation was repeated. HTTP 200 proves route availability only.
- No external provider, object storage, Zalo OA, payment gateway, email/SMS, OCR or production environment was contacted.
- Test counts are the current commands executed during this audit; test pass does not erase backend typecheck failures or unimplemented modules.
- Report dates/status are snapshots; for a later implementation, recheck source, DB and service health rather than treating historical evidence as current forever.

## 18. Files changed

Only this audit report was created:

- `docs/11_project-reports/PROJECT_CURRENT_STATE_AUDIT_2026_10_12.md`

No canonical Requirement/API/database file, code, Prisma schema, migration, seed, existing report or catalog was modified.
