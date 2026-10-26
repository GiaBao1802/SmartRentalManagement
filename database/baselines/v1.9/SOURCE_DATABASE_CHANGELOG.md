# Góc Trọ V1 — Database changelog and audit

Database files are redesigned as a clean PostgreSQL V1 baseline. The previous schema described 16 tables for demo/legacy behavior. The new baseline is normalized around Owner → Property → Room, keeps history for occupancy and workflows, and excludes demo-only booking/report/plan structures. This is a breaking clean schema; no production `ALTER` migration is supplied because the project is pre-production as directed.

## Audit trước khi sửa

| Thành phần | Hiện trạng | Vấn đề | Requirement liên quan | Quyết định |
|---|---|---|---|---|
| `areas` | Đại diện khu trọ, chứa room prefix/count/default room data | Không có owner FK hoặc entity phòng | §3, §6 | **Sửa/đổi tên** thành `properties`; số phòng lấy từ `rooms` |
| `rooms` | Không có bảng riêng; phòng suy ra từ area + room number | Không thể FK/constraint room độc lập | §6 | **Thêm** entity Room |
| `tenants` | CCCD là PK; gắn `area_code`, `room_number` hiện tại | Dùng PII làm khóa; mất lịch sử chuyển phòng | §7, §8 | **Sửa/đổi tên** thành `residents` với surrogate PK; thêm occupancy history |
| `tenant_vehicles` | Vehicle gắn CCCD và lưu `parking_slot` dạng text | Không biểu diễn slot vật lý, assignment hoặc thời hạn | §14 | **Sửa/tách** thành `vehicles`; bỏ text slot và thêm parking domain |
| `accounts` | Role admin/tenant; `password_value` nullable; không liên kết Owner | Thiếu owner scope; không đảm bảo password hash; role tenant mơ hồ | §3, §5, §20 | **Sửa** role thành admin/resident; `password_hash` bắt buộc; liên kết Owner hoặc Resident |
| `contracts` | PK business code; tham chiếu tenant + area/room code; một tenant đứng tên | Không FK Room; overlap active chưa được kiểm soát rõ | §9 | **Sửa** tham chiếu `room_id` + một representative; partial unique và backend kiểm tra date overlap |
| `invoices` | FK contract; billing period lịch dương | Kỳ thuê cần neo theo ngày bắt đầu hợp đồng, không theo ngày 1 hoặc tiền cọc | §10–12 + quyết định mới | **Sửa** dùng `period_start`/`period_end`; unique theo contract và cả hai biên; backend sinh kỳ từ `contracts.start_date` |
| `resident_bookings` | Lịch đặt theo ngày/time slot | Không phải chu kỳ Pool/Gym V1 | §13 | **Hợp nhất dữ liệu hợp lệ** vào subscription/cycle khi migration; bỏ bảng khỏi V1 |
| `amenity_registrations` | Yêu cầu đăng ký ngày/time slot, luồng `RG` riêng | Trùng nghiệp vụ với booking và không có cycle 30 ngày | §13 | **Hợp nhất** vào `amenity_subscriptions` + `amenity_subscription_cycles`; bỏ bảng cũ |
| `tenant_vehicles`/parking | Không có slot inventory/assignment | Không giới hạn theo capacity contract, không ngăn double assignment | §14 | **Thêm** `parking_areas`, `parking_slots`, `parking_slot_assignments` |
| `complaints` | Gắn resident + area/room; status chỉ chờ/từ chối; ngày không có history | Thiếu property-consistent FK, in-progress/resolved và trạng thái/action history | §15 | **Sửa** Complaint; **thêm** `complaint_history` |
| `room_reports` | Report entity riêng | Trái quy định Report là Complaint category | §15, §19 | **Hợp nhất** vào `complaints.category`; bỏ bảng riêng |
| `appointment_requests` | Lưu ngày/giờ booking xem phòng | Booking lịch xem không thuộc V1 | §4, §18 | **Loại khỏi V1** |
| `contact_requests` | Guest info không gắn owner/property/room | Không định tuyến được cho đúng chủ trọ/khu/phòng | §4 | **Sửa** để gắn Property và optional Room; owner suy ra từ Property |
| `amenities` | Catalog toàn cục không có property; chứa slot options | Catalog/giá/đăng ký không scope khu trọ; parking bị trộn vào tiện ích | §13–14 | **Sửa** thành catalog theo Property cho Pool/Gym/Other; parking tách domain |
| `service_catalog` | Danh mục khác lưu `area_name` text và giá | Trùng catalog, không FK Property | §13 | **Hợp nhất** vào `amenities`; bỏ bảng riêng |
| `notification_preferences` | Preference theo account, không có notification log | ERD cũ bỏ sót bảng này; preference không phải lịch sử notification | §12, §16 | **Giữ/sửa** theo account ID mới; thêm bảng `notifications` cho in-app history/read state |
| `app_settings` | Generic key/value; seed có SaaS plan | SaaS demo không thuộc V1; generic settings không mô hình hóa business data | §16, §18 | **Loại khỏi V1**; cấu hình bí mật/provider nằm ngoài schema nghiệp vụ |
| Payments / Zalo send logs | Không có bảng payment hoặc Zalo OA history | Không thể trace attempt, callback/idempotency hoặc resend/version | §11–12 | **Thêm** `payment_transactions`, `invoice_zalo_oa_send_logs` |
| Occupancy / amenity cycles and prices | Không có lịch sử occupancy/cycle/giá | Không thể xuất CT01 đúng theo Property, giữ lịch sử cư trú/giá/cycle | §7–8, §13 | **Thêm** `room_residents`, `amenity_price_history`, `amenity_subscriptions`, `amenity_subscription_cycles` |
| Owner and Property scope | Không có owner root và Property owner FK; CCCD định danh toàn cục | Lộ khả năng tra cứu resident xuyên chủ trọ | §2–3, §19–20 + quyết định mới | **Thêm** `residents.owner_id`; unique CCCD theo Owner; composite FK chặn các liên kết chéo Owner; lookup CCCD luôn lấy Owner từ session |
| Occupancy active | Partial unique khóa một active occupancy cho mỗi `resident_id` trên toàn database | Requirement V1 không có giới hạn một occupancy active toàn platform | quyết định mới | **Bỏ** `one_active_room_per_resident`; capacity và occupancy hợp lệ do backend kiểm tra |
| Seed hiện tại | Một owner giả định, ba areas; CCCD/phone trông như PII; booking, report riêng, SaaS seed; không payment/Room thật | Không chứng minh tenant isolation hoặc các flow mới; có dữ liệu ngoài V1 | §3–19, seed rules | **Thay seed** bằng synthetic data hai owner, bốn property, rooms, occupancy, payment retry, amenity multi-cycle, parking, complaint/contact/Zalo |

## Thay đổi schema

| Thay đổi | Lý do | Bảng cũ | Bảng mới/ảnh hưởng | Breaking change | Requirement nguồn |
|---|---|---|---|---|---|
| Owner tenancy root | Mỗi chủ trọ chỉ truy cập dữ liệu của mình | Không có | `owners`, `accounts.owner_id`, `properties.owner_id` | Có | §2–3, §19–20 |
| Property/Room chuẩn hóa | Room là entity core; room code unique trong property | `areas`, room code text ở bảng con | `properties`, `rooms` | Có; `areas` thành `properties` | §6 |
| Resident PK và occupancy history | Không dùng CCCD làm PK; giữ lịch sử ai ở phòng nào | `tenants` trực tiếp chứa CCCD/area/room | `residents`, `room_residents` | Có; CCCD thành unique business field | §7–8 |
| Resident tenant scope | CCCD unique toàn hệ thống | Không tiết lộ sự tồn tại của một CCCD giữa các Owner | `residents.owner_id NOT NULL`; `UNIQUE(owner_id,national_id)` | Có; cùng CCCD ở Owner khác nhau là hai hồ sơ V1 | §3, §7 + quyết định review |
| Owner consistency | Liên kết chéo tenant chỉ cần backend suy ra | Composite FK chặn nhầm scope ở các quan hệ chính | Khóa tenant ghép cho Room/Contract/Occupancy, Invoice/Zalo, amenities, vehicle/parking, complaints | Có | quyết định review |
| Amenity Cycle → Invoice | `amenity_subscription_cycles.invoice_id` chỉ FK tới `invoices.invoice_id` | Invoice tồn tại nhưng có thể sai Owner/Property/Contract so với Subscription | Cycle giữ context subscription; composite FK tới `amenity_subscriptions` và composite FK nullable tới Invoice | Có; hardening quan hệ billing | quyết định review |
| Occupancy global uniqueness | `one_active_room_per_resident` khóa resident ở nhiều Room trên toàn platform | Rule này không có trong Requirement V1 | Bỏ partial unique index, vẫn giữ lịch sử và khóa Owner ghép | Có | quyết định review |
| Account authentication model | Hai role V1, hash bắt buộc, owner/resident link đúng một | `accounts.password_value`, `role=tenant` | `accounts.password_hash`, roles admin/resident, Owner/Resident FK | Có | §3, §5, §20 |
| Contract Room and representative | Một Room và đúng một người đại diện; người ở khác qua occupancy | `contracts.area_code`, `room_number`, `tenant_cccd` | `contracts.room_id`, `representative_resident_id`, capacity, end/settlement fields | Có | §7, §9 |
| Invoice + payment ledger | Trạng thái paid dựa giao dịch đủ tiền; từng attempt được giữ | `invoices.paid_at`, không payment entity | `invoices`, `payment_transactions` | Có; paid_at không còn là lịch sử payment | §10–11 |
| Invoice billing cycle | `billing_period` là ngày 1 tháng lịch | Bỏ ngày 1; period neo từ `contracts.start_date`, không từ tiền cọc | `invoices.period_start`, `period_end`; unique `(contract_id, period_start, period_end)` | Có | §10 + quyết định review |
| Zalo OA send history | Log từng lần gửi, revision, lỗi/response và resend | Không có | `invoice_zalo_oa_send_logs`; `invoices.revision` | Có; thêm bảng | §12 |
| Pool/Gym subscription cycles | Thay booking/time slots bằng đúng chu kỳ 30 ngày; giữ giá snapshot | `resident_bookings`, `amenity_registrations` | `amenities`, `amenity_price_history`, `amenity_subscriptions`, `amenity_subscription_cycles` | Có; hai flow cũ bỏ/hợp nhất | §13 |
| Parking inventory/assignment | Slot vật lý, hợp đồng/capacity, assignment history | `tenant_vehicles.parking_slot` | `vehicles`, `parking_areas`, `parking_slots`, `parking_slot_assignments` | Có; cần map chuỗi slot cũ nếu có dữ liệu cần giữ | §14 |
| Report/Complaint workflow | Report là category; trạng thái và history đầy đủ | `room_reports`, `complaints` | `complaints`, `complaint_history` | Có; Report map vào Complaint | §15, §19 |
| Public contact routing | Chuyển yêu cầu khách cho đúng property/owner | `contact_requests` không có FK property | `contact_requests.property_id`, optional `room_id` | Có | §4 |
| Booking xem phòng | Không có appointment V1 | `appointment_requests` | Bỏ khỏi schema V1 | Có; dữ liệu cũ không migrate sang contact nếu chưa có sự đồng ý/mapping hợp lý | §4, §18 |
| Amenity catalog | Catalog và giá theo property; parking là domain riêng | `amenities`, `service_catalog` | `amenities` scoped by property; `service_catalog` bỏ | Có; hợp nhất data catalog | §13–14 |
| In-app notifications | Có thể lưu read/unread/history trong ứng dụng | `notification_preferences` | Giữ preferences; thêm `notifications` | Có; thêm bảng và đổi FK account | §12, §16 |
| App settings/SaaS plan | Không để SaaS/business data trong generic settings | `app_settings` và seed plan | Bỏ khỏi V1 | Có; SaaS seed bị loại | §16, §18 |
| Keys, names and delete strategy | Tránh PII PK; giữ history | CCCD/business IDs là một số PK; cascades trên vehicle/account preference | Bigint identity PK; business code unique; FK history dùng `RESTRICT`, Resident archive/occupancy status | Có | §5, §7, §19–20 |

## Constraint database và phần backend

Schema enforce được: PK/FK, role/status domain, NOT NULL, money/capacity/date checks, CCCD format và unique trong Owner, composite FK tenant-consistency cho các quan hệ cốt lõi, unique Room/property, account link unique, invoice unique theo contract/start/end, payment provider transaction/event unique, tối đa một payment success/invoice, một active contract/room, một active subscription/resident/amenity, một active assignment/slot/vehicle, cycle duration/unique start, total invoice bằng tổng khoản tiền.

Backend phải dùng transaction/locking cho: authorization theo Owner trong authenticated session; lookup CCCD luôn lọc `residents.owner_id` từ session và không xác nhận hồ sơ ở tenant khác; sinh Invoice kỳ tiếp theo từ `contracts.start_date` (không có CHECK ngày 1 hay mặc định mọi kỳ 30 ngày); date-range overlap của hợp đồng; số người đang ở theo capacity; xác nhận resident có occupancy/contract phù hợp trước khi tạo occupancy, complaint, tiện ích hoặc parking assignment; không khóa một Resident vào một occupancy active toàn platform; payment đủ số dư/callback idempotent và kết thúc checkout sau hai failed attempt cùng session; cycle Pool/Gym nối tiếp/không overlap và giá mới chỉ chụp vào cycle mới; slot active không vượt capacity hợp đồng; xử lý contract end và xác minh Zalo recipient gắn với occupancy/hợp đồng của Invoice. Chi tiết tại `database/erd.md`.

## Seed

`database/seed.sql` có hai owner/Admin, mỗi owner hai properties, tám rooms, Resident synthetic và cùng một CCCD synthetic ở hai Owner; một phòng có hai occupants nhưng một contract representative; invoice period bắt đầu đúng mốc contract ngày 15; invoice X có hai failed attempts trong session A và pending retry trong session B; Pool/Gym có hai cycle nối tiếp với snapshot 50.000/60.000 và price history tương ứng; Parking, Complaint, contact request, Zalo send logs và in-app notifications. Không seed booking, `room_reports`, SaaS, refund, Foxi/OCR/camera/staff. `password_hash` chỉ là scrypt encoding của secret ngẫu nhiên đã bỏ; seed không phát credential đăng nhập.

## Validation Database V1 (snapshot trước hardening)

- Lượt runtime review ban đầu chưa hoàn tất do `initdb` PostgreSQL 18 bị treo; ghi chú đó là lịch sử của lần thử ban đầu.
- Sau đó người dùng xác nhận Database V1 đã chạy `schema.sql`, `seed.sql` và runtime validation đạt **14/14 PASS**. Database V1 (snapshot 23 bảng) được xem là **LOCK** theo xác nhận này.
- Static audit của snapshot V1: 23 bảng; 38 tham chiếu FK đều trỏ tới bảng có trong schema; seed ghi vào 23 bảng; ERD nhắc tới đủ 23 bảng; không có constraint ngày 1 cho billing period và không có unique occupancy toàn cục.
- Audit bổ sung Cycle → Invoice trong seed: cycle 7301 được gắn invoice 5001 cùng contract/property/owner; các cycle 7302 và 7303 để `invoice_id = NULL`. DB dùng khóa ghép để ràng buộc subscription context và invoice context. Ghi chú “chưa chạy runtime” ở lần audit ban đầu đã được superseded bởi xác nhận V1 14/14 PASS ở trên; không áp dụng cho V1.1.
- Các rule vượt phạm vi constraint đơn giản đã được ghi trong schema/ERD dưới dạng `DB constraint + backend transaction/locking`.
- Seed là dữ liệu test synthetic. Account hash là scrypt encoding của secret ngẫu nhiên đã bỏ, không có password đăng nhập; cấp credential qua luồng backend/dev provisioning.
- Tại thời điểm snapshot V1, API Spec chưa được soạn; các chi tiết auth context, transaction isolation/locking, payment callback, cycle renewal và provider error mapping được đặc tả sau trong `04_API_SPEC.md`.

## Database V1.1 hardening

### Thay đổi schema

- Thêm `account_invitations`: Owner, Resident, Admin tạo invitation, token hash SHA-256, status, expiry, accepted timestamp và audit timestamps. Composite FK buộc Resident và Admin tạo invitation thuộc cùng Owner; token hash unique, một pending/Resident, identity/token bất biến và trigger cấm hard-delete; plaintext token không lưu.
- Thêm `contracts.previous_contract_id`: self-reference nullable với composite FK `(previous_contract_id, room_id, owner_id)`, tự tham chiếu bị CHECK chặn, một predecessor chỉ có tối đa một successor. Backend transaction vẫn phải chặn cycle nhiều bước và date overlap.
- Thêm `contract_documents`: metadata object storage, loại tài liệu, version, checksum SHA-256 tùy chọn, trạng thái, uploader Admin cùng Owner, metadata chữ ký cơ bản. Unique `(contract_id, document_type, version)` và `storage_key` ngăn ghi đè/đụng key; trigger chặn cập nhật metadata file của version cũ và cấm hard-delete; binary không lưu trong PostgreSQL. FK `RESTRICT` giữ lịch sử.
- Session storage được giữ ở infrastructure-level store (ưu tiên Redis hoặc server-side session store). Password-reset token lưu hash với TTL ở Redis/secure infrastructure store; không thêm bảng session/reset vào PostgreSQL V1.1.
- Đồng bộ `04_API_SPEC.md`: invitation persistence, contract lineage và document metadata/version đã được giải quyết ở mức kiến trúc. Delivery channel, provider/retention object storage, contract field-change audit, cùng các blocker V1 khác vẫn cần quyết định triển khai.

### Seed và validation

- Thêm invitation pending và accepted với hash synthetic, không có token plaintext; accepted Resident có account.
- Thêm lineage Contract 4002 → 4003: hợp đồng predecessor đã expired, successor draft trong tương lai để không tạo active overlap.
- Thêm hai version tài liệu synthetic cho Contract 3001: generated v1 và signed v2, object keys/checksum synthetic, không dùng file thật.
- Runtime validation được thực hiện trên database test sạch bằng **PostgreSQL 18**, theo thứ tự `schema.sql` V1.1 → `seed.sql` V1.1 → runtime validator. `schema.sql` chạy thành công; `seed.sql` chạy thành công.
- Runtime validator: **21/21 PASS, 0 failed**. Bộ dữ liệu test của validator chạy trong transaction và được rollback sau khi kiểm tra.
- Các test xác nhận: đúng 25 public tables; CCCD cùng giá trị hợp lệ giữa hai Owner nhưng trùng trong cùng Owner bị từ chối; invoice anchor; hai failed attempts trong một payment session và session mới cho cùng invoice; amenity cycle 720 giờ cùng snapshot giá 50.000/60.000; cycle không link invoice cross-owner; uniqueness slot/vehicle active và cross-owner parking bị từ chối; invitation seed/context, tenant isolation và token hash uniqueness; renewal lineage, self-reference và predecessor sai Room/Owner; document versions, duplicate version và cross-owner document.
- Kết quả lịch sử **Database V1 = 14/14 PASS, LOCK** vẫn giữ nguyên cho snapshot 23 bảng. V1.1 supersede snapshot V1 về schema hiện hành.
- Nếu giữ ghi chú về giới hạn môi trường Codex: giới hạn đó không ảnh hưởng validation cuối. Kết quả có thẩm quyền được chạy cục bộ trên PostgreSQL 18: **21/21 PASS**.

```yaml
Database V1.1 schema/seed/runtime validation: PASS
Schema: PASS
Seed: PASS
Runtime validation: 21/21 PASS
Failed: 0
PostgreSQL version: 18
Public tables: 25
Database V1.1: LOCK
Baseline: historical snapshot
```

**Database V1.1 was the locked database baseline before V1.2 and is now the preserved historical snapshot.** LOCK có nghĩa không sửa schema tùy tiện trong quá trình triển khai backend/frontend; đây không phải cam kết database không bao giờ thay đổi. Mọi thay đổi schema phải dựa trên thay đổi Requirement/business rule đã được phê duyệt, có migration/version mới và runtime validation trước khi trở thành locked baseline tiếp theo.

Database V1.1, V1.2, V1.3, and V1.4 are preserved validated historical locked snapshots. Database V1.5 below is the current locked local/development physical baseline. LOCK describes schema authority during development; it does not imply production readiness. Any future schema change must be driven by an approved requirement/business-rule change and must receive a new migration/version plus runtime validation before becoming the new locked baseline.

## Database V1.2 invoice lifecycle

- Business changes: **APPROVED** by `DATABASE_V1_2_CHANGE_REQUEST.md` and the synchronized Requirement/API Spec. Physical implementation was built as a separate version; V1.1 artifacts and its historical validation record remain unchanged.
- `Database V1.2/schema.sql` retains all 25 V1.1 public tables and existing database rules. Invoice adds `draft`, defaults status to `draft`, makes `due_date` nullable, adds nullable `finalized_at`, and enforces the named `invoices_lifecycle_consistent` CHECK. Amount fields, total CHECK, revision, payment ledger and Zalo log schema remain unchanged.
- `Database V1.2/seed.sql` includes a valid draft invoice, finalized unpaid invoice and paid invoice with synthetic data.
- `Database V1.2/migrations/V1_1_to_V1_2.sql` was tested on a disposable PostgreSQL 18 cluster: an empty V1.1 database upgraded successfully; a V1.1 database containing invoice rows was rejected and rolled back. Existing invoice rows are not backfilled because V1.1 has no authoritative finalize timestamp; an audited data-transition plan is required before upgrading a populated database.
- Clean-install schema: **PASS**. Seed: **PASS**. Runtime validator: **33/33 PASS** (21 V1.1 regression checks + 12 V1.2 lifecycle checks), **0 failed**, on a fresh PostgreSQL 18 test database. Validator fixtures were executed in a transaction and rolled back.
- The successful V1.2 validation satisfied its baseline gate. **Database V1.2: LOCK; historical locked predecessor, 25 public tables.** Database V1.1 remains the earlier preserved historical snapshot (25-table hardening snapshot; runtime 21/21 PASS); V1.2 superseded V1.1 until the V1.3 baseline transition recorded below.
- V1.2 does not implement backend behaviors: due-date calculation (`finalized local date + 5 days`), payment/Zalo eligibility and gating, scheduler idempotency, contract-anchored billing periods and final-period calculations. These remain backend tests/implementation requirements. At the time of the V1.2 snapshot, the next step was Prisma V1.2 remapping against that then-current physical schema.

```yaml
Database V1.2 business changes: APPROVED
Schema: PASS
Seed: PASS
Runtime validation: 33/33 PASS
Failed: 0
PostgreSQL version: 18
Public tables: 25
Database V1.2: LOCK
Baseline: historical predecessor
Database V1.1: preserved historical snapshot
```

Database V1.2 was the current locked database baseline before V1.3. It is now preserved as a historical locked predecessor.

## Database V1.3 Contract audit/revision

- Business decisions are approved and synchronized in Requirements/API Spec. Database V1.3 adds Contract revision tracking and durable audit history on the unchanged V1.2 baseline.
- The V1.3 schema adds `contracts.revision` and exact status/revision consistency: draft is revision 0; active/expired/terminated are revision >=1. It adds the explicit unique `(contract_id, owner_id)` key required by tenant-safe Contract audit references.
- `contract_change_history` stores official revision events only, with approved event/reason/JSON-object checks, unique `(contract_id, revision)`, Owner/Contract/actor same-tenant FKs, an Owner-scoped history index, and a trigger that blocks UPDATE and DELETE.
- Draft create/edit and renewal draft creation remain unaudited. Activation establishes revision 1. Existing V1.2 draft rows map to 0 and non-draft rows map to 1; no historical rows are fabricated.
- The V1.3 seed carries the V1.2 synthetic Contract baseline with status-correct revision values and no synthetic audit history.

### Fresh-install validation

- Fresh-install `schema.sql`: **PASS**.
- Fresh-install `seed.sql`: **PASS**.
- Runtime validator: **64/64 PASS**, **0 failed**, on **PostgreSQL 18**.
- V1.3 contains **26 public tables**. Contract audit/revision constraints were verified by this runtime validator.
- **Database V1.3 was the locked fresh-install baseline before V1.4 and is now the historical locked predecessor.** Database V1.2 remains an earlier historical locked predecessor (25 public tables; runtime 33/33 PASS).

### Known migration verification

The V1.2 → V1.3 populated migration script is prepared, but its populated-data path has **not yet been runtime-tested** on a disposable V1.2 database containing Contracts. Do not report the migration as PASS.

Before using this migration on any staging or production database containing V1.2 data:

1. Take a recoverable backup.
2. Restore or prepare a disposable populated V1.2 test database.
3. Run `Database V1.3/migrations/V1_2_to_V1_3.sql` against that disposable database.
4. Verify the Contract count is preserved.
5. Verify all pre-existing Contract fields are preserved.
6. Verify draft Contracts map to revision 0.
7. Verify active, expired, and terminated Contracts map to revision 1.
8. Verify zero fabricated `contract_change_history` rows were created.
9. Verify foreign keys and constraints remain valid.
10. Only after these checks pass, authorize the production migration under the deployment process.

This verification is a deployment gate for upgrading an existing populated database. It was not required for the V1.3 fresh-install snapshot. At the time of this V1.3 validation, V1.4 had become the current fresh-install development baseline; V1.4 is now historical after V1.5. LOCK does not mean production-ready; see [`PRODUCTION_READINESS.md`](PRODUCTION_READINESS.md).

```yaml
Database V1.3 fresh-install schema: PASS
Database V1.3 seed: PASS
Runtime validation: 64/64 PASS
Failed: 0
PostgreSQL: 18
Public tables: 26
Database V1.3: LOCK
Baseline: historical locked predecessor (fresh-install snapshot)
V1.2 → V1.3 populated migration runtime verification: PENDING
Database V1.2: historical locked predecessor
```

## Database V1.4 Room Images

- Database V1.4 artifacts implement the approved additive Room Images design on top of V1.3: one `room_images` association table, shared opaque `storage_key` references across Rooms, at most one cover per Room, and a concurrency-safe maximum of five associations per Room. The seed intentionally adds no image rows because no real binary storage fixtures exist.
- Database V1.4 adds the approved Room Images table to the unchanged V1.3 baseline. Shared opaque storage-key references across Rooms, one cover per Room, immutable Room association identity, and a maximum of five associations per Room are represented. V1.3 source artifacts remain unchanged.
- Fresh V1.4 `schema.sql`: **PASS**. V1.4 `seed.sql`: **PASS** and intentionally creates no RoomImage rows.
- V1.4 runtime validator: **87/87 PASS** on PostgreSQL 18 (64 inherited V1.3 regression checks + 23 Room Images checks). The same 87 checks also passed after migrating the populated V1.3 test database.
- Populated V1.3 → V1.4 migration: **PASS** on a disposable PostgreSQL 18 test database. All row values across the 26 existing public tables were preserved; public table count became 27 and `room_images` started at zero rows.
- Concurrency test: **PASS** with four existing associations. Concurrent attempt #5 committed; competing attempt #6 was rejected with retryable SQLSTATE `40001`; final association count was five. A stale `REPEATABLE READ` transaction also failed with serialization SQLSTATE `40001` after a newer gallery insert committed. The guard uses a nonblocking per-Room advisory transaction lock before mutating the Room's `updated_at`, followed by the statement-level count check.
- Original V1.3 clean install, seed, and runtime validator were independently rerun unchanged: **64/64 PASS**.
- Prisma `format`, `validate`, and `generate`: **PASS** (`prisma generate` completed with normal Windows filesystem access; no database mutation command was run).
- The storage-key reference index, shared key across Rooms, duplicate key rejection within a Room, cover uniqueness, max-five behavior, identity immutability, and FK `RESTRICT` were checked by the 23 V1.4 runtime checks. Requirements and API Spec were reviewed; no direct mismatch was found and neither file changed.
- Runtime checks ran only on isolated disposable test databases on port 55432. `Goctro_test3` and port 5432 were not accessed.
- **Database V1.4: historical locked predecessor, 27 public tables. Database V1.3: historical locked predecessor, 26 public tables.** V1.4 remains a validated snapshot; Database V1.5 below is now the current local/development locked baseline.

```yaml
Database V1.4 schema: PASS
Clean-install schema: PASS
Seed: PASS (no RoomImage fixture rows)
Runtime validation: 87/87 PASS
Populated V1.3 -> V1.4 migration/preservation: PASS (26 existing tables preserved; room_images=0)
RoomImage constraints: PASS (23 V1.4 checks)
Concurrency: PASS (fifth insert committed; competing sixth rejected, SQLSTATE 40001; final count=5)
Original V1.3 regression: 64/64 PASS
Prisma format: PASS
Prisma validate: PASS
Prisma generate: PASS
PostgreSQL version: 18
Public tables: 27
Database V1.4: LOCK
Baseline: historical locked snapshot (superseded by V1.5)
Database V1.3: historical locked predecessor
```

Database V1.4 was the current locked schema baseline before V1.5. Its migration was tested on a disposable database; see [`../../SmartRentalManagement/docs/07_modules/public-marketplace/DATABASE_V1_4_ROOM_IMAGES_MIGRATION_REPORT.md`](../../SmartRentalManagement/docs/07_modules/public-marketplace/DATABASE_V1_4_ROOM_IMAGES_MIGRATION_REPORT.md).

## Database V1.5 Contract Idempotency

- Database V1.5 adds exactly one table, `contract_idempotency_requests`, on top of V1.4. Its namespace is Owner + authenticated Account + Contract operation + SHA-256 key digest; the request fingerprint and encrypted successful response support future durable replay. No TTL or cleanup behavior is included.
- The additive migration `Database V1.5/migrations/V1_4_to_V1_5_contract_idempotency.sql` was applied transactionally to local PostgreSQL 18.6 database `Goctro_test3` on port 5432. All 27 pre-existing public table row counts and sorted-row SHA-256 fingerprints matched the pre-migration snapshot; all 9 existing `room_images` rows were preserved. The new table contains zero rows.
- Clean V1.4 + seed, populated V1.4 + two RoomImage records, and fresh V1.5 schema paths were validated on disposable PostgreSQL 18 databases. Each resulting V1.5 runtime validation passed 90/90. V1.4 runtime checks passed 69/69 and its seed-only validator passed 18/18. Disposable databases were removed after capturing results.
- On Goctro_test3, the post-migration V1.5 rollback-only validator passed **90/90**, with no failed checks. PostgreSQL reported 28 public tables, including the new empty table; 27 old table fingerprints and 9 RoomImage rows remained unchanged.
- Prisma `validate` and `generate` passed for the V1.5 mapping. A rollback-only Prisma create/read probe passed for BigInt, Bytes, and Owner/Account relations, and left zero rows.
- Backend regression suites passed: Auth 20/20, Contract 125/125, Property/Room 44/44, Resident/Occupancy 49/49, Invoice/Zalo 36/36, Room Images 21/21 (295/295 total). The first sandbox attempt was blocked by loopback `EACCES`; rerunning with local loopback access passed all suites.
- Backend `/api/health`, `/api/health/db`, and frontend `/login` each returned HTTP 200 after `npm run dev:all`. Backend typecheck and build remain blocked by legacy Prisma model/field references elsewhere in the backend; no backend implementation was changed in this database pass. Contract runtime replay was a separate backend task and is now implemented for create/activate/renew/terminate; see [`CONTRACT_DURABLE_IDEMPOTENCY_RUNTIME_IMPLEMENTATION_REPORT.md`](../../SmartRentalManagement/docs/07_modules/contract/CONTRACT_DURABLE_IDEMPOTENCY_RUNTIME_IMPLEMENTATION_REPORT.md). The V1.5 schema and its lock remain unchanged; document-upload replay is excluded.
- **Database V1.5: historical locked predecessor, 28 public tables. Database V1.4: historical locked predecessor, 27 public tables.** LOCK means no ad hoc schema changes during backend/frontend work. Future schema changes require an approved requirement/business-rule change, a new version/migration, and runtime validation before the next baseline can be locked.

```yaml
Database V1.5 schema: PASS
Migration V1.4 -> V1.5: PASS
Seed: PASS (V1.4 seed; no V1.5 replay fixtures)
Runtime validation: 90/90 PASS
PostgreSQL version: 18.6
Public tables: 28
Old table fingerprints: 27/27 unchanged
Existing room_images rows: 9/9 preserved
Prisma validate: PASS
Prisma generate: PASS
Regression suites: 295/295 PASS
Backend typecheck/build: BLOCKED by existing legacy Prisma references
Database V1.5: LOCK (historical predecessor; superseded by V1.6)
Database V1.4: historical locked predecessor
Contract create/activate/renew/terminate durable replay: IMPLEMENTED separately; Database V1.5 unchanged
Contract document-upload durable replay: EXCLUDED
```

The authoritative V1.5 migration/validation details, backup location, baseline fingerprints, startup checks, typecheck/build diagnostics, and rollback guidance are recorded in [`../../SmartRentalManagement/docs/07_modules/contract/DATABASE_V1_4_TO_V1_5_MIGRATION_FINAL_REPORT.md`](../../SmartRentalManagement/docs/07_modules/contract/DATABASE_V1_4_TO_V1_5_MIGRATION_FINAL_REPORT.md). Runtime Contract replay evidence is in the linked implementation report. This local/development lock does not claim production deployment.

## Database V1.6 — Resident avatar + Account phone uniqueness

**Business decisions:** APPROVED. **Goctro_test3 physical status:** MIGRATED + VALIDATED. **Database lock:** LOCKED FOR LOCAL/DEV; V1.5 is the historical locked predecessor.

Approved additive changes: nullable `residents.avatar_storage_key TEXT` for a relative external avatar storage reference; unique non-null avatar keys; normalize approved existing Vietnamese Account phone values to `+84XXXXXXXXX`; PostgreSQL unique partial index for non-null `accounts.phone`. Public table count remains 28. One shared backend normalizer contract `normalizeVietnamPhone(input)` is specified for Auth, profile phone changes, and account provisioning. This database pass does not implement the helper, resident provisioning, avatar upload, or Zalo delivery.

### Runtime evidence

- Goctro_test3: PostgreSQL 18.6, 28 tables, phone audit 6 non-null / 0 unsupported / 0 normalized duplicate groups; backup and `pg_restore --list` PASS.
- Clean V1.5 migration path: V1.5 validator 90/90, V1.6 migration PASS, V1.6 validator 97/97.
- Populated V1.5 test path: PASS with seeded Owner/Admin/Resident/Property/Room/RoomImage/Occupancy/Contract/Invoice/invitation records; counts, IDs, and normalized row fingerprints preserved.
- Fresh V1.6 schema + canonical V1.6 seed: V1.4 seed-validator rules 18/18, V1.5 regression validator 90/90, V1.6 validator 97/97.
- Goctro_test3 migration and V1.6 validator: PASS; table count remains 28, 14 existing Residents have a NULL avatar key, all 6 Accounts with phone use canonical format, and required row/ID fingerprints match.
- Phone normalizer examples: 10/10; real PostgreSQL concurrent duplicate-phone writes: one succeeds and the other is rejected with SQLSTATE `23505`.
- Prisma validate: PASS. Prisma generate: PASS after stopping the verified project backend processes that held the loaded query-engine DLL. Generated V1.6 Client mapping was verified.
- Application health `/api/health`, `/api/health/db`, `/api/v1/auth/csrf`: HTTP 200 after backend restart. Required backend suites: 302/302 PASS.
- Backend typecheck/build: each reports 174 existing TypeScript diagnostics; zero are related to V1.6 `avatarStorageKey` or Account phone mapping. No backend implementation was changed.

`Database V1.6/schema.sql`, `erd.md`, `runtime_validator.sql`, and `migrations/V1_5_to_V1_6_resident_avatar_account_phone.sql` record the former Goctro_test3 physical shape. V1.6 is now the historical locked predecessor to V1.7. Its migration-time evidence and backup/fingerprint paths remain in `SmartRentalManagement/docs/03_database/DATABASE_V1_6_RESIDENT_AVATAR_ACCOUNT_PHONE_MIGRATION_REPORT.md`.

`LOCK` means no ad hoc schema edits during implementation. A future approved rule change requires a new version/migration plus runtime validation before replacing the locked baseline.

## Database V1.7 Billing — locked historical predecessor to V1.8

- **Business/design status:** APPROVED. **Goctro_test3 physical status at the V1.7 promotion snapshot:** V1.7 migration and post-migration validation PASS. V1.7 was the locked local/development baseline at that time and is now the historical locked predecessor to V1.8. V1.6 remains its historical predecessor.
- **Additive design implemented in rehearsal:** 12 tables: `utility_tariffs`, `utility_tariff_versions`, `electricity_tariff_tiers`, `property_facilities`, `property_pricing_items`, `property_price_versions`, `flexible_service_charges`, `parking_entitlements`, `meter_readings`, `invoice_meter_reading_snapshots`, `invoice_items`, and `invoice_item_electricity_tiers`. The approved `parking_entitlements` refinement separates entitlement kind (slot/card) from billability (paid/free/legacy-unclassified). Expected and observed result is 40 public tables.
- **Locked rules:** utility versions selected at invoice `period_start`; Flexible price selected by server at `occurred_at`; deterministic decimal-safe half-up VND rounding; Fixed Service applies to every eligible Room at its Property; Water locality/provider metadata is audit-only; recurring Parking has no proration and a mid-period start first bills next period; `invoice_items` is authoritative for new V1.7 finalized itemized invoices and aggregate invoice fields are derived compatibility snapshots.
- **Legacy preservation:** finalized V1.6 invoices remain aggregate-only with exact totals and no fabricated breakdown; legacy Amenity/subscription/cycle and Parking records are retained without inferred business state.
- **Rehearsal result:** V1.6 schema + seed + validator passed 97/97 on a disposable PostgreSQL 18.6 baseline; V1.7 migration and overlay seed passed; V1.7 validator passed 171/171 (97 V1.6 regression + 74 V1.7 checks). A clean-install V1.7 schema + seed also passed the 171/171 validator. Both paths produced the expected 40 public tables. Old V1.6 records were preserved, with finalized legacy invoices marked `LEGACY_AGGREGATE` and no fabricated invoice items. Prisma format, validate, and generate passed.
- **Rehearsal note:** The earlier design, guard, and compatibility reports accurately record that `Goctro_test3` was not connected or changed during those earlier tasks. The target-specific apply and validation completed later and is recorded below.

### Protected-target guard reconciliation — 2026-10-13

- The V1.7 migration now denies the actual protected target `Goctro_test3` by default. It requires the exact one-session setting `goctro.allow_locked_db_migration = 'V1.7'`; missing or wrong values are rejected before schema mutation. The setting is not persisted and is checked only by the migration.
- PostgreSQL 18.6 disposable rehearsal was rerun after the guard change: V1.6 schema/seed PASS, V1.6 runtime 97/97 PASS, migration and V1.7 overlay seed PASS, upgrade validator 171/171 PASS, 40-table inventory, and clean-install schema/seed/validator 171/171 PASS. Missing/wrong authorization failed with SQLSTATE 42501; exact V1.7 same-session authorization succeeded. Legacy V1.6 row-count/content fingerprints were preserved.
- At the time of this guard-reconciliation task, `Goctro_test3` remained unconnected and unchanged. This records the historical guard-only result; the later target apply is recorded below.
- Evidence: [`DATABASE_V1_7_PROTECTED_TARGET_GUARD_RECONCILIATION_REPORT.md`](../../SmartRentalManagement/docs/07_modules/invoice-zalo/DATABASE_V1_7_PROTECTED_TARGET_GUARD_RECONCILIATION_REPORT.md).

### Populated-target validator compatibility — 2026-10-13

- Split V1.7 validation into `Database V1.7/runtime_validator.sql` (CORE, 71 checks) and `runtime_validator_fixture.sql` (FIXTURE, historical 171-check suite). CORE uses generated transactional probe records and does not require V1.7 demo IDs or overlay seed. FIXTURE retains the exact seed-dependent regression assertions and must only run after the synthetic V1.7 seed.
- Classified the original V1.7-01..74 checks: 01, 02, 04, 13–17 are target-independent structural/invariant assertions; 03, 05–12, 18–74 depend on the seeded V1.6 baseline, exact V1.7 demo rows, or fixed probe IDs as written. Portable equivalents for the business probes are in CORE with transaction-generated context.
- Populated migration-only rehearsal on PostgreSQL 18.6: V1.6 schema/seed/runtime 97/97 PASS; three extra synthetic Rooms, Residents, and draft Contracts added; V1.7 migration applied without V1.7 seed; CORE 71/71 PASS; public tables=40. Stable row counts/content fingerprints for all 28 original tables passed. Three finalized legacy invoices remained `LEGACY_AGGREGATE` with zero fabricated `invoice_items`; three active Parking assignments retained NULL `entitlement_id`.
- Synthetic upgrade rehearsal: V1.6 baseline + V1.7 migration + `seed.v1_7.sql`; CORE 71/71 PASS and FIXTURE 171/171 PASS. Clean install: V1.7 `schema.sql` + combined `seed.sql`; CORE 71/71 PASS and FIXTURE 171/171 PASS. Each path had 40 public tables. Combined path execution count is 242 checks per path (71 CORE + 171 FIXTURE; overlap is intentional, not a unique-assertion total).
- Prisma format, validate, and generate: PASS using an unreachable placeholder URL; no database command was run by Prisma. Format was idempotent on the final run.
- **Safety/status at that time:** `Goctro_test3` was not connected to or changed. V1.7 had not yet been promoted. A populated-target apply must run CORE only and must not run either V1.7 seed; the completed apply followed this rule.
- Evidence: [`DATABASE_V1_7_POPULATED_TARGET_VALIDATOR_COMPATIBILITY_REPORT.md`](../../SmartRentalManagement/docs/07_modules/invoice-zalo/DATABASE_V1_7_POPULATED_TARGET_VALIDATOR_COMPATIBILITY_REPORT.md).

### Goctro_test3 apply and post-migration validation — 2026-10-13

- Target verified immediately before migration: `127.0.0.1:5432/Goctro_test3`, PostgreSQL 18.6, V1.6, 28 public tables, none of the 12 V1.7 tables, and neither V1.7 marker column.
- A new full custom-format backup was created outside the repository at `C:\Users\PHUONG\AppData\Local\Temp\Goctro-db-backups\Goctro_test3_pre_v1_7_20261013_193214.dump` (171,618 bytes). `pg_restore --list` succeeded; SHA-256: `F2791FEDE704E9C8EB5DB15BFA7416F6CA2813B93CA03D9BB1E725F0018439C1`.
- The reviewed migration artifact (SHA-256 `1D7D5AA2D23CA571FF3FDD86374860BE2CE03AF1671E9E273F54339910CF014D`) ran once with `ON_ERROR_STOP=1` and the exact protected-target authorization in the same PostgreSQL session. Migration: **PASS**; no V1.7 seed or fixture validator was run.
- Public tables increased **28 → 40**. All 12 approved V1.7 tables and both marker columns exist. Each new V1.7 table remains empty; no synthetic billing records were added.
- All 28 V1.6 tables retained their row counts and deterministic row-content fingerprints (**28/28 PASS**). The four existing invoices retained their IDs, statuses, periods, rent, electricity, water, service and total amounts, meter readings, finalization/due dates, and revisions. The three finalized invoices are `LEGACY_AGGREGATE`; the draft remains `NOT_FINALIZED`; no `invoice_items` were fabricated. All three existing parking assignments remain and have NULL entitlement; no paid/free status was inferred.
- V1.7 populated-target CORE validator: **71/71 PASS, 0 failed**. Its probe data was rolled back; a full post-validator fingerprint comparison confirmed the legacy rows and all post-migration rows remained unchanged. The fixture validator was not run on this populated database.
- Prisma `format`, `validate`, and `generate`: **PASS**. The first sandbox `generate` attempt hit Windows `EPERM`; retry in the local filesystem context succeeded. Prisma did not connect to or write to PostgreSQL.
- Backend was started for smoke verification. `/api/health` and `/api/health/db` both returned **HTTP 200**. This confirms local connectivity only; it does not implement or complete Billing.
- **Promotion result at the time: PASS. Database V1.7 became the locked local/development physical baseline on PostgreSQL 18.6 with 40 public tables. It was later superseded by V1.8; V1.6 is the historical locked predecessor to V1.7.**
- Detailed evidence: [`DATABASE_V1_7_LOCKED_DB_APPLY_POST_MIGRATION_VALIDATION_REPORT.md`](../../SmartRentalManagement/docs/07_modules/invoice-zalo/DATABASE_V1_7_LOCKED_DB_APPLY_POST_MIGRATION_VALIDATION_REPORT.md).

## Database V1.8 — recurring Parking Invoice linkage (current local/development baseline)

- **Business decision:** APPROVED. **Physical implementation:** PASS. **Goctro_test3:** PostgreSQL 18.6 at `127.0.0.1:5432`, promoted from V1.7 to V1.8. **Database V1.8:** LOCKED as current local/development baseline with 40 public tables. V1.7 remains the historical locked predecessor.
- **Approved schema delta:** removed global `UNIQUE(parking_assignment_id)` (`invoice_items_parking_assignment_id_key`) and added `invoice_items_invoice_parking_assignment_unique` on `(invoice_id, parking_assignment_id) WHERE parking_assignment_id IS NOT NULL`. A Parking assignment may recur on separate invoices and may appear no more than once on one invoice. Existing composite Owner/Property FK and `invoice_item_source_shape` trigger remain. No table/column was added, and no row, invoice amount, finalized snapshot, legacy aggregate, or parking record was rewritten.
- **Migration:** `Database V1.8/migrations/V1_7_to_V1_8_recurring_parking_invoice_linkage.sql` passed in the disposable V1.7→V1.8 upgrade rehearsal and on Goctro_test3. It uses one transaction, an `ACCESS EXCLUSIVE` lock across preflight/DDL, exact V1.7 inventory/constraint guards, and the protected-target session authorization. A negative preflight test with a non-PARKING assignment link stopped before DDL and retained the original constraint. The same fixture's wrong-category data was test-only and isolated.
- **Upgrade rehearsal:** PostgreSQL 18.6, synthetic V1.7 schema/seed and regression checks before migration; V1.7 CORE 71/71 and FIXTURE 171/171 passed. V1.8 migration passed; V1.8 CORE **78/78 PASS**. Deterministic fingerprints for invoices, invoice items, legacy finalized invoices, parking assignments, and entitlements were identical before/after.
- **Clean install:** direct V1.8 schema and synthetic seed succeeded on a separate disposable DB; 40 public tables. V1.8 CORE **78/78 PASS** and inherited V1.7 FIXTURE **171/171 PASS**.
- **Invoice integration:** `npm run test:invoices --workspace=@goctro/backend` passed **138/138**, with PostgreSQL integration enabled against the migrated disposable V1.8 DB. It finalized recurring paid assignment `8404` on a later invoice after its prior invoice, persisted its Parking line and all other invoice items/tier/meter snapshots, reconciled totals, consumed the Flexible charge, and transitioned draft → unpaid with `finalized_at`. Re-finalize returned `INVOICE_ALREADY_FINALIZED` without duplicates. Two concurrent same-Invoice assignment inserts resulted in exactly one winner. Injected SQLSTATE `23514` rolled back invoice items, electricity tiers, meter snapshots/readings, and Flexible charge consumption.
- **Prisma:** `format`, `validate`, and `generate` passed with Prisma 6.12. The mapping now models the physical composite Owner/Property Parking relation as one-to-many and deliberately does not represent the partial unique predicate as a full `@@unique`; SQL remains authoritative for that predicate.
- **Goctro_test3 backup:** custom-format backup `C:\Users\PHUONG\AppData\Local\Temp\Goctro-db-backups\Goctro_test3_pre_v1_8_20261014_003237.dump`, 281,708 bytes; `pg_restore --list` PASS; SHA-256 `3809EA398CB0665C6A041F0418413D5DC0D9617BA436E8B4D2EE999D2DDBFC9E`.
- **Target preservation:** pre/post migration fingerprints match for all captured tables. Before and after: invoices 4 (including 3 finalized legacy aggregates); invoice items 0; parking assignments 3; parking entitlements 0. No seed was run against the populated target. Post-migration V1.8 CORE validator **78/78 PASS**, zero failed. The validator's probes rolled back.
- **Typecheck:** still reports 174 pre-existing legacy TypeScript diagnostics; zero diagnostics in the changed Invoice integration/repository/pricing files. Production application wiring still uses `UnconfiguredInvoicePricing`; this task did not enable production finalization. Payment was not started.
- **Current lock rule:** V1.8 is the current locked local/development physical baseline. LOCK prevents ad hoc schema changes during backend/frontend work; it does not prohibit a future approved requirement change with a new versioned migration and runtime validation.
- Detailed implementation and evidence: [`DATABASE_V1_8_RECURRING_PARKING_MIGRATION_IMPLEMENTATION_REPORT.md`](../../SmartRentalManagement/docs/07_modules/invoice-zalo/DATABASE_V1_8_RECURRING_PARKING_MIGRATION_IMPLEMENTATION_REPORT.md).

```yaml
Database V1.8 schema: PASS
V1.7 -> V1.8 rehearsal migration: PASS
V1.8 clean-install schema/seed: PASS
V1.8 CORE runtime validation: 78/78 PASS
V1.7 regression fixture on V1.8 clean install: 171/171 PASS
Invoice/Zalo backend suite with PostgreSQL integration: 138/138 PASS
Prisma format/validate/generate: PASS
Target backup and archive-list verification: PASS
Goctro_test3 preservation fingerprints: PASS
PostgreSQL version: 18.6
Public tables: 40
Database V1.8: LOCK (current local/development baseline)
Database V1.7: historical locked predecessor
Production Invoice finalization: still fail-closed / not wired
Payment: not started
```
