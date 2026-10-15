# SmartRentalManagement — Migration Gap Report

**Ngày audit:** 2026-10-07  
**Project:** `SmartRentalManagement/`  
**Target:** Góc Trọ Database/API V1.1 đã LOCK theo tài liệu root  
**Phạm vi:** Audit tĩnh source, Prisma schema, migrations, seed, route/query, frontend và legacy. Không chạy migration, không sửa code, không chạy database/test/build.

## Kết luận điều hành

Project là monorepo TypeScript: Next.js App Router + React ở frontend, Express 5 ở backend và Prisma 6/PostgreSQL ở data layer. Prisma đang được dùng thật cho schema, migrations, seed và phần lớn API data access; tuy nhiên schema hiện tại là **legacy/demo model**, không phải Database V1.1.

Project chưa có `owners` tenant root. `Property.ownerId` trỏ trực tiếp đến `UserAccount`; các role `ADMIN/LANDLORD/TENANT` thay cho `admin/resident`; `Tenant.nationalId` unique toàn database; occupancy, payment, amenity, parking, complaint và public contact đều còn mô hình cũ. Không được áp dụng ba migration hiện có lên database V1.1 LOCK như thể đó là migration chain tương thích.

**Ưu tiên P0:** xác lập mapping Owner/account/resident và data backfill; áp dụng đúng authorization theo Owner; loại global CCCD uniqueness; thay auth/session demo trước khi chuyển dữ liệu thật. Trong code hiện tại có Admin toàn hệ thống, hard-coded fallback `AUTH_SECRET`, thiếu CSRF guard và session không có server-side revocation.

Audit không đánh dấu module nào là `MIGRATED`. Một số UI gọi API PostgreSQL thật, nhưng các API vẫn dùng schema/rule legacy nên mức “đã kết nối API” không đồng nghĩa đã migrate theo V1.1.

## 1. Cấu trúc project

| Khu vực | Hiện trạng quan sát được |
|---|---|
| `frontend/` | Next.js App Router, React 19, TypeScript. Route cho landing, login, tenant portal và một số màn hình quản trị. Không thấy Tailwind trong dependencies; styling chính ở `src/app/globals.css`. |
| `backend/` | Node.js + Express 5 + TypeScript. `src/app.ts` chứa route, middleware, validation, query và business behavior chung trong một file; `server.ts` khởi động app; `lib/prisma.ts` tạo Prisma client. Không có thư mục router/controller/service/repository theo domain hoặc validation schema riêng. |
| `database/` | Prisma 6.12, `schema.prisma`, ba SQL migration cũ, seed TypeScript. `db:migrate` chạy `prisma migrate dev`; cấu hình Docker hiện là PostgreSQL 17, lệch target PostgreSQL 18. |
| `legacy/` | HTML/CSS/JS và JSON demo của ứng dụng cũ, assets Foxi/brand, wireframes role admin/user. Có `legacy:dev` để chạy server độc lập. README xác định Next là frontend active và legacy là reference; không thấy import legacy vào React active. |
| `docs/` | `02_architecture/DOMAIN_MODEL.md`, ghi chú chỉnh sửa và wireframe. `DOMAIN_MODEL.md` vẫn mô tả UserAccount admin/landlord/tenant, `ContractExtension`, booking theo giờ, `RoomViewingRequest`, `MaintenanceRequest`, localStorage và nhiều quyết định cũ; cần coi là tài liệu legacy, không phải chuẩn V1.1. |
| Root project | `package.json`, lockfile, Docker Compose, launch scripts, README. README mô tả ba demo roles, mật khẩu mặc định `123456`, route viewing requests và amenity bookings. |

**Framework / kiến trúc data:** Prisma không chỉ là dependency: Prisma schema ánh xạ trực tiếp các bảng cũ, migrations tạo chúng và `backend/src/app.ts` + `database/seeds/seed.ts` dùng generated client. Frontend gọi REST API thật bằng `fetch`, nhưng phần lớn gọi trực tiếp từ component; chưa có service/data-access layer tập trung.

**Migration history:** ba migration trong `database/migrations`; chưa có migration/schema V1.1 hoặc mapping từ schema hiện tại sang 25 bảng khóa. Seed hiện tại là dữ liệu dev legacy. `legacy/server.js` có thể chạy thủ công bằng `npm run legacy:dev`, nhưng README mô tả nó là app tham chiếu riêng, không phải frontend Next active.

**Đã xem:** [`README.md`](../../README.md), [`package.json`](../../package.json), [`schema.prisma`](../../database/schema.prisma), [`DOMAIN_MODEL.md`](../02_architecture/DOMAIN_MODEL.md), backend source và các trang React hiện có.

## 2. Prisma / Database gap audit

### 2.1–2.15 Các khác biệt cốt lõi

| Chủ đề | V1.1 target | Project hiện tại | Kết quả / tác động |
|---|---|---|---|
| Owner / tenant root | `owners` là tenant root; Admin → Owner; Resident → Resident → Owner | Không có model Owner. `Property.ownerId` nullable trỏ tới `UserAccount`; `LANDLORD` là owner. `ADMIN` có quyền platform-wide. | **P0 — MISSING.** Không có tenant root độc lập; phải tạo Owner và remap trước migration dữ liệu. |
| CCCD privacy | `UNIQUE(owner_id,national_id)`; cùng CCCD ở Owner khác nhau hợp lệ | `Tenant.nationalId @unique`; Tenant không có `owner_id`. Seed upsert Tenant chỉ bằng CCCD. | **P0 — WRONG MODEL.** Global uniqueness vừa chặn hồ sơ riêng của từng Owner vừa tạo đường dò tồn tại CCCD qua xung đột unique. |
| Property / Room | Property thuộc Owner; Room có Property + Owner context, room code unique trong Property, capacity/status/public listing | `Property` và `Room` hiện hữu; mã phòng unique theo Property và có `isListed`, nhưng Property owner là UserAccount/null, Room không có Owner composite context hoặc `default_capacity`; trạng thái và public fields khác target. | **PARTIAL.** Tái dùng được dữ liệu/tên/địa chỉ/mã phòng/listing sau khi backfill Owner và remap status/capacity. |
| Resident / occupancy | Resident có Owner; `room_residents` là occupancy history | `Tenant` global; current room được suy từ contract đang active; `ContractOccupant` chỉ gắn người ở vào contract, không có `started_at/ended_at/status` để làm occupancy timeline. | Resident **WRONG MODEL**; occupancy **MISSING**. Không thể dựng lịch sử tin cậy chỉ từ `contract_occupants` nếu thiếu effective dates. |
| Contract / renewal | `contracts`, representative Resident và `previous_contract_id`; renew tạo successor bất biến | `LeaseContract.tenantId` dùng làm đại diện; có `ContractExtension`, `ContractTermination`; không có predecessor field. API có PATCH trực tiếp contract, không có renew endpoint. | **CONFLICT.** Renewal lineage cần tái tạo thành contract successor mới. Không chuyển `ContractExtension` thành lineage tự động nếu không xác định được từng snapshot/date. |
| Contract documents | `contract_documents` metadata/version/checksum/signed metadata/uploader; binary ở object storage | Chỉ `documentStorageKey`, `documentFileName`, `signedAt` nhúng trong `LeaseContract`; không có version/checksum/uploader/history hay upload/download API. | **MISSING.** Chuyển mỗi file cũ thành version chỉ khi có metadata đủ; không ghi đè/giả định chữ ký. |
| Invoice | `period_start/period_end`; kỳ neo `contracts.start_date` | `billingYear`, `billingMonth`; unique theo contract/year/month. API và seed dùng `monthStart`. | **WRONG MODEL. P1/P0 financial.** Cần ánh xạ hóa đơn cũ sang interval và xác minh invoice trùng/đè kỳ neo hợp đồng. |
| Payment | `payment_transactions` từng attempt, session/provider IDs; MoMo/ZaloPay; no partial, one success/invoice | `Payment` là thu tiền thủ công: `CASH/BANK_TRANSFER/OTHER`, `receivedAt`; không session/attempt/provider callback. API ghi nhận paid bằng `OTHER`/`BANK_TRANSFER`. | **WRONG MODEL.** Không coi Payment cũ là provider transaction; bảo toàn như ledger legacy hoặc map có kiểm duyệt. |
| Zalo OA | `invoice_zalo_oa_send_logs` theo revision, recipient, status, provider response | Không có model, migration, seed hoặc API Zalo send log. | **MISSING.** |
| Amenities | Catalog + `amenity_price_history`, subscription và cycle 720 giờ/price snapshot | `Amenity` có giá hiện hành; `AmenityBooking` có `useDate/timeSlot`. Seed đặt Gym/Pool theo giờ. | Catalog **PARTIAL**; subscription/cycle **WRONG MODEL**. Không chuyển booking giờ thành membership/cycle. |
| Parking | `parking_areas`, physical `parking_slots`, `vehicles`, `parking_slot_assignments` lịch sử và capacity checks | Có `Vehicle.parkingSlot` dạng text; không inventory/assignment table. | Vehicle **PARTIAL**, Parking **MISSING**. Không xác minh được slot vật lý, overlap hay capacity từ chuỗi hiện tại. |
| Complaint | `complaints` + append-only `complaint_history`; report là category | `MaintenanceRequest` chứa category/content/status/priority nhưng không có complaint history; source values gồm `PUBLIC`, `ADMIN`, `TENANT_PORTAL`. | **PARTIAL / wrong domain boundary.** Chuyển nội dung/status có thể được, nhưng lịch sử thay đổi không có nguồn để dựng đầy đủ. |
| Public room / contact | Public listing; `contact_requests`; không đặt lịch xem | `RoomViewingRequest` lưu `preferredDate`, `preferredTime`, appointment status; public API là `POST /api/public/viewing-requests`. | **WRONG MODEL.** Có thể map thông tin liên hệ sang Contact Request; ngày/giờ và trạng thái booking là ngoài scope V1.1. |
| Invitation | `account_invitations`, hash-only token, expiry/status/audit | Không có model, table, migration hoặc route invitation; Admin trực tiếp tạo account + password. | **MISSING.** |
| Notifications | Preferences và in-app notifications history; không email/push | Có `NotificationPreference`; không có `Notification` history hoặc API. Preference fields gần tương đương nhưng naming khác. | Preferences **PARTIAL**; history **MISSING**. |

### 3. Full 25-table mapping

Status được dùng đúng theo yêu cầu. `Wrong model` nghĩa là có dữ liệu/model gần chức năng nhưng semantics hoặc tenant key khác, không thể xem là bảng tương thích.

| V1.1 table | Prisma/current DB equivalent | Status | Gap |
|---|---|---|---|
| `owners` | Không có; vai trò `LANDLORD` trên `UserAccount` được dùng như Owner | MISSING | Tách tenant root khỏi credential/account; backfill Owner cho từng chủ trọ. |
| `properties` | `Property` / `properties` | PARTIAL | Owner nullable → account ID; code globally unique; cần Owner FK và scoped uniqueness. |
| `rooms` | `Room` / `rooms` | PARTIAL | Có Property/code/status/listing; thiếu Owner context và `default_capacity`; map `condition` sang status V1.1. |
| `residents` | `Tenant` / `tenants` | WRONG MODEL | Không có Owner scope, `nationalId @unique` global, trạng thái và liên kết cư trú khác. |
| `accounts` | `UserAccount` / `user_accounts` | WRONG MODEL | Ba roles và account shape không khớp `admin/resident`; Admin gắn global platform thay vì Owner. |
| `account_invitations` | Không có | MISSING | Cần invitation audit và hash-only token persistence. |
| `contracts` | `LeaseContract` / `lease_contracts` | PARTIAL | Có dates/rent/deposit/representative gần tương đương; thiếu Owner context, `previous_contract_id`, settlement fields và lifecycle mapping. |
| `contract_documents` | Chỉ `LeaseContract.documentStorageKey/documentFileName` | MISSING | Metadata nhúng vào Contract; không có version, checksum, uploader, signed history hoặc FK scope. |
| `room_residents` | Gần nhất là `ContractOccupant` / `contract_occupants` | MISSING | ContractOccupant không phải occupancy timeline: thiếu Room/Owner context và start/end/status. |
| `invoices` | `Invoice` / `invoices` | WRONG MODEL | `billing_year/month` thay period interval; status/paidAt semantics khác; unique kỳ calendar. |
| `payment_transactions` | `Payment` / `payments` | WRONG MODEL | Giao dịch thu thủ công không có payment session, provider attempt/callback IDs hoặc idempotency. |
| `invoice_zalo_oa_send_logs` | Không có | MISSING | Không có history theo revision/recipient/provider outcome. |
| `amenities` | `Amenity` / `amenities` | PARTIAL | Catalog có nhưng giá/capacity/bookings khác; `propertyId` optional và không có Owner context V1.1. |
| `amenity_price_history` | Không có | MISSING | Chỉ có một giá hiện hành trên Amenity; không thể phục hồi giá lịch sử. |
| `amenity_subscriptions` | Gần nhất là `AmenityBooking` / `amenity_bookings` | WRONG MODEL | Dòng đặt theo ngày/giờ không biểu diễn subscription 30 ngày. |
| `amenity_subscription_cycles` | Không có | MISSING | Không cycle dates, price snapshots hoặc Invoice link. |
| `parking_areas` | Không có | MISSING | Không bãi xe theo Property. |
| `parking_slots` | Không có | MISSING | Không inventory slot vật lý. |
| `vehicles` | `Vehicle` / `vehicles` | PARTIAL | Resident link gần tương đương; parking slot là text, không Owner context/assignment history. |
| `parking_slot_assignments` | Không có | MISSING | Không trạng thái/interval/contract/capacity assignment. |
| `complaints` | `MaintenanceRequest` / `maintenance_requests` | PARTIAL | Có nội dung và trạng thái; khác entity, scope/source và không có history liên quan. |
| `complaint_history` | Không có | MISSING | Status update không append audit events. |
| `contact_requests` | `RoomViewingRequest` / `room_viewing_requests` | WRONG MODEL | Appointment/date/time workflow trái với contact-only scope. |
| `notifications` | Không có | MISSING | Không có in-app notification records/read state. |
| `notification_preferences` | `NotificationPreference` / `notification_preferences` | PARTIAL | Preferences gần tương đương; field map và Owner/account context cần chuẩn hóa. |

**Mapping counts:** `MATCH 0`, `PARTIAL 7`, `MISSING 12`, `WRONG MODEL 6`.

## 4. Legacy database models và migration history

### Model/table ngoài schema V1.1 hoặc cần chuyển đổi

| Model/table hiện tại | Phân loại | Định hướng khi được duyệt migration |
|---|---|---|
| `UserAccount` với `ADMIN/LANDLORD/TENANT` | REPLACE | Tách credential `accounts` khỏi tenant `owners`; Tenant account trỏ Resident; không giữ platform Admin làm role V1. |
| `Tenant` global | REPLACE | Backfill hồ sơ Resident theo Owner; cho phép CCCD lặp giữa Owners nhưng không trong cùng Owner. |
| `ContractOccupant` | MAP TO NEW DOMAIN | Đối chiếu người ở sang `room_residents`; dữ liệu thiếu thời gian occupancy cần review, không tự bịa dates. |
| `ContractExtension` | REPLACE | Chuyển thành contract successor chỉ nếu có đủ snapshot và dates; giữ bảng nguồn/backup cho audit. |
| `ContractTermination` | MAP TO NEW DOMAIN | Ánh xạ termination date/reason/meter/deposit vào fields trên Contract; giữ source IDs để reconciliation. |
| `InvoiceLine`, `MeterReading` | MAP TO NEW DOMAIN | Tổng hợp vào cấu trúc Invoice V1.1; đối chiếu totals/readings. Dòng không có field đích cần quarantine/export thay vì bỏ. |
| `Payment` (`CASH/BANK_TRANSFER/OTHER`) | REPLACE | Lưu ledger cũ riêng hoặc migrate được phê duyệt; không giả lập callback MoMo/ZaloPay hoặc `payment_session_id`. |
| `AmenityBooking` | REMOVE AFTER MIGRATION | Pool/Gym hour bookings không chuyển thành 30-day subscriptions; lịch sử cần archive. Catalog Amenity được map riêng. |
| `RoomViewingRequest` | REPLACE | Chuyển contact/name/phone/email/message sang `contact_requests` khi Property/Room xác định; bỏ semantics booking date/time sau khi archive. |
| `MaintenanceRequest` | MAP TO NEW DOMAIN | Nội dung/status/priority/source sang Complaint; trạng thái cũ và không gian history phải được giữ như legacy evidence. |
| `Vehicle.parkingSlot` | MAP TO NEW DOMAIN | Chỉ map khi chuỗi slot khớp khu vực/slot thực; dữ liệu không xác minh được phải review. |

Không xóa model hoặc legacy file trong lượt audit này.

### Migration history

| Migration | Purpose | V1.1 compatibility | Action |
|---|---|---|---|
| `20261007182315_initial_schema` | Tạo schema demo: UserAccount/Tenant/Property/Room/Vehicle/LeaseContract/Extension/Termination/Invoice/Payment/AmenityBooking/Viewing/Maintenance/Preferences và các bảng line/meter. Có global CCCD unique, billing year/month, appointment và slot string. | Không tương thích trực tiếp; phần lớn domain và uniqueness conflict V1.1. Một số concept/dữ liệu có thể map. | SUPERSEDE |
| `20261007195000_landlord_roles` | Thêm enum LANDLORD, `properties.owner_id → user_accounts`, `tenants.created_by_id → user_accounts`. | Là nguồn backfill hữu ích nhưng quan hệ owner-to-login không tương đương `owners`; `SET NULL` và nullable scope không đạt V1.1. | REPLACE |
| `20261007201500_room_marketplace_listing` | Thêm `rooms.is_listed` và index listing. | Ý nghĩa public listing hữu ích; ánh xạ sang `rooms.is_public`/public fields, không giữ migration SQL như schema cuối. | KEEP |

`migration_lock.toml` chỉ khai báo provider PostgreSQL, không chứng minh các migration đã được chạy trên database hiện tại. README nói dùng `prisma migrate dev` cho local. Không chạy lệnh đó trong audit.

## 5. Seed audit

Nguồn: [`database/seeds/seed.ts`](../../database/seeds/seed.ts), [`backend/.env.example`](../../backend/.env.example), [`README.md`](../../README.md).

| Hạng mục | Quan sát | Kết quả |
|---|---|---|
| Password demo | Fallback `123456` trong seed, `.env.example`, README; ba accounts admin/landlord/tenant. | Flag. Có ghi “local only”, nhưng không an toàn nếu seed/config bị dùng nhầm ngoài local. |
| Dữ liệu cá nhân | Tên, CCCD đủ 12 số, số di động và email `.com` có hình thức giống dữ liệu cá nhân thực; không thấy assertion rõ đây là synthetic trong seed. | Flag real-looking PII; xác nhận/gắn nhãn synthetic và tránh PII thật trước khi chia sẻ môi trường. |
| CCCD | `upsert` theo `nationalId`, tương thích với global unique. | Conflict với tenant-scoped unique và hai Owner có cùng CCCD. |
| Invoice | `monthStart(0/-1)` tạo kỳ theo tháng lịch; upsert theo `contractId+billingYear+billingMonth`. | Conflict với period neo `contracts.start_date`; không dùng seed này để chứng minh V1.1. |
| Amenity booking | Có lượt Gym/Pool với `useOffset` + `timeSlot` và booking laundry. | Pool/Gym time-slot ngoài scope; không migrate thành subscription/cycle. |
| Room viewing | Schema có model, seed chưa thấy booking mẫu. | Model/API vẫn là appointment ngoài V1.1. |
| Parking | Seed lưu `parkingSlot: "S-12"` / `"S-05"` trong Vehicle. | Không chứng minh slot inventory, capacity hoặc assignment history. |
| Role/payment | Roles cũ; paid Invoice seed tạo Payment `BANK_TRANSFER`. | Không tương thích account roles và payment gateways V1.1. |
| Owner/invitation/document/cycles | Không thấy seed cho Owner entity, invitation, document versions, amenity price history/subscription/cycles, parking slots/assignments, complaint history, notification history. | Thiếu các case V1.1. |

## 6. Backend audit

Backend hiện có API, nhưng route/controller/service/query nằm trong [`backend/src/app.ts`](../../backend/src/app.ts). Không có V1.1 route cho invitation, occupancy history, CT01, renew successor, contract documents, invoice-period generation, payment sessions/callbacks, Zalo send logs, amenity subscriptions/cycles, parking assignments, complaint history, contact requests, in-app notification history hoặc dashboard summary.

| Domain | Status | Bằng chứng / gap chính |
|---|---|---|
| Auth | CONFLICT | Login/me/logout có thật. Cookie chứa HMAC-signed stateless payload; fallback `AUTH_SECRET` yếu; không thấy CSRF middleware, rate-limit, secure infrastructure session/revoke store; role enum cũ. |
| Accounts | CONFLICT | `/api/admin/accounts` CRUD cơ bản chỉ platform `ADMIN`; Admin tạo username/password trực tiếp và cấp role `LANDLORD/TENANT`; không Owner-scoped account admin V1. |
| Invitations | MISSING | Không có route/table/token persistence. |
| Properties | PARTIAL | CRUD + filter Owner cho `LANDLORD`; Owner là `UserAccount.id`, `ADMIN` xem/ghi toàn cục; delete hard-delete. |
| Rooms | PARTIAL | CRUD, listing và availability; query/filter dựa Property account ownership; không Owner FK/context, capacity/occupancy rules V1. |
| Residents | CONFLICT | Thực thể `Tenant`; create/patch/list/detail, search CCCD substring trong tenant list; Admin toàn cục; global unique CCCD. |
| Occupancy | MISSING | Current resident suy từ `LeaseContract`; không `room_residents` history hoặc transfer/end-occupancy endpoint. |
| CT01 | MISSING | Không pending-registration property-wide endpoint hoặc export. |
| Contracts | CONFLICT | CRUD/activate qua PATCH; chưa có renew route; `ContractExtension` không thành successor; không `previous_contract_id`; không transaction đầy đủ cho date overlap. |
| Contract Documents | MISSING | Contract chỉ có filename/storage key; không upload/version/download/audit endpoint. |
| Invoices | CONFLICT | CRUD dùng month/year; create nhận total/status từ request; PATCH có thể mark PAID; không period anchor V1.1. |
| Payments | LEGACY | Không payment session/provider API; thay đổi status PAID tạo Payment method `OTHER` thủ công; không retry/callback/idempotency/no-partial guard. |
| Zalo OA | MISSING | Không send/log/revision API. |
| Amenities | PARTIAL | Catalog CRUD và tenant/property filtering cơ bản. Giá được lưu trực tiếp, không effective price history. |
| Amenity subscriptions/cycles | CONFLICT | `/api/amenity-bookings` dùng date/time/status; không 30-day cycle, auto-renew/cancel boundary/snapshot. |
| Vehicles | PARTIAL | Xe lồng qua Tenant detail; không API owner-scoped resource riêng, slot là text. |
| Parking | MISSING | Không area/slot/assignment/capacity service. |
| Complaints | PARTIAL | `/api/maintenance-requests` list/create/update/delete; không Complaint entity/history append-only; delete history khả dụng. |
| Contact Requests | CONFLICT | `/api/public/viewing-requests` yêu cầu lịch xem và lưu preferred date/time; không contact-only Property routing. |
| Notifications | PARTIAL | Có model preferences nhưng không thấy API cho preferences hoặc notification inbox/history/read state. |
| Dashboard | MISSING | Không dashboard/report aggregate endpoint hoặc màn hình dashboard hiện diện trong file route inventory. |

**Backend counts (21 domains):** `MATCH 0`, `PARTIAL 6`, `MISSING 7`, `CONFLICT 7`, `LEGACY 1`.

### Tenant isolation audit — P0

| Resource | Query/guard hiện tại | Đánh giá V1.1 |
|---|---|---|
| Property | Một số list filter `ownerId=session.sub`; `canManageProperty` nested ID + owner cho LANDLORD. ADMIN bypass toàn bộ. `ownerId` là account ID, nullable. | **P0.** Không đạt Owner root; platform ADMIN có cross-tenant read/write. |
| Room | `canManageRoom` và list nested qua `property.ownerId`; room ID đọc public route được phép nếu chỉ public fields. | LANDLORD guard tương đối có scope, nhưng context là account ownership, không composite Owner; ADMIN bypass. |
| Resident/Tenant | `canManageTenant` cho LANDLORD dùng `createdById` OR contract/property relation; tenant list/detail trả CCCD. Global `nationalId @unique`; ADMIN xem toàn hệ thống. | **P0.** Không cô lập profile theo Owner; `createdById` không thay thế `residents.owner_id`; unique conflict có thể tiết lộ CCCD đang tồn tại ở tenant khác. |
| Contract | Helper `canManageContract` kiểm tra Room→Property owner trước nhiều thao tác; list lọc LANDLORD. ADMIN xem tất cả; một số findUnique/update sau helper không mang owner trong chính query. | Có lớp guard cho landlord, nhưng không đảm bảo mọi query/transaction theo Owner; check-then-write tách rời. Admin global trái spec. |
| Invoice | `canManageInvoice` nested theo contract/room/property; list lọc landlord. `Invoice` không chứa owner context. ADMIN global. | Chưa có composite tenant safety; có thể cải thiện query scope nhưng phải đổi schema/role. Financial/client-authority gaps là P0 riêng. |
| Vehicle | Thường lấy thông qua Tenant đã guard; không endpoint vehicle CRUD riêng. Admin/global path và tenant model vẫn global. | Chưa enforce Owner tại Vehicle row; không có parking/property context để kiểm tra. |
| Parking | Không có resource/API; chỉ `vehicle.parkingSlot` string. | **P0/P1.** Không thể kiểm tra tenant/Property/slot/capacity. |
| Amenity | Guard qua amenity→property cho LANDLORD; Admin bypass. Booking list filter theo property, nhưng user identity/account-to-tenant checks khác V1.1. | Partial guard; không composite Owner+Contract context. |
| Complaint | `canManageMaintenance` nested room→property cho LANDLORD; request không gắn Room có thể không hiện trong owner list. Admin global. | Partial scope; complaint/actor/history không có Owner composite integrity. |
| Contract Document | Không có route/model. | Chưa có authorization/download surface để audit. |

`findUnique({id})` xuất hiện ở auth/account/room/contract/invoice paths. Các ID theo landlord thường được check trước bằng `canManage*`, nhưng guard và query/write không phải một transaction và Admin luôn được xem như platform-wide. Public room lookup là ngoại lệ có chủ đích, kiểm tra `isListed/READY/Property ACTIVE` và chỉ trả listing fields. Chưa có API global CCCD lookup; tuy vậy global unique + create/error behavior và Admin toàn cục vẫn vi phạm privacy boundary V1.1.

### Client authority audit — P0

- **Account:** `POST /api/admin/accounts` tin role, password, tenantId từ body; cho tạo credential thay invitation verified flow.
- **Property:** platform Admin body có thể chỉ định `ownerId`; V1.1 Admin nhận Owner từ session, không phải root Admin phân bổ landlord account.
- **Contract:** create body chọn `status=ACTIVE`; PATCH cho đổi status/room/tenant/dates/rent/capacity. Không renew-only authority cho `previous_contract_id` vì field/route chưa tồn tại.
- **Invoice:** create nhận `totalVnd`, `billingMonth/year`, `status`; `PAID` tạo payment thủ công. PATCH nhận status/total/dueDate và có thể set paid. Đây là client-supplied financial state trái API V1.1.
- **Amenities:** client gửi price/property/capacity/isActive; catalog price update không có append-only price history.
- **Maintenance:** Admin request body có thể gửi status/priority/tenant/room; không audit history.
- **Session:** role nằm trong signed cookie nhưng active account được re-check; fallback secret có giá trị mặc định. Không thấy check CSRF token dù API dùng cookie cho unsafe methods. Stateless cookie logout chỉ xóa browser cookie, không revoke token server-side.
- **Frontend:** React gọi JSON endpoints trực tiếp; không authority value nào được bảo vệ bởi API V1.1 contract vì backend legacy chưa triển khai contract đó.

## 7. Frontend audit

- Active app dùng **Next.js App Router + React + TypeScript**; `frontend/package.json` không khai báo Tailwind.
- Route inventory hiện có landing, login, tenant portal, `/admin/accounts`, properties/rooms, tenants, contracts, invoices, amenities, bookings, viewings, complaints. Không thấy page dashboard, CT01, payments, parking, notifications, contract file upload hoặc invitation management.
- Các list/form chủ yếu tái dùng `components/data-management.tsx`, nhưng `fetch` URL/mapping/cấu hình field nằm trong UI/config; chưa có service layer chung.
- Có gọi API backend thật, không thấy active React import `legacy/` hay `localStorage/sessionStorage` làm persistence. Tenant auth/data gọi `/api/tenant-portal/*`; admin/public modules gọi `/api/*`.
- Landing page public có API listing thật nhưng tìm theo province **và property name/address**; V1.1 public search không được tìm theo building name. CTA và form hiện là **hẹn xem phòng** với `preferredDate/preferredTime`, không phải V1.1 contact request.
- Login page và README hiển thị demo passwords `123456`; backend API fallback URL là `localhost:4000`.
- Có một imperative DOM call `document.getElementById("phong")?.scrollIntoView()` để cuộn trang tìm kiếm. Không thấy `new Function` hoặc `dangerouslySetInnerHTML` trong active React source. Legacy HTML vẫn dùng inline handlers, `document.querySelector`, `localStorage/sessionStorage`.
- Active UI CSS chính là `globals.css`; legacy giữ `styles.css` riêng và không được import vào Next theo source đã rà. Không đánh dấu đây là hai hệ thống CSS đang cùng chạy.

### Frontend module matrix

| Module | React UI | Componentized | Service layer | Real API | Mock/legacy dependency | Status |
|---|---|---|---|---|---|---|
| Auth | Có login/logout/me | Login component | Không; fetch trực tiếp | Có | Demo credentials | PARTIAL |
| Dashboard | Không thấy route | — | — | Không | — | MISSING |
| Property | Có CRUD/table | `DataManagement` | Không | Có | Không trong active graph | PARTIAL |
| Room | Có sub-route CRUD | `DataManagement` | Không | Có | Không trong active graph | PARTIAL |
| Resident | Có list/detail/form | `DataManagement` | Không | Có | Không trong active graph | PARTIAL |
| Contract | Có list/form/status | `DataManagement` | Không | Có, legacy API | Không trong active graph | PARTIAL |
| Invoice | Có table/form/status | `DataManagement` | Không | Có, tháng lịch/manual PAID | Không trong active graph | PARTIAL |
| Payment | Không có gateway/attempt UI riêng | — | — | Chỉ payment thủ công qua invoice status | Legacy semantics | LEGACY |
| Amenity | Catalog + booking UI | `DataManagement` | Không | Có, nhưng time-slot bookings | Không trong active graph | PARTIAL |
| Parking | Không có module slot/assignment | — | — | Không | Xe chỉ hiện chuỗi slot | MISSING |
| Complaint | UI xử lý maintenance request | `DataManagement` | Không | Có, `/maintenance-requests` | Không trong active graph | PARTIAL |
| Contact/Public Room | Marketplace + viewing form | `HomePage` | Không | Có, public rooms/viewing requests | Appointment workflow legacy | PARTIAL |
| Notification | Không có inbox/preferences route | — | — | Không thấy endpoint dùng | Legacy settings/demo | MISSING |

**Frontend counts:** `MIGRATED 0`, `PARTIAL 9`, `LEGACY 1`, `MOCK ONLY 0`, `MISSING 3`. React module có API thật nhưng dùng contract legacy thì chưa đạt Definition of Done.

## 8. Legacy audit

| Nội dung `legacy/` | Phân loại | Ghi chú |
|---|---|---|
| `index.html`, `styles.css`, `role-user.js`, `ui-refinements.js`, `app-fixes.js`, `settings-demo.js` | REFERENCE ONLY | UI/JS nguyên khối, inline event handlers và browser storage; README nói Next frontend là active. Không xóa trong audit. |
| `server.js`, `demo-database.json` | REFERENCE ONLY | Server demo độc lập chạy bằng `legacy:dev`; JSON không phải PostgreSQL V1.1. Chỉ còn runtime khi người dùng chủ động start legacy server. |
| `wireframe/role_admin`, `wireframe/role_user` | MIGRATE | Chỉ là wireframe đầu vào để tham khảo UX; chức năng phải được triển khai lại theo API/role V1.1. |
| Foxi SVG/JS, logo, brand image | REFERENCE ONLY | Assets/demo integrations; Foxi API không thuộc V1.1. |

Không phát hiện frontend active import JS/JSON từ legacy. Backend active vẫn chứa các domain legacy (viewing requests, amenity bookings, maintenance requests), nên cần thay route/module trước khi loại endpoint legacy.

## 9. Main Migration Gap Matrix

| Domain | Current implementation | V1.1 target | Gap | Severity | Action |
|---|---|---|---|---|---|
| Prisma/schema baseline | 18 legacy Prisma models; 3 old migrations | PostgreSQL V1.1, 25 tables | Không có V1.1 mapping/migration; enums/IDs/unique/FKs khác | P0 | Thiết kế remap/backfill/rollback; không apply migration cũ vào V1.1. |
| Owner/account/auth | Platform ADMIN + LANDLORD/TENANT, owner là account ID | Owner tenant root; admin/resident; verified invitation; secure session | Role, tenant boundary, reset/invitation/session sai contract | P0 | Thay foundation trước các API domain. |
| CCCD/privacy | Tenant CCCD unique toàn cục | Unique trong Owner; privacy không leak giữa Owner | Cross-owner duplicate bị chặn và có thể suy luận existence | P0 | Backfill Resident theo Owner; bỏ global unique trong target migration. |
| Property/Room | CRUD thật, assigned-landlord ownership | Owner-scoped Property, Room capacity/public context | Owner ID sai gốc; thiếu composite consistency/capacity | P0/P1 | Làm pilot sau Auth/Owner foundation. |
| Resident/occupancy | Tenant + current contract/ContractOccupant | residents + room_residents history | Thiếu Owner, dates/status, transfer history | P1 | Xác minh và map occupancy từ contracts/occupants. |
| Contracts/documents | LeaseContract + extension + embedded file key | Contracts lineage + immutable document metadata versions | Gia hạn/history/file persistence khác | P1 | Successor migration, file inventory/checksum, object storage plan. |
| Invoices/payments | Calendar-month Invoice + Payment thủ công | Contract-start periods + payment sessions/provider attempts | Kỳ và payment authority/gateway sai | P0 | Duyệt period mapping, reconcile balances; không giả lập transactions. |
| Amenities | Catalog + date/time bookings | Price history + 30-day subscription/cycles | Business model sai | P1 | Tách catalog, không chuyển booking giờ thành cycle. |
| Parking | Vehicle parking string | Areas/slots/assignment history/capacity | Không có slot identity/rules | P1 | Lập inventory map và kiểm tra capacity trước backfill. |
| Complaints | MaintenanceRequest không history | complaints + complaint_history | Không append audit, nguồn report gộp chưa chặt | P1 | Map current state, giữ raw source; thêm history khi triển khai. |
| Public/contact | Public marketplace + appointment booking | Listing + contact-only request | Viewing schedule ngoài scope; search building name | P1 | Thay form/route; giữ listing UI sau filter remap. |
| CT01/invitations/docs/Zalo | Không có route/model | APIs/metadata theo API spec | V1.1 capabilities chưa có | P1/P2 | Xây theo dependencies V1.1; không mở rộng ngoài scope. |
| Notifications/dashboard | Preferences table; không inbox/dashboard | In-app history/preferences + owner-scoped dashboard | Thiếu records/query/UI | P2 | Sau core transactional modules. |
| Seed/env | Demo seed + `123456`, CCCD realistic, monthStart, booking, slot string | Synthetic safe seed, Owner scopes, V1.1 cases | Không thể dùng làm V1.1 seed/validator | P0 for shared data | Tách local demo, dùng synthetic và không chạy ngoài disposable DB. |
| Runtime target | Compose PostgreSQL 17; V1.1 validated trên PostgreSQL 18 | PostgreSQL 18 current baseline | Mismatch engine/version | P0 deployment | Chọn PostgreSQL 18 cho validation/dev parity trước migrate. |
| Legacy cleanup | Old standalone reference + backend legacy routes | No out-of-scope V1 routes after replacement | Legacy endpoints/UI còn hoạt động | P3 after replace | Strangler removal theo module, không xóa sớm. |

## 10. Recommended migration order

Không rewrite toàn project. Dùng Strangler Migration; mỗi module thay API/data path, chạy regression, rồi mới tháo phụ thuộc cũ.

### P0 foundation

1. Chốt data mapping/backfill/rollback từ `UserAccount/Tenant/Property` sang `owners/accounts/residents/properties`; quyết định cách xử lý duplicate CCCD giữa/cùng landlord.
2. Prisma remap đúng V1.1; migrations mới phải là migration/version riêng, không chạy chain cũ lên DB V1.1 LOCK.
3. Auth/session theo API: Owner trong session, resident→owner, CSRF, reset/invitation security, revocation; bỏ role platform-wide trong V1.
4. Tenant-isolation checks cho list/detail/write/aggregate; foreign-resource trả 404; kiểm tra data access query và concurrency.

### Pilot và core

5. **Pilot Property / Room**: vertical slice list/detail/create/update/archive, Owner authorization, capacity/public fields và API contract.
6. Resident / Occupancy, bao gồm CCCD tenant-scoped, `room_residents`, capacity, transfer/end và CT01 pending list.
7. Contracts / Contract Documents: successor lineage, dates, immutable versions, object storage reconciliation.
8. Invoice period start/end theo contract anchor, service/rate source được duyệt, then Payment session/transactions + callback reconciliation.

### Supporting / cleanup

9. Amenities → catalog/price history/subscriptions/cycles; không map Pool/Gym date/time booking thành cycle.
10. Parking inventory/vehicle assignments/capacity.
11. Complaints/history; public listing/contact-only; CT01 export.
12. Notification preferences/history; Zalo OA theo provider/recipient decisions.
13. Thay UI route từng module; chuyển `DataManagement` sang typed service layer nếu cần; regression; tháo endpoint/schema/JS legacy tương ứng.

Order này giữ gợi ý Scope of Work; thêm data backfill/auth trước pilot vì Owner là P0 dependency. Pilot Property/Room chỉ bắt đầu sau foundation auth/tenant boundary được review.

## 11. Definition of Done cho module

Không module nào hiện được đánh `MIGRATED`. Chỉ công nhận khi đồng thời:

- React/Next sở hữu UI; backend API sở hữu behavior; PostgreSQL V1.1 là source of truth.
- Prisma mapping/migration khớp schema V1.1; Owner authorization và validation được kiểm thử.
- Các transaction/capacity/period/payment/version invariants được enforce đúng; không tin server-owned values từ client.
- Không dùng localStorage/mock/legacy như production persistence.
- Legacy JS/API dependency của module có thể gỡ; regression tests pass.

## 12. Final summary

### DATABASE / PRISMA — mapping đủ 25 bảng

```text
MATCH: 0
PARTIAL: 7
MISSING: 12
WRONG MODEL: 6
LEGACY EXTRA: nhiều model/table ngoài target; liệt kê tại §4
```

### BACKEND — 21 domains

```text
MATCH: 0
PARTIAL: 6
MISSING: 7
CONFLICT: 7
LEGACY: 1
```

### FRONTEND — 13 modules

```text
MIGRATED: 0
PARTIAL: 9
LEGACY: 1
MOCK ONLY: 0
MISSING: 3
```

### Severity

```text
P0: Owner/account/CCCD isolation; auth/session; schema/migration baseline; invoice/payment authority; seed safety; PostgreSQL version parity.
P1: Property/Room consistency; resident occupancy; contracts/documents; invoice period; amenity subscriptions; parking; complaints/history; public contact; invitations/CT01.
P2: Zalo OA; notification history; dashboard/reporting; operational provider/storage decisions.
P3: Legacy removal and monolithic route/service cleanup after replacement.
```

### Câu hỏi chốt

1. **Prisma có khớp Database V1.1 không?** Không. Schema hiện tại là old/demo schema, mapping counts ở trên.
2. **Có cần remap Prisma không?** Có. Phải remap sang 25 bảng V1.1 và tạo migration/version mới sau khi có mapping/backfill/rollback được duyệt.
3. **Database hiện tại của source là old/demo hay V1.1?** Old/demo schema theo migrations hiện có; source không chứng minh database đang chạy là V1.1. Docker Compose còn pin PostgreSQL 17.
4. **Backend giữ lại được phần nào?** Express bootstrap, health checks, Prisma integration, JSON/CORS/security middleware nền, pagination patterns và một số UI-serving CRUD patterns có thể tái dùng sau khi thay authorization/query/business rules. Không giữ nguyên tenant/auth/payment flows như V1.1.
5. **Frontend giữ lại được phần nào?** Next App Router, React components/layout, brand assets, table/form primitives, public listing presentation và các UI patterns. Phải đổi API contracts, roles, search/contact behavior, invoice/booking/payment semantics.
6. **P0 blocker?** Owner tenant root chưa có; global CCCD unique; platform ADMIN bypass; session/CSRF/revocation không khớp; invoice/payment nhận state từ client; chưa có Prisma V1.1 migration plan.
7. **Pilot module?** Property / Room, sau P0 Owner/Auth/tenant authorization foundation.
8. **Legacy feature cần loại khỏi V1?** Room viewing appointment, Pool/Gym time-slot booking, contract mutation-based extensions, manual payment methods as provider payment flow, global platform Admin, parking-slot text, standalone `maintenance_requests` semantics/history-less reports.
9. **Bước tiếp theo DUY NHẤT?** Soạn và review **V1.1 data-mapping/backfill/rollback plan** cho Owner → Property → Resident/account, gồm xử lý duplicate CCCD và gán Owner. Chưa chạy migration hoặc implement module trước khi plan này được phê duyệt.

## Giới hạn audit

Đây là review source tĩnh; không chạy ứng dụng, typecheck, build, migration, generate Prisma hoặc database query. Kết luận mô tả code/config hiện có, không khẳng định database runtime đang chứa những record nào. V1.1 root docs là authority nếu code cũ mâu thuẫn.
