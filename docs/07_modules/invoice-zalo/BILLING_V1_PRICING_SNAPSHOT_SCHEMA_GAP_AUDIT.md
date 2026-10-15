# Billing / Invoice V1 Pricing + Snapshot Schema Gap Audit

- **Ngày audit:** 2026-10-12
- **Phạm vi:** Database V1.6, Prisma hiện hành, backend Invoice và tài liệu chuẩn về Billing/Pricing.
- **Loại tài liệu:** Audit/design gap; không phải Requirement/API/Database authority.
- **Kết quả:** `DATABASE V1.6 INSUFFICIENT FOR APPROVED BILLING PRICING + IMMUTABLE ITEM SNAPSHOTS`; cần thiết kế Database V1.7 trước khi triển khai Pricing/Invoice finalize.
- **Trạng thái tài liệu:** `CURRENT` cho kết quả audit tại ngày trên; phải kiểm tra lại nguồn trước khi implement.

## 1. Nguồn đã kiểm tra

- `docs/DOCUMENTATION_RULES.md`, `docs/DOCUMENT_CATALOG.md`.
- `docs/11_project-reports/PROJECT_CURRENT_STATE_AUDIT_2026_10_12.md`.
- Canonical sources tại `../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`, `docs/DATABASE_CHANGELOG.md`.
- `../GocTro-SmartBuilding/Database V1.6/{README.md,schema.sql,erd.md,runtime_validator.sql}`.
- `database/schema.prisma` và `backend/src/invoices/{invoice.pricing.ts,invoice.billing.ts,invoice.repository.ts,invoice.validation.ts,invoice.routes.ts,*test.ts}`.
- Module reference: `API_SPEC_INVOICE_ZALO_HARDENING_REPORT.md`, `INVOICE_ZALO_API_MIGRATION_REPORT.md`.

Không chạy database command, migration, seed, validator hay test trong lượt audit. Không sửa canonical docs, Database, Prisma hoặc code.

## 2. Kết luận tóm tắt

| Câu hỏi | Kết luận |
|---|---|
| V1.6 đủ cho Billing V1 theo các quyết định pricing/snapshot mới? | **NO** |
| Có cần Database V1.7? | **YES — cần thiết kế/phê duyệt delta tối thiểu trước triển khai** |
| Invoice lưu snapshot đủ để trả lời “đã tính theo giá nào”? | **NO — SNAPSHOT GAP** |
| Có `invoice_items`? | **NO** |
| Có phân biệt dịch vụ FIXED/FLEXIBLE trong schema Amenity? | **NO**; hiện có `amenity_type` và `registration_type` giới hạn Pool/Gym subscription hoặc Other information |
| Có nơi cấu hình giá điện/nước theo Property và lưu source/unit? | **NO** |
| Price history bảo toàn bất biến ở DB? | **NO**; có bảng append-shaped và unique effective timestamp, nhưng không có trigger chặn UPDATE/DELETE |
| Rule đổi giá giữa kỳ đã chốt? | **NO — PRODUCT DECISION REQUIRED** |
| Phí bãi xe nên thuộc đâu? | Parking là nguồn sự thật về assignment/slot; nên có **một** nguồn giá Property dùng chung với Billing (Amenity fixed hoặc pricing catalog chung), không lưu thêm một bản giá độc lập trong Parking. Cách tính theo slot/xe/phòng vẫn cần chốt. |
| Requirement/API đã phản ánh quyết định mới? | **NEEDS DOC UPDATE**; hiện vẫn ghi tariff/source/service catalog còn mở. |

## 3. Business decisions được dùng làm tiêu chí audit

Đầu vào đã APPROVED trong yêu cầu audit này:

1. Điện/nước lấy theo giá nhà nước, cấu hình theo Property, không override theo Contract.
2. Dịch vụ Property có hai loại: `FIXED` tự áp dụng theo quy tắc phí; `FLEXIBLE` chỉ tính khi có đăng ký/subscription hợp lệ.
3. Giá thuộc Property, không thuộc Contract.
4. Thay giá phải tạo version mới có `effective date`; không ghi đè lịch sử. Invoice cũ không đổi.
5. Invoice tính theo đúng price version có hiệu lực theo kỳ và khi finalize phải lưu snapshot giá cùng số tiền.
6. OCR meter reading ở ngoài V1.

Các quyết định này là tiêu chí audit của prompt, nhưng chưa được đồng bộ vào canonical Requirement/API: các tài liệu hiện vẫn đánh dấu nguồn/công thức tariff và pricing dịch vụ là chưa xác định. Báo cáo này không thay thế việc cập nhật/approve các tài liệu chuẩn.

## 4. Database V1.6 hiện tại

### 4.1 `invoices`

Physical schema và Prisma có các trường liên quan:

- Kỳ/quan hệ: `contract_id`, `property_id`, `owner_id`, `period_start`, `period_end`.
- Lifecycle: `status`, `revision`, `finalized_at`, `due_date`.
- Khoản tổng: `rent_amount`, `electricity_amount`, `water_amount`, `service_amount`, `total_amount`.
- Đồng hồ: `electricity_previous_kwh`, `electricity_current_kwh`, `water_previous_m3`, `water_current_m3`.
- Ràng buộc: `UNIQUE(contract_id, period_start, period_end)`, `period_end >= period_start`, và `total_amount = rent + electricity + water + service`.
- Relation đến Payment là các payment attempts; relation đến Amenity cycle chỉ là `amenity_subscription_cycles.invoice_id`.

Không tìm thấy bảng `invoice_items` trong Database V1.6 schema/ERD/Prisma. Invoice không có cột snapshot đơn giá, unit, pricing source/reference, price-history ID, số lượng/usage theo item, công thức/version tính, hay breakdown dịch vụ.

### 4.2 `amenity_price_history`

Hiện lưu đúng: `amenity_price_id`, `amenity_id`, `effective_at`, `price_amount`, `created_at`.

- `property_id` được suy ra qua `amenities.amenity_id → property_id`; không có trực tiếp trên price row.
- Không lưu unit, price/pricing type, source/reference, effective end hay version label.
- `UNIQUE(amenity_id,effective_at)` chặn hai record có cùng timestamp chính xác, nhưng không chặn cùng ngày với timestamp khác.
- Không có interval `effective_to`, nên overlap được mô hình hóa theo “lấy bản ghi effective_at mới nhất không sau thời điểm tham chiếu”; DDL không có exclusion/constraint enforcing chính sách đó.
- Không có trigger bất biến cấm sửa/xóa price row. `UNIQUE` giữ lịch sử khi ứng dụng chỉ INSERT, nhưng không bảo đảm lịch sử bất biến trước UPDATE/DELETE.
- Chưa có đường giá riêng cho điện/nước hay metadata về biểu giá nhà nước.

### 4.3 Amenity, subscription/cycle, Contract và Parking

- `amenities` gắn Property và Owner, nhưng `amenity_type` chỉ là `pool | gym | other`.
- CHECK yêu cầu Pool/Gym là `registration_type='subscription'`; `other` phải là `information`. Vì vậy không biểu diễn được fixed fee, và cũng không biểu diễn được Flexible loại khác như Pet Care theo mô hình subscription hiện tại.
- `amenity_subscriptions` gắn Resident/Contract/Amenity và trạng thái; cycle lưu 720 giờ cùng `price_snapshot`. Đây là snapshot **số tiền của cycle**, không phải snapshot một invoice item; cycle không giữ `amenity_price_id`, unit hay mô tả phép tính. Trigger bất biến price/cycle không có trong schema.
- `contracts.rent_amount` là tiền thuê theo Contract; không có giá điện/nước/dịch vụ hoặc price-version theo Contract. Điều này phù hợp với quyết định không đặt tariff ở Contract. Rent được copy vào draft Invoice.
- Parking tables (`parking_areas`, `parking_slots`, `parking_slot_assignments`) quản lý vị trí, phương tiện, người/phòng/Contract, ngày và trạng thái assignment. Không có giá hoặc relation giá. Chúng không phải nguồn phí bãi xe hiện tại.

Prisma hiện tại phản ánh đúng các thiếu sót physical này; không phát hiện mismatch Prisma/Database V1.6 trong phạm vi pricing/snapshot được yêu cầu.

## 5. Backend Invoice pricing hiện tại

- Interface `InvoicePricing.calculate(invoice, contract)` trả về ba aggregate: `electricityAmount`, `waterAmount`, `serviceAmount`; không trả line items hay unit prices/version metadata.
- App dùng `UnconfiguredInvoicePricing`, luôn trả `null`; adapter ghi rõ chưa cấu hình tariff/rule. Finalize ném `409 INVOICE_DATA_INCOMPLETE` khi thiếu pricing, không chuyển trạng thái và không dùng giá mặc định.
- Finalize khóa Invoice và chạy transaction serializable; validate chỉ số đầu/cuối, gọi adapter rồi ghi amount buckets, meter readings, total, `finalized_at`, `due_date` và `status=unpaid` nguyên tử.
- Rent được lấy từ `contracts.rent_amount` khi tạo draft (`invoice.rent_amount`); finalize cộng rent với ba aggregate. Như vậy rent amount được copy, nhưng schema không giữ nguồn/version của rent ngoài Contract.
- Điện/nước hiện chưa có phép tính production. Adapter nhận meter readings và Contract; không query được Property tariff vì chưa có pricing table/config. Nước/điện provisional bucket mặc định 0 trên draft không phải giá đã cấu hình.
- `service_amount` chỉ là một tổng; client không thể gửi service inputs trong API. Không có cách lưu/rà từng dịch vụ sau khi finalize.
- Test success path inject fake calculator, trả fixed amounts `1,000 / 2,000 / 3,000`; test đó xác nhận wiring/lifecycle, không chứng minh tariff thật, snapshot hay breakdown.
- Fail-closed hiện hoạt động tại `invoice.repository.ts` sau khi gọi pricing adapter, nếu adapter trả `null`; deployed adapter luôn làm finalize dừng ở đó.

## 6. Price history và snapshot

`amenity_price_history` cho phép ứng dụng tìm mức giá gần nhất effective-at-or-before ngày tính và không ghi đè giá cũ trong happy path. Tuy nhiên chưa đủ cho approved pricing rules:

1. Chỉ dành cho Amenity; không có Property utility tariffs.
2. Không lưu pricing unit/type/source/reference.
3. Không có link từ Invoice line đến `amenity_price_id`/price version.
4. Không có dòng hóa đơn; finalized Invoice chỉ giữ aggregate amounts.
5. Không có DB guard giữ Price History bất biến.
6. Không có DB/application concurrency policy thể hiện rõ serialize giá của cùng Amenity khi tạo versions; unique exact timestamp chỉ là một lớp guard hẹp.

Finalized Invoice giữ lại **số tiền** và meter readings của các amount buckets; nó không giữ đơn giá, nguồn giá, version, unit price, lượng tính theo từng service hay formula. Không thể tái dựng ví dụ “50 kWh × 3.500đ/kWh = 175.000đ” từ Invoice record khi tariff đổi. Vì thế: **SNAPSHOT GAP — Invoice cũ có thể giữ total hiện tại ở hàng dữ liệu, nhưng không thể audit chính xác giá/cách tính đã áp dụng.**

API application không cho sửa Invoice sau finalize bằng generic PATCH, và trả `INVOICE_AMENDMENT_NOT_ALLOWED`; đó là bảo vệ ở luồng backend. Physical schema hiện không có immutable finalized-invoice trigger. Cần giữ đồng thời snapshot chi tiết và application rule chống sửa sau finalize; không coi một rule thay thế rule kia.

## 7. Walkthrough các ca đổi giá

| Ca | Kỳ vọng business | Database/backend hiện tại |
|---|---|---|
| Điện: 3.500đ từ 01/01, đổi 3.800đ từ 01/08; hóa đơn tháng 6 / tháng 9 | Tháng 6 dùng 3.500; tháng 9 dùng 3.800 | **FAIL / chưa thể chạy thật.** Không có utility price records. Khi có Invoice, chỉ `electricity_amount` được lưu, không có rate/source/version để chứng minh. |
| WIFI: 100.000/kỳ từ 01/01, đổi 120.000 từ 01/10; hóa đơn tháng 8 / tháng 11 | Tháng 8 dùng 100.000; tháng 11 dùng 120.000 | **FAIL.** Amenity type hiện không hỗ trợ FIXED WIFI; `service_amount` chỉ aggregate và không giữ phiên bản giá. |
| Hóa đơn tháng 8 đã finalize, sau đó Property đổi giá | Reload hóa đơn tháng 8 phải giữ total, snapshot | **PARTIAL.** Amount/total đã lưu không tự đổi chỉ vì bảng price khác; API finalize không chạy lại hóa đơn cũ. Nhưng không có price snapshot/source/breakdown, và physical DB không ngăn sửa trực tiếp sau finalize. Không đạt yêu cầu audit snapshot bất biến đầy đủ. |

## 8. Fixed/Flexible, điện/nước và bãi xe

### Fixed vs Flexible

Schema hiện không phân biệt hai loại này. `registration_type` hiện phân biệt `information`/`subscription`, nhưng CHECK cứng loại amenity subscription vào Pool/Gym; nó không đồng nghĩa `FIXED`/`FLEXIBLE`. Fixed fee tự áp dụng vào Invoice không có configuration/relationship nào. Flexible subscription có cycle/snapshot cho Pool/Gym nhưng chưa có đường nối charge cycle thành breakdown invoice item; link cycle→invoice hiện có thể định Invoice aggregate, không giữ charge item và có thể thiếu đơn vị.

### Điện và nước

Không có `property_utility_rates` hoặc equivalent. Không tìm thấy nơi lưu đơn giá điện/nước theo Property, unit (`kWh`, `m³`), nguồn/căn cứ biểu phí nhà nước, effective date hoặc tariff version. Không cần government API để đáp ứng business rule, nhưng cần lưu tariff Owner/Property cấu hình cùng căn cứ/source và ngày hiệu lực. Tiered/complex tariff ngoài scope theo nguyên tắc minimal-design; Requirement/API vẫn phải chốt công thức V1 thực sự (ví dụ đơn giá phẳng hay nhiều bậc, cách làm tròn) trước khi adapter được coi là authoritative.

### Bãi xe

Canonical Requirement coi Parking là nghiệp vụ riêng và schema Parking quản lý assignment/slot/capacity, nhưng pricing chưa thuộc đâu. Theo quyết định mới parking fee là một loại fixed Property service. Boundary ít trùng lặp nhất: Parking quyết định xe/slot/assignment đang hoạt động và số lượng có thể tính; Billing lấy **một** Property-scoped price source chung (fixed pricing catalog/Amenity nếu được mở rộng) để định giá. Không đồng thời lưu tariff ở Parking và Amenities. Cần quyết định riêng fee tính theo slot/xe/phòng/kỳ và trường hợp assignment bắt đầu/kết thúc giữa kỳ; không có trong Requirement hiện tại.

## 9. Mid-period price change — PRODUCT DECISION REQUIRED

Với kỳ 15/07–14/08 và giá đổi 01/08, Requirement/API không xác định một giá cho fixed service hay cách chia utility usage. Chỉ meter readings ở đầu/cuối kỳ không đủ tách chính xác kWh/m³ trước và sau ngày đổi.

Các lựa chọn cần quyết định ở business/API trước khi implement: (A) rate tại `period_start`; (B) rate tại `period_end`; (C) chia usage theo thời điểm đổi với intermediate reading/usage allocation; hoặc quy tắc khác. Fixed-per-period service cũng cần rule as-of date (giữ giá đầu kỳ hay áp giá cuối kỳ); full-period charge cuối hợp đồng đã chốt nhưng không giải quyết lựa chọn price version. Không tự chọn ở report này.

## 10. Service breakdown: Option A và B

| | Option A — giữ `service_amount` + JSON snapshot | Option B — `invoice_items` |
|---|---|---|
| Thay đổi | Thêm JSONB snapshot metadata vào Invoice (hoặc equivalent). | Thêm row per charged line, thuộc Invoice; giữ aggregate buckets/total nếu API compatibility cần. |
| Ưu điểm | Delta nhỏ; mọi snapshot ghi cùng Invoice; dễ giữ legacy DTO tổng. | Một nguồn thống nhất cho rent, utilities, fixed services, flexible cycles/parking; mỗi dòng có mô tả, quantity/unit, unit-price snapshot, amount, source/type, optional source price ID và calculation version; query/report/hiển thị rõ. |
| Rủi ro | JSON shape/type không được quan sát/query/enforce sạch bằng FK/CHECK; service lines phải tái tính aggregate; dễ schema JSON drift. | Thêm table/validation/transaction và ràng buộc tổng giữa rows/buckets; cập nhật DTO/API cho breakdown. |
| Đánh giá | Có thể đủ nếu chỉ cần lưu opaque audit blob và không có nhu cầu truy vấn từng phí. | **Khuyến nghị cho yêu cầu hiện tại** vì Owner cần xem breakdown nhiều Fixed/Flexible lines, liên kết rate version, và Payment dùng Invoice total chuẩn. |

Tối thiểu mỗi `invoice_item` finalized cần giữ `invoice_id`, loại/label snapshot, source category, source record/version nullable, quantity, unit, unit-price snapshot, amount, thời điểm/price effective reference và calculation rule version. Item phải giữ cả thông tin hiển thị (tên/service) dưới dạng snapshot để khi catalog đổi tên/xóa, hóa đơn cũ vẫn diễn giải được. Xác định cách nhất quán để `total_amount` bằng tổng item/hoặc cộng rent + utility + service; tránh hai tổng độc lập bị lệch. Invoice database không nên cho line mutate sau finalize. Đây là design recommendation, chưa phải approved schema.

## 11. Contract snapshot review

Contract hiện lưu `rent_amount`, deposit/capacity, initial/final meter readings và lifecycle; không snapshot điện/nước rates hoặc service prices. Điều này phù hợp với quyết định giá thuộc Property và dùng version có hiệu lực theo Invoice period, không khóa tiện ích theo ngày ký Contract. Rent snapshot vào Invoice draft từ `contracts.rent_amount`. Không phát hiện conflict physical với Contract trong phần pricing; không được thêm override tariff theo Contract.

## 12. Requirement / API đối chiếu

| Chủ đề | Trạng thái | Bằng chứng / việc còn thiếu |
|---|---|---|
| Billing period neo `contracts.start_date`, clamp/no-drift, kỳ cuối và full rent | **ALREADY ALIGNED** | Requirement §10/Acceptance và API §5.8/§9.3; implementation report/test cũng ghi nhận. |
| Điện/nước theo giá Nhà nước, theo Property, không theo Contract | **NEEDS DOC UPDATE** | Mới được chốt trong quyết định đầu vào audit; Requirement §10/§“Các điểm còn chưa xác định” vẫn nói nguồn/công thức điện nước chưa chốt; API §5.8/§9.3 cũng nói tariff source open. |
| Property-scoped service pricing | **NEEDS DOC UPDATE** | Requirement hiện chưa quy định giá dịch vụ thuộc Property và cấm override Contract; API nói service catalog/pricing còn mở. |
| Price version/effective date, lịch sử không ghi đè | **NEEDS DOC UPDATE** | Amenity API có append price history cho subscription/cycle, nhưng chưa quy định bao quát fixed service/utility/Billing invoice-period resolution. |
| Finalize giữ snapshot bất biến đủ audit giá | **NEEDS DOC UPDATE + DB GAP** | API xác định amount/finalize lifecycle, nhưng không yêu cầu snapshot rate/source/line items; canonical chưa quy định price snapshot cho Invoice. |
| FIXED vs FLEXIBLE | **NEEDS DOC UPDATE + DB GAP** | Canonical hiện chốt Pool/Gym subscription cycles và Parking riêng, không có enum/business rule phân loại Fixed/Flexible. |
| Service breakdown / invoice items | **UNSPECIFIED** | API response ghi rõ không có `line_items`; chưa quyết định JSON snapshot hay row-based items. |
| Mid-period price changes | **UNSPECIFIED — PRODUCT DECISION REQUIRED** | Không có as-of rule, split-meter rule hay fixed-service selection date. |
| Phí bãi xe source/cách tính | **UNSPECIFIED / NEEDS DOC UPDATE** | Requirement định nghĩa assignment ở Parking; pricing mới gọi đây fixed fee; chưa quyết định source/rate unit/proration boundary. |
| Chi tiết biểu giá điện/nước, rounding, utility calculation | **UNSPECIFIED** | “Giá Nhà nước” xác định căn cứ nguồn, chưa xác định biểu giá/công thức V1. |

Không thấy requirement hiện hành yêu cầu giá ở từng Contract; quyết định mới củng cố giá Property. Không phát hiện rule canonical buộc phải dùng Contract price snapshot cho utilities/services.

## 13. Minimal proposed Database V1.7 delta

V1.7 nên là additive migration; giữ nguyên V1.6 baseline/history. Trước implementation cần chốt schema proposal và product rule còn mở.

1. **Property pricing catalog/version:** Mở rộng hoặc thay phần Amenity price model để biểu diễn service `FIXED`/`FLEXIBLE`, loại tính giá (per-period/per-unit/usage), `unit`, Property scope, `effective_from`/version, source/reference/căn cứ và mức giá. Bảo vệ price history khỏi UPDATE/DELETE; serialize thêm version cùng Property/service để tránh race. Chọn một chỗ làm authority cho electricity/water (Property utility tariff history tách riêng hoặc catalog dùng chung có metadata utility phù hợp), không tạo hai nguồn giá.
2. **Invoice item snapshots:** Thêm `invoice_items` (hoặc quyết định rõ JSON snapshot nếu stakeholder chọn Option A) để lưu mỗi khoản amount/rate/quantity/unit/label/source version/formula snapshot cần audit. Giữ `invoices.total_amount` là payable snapshot; đảm bảo quan hệ/tổng nhất quán trong finalize transaction. Fixed fees tự apply theo cấu hình Property; Flexible lines lấy từ subscription/cycle hợp lệ và lưu liên kết cycle/price snapshot.
3. **Immutability:** Định nghĩa và enforce việc finalized invoice items/financial snapshot không bị sửa/xóa ngoài controlled amendment; amendment nếu sau này được phép phải tạo revision/history theo business API rule. Dữ liệu cũ không lookup latest price để render lại.
4. **Không đưa vào delta:** Không thêm giá utilities vào Contract; không chuyển Parking assignment state vào Invoice; không triển khai Payment/OCR/tax/tier engine ngoài rule được duyệt.

Đây là delta ở mức design gap, chưa thiết kế DDL/ERD/Prisma cụ thể và chưa được phê duyệt thành schema.

## 14. Các điểm cần quyết định/đồng bộ trước khi đóng design

- Mid-period effective price selection cho utilities và fixed fee; có cần intermediate meter readings để split usage không.
- Chi tiết nguồn biểu giá Nhà nước, utility tariff model V1, unit, rounding và căn cứ/source reference được lưu.
- Fixed-fee applicability: áp dụng theo phòng, hợp đồng, số người, phương tiện hay một amount cố định mỗi kỳ; điều kiện hiệu lực và full/partial period.
- Flexible subscription/cycle sẽ đưa vào hóa đơn kỳ nào; cycle snapshot hiện 720 giờ còn billing invoice theo monthly Contract anniversary.
- Phí giữ xe tính theo slot/xe/phòng và start/end giữa kỳ; chọn duy nhất bảng giá Property source chung.
- Invoice item model và cách ràng buộc tổng; line-level snapshot và finalized immutability/amendment semantics.
- Đồng bộ Requirement/API để loại bỏ wording rằng mọi utility/service tariff source còn chưa quyết định, nhưng vẫn giữ các chi tiết công thức thực sự đang mở cho tới khi được chốt.

## 15. Exact next task

**`GÓC TRỌ — BILLING V1 PRICING + INVOICE ITEM SNAPSHOT DESIGN DECISION PASS`**

Task tiếp theo nên (1) lấy product decision cho các mục §14; (2) cập nhật/approve Requirement và API contract trong một lượt tài liệu riêng; (3) thiết kế additive Database V1.7 schema/ERD/migration/validator/seed proposal cho Property price history + invoice item snapshots; (4) đánh giá migration tương thích với Database V1.6 đang LOCK. Chỉ sau khi thiết kế được duyệt mới chạy Database V1.7 migration/runtime validation rồi implement Invoice pricing adapter/finalize integration. Billing hiện tiếp tục fail-closed; không bắt đầu Payment trước khi Invoice có amount/snapshot đáng tin cậy.

## 16. Files modified and limits

Chỉ tạo audit này: `docs/07_modules/invoice-zalo/BILLING_V1_PRICING_SNAPSHOT_SCHEMA_GAP_AUDIT.md`.

Không sửa Requirement/API, Database V1.6, Prisma, backend, frontend, Contract, Payment, Amenities hay Parking. Không chạy DB command, migration, seed hoặc test. Đây là static source audit; runtime price calculations chưa tồn tại để thực hiện live example.
