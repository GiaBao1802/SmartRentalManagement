# Database V1.2 Change Request

**Trạng thái business changes:** APPROVED — change request này là basis đã được phê duyệt để triển khai Database V1.2.  
**Trạng thái physical implementation:** NOT YET IMPLEMENTED. Database V1.1 vẫn là current LOCK baseline — PostgreSQL 18, 25 public tables, schema PASS, seed PASS, runtime 21/21 PASS — cho tới khi schema/seed/validator V1.2 PASS.  
**Phạm vi tài liệu:** Ghi nhận basis đã approve; không có thay đổi vật lý nào được thực hiện trong lượt cập nhật trạng thái này.

## 1. Mục tiêu và nguồn đối chiếu

Các business rule mới về sức chứa và hóa đơn trong change request này đã được phê duyệt và đồng bộ vào Requirement/API Spec. Change request là basis chính thức cho việc triển khai V1.2. Database V1.1 tiếp tục là current LOCK physical baseline cho tới khi schema, seed và validator V1.2 chạy PASS.

Nguồn đã đối chiếu:

- `Database V1.1/schema.sql` và `Database V1.1/erd.md` trong `GocTro-SmartBuilding`.
- `docs/01_REQUIREMENTS.md`, `docs/GOCTRO_FUNCTION_SCOPE.md`, `docs/GOCTRO_FUNCTION_MATRIX.md`, `docs/04_API_SPEC.md` và `docs/DATABASE_CHANGELOG.md`.
- `SmartRentalManagement/docs/12_decisions/V1_1_MIGRATION_DECISIONS.md`.
- `SmartRentalManagement/database/schema.prisma` và `SmartRentalManagement/docs/03_database/prisma/PRISMA_V1_1_REMAP_REPORT.md`.

SQL schema là căn cứ cho cấu trúc vật lý. Tài liệu API hiện còn ghi cadence/due-date chưa được chốt; các rule tại change request này là business decision mới được cung cấp và cần được phản ánh vào Requirement/API Spec trước khi implementation.

## 2. Đánh giá sức chứa Room và Contract

V1.1 đã có `rooms.default_capacity integer NOT NULL CHECK (default_capacity >= 1)` và `contracts.resident_capacity integer NOT NULL CHECK (resident_capacity >= 1)`. Hai giá trị là hai cột độc lập; schema không đồng bộ ngược capacity Contract khi Room đổi.

Rule mới định nghĩa `default_capacity` là mặc định cho Room và `resident_capacity` là snapshot giới hạn được ký trên Contract. Đây là cách dùng phù hợp với cấu trúc V1.1, không cần thêm field hoặc constraint.

**Kết luận: NO SCHEMA CHANGE REQUIRED.** Backend khi tạo Contract phải chụp capacity đã thống nhất vào `resident_capacity`; đổi `rooms.default_capacity` về sau không được sửa Contract đã ký. Không dùng legacy `occupantCount`. Capacity occupancy/parking và các thao tác đổi capacity cần được kiểm tra theo transaction/backend. Căn đã bán/owner-occupied thuộc V2, ngoài phạm vi change request này.

## 3. Billing period và kỳ cuối hợp đồng

V1.1 đã lưu `period_start`, `period_end`, có unique `(contract_id, period_start, period_end)` và `CHECK (period_end >= period_start)`. DDL không buộc kỳ bắt đầu ngày 1 hoặc bắt buộc mọi kỳ dài 30 ngày. Do đó cấu trúc hiện tại lưu được chu kỳ neo theo `contracts.start_date` và kỳ cuối ngắn hơn.

### 3.1 Kỷ niệm hàng tháng, clamp và không drift

Backend tính mỗi mốc từ ngày bắt đầu hợp đồng gốc, không lấy mốc đã clamp của kỳ trước làm anchor tiếp theo. Ở tháng không có ngày anchor, clamp sang ngày cuối tháng; `period_end` là ngày trước mốc bắt đầu kế tiếp.

Ví dụ anchor ngày 31: các mốc bắt đầu là 31/01, 28/02, 31/03, 30/04, 31/05. Kỳ đầu 15/01–14/02; kỳ kế tiếp 15/02–14/03. Đây là quy tắc tính ngày ở application; không yêu cầu field/schema mới.

### 3.2 Kỳ cuối khi hợp đồng kết thúc giữa kỳ

`final_period_end = min(normal_period_end, contract.end_date)`. Thuê phòng tính nguyên kỳ, không prorate. Điện/nước tính theo usage tới ngày kết thúc thực tế. Dịch vụ tính đủ kỳ nếu là fixed-per-period; dịch vụ usage-based tính tới `contract.end_date`.

**Kết luận: NO SCHEMA CHANGE REQUIRED cho các quy tắc kỳ.** Các cột period và amount hiện hữu đủ để lưu kết quả; backend cần biết loại phí/usage và tính toán có thẩm quyền. Không tạo service tables trong change request này. Nếu cần lưu phân loại hoặc công thức dịch vụ có thể cấu hình theo từng dịch vụ, đó là phạm vi nghiệp vụ/schema riêng cần được chốt trước.

## 4. Mâu thuẫn hóa đơn cần V1.2

DDL V1.1 của `invoices` hiện có:

- `status varchar(16) NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','paid'))`.
- `due_date date NOT NULL`.
- Không có `finalized_at`.
- `revision integer NOT NULL DEFAULT 1 CHECK (revision >= 1)`.
- Amount fields và `total_amount` không nullable; tổng phải bằng tổng các khoản.

Flow mới cần tồn tại hóa đơn `draft` chưa có hạn thanh toán hoặc thời điểm finalize, sau đó finalize thành `unpaid` và chỉ sau đó mở payment/Zalo. V1.1 không thể biểu diễn trạng thái này một cách nhất quán.

**Kết luận: V1.2 REQUIRED: YES.** Tối thiểu cần thêm trạng thái draft, `finalized_at` nullable, `due_date` nullable và ràng buộc đồng nhất giữa trạng thái với hai trường thời gian. Default `draft` được áp dụng cho invoice được tạo theo luồng mới để không phát hành nhầm hóa đơn chưa chốt. API/backend có thể dùng command riêng cho tạo draft và finalize. Nếu còn luồng nhập hóa đơn đã finalize thủ công, luồng đó phải ghi rõ status/timestamp/due date thay vì dựa vào default.

### 4.1 Lifecycle đã được phê duyệt

1. Tới ngày `period_end`, scheduler tạo reminder để Admin chốt điện/nước/dịch vụ; chưa tạo invoice final.
2. Ngày kế tiếp, hệ thống tạo Invoice `draft` cho kỳ đã kết thúc. Draft không được gửi Zalo, không được thanh toán; amount/total có thể là tạm tính.
3. Khi dữ liệu cần thiết hoàn tất, Admin finalize. Backend tính lại amount và total, đặt `finalized_at`, đặt `due_date` bằng ngày finalize theo múi giờ nghiệp vụ cộng 5 ngày lịch, chuyển status sang `unpaid`, rồi gửi Zalo theo revision hiện hành.
4. Hạn thanh toán luôn đủ 5 ngày lịch kể từ ngày finalize. Ví dụ finalize 15/02 → due 20/02; finalize 17/02 → due 22/02. `unpaid AND current_date > due_date` là overdue; ngày due vẫn chưa overdue.

Ngày finalize được tính theo lịch `Asia/Ho_Chi_Minh` để tránh phụ thuộc timezone của server. Backend là nơi áp dụng phép cộng ngày và transition; CHECK đề xuất phía dưới chỉ xác nhận trạng thái/field presence.

## 5. Các quy tắc đã có thể giữ nguyên schema

| Khu vực | V1.1 hiện tại | Quy tắc mới đã được phê duyệt | Thay đổi schema? | Thay đổi V1.2 |
|---|---|---|---|---|
| Room capacity | `rooms.default_capacity` bắt buộc, >= 1 | Mặc định số người tối đa của phòng | Không | Dùng field hiện tại; backend xác thực |
| Contract capacity | `contracts.resident_capacity` bắt buộc, >= 1 | Snapshot giới hạn ký kết | Không | Giữ độc lập với Room sau khi ký |
| Billing anchor | `period_start/period_end`; contract FK | Anchor là `contracts.start_date` | Không | Backend tính từ ngày bắt đầu gốc |
| Month-end clamp | Không có day-one constraint | Clamp anchor 29/30/31, không cumulative drift | Không | Quy tắc date arithmetic ở backend |
| Final period | Period end lưu được theo ngày | Cắt period theo contract end | Không | Lưu period thực tế đã cắt |
| Full rent final period | Amount rent hiện hữu | Thu nguyên kỳ, không prorate | Không | Tính ở invoice service |
| Usage utilities | Meter/amount fields hiện hữu, readings nullable | Tính tới ngày kết thúc hợp đồng | Không | Chốt usage trước finalize |
| Fixed services | `service_amount` hiện hữu | Thu đủ kỳ | Không | Backend phân biệt loại dịch vụ |
| Invoice draft | Chỉ `unpaid/paid`, due date bắt buộc | Draft trước khi đủ dữ liệu | **Có** | Thêm `draft`, nullable `due_date`, `finalized_at` |
| Invoice finalize | Chưa có mốc finalize | Recalculate rồi chuyển unpaid | **Có** | Thêm `finalized_at` và state CHECK |
| Due date | Bắt buộc nhưng chưa có rule tính | Ngày finalize + 5 ngày lịch | **Có** | Nullable khi draft; backend tính lúc finalize |
| Revision | `revision` đã có | Material change sau finalize tăng revision | Không bắt buộc | Backend tăng revision; giữ log gửi cũ |
| Zalo | Log lưu `invoice_revision` theo từng lần gửi | Chỉ gửi invoice finalized/unpaid; resend revision mới | Không bắt buộc | Backend gating; log vẫn append-only |
| Payment | Transaction FK tới invoice; retry theo session | Chỉ tạo cho invoice unpaid/finalized | Không bắt buộc | Backend transaction kiểm tra trạng thái |
| Overdue | Status chỉ unpaid/paid | Derived từ unpaid và quá due date | Không | Không thêm status `overdue` |
| Reminders | Notifications và preferences tổng quát | Nhắc Admin vào period_end | Không bắt buộc | Scheduler sinh notification idempotent; kiểm tra preference/policy |

## 6. Draft totals, revision và paid invoice

### 6.1 Draft total semantics

Hai lựa chọn:

- **Option A — giữ amounts là số, mặc định 0:** tương thích amount NOT NULL và CHECK tổng hiện tại; trong draft các số có thể là provisional, sau khi đủ dữ liệu backend recalculate. Nhược điểm là 0 chưa phân biệt được “chưa nhập” với usage thực bằng 0.
- **Option B — cho amount nullable trong draft:** biểu diễn thiếu dữ liệu rõ hơn nhưng kéo theo nullability và biểu thức total/check phức tạp, thay đổi rộng hơn yêu cầu tối thiểu.

**Decision: Option A được phê duyệt cho V1.2**, giới hạn việc đọc/hiển thị total draft như một số tạm tính và tuyệt đối không cho payment/Zalo. Meter readings vốn nullable có thể là dấu hiệu kiểm tra completeness; backend cần xác định các readings/service inputs bắt buộc theo loại phí trước finalize. Không suy diễn `amount = 0` là dữ liệu đã hoàn tất.

### 6.2 Revision sau finalize

`revision` đã có và `invoice_zalo_oa_send_logs.invoice_revision` ghi revision gửi. Log có FK cùng tenant đến invoice và giữ từng lần gửi; đủ để implement counter/resend/log history mà không thêm invoice history table theo rule hiện tại. Backend phải chỉ tăng revision khi material fields thay đổi, lưu cập nhật và tạo log gửi mới theo transaction/outbox phù hợp. Các log trước đó không được sửa/xóa.

**Kết luận: NO SCHEMA CHANGE REQUIRED** nếu yêu cầu là lưu revision hiện hành và lịch sử lần gửi. V1.1 chưa lưu snapshot đầy đủ financial values theo mỗi revision; nếu audit sau này cần tái dựng chính xác nội dung hóa đơn tại từng lần gửi, cần requirement và schema change riêng.

### 6.3 Paid invoice immutability

Rule đã được phê duyệt là backend từ chối sửa trực tiếp financial fields sau khi invoice `paid`; sai sót được giải quyết bằng workflow adjustment riêng, không overwrite lịch sử đã thanh toán. Enforce ở backend/service layer. Không thêm trigger ở V1.2 vì business rule chưa yêu cầu database-level immutability; DB-level enforcement cần một change request riêng nếu sau này được yêu cầu.

## 7. Zalo, thanh toán và reminder

- **Zalo:** chỉ enqueue/send khi `status='unpaid' AND finalized_at IS NOT NULL`. Khi material change tạo revision mới, tạo send log mới với `invoice_revision` mới và giữ nguyên log trước. Các bảng hiện có đủ cấu trúc cho rule này; backend ngăn gửi draft.
- **Payment:** chỉ mở session/attempt khi invoice unpaid và đã finalized; draft và paid đều bị từ chối. `payment_transactions` không cần thay đổi. Backend phải kiểm tra lại trạng thái trong transaction khi bắt đầu checkout/callback để chống race.
- **Overdue:** state suy ra từ `status='unpaid' AND current_date > due_date`; không thêm enum/status.
- **Reminder:** `period_end` cho phép tính ngày nhắc và bảng `notifications` có thể lưu thông báo tổng quát. Không cần cột reminder date hay bảng riêng. `notification_preferences` hiện không có preference riêng cho nhắc meter; scheduler cần idempotency/deduplication và policy gửi phù hợp. Nếu sản phẩm yêu cầu tùy chọn bật/tắt reminder riêng hoặc audit lịch chạy, đó là một requirement bổ sung, chưa phải schema bắt buộc ở đây.

## 8. SQL target V1.2 minh họa — NOT EXECUTED

DDL V1.1 khai báo inline CHECK status không đặt tên tường minh. PostgreSQL thường tự sinh tên `invoices_status_check`, nhưng migration không nên phụ thuộc vào tên auto-generated nếu chưa xác minh catalog trên target. Bản clean-install V1.2 nên sửa trực tiếp định nghĩa `CREATE TABLE invoices`; patch V1.1→V1.2 phải truy vấn/xác minh constraint thực tế trước khi drop và ghi rõ constraint name trong migration có version.

Ví dụ thay đổi cho clean-install V1.2:

```sql
-- Approved V1.2 target shape inside CREATE TABLE invoices; illustration only, not executed.
due_date      date,
finalized_at  timestamptz,
status        varchar(16) NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft','unpaid','paid')),
...
CONSTRAINT invoices_lifecycle_consistent CHECK (
    (status = 'draft' AND finalized_at IS NULL AND due_date IS NULL)
    OR
    (status IN ('unpaid','paid') AND finalized_at IS NOT NULL AND due_date IS NOT NULL)
)
```

`period_start`, `period_end`, unique `(contract_id, period_start, period_end)` và total CHECK được giữ. `due_date` index vẫn hợp lệ với giá trị NULL ở draft. Không đưa phép tính due date vào CHECK vì ngày theo múi giờ nghiệp vụ và transition phải được xác lập tại finalize trong backend; validator phải kiểm tra công thức này.

## 9. Clean install và migration patch

Trong bước triển khai V1.2 theo basis đã approve, cần phát hành cả hai artifact:

1. **Clean install V1.2** — bản schema canonical V1.2 phản ánh status/field/constraint mới.
2. **Migration có version V1.1→V1.2** — ALTER có thể audit, có precondition, thay đổi constraint và cập nhật dữ liệu cũ theo policy được duyệt.

Dù hiện chưa có production data thật, giữ migration patch giúp truy vết version, tái lập môi trường và kiểm soát nâng cấp. Không tạo hai artifact này trong lượt change request.

## 10. Prisma impact

Khi triển khai V1.2 đã được approve, model `Invoice` trong `SmartRentalManagement/database/schema.prisma` cần tối thiểu:

```prisma
dueDate     DateTime? @map("due_date") @db.Date
finalizedAt DateTime? @map("finalized_at") @db.Timestamptz(6)
status      String    @default("draft") @db.VarChar(16)
```

Cần remap `status` enum-equivalent dạng String, thêm field và giữ physical names. Prisma schema không biểu diễn đầy đủ CHECK lifecycle; PostgreSQL vẫn là authority, backend validate và database validator test constraint. Cập nhật report, chạy `prisma validate` và `prisma generate` khi schema V1.2 đã được triển khai trong bước implementation. Không sửa Prisma trong change request này.

## 11. API_SPEC_REQUIRED_UPDATES

`04_API_SPEC.md` hiện có `POST /contracts/{contract_id}/invoices/generate`, `POST /invoices`, `PATCH /invoices/{invoice_id}`, send-Zalo và payment-session endpoints. Mục 9.3 trước đây ghi cadence/due-date chưa chốt; các nội dung đó đã được cập nhật theo business decisions đã approve.

Contract API đã được đồng bộ trong `docs/04_API_SPEC.md`:

- Invoice generation theo scheduler/command sinh `draft`, period xác định bằng contract anchor/clamp/final-period rule; không trả Invoice final hoặc mở payment.
- Bổ sung command `POST /invoices/{invoice_id}/finalize` cho Admin: nhận meter/service inputs cần thiết, backend xác thực completeness, recalculate, đặt `finalized_at`, `due_date`, `status=unpaid`, tăng revision theo policy và enqueue Zalo.
- `PATCH /invoices/{invoice_id}` chỉ cho chỉnh draft. Với invoice finalized nhưng unpaid, material amendment phải có semantics rõ: recalculate, increment revision, retain prior send logs và resend. Paid không sửa financial amounts.
- Mọi payment-session/attempt endpoint phải trả conflict khi invoice draft/paid hoặc chưa finalized; callback chỉ settle invoice unpaid hợp lệ.
- Send Zalo chỉ chấp nhận finalized/unpaid; log revision mới và giữ lịch sử.
- Response/read model trả `finalized_at`, nullable `due_date` ở draft và overdue dưới dạng derived state.
- Tài liệu hóa ngày due được tính theo ngày lịch `Asia/Ho_Chi_Minh` cộng 5 ngày; công thức period anchor/clamp và final-period calculations.
- Reminder tạo vào `period_end`; scheduler phải idempotent. Làm rõ giao tiếp giữa draft generation ngày kế tiếp và Contract đã kết thúc.

Các endpoint và semantics trên là contract V1.2 đã được ghi vào API Spec; implementation vẫn chưa được thực hiện.

## 12. Runtime validation V1.2

Kết quả 21/21 PASS là bằng chứng của V1.1, không thay thế validator V1.2. Bộ validation mới nên chạy trên database test sạch PostgreSQL 18, kiểm tra cả schema constraints và backend behaviors.

### DB validator

- Draft invoice chấp nhận `due_date IS NULL` và `finalized_at IS NULL`.
- Draft có due date hoặc finalized timestamp bị reject.
- Unpaid thiếu `finalized_at` hoặc `due_date` bị reject.
- Paid thiếu `finalized_at` hoặc `due_date` bị reject.
- Kỳ ngày 15 và kỳ clamp cuối tháng insert được; unique invoice kỳ tiếp tục chặn duplicate.
- Các invariant V1.1 còn lại tiếp tục pass trong bộ validator mới.

### Backend behavior tests

- `due_date` đúng ngày finalize theo `Asia/Ho_Chi_Minh` cộng 5 ngày lịch; kiểm tra biên qua tháng/năm và finalize trễ.
- Không tạo draft trước ngày sau `period_end`; reminder ở `period_end` không tạo invoice final.
- Thiếu meter/service input thì vẫn draft, không gửi Zalo, không thanh toán; nhập đủ thì recalculate/finalize đúng.
- Payment session bị từ chối cho draft/paid; cho phép invoice unpaid finalized.
- Zalo bị từ chối cho draft; resend revision không xóa/sửa log cũ.
- Overdue chỉ đúng khi unpaid và ngày hiện tại sau due date.
- Kỳ cuối cắt tại `contract.end_date`; full rent, usage điện/nước và loại service áp dụng đúng rule.
- Draft sửa được; material change unpaid tăng revision; paid financial fields không bị ghi đè.
- Scheduler/retry không tạo duplicate reminder hoặc duplicate invoice draft cho cùng contract-period.

## 13. Versioning và lock policy

- **V1.1:** giữ nguyên historical baseline — 25 bảng, PostgreSQL 18, schema/seed PASS, runtime 21/21 PASS, LOCK.
- **V1.2:** chỉ trở thành current LOCK baseline sau schema và seed pass, runtime validator pass, Prisma remap/validate/generate, API Spec/changelog cập nhật và decision artifacts được đồng bộ.
- Không sửa schema tùy tiện trong lúc code. Mọi schema update tiếp theo cần business-rule change được duyệt, version/migration mới và runtime validation.

## 14. Đánh giá rủi ro

| Thay đổi | Mức rủi ro | Lý do / giảm thiểu |
|---|---|---|
| `due_date` nullable | Medium | Query/report/payment code có thể giả định luôn có due date; chỉ due date draft được NULL, cập nhật toàn bộ consumer và index query. |
| Thêm status `draft`, đổi default | High | Ảnh hưởng generation, danh sách hóa đơn, status filters, seed và các nơi trước đây ngầm giả định insert là unpaid; migrate callers theo lifecycle. |
| Thêm `finalized_at` | Medium | Cần nhất quán timestamp/date theo Asia/Ho_Chi_Minh và transition atomic; backend set cùng due date/status. |
| Payment gating | High | Race giữa finalize, checkout, callback; khóa/đọc lại invoice trong transaction và giữ idempotency. |
| Zalo gating/revision | High | Tránh gửi invoice thiếu dữ liệu hoặc lặp revision; outbox/log theo revision và chỉ dispatch sau commit. |
| Seed compatibility | Medium | Seed V1.1 tạo invoice unpaid có due date nhưng không finalized_at; cập nhật fixture sang trạng thái hợp lệ và thêm draft test. |
| Prisma compile/remap | High | Generated client thay đổi nullability/status default, API/backend hiện đang dùng mapping V1.1; regenerate và inventory/typecheck theo kế hoạch riêng. |
| Billing clamp/final period | Medium | Sai date arithmetic hoặc drift làm kỳ chồng/lệch; test anchor ngày 29/30/31 qua năm nhuận và hợp đồng chấm dứt. |
| Draft provisional totals | Medium | Số 0 có thể bị hiểu là finalized; API/UI phải gắn nhãn draft và chặn payment/export/send. |

## 15. Thứ tự triển khai khuyến nghị

1. Requirement và API Spec đã được đồng bộ theo business decisions đã approve.
2. Tạo clean-install schema SQL V1.2 và migration patch V1.1→V1.2; review data transition/default behavior.
3. Cập nhật seed, gồm draft, finalized unpaid, paid hợp lệ và kỳ clamp/final-period.
4. Mở rộng runtime validator; chạy schema, seed và validator trên PostgreSQL 18 sạch.
5. Cập nhật `DATABASE_CHANGELOG.md` và ERD để thể hiện V1.1 historical và V1.2 current baseline sau khi validation PASS.
6. Remap Prisma V1.2, validate/generate và đánh giá ảnh hưởng typecheck/build backend.
7. Chỉ sau khi DB/API contract ổn định mới triển khai backend invoice lifecycle.

## 16. Trạng thái quyết định và implementation

```text
V1.2 REQUIRED: YES

Required schema changes:
- invoices.status hỗ trợ draft và default draft cho invoice generation mới.
- invoices.finalized_at timestamptz NULL.
- invoices.due_date chuyển nullable.
- CHECK bảo đảm draft => finalized_at/due_date NULL;
  unpaid/paid => finalized_at/due_date NOT NULL.

No-schema-change business rules:
- Room default capacity và Contract signed capacity snapshot.
- Contract-start anchored monthly periods, month-end clamp, no cumulative drift.
- Final period end, full-period rent, usage utilities và fixed/usage-based service calculations.
- Invoice revision counter và append-only Zalo send logs.
- Payment/Zalo eligibility, overdue derivation và reminder schedule (backend/scheduler rules).
- Paid invoice financial immutability được enforce ở backend/service layer; chưa thêm trigger.

API Spec updates required:
- Mô tả draft generation, finalize command, due date, revision amendment,
  payment/Zalo gating, overdue derived state và reminder timing.

Prisma updates required:
- Add nullable dueDate/finalizedAt; status default draft; giữ map vật lý;
  validate/generate theo schema V1.2 đã phê duyệt.

Validator updates required:
- Lifecycle CHECK, due-date calculation, payment/Zalo gating, scheduler idempotency,
  period clamp/final-period pricing và bảo toàn toàn bộ test baseline V1.1.

Risk:
- High overall — lifecycle mới đổi default/status và các cổng thanh toán/gửi hóa đơn.

Recommended next step:
- Change request đã được approve và Requirement + API Spec đã đồng bộ. Bước tiếp theo là tạo
  schema/migration V1.2; giữ Database V1.1 LOCK cho đến khi V1.2 schema/seed/validator PASS.
```
