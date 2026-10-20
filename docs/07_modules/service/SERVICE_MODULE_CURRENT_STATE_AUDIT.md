# Service / Utilities / Parking — Current-State Audit

**Ngày audit:** 2026-10-14  
**Trạng thái:** CURRENT — read-only audit, không phải implementation/lock  
**Phạm vi runtime:** PostgreSQL 18.6, `Goctro_test3` trên `localhost:5432`  
**Repository:** `SmartRentalManagement`; canonical Requirement/API tại `docs/01_REQUIREMENTS.md` và `docs/04_API_SPEC.md`, cùng Database V1.8 tại `database/baselines/v1.8/`.

## 1. Phạm vi và nguồn đã kiểm tra

Audit gồm cấu hình điện/nước, Facility, Fixed Service, Flexible Paid Service, Parking, kết nối với Billing, Prisma, các Admin page/backend route và dữ liệu Goctro_test3. Chỉ chạy truy vấn `SELECT`; không thay đổi code, cấu trúc hay dữ liệu.

Nguồn chính: `docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`, `docs/DATABASE_CHANGELOG.md`, `database/baselines/v1.8/{README.md,erd.md,schema.sql,runtime_validator.sql}`, `SmartRentalManagement/database/schema.prisma`, backend dưới `backend/src/invoices`, `backend/src/app.ts`, `backend/src/auth/v1.router.ts`, và frontend `frontend/src/app/admin`.

## 2. Canonical product model

- **Electricity:** usage là chỉ số cuối trừ chỉ số đầu, giữ tối đa 3 chữ số thập phân; một version biểu giá progressive nhiều bậc được chọn tại Invoice `period_start` cho trọn kỳ. Version giữa kỳ áp dụng kỳ tiếp theo, không tách kỳ theo giá.
- **Water:** usage là chỉ số cuối trừ đầu; một đơn giá VND/m³ (flat rate), chọn cùng quy tắc version/effective date tại `period_start`.
- **Facility** (hồ bơi, gym, sân chơi, lounge) mô tả tiện ích chung của Property; không mặc định là dịch vụ trả phí, đăng ký hay subscription. Mô hình Pool/Gym subscription 30 ngày cũ đã **SUPERSEDED**. Requirement hiện hành không yêu cầu booking/calendar cho Pool/Gym; không suy diễn luồng đặt lịch từ dữ liệu cũ.
- **Fixed Service:** cấu hình tại Property, tính theo Room đủ điều kiện; một dịch vụ bật áp dụng cho mọi Room đủ điều kiện trong V1, không có Room/Contract override. Version giá có effective date; lấy giá tại `period_start`, tính trọn kỳ, không prorate do đổi giá giữa kỳ.
- **Flexible Paid Service:** phí bắt nguồn từ billable event hợp lệ, không phải catalog item tự động trở thành hóa đơn. Có thể theo lần/số lượng/recurring tùy dịch vụ. Giá do backend chọn từ version hiệu lực tại `occurred_at`; event thuộc kỳ khi ngày lịch `Asia/Ho_Chi_Minh` của thời điểm xảy ra nằm trong khoảng gồm cả `period_start` và `period_end`. Finalize lưu snapshot và tiêu thụ charge nguyên tử; đã billed/finalized thì không tự hoàn hoặc ghi đè.
- **Parking:** Parking quản lý phương tiện/slot/assignment/entitlement và trạng thái; Billing định giá. Free không tạo Invoice Item; `LEGACY_UNCLASSIFIED` không tự suy đoán billable. Paid recurring cần assignment và paid entitlement active tại `period_start`, Property price version hiệu lực tại cùng mốc; tính trọn kỳ, không prorate.

## 3. Electricity audit

**Requirement:** cùng Contract giữ meter continuity: Contract ban đầu dùng chỉ số ban đầu của chính Contract; Invoice finalized trước đó trong chính Contract là nguồn cho kỳ tiếp theo. Không thừa kế qua Contract predecessor hoặc lịch sử Room. Điện tính lũy tiến theo tier; tariff chọn theo `period_start`.

**Database V1.8:** `utility_tariffs`, `utility_tariff_versions`, `electricity_tariff_tiers`, `meter_readings`, `invoice_meter_reading_snapshots`, `invoice_items`, `invoice_item_electricity_tiers` tồn tại. Tariff/version lưu Owner + Property + utility type; version có effective date, nguồn, publication/correction/supersession, người tạo/duyệt. Tier có `tier_no`, `lower_kwh`, `upper_kwh`, `unit_price`; unique tier/version và unique một tier cuối mở. SQL trigger kiểm tra các tier contiguous, bắt đầu ở 0 và có đúng một tier cuối mở; published versions/tier được bảo vệ khỏi sửa. Meter reading gắn Owner/Property/Room/Contract, thời điểm và actor; append-only trigger. Composite FK giữ tenant/context nhất quán.

**Prisma:** mapped (`UtilityTariff`, `UtilityTariffVersion`, `ElectricityTariffTier`, `MeterReading`, Invoice snapshot/tier models). Enum-like values hiện map thành `String`; SQL CHECK/partial index/trigger vẫn là authority. Quan hệ/unique/index thông thường được khai báo.

**Backend/Billing:** read resolver hiện có: `utility-tariff.repository.ts` + `utility-tariff.resolver.ts`; meter continuity tại `meter-continuity.repository.ts` + `meter-continuity.resolver.ts`. Chọn published tariff/version `effective_from <= period_start`, lấy version gần nhất; progressive tiers tính bằng decimal-safe arithmetic và snapshot vào Invoice item/tier lúc finalize. Missing/invalid tariff fail-closed; readiness code là `ELECTRICITY_TARIFF_MISSING`, `ELECTRICITY_VERSION_MISSING`, `ELECTRICITY_INVALID_ELECTRICITY_TIERS` hoặc cấu hình tương ứng. Meter blocker gồm `ELECTRICITY_OPENING_MISSING/INVALID`, `ELECTRICITY_ENDING_MISSING/INVALID/BELOW_OPENING`.

**Admin:** không có trang cấu hình điện, API quản lý tariff/version, hoặc API ghi meter V1. Billing UI chỉ cho nhập chỉ số cuối trên draft Invoice; tariff và opening reading không được tạo từ UI hiện tại.

## 4. Water audit

**Requirement:** usage = chỉ số cuối trừ chỉ số đầu; Water dùng flat VND/m³, chọn published version có hiệu lực tại `period_start`. Mỗi kỳ dùng một version; không split/prorate do giá đổi giữa kỳ.

**Database V1.8:** dùng `utility_tariffs` + `utility_tariff_versions`; `utility_type='WATER'`, `unit='m3'`, `calculation_mode='FLAT'`, `flat_unit_price` được CHECK đồng bộ. Meter continuity/snapshot dùng chung bảng meter theo Contract và utility type. Owner/Property/effective date/version/publication/history được lưu. Không cần bảng Water riêng.

**Prisma:** mapped qua `UtilityTariff`, `UtilityTariffVersion`, `MeterReading`, Invoice snapshots. Utility/mode là String thay vì Prisma enum; DB CHECK bảo vệ shape.

**Backend/Billing:** cùng resolver tariff; chọn version theo `period_start`, lấy một flat unit price. Usage difference nhân đơn giá, làm tròn line theo canonical half-up. Finalize snapshot giữ price/version. Missing rate fail-closed với `WATER_TARIFF_MISSING` hoặc blocker version/rate; meter blockers tương ứng là `WATER_OPENING_*` và `WATER_ENDING_*`.

**Admin:** không có UI/API V1 để tạo Water tariff/version hoặc ghi meter reading; draft Invoice UI chỉ ghi chỉ số cuối.

## 5. Fixed Service audit

**Database V1.8:** catalog là `property_pricing_items` với `kind='FIXED_SERVICE'`, Owner/Property scope, code/name/unit, active/retired status; giá nằm trong `property_price_versions` với version/effective date/unit price/source, publisher/creator, supersedes, unique version/effective date. Published price history được bảo vệ append-only. Invoice item lưu source/version/label/quantity/amount snapshot. Không có bảng áp dụng theo Room vì Requirement quy định mọi Room đủ điều kiện tại Property.

**Prisma:** mapped `PropertyPricingItem`, `PropertyPriceVersion`, `InvoiceItem`; kind/status dạng String. Composite relation và unique/index có mapping. Trigger/constraint append-only và invariant cấp DB vẫn authoritative.

**Backend/Billing:** `fixed-service-price.repository.ts` + `fixed-service-price.resolver.ts` chỉ đọc pricing item active của Property; chọn published version theo `period_start`. `invoice-itemized.pricing.ts` đưa từng dịch vụ thành dòng `FIXED_SERVICE`, trọn kỳ, cùng snapshot; lỗi version tạo blocker `FIXED_SERVICE_PRICE_VERSION_MISSING` hoặc `FIXED_SERVICE_INVALID_*`. Không có item active là kết quả hợp lệ rỗng, không tự chặn finalize.

**Admin:** không có CRUD/retire API hay trang quản lý Fixed Service/version. Legacy `/admin/amenities` không cấu hình bảng pricing V1.8 này; giá tiện ích legacy không thay cho Fixed Service.

## 6. Flexible Service audit

**Database V1.8:** catalog/giá dùng `property_pricing_items` (`FLEXIBLE_SERVICE`) và `property_price_versions`. `flexible_service_charges` lưu Owner/Property/Room/Contract/Resident, pricing item + version, occurred_at, quantity/unit, unit-price/amount snapshot, source system/event key/fingerprint, status `READY/INVOICED/VOID`, Invoice/actor. Unique source event chống ghi trùng; composite FK kiểm tra Owner/Property/Room/Contract/pricing/Invoice context. Amount, quantity, fingerprint được CHECK. Invoice item có source linkage/unique charge.

**Prisma:** mapped `PropertyPricingItem`, `PropertyPriceVersion`, `FlexibleServiceCharge`, `InvoiceItem`. Scalar enum-like status/kind là String; unique/FK/index được map.

**Backend/Billing:** `flexible-service-charge.repository.ts` + `.resolver.ts` tìm charge theo Owner/Property/Room/Contract và inclusive ngày lịch Việt Nam; chỉ charge hợp lệ mới vào Invoice. Giá được so với version có hiệu lực tại `occurred_at`, snapshot amount được đối chiếu quantity × unit price. `invoice.repository.ts` đổi charge `READY` thành `INVOICED` trong transaction finalize; nếu không consume đủ thì rollback. Invalid charge fail-closed với các blocker `FLEXIBLE_SERVICE_*`. Danh sách không có charge hợp lệ là trạng thái rỗng hợp lệ.

**Admin:** không có API để tạo service catalog/version hoặc ghi charge/event; không có giao diện để nhập event. Resolver có thể đọc charge được tích hợp từ một nguồn dịch vụ tương lai, nhưng hiện không có luồng tạo nguồn ở Admin V1.

## 7. Parking audit

**Database V1.8:** `parking_areas`, `parking_slots`, `vehicles`, `parking_slot_assignments`, `parking_entitlements` và `property_pricing_items/property_price_versions` (`PARKING`) tồn tại. Area/slot active state và Owner/Property scope được lưu; vehicle gắn Resident; assignment lưu slot, vehicle, resident, room, contract, ngày bắt đầu/kết thúc, status và optional entitlement. Partial unique indexes chặn slot và vehicle có hơn một assignment active. Entitlement lưu type, billability, pricing link; CHECK buộc paid/free/unclassified khớp shape và paid link tới Property price item. Composite FK giữ Owner/Property context. V1.8 thay unique toàn cục assignment→Invoice item bằng unique theo `(invoice_id, parking_assignment_id)` để cho phép recurring item ở nhiều kỳ nhưng tối đa một lần trên cùng Invoice.

**Prisma:** mapped `ParkingArea`, `ParkingSlot`, `Vehicle`, `ParkingSlotAssignment`, `ParkingEntitlement`, pricing/version và InvoiceItem. Enum-like values là String. Partial unique indexes không được biểu diễn như `@@unique`; SQL là authority.

**Backend/Billing:** `parking-billing.repository.ts` + `.resolver.ts` đọc assignment active tại `period_start`, kiểm tra Occupancy, tenant scope và entitlement. PAID yêu cầu active price item/version `PARKING` có effective date <= `period_start`; FREE không sinh item; null/legacy unclassified không bị tính phí. Các lỗi nguồn paid tạo `PARKING_*` blocker. Finalize snapshot entitlement/assignment/version vào Invoice Item; V1.8 cho phép assignment lặp trên các Invoice khác nhau.

**Admin:** API V1 router chưa mount Parking routes; không có V1 API hoặc trang Admin để quản lý area, slot, vehicle, assignment, entitlement hay parking price. Các V1 routes được liệt kê trong API Spec hiện là contract target, chưa có implementation trong `backend/src/auth/v1.router.ts`. Không tìm thấy route/page Admin `/admin/parking` hoặc `/admin/vehicles`.

## 8. Database V1.8 và Prisma tổng hợp

| Nhóm | Bảng V1.8 | Scope/lịch sử và ràng buộc chính |
|---|---|---|
| Điện/nước | `utility_tariffs`, `utility_tariff_versions`, `electricity_tariff_tiers`, `meter_readings` | Owner/Property; utility type; effective date/version; publication/source; Electricity tiers; Meter Contract scope + append-only |
| Facility | `property_facilities` | Owner/Property, active, optional unique link về legacy `amenities`; đây là catalog Facility hiện hành |
| Fixed/Flexible/Parking pricing | `property_pricing_items`, `property_price_versions` | Property-scoped catalog, kind/status, effective date/version, source/publisher, supersedes, history protection |
| Flexible event | `flexible_service_charges` | Contract/Room/Resident/event/time/quantity/price snapshot/status/idempotency/Invoice linkage; composite FKs |
| Parking | `parking_areas`, `parking_slots`, `vehicles`, `parking_slot_assignments`, `parking_entitlements` | Area/slot/vehicle/Resident/Contract context, status/date, paid/free/unclassified; partial unique active assignment và composite FK |
| Invoice evidence | `invoice_items`, `invoice_item_electricity_tiers`, `invoice_meter_reading_snapshots` | Immutable finalized pricing/meter/tier snapshot; source-linked rows |
| Legacy Amenity | `amenities`, `amenity_price_history`, `amenity_subscriptions`, `amenity_subscription_cycles` | Vẫn tồn tại để giữ V1.6/history data; Pool/Gym 30-day subscription là **superseded**, không authority của Service V1.7 |

Các model trên đều được Prisma map. Enum-like text không dùng enum Prisma; PostgreSQL CHECK bảo vệ values. Partial unique indexes, CHECKs, trigger-enforced tier contiguity, published-price immutability, append-only meter/invoice history và cross-row rules không được Prisma biểu diễn đầy đủ; SQL V1.8 vẫn là authority. Không thấy bảng/field V1.8 bắt buộc nào thiếu trong mapping cho các nhóm được audit.

## 9. Backend API/current implementation state

- **V1 Billing read/resolver:** đã có utility tariff, meter continuity, Fixed Service, Flexible Service và Parking resolvers; dùng chung trong `PrismaItemizedInvoicePricing.inspect/calculate`. Đây là integration/read logic, không đồng nghĩa Admin có thể tạo/cấu hình nguồn.
- **V1 route mount:** `createV1Router` hiện mount Auth, Property/Room, Room Images, Public Marketplace, Resident/Occupancy, Contract, Invoice. Không mount Facility/Paid Service, tariff, meter, Parking CRUD, price-version hay charge-creation router.
- **Legacy unversioned Amenity:** `backend/src/app.ts` còn `/api/amenities`, `/api/amenity-bookings` CRUD. `/admin/amenities` và `/admin/bookings` gọi các API này. Đây là mô hình Amenity/booking cũ, không implement current Facility + Paid Service + Property pricing contract. Current Prisma `Amenity` không có các field legacy mà `app.ts` dùng (ví dụ `id`, `code`, `priceVnd`, `isActive`, `bookings`); route chưa phải đường tích hợp V1.8 đáng tin cậy. Booking/calendar không được tính là current capability.
- Không có V1 tariff version API, Fixed/Flexible catalog/price API, Flexible event creation API hay Parking operational API. Exact Facility/Paid Service endpoints chưa được định nghĩa đầy đủ trong API Spec; không tự tạo endpoint trong audit.

## 10. Frontend Admin state

| Route | Khả năng nhìn thấy trong source | Tính kết nối / giới hạn |
|---|---|---|
| `/admin/amenities` | Generic list/form; cột giá, giờ mở, lượt booking; create/edit/delete | Gọi unversioned `/api/amenities`; là UI Amenity cũ và không dùng `property_facilities` hoặc V1 pricing API. Backend field contract lệch Prisma hiện tại; chưa chứng minh persist được theo V1.8. |
| `/admin/bookings` | Duyệt ngày/khung giờ đăng ký tiện ích | Gọi unversioned `/api/amenity-bookings`; legacy booking model, không phải Facility right-of-use hay Flexible billable event. Không coi là yêu cầu booking hiện hành. |
| Utility tariff / meter config | Không có route/page/component tìm thấy | Admin không thể tạo tariff/version hoặc meter reading bằng UI hiện tại. Billing draft chỉ có trường chỉ số cuối. |
| Fixed/Flexible services | Không có route/page quản lý | Admin không thể tạo catalog, publish price version, ghi nhận charge/event. |
| Parking / vehicles | Không có Admin route/page hiện hành | Admin không thể quản lý V1 area/slot/vehicle/assignment/entitlement/pricing từ giao diện hiện hành. |
| `/admin/billing` | Readiness, chọn/nhập meter cuối kỳ cho draft và finalize theo workflow | Hiển thị được trạng thái nguồn thiếu; không tạo utility tariff, opening meter source, pricing catalog, flexible event hoặc Parking entitlement. |

## 11. Billing integration và blocker

| Billing source | Resolver / lựa chọn | Finalize/readiness behavior | Admin có thể tạo nguồn? |
|---|---|---|---|
| Electricity | Utility + tier resolver; version theo `period_start` | Tier detail + parent Invoice item snapshot; tariff/tier và meter thiếu → fail closed (`ELECTRICITY_*`) | Không |
| Water | Utility resolver; flat rate version theo `period_start` | Water Invoice item snapshot; tariff/meter thiếu → fail closed (`WATER_*`) | Không |
| Fixed Service | Fixed price resolver; version theo `period_start` | Một line/active eligible Property service; empty catalog hợp lệ; invalid version → `FIXED_SERVICE_*` | Không |
| Flexible Service | Charge resolver; membership theo ngày HCM gồm hai biên; giá theo `occurred_at` | Event/price snapshot kiểm tra; READY charge được tiêu thụ nguyên tử khi finalize; invalid source → `FLEXIBLE_SERVICE_*` | Không |
| Parking | Assignment + entitlement resolver; paid price theo `period_start` | Paid thành recurring Invoice item; free/unclassified không tính; unresolved paid input → `PARKING_*` | Không |

Goctro_test3 hiện có 0 electricity/water tariffs, 0 tariff versions/tiers, 0 meter readings, 0 Property pricing items/versions và 0 Flexible charges. Vì vậy **thiếu tariff điện và nước là blocker P0 trực tiếp cho mọi hóa đơn itemized cần finalize**, kể cả khi chỉ số meter đã có. Draft `5004` (`DEMO-INV-DRAFT-001`, Contract `DEMO-HD-004`, Nhà mẫu An Cư / C102) hiện thiếu initial readings trong Contract và chỉ số cuối trong Invoice nên thêm các blocker `ELECTRICITY_OPENING_MISSING`, `WATER_OPENING_MISSING`, `ELECTRICITY_ENDING_MISSING`, `WATER_ENDING_MISSING`; cả hai tariff cũng missing. Draft invoices có thể có blocker meter riêng theo từng Contract.

Không có Fixed Service catalog hay Flexible charge hiện tại tự nó không tạo blocker nếu resolver trả tập rỗng hợp lệ; do vậy đây là thiếu năng lực vận hành/nguồn dữ liệu, nhưng không phải nguyên nhân trực tiếp làm mọi draft fail finalize. Parking assignments không phân loại entitlement (null); resolver xử lý chúng thành unclassified/no inference, nên không thêm phí Parking. Không có Parking pricing/entitlement.

## 12. Goctro_test3 — read-only data inventory

Target đã xác nhận trong cùng phiên truy vấn: `current_database() = Goctro_test3`, `inet_server_port() = 5432`, PostgreSQL 18.6.

| Dữ liệu | Kết quả hiện tại |
|---|---|
| Utility tariffs / versions / Electricity tiers | 0 / 0 / 0 |
| Meter readings | 0 |
| Facility V1 (`property_facilities`) | 0 |
| Current pricing items / versions | 0 / 0 (Fixed, Flexible, Parking đều trống) |
| Flexible service charges | 0 |
| Legacy Amenity | 4 rows: Gym + Hồ bơi tại Nhà mẫu Bình An và Nhà mẫu An Cư; 2 subscriptions, 3 legacy cycles. Đây là data cũ, không chuyển thành Facility/Paid Service hiện hành. |
| Parking areas / slots | 2 areas, 3 slots đang active |
| Vehicles / active assignments | 3 vehicles, 3 active assignments |
| Parking entitlements | 0; cả 3 assignment có `entitlement_id = NULL` |

Tên Property/Facility ở trên là business labels đã có trong DB, không phải PII cư dân. Không ghi biển số hoặc dữ liệu định danh cá nhân vào report.

## 13. Gap matrix

| Area | Requirement | DB V1.8 | Prisma | Backend read/resolver | Backend write/manage API | Admin UI | Billing integration | Demo data | Status | Gap | Priority |
|---|---|---|---|---|---|---|---|---|---|---|
| Electricity tariff | progressive tiers, version tại period start | YES | YES | YES | MISSING | MISSING | Integrated, fail-closed | 0 tariff/version/tier | PARTIAL | Chưa có cách Owner cấu hình và publish tariff | P0 |
| Electricity tiers | contiguous tiers + final open tier | YES + SQL guards | YES (SQL vẫn authority) | YES | MISSING | MISSING | Snapshot theo tier khi finalize | 0 | PARTIAL | Chưa nhập/quản lý được biểu nhiều bậc | P0 |
| Water tariff | flat VND/m³, version tại period start | YES | YES | YES | MISSING | MISSING | Integrated, fail-closed | 0 | PARTIAL | Chưa có tariff/version nguồn | P0 |
| Fixed Service catalog | Property + all eligible Rooms | YES | YES | YES | MISSING | MISSING | Integrated; empty is valid | 0 | PARTIAL | Chưa cấu hình dịch vụ định kỳ | P1 |
| Fixed Service price/version | effective date; immutable history | YES | YES | YES | MISSING | MISSING | Version at period_start; snapshot | 0 | PARTIAL | Chưa publish version giá | P1 |
| Flexible Service catalog | Property-scoped service type | YES | YES | Indirect via charge lookup | MISSING | MISSING | Integrated when charges exist | 0 | PARTIAL | Chưa khai báo dịch vụ phát sinh V1 | P1 |
| Flexible Service price/version | effective date at occurred_at | YES | YES | YES | MISSING | MISSING | Resolver + snapshot check | 0 | PARTIAL | Chưa publish version giá | P1 |
| Flexible charge/event | contract/room/resident/time/quantity/source | YES | YES | YES | MISSING | MISSING | Atomic consume at finalize | 0 | PARTIAL | Chưa ghi nhận event billable | P1 |
| Facility registration/right-of-use | Facility not automatically paid/subscription; no booking implied | YES (`property_facilities`) + legacy tables retained | YES | N/A to Invoice unless future approved flow | MISSING | Legacy Amenity page only | No charge by default | 0 V1 Facilities; 4 legacy amenities | PARTIAL | Current Facility catalog UI/API missing; old booking/subscription not replacement | P1 |
| Parking pricing | paid/free/unclassified; recurring paid at period_start | YES | YES | YES | MISSING | MISSING | Paid recurring snapshot; free/unclassified excluded | 0 pricing/entitlement | PARTIAL | No entitlement/pricing setup | P0 for billable Parking; P1 operational |
| Parking vehicle | vehicle under Resident/Owner | YES | YES | YES | MISSING V1 | MISSING | Billing verifies relation | 3 legacy/current rows | PARTIAL | No V1 management API/UI | P1 |
| Parking slot | areas/physical slots/status | YES | YES | YES | MISSING V1 | MISSING | Resolver reads linked slots | 2 areas / 3 active slots | PARTIAL | Data exists but cannot manage via V1 | P1 |
| Parking assignment/entitlement | scoped dated assignment, contract capacity, explicit billability | YES + constraints | YES (partial indexes SQL-only) | YES | MISSING V1 | MISSING | Paid only if explicit valid entitlement | 3 active, all null entitlement; 0 entitlements | PARTIAL | Cannot classify/manage current rows through V1 | P0 for paid lines; P1 operational |

## 14. Priorities and implementation order

### P0 — block Billing finalization

1. Utility Tariff Management for both Electricity and Water, including version lifecycle and progressive Electricity tier input. Pair it with an authorized V1 meter-reading write/source workflow: Admin currently cannot create tariff/version or persisted meter-reading source, and existing Contract initial reading is only available when present. The API Spec has no tariff/meter management routes yet.
2. Keep readiness fail-closed. After APIs/UI exist, populate disposable data and verify effective-date selection + actual finalize end-to-end; do not seed Goctro_test3 as part of this audit.
3. For Parking lines, require explicit entitlement classification and valid Property parking pricing. Do not infer paid/free from current null-entitlement assignments.

### P1 — complete operational Service module

4. Define and implement current Facility + Paid Service management, Fixed Service catalog/price version workflow, Flexible Service catalog/price version and billable event creation. Before coding endpoints, close exact DTO/route contract gaps in API Spec through the project’s normal approved design pass.
5. Implement Parking area/slot/vehicle/assignment/entitlement management against the already-present V1.8 schema; ensure Contract capacity and effective-date rules are checked in backend transactions.
6. Replace or clearly retire legacy `/admin/amenities`, `/admin/bookings` paths only as part of an explicitly scoped frontend/API implementation, keeping old Pool/Gym cycle data historical.

### P2 — useful/defer

7. Price/import/reconciliation audit UX, richer tariff source evidence and operational reports can follow the core source-entry and Billing closure; no business decisions or API fields are invented in this audit.

**Dependency-adjusted passes:** Pass 2 should be **Utility Tariff + Meter Source Management design/implementation contract**, then implement tariff/meter backend management + Admin UI; this is necessary before invoice finalize can close and is a concrete extension to the conceptual “Utility Tariff Management” order. Pass 3: Fixed + Flexible catalog/pricing/charge management. Pass 4: Parking operational V1 integration including classification/pricing. Pass 5: Billing final E2E readiness/finalization against newly configured sources. The existing pending authenticated Billing workspace browser/narrow-viewport closure should be completed on disposable V1.8 data before declaring Billing browser closure; it does not solve the missing service-source capabilities.

## 15. Decisions surfaced

1. Admin can create Electricity tariff today? **No** (no V1 manage API or Admin UI).
2. Admin can create Water tariff today? **No**.
3. Admin can manage tariff versions today? **No**.
4. Admin can create Fixed Service today? **No** for current V1.8 catalog; legacy Amenity page is a different model.
5. Admin can change Fixed Service price with effective date? **No**.
6. Admin can create Flexible Service today? **No**.
7. Admin can record a Flexible charge/event today? **No**.
8. Admin can manage Parking price today? **No**.
9. Admin can manage vehicle/slot/assignment today? **No** through V1; existing backend resolvers are read-only.
10. Which sources already feed Billing? **All five product groups have Billing read paths**: Electricity tariff/tiers, Water tariff, Fixed price, Flexible charges, and Parking assignment/entitlement/price; meter continuity supplies the utility readings. Only data actually present and valid is consumed; finalized item/tier/meter snapshots are saved atomically.
11. Which missing capability blocks demo Invoice finalization now? **No Electricity or Water tariff/version exists** in Goctro_test3, creating P0 blockers. Draft `5004` also lacks Contract initial meter values and ending readings, so it has four additional meter blockers. Missing Fixed Service/Flexible charges alone can be valid empty inputs; Parking null entitlements are deliberately unclassified and not billed.
12. Does a required next pass need Database V1.8 change? **No.** Existing V1.8 tables/constraints and Prisma mappings represent the required current service data. Pass 2 needs API contract and backend/Admin implementation against the locked schema. Stop and raise a new approved database change only if implementation uncovers a physical mismatch.

## 16. Exact next task

**Before advancing the active Billing checkpoint:** finish the already-pending authenticated Admin Billing workspace post-finalize/filter/narrow-viewport browser closure on disposable V1.8 data; do not mutate Goctro_test3.  
**Then:** start Service Pass 2 with a Utility Tariff + Meter Source Management API contract/design pass, followed by implementation. This audit does not claim any implementation progress.

## 17. Files/data changed

Only this audit report was created. No application code, canonical Requirement/API, Database V1.8, Prisma, Goctro_test3 data, migration, or seed was changed. All database operations in this audit were read-only SELECTs.
