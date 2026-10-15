# Góc Trọ — Billing V1.7 UX, Requirement & Data Readiness Audit

- **Ngày:** 2026-10-13
- **Trạng thái:** `CURRENT — REVIEW ONLY`
- **Phạm vi:** Requirement/API, Admin và Resident UI, Billing backend, Database V1.7 readiness.
- **Baseline:** Database V1.7, `Goctro_test3`, PostgreSQL 18.6, 40 public tables, `LOCKED LOCAL/DEV` theo apply report.
- **Cách kiểm tra:** Đọc source và tài liệu trong workspace; không chạy test, không mở browser, không truy vấn/ghi database. Số liệu thực tế của các bảng V1.7 được dẫn theo snapshot apply report, không khẳng định là row count hiện tại.

## 1. Scope và nguồn

Đã đọc `SmartRentalManagement/AGENTS.md`, `docs/DOCUMENTATION_RULES.md`, Current State, Document Catalog, canonical Requirement/API/Database Changelog ở `GocTro-SmartBuilding`, Database V1.7 artifacts và reports Billing mới nhất. Đã kiểm tra Admin Invoice page, generic DataManagement component, Invoice/Zalo backend mounting và backend gap report.

Không sửa frontend, backend, database, Prisma, API Spec hay Requirement. Không migrate, seed, chạy SQL, test, commit hoặc push. Chỉ tạo report và cập nhật Billing checkpoint/catalog.

## 2. Billing UX được canonical Requirement yêu cầu

### Admin

- Xem hóa đơn trong phạm vi Owner; tra cứu/lọc theo kỳ, Property, Room, Resident và trạng thái.
- Mở chi tiết hóa đơn, xem kỳ, hạn thanh toán, tổng tiền, trạng thái và các khoản.
- Tạo draft cho Contract/kỳ hợp lệ hoặc yêu cầu sinh draft kỳ kế tiếp; hệ thống không sinh trùng.
- Nhập/chỉnh các dữ liệu draft được phép, đặc biệt số điện/nước; xem số đầu/cuối và phải được biết tổng tiền draft chỉ là tạm tính.
- Xem breakdown có thẩm quyền: rent, Electricity theo bậc, Water theo m³, từng Fixed/Flexible Service line và Parking line đủ điều kiện.
- Finalize khi dữ liệu đầy đủ; server tính lại giá/tổng, lưu snapshot bất biến, hạn thanh toán và chuyển `draft → unpaid` nguyên tử.
- Xem trạng thái `draft`, `unpaid`, `paid`; `overdue` là trạng thái suy ra theo ngày nghiệp vụ, không lưu như invoice status.
- Gửi invoice `unpaid` đã finalize qua Zalo OA và xem lịch sử gửi theo revision. Không gửi draft hoặc paid như invoice mới.
- Hiển thị rõ legacy aggregate invoice: giữ nguyên số tổng cũ, không bịa breakdown; `itemization_available=false`.
- Sau finalize, chỉnh sửa tài chính phải qua controlled amendment; không được PATCH tổng tiền/trạng thái tùy ý. Payment là luồng riêng, không phải nút Admin tự đánh dấu đã thu.

### Resident

- Chỉ được xem hóa đơn gắn với hồ sơ thuê của chính mình, cùng breakdown/legacy marker phù hợp.
- Có thể xem lịch sử gửi Zalo được phép; dữ liệu nhạy cảm của recipient/provider/error bị ẩn theo API contract.
- Payment qua MoMo/ZaloPay chỉ bắt đầu từ invoice `unpaid` đã finalize; UI/payment flow thuộc domain Payment và chưa được xác nhận hoàn tất trong task này.

### Error/fail-closed states cần thể hiện

Draft thiếu số đọc/giá/charge hợp lệ vẫn là draft và tổng phải được ghi rõ là provisional. Thiếu hoặc không resolve được dữ liệu có thẩm quyền thì không finalize (`INVOICE_DATA_INCOMPLETE`); thao tác sai lifecycle, quyền, stale/concurrent state phải hiển thị lỗi tương ứng mà không giả báo thành công. Zalo không có recipient policy/queue/provider thì phải báo không khả dụng; gửi thất bại vẫn giữ log.

Requirement xác định business states và API envelope/errors, nhưng các chi tiết trình bày như layout, wording, interaction, confirmation dialog, biểu đồ/bảng tier, cảnh báo sửa snapshot và responsive behavior chưa được quy định: **UX DESIGN NEEDED**.

## 3. Frontend Billing hiện có

### Admin Invoice

- Route: `frontend/src/app/admin/invoices/page.tsx`.
- Route dùng `DataManagement` tổng quát tại `frontend/src/app/components/data-management.tsx`, endpoint `/api/invoices`.
- Có bảng tổng quát, tìm kiếm cục bộ theo invoice number/tenant/room/property, status filter cục bộ, summary count, loading/error/empty states.
- Có nút thêm, sửa, xóa; form cho mã hóa đơn, Contract, tháng/năm, hạn thanh toán, tổng tiền và status; có quick action “Ghi nhận đã thu”.
- Không có action xem chi tiết cho invoice; modal xem detail của component chỉ được render cho tenants. Không có draft editor theo V1, meter section, breakdown, finalize review, Zalo action/history, legacy marker, pagination hoặc Resident Invoice screen.
- Status UI chỉ khai báo `UNPAID`, `PAID`, `VOID`; thiếu `draft` và trạng thái overdue suy ra. UI dùng tháng/năm dương lịch và amount do form người dùng nhập, lệch với Contract-anchored period và server-authoritative total.
- Search/filter chỉ chạy trên rows đã tải; không ánh xạ server filters hoặc metadata pagination của API V1.

### Resident Invoice

`frontend/src/app/tenant/tenant-portal.tsx` không có list/detail Invoice V1. Trang Resident hiện không cung cấp hành trình xem hóa đơn/thanh toán V1.

### Nguồn dữ liệu và tình trạng UI

Không thấy fixture/mock riêng cho trang Admin Invoice trong page này; trang gọi API thật nhưng gọi namespace cũ. Backend `app.ts` chặn prefix `/api/invoices` và trả HTTP 410 trước legacy handlers. Component đổi 410 thành thông báo “Chức năng này đang chờ kết nối với dịch vụ hiện tại.” Do đó trang hiện không có đường tải dữ liệu hoạt động, mặc dù button/form chung vẫn hiển thị. Các nút CRUD/đánh dấu đã thu không đại diện hành vi được hỗ trợ bởi V1 contract.

## 4. User flow hiện tại

**CURRENT:** mở Admin Invoice → gọi `/api/invoices` → backend trả `410` → trang báo chức năng đang chờ; CRUD/form vẫn nhìn thấy nhưng gọi cùng endpoint đã retire. Không có bước xem detail, nhập chỉ số, review breakdown, finalize hoặc gửi Zalo trên UI. Resident cũng không có invoice UI.

## 5. Required V1.7 user flow

**REQUIRED TARGET:** Invoice List V1 (Owner scope, filters, paging) → tạo hoặc sinh draft cho kỳ theo Contract → nhập/kiểm tra beginning/ending readings và service data → xem tổng provisional và xác định các thiếu sót → server tính các dòng authoritative → review breakdown/tier/provenance/charges → finalize nguyên tử, đóng băng item snapshots và chuyển `unpaid` → gửi Zalo sau commit và xem send history. Resident xem invoice của chính mình, phân biệt legacy/itemized; Payment mở phiên riêng sau finalize.

## 6. UX gap matrix

| Feature / Screen | Requirement | Current UX | Backend hiện tại | DB V1.7 | Gap / hướng xử lý |
|---|---|---|---|---|---|
| Invoice List, filters | Admin list + lọc kỳ/Property/Room/Resident/status | LEGACY: bảng generic; local search/status; endpoint cũ 410 | PARTIAL: `GET /api/v1/invoices` có scope/filter/page | READY: `invoices` + indexes | Nối list vào V1 GET; query filters/pagination thật; bỏ CRUD generic |
| Invoice Detail | Summary + các khoản + state | MISSING cho invoice; không có detail action | PARTIAL: scoped V1 detail nhưng aggregate-only | READY: header, item/snapshot structures | Bổ sung detail response/UI, legacy marker và item detail |
| Tạo Draft | Draft cho Contract/kỳ hợp lệ; server suy ra context | LEGACY: form cho tháng/năm, due date, total, status | PARTIAL: V1 POST nhận `contract_id`, `period_start/end`; server validate | READY: invoice period unique/lifecycle | Không cho nhập due/total/status; form theo Contract/period contract-anchor |
| Sinh Draft theo kỳ | Command idempotent, không trùng | MISSING | PARTIAL: V1 command tồn tại; scheduler chưa có | READY: unique period key | Thêm action phù hợp; scheduler là công việc riêng |
| Meter entry | Nhập/chỉnh trong draft; reading đáng tin cậy | MISSING | PARTIAL: compatibility current fields; resolver chưa compliant đầy đủ | READY: `meter_readings`, snapshots | API contract + meter continuity/history, sau đó UI đầu/cuối/source |
| Electricity breakdown | Progressive tiers, version/tier/quantities/amount | MISSING | MISSING: không resolver/calculator V1.7 | READY: tariff/version/tier + item tier snapshots; chưa có dữ liệu khi apply | Resolver, calc, snapshot, rồi UI tier explanation |
| Water breakdown | Flat per m³ × usage, source/version | MISSING | MISSING | READY: water version + meter/item snapshot; chưa có cấu hình lúc apply | Price resolver/calculator, provenance, UI formula |
| Rent | Contract rent, full final-period amount | Chỉ cột tổng; không tách rent | PARTIAL: draft copies Contract rent, no RENT item | READY: invoice aggregate + item categories | Lưu/render RENT item cùng snapshot |
| Fixed Service | Property version, mọi eligible Room, full-period | MISSING | MISSING | READY: pricing item/version + invoice item structures; chưa có rows | Resolver/eligibility/API theo contract, sau đó line UI |
| Flexible Service | Billable event; giá chọn tại occurred_at | MISSING | MISSING | READY: `flexible_service_charges` + item relation; chưa có charge rows | Chốt API intake; ingest/claim/consume nguyên tử |
| Parking | Tách entitlement paid/free/unclassified và charge rule | MISSING | MISSING | READY: entitlement + price version/item; legacy assignments chưa được suy đoán paid/free | Nạp phân loại/giá có thẩm quyền; giải thích khoản hoặc không thu |
| Finalize | Validate, tính lại, snapshot, due date +5, `unpaid` | MISSING | BLOCKED: adapter production luôn fail-closed; positive aggregate-only write không đạt V1.7 constraints | READY: lifecycle + deferred reconciliation/invariants | Chỉ mở finalize sau atomic snapshot transaction và PostgreSQL tests |
| Status / provisional / overdue | Draft/unpaid/paid; overdue derived | LEGACY: chỉ unpaid/paid/void; không provisional/draft/overdue | PARTIAL: lifecycle logic nhưng DTO/UI chưa phủ V1.7 | READY: lifecycle; overdue derived ở application | Nhãn/trạng thái đúng contract và giải thích draft provisional |
| Legacy Invoice | Aggregate-only, không bịa itemization | MISSING | PARTIAL: DB snapshot kind có; serializer không phát cờ/detail tương ứng | READY: `snapshot_kind` cho `LEGACY_AGGREGATE` | UI hiển thị tổng cũ + “không có chi tiết item hóa” |
| Zalo send | Chỉ finalized unpaid; revision log | MISSING | PARTIAL: routes/log service; wired recipient/provider chưa cấu hình | READY: `invoice_zalo_oa_send_logs`; live rows chưa truy vấn | Recipient/queue/provider ops + nút gửi, trạng thái và lịch sử |
| Payment status/flow | Paid qua giao dịch đủ tiền; retry/session rules | Không có Invoice/payment UI V1 | MISSING / DEFERRED | READY: `payment_transactions`, constraints/retry fields | Chưa triển khai trước Billing finalize; Payment là phase riêng |
| Resident Invoice | Chỉ hồ sơ thuê của mình | MISSING | PARTIAL: scoped GET/detail/log backend | READY: same Invoice + payment/Zalo data structures | Màn list/detail Resident sau khi DTO itemized/legacy sẵn sàng |

## 7. Database readiness matrix

“READY” dưới đây nghĩa là schema có cấu trúc hỗ trợ nghiệp vụ; không có nghĩa cấu hình hoặc giao dịch đã được nạp. Apply report xác nhận 12 bảng V1.7 mới **0 row ngay sau migration**. Không có truy vấn hiện thời trong audit này để xác nhận số dòng bây giờ.

| Table | Readiness | Dữ liệu/cấu trúc hỗ trợ | Row/data evidence và giới hạn |
|---|---|---|---|
| `invoices` | DB READY | Period/amount/status, unique period, snapshot lifecycle; legacy aggregate giữ nguyên | Apply report: 4 legacy rows được bảo toàn, 5001–5003 `LEGACY_AGGREGATE`, 5004 draft `NOT_FINALIZED`; không query lại |
| `invoice_items` | DB READY | Snapshot authoritative theo category/label/quantity/unit/price/source/version/period/amount | Bảng V1.7 mới; 0 rows tại promotion |
| `invoice_item_electricity_tiers` | DB READY | Tier quantities, rates, rounded amounts nối parent item | 0 rows tại promotion |
| `meter_readings` | DB READY | Lịch sử reading theo utility/Contract, thời gian và source | 0 rows tại promotion |
| `invoice_meter_reading_snapshots` | DB READY | Opening/ending cho hai utilities và nguồn reading/invoice/Contract | 0 rows tại promotion |
| `utility_tariffs` | DB READY | Property/Owner utility tariff catalog | 0 rows tại promotion; chưa có tariff để resolver dùng |
| `utility_tariff_versions` | DB READY | Effective date, published version, Electricity/Water mode/price metadata | 0 rows tại promotion; chưa có effective configuration được xác nhận |
| `electricity_tariff_tiers` | DB READY | Cấu trúc các tier cho tariff version | 0 rows tại promotion |
| `property_pricing_items` | DB READY | Property catalog cho Fixed/Flexible/Parking kinds | 0 rows tại promotion |
| `property_price_versions` | DB READY | Price/version/effective date/source cho pricing items | 0 rows tại promotion |
| `flexible_service_charges` | DB READY | Billable charge, Contract/Room/source event/status, invoice consumption relation | 0 rows tại promotion; không có intake trong backend |
| `parking_entitlements` | DB READY | Phân loại entitlement và billability | 0 rows tại promotion; 3 legacy assignment vẫn `entitlement_id=NULL`, không tự suy ra paid/free |
| `payment_transactions` | DB READY | MoMo/ZaloPay attempts, session, provider IDs/status/amount, unique successful payment | Bảng V1 cũ được giữ; row count hiện tại chưa kiểm tra |
| `invoice_zalo_oa_send_logs` | DB READY | Append-only send/revision/recipient/provider status history | Bảng V1 cũ được giữ; row count hiện tại chưa kiểm tra |

Database V1.7 CORE validator 71/71 chứng minh nhiều invariant/schema probe trên populated target; không thay thế dữ liệu cấu hình tariffs/prices/entitlements hay kiểm thử toàn bộ happy-path hóa đơn với dữ liệu vận hành. Rehearsal/fixture validator riêng có test synthetic, nhưng không phải bằng chứng các cấu hình đã có trong target.

## 8. Backend readiness matrix

| UX | Backend | Evidence summary |
|---|---|---|
| V1 Invoice list/detail/scope | PARTIAL | V1 routes và Owner/Resident scope hiện có; response aggregate, chưa item/tier/provenance/legacy flag hoàn chỉnh |
| Draft create/generate/PATCH | PARTIAL | Có V1 command; PATCH chỉ reading compatibility fields; scheduler absent |
| Tariff/pricing lookup | MISSING | Không có repo/service dùng 11 model Billing V1.7 mới |
| Electricity/Water calculation | MISSING | Production pricing adapter chưa cấu hình; chưa có resolver/tier math/line rounding |
| Meter continuity/provenance | PARTIAL / NONCOMPLIANT GAP | Query draft history chưa lọc finalized đủ và không theo renewal lineage; history/snapshot tables chưa dùng |
| Fixed/Flexible/Parking charge resolution | MISSING | Không có pricing, eligibility, intake, claim/consume integration |
| Finalize | BLOCKED | `UnconfiguredInvoicePricing` trả null; dừng an toàn. Nếu chỉ bật calculation tổng hợp, write thiếu `ITEMIZED` và item/tier/4 meter snapshots, không khớp constraint/reconciliation V1.7 |
| Zalo send/log | PARTIAL | Scope/log boundary có; default recipient và provider/queue không cấu hình production |
| Payment | MISSING / DEFERRED | Không có Payment API flow trong task implementation hiện tại; API Spec nói chưa implement |

## 9. DB đã có nhưng UX chưa có

Đã xác nhận schema V1.7 có cấu trúc nhưng Admin/Resident UI không tận dụng:

- Dòng hóa đơn itemized và Electricity tier breakdown (`invoice_items`, `invoice_item_electricity_tiers`).
- Nguồn/giá version của utility và Property services (`utility_tariffs`, versions, tiers, pricing items/versions).
- Meter history và provenance snapshot của opening/ending readings.
- Flexible charge intake/consumption record.
- Paid/free/unclassified Parking entitlement để giải thích có/không có phí.
- `snapshot_kind` đủ để phân biệt aggregate cũ và itemized mới, nhưng UI/API response chưa expose trải nghiệm legacy rõ ràng.
- Payment attempts và Zalo revision logs có bảng vật lý, nhưng UI chưa có Invoice/payment experience tương ứng.

Các bảng V1.7 mới không có dữ liệu ngay sau promotion theo apply report; vì vậy “DB đã có” ở đây là **cấu trúc**, không phải dữ liệu thực tế đã sẵn sàng hiển thị.

## 10. UI đã có nhưng chưa chạy bằng dữ liệu thật / legacy

- Admin list gọi `/api/invoices`, còn backend prefix này trả HTTP 410. Đây là API thật nhưng route đã retire, nên list không tải được.
- CRUD form, `DELETE`, nhập tổng tiền/trạng thái và nút “Ghi nhận đã thu” đến từ generic DataManagement; không phải V1 Invoice contract, không có V1 endpoint hợp lệ để thực hiện.
- Các trường `billingMonth/billingYear` mô hình hóa tháng lịch dương, không khớp period `period_start/end` neo theo Contract.
- Trang không có dữ liệu fixture cục bộ xác nhận được; cũng không có browser/runtime smoke trong audit này. Không kết luận về exact render trên browser beyond code paths.

## 11. UX usability issues (không redesign trong audit)

1. Tên trang và summary gợi ý chức năng quản lý hoạt động, nhưng route 410 khiến list trống/lỗi.
2. Nút thêm/sửa/xóa và “Ghi nhận đã thu” tạo kỳ vọng sai: có thể sửa số tiền/trạng thái trực tiếp hoặc xóa Invoice.
3. Thiếu trạng thái draft, tổng tạm tính, thiếu dữ liệu và overdue suy ra; `VOID` không thuộc lifecycle Requirement hiện hành.
4. Không có trang chi tiết; cư dân/admin không thể xem chỉ số cũ/mới, công thức/đơn giá, tier điện, các dòng dịch vụ hoặc nguồn giá.
5. Không cho tra cứu theo bộ lọc API đầy đủ, server pagination, hoặc xem trang kết quả tiếp theo.
6. Không hiển thị legacy warning nên nếu nối aggregate legacy mà thiếu marker, người dùng có thể tưởng breakdown đã đầy đủ.
7. Không có cảnh báo trước finalize, trạng thái pending/retry/send log Zalo, hoặc giải thích fail-closed cụ thể.
8. Resident không có invoice screen; chưa thể tra hóa đơn của hồ sơ thuê hay đi vào payment hợp lệ.
9. `table-wrap` hỗ trợ cuộn ngang chung, nhưng invoice-specific responsive/detail UX chưa có; chưa browser-smoke nên responsive behavior chưa được xác minh.

## 12. Cấu trúc UX mục tiêu (mô tả, chưa thiết kế)

- **A. Invoice List:** bộ lọc server theo kỳ, Property, Room, Resident, status; phân trang; draft/unpaid/paid và badge overdue derived; CTA theo quyền và state.
- **B. Invoice Detail / Draft Editor:** Contract, phòng, cư dân, kỳ, draft/provisional banner; draft chỉ cho sửa input được cho phép; audit lỗi thiếu input.
- **C. Billing Breakdown:** RENT, ELECTRICITY, WATER, FIXED SERVICE, FLEXIBLE SERVICE, PARKING; từng dòng có lượng × đơn giá, period, source/version phù hợp.
- **D. Meter:** beginning/ending điện/nước, thời điểm/nguồn/baseline; hiển thị rõ reading chưa resolve và không cho finalize.
- **E. Services:** từng Fixed/Flexible line, tên snapshot, usage/event và amount; không gộp thành service total khó giải thích.
- **F. Parking:** entitlement/slot và lý do thu hoặc miễn/không phân loại; không tự suy diễn phí.
- **G. Finalize:** trang review tổng hợp + cảnh báo, xác nhận; sau commit khóa financial snapshot và hiện due date.
- **H. Zalo:** gửi khi eligible; send history theo revision với queued/sent/failed và thông báo recipient/provider availability.
- **I. Legacy Invoice:** giữ aggregate-only, gắn nhãn “Hóa đơn cũ — không có chi tiết khoản mục”; không sinh dòng giả.
- Resident đọc cùng snapshot nhưng chỉ trong phạm vi hóa đơn của chính mình; Payment action chỉ khi `unpaid` finalized.

## 13. Implementation phases

1. **Hiển thị được dữ liệu V1 hiện có:** thay Admin Invoice legacy route bằng V1 read API đã có; map filters/pagination, phân biệt state, bỏ các generic write actions không thuộc contract. Giữ list read-only cho tới khi mutation flow đúng.
2. **API contract completion:** chốt exact request/response cho utility tariff/price config, meter history/provenance, Flexible charge intake và itemized/legacy Invoice detail. Không tự đặt routes/DTO trước khi hợp đồng chốt.
3. **Backend data foundation:** Owner-scoped repos/resolvers cho tariff/price, meter continuity, Fixed/Flexible/Parking eligibility; fail closed khi thiếu dữ liệu. Thêm unit tests.
4. **Calculation + atomic finalize:** decimal-safe line/tier calculation; tạo 4 meter snapshots, items, tier rows, consume eligible charges, reconcile aggregate và chuyển `ITEMIZED/unpaid` trong một transaction; PostgreSQL integration/concurrency tests trên DB disposable.
5. **Invoice detail/editor UX:** nối reading/service inputs và item/legacy responses; review/finalize states; Resident view; responsive/browser tests.
6. **Zalo/Payment/operations:** recipient policy, queue/provider/scheduler và Payment tách phase; Payment chỉ sau khi finalization authoritative.

Thứ tự này tách việc khôi phục list đọc được (API đã tồn tại) khỏi contract/data/calculation dependencies cho finalize.

## 14. Blockers

- **Immediate UI blocker:** Admin Invoice UI gọi endpoint bị retire (`/api/invoices` → 410); không có đường đọc dữ liệu hoạt động trên màn này.
- **Core Billing blocker:** cấu hình/reading/charges chưa được nạp và backend chưa sử dụng V1.7 models; finalize đang fail-closed đúng cách.
- **Physical-write blocker:** đường finalize aggregate hiện có sẽ không thỏa lifecycle + deferred snapshot reconciliation của V1.7 nếu chỉ bật adapter.
- **Contract blocker:** API Spec chưa chốt exact API fields/routes cho cấu hình, intake và itemized/provenance detail.
- **Operations blocker:** Zalo production recipient/queue/provider và scheduler chưa cấu hình; durable Invoice idempotency chưa hoàn tất theo API Spec.
- **Documentation mismatch:** `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` vẫn có các câu baseline V1.6 ở title/Database alignment (§0), Room Images note (§5), Contract baseline note (§9) và durable Contract replay note (§18). Chúng lệch với Database V1.7 README/apply report, `DATABASE_CHANGELOG.md`, API Spec và Current State hiện hành. Các tham chiếu “legacy Invoice V1.6” trong §10/acceptance là lịch sử hợp lệ, không phải lỗi. Không sửa Requirement trong review-only task; cần một lượt metadata/source-of-truth sync riêng.

## 15. Có cần sửa Database không?

**Không cần sửa schema V1.7 để hỗ trợ các approved Billing line items/tariffs/readings/charges/parking đã liệt kê.** Physical structures và Prisma mapping đã có; thiếu là cấu hình/dữ liệu, backend đọc/ghi, API contract và UI. Giữ V1.7 LOCK.

API Spec còn ghi durable Invoice command replay là gap. Nếu replay bền vững được quyết định là release gate và không thể đáp ứng bằng cấu trúc hiện có, cần design/version DB riêng được duyệt; không thay schema V1.7 tùy tiện trong task này. Bằng chứng hiện tại không biện minh một schema change cho itemization/pricing.

## 16. Smallest next implementation task

**GÓC TRỌ — ADMIN INVOICE V1 READ-LIST INTEGRATION**

Chuyển riêng màn Admin Invoice sang `GET /api/v1/invoices` hiện đã có trong contract/backend; thêm map query filters và pagination metadata, thể hiện `draft/unpaid/paid` cùng overdue derived khi được API trả về, và gỡ các nút CRUD chung không được contract hỗ trợ. Giữ màn read-only; chưa làm detail/itemization, draft writes, finalize, Zalo hoặc Payment.

Lý do: đây là đường ngắn nhất để thay trang 410 bằng dữ liệu thật đã có và không phụ thuộc calculator/finalization. Sau khi list hoạt động, chốt API contract cho các input/line detail còn thiếu trước khi xây workflow ghi.

## 17. Files changed

- `SmartRentalManagement/docs/07_modules/invoice-zalo/BILLING_V1_7_UX_REQUIREMENT_DATA_READINESS_AUDIT_REPORT.md` — tạo report.
- `SmartRentalManagement/docs/00_CURRENT_STATE.md` — chỉ cập nhật Billing status/blocker/report/next task.
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md` — thêm report và đồng bộ mô tả physical baseline V1.7 ở mục canonical sources.

Không sửa Requirement/API Spec, backend, frontend, Database/Prisma, migration hoặc seed.

## 18. Current State update và kết luận

Billing vẫn **PARTIAL / not end-to-end**. DB V1.7 có cấu trúc cần thiết cho các dòng chi tiết nhưng cấu hình/tables V1.7 mới chưa có rows tại thời điểm promotion; Admin UI vẫn là generic legacy UI gọi route 410. Finalize phải giữ fail-closed. Chưa có căn cứ cần đổi schema cho core Billing V1.7; durable Invoice replay là quyết định/version riêng nếu được nâng thành gate.

**Kết quả:** REVIEW COMPLETE — NO IMPLEMENTATION. Không chạy test, browser smoke hoặc truy vấn DB; các giới hạn này không được báo thành PASS.
