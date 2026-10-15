# Góc Trọ — Kế hoạch migration dữ liệu sang Database V1.1

**Trạng thái:** Draft để review; chưa phải phê duyệt chạy migration.  
**Source:** SmartRentalManagement legacy Prisma/PostgreSQL, chỉ đọc trong lần migration đầu.  
**Target:** Database V1.1 đã LOCK — PostgreSQL 18, 25 bảng, schema PASS, seed PASS, runtime validation 21/21 PASS.  
**Phạm vi:** Kế hoạch mapping, backup, backfill, validation, cutover và rollback. Tài liệu này không chứa migration code.

## 1. Executive summary

Project legacy hiện có 18 Prisma models và 3 migration lịch sử. Chúng biểu diễn dữ liệu demo/legacy, chưa tương thích trực tiếp với Database V1.1. Gap report phân loại 25 bảng đích: **MATCH 0, PARTIAL 7, MISSING 12, WRONG MODEL 6**. Vì vậy không được xem đây là nâng cấp tại chỗ hoặc chạy ba migration legacy lên target.

Kế hoạch đề xuất trích xuất từ bản sao legacy đã backup/restore-verified, map qua staging và nạp vào một database V1.1 sạch riêng. Owner mapping và Resident/CCCD scoping là blocker P0. Hóa đơn/thanh toán, hợp đồng/occupancy và hồ sơ file cần reconciliation hoặc quyết định nghiệp vụ trước khi cutover. Các dữ liệu không có target semantics phải được giữ trong archive/reconciliation export có kiểm soát, không bị loại bỏ âm thầm.

**Không thể xác định trước một tỷ lệ phần trăm “migrate tự động” đáng tin cậy** khi chưa inventory database runtime thật. Có thể tự động hóa các record có quan hệ và quy tắc rõ; record Owner/Resident/period/contract/payment mơ hồ bắt buộc review hoặc quarantine.

## 2. Migration principles

- `NEVER migrate without backup.`
- `NEVER modify the only copy of legacy data.`
- `NEVER delete source data during initial migration.`
- `NEVER assume ambiguous data.`
- `NEVER fake missing business history.`
- Legacy DB là **READ-ONLY SOURCE** trong migration đầu; target V1.1 là database riêng.
- Dùng bản restore kiểm chứng được làm extraction source. Giữ nguyên nguồn gốc và ID legacy trong mapping artifacts/reconciliation log, không dựa vào identity ID mới để tra ngược.
- Chỉ nạp business facts có bằng chứng. Không chuyển hành vi demo, default seed credential hoặc mock integration thành sự thật nghiệp vụ.
- Không thay schema V1.1 LOCK để “dễ import”. Mọi dữ liệu không biểu diễn được phải được archive có kiểm soát hoặc đưa `REQUIRES PRODUCT DECISION`.
- Migration runner tương lai phải idempotent theo `migration_run_id` và các bảng mapping; mỗi run phải tạo báo cáo, lỗi phải làm target run đó thất bại an toàn.

## 3. Source and target architecture

```text
Legacy PostgreSQL (READ-ONLY)
       ↓ pg_dump / verified restore
Disposable migration source copy
       ↓ extract + normalize + mapping review
Staging schema/files + legacy→V1.1 ID maps
       ↓ validated transactional load
Clean PostgreSQL 18 Database V1.1 target
       ↓ reconciliation + runtime validation + smoke tests
Cutover only after explicit sign-off
```

Target baseline là root `database/schema.sql`, `database/seed.sql`, `database/erd.md` và `DATABASE_CHANGELOG.md` hiện hành. Database V1.1 có 25 public tables; V1 historical snapshot 23 tables không còn là schema hiện hành. Không dùng Prisma schema/migration legacy làm target schema. Root documents là authority khi code cũ khác với Requirement, Function Matrix, API Spec hoặc locked database.

Source legacy facts đã quan sát tĩnh: `UserAccount`, `Property`, `Room`, `Tenant`, `Vehicle`, `LeaseContract`, `ContractOccupant`, `ContractExtension`, `ContractTermination`, `Invoice`, `InvoiceLine`, `MeterReading`, `Payment`, `Amenity`, `AmenityBooking`, `RoomViewingRequest`, `MaintenanceRequest`, `NotificationPreference`. Ba migrations legacy là `20261007182315_initial_schema`, `20261007195000_landlord_roles`, `20261007201500_room_marketplace_listing`. Runtime DB hiện có record nào chưa được xác minh trong static audit; Phase 0 phải inventory thực tế sau khi có backup.

## 4. Backup Strategy

Backup được tạo và xác minh **trước mọi extraction/migration thử nghiệm**, kể cả dry run. Backup được lưu ngoài disk chứa database; bản có PII phải được mã hóa, giới hạn truy cập, không commit lên Git hoặc gửi tới công cụ/chat không được phép.

### Backup A — Full logical database backup

Tạo custom-format dump, ví dụ bằng `pg_dump`:

```text
backups/legacy_pre_v11_YYYYMMDD_HHMM.dump
```

Bao gồm toàn bộ legacy database: schema, data, sequences, constraints, indexes, ownership/privileges cần thiết để khôi phục trong môi trường kiểm soát. Dùng tên duy nhất theo timestamp/run; **không overwrite** bản backup cũ.

### Backup B — SQL/plain-text backup

Cân nhắc thêm bản dễ inspect/manual recovery:

```text
backups/legacy_pre_v11_YYYYMMDD_HHMM.sql
```

Bản SQL cũng chứa PII và phải chịu cùng chính sách encryption/access/retention. Đây là bản bổ trợ, không thay thế custom dump đã restore-test.

### Backup C — Source files

Lưu snapshot/commit đầy đủ trạng thái trước migration của:

```text
database/schema.prisma
database/migrations/
database/seeds/
backend/
frontend/
docs/
```

Đảm bảo Git commit/tag đã được lưu ở remote/private repository phù hợp hoặc tạo bản sao source bất biến. Không chứa `.env`, password, token, key hoặc secret plaintext trong Git.

### Backup D — Git checkpoint

Procedure trước migration:

```text
git status
git add <approved source/docs only>
git commit -m "checkpoint before V1.1 data migration"
git tag pre-v1.1-data-migration
```

Đây là procedure; không chạy trong lượt tạo plan. Xác minh working tree và commit/tag đúng snapshot. Không đưa file dump/PII vào commit.

### Backup E — Environment/config inventory

Ghi vào runbook an toàn: PostgreSQL version, DB name, host/port, schema, Prisma version, Node version, migration versions, timezone/locale/encoding, extensions, role/grant requirements và danh sách tên environment variables cần để restore/cutover. Không ghi secret value trong tài liệu/Git. Secret phải backup bằng secret-management mechanism được phê duyệt và kiểm tra quyền khôi phục.

### Final pre-cutover backup

Sau khi đóng băng writes lên legacy, tạo rollback anchor mới:

```text
backups/legacy_final_precutover_YYYYMMDD_HHMM.dump
```

Không dùng backup đầu migration thay cho final backup này.

### Post-migration verified backup

Sau khi target đã nạp, reconcile, runtime validate và trước khi mở đầy đủ writes:

```text
backups/v11_postmigration_verified_YYYYMMDD_HHMM.dump
```

Lưu checksum/manifest và migration report liên quan cùng backup reference (không chứa secret).

## 5. Backup verification

Không coi file tồn tại hoặc exit code của dump là bằng chứng đủ. Trước khi migration được phép bắt đầu:

1. Xác nhận file dump không rỗng, checksum/size được ghi nhận, thời điểm và source DB đúng.
2. Kiểm tra custom dump bằng `pg_restore --list`.
3. Restore vào disposable database, ví dụ `legacy_restore_test`, dùng PostgreSQL tương thích với source.
4. So sánh số schema/table, critical row counts, sequence state, sample FK relationships và thống kê nguồn đã inventory.
5. Lưu restore-test result và người review trong backup manifest.

Nếu chưa restore-test thành công, hoặc count/relationships không giải thích được: **`MIGRATION MUST NOT START`**. Không thử restore đè lên source.

## 6. Mapping inventory

Mapping type: `DIRECT` = dữ liệu/quan hệ tương đương; `TRANSFORM` = phải chuẩn hóa/đổi semantics; `SPLIT/MERGE` = phân rã/hợp nhất; `ARCHIVE` = không có target semantics an toàn; `REVIEW` = cần người quyết định. “Auto map?” chỉ có thể là Yes khi khóa quan hệ và các điều kiện bên dưới đều được chứng minh; còn lại mặc định No.

| Legacy entity | V1.1 target | Mapping type | Auto map? | Manual review? | Data loss risk | Notes |
|---|---|---|---|---|---|---|
| `UserAccount` | `owners`, `accounts`, đôi khi `residents` | SPLIT/TRANSFORM | Một LANDLORD duy nhất có thể tạo candidate Owner/Admin | Có; mọi ADMIN/TENANT và account trùng contact phải review | Cao | Không chuyển role platform `ADMIN` tự động; password chỉ giữ nếu hash compatible và được security approve. |
| `Property` | `properties` | TRANSFORM | Có nếu map Owner rõ và mã không đụng trong Owner | Có khi `ownerId` null/ADMIN-created/owner conflict | Trung bình | `code` global source trở thành unique theo Owner; normalize status. |
| `Room` | `rooms` | TRANSFORM | Có khi Property/Owner rõ và area/rent/capacity hợp lệ | Có nếu thiếu diện tích/capacity hoặc condition không map | Cao | V1.1 yêu cầu area > 0, default capacity >= 1. Không tự đặt capacity. |
| `Tenant` | `residents`; `accounts`; có thể `room_residents` | SPLIT | Chỉ khi Owner evidence duy nhất, CCCD hợp lệ và quan hệ đã xác minh | Có cho CCCD, nhiều Owner, account, occupancy | Cao/P0 | Không dùng CCCD làm PK; chỉ unique `(owner_id,national_id)`. |
| `Vehicle` | `vehicles`; có thể `parking_slot_assignments` | SPLIT | Vehicle có thể map khi Resident→Owner rõ | Có cho slot text/Room/Contract/capacity | Cao | Slot chỉ được assignment khi slot vật lý và context chứng minh được. |
| `LeaseContract` | `contracts`, `room_residents`, `contract_documents` | SPLIT/TRANSFORM | Có khi Tenant/Room/Owner và thời hạn rõ | Có với occupant count, date/status/docs/overlap | Cao/P0 | Một representative bắt buộc; không tự suy diễn status từ ngày hiện tại nếu status gốc mâu thuẫn. |
| `ContractOccupant` | `room_residents` | TRANSFORM/REVIEW | Không mặc định | Có | Cao | Chỉ có Contract context; không có effective dates/status timeline đầy đủ. Giữ evidence; không bịa started/ended. |
| `ContractExtension` | `contracts.previous_contract_id` hoặc archive | REVIEW | Không | Có | Cao | Chỉ tạo successor nếu có snapshot/renewal evidence đủ. Không sửa hợp đồng cũ thành successor. |
| `ContractTermination` | `contracts` termination/settlement fields | TRANSFORM | Có nếu termination date/meter/deposit data hợp lệ | Có khi record thiếu/inconsistent hoặc amount không reconcile | Cao | Giữ evidence; deposit settlement phải phù hợp constraint V1.1. |
| `Invoice` | `invoices` | TRANSFORM | Không cho đến khi period và invoice reconciliation được duyệt | Có; P0 financial exceptions | Cao/P0 | `billingYear/month` không tương đương period; derive candidate theo `contracts.start_date` và quy tắc đã được approve. |
| `InvoiceLine` | `invoices` amount fields; archive detail nếu không biểu diễn được | MERGE/ARCHIVE | Chỉ type mapping rõ và tổng khớp | Có với `OTHER`, service chi tiết và mismatch | Cao | V1.1 không có invoice-line table; không âm thầm bỏ mô tả/line detail. |
| `MeterReading` | `invoices` previous/current meter + amounts | MERGE | Có khi tối đa một reading/type/invoice, đơn vị và amount hợp lệ | Có khi trùng, thiếu, hoặc lệch invoice line | Cao | Giữ giá trị previous/current và kiểm tra amount/total trước khi gộp. |
| `Payment` | Không có target equivalent cho thu manual; archive/approved representation | ARCHIVE/REVIEW | Không | Có; `REQUIRES PRODUCT DECISION` | Cao/P0 | Không tạo MoMo/ZaloPay transaction giả, session, provider event hay callback. |
| `Amenity` | `amenities`, `amenity_price_history` | TRANSFORM | Catalog candidate nếu Property scope rõ | Có với global catalog/giá/unit/effective time | Trung bình | Mỗi lịch sử giá cần evidence; giá hiện tại không đại diện lịch sử. |
| `AmenityBooking` | Archive; subscription/cycle chỉ khi có evidence membership thật | ARCHIVE/REVIEW | Không chuyển thành subscription | Có nếu sản phẩm muốn giữ lịch sử | Cao | Booking theo ngày/giờ không phải chu kỳ Pool/Gym 30 ngày. |
| `RoomViewingRequest` | `contact_requests` + archive fields | TRANSFORM/ARCHIVE | Guest name/phone/message/Room/Property nếu route rõ | Có khi Room/property không còn hoặc consent/retention mơ hồ | Trung bình | Preferred date/time và booking status không thành contact behavior. |
| `MaintenanceRequest` | `complaints`, có thể `complaint_history` | TRANSFORM | Current complaint có thể map khi resident/property rõ | Có với PUBLIC/ADMIN source, mất lịch sử và actor | Cao | Không tạo history giả; history chỉ ghi khi nguồn audit thật có sẵn. |
| `NotificationPreference` | `notification_preferences` | TRANSFORM | Có khi account đích map duy nhất | Có nếu semantics/role không tương đương | Thấp/Trung bình | Chỉ map các preference tương đương; không tạo notification history. |

Ngoài các target nêu trong bảng: không có legacy equivalent trực tiếp cho `account_invitations`, `invoice_zalo_oa_send_logs`, `amenity_subscription_cycles`, `parking_areas`, `parking_slots`, `parking_slot_assignments`, `complaint_history`, `notifications`. Không tạo lịch sử giả để lấp các bảng này. Các entities target tổng cộng phải đúng 25: `owners`, `properties`, `rooms`, `residents`, `accounts`, `account_invitations`, `contracts`, `contract_documents`, `room_residents`, `invoices`, `payment_transactions`, `invoice_zalo_oa_send_logs`, `amenities`, `amenity_price_history`, `amenity_subscriptions`, `amenity_subscription_cycles`, `parking_areas`, `parking_slots`, `vehicles`, `parking_slot_assignments`, `complaints`, `complaint_history`, `contact_requests`, `notifications`, `notification_preferences`.

## 7. Owner mapping — P0 blocker

Legacy `LANDLORD UserAccount → Property.ownerId` không phải target Owner relationship: V1.1 tách tenant root khỏi credential. Candidate mapping cơ bản:

```text
1 LANDLORD account có property ownership đã xác minh
→ 1 owners row
→ 1 admin accounts row
→ properties.owner_id
```

Không giả định mọi landlord account có đúng một nhóm Property nếu data cho thấy khác; một Owner vẫn có thể sở hữu nhiều Property. Những trường hợp dưới đây cần review trước khi tạo Owner:

- Property `ownerId IS NULL`;
- property do legacy `ADMIN` tạo hoặc ADMIN nhìn thấy toàn cục;
- `LANDLORD` không có Property, nhiều account cùng đại diện một Owner, hoặc một Property có dấu vết nhiều landlord;
- `Tenant.createdById` khác Property owner/contract Owner;
- account bị khóa, duplicate username/email/phone hoặc cùng profile credentials không rõ;
- seed/demo records không được xác nhận là dữ liệu thật.

Tạo mapping artifact (CSV mã hóa hoặc staging table chỉ trong migration environment), tối thiểu:

```text
legacy_user_account_id,new_owner_id,new_admin_account_id,mapping_status,mapping_reason,reviewer,reviewed_at
```

`mapping_reason` lưu evidence IDs (Property IDs/ownership source), không lưu secret. Mọi Property đích phải có đúng Owner đã duyệt. Property chưa xác định Owner bị quarantine, không gán cho “first landlord”, ADMIN hoặc Owner gần nhất. Owner mapping unresolved là P0: **NO CUTOVER**.

## 8. Resident / CCCD mapping — P0 blocker

Target Resident profile thuộc một Owner; unique là `(owner_id,national_id)`. Cùng CCCD giữa hai Owner khác nhau hợp lệ và là hai tenant profiles độc lập. Không tạo global person identity trong V1.1.

Tìm Owner theo thứ tự evidence để lập candidate, không tự chọn khi xung đột:

1. Contract → Room → Property → Owner đã duyệt;
2. active/historical contract và occupancy evidence khác;
3. `createdById` landlord — chỉ là supporting evidence, không ghi đè contract/property ownership conflict;
4. liên kết Room/Property record đã được xác minh;
5. manual review.

Nếu một Tenant có quan hệ được chứng minh với nhiều Owner, có thể tạo một Resident profile riêng cho từng Owner **chỉ** cho từng relationship có evidence. Không nhân bản chỉ vì cùng CCCD xuất hiện ở nhiều bảng. Không dùng `nationalId` của `ContractOccupant` để tự tạo Resident nếu không chứng minh được identity/consent/tenant scope.

Mapping artifact tối thiểu:

```text
legacy_tenant_id,legacy_national_id,target_owner_id,target_resident_id,evidence,confidence,review_status,reviewer,reviewed_at
```

Phân loại hồ sơ CCCD:

| Class | Điều kiện | Hành động |
|---|---|---|
| `AUTO_SAFE` | CCCD 12 số hợp lệ; Owner duy nhất, nhất quán qua contract→room→property; không conflict | Tạo profile trong Owner đó; log evidence. |
| `AUTO_WITH_WARNING` | Có một Owner evidence mạnh, thêm evidence supporting không mâu thuẫn nhưng có dữ liệu optional thiếu | Tạo candidate chỉ theo policy được approve; đưa warning vào reconciliation. |
| `MANUAL_REVIEW` | Không có Owner; nhiều Owner nhưng quan hệ không rõ; `createdBy` conflict; dữ liệu occupant không khớp Tenant; duplicate trong cùng Owner | Quarantine cho reviewer; không insert Resident cho tới khi quyết định. |
| `REJECT` | CCCD malformed hoặc record corrupt/không thể xác định danh tính dữ liệu | Giữ nguyên source, không sửa CCCD cho qua constraint; archive/quarantine có kiểm soát. |

Target cho phép `national_id NULL`; nếu source có CCCD invalid không được tự xóa/đổi sang NULL trừ khi quyết định nghiệp vụ cho phép và bản source value vẫn được bảo vệ trong quarantine. Không chạy lookup toàn hệ thống để tiết lộ CCCD xuyên Owner. Query/validation phải scope Owner theo mapping đã duyệt; API sau cutover lấy Owner từ authenticated session, không từ client.

## 9. Property / Room

### Property

- `Property.code/name/province/address/managerName` map lần lượt sang `property_code/name/province/address/manager_name` sau trim/normalization có ghi nhận. Không đổi tên/địa chỉ theo suy đoán.
- `Property.ownerId` map qua bảng Owner mapping; null/conflict → quarantine.
- Status: `ACTIVE → active`, `PAUSED → paused`, `UNDER_CONSTRUCTION → building`. `archived` chỉ dùng nếu source có evidence archived; không suy từ property đang trống. Lưu raw status trong reconciliation.
- Source `code` global unique; target unique trong Owner. Nếu cùng Owner có collision sau normalization, không tự đổi mã; manual resolution.
- `roomPrefix`, property default rent/area/count không thay thế records Room. Room count phải đếm từ `rooms`.

### Room

- Room mapping cần Property mapping đã hoàn tất. `roomNumber → room_code`; uniqueness `(property_id, room_code)` phải pass.
- `areaM2 → area_m2`, `rentOverrideVnd ?? Property.defaultRentVnd → default_rent` chỉ khi approved semantics; amounts không âm. Nếu Area null/0 hoặc thiếu rent hợp lệ, quarantine/requires decision; V1.1 yêu cầu `area_m2 > 0`, `default_rent >= 0`.
- `READY → available`, `MAINTENANCE → inactive` candidate; `UNAVAILABLE → inactive` candidate. Review status mapping vì target không giữ chính xác condition legacy; lưu raw source status trong artifact.
- `isListed → is_public` chỉ khi record được phép công khai và các public fields hợp lệ. Tắt public listing nếu không có consent/evidence, không làm phòng occupied/public ngoài ý muốn.
- V1.1 `default_capacity >= 1`; legacy Room không có capacity. `LeaseContract.occupantCount` có thể là evidence per contract, nhưng không chứng minh default capacity Room. Không tự suy ra capacity từ số occupants hiện có. Yêu cầu product decision/approved documented default trước khi load Room thiếu capacity.
- Không tạo `rooms` giả từ `Property.roomPrefix/count`; chỉ import Room rows thực có source identity/evidence.

## 10. Occupancy backfill

V1.1 `room_residents` là lịch sử occupancy, còn `ContractOccupant` chỉ danh sách người hợp đồng cụ thể. Candidate occupancy được dựng từ `LeaseContract → Room → Tenant` (representative) và `ContractOccupant` rows có Tenant link. Không mặc định mọi listed occupant đã ở toàn bộ hợp đồng.

Mỗi candidate report mang trạng thái migration ngoài schema:

- `reconstructed`: source có date/relationship đủ đáng tin để giữ `started_at`, `ended_at`, status;
- `partial`: biết quan hệ Room/Resident/Contract nhưng thiếu start/end/status chính xác;
- `unknown`: conflict hoặc không đủ căn cứ để tạo occupancy.

Không dùng `Contract.startDate` làm move-in date tự động, cũng không dùng contract end/termination date làm exact move-out date, trừ khi evidence/approved business rule xác nhận. `partial`/`unknown` không được backfill thành một lịch sử chính xác giả; giữ evidence trong migration artifact và quyết định xem có thể tạo record chỉ với dates được phép hay phải bỏ qua khỏi operational occupancy. Contract representative vẫn là representative; người ở khác là occupancy liên kết cùng Contract sau khi Owner/capacity kiểm tra. Không áp unique một active occupancy toàn platform.

Trước insert: xác minh Room/Resident/Contract cùng Owner qua composite context, contract dates, capacity, duplicate person links và overlap. Backend/API V1.1 phải kiểm tra capacity bằng transaction/locking; không vượt `resident_capacity`.

## 11. Contracts

Nạp base contract theo dependency `Owner → Property → Room → Resident representative → Contract`. `contractNumber → contract_no`; IDs qua `contract_mapping`, không tạo lineage bằng cách so chuỗi số.

- Ngày, rent, deposit, representative, Room phải rõ. Target `end_date > start_date`, capacity ≥ 1, rent/deposit không âm.
- `PENDING_SIGNATURE → draft` candidate; `ACTIVE → active` nếu còn đúng trạng thái business và không conflict; `TERMINATED → terminated` nếu evidence termination phù hợp; `CANCELLED` không có enum đích riêng nên cần xác nhận cách archive/biểu diễn, không ánh xạ tự động sang `draft` hay `terminated`.
- V1.1 cho một row `active` mỗi Room và backend kiểm tra date-range overlap cả hợp đồng tương lai. Phải phát hiện overlapping source contracts trước khi nạp/activate; không “chọn hợp đồng mới nhất” tự động.
- `occupantCount` không thay thế resident list; map vào `resident_capacity` chỉ khi được duyệt là đúng ý nghĩa, nếu không capacity là manual decision.
- Initial/latest meter values map vào contract initial/final chỉ khi semantics/date phù hợp; không dùng latest meter như final reading của hợp đồng đã kết thúc nếu không có evidence.

### ContractExtension

Không cập nhật ngày/rent của base contract để xóa lịch sử extension. Tạo `previous_contract_id` successor chỉ khi extension chứng minh một renewal mới, có snapshot terms và thời gian hợp đồng mới rõ. Nếu chỉ là sửa đổi điều khoản giữa cùng hợp đồng hoặc thiếu đủ snapshot, giữ record source trong archive/review. Nối lineage phải cùng Room/Owner, không self-reference, không nhiều successor, không date overlap; không suy successor chỉ theo `createdAt`.

### ContractTermination

Map `terminatedOn`, reason, final meter, deposit deduction/refund sang trường termination/settlement tương thích khi constraint và phép tính khớp. `deposit_settlement_amount = deposit_amount - deposit_deduction`; nếu refund legacy khác do fee/other adjustment, không ép số cho pass — quarantine/requires decision. Mọi record termination trùng/không khớp contract status cần review.

## 12. Contract documents / Object Storage Backup

Legacy `documentStorageKey`, `documentFileName`, `signedAt` nhúng trong Contract. V1.1 `contract_documents` lưu metadata/version; binary ở object storage.

1. Trước migration, inventory toàn bộ object/file theo storage key và xác định bucket/local uploads/provider.
2. Backup object storage riêng khỏi PostgreSQL: snapshot/bucket backup, object inventory, metadata/content length và checksum manifest; khóa quyền ghi nếu cần nhất quán.
3. Chỉ tạo version 1 khi contract mapping đúng, object thực sự tồn tại, tải/đọc được, và key không trỏ nhầm tenant. Tính SHA-256 trong migration; giữ key opaque; không đưa signed URL/token vào DB/log.
4. `signedAt` chỉ điền signed metadata nếu có evidence chữ ký thật. Filename hay contract status không chứng minh document đã ký.
5. `uploaded_by_account_id` chỉ điền khi audit evidence xác định uploader admin cùng Owner. Nếu không rõ, không bịa; do target field/FK requirements, cần xác định nullable/approved migration strategy trước run hoặc quarantine document.
6. Missing file, invalid object key, cross-owner key collision hoặc không thể xác minh quyền truy cập → quarantine; không tạo target document metadata như file dùng được.

## 13. Invoices — P0 financial

Legacy chỉ lưu `billingYear`, `billingMonth`; V1.1 lưu `period_start`, `period_end`. Billing anchor là `contracts.start_date`, không phải ngày đặt cọc hay ngày 1. API Spec nói quy tắc recurrence/edge date và due-date formula chưa fully specified; **không tự giả định kỳ 30 ngày hoặc tháng lịch**.

Algorithm kế hoạch cho từng invoice:

1. Resolve contract → Room/Property/Owner và `start_date` đã được duyệt.
2. Sinh một hoặc nhiều `candidate_period` theo anchor contract start date bằng recurrence rule đã được product/backend owner phê duyệt. `billingYear/month`, `dueDate`, createdAt, readings và line descriptions là evidence để so sánh, không phải thay anchor.
3. Nếu nhiều candidate, thiếu contract anchor, legacy invoice không thể xác định khoảng ngày, hoặc hai invoice map về cùng `(contract_id, period_start, period_end)`, đưa `MANUAL_REVIEW`; không insert.
4. Xác minh `period_end >= period_start`, totals và không duplicate kỳ. Target unique `(contract_id, period_start, period_end)`.
5. So sánh số lượng invoice, tổng tiền theo status/kỳ, tổng line/meter và `paid/unpaid` trước/sau; khác biệt phải được giải thích và ký nhận.

V1.1 invoice chỉ có `unpaid/paid`, không có `VOID` và không giữ `paid_at`/manual-payment ledger. `VOID` legacy hoặc invoice sửa/revised cần disposition được duyệt; không biến thành unpaid/paid để vượt schema. Paid status không được migrate như xác nhận giao dịch cổng thành công nếu chỉ có cờ status. Không cutover khi unresolved financial mismatch.

Tạo `invoice_reconciliation.csv` với legacy invoice ID, legacy billing year/month, contract anchor, candidate period, target invoice ID, total source/target, status source/target, payment evidence, collision flag, review status. Báo cáo bắt buộc: legacy invoice count, mapped count, unresolved count, duplicate candidate periods, sum totals before/after và paid/unpaid breakdown.

## 14. InvoiceLine / MeterReading

V1.1 `invoices` lưu amount buckets rent/electricity/water/service và previous/current meter values; không có `invoice_lines`/`meter_readings` detail table.

- Map `RENT/ELECTRICITY/WATER/SERVICE` vào đúng buckets nếu type, quantity, rate và amount semantics được chứng minh.
- `MeterReading` phải khớp loại điện/nước, đơn vị, previous/current values, rate, amount; duplicate same type/invoice, counter reset hoặc amount mismatch → review/quarantine.
- Reconcile line sum với legacy invoice `totalVnd`, meter amounts và V1.1 sum constraint. Không chỉnh amount để im lặng cân số.
- `OTHER` lines, mô tả chi tiết, nhiều khoản cùng bucket hoặc line data không thể biểu diễn đầy đủ phải được giữ trong archive/reconciliation export hoặc **`REQUIRES PRODUCT DECISION`** về retention/reporting. Không đổi locked schema và không silently discard line data.

## 15. Payments — REQUIRES PRODUCT DECISION

Legacy `Payment` là thu thủ công `CASH/BANK_TRANSFER/OTHER`, số tiền, reference/note/receivedAt. V1.1 `payment_transactions` chỉ biểu diễn attempt từ `momo/zalopay`, payment session, provider IDs/events, callback status. Đây không phải semantics tương đương.

- Không giả provider, `payment_session_id`, provider transaction/event ID, callback, success attempt hoặc timestamp callback.
- Không tạo payment transaction chỉ từ `Invoice.status = PAID`.
- Đề xuất mặc định an toàn: giữ payment ledger legacy nguyên trạng trong encrypted read-only archive/export có retention/access policy; map trạng thái hóa đơn chỉ khi business/financial reviewer xác nhận bằng chứng độc lập và cách hiểu target `paid`.
- Nếu business cần historical manual payments truy vấn trong V1.1, quyết định sản phẩm phải chỉ ra representation hợp lệ; không thêm schema trong plan này. Cho đến khi quyết định được duyệt, payment mapping là `REQUIRES PRODUCT DECISION`, có thể là cutover blocker.

Reconcile paid invoice count, payment sums theo method/time, invoice totals, partial/overpayment/refund anomalies và duplicate/related rows. Target V1.1 không hỗ trợ partial payments; không cắt payment thành provider attempts. Đảm bảo không sinh hai successful transaction cho cùng invoice.

## 16. Amenities

- `Amenity` catalog chỉ map khi Property scope rõ. Chuẩn hóa `name`, location, active, type/registration type theo approved value mapping; parking không đưa vào amenity domain.
- `priceVnd` có thể trở thành price history row chỉ khi có effective time đáng tin cậy. Giá hiện hành không chứng minh giá lịch sử; không backfill fictitious `effective_at` để tạo history đầy đủ.
- `AmenityBooking` theo `useDate/timeSlot` không biến thành `amenity_subscriptions` Pool/Gym. Archive booking history. Chỉ tạo subscription khi có evidence cư dân đã đăng ký membership chu kỳ 30 ngày và xác định được contract/Owner.
- Không dựng các cycle cũ hoặc `price_snapshot` suy diễn từ booking. Với subscription thật có cycle evidence, mỗi cycle đúng 720 giờ và giá snapshot tương ứng; nếu thiếu bằng chứng, review.
- Catalog data có thể map; registered/booking behavior phải tách biệt, không import hai flow trùng lặp.

## 17. Parking

Legacy `Vehicle.parkingSlot` là text, target cần `parking_areas`, `parking_slots` vật lý và `parking_slot_assignments` lịch sử.

1. Lấy distinct slot strings, chuẩn hóa chỉ để tạo candidate, giữ raw value trong mapping artifact.
2. Resolve vehicle → resident → Owner, Property/Room/active Contract; slot → Property/parking area; không dùng chuỗi slot để đoán physical area.
3. Phát hiện trùng slot, nhiều vehicle cùng slot, vehicle nhiều slot, invalid resident/Room/Owner và capacity theo hợp đồng.
4. Tạo physical slot/assignment chỉ khi bãi/slot và khoảng thời gian assignment kiểm chứng được. Không tạo slot cho `null`, label tự do hoặc tên khu không định vị được.
5. Assignment phải có resident/vehicle/room/contract, `started_at`, status và end/recall date nếu có. Một slot và vehicle không được active assignment trùng; số slot đang cấp không vượt contract resident capacity.

Dùng `parking_slot_mapping` để review:

```text
legacy_vehicle_id,legacy_slot_raw,target_owner_id,target_property_id,target_parking_area_id,target_slot_id,mapping_status,evidence,reviewer
```

Unverified slot strings được archive cùng Vehicle evidence, không thành slot vật lý.

## 18. Complaints

Map `MaintenanceRequest → complaints` nếu resident/Room/Property/Owner được resolve, category/content/priority/status map hợp lệ. `PUBLIC`, `ADMIN`, `TENANT_PORTAL` phải được review vì actor/report intent không nhất thiết là Resident complaint. Priority có thể map nếu source enum khớp target semantics; preserve raw values trong report.

Không tạo `complaint_history` giả từ `updatedAt` hoặc status hiện tại. Chỉ tạo history event nếu legacy audit event thực sự tồn tại và xác định actor/time/action. Nếu không, map current complaint và để history bắt đầu từ V1.1; giữ `legacy_maintenance_request_id` trong migration reconciliation reference. Không xóa source request.

## 19. RoomViewingRequest → ContactRequest

V1.1 nhận contact-only request, không có viewing appointment. Có thể map visitor name, phone, email, note/message, Property/optional Room khi liên hệ được định tuyến đúng. `preferredDate`, `preferredTime`, `CONFIRMED/COMPLETED` appointment semantics không chuyển thành active booking; giữ trong restricted archive/reconciliation nếu retention cần. Record mất Room/Property, consent chưa rõ hoặc phone invalid cần review. Không tạo `ContactRequest` nếu không thể gán Property/Owner an toàn.

## 20. Account migration

- `LANDLORD → admin Account` của Owner đã duyệt, theo Owner mapping.
- `TENANT → resident Account` chỉ khi Tenant được map tới đúng Resident/Owner và account liên kết một-một. Duplicate login, resident profile có nhiều account hoặc account không hoạt động cần review.
- Legacy platform-wide `ADMIN` không tự map sang Owner Admin. Đề xuất archive/deactivate và xử lý thủ công qua provisioning được phê duyệt; không gán Owner ngẫu nhiên.
- Target có một account admin/Owner và một account resident/Resident. Nếu source uniqueness/global email/phone conflicts với target constraints, không tự đổi email/phone; manual identity resolution.
- Password hash chỉ preserve sau khi xác nhận thuật toán/cost/encoding tương thích với auth V1.1 và security approve. Nếu không, force reset/invitation theo luồng bảo mật; không migrate plaintext/default/demo password. Không ghi credential/token vào mapping CSV/log.
- `isActive=false` có thể map `locked` khi semantics đúng; account role/status conflicts review. `last_login_at` map chỉ khi source field/audit tồn tại; không tạo giá trị.

## 21. Invitations

Direct-created legacy resident accounts không có invitation history. **Không fabricate `account_invitations`.** Bảng invitation chỉ dùng cho enrollment tương lai hoặc pending migration case được product/security approve. Không lấy password hoặc random token từ seed làm invitation hash; invitation token phải được tạo trong enrollment flow, lưu hash-only và không xuất plaintext vào audit.

## 22. Notification preferences / notifications

Map `NotificationPreference.invoice/overdue/contract/issue` sang các preference V1.1 tương đương (`new_invoice`, `overdue_invoice`, `expiring_contract`, `complaint_updates`) chỉ sau semantic review. Nếu source account không map được thì quarantine preference.

Không có notification history legacy; không tạo `notifications` giả từ toast, browser storage, logs hay preference. Notification inbox bắt đầu từ V1.1.

## 23. Staging, mapping artifacts and ID mapping

Ưu tiên staging schema/database riêng hoặc export files được mã hóa, access-limited và retention-limited; tuyệt đối không biến staging thành production source of truth. Không sửa source DB. Staging nên chứa raw snapshot reference, normalized candidate, validation result, review disposition và run ID.

Mapping artifacts tối thiểu:

```text
owner_mapping.csv
resident_mapping.csv
property_mapping.csv
room_mapping.csv
contract_mapping.csv
invoice_reconciliation.csv
parking_slot_mapping.csv
unresolved_records.csv
```

Mỗi artifact phải chứa legacy ID và target ID, không dùng tên/CCCD làm khóa join. Ví dụ:

```text
legacy_property_id → property_id
legacy_tenant_id + target_owner_id → resident_id
legacy_contract_id → contract_id
legacy_invoice_id → invoice_id
```

Tất cả writes giữ `migration_run_id` ở staging/report; production target chỉ nhận mapping metadata nếu schema đã có field phù hợp, không thêm schema chỉ để lưu legacy ID. Giữ external mapping artifact an toàn để audit/reconciliation. Không suy target identity từ sequence order.

## 24. Manual review / quarantine

Quarantine record giữ source DB read-only và ghi tối thiểu: entity, legacy ID, reason code, raw evidence reference, candidate mappings, PII sensitivity, reviewer, disposition, timestamp. Hạn chế sao chép CCCD/phone/email vào file phẳng; nếu cần, mã hóa và phân quyền. Không ghi secret/hash credential. Các disposition: approved mapping, archive-only, reject/corrupt, requires product decision.

Các lý do review bắt buộc: Owner unresolved; duplicate/malformed CCCD; Tenant có Owner conflict; thiếu Room capacity/area/rent; uncertain occupancy dates; contract overlap/status conflict; extension không đủ successor evidence; document/file/uploader/signed uncertainty; invoice period/total collision; manual payments; unsupported InvoiceLine; slot string unverifiable/capacity conflict; public maintenance source; unavailable Property for contact request; account identity/password compatibility.

## 25. Validation plan

Validation phải chạy trên target disposable/restored copy trước. Lưu queries/results/counters, không chỉ log `PASS`.

### Structural

- V1.1 target đúng **25 public tables** và schema fingerprint/version khớp locked PostgreSQL 18 baseline.
- PK/FK/CHECK/UNIQUE/index và trigger đúng; không orphan; mọi composite ownership relationship hợp lệ.
- Schema validator V1.1 PASS; migration runner không thay schema.

### Counts and lineage

- Per legacy entity: source total, eligible, auto mapped, warning, manual review, rejected, archive-only, target count.
- Mọi target row có provenance/mapping report; mọi skipped source row có disposition; reconcile one-to-many/split and merge explicitly.
- Sequence next values không collision với loaded IDs (target IDs do target-generated values); source IDs retained only in mapping artifacts.

### Tenant isolation

- Mỗi Property/Room/Resident/Contract/Invoice/Vehicle/Complaint/assignment liên kết đúng một Owner qua mapping.
- Owner A không query được data Owner B; duplicate CCCD cross-owner hợp lệ; duplicate trong same Owner bị reject.
- Contract/Resident/Room cross-owner occupancy/representative/vehicle/parking/complaint bị reject bởi composite scope/foreign keys.
- Không có unresolved Owner/Resident assignment trong operational target.

### Financial

- Invoice count, totals, period candidates, due dates, paid/unpaid status được reconcile và ký nhận.
- Contract start anchor được kiểm tra; không period bắt ngày 1 hoặc mặc định 30 ngày nếu không nằm trong recurrence rule được approve.
- `total_amount = rent + electricity + water + service`; MeterReading and InvoiceLine sums reconcile.
- Legacy manual payment sums/counts báo riêng; không có provider transaction giả/duplicate successful payment.
- Không còn duplicate invoice period/ambiguous candidate hoặc unresolved financial discrepancy.

### Contract and occupancy

- Representative, Room, Owner, dates, rent, deposit, capacity, status và termination settlement hợp lệ.
- Renewal predecessor đúng Room/Owner, không self/cycle/multiple successor/date overlap.
- Occupancy dates được gắn evidence; capacity không vượt contract; `partial/unknown` không bị mô tả là exact history.

### Parking, amenity and complaints

- Parking slot/vehicle không double-active; capacity hợp đồng không vượt; mọi assignment có start date và context.
- Hourly AmenityBooking không xuất hiện thành Pool/Gym subscription; cycle nào được tạo phải đúng 720 giờ và snapshot dựa evidence.
- Complaint current fields map; history chỉ gồm source audit thật; mọi unresolved legacy source/actor có disposition.

### Documents and API

- Mỗi contract document target có object tồn tại, checksum xác minh, version unique, Owner/scope và signed/uploader evidence.
- Sau cutover candidate, chạy backend smoke tests theo API Spec: auth, Owner isolation, Property/Room read, resident lookup, contract/invoice, payment semantics, complaints/contact; mọi critical endpoint không leak cross-tenant data.
- Runtime Database V1.1 validator phải PASS trên target; kết quả historical 21/21 là baseline đã LOCK, không thay thế runtime validator cho dataset đã migrate.

## 26. Dry-run procedure — mandatory

Không cutover sau lần dry run đầu.

```text
Restore verified legacy backup to disposable source copy
→ create clean V1.1 target using locked baseline
→ load approved mapping/staging data
→ run migration/backfill
→ run structural + tenant + contract + financial validation
→ produce migration report and unresolved queue
→ discard disposable target after artifacts are safely retained
```

**Dry run 1:** đo coverage, phát hiện collisions, sửa mapping artifacts/rules; mọi sửa đổi source/mapping phải version và review.  
**Dry run 2:** chạy lại từ đầu trên bản restore sạch, với cùng inputs đã đóng băng; yêu cầu expected clean result và exit criteria PASS.  
Nếu input/business decision đổi, tạo run mới từ clean copy. Không dùng target đã migrate dở làm đầu vào lần sau.

## 27. Migration report

Mỗi run tạo report bất biến, tối thiểu:

```text
migration_run_id
source backup name/checksum and restore-test reference
source/target schema versions and PostgreSQL versions
source counts by entity
target counts by table
mapped / skipped / archive-only / manual-review / rejected counts
owner and resident mapping coverage
errors and quarantined records by reason
financial reconciliation (counts, totals, periods, status)
document/object checksum result
runtime validator result
started_at / finished_at / operator / reviewer / approval references
```

Không đưa PII/secret plaintext vào summary report; restricted appendices/access-controlled artifacts nếu reviewer cần record-level follow-up.

## 28. Cutover strategy

Cutover checklist:

1. Announce maintenance window; xác nhận approvers, support contact, rollback decision owner.
2. Freeze legacy writes hoặc dừng app/API ghi; xác minh không có worker/job ghi nền.
3. Tạo **FINAL PRE-CUTOVER BACKUP** sau freeze, restore-test tối thiểu theo quy trình đã approve.
4. Chạy final full migration (hoặc delta chỉ khi delta procedure đã được thiết kế/test; mặc định kế hoạch này là full migration từ frozen snapshot).
5. Chạy validation, reconciliation, V1.1 runtime validator và backend smoke test trên target; sign-off counts, owner mapping, P0 records, financial result và unresolved dispositions.
6. Tạo `v11_postmigration_verified_...dump` trước khi mở writes đầy đủ.
7. Switch app connection/config sang DB V1.1 bằng deployment procedure đã review; verify app version/schema baseline/environment secrets.
8. Thực hiện read/write smoke test có kiểm soát và kiểm tra Owner isolation; theo dõi lỗi/latency/invoice/payment/tenant reports.
9. Giữ legacy database nguyên trạng read-only trong retention window. Không xóa hoặc đồng bộ ngược tự động.

Nếu local/pre-production chưa có real users, cutover có thể ngắn hơn, nhưng vẫn phải có backup/restore verification, clean target, reconciliation và smoke test. Không dual-write trong plan mặc định; chỉ xem xét nếu có requirement và thiết kế consistency/replay riêng được approve.

## 29. Rollback Strategy

### Pre-cutover rollback

Nếu migration target fail trước khi app switch: đóng/bỏ target V1.1 disposable và tạo target sạch rồi rerun từ backup/staging đã duyệt. Legacy source không cần rollback vì read-only/không bị sửa. Không “sửa tay” partial target rồi giả định run sạch.

### Post-cutover rollback

Nếu app đã switch và lỗi xuất hiện:

1. Kích hoạt incident/rollback decision; freeze writes vào V1.1 khi cần để xác định write window và ngăn thêm divergence.
2. Xác định mọi writes kể từ cutover: residents/contracts/invoices/payments/complaints/contact/preferences cùng timestamps/IDs.
3. Quyết định quay application/config về legacy chỉ khi V1.1 chưa nhận business writes không thể tái phát; legacy schema/semantics có thể xử lý an toàn các writes đó.
4. Nếu có writes mới chỉ hiểu được bởi V1.1, **không restore backup legacy cũ rồi bỏ writes**. Giữ V1.1 snapshot và export/reconcile writes; cần kế hoạch forward-fix hoặc approved reverse mapping trước rollback.
5. Short cutover window và freeze writes là biện pháp giảm rủi ro mặc định; không có dual-write mặc định. Nếu cần rollback sau khi mở writes, dừng ghi và quyết định forward-fix/replay bằng business owner/incident lead.

### Rollback decision criteria

Các lỗi sau là `NO CUTOVER` nếu phát hiện trước switch; sau switch là rollback/freeze decision:

- row counts mismatch không giải thích được, orphan FK hoặc schema validator fail;
- bất kỳ P0 tenant isolation/cross-owner violation;
- invoice count/financial totals/period conflict chưa reconcile;
- unresolved Owner mapping hoặc resident Owner/CCCD conflict vượt ngưỡng đã được business phê duyệt (mặc định ngưỡng cutover cho P0 unresolved = 0);
- contract representative/Room/lineage/settlement sai hoặc active overlap/capacity violation;
- parking double assignment/capacity violation;
- backup/restore path không hoạt động;
- runtime validator hoặc critical backend smoke test fail.

Không đặt threshold tùy ý cho tiền hoặc P0; approver phải chấp nhận mọi sai số/ngoại lệ trước khi run. Không áp dụng “pass with warning” cho P0.

## 30. Post-migration backup

Sau PASS toàn bộ và trước khi mở write đầy đủ, tạo:

```text
backups/v11_postmigration_verified_YYYYMMDD_HHMM.dump
```

Đây là snapshot đầu tiên của V1.1 chứa data migration đã xác minh. Lưu external storage, checksum, version/schema reference, run ID và report; restore-test theo chính sách backup. Không ghi đè.

## 31. Retention

Giữ tối thiểu các checkpoints:

- pre-migration verified backup;
- final pre-cutover backup;
- post-migration verified V1.1 backup.

Không xóa legacy backups ngay sau migration. Giữ đến khi migration được sign-off, smoke/regression pass, hết thời gian review đã định và business xác nhận data. Định nghĩa retention duration, deletion approver và secure deletion trước production run; archive chứa PII chịu chính sách tương đương backup.

## 32. Security / PII

Backup/mapping có CCCD, phone, email, contract và financial data là sensitive:

- encrypt at rest, dùng controlled transfer, giới hạn access least-privilege và audit truy cập;
- không lưu dump/PII trong public GitHub, không commit vào repo và không gửi production dump đến chat/tool không được phép;
- secrets/DB credentials/API keys ở secret manager; không ghi value vào plan, shell output hoặc report;
- dùng dữ liệu synthetic trong dry-run tests khi không cần production values; che/mã hóa identifiers trong summary;
- giới hạn retention; khi hết hạn, secure deletion theo policy và lưu deletion evidence không chứa dữ liệu nhạy cảm.

## 33. Exit criteria

Migration được chấp nhận/cutover chỉ khi tất cả điều kiện sau PASS:

```text
Backup restore verified
Owner mapping resolved for every operational record
No P0 tenant violation
Structural validation PASS (25-table locked baseline)
Critical counts accepted and all skips have disposition
Financial reconciliation accepted
Contract/occupancy/parking/document rules validated
Runtime DB validator PASS on migrated target
Backend smoke test PASS, including tenant-isolation checks
Rollback path and write-freeze procedure verified
Business + technical sign-off recorded
```

Nếu bất kỳ điều kiện nào thiếu/fail: **`DO NOT CUTOVER`**.

## 34. Open product decisions

Các quyết định sau cần được giải quyết trước khi dữ liệu liên quan được nạp; không thay locked schema trong tài liệu này:

| Decision | Source conflict/gap | Options | Recommendation | Risk if unresolved |
|---|---|---|---|---|
| Invoice recurrence/edge date và due-date formula | V1.1 anchor theo contract start; API Spec nói recurrence/edge date chưa fully specified | Approve recurrence algorithm; hoặc archive unresolved legacy invoices | Chốt rule riêng qua product/backend decision rồi mới tính candidate periods | P0 financial, sai kỳ/trùng hóa đơn. |
| Historical manual `Payment` | Source CASH/BANK_TRANSFER/OTHER; target chỉ provider transaction MoMo/ZaloPay | Restricted archive ledger; hoặc approve representation/retention plan riêng | Không map thành provider payment; giữ nguyên archive cho tới quyết định | Paid state/ledger không truy vết trong V1.1. |
| InvoiceLine detail | Target stores amount buckets, no line table | Archive extra line detail; confirm categories/retention | Preserve export and reconcile aggregate; do not alter schema | Audit/detail loss. |
| Missing Room capacity/area | Legacy Room has no capacity field, area optional; target requires both | Approved default; manual per Room; defer/quarantine Room | Manual verified value; không dùng occupant count làm capacity mặc định | Không nạp được Room hoặc capacity sai. |
| `CANCELLED` contract mapping | Target statuses do not include cancelled | Archive-only; approved mapping to terminal state if semantic confirmed | Keep out of operational contract data until disposition | Contract lifecycle bị sai. |
| Unresolved contract document uploader/signed metadata | Embedded file key/name/signedAt lacks uploader/version/checksum | Allow nullable only if locked schema permits; quarantine until evidence | Import only verifiable file and metadata | Audit/signature misrepresentation. |
| Payment/paid invoice acceptance evidence | Legacy `PAID/paidAt` may not prove receipt/payment consistency | Accept after finance review; retain as unresolved historical status | Require finance sign-off; no fabricated transaction | False paid state or financial mismatch. |
| Retention duration and archive access | PII/legal retention policy not specified in source schema | Define duration/access/deletion owner | Approve before production extraction | Privacy exposure or premature deletion. |

Nếu một quyết định yêu cầu đổi schema/requirement, lập change request riêng và migration/version mới sau approval/runtime validation; không nới V1.1 schema để vượt lỗi import.

## 35. Recommended next step

**Bước tiếp theo duy nhất:** Product owner và database/backend owner review, phê duyệt bảng `Owner → Property → Resident/account` mapping cùng quy tắc xử lý duplicate/ambiguous CCCD và các P0 invoice/payment decisions trong section 34. Chỉ sau khi ký nhận quyết định và backup policy mới được chuẩn bị dry-run implementation riêng. Tài liệu này không cấp phép chạy migration.

## 36. Final summary

```text
AUTO SAFE mappings: Property/Room identity and selected catalog/preferences only after Owner and field constraints are proven; exact eligible count pending runtime inventory.
MANUAL REVIEW mappings: Owner assignment; Resident/CCCD scope; occupancy dates; capacity; contract status/renewal/termination; invoice periods/totals; documents; parking; complaint/contact routing; account credentials.
UNMAPPABLE legacy data: provider-payment history semantics, unverified appointment behavior, hourly bookings as subscriptions, unsupported invoice detail, fake/missing histories. Preserve as restricted archive or quarantine with disposition.
P0 blockers: unresolved Owner scope; resident CCCD conflicts; invoice-period and financial mismatch; unapproved historical manual-payment disposition; missing verified backup/restore path.
Backup checkpoints: pre-migration dump + plain SQL option + source/Git checkpoint + config inventory; final pre-cutover dump; verified post-migration V1.1 dump.
Rollback checkpoints: pre-cutover discard/recreate target while source stays read-only; post-cutover freeze writes, assess write window, then approved rollback or forward-fix without dropping V1.1 writes.
Open product decisions: invoice cadence/due-date; manual payments; invoice-line retention; missing capacity/area; cancelled contract disposition; document metadata; payment evidence; PII retention.
```

1. **Có thể migrate tự động bao nhiêu phần?** Chưa thể định lượng trước runtime inventory. Chỉ map tự động các rows có Owner/relationship/semantics duy nhất và constraint-valid; phần còn lại là review/quarantine.
2. **Dữ liệu nào tuyệt đối không được tự suy diễn?** Owner/Resident scope, CCCD, occupancy start/end, capacity, contract renewal/termination, invoice period/paid state, provider payment, signed document/uploader, physical parking slot và complaint history.
3. **Những gì phải archive thay vì map?** Manual Payment ledger nếu không có target semantics; viewing appointment fields/status; hourly amenity booking; unsupported invoice lines; missing/fake histories và slot text không xác minh được.
4. **Backup nào phải có trước migration?** Verified full logical custom dump, source/Git checkpoint, environment inventory; plain SQL là bổ trợ. Trước cutover cần final frozen-source dump và sau validation cần post-migration V1.1 dump.
5. **Khi nào rollback?** Pre-cutover target fail thì bỏ/recreate target, source vẫn nguyên. Post-cutover thì freeze writes và đánh giá write window; không quay về snapshot cũ nếu làm mất V1.1 writes.
6. **Khi nào được cutover?** Chỉ khi backup restore verified, Owner mapping/resolution hoàn tất, P0 tenant/financial checks zero unresolved, validators/smoke tests/rollback PASS và business + technical sign-off đủ.
7. **Bước tiếp theo duy nhất sau khi plan được review là gì?** Chốt và ký duyệt Owner/Resident mapping + duplicate CCCD và các P0 invoice/payment decisions; sau đó mới giao implementation dry-run riêng.

---

**Safety status:** Chưa chạy migration, SQL, Prisma command hoặc thao tác database; Database V1.1 LOCK không bị thay đổi.
