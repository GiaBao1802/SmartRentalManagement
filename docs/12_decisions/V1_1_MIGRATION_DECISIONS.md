# Góc Trọ — Quyết định migration dữ liệu V1.1

**Trạng thái tài liệu:** Decision record cho review; không phải lệnh chạy migration.  
**Database baseline:** V1.1 LOCK — PostgreSQL 18, 25 public tables, schema/seed PASS, runtime validator 21/21 PASS.  
**Nguồn đối chiếu:** `docs/08_audits/MIGRATION_GAP_REPORT.md`, `docs/03_database/migrations/V1_1_DATA_MIGRATION_PLAN.md`, `GOCTRO_FUNCTION_SCOPE.md`, `01_REQUIREMENTS.md`, `GOCTRO_FUNCTION_MATRIX.md`, `04_API_SPEC.md`, `DATABASE_CHANGELOG.md`, cùng `SmartRentalManagement/database/schema.prisma` và locked root `database/schema.sql`.  
**Scope:** quyết định cách xử lý data legacy. Không đổi Requirement, schema V1.1, Prisma, API, backend hoặc frontend.

## Nguyên tắc và cách đọc status

- Database V1.1 LOCK là source of truth; mọi đề xuất đổi schema/Requirement phải đi theo change process riêng. **DO NOT CHANGE IT HERE.**
- Không suy diễn dữ liệu thiếu, không tạo fake history, không hạ tenant isolation hoặc financial integrity để giảm manual review.
- Phân biệt **schema-level decision** (rule chung), **runtime-data decision** (phân loại record sau inventory/dry run), và **manual per-record decision** (review từng hồ sơ). Static audit không chứng minh database runtime có dữ liệu giống seed.
- `APPROVED` nghĩa rule chung được quyết định, không khẳng định record runtime nào đã được xác minh.
- `APPROVED WITH MANUAL REVIEW` nghĩa rule an toàn được chốt; từng record exception vẫn phải duyệt. Runtime classification được deferred tới inventory/dry run.
- `REQUIRES PRODUCT DECISION` là business rule chưa được source có thẩm quyền chốt. Nội dung đề xuất trong “Chosen decision” chỉ là recommendation, chưa phải approval.
- `REQUIRES CHANGE REQUEST` chỉ dùng nếu muốn đổi locked schema/Requirement. Tài liệu này không phê duyệt change request.
- `BLOCKED` nghĩa chưa thể tiếp tục hoạt động phụ thuộc cho tới khi điều kiện được xử lý.

## DEC-001 — Owner mapping

- **Topic:** Legacy `LANDLORD UserAccount → Property.ownerId` sang `Owner → admin Account → Property`.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Target tách tenant root khỏi login account; legacy có Owner nullable và platform `ADMIN`.
- **Evidence:** Legacy `Property.ownerId` nullable trỏ `UserAccount`; `LANDLORD` gắn Property. V1.1 yêu cầu Owner tenant root, Admin Account riêng và Property có Owner.
- **Options:** Một Owner cho mỗi LANDLORD có ownership hợp lệ; gom nhiều LANDLORD vào business Owner; gán Property cho Admin; quarantine.
- **Chosen decision:** Mặc định 1 LANDLORD có ít nhất một Property ownership hợp lệ → tạo 1 Owner và map/tạo 1 admin Account; các Property ownership đã xác minh của landlord đó cùng map Owner. Chỉ gom landlord accounts khi có evidence cùng business Owner và người duyệt xác nhận.
- **Reason:** Giữ tenant boundary và tránh đổi login account thành tenant identity.
- **Migration rule:** Dùng `owner_mapping.csv`; ghi legacy account, new Owner/admin IDs, evidence, status và reviewer. `owner_id` từ nguồn hợp lệ là evidence chính; `createdById` chỉ hỗ trợ.
- **Manual review rule:** Review account không có Property, nhiều landlord cùng business, Property được ADMIN tạo, Property có owner conflict, landlord inactive và seed/demo identities.
- **Reject/quarantine rule:** `Property.ownerId IS NULL`, không phân biệt được demo/real hoặc ownership conflict → quarantine Property và dữ liệu operational phụ thuộc.
- **Validation:** Mọi operational Property/Room/Contract phải truy được đúng một Owner; composite tenant constraints pass; Owner unresolved = 0 trước cutover.
- **Rollback impact:** Không ghi vào legacy. Bỏ/recreate target trước cutover; post-cutover giữ mapping artifact và freeze writes khi cần.
- **Implementation impact:** `owner_mapping.csv`/staging. Operational Property không có Owner xác định → `NO CUTOVER`.

## DEC-002 — Legacy platform ADMIN

- **Topic:** Disposition role `ADMIN` legacy, không có equivalent platform super-admin trong V1.1.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Tự map ADMIN thành Owner Admin có thể tạo quyền xem/sửa tenant không thuộc người đó.
- **Evidence:** Legacy enum có `ADMIN`; V1.1 chỉ có Admin scoped theo Owner và Resident; Requirement không có super-admin.
- **Options:** Tạo Owner tùy ý; map nếu đại diện landlord đã chứng minh; archive/deactivate.
- **Chosen decision:** Không auto-map; mặc định archive/deactivate khỏi operational target. Chỉ map thủ công sau bằng chứng account đó đại diện chủ trọ cụ thể và xác minh ownership.
- **Reason:** Tránh cấp quyền chéo tenant.
- **Migration rule:** Giữ account ID/role/status trong restricted archive; chỉ tạo V1.1 admin khi DEC-001 mapping được duyệt.
- **Manual review rule:** Từng ADMIN account nghi là chủ trọ thực phải có reviewer xác nhận legal/business identity và các Property liên quan.
- **Reject/quarantine rule:** Không có evidence → archive-only; không gán Owner gần nhất hoặc Property do account tạo.
- **Validation:** Không có platform-wide role/account trong target; mọi admin account target gắn đúng một Owner.
- **Rollback impact:** Không ảnh hưởng source; có thể re-run target sau khi review.
- **Implementation impact:** Không được seed/migrate legacy ADMIN thành V1.1 Admin một cách tự động.

## DEC-003 — Resident / CCCD ownership

- **Topic:** Map Tenant global sang Resident scoped theo Owner.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Legacy national ID unique toàn hệ thống; V1.1 unique `(owner_id,national_id)`.
- **Evidence:** Legacy `Tenant.nationalId @unique`; target `residents.owner_id NOT NULL` và tenant-scoped unique.
- **Options:** Gán theo createdBy; gán theo Contract/Room/Property; tạo global person identity; manual review.
- **Chosen decision:** Evidence hierarchy: (1) Contract→Room→Property→Owner; (2) historical contract/property relationship; (3) `createdBy` landlord supporting only; (4) manual review. Verified relationships với nhiều Owner tạo Resident riêng từng Owner.
- **Reason:** Cư dân thuộc từng tenant; không được truy vấn CCCD xuyên chủ trọ.
- **Migration rule:** Map theo cặp `legacy_tenant_id + target_owner_id`; không dùng CCCD làm key đích hoặc identity global.
- **Manual review rule:** Nhiều Owner, relationship conflict, chỉ có `createdBy`, hoặc Occupant không khớp Tenant.
- **Reject/quarantine rule:** Không Owner rõ → quarantine; CCCD không sửa để qua constraint.
- **Validation:** Same CCCD cross-owner hợp lệ; cùng Owner không duplicate; lookup và quan hệ đều scoped.
- **Rollback impact:** Source không đổi; drop/recreate target nếu mapping sai trước cutover.
- **Implementation impact:** `resident_mapping.csv` giữ evidence/confidence/review state. Runtime row classification deferred.

## DEC-004 — Duplicate CCCD

- **Topic:** Duplicate CCCD giữa/cùng Owner.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Hai hồ sơ cùng CCCD có thể là quan hệ cross-owner hợp lệ hoặc duplicate cùng tenant cần xác minh.
- **Evidence:** V1.1 cho phép cùng CCCD ở Owner khác nhau nhưng unique theo `(owner_id,national_id)`.
- **Options:** Merge tự động; giữ cả; chọn một; review rồi merge/archive/reject.
- **Chosen decision:** Cross-owner duplicate hợp lệ. Same-owner duplicate **không auto merge**.
- **Reason:** Profile V1.1 tách biệt theo Owner; merge tùy tiện có thể nối nhầm hợp đồng, xe hoặc account.
- **Migration rule:** Review họ tên, phone, email, DOB, contracts, occupancy, vehicles và account; quyết định `MERGE`, `KEEP ONE + ARCHIVE DUPLICATE`, hoặc `REJECT/QUARANTINE`.
- **Manual review rule:** Bắt buộc khi cùng Owner + CCCD hoặc nhiều legacy Tenant ánh xạ một Resident.
- **Reject/quarantine rule:** Conflict identity/contract không giải được → giữ source, không insert duplicate.
- **Validation:** DB từ chối same-owner duplicate và chấp nhận cross-owner duplicate; mọi merge có audit decision.
- **Rollback impact:** Re-run clean target từ source; giữ decision artifact.
- **Implementation impact:** Không có fuzzy merge tự động.

## DEC-005 — Room default capacity

- **Topic:** Thiết lập `rooms.default_capacity`.
- **Status:** `REQUIRES PRODUCT DECISION`
- **Problem:** Legacy Room không có default capacity; V1.1 yêu cầu `default_capacity >= 1`.
- **Evidence:** Schema Prisma Room không khai báo capacity; `LeaseContract.occupantCount` là per-contract count và semantics chưa chứng minh là giới hạn tối đa Room.
- **Options:** A) default 1; B) manual verify từng Room; C) derive từ reliable room category; D) quarantine Room thiếu capacity.
- **Chosen decision:** **Recommendation:** option B; nhận capacity được Owner/Product xác nhận cho từng Room. Không dùng option A hoặc C nếu không có rule/category đã duyệt. Option D áp dụng tới khi record có capacity hợp lệ.
- **Reason:** Capacity tác động occupancy, parking và eligibility; một người hiện ở không chứng minh Room chỉ chứa một người.
- **Migration rule:** Chưa insert operational Room thiếu giá trị capacity đã xác nhận.
- **Manual review rule:** Reviewer ghi capacity và evidence/approver per Room; giá trị phải ≥1.
- **Reject/quarantine rule:** Thiếu product approval hoặc value invalid → quarantine Room và downstream data; không gán 1.
- **Validation:** Mọi Room đích có capacity được phê duyệt; occupancy/parking không vượt hợp đồng.
- **Rollback impact:** Recreate target sau khi capacity decisions được sửa; source giữ nguyên.
- **Implementation impact:** Block dry-run **load Room** và full dry run nếu unresolved Room còn trong target scope; cần product chốt default/per-room approval policy.

## DEC-006 — Room area missing

- **Topic:** `rooms.area_m2` bắt buộc dương.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Legacy `Room.areaM2` nullable; target `area_m2 > 0 NOT NULL`.
- **Evidence:** Prisma `Decimal?`; locked schema check area positive.
- **Options:** Invent/default area; xác minh per Room; quarantine.
- **Chosen decision:** Missing/zero/invalid area → manual verification; không load operational Room cho đến khi có giá trị hợp lệ. Default chỉ qua Product Change/approval riêng.
- **Reason:** Diện tích là dữ liệu public/business, không thể bịa.
- **Migration rule:** Map exact positive source value; giữ precision phù hợp target.
- **Manual review rule:** Xác nhận từ hồ sơ/property owner/document có nguồn.
- **Reject/quarantine rule:** Không evidence → quarantine; không lấy diện tích Property default nếu source không chứng minh đó là Room area.
- **Validation:** Tất cả operational Room có area > 0; unresolved count báo riêng.
- **Rollback impact:** Không sửa source; re-run sau khi xác minh.
- **Implementation impact:** Runtime classification deferred; nếu muốn default area cần `REQUIRES PRODUCT DECISION`.

## DEC-007 — Occupancy dates

- **Topic:** Backfill `room_residents.started_at/ended_at/status`.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** `ContractOccupant` không có occupancy start/end/status timeline đầy đủ.
- **Evidence:** Legacy occupant liên kết Contract; target yêu cầu dates và lưu lịch sử.
- **Options:** Copy Contract dates; reconstruct từ bằng chứng; insert partial; quarantine.
- **Chosen decision:** Phân lớp `EXACT`, `RECONSTRUCTED`, `PARTIAL`, `UNKNOWN`. Chỉ `EXACT` và `RECONSTRUCTED` có dates/evidence đáng tin, được reviewer duyệt, mới insert. `PARTIAL/UNKNOWN` không insert như lịch sử chính xác.
- **Reason:** Contract interval không tự chứng minh ngày chuyển vào/ra.
- **Migration rule:** Không mặc định `Contract.start_date = move-in` hoặc `end_date = move-out`. `ended_at NULL` chỉ dùng khi evidence supports current/open occupancy; status tương ứng phải có căn cứ.
- **Manual review rule:** Reconstructed dates cần ít nhất nguồn evidence được product/data reviewer chấp nhận và confidence rationale.
- **Reject/quarantine rule:** Không evidence dates hoặc Owner/Room/Resident conflict → quarantine mapping; source Contract/Occupant vẫn giữ.
- **Validation:** Inserted occupancy dates hợp lệ, same Owner/Room/Contract context, capacity enforced; report count per class.
- **Rollback impact:** Remove/recreate target rows only before cutover; mapping evidence remains.
- **Implementation impact:** No fake history; unresolved occupancy may be archived while other verified records proceed, subject to contract/CT01 cutover scope.

## DEC-008 — Contract `occupantCount` vs `resident_capacity`

- **Topic:** Map legacy `occupantCount` sang target `contracts.resident_capacity`.
- **Status:** `REQUIRES PRODUCT DECISION`
- **Problem:** Chưa chứng minh field này là maximum allowed capacity hay số người đang ở tại thời điểm tạo.
- **Evidence:** Prisma field name/comment chỉ là `occupantCount`; không có product definition source xác nhận “max”. Target capacity điều khiển cư dân và slot gửi xe.
- **Options:** Map trực tiếp; chỉ map nếu evidence cho thấy max; derive từ occupants; quarantine.
- **Chosen decision:** **Recommendation:** không map trực tiếp cho tới khi product xác nhận semantics. Khi đã xác nhận max resident capacity, được map; nếu là current count thì không dùng làm capacity. Không derive capacity từ occupants.
- **Reason:** Dùng current count làm limit có thể khóa sai khả năng ở/parking.
- **Migration rule:** Nạp capacity chỉ từ field được approve là maximum; contract chưa resolve bị quarantine khỏi operational scope.
- **Manual review rule:** So source UI/business evidence và representative contract examples; approver phải ghi semantics.
- **Reject/quarantine rule:** Ambiguous → không insert operational Contract.
- **Validation:** `resident_capacity >= 1`; occupancy/parking count không vượt approved capacity.
- **Rollback impact:** Target-only rerun sau khi decision chốt.
- **Implementation impact:** Block Contract dry-run load cho records chưa resolve; cần product decision trước foundation dry-run có Contracts.

## DEC-009 — ContractExtension

- **Topic:** Map extension thành successor Contract.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Extension row có before/after terms nhưng có thể amendment chứ không renewal.
- **Evidence:** Target `previous_contract_id` nối successor; predecessor không bị mutate.
- **Options:** Update base; tạo successor mọi extension; archive-only; tạo successor khi evidence đầy đủ.
- **Chosen decision:** Chỉ convert khi có effective dates, new term snapshot, Room, representative, no overlap và evidence đó là renewal. Thiếu bất kỳ thành phần trọng yếu → archive-only.
- **Reason:** Bảo toàn contract lineage, không tạo lịch sử giả.
- **Migration rule:** Base contract trước; successor mới sau; giữ predecessor data bất biến.
- **Manual review rule:** Review từng extension và timeline; `createdAt` không phải effective date.
- **Reject/quarantine rule:** Conflict dates/terms/Room/Owner hoặc chỉ có createdAt → archive-only, không successor.
- **Validation:** Same Room/Owner lineage, no self/cycle/multiple successor/overlap.
- **Rollback impact:** Rerun target lineage from clean snapshot.
- **Implementation impact:** Extension source data vẫn được lưu archive khi không đạt criteria.

## DEC-010 — CANCELLED contracts

- **Topic:** Disposition status không có target equivalent.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Legacy `CANCELLED`; V1.1 statuses không có cancelled.
- **Evidence:** Prisma enum `CANCELLED`; locked schema `draft/active/expired/terminated`.
- **Options:** Archive-only; map terminated; map draft; add status.
- **Chosen decision:** Mặc định `ARCHIVE ONLY`. Chỉ map nếu business evidence xác nhận một record cụ thể thực chất là terminated/expired theo target semantics. Thêm status cần `REQUIRES CHANGE REQUEST`.
- **Reason:** Không biến cancelled trước hiệu lực thành contract đã terminated hoặc còn draft.
- **Migration rule:** Không nạp operational contract status tương đương chỉ để pass CHECK.
- **Manual review rule:** Nếu cần operationally visible, xác minh effective date, possession, termination/settlement evidence.
- **Reject/quarantine rule:** Meaning unresolved → archive-only.
- **Validation:** Không có CANCELLED bị ép sang trạng thái khác; counts được reconcile.
- **Rollback impact:** Source immutable; target rerun.
- **Implementation impact:** V1.1 schema không đổi.

## DEC-011 — Invoice recurrence algorithm

- **Topic:** Derive `period_start/period_end` từ Contract anchor.
- **Status:** `REQUIRES PRODUCT DECISION`
- **Problem:** Anchor `contracts.start_date` đã LOCK; recurrence/end-date edge rules chưa được xác định đầy đủ.
- **Evidence:** Requirements/DB quyết định không dùng tháng dương lịch và không mặc định mọi kỳ 30 ngày; API Spec ghi recurrence/edge-date rule chưa fully specified.
- **Options:** Fixed 30-day intervals; monthly anniversary with clamp; calendar month; case-specific legacy month match.
- **Chosen decision:** **Recommendation for approval, not approved:** `period_start(n) = contract.start_date shifted by n calendar months`; target day clamp vào ngày cuối tháng nếu ngày anchor không tồn tại; `period_end(n) = period_start(n+1) - 1 day`. Không dùng calendar month hoặc fixed 30 days.
- **Reason:** Giữ lịch tháng neo theo contract date thay vì ép kỳ 30 ngày; tuy nhiên clamp có thể gây drift nên business must approve.
- **Migration rule:** Không generate target periods cho tới khi recurrence được chốt; legacy year/month chỉ là evidence.
- **Manual review rule:** Review periods quanh day 29/30/31, February/leap year, short months, contract end và renewal.
- **Reject/quarantine rule:** Candidate không duy nhất hoặc conflict invoice → no auto insert.
- **Validation:** Test expected intervals và unique period; reconcile amounts, no gaps/overlap nếu approved semantics đòi hỏi.
- **Rollback impact:** Không cutover với period unresolved; rerun clean target sau quyết định.
- **Implementation impact:** P0; full invoice dry-run và cutover blocked cho đến khi product approve algorithm.

**Edge-case analysis cho candidate (chưa phê duyệt):**

| Contract anchor | Candidate effect với clamp | Cần xác nhận |
|---|---|---|
| Ngày 29 | February non-leap period start clamp về 28; kỳ kế tiếp quay lại ngày 29 trong tháng có ngày 29 | Có chấp nhận chu kỳ ngắn/dài khác nhau do biên ngày không? |
| Ngày 30 | February clamp về 28/29; kỳ kế tiếp tháng có 30 khôi phục ngày 30 | Có drift tạm thời sau February không? |
| Ngày 31 | Các tháng ngắn clamp 28/29/30; kỳ tiếp theo dùng lại ngày 31 khi tồn tại | Anchor gốc giữ bất biến hay ngày sau clamp trở thành anchor? Recommendation: luôn tính từ ngày gốc, không tích lũy drift. |
| February/leap year | Cuối kỳ là ngày trước anniversary kế tiếp theo clamp | Năm nhuận làm kỳ February dài thêm một ngày; xác nhận chấp nhận. |
| Short month | Clamp về ngày cuối tháng; period end là ngày liền trước kỳ start sau | Không áp dụng tháng 1 làm kỳ hóa đơn. |
| Contract end giữa kỳ | Kỳ vẫn theo recurrence; phân bổ/short final period chưa được Requirement chốt | Không prorate hoặc thay period nếu chưa có rule. |
| Renewal bắt đầu sát kỳ | Successor giữ anchor start mới theo contract successor | Quy tắc duplicate/overlap/partial period cần product/backend approval. |

## DEC-012 — Invoice due-date formula

- **Topic:** Chọn `due_date`.
- **Status:** `REQUIRES PRODUCT DECISION`
- **Problem:** Source of truth không định nghĩa số ngày/relative billing rule.
- **Evidence:** API Spec ghi due-date formula chưa fully specified.
- **Options:** `period_start + N`; `period_end`; `period_end + N`; fixed Property billing day.
- **Chosen decision:** **Recommendation for approval:** chọn một formula thống nhất sau khi Product quyết định; không tự chọn N hoặc fixed day trong migration.
- **Reason:** Due date ảnh hưởng overdue state, resident notification và financial reporting.
- **Migration rule:** Map exact valid legacy due date chỉ nếu business xác nhận đó là due date trong target semantics; không tự recompute bằng giả định.
- **Manual review rule:** Conflict giữa dueDate, invoice status/payment evidence cần finance review.
- **Reject/quarantine rule:** Không có authoritative due date và cần operational overdue behavior → quarantine invoice khỏi operational target.
- **Validation:** Due date distribution/late status reconciliation được finance ký nhận.
- **Rollback impact:** Không cutover với invoice due-date semantics unresolved.
- **Implementation impact:** P0 for invoice operational cutover; formula approval required.

## DEC-013 — Legacy month to invoice period

- **Topic:** Map `billingYear/billingMonth`.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Calendar label không cho biết period interval theo Contract anchor.
- **Evidence:** Legacy unique `(contract, year, month)`; target unique `(contract, period_start, period_end)`.
- **Options:** Convert month start/end; infer by anchor; match evidence and review.
- **Chosen decision:** Month field là evidence only. Target interval derive từ Contract anchor + recurrence approved in DEC-011.
- **Reason:** Không vi phạm locked anchor/no-calendar-month rule.
- **Migration rule:** Compare legacy month with candidate periods, dueDate, creation/readings/lines; candidate phải unique.
- **Manual review rule:** Mismatch month, missing anchor, multiple candidate or duplicate target period.
- **Reject/quarantine rule:** Collision → `NO AUTO INSERT`; quarantine all conflicting candidates until resolved.
- **Validation:** Invoice count and period uniqueness; unresolved candidate count accepted before cutover.
- **Rollback impact:** Target-only rerun after mapping decision.
- **Implementation impact:** Blocked by DEC-011 and DEC-012 for operational invoice load.

## DEC-014 — Invoice VOID

- **Topic:** Legacy `VOID` status.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** V1.1 invoice status only `unpaid/paid`.
- **Evidence:** Legacy enum includes `VOID`; locked schema excludes it.
- **Options:** Map unpaid; map paid; archive; request status addition.
- **Chosen decision:** VOID invoices archive-only financial history by default. No mapping to unpaid/paid. Operational visibility requiring a target status needs `REQUIRES CHANGE REQUEST`.
- **Reason:** Void is neither collectible unpaid nor settled paid.
- **Migration rule:** Preserve source record/reference in restricted archive/reconciliation; exclude from active invoice rows.
- **Manual review rule:** Review void rows with payments, reversals or contradictory status.
- **Reject/quarantine rule:** Financial conflict remains archive-only until finance disposition.
- **Validation:** No target unpaid/paid invoice came from VOID without explicit approved disposition.
- **Rollback impact:** Source preserved; target re-created if status wrongly mapped.
- **Implementation impact:** No schema change.

## DEC-015 — Historical manual Payment

- **Topic:** Legacy CASH/BANK_TRANSFER/OTHER vs provider transactions.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** V1.1 `payment_transactions` semantically represents MoMo/ZaloPay attempts, sessions and provider events.
- **Evidence:** Prisma `Payment` is manual receipt ledger; target provider enum excludes CASH/BANK_TRANSFER/OTHER.
- **Options:** Fake provider attempt; add schema; restricted archive ledger; approved future representation.
- **Chosen decision:** Do **not** map manual Payment to `payment_transactions`. Preserve original payment records in restricted read-only legacy financial archive. Any in-product history representation requires separate product/schema decision.
- **Reason:** Prevent fake provider/session/callback data and preserve audit truth.
- **Migration rule:** No synthetic `payment_session_id`, provider, transaction/event ID or callback; no target transaction generated from invoice paid flag.
- **Manual review rule:** Finance reviews paid invoice evidence under DEC-016.
- **Reject/quarantine rule:** Inconsistent payment/invoice relation remains archive-only and unresolved until finance disposition.
- **Validation:** Report archived payment count/sums by method; target has only verified real provider transactions if any existed.
- **Rollback impact:** Keep immutable archive/backup; no source rollback.
- **Implementation impact:** Historical payment ledger disposition approved; records remain accessible only under archive policy.

## DEC-016 — Paid invoice evidence

- **Topic:** Decide when legacy invoice may map as `paid`.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Legacy `status=PAID`/`paidAt` may lack matching receipt evidence; V1.1 has no legacy payment ledger.
- **Evidence:** Invoice and Payment separate in legacy; totals and receipt rows can disagree.
- **Options:** Trust PAID flag; require Payment match; archive status; finance review.
- **Chosen decision:** `PAID + matching Payment record + matching amount` = strong candidate, still finance-reviewed. PAID without Payment, amount mismatch, partial payment, or overpayment = review/archive; migration cannot set target `paid` when reconciliation fails.
- **Reason:** Financial integrity takes priority over count coverage.
- **Migration rule:** Require one-to-one invoice mapping and documented evidence; partial/manual sums remain in archive.
- **Manual review rule:** Finance reviewer signs off exception and paid state.
- **Reject/quarantine rule:** Failed reconciliation → do not set paid; keep invoice out of operational target or map only with approved alternative disposition.
- **Validation:** Paid count/sums, unpaid count, payment sums, over/underpayments reconcile; no accidental duplicate success.
- **Rollback impact:** Freeze/rollback decision if wrong paid state detected after cutover.
- **Implementation impact:** Invoice cutover blocked for unresolved financial mismatches.

## DEC-017 — InvoiceLine `OTHER` and line details

- **Topic:** Line-level data without V1.1 invoice-lines table.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Target stores rent/electricity/water/service amount buckets only.
- **Evidence:** Locked schema has amount buckets and meter fields, no generic line table.
- **Options:** Drop detail; map approved SERVICE aggregation; schema change; archive detail.
- **Chosen decision:** Aggregate only approved, semantically equivalent service lines into `service_amount`; preserve unsupported/`OTHER` descriptions and values in restricted reconciliation archive. Never silently discard. Product needs line history in application → `REQUIRES CHANGE REQUEST`.
- **Reason:** Preserve audit while keeping V1.1 immutable.
- **Migration rule:** Reconcile all source lines to buckets and total; do not force mismatch.
- **Manual review rule:** Multiple lines per bucket, `OTHER`, ambiguous quantity/unit/rate or description-sensitive lines.
- **Reject/quarantine rule:** Cannot reconcile invoice total → quarantine invoice.
- **Validation:** Source line sum, bucket sum and total amount match; archive manifest counts all detail.
- **Rollback impact:** Re-run target after correcting approved aggregation; archive persists.
- **Implementation impact:** No line schema addition in this decision document.

## DEC-018 — Contract document uploader

- **Topic:** Required `uploaded_by_account_id` for imported document metadata.
- **Status:** `REQUIRES PRODUCT DECISION`
- **Problem:** Legacy embedded document fields do not reliably identify uploader.
- **Evidence:** Locked `contract_documents.uploaded_by_account_id` is **NOT NULL** and FK requires Admin Account from the same Owner.
- **Options:** Arbitrary Admin; change schema nullable; import only with proven uploader; archive file/metadata outside target.
- **Chosen decision:** **Recommendation:** never assign arbitrary uploader. Import into `contract_documents` only if a same-Owner Admin uploader is proven. Unknown-uploader files remain in restricted object/archive inventory. Product must confirm archive-only disposition is acceptable for operational contract document history; otherwise submit change request (no change here).
- **Reason:** Required audit FK cannot be truthfully populated from missing evidence.
- **Migration rule:** Verify object exists, checksum, contract Owner and real uploader before row insert.
- **Manual review rule:** Audit evidence for uploader/Owner and signed status.
- **Reject/quarantine rule:** Unknown uploader, missing object or cross-owner key → no target document row; quarantine/archive.
- **Validation:** Every target row's uploader is a same-Owner Admin; document checksum and version uniqueness pass.
- **Rollback impact:** Recreate target without invalid metadata; object archive retained.
- **Implementation impact:** Decision needed on accepting archive-only for unknown-uploader legacy files; no schema change unless a separately approved request.

## DEC-019 — Contract signed metadata

- **Topic:** `signedAt` and document `signed` state.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Timestamp/status/file name does not alone prove a signed file exists or signature is valid.
- **Evidence:** Legacy Contract embeds `signedAt`, `documentStorageKey`, `documentFileName`; target signed state requires signed timestamp.
- **Options:** Infer signed from ACTIVE/filename; map timestamp; archive candidate; verify file and source evidence.
- **Chosen decision:** Map signed only if timestamp is valid, object exists/readable and source proves it is signed. Never infer from filename, ACTIVE status or file existence alone.
- **Reason:** Avoid false legal/audit assertion.
- **Migration rule:** Unverified files/candidates archived; verified file gets checksum and approved metadata/version.
- **Manual review rule:** Review signature evidence, key, time and uploader.
- **Reject/quarantine rule:** Missing/weak evidence → quarantine/archive as non-signed candidate; no `signed` target row.
- **Validation:** Every signed target document has `signed_at` and evidence; binary checksum matches manifest.
- **Rollback impact:** Invalid metadata rows excluded on clean rerun; source object untouched.
- **Implementation impact:** Storage backup and object inventory required before document dry-run.

## DEC-020 — Parking slot strings

- **Topic:** Legacy `Vehicle.parkingSlot` text.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Target requires physical area, slot, assignment period and contract context.
- **Evidence:** Legacy only has optional string; V1.1 has areas/slots/assignments with active uniqueness/capacity checks.
- **Options:** Create slot from each unique string; map verified contexts; archive unverified text.
- **Chosen decision:** Verified Property + ParkingArea + physical slot + Vehicle/Resident/Room/Contract + timeframe → create slot and assignment. Unverified string → restricted archive only.
- **Reason:** Text label alone does not identify a physical asset or valid assignment.
- **Migration rule:** Preserve raw string in `parking_slot_mapping`; check slot/vehicle overlap and contract capacity.
- **Manual review rule:** Duplicate strings, ambiguous Property/area, missing start/end, resident/contract relation.
- **Reject/quarantine rule:** Unverified physical context → no target slot/assignment.
- **Validation:** No active slot/vehicle double assignment; active assignments do not exceed contract capacity.
- **Rollback impact:** Rerun target assignments; source vehicle unchanged.
- **Implementation impact:** Parking assignment migration may be partial while verified Vehicle rows map.

## DEC-021 — AmenityBooking

- **Topic:** Hourly booking vs 30-day Pool/Gym subscription.
- **Status:** `APPROVED`
- **Problem:** Legacy booking dates/time slots do not encode recurring membership.
- **Evidence:** V1.1 Pool/Gym subscription cycles are 30 days/720 hours; booking table is date/time use.
- **Options:** Convert booking to subscription; archive booking; create subscription with independent evidence.
- **Chosen decision:** `DO NOT map to subscription.` Archive historical hourly bookings. Create subscription only with independent evidence of genuine 30-day membership.
- **Reason:** Different product behavior and billing semantics.
- **Migration rule:** Catalog may map separately; booking status/date/time remain archive-only.
- **Manual review rule:** Membership candidates require independent evidence and contract/Owner eligibility.
- **Reject/quarantine rule:** Booking-only evidence → no subscription/cycle.
- **Validation:** No hourly booking creates subscription; every migrated cycle is exactly 720 hours with supported price snapshot.
- **Rollback impact:** Target rerun; source booking preserved.
- **Implementation impact:** No fake cycle/price history.

## DEC-022 — MaintenanceRequest → Complaint

- **Topic:** Current request mapping and sender/source identity.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Source enum `PUBLIC/ADMIN/TENANT_PORTAL`; target Complaint expects tenant/resident/Property scope; legacy lacks history.
- **Evidence:** `MaintenanceRequest` may have nullable tenant/room and current status/priority.
- **Options:** Attach nearest resident; map only verified resident request; archive public/admin; fabricate history from status.
- **Chosen decision:** Map current complaint fields only when Resident/Room/Property/Owner are verified. `PUBLIC` and `ADMIN` source do not imply Resident sender. Do not create complaint history from current status/timestamps.
- **Reason:** Do not assign a complainant or event history without evidence.
- **Migration rule:** Record source ID in restricted reconciliation; history starts in V1.1 unless real audit events exist.
- **Manual review rule:** Sender identity, source, room/property and category mapping.
- **Reject/quarantine rule:** Unknown Resident or tenant conflict → quarantine; no arbitrary Resident association.
- **Validation:** Complaint composite scope valid; history rows have actual source events only.
- **Rollback impact:** Rerun target after correcting verified mappings; source preserved.
- **Implementation impact:** Current complaints may migrate partially; no fake `migrated_from_legacy` event without policy approval.

## DEC-023 — RoomViewingRequest

- **Topic:** Appointment data to contact-only request.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** V1.1 supports Contact Request, not viewing booking.
- **Evidence:** Legacy has preferred date/time and appointment status; requirement/API says contact-only.
- **Options:** Convert full appointment; map contact fields and archive booking fields; discard.
- **Chosen decision:** Map name, phone, email, message, Property and optional Room when relationship is verifiable. Archive preferredDate/time, confirmation and appointment state; do not create booking behavior.
- **Reason:** Keep guest inquiry while removing out-of-scope appointment semantics.
- **Migration rule:** Contact request must route to verified Property/Owner; archive legacy appointment detail separately when retention approved.
- **Manual review rule:** Missing Room/Property, consent/retention, invalid contact details.
- **Reject/quarantine rule:** Cannot route to verified Owner → archive/quarantine; no target contact row.
- **Validation:** Target exposes only public/contact fields and no appointment workflow.
- **Rollback impact:** Source remains read-only; target can be rebuilt.
- **Implementation impact:** Preserve old date/time only in restricted archive, not active V1.1 behavior.

## DEC-024 — Password/account migration

- **Topic:** Credentials, account identities, demo users.
- **Status:** `APPROVED WITH MANUAL REVIEW`
- **Problem:** Password hashes may not be compatible; seed/default credentials include `123456` fallback.
- **Evidence:** Legacy uses scrypt seed format and demo `admin/landlord/tenant`; V1.1 requires password hash and secure enrollment/reset practices.
- **Options:** Preserve compatible hash; force reset/invitation; migrate plaintext/default.
- **Chosen decision:** Preserve only if algorithm is known, compatible, cost/security accepted and security review approves. Otherwise force secure reset/enrollment. Never migrate plaintext/default/demo `123456`; never promote seed accounts as production users.
- **Reason:** Prevent credential compromise and demo-account access.
- **Migration rule:** Map role/account only after Owner/Resident mapping; no password/token in reports.
- **Manual review rule:** Hash format, identity duplicate, inactive/locked status and account linkage.
- **Reject/quarantine rule:** Unknown/default credential or cross-tenant identity → deactivate/archive; require reset before access.
- **Validation:** No default credentials; each target Resident/Admin account links to one verified scope; stored values remain encoded hashes.
- **Rollback impact:** Freeze auth/cutover if credentials or account scope invalid; never restore plaintext.
- **Implementation impact:** Use approved reset/invitation delivery flow; no V1.1 invitation history is fabricated.

## DEC-025 — Notification history

- **Topic:** Preference mapping and inbox history.
- **Status:** `APPROVED`
- **Problem:** Legacy has preferences but no reliable notification history.
- **Evidence:** V1.1 has `notification_preferences` and `notifications`; legacy has `NotificationPreference` only.
- **Options:** Map equivalent preferences; fabricate events; start history at V1.1.
- **Chosen decision:** Map semantically compatible preferences; `notifications` history starts from V1.1.
- **Reason:** Preference is configuration, not evidence a notification was sent/read.
- **Migration rule:** Map only after account Owner/Resident identity; translate invoice/overdue/contract/issue to approved equivalent flags.
- **Manual review rule:** Preference meaning or account role mismatch.
- **Reject/quarantine rule:** Unmapped account/ambiguous semantics → archive preference; no notification event.
- **Validation:** Preferences link valid account; zero synthetic notifications.
- **Rollback impact:** Target can be recreated; source preference stays intact.
- **Implementation impact:** No email/push/send logs are introduced by migration.

## Backup approval decision

- **Decision ID:** `BACKUP-001`
- **Topic:** Required backup set and restore verification.
- **Status:** `APPROVED`
- **Problem:** Migration cannot safely begin from an unverified dump or the only copy of data.
- **Evidence:** Migration safety policy requires source read-only, separate target and verified restore.
- **Options:** Rely on dump success/file presence; verified backup and restore-test; migrate without backup for dry run.
- **Chosen decision:** Require (1) pre-migration verified custom-format dump, (2) final pre-cutover frozen-source dump, (3) post-migration verified V1.1 dump, and Git checkpoint/tag `pre-v1.1-data-migration`; plain SQL is supplemental. Restore-test PASS is mandatory before any dry run.
- **Reason:** Establish recoverable source and target checkpoints.
- **Migration rule:** Never overwrite; store off database disk; encrypt/access-limit PII; track checksum/manifest.
- **Manual review rule:** DBA/owner verifies restore test, critical counts, source/target versions and secret recovery procedure.
- **Reject/quarantine rule:** Restore-test not PASS → `BLOCKED`; **MIGRATION MUST NOT START**.
- **Validation:** `pg_restore --list` plus actual disposable restore and checks for tables/counts/relationships.
- **Rollback impact:** Pre-cutover recreate target from verified source; post-cutover use final source backup and post-migration target snapshot according to write-window decision.
- **Implementation impact:** Backup checkpoints/retention/access plan required; this document does not execute `pg_dump` or restore.

## Decision summary matrix

“Blocks dry run?” distinguishes starting any dry-run environment from loading a specific domain. The mandatory database-wide dry run requires all listed core P0s resolved. Approved rules may still have record-level review deferred to inventory.

| ID | Topic | Status | Blocks dry run? | Blocks cutover? |
|---|---|---|---|---|
| DEC-001 | Owner mapping | APPROVED WITH MANUAL REVIEW | No for schema/empty harness; Yes for operational Property load until Owner mappings resolved | Yes if any operational Property Owner unresolved |
| DEC-002 | Legacy platform ADMIN | APPROVED WITH MANUAL REVIEW | No | Yes if target account scope is unresolved; otherwise archive-only |
| DEC-003 | Resident / CCCD ownership | APPROVED WITH MANUAL REVIEW | No for harness; Yes for Resident/Contract domain load until Owner evidence mapped | Yes if operational Resident tenant scope unresolved |
| DEC-004 | Duplicate CCCD | APPROVED WITH MANUAL REVIEW | No | Yes for unresolved same-owner duplicates in operational scope |
| DEC-005 | Room default capacity | REQUIRES PRODUCT DECISION | Yes for Room/Contract dry run with affected records | Yes for Rooms/Contracts missing approved capacity |
| DEC-006 | Room area missing | APPROVED WITH MANUAL REVIEW | No; quarantine incomplete Room rows | Yes if in-scope operational Room lacks valid area |
| DEC-007 | Occupancy dates | APPROVED WITH MANUAL REVIEW | No; partial/unknown can remain quarantined | Yes if unresolved occupancy is required for chosen cutover scope/CT01 |
| DEC-008 | `occupantCount` semantics | REQUIRES PRODUCT DECISION | Yes for Contract load | Yes for affected Contracts/capacity-dependent operation |
| DEC-009 | ContractExtension | APPROVED WITH MANUAL REVIEW | No | No if unresolved extensions are archive-only and base contracts reconcile |
| DEC-010 | CANCELLED contracts | APPROVED WITH MANUAL REVIEW | No | No if archive-only disposition is accepted |
| DEC-011 | Invoice recurrence | REQUIRES PRODUCT DECISION | Yes for invoice dry run | Yes for operational invoice cutover |
| DEC-012 | Invoice due-date formula | REQUIRES PRODUCT DECISION | Yes for invoice dry run | Yes for operational invoice cutover |
| DEC-013 | Legacy month mapping | APPROVED WITH MANUAL REVIEW | No until invoice domain begins; then DEC-011/012 gate applies | Yes for unresolved invoice collision/period |
| DEC-014 | VOID invoice | APPROVED WITH MANUAL REVIEW | No | No if archive-only and financial reconciliation accepted |
| DEC-015 | Historical manual Payment | APPROVED WITH MANUAL REVIEW | No; archive-only route | Yes if business requires it in V1.1 operational ledger without approved representation |
| DEC-016 | Paid invoice evidence | APPROVED WITH MANUAL REVIEW | No for harness | Yes for unresolved financial status/sum in migrated invoices |
| DEC-017 | InvoiceLine OTHER/detail | APPROVED WITH MANUAL REVIEW | No | Yes if unresolved detail prevents accepted invoice total reconciliation |
| DEC-018 | Document uploader | REQUIRES PRODUCT DECISION | No if all unknown-uploader files stay outside target; Yes if importing them | Yes only if required operational documents cannot be represented/dispositioned |
| DEC-019 | Signed metadata | APPROVED WITH MANUAL REVIEW | No | No if unverified docs are archived and signed target rows verified |
| DEC-020 | Parking slot strings | APPROVED WITH MANUAL REVIEW | No; archive unverifiable strings | No if all active target assignments validate; yes for capacity/slot violations |
| DEC-021 | AmenityBooking | APPROVED | No | No; hourly bookings archive-only |
| DEC-022 | MaintenanceRequest → Complaint | APPROVED WITH MANUAL REVIEW | No | Yes only for unresolved P0 tenant-scope/complaint data included in cutover |
| DEC-023 | RoomViewingRequest | APPROVED WITH MANUAL REVIEW | No | No if appointment fields archive and contacts route safely |
| DEC-024 | Password/account migration | APPROVED WITH MANUAL REVIEW | No for dry-run data mapping | Yes if production credentials/identity scope is unsafe; reset path required |
| DEC-025 | Notification history | APPROVED | No | No; history starts at V1.1 |
| BACKUP-001 | Backup approval | APPROVED | **Yes until restore-test PASS** | Yes; final pre-cutover backup is mandatory |

## Dry-run authorization gate

Dry run ở đây là load dữ liệu trên bản copy đã restore vào target disposable; không phải chỉ chạy parser hoặc tạo database rỗng. Được bắt đầu khi tất cả điều kiện sau đồng thời đúng:

- DEC-001/003/004 mapping rules đã được duyệt như trong tài liệu này. **Không yêu cầu biết trước classification của mọi record**; phân loại từng record chính là đầu ra của dry-run inventory. Tuy nhiên unresolved record không được nạp vào operational rows.
- DEC-005 Room capacity policy và DEC-008 `occupantCount` semantics đã được Product chốt trước khi nạp Room/Contract liên quan.
- DEC-011 recurrence algorithm và DEC-012 due-date formula đã được Product chốt trước invoice dry run.
- DEC-015 historical manual-payment archive disposition được giữ nguyên; không tạo provider transaction giả. Invoice paid evidence được đối chiếu theo DEC-016.
- DEC-018 unknown-uploader document disposition được Product chốt nếu dry run dự kiến nạp các legacy documents; nếu archive-only được xác nhận, có thể bỏ document rows đó khỏi target run.
- BACKUP-001 custom dump đã restore-test PASS, với count/relationship verification.

P2 domains không cần được hoàn tất để dry-run foundation/core; chúng có thể được quarantine/archive theo decision rules. Dù vậy, các P0 tenant/financial errors hoặc unresolved values không được nạp, và bất kỳ P0 constraint fail nào dừng run. Hiện DEC-005/008/011/012 vẫn `REQUIRES PRODUCT DECISION` và restore-test chưa được thực hiện, nên gate chưa đạt.

## P0 blockers summary

### P0 RESOLVED (rule-level)

- Owner evidence hierarchy and quarantine policy (DEC-001); platform ADMIN is not auto-promoted (DEC-002).
- Resident owner scoping, cross-owner duplicate behavior, same-owner duplicate manual review/no-auto-merge (DEC-003/004).
- No fake occupancy history, no false paid state, manual payments archived instead of provider attempts (DEC-007/015/016).
- Backup set and restore verification required (BACKUP-001).

### P0 UNRESOLVED

- `default_capacity` source/approval policy (DEC-005) and whether `occupantCount` means allowed maximum (DEC-008).
- Invoice recurrence edge rule (DEC-011) and due-date formula (DEC-012).
- Runtime per-record Owner/Resident/CCCD classification and financial reconciliations have not been run; this is intentionally deferred to inventory/dry-run, not inferred from seed.
- Historical unknown-uploader contract document disposition requires product confirmation if those files are expected in V1.1 (DEC-018).
- Actual backup restore-test has not been performed; it is a required precondition, not a claim about current backup state.

V1.1 schema remains LOCKED. No unresolved P0 is silently converted into a default. Given DEC-005/008/011/012 and unverified backup restore, **`DRY RUN NOT AUTHORIZED`** for operational Room/Contract/Invoice data at this time. A schema-only empty harness or independent non-P0 mapping preparation is not a data dry run authorization.

## Recommended next step

**Resolve the listed P0 decisions first.** Product must approve Room/Contract capacity semantics and invoice recurrence/due-date rules; DBA must separately establish and verify the mandatory backup restore path before the dry-run authorization is reconsidered.

## Final rule

```text
Decision document only.
No database migration, SQL, Prisma command, backup command, backend/frontend change, or Database V1.1 schema change was performed.
```
