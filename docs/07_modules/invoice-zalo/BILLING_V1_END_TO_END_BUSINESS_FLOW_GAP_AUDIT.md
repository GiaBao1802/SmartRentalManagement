# Góc Trọ — Billing V1 End-to-End Business Flow Gap Audit

- **Ngày:** 2026-10-14
- **Trạng thái:** AUDIT COMPLETE — Billing chưa hoàn tất end-to-end
- **Phạm vi:** Đối chiếu Requirement/API/database V1.8, backend/frontend hiện tại và các Billing reports. Chỉ đọc source; không sửa code, database, Prisma, migration hoặc seed; không kết nối/ghi Goctro_test3; không chạy Payment, Zalo delivery, hoặc Resident portal.
- **Kết luận chính:** Tính kỳ, tạo draft qua lệnh Admin, chỉnh meter, kiểm tra/tính tiền authoritative, finalize nguyên tử, snapshot, due date và overdue có implementation. Scheduler đảm bảo draft ngày kế tiếp, reminder `period_end`, và Billing workspace hướng theo kỳ chưa có. Đây là lỗ hổng luồng nghiệp vụ P0.

## 1. Nguồn đã đối chiếu

- `../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` §10–12, §21.4 và Validation checklist — nguồn business authority.
- `../GocTro-SmartBuilding/docs/04_API_SPEC.md` §5.8, phần Invoice lifecycle/generation, ví dụ Billing và endpoint matrix — contract cùng ghi chú implementation.
- `../GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md` và `../GocTro-SmartBuilding/Database V1.8/{README.md,schema.sql,erd.md,seed.sql,runtime_validator.sql}` — baseline vật lý V1.8.
- `database/schema.prisma`, `backend/src/invoices/**`, `backend/src/zalo/**`, `backend/src/app.ts`, `backend/src/server.ts`, frontend Admin Invoice list/detail và API client.
- Quy tắc project: `AGENTS.md`, `docs/DOCUMENTATION_RULES.md`, `docs/00_CURRENT_STATE.md`, `docs/DOCUMENT_CATALOG.md`.
- Billing reports được rà soát gồm các báo cáo hardening/migration, V1.7 design/gap/resolver/calculator, V1.8 migration/finalize, data-readiness, Admin list/detail/workflow/browser/connectivity closure. Báo cáo cũ được dùng làm lịch sử; trạng thái implementation lấy từ source và bằng chứng mới hơn.

## 2. Canonical Requirement flow

`Contract.start_date` làm anchor → tính kỳ theo anniversary tháng, clamp cuối tháng và không drift → đến `period_end` nhắc Admin chốt điện/nước/dịch vụ → ngày lịch tiếp theo bảo đảm đúng một draft cho Contract/kỳ → Admin bổ sung dữ liệu draft cho phép → backend xác minh completeness và tính tiền authoritative → finalize `draft → unpaid` nguyên tử → `due_date` là ngày lịch Việt Nam của `finalized_at` + 5 ngày → sau commit mới enqueue/gửi Zalo → Payment chỉ mở cho Invoice finalized/unpaid → thành công đủ tiền mới thành `paid`; overdue suy ra từ `unpaid` và ngày hiện tại lớn hơn due date.

Reminder không finalize Invoice, không gửi Zalo và không mở Payment. Draft có thể mang số tiền tạm, kể cả 0; số 0 không chứng minh completeness.

## 3. Luồng hiện được triển khai

`POST /api/v1/contracts/:contract_id/invoices/generate` (Admin) → `PrismaInvoiceRepository.ensureNextDraft` → khóa Contract trong serializable transaction → chọn kỳ đã kết thúc theo anchor/end hiệu lực → đọc Invoice có cùng khóa kỳ hoặc tạo draft → unique kỳ trong DB chặn bản ghi trùng. Đây là command đồng bộ khi có request, không phải job chạy theo lịch.

Draft được dựng với rent lấy từ Contract, các amount utility/service ban đầu là 0, readings đầu được resolve theo continuity cùng Contract nếu có, readings cuối còn thiếu. Admin có thể sửa chỉ số cuối điện/nước qua PATCH. Finalize gọi resolver/calculator trong transaction; khi đầy đủ thì lưu readings/snapshots/items/tier, tiêu thụ charge đủ điều kiện, reconcile các tổng, đặt `ITEMIZED`, `unpaid`, `finalized_at`, `due_date`; sau khi commit route mới thử Zalo. API list/detail trả `amount_provisional` và `is_overdue` suy ra.

## 4. Invoice bình thường hiện được tạo từ đâu?

**Chưa có đường tự động cho Contract bình thường.** Không có scheduler/job đăng ký trong `backend/src/server.ts` hay app startup. API Spec cũng ghi rõ production scheduler/job runner chưa được triển khai. Draft có thể đến từ:

1. Admin gọi `POST /api/v1/contracts/{contract_id}/invoices/generate`; endpoint server tự chọn kỳ đã kết thúc và idempotently trả Invoice cùng kỳ hoặc tạo draft.
2. Admin gọi `POST /api/v1/invoices` để tạo reviewed draft với Contract và kỳ cụ thể hợp lệ.
3. Seed, dữ liệu rehearsal/test hoặc dữ liệu đã tồn tại — đây không phải bằng chứng scheduler đang chạy.

Không có nút tạo/generate draft hoặc màn danh sách kỳ cần xử lý trên UI Admin hiện tại; frontend có list/detail, filter, meter draft và finalize. Do vậy Contract mới không tự nhận draft ngày hôm sau; cần thao tác API ngoài giao diện hoặc dữ liệu có sẵn.

## 5. Đánh giá quy tắc tính kỳ

| Quy tắc | Trạng thái | Bằng chứng/ghi chú |
|---|---|---|
| Anchor từ `contracts.start_date` | IMPLEMENTED | `invoice.billing.ts`; create/generate validate theo anchor. |
| Giữ anchor gốc qua các tháng | IMPLEMENTED | Mỗi anniversary tính độc lập từ ngày gốc. |
| Clamp 29/30/31 vào cuối tháng | IMPLEMENTED | `billingAnniversary`. |
| Không drift sau tháng bị clamp | IMPLEMENTED | Tháng tiếp theo lại dùng ngày anchor ban đầu. |
| `period_end` trước anniversary kế tiếp | IMPLEMENTED | Ngày trước mốc kỳ sau. |
| Contract bình thường dùng `end_date` | IMPLEMENTED | `resolveEffectiveContractEndDate`. |
| Contract terminated dùng `termination_date` nếu có | IMPLEMENTED | Cùng resolver; nếu không có thì dùng `end_date`. |
| Kỳ cuối bị chặn ở effective end; rent không prorate | IMPLEMENTED | Billing period clip và Rent item full-period trong calculator. |
| Không tạo kỳ bắt đầu sau effective end | IMPLEMENTED | Period resolver trả null sau biên; generate chỉ xét period đủ điều kiện. |

## 6. Reminder tại `period_end`

**MISSING.** Requirement yêu cầu nhắc Admin nhập/chốt điện, nước và service data. Không có scheduled job, producer reminder, nhắc kỳ ở Admin UI hay idempotency key/guard cho hiệu ứng reminder. Có bảng/API notification tổng quát không chứng minh đã có business reminder producer. Theo Requirement, reminder chỉ thông báo closeout; không tạo final invoice, không gửi Zalo, không mở Payment.

## 7. Draft tự động ngày kế tiếp

**MISSING — P0.** Không có cron/worker/scheduler gọi generation command. Endpoint `ensureNextDraft` và unique `(contract_id, period_start, period_end)` cùng transaction retry là nền tảng tốt cho idempotent command, nhưng không tự tạo tác vụ. Chưa có đảm bảo chạy vào ngày tiếp theo hoặc retry bền vững sau downtime.

Lưu ý vận hành: command hiện chọn kỳ đã kết thúc mới nhất. Nếu hệ thống bỏ lỡ nhiều kỳ, một lần gọi chỉ xử lý kỳ đủ điều kiện mới nhất; chưa có catch-up queue đảm bảo lần lượt tạo draft cho mọi kỳ còn thiếu. Cần giữ invariant đúng một draft cho từng Contract/kỳ và bổ sung kiểm soát catch-up trước khi tuyên bố guarantee.

## 8. Quyết định tạo thủ công

Requirement chốt scheduler là luồng chính; không yêu cầu nút Admin tự tạo Invoice hay bulk generation. API cho phép Admin tạo reviewed draft bằng `POST /invoices` và gọi generate theo Contract. Đây là khả năng của API, không phải bằng chứng cần thêm nút CRUD.

**Khuyến nghị UX (không phải requirement mới):** scheduler là đường chuẩn; nếu sản phẩm cần recovery, cung cấp thao tác “Tạo draft còn thiếu” gọi command idempotent theo Contract/kỳ. Không đưa form tùy chọn kỳ/tổng/status hoặc bulk create nếu chưa có quyết định sản phẩm riêng.

## 9. Admin Billing period workspace

`/admin/invoices` là danh sách **Invoice đã tồn tại**, với lọc Owner-scoped theo khu, phòng, cư dân, kỳ, trạng thái, phân trang và tổng số kết quả. Detail cho xem kỳ/trạng thái/tiền; draft cho nhập closing meter, lưu, finalize; Invoice đã chốt hiển thị item/tier snapshot chỉ đọc.

Màn hiện tại không trả lời được toàn bộ câu hỏi vận hành trước khi draft tồn tại: kỳ sắp/đã kết thúc, Contract nào cần draft, draft nào thiếu meter/service/pricing, phòng nào chưa chốt chỉ số, draft nào sẵn sàng finalize, reminder đã gửi chưa. Do đó Invoice list **không đủ thay Billing workspace**.

**Khuyến nghị workspace:** tổng quan theo kỳ; hàng đợi kỳ cần closeout/draft thiếu; bộ đếm sẵn sàng/chưa đủ dữ liệu; tác vụ nhập meter/service; queue draft cần xử lý; sau đó danh sách/lịch sử Invoice. Invoice list hiện hữu vẫn là history/lookup.

## 10. Thu thập dữ liệu và completeness

| Dữ liệu bắt buộc/nguồn | Cần khi finalize? | Hiện trạng backend | Hiển thị cho Admin |
|---|---|---|---|
| Contract, kỳ hợp lệ, rent từ Contract | Có | Contract Owner/status/end và anchor được kiểm tra; rent tạo item từ Contract, full kỳ. | Contract/room/rent có thể tra từ detail; rent không cho tự sửa trên draft Invoice. |
| Điện opening | Có | Initial của chính Contract ở kỳ đầu hoặc Invoice finalized gần nhất cùng Contract; nguồn lưu snapshot. | Hiện read-only ở draft detail. |
| Điện ending | Có | Admin nhập; kiểm tra có mặt, precision và không thấp hơn opening; lưu meter row/snapshot atomically. | Có ô nhập/lưu draft. |
| Tariff điện | Có | Resolver tìm version Property có hiệu lực tại period_start, tier lũy tiến; thiếu/invalid thì fail closed. | Không có trạng thái tariff/readiness chi tiết; hiện chỉ có lỗi chung khi finalize. |
| Nước opening | Có | Cùng nguyên tắc continuity theo Contract. | Read-only. |
| Nước ending | Có | Admin nhập; validate và snapshot khi finalize. | Có ô nhập/lưu draft. |
| Tariff nước | Có | Resolver lấy version Property tại period_start; thiếu/invalid thì fail closed. | Không có trạng thái chi tiết trước finalize. |
| Fixed Service | Khi có service áp dụng; cần resolver xác nhận cấu hình/giá hợp lệ | Price resolver theo Property/Room và version tại period_start; snapshot item khi finalize. | Không có màn quản trị/nhập liệu hoặc per-service readiness trong Billing draft. |
| Flexible Service charges | Khi có charge billable trong kỳ; cần nguồn charge được resolve | Resolver lọc charge hợp lệ theo Contract/Room/kỳ, giải giá ở occurred_at, đối chiếu snapshot; charge được consume atomically. | Không có form nhập charge trong Billing detail; nguồn tạo service event thuộc nghiệp vụ khác/chưa tích hợp đầy đủ. |
| Parking entitlement/pricing | Khi có assignment đủ điều kiện; paid cần giá, free không tạo item; unclassified không tự suy billable | Resolver kiểm tra active-at-period-start, ownership/occupancy, entitlement và giá Property; paid price thiếu thì fail closed. | Không có bảng readiness Parking trong draft detail. |

Backend chỉ finalize khi có đủ hai opening/ending readings, giá/resolver đều resolved, actor hợp lệ và plan items/tổng reconcile. `amount=0` không phải điều kiện đủ: complete/incomplete xuất phát từ nguồn, trạng thái resolver, readings và cấu hình, không từ số tiền. Hiện API trả lỗi tổng quát `INVOICE_DATA_INCOMPLETE`; không có API completeness preview/missing-reason list cho UI.

## 11. Provisional preview

Draft API trả `amount_provisional=true`; UI ghi rõ tổng tạm tính chưa phải số phải trả. Khi tạo draft hiện `rent_amount` lấy từ Contract, utility/service buckets khởi đầu bằng 0, `total_amount` ban đầu bằng rent. Đây không phải preview authoritative của điện/nước/dịch vụ. Backend calculator authoritative chỉ chạy ở finalize. Không dùng frontend để tính số tiền quyết định hoặc đánh dấu ready.

## 12. Finalize hiện có gì?

Đã có và có bằng chứng route-level PostgreSQL 18 V1.8 cùng authenticated browser rehearsal: Admin-only, draft/NOT_FINALIZED guard, check Contract period/status, meter opening/ending completeness và order, resolver giá/charge/parking, decimal-safe itemized calculation, transaction serializable + row lock, retry conflict, meter readings + bốn snapshots, Invoice Items/tier rows, flexible charge consumption, aggregate/total reconciliation, snapshot kind, `draft → unpaid`, `finalized_at`, due date Asia/Ho_Chi_Minh + 5 ngày, no duplicate writes khi retry/concurrency, rollback đầy đủ khi SQL lỗi. UI lưu rồi reload draft, finalize rồi reload detail/itemized rows ở rehearsal.

`due_date` không tính từ ngày 1/tháng lịch; lấy local calendar date của thời điểm finalize cộng năm ngày. `is_overdue` được suy ra tại read-time khi unpaid và business date lớn hơn due date. Không có overdue persisted state.

Phần completeness readiness hiện chỉ phản hồi fail tại finalize; chưa có thao tác preflight cho biết chính xác từng nguồn thiếu trước lúc bấm chốt.

## 13. Zalo handoff

Route finalize đợi DB transaction commit rồi mới gọi `InvoiceZaloService.send`; service ghi queued send-log trước ranh giới provider. Điều kiện gửi finalized unpaid và log theo revision đã có. Đây là **best-effort post-commit call**, không phải transactional outbox/job durable: process có thể dừng giữa commit và enqueue; chưa có replay/retry worker bảo đảm gửi lại. App mặc định dùng no-recipient policy và provider unavailable nếu chưa cấu hình; do đó delivery thực tế chưa sẵn sàng. Zalo provider/recipient/queue/ops là dependency còn mở. Không triển khai trong task này.

## 14. Payment handoff

Requirement/API quy định chỉ finalized unpaid mới mở payment session; draft/paid/unfinalized bị từ chối, callback idempotent và phải trả đủ. Database giữ payment ledger. Trong backend hiện tại không thấy Payment router/endpoint V1 được mount cho session/attempt/callback, và frontend không có resident payment workflow đã đóng. Đây là downstream deferred domain; Billing cần phát ra Invoice authoritative unpaid/finalized trước. Payment **chưa sẵn sàng và không được tính là Billing đã hoàn thành**.

## 15. Resident Invoice visibility

Backend `GET /invoices`, detail và Zalo history có nhánh Resident scope theo chính Resident/Contract và API Spec mô tả payment summary an toàn. Đây mới là API surface. Frontend Resident-authenticated Invoice portal/end-to-end closure chưa được chứng minh; current-state ghi Resident portal còn partial/deferred. Đánh giá: **PARTIAL**.

## 16. Gap matrix

| # | Bước | Requirement | Backend/API | Frontend | Scheduler/operations | Trạng thái và gap |
|---:|---|---|---|---|---|---|
| 1 | Tính kỳ | Anchor, clamp/no-drift, end hiệu lực | Billing resolver/validation | Kỳ hiển thị | N/A | IMPLEMENTED |
| 2 | Reminder `period_end` | Nhắc closeout, không finalize/gửi/mở pay | Không có producer | Không có indication theo kỳ | Không có job/idempotency | MISSING — P0 |
| 3 | Draft ngày kế tiếp | Bảo đảm đúng một draft mỗi Contract/kỳ | Generate command đồng bộ | Không gọi tự động | Không có scheduler/retry worker | MISSING — P0 |
| 4 | Chống trùng | Một Invoice mỗi Contract/kỳ | Unique key, transaction, retry | Không liên quan | Command retry-safe; job absent | IMPLEMENTED cho command, guarantee tự động chờ scheduler |
| 5 | Sửa draft | Chỉ trường cho phép | PATCH meter current readings | Lưu/reload; hạn chế trường đúng contract | Không có closeout queue | PARTIAL — thiếu service/config inputs và workflow |
| 6 | Thu thập meter | Opening/ending mỗi utility, continuity | Resolver + validation + snapshot | Closing readings editable; opening read-only | Không có reminder | PARTIAL — chưa có batch/period workflow |
| 7 | Thu thập Service/Parking | Data nghiệp vụ theo nguồn được duyệt | Resolver đọc sources lúc finalize | Không có form readiness nhập liệu trong Invoice | Service source workflow chưa đầy đủ | PARTIAL/MISSING theo nguồn; không có Billing collection UX |
| 8 | Completeness | Zero không có nghĩa đủ; backend xác minh | Fail-closed ở calculator/finalize | Chỉ thấy thông báo chung | Không có preflight/queue | PARTIAL |
| 9 | Provisional | Draft rõ tạm tính | `amountProvisional` theo draft; rent + 0 ban đầu | Có nhãn provisional | Không có ước tính authoritative | IMPLEMENTED cơ bản |
| 10 | Finalize | Recalculate + atomic draft→unpaid | Đã route-level PG V1.8 verify | Browser flow pass rehearsal | Chạy do Admin | IMPLEMENTED |
| 11 | Itemized snapshot | Immutable items/tiers và tổng reconcile | Persist/read authoritative rows | Hiển thị sáu nhóm/tier, finalized read-only | N/A | IMPLEMENTED |
| 12 | Due date | Finalize local date + 5 | Server calculates, DB persists | List/detail displays | N/A | IMPLEMENTED |
| 13 | Zalo | Chỉ sau commit; eligible unpaid; revision logs | Best-effort enqueue/log boundary | Chưa có delivery ops closure | No durable outbox/replay; provider/recipient unconfigured | PARTIAL |
| 14 | Payment eligibility | Chỉ finalized unpaid | Rule có trong API/Requirement, Payment API chưa triển khai/mount | Không có Payment workflow | Payment deferred | MISSING / DEFERRED |
| 15 | Overdue | Unpaid và current local date > due | Derived `isOverdue` | Badge lọc/trạng thái ở Admin list | N/A | IMPLEMENTED |
| 16 | Resident visibility | Cư dân xem invoice của mình | API scoped list/detail/log | Portal E2E chưa hoàn tất | Onboarding/session closure còn thiếu | PARTIAL |

## 17. Invoice list hay Billing workspace?

**Không đủ.** List chỉ quản lý records đã tạo. Requirement flow cần có thao tác và trạng thái theo kỳ trước khi Invoice tồn tại, cũng như biết nguồn nào còn thiếu. Workspace theo kỳ là mục tiêu phù hợp; phân biệt rõ đây là UX recommendation, không bổ sung business requirement.

## 18. Canonical flow và UX đề xuất

**Canonical:** scheduler period-end reminder → scheduler ngày kế tiếp đảm bảo draft → Admin hoàn thiện nguồn dữ liệu hợp lệ → backend readiness/calculation → Admin review/finalize → immutable itemized unpaid Invoice → Zalo sau commit → Payment sau finalize.

**UX recommendation:** trang Billing overview theo kỳ/Property với queue “cần chốt dữ liệu”, “draft thiếu dữ liệu”, “sẵn sàng finalize”, “đã finalize/chưa trả”, “quá hạn”; mở từng draft vào editor, giữ Invoice list làm tra cứu/lịch sử. Chỉ thêm recovery action generate-missing nếu product chấp thuận; không tự thêm bulk requirement.

## 19. Bulk operations

Requirement/API đã đọc không đặt bulk create/meter edit/finalize/send làm yêu cầu V1. Không đề xuất chúng như canonical behavior. Có thể cân nhắc bulk meter collection như cải tiến UX riêng, sau khi thiết kế phân quyền, validation từng phòng, partial failures và audit.

## 20. P0/P1/P2 và thứ tự triển khai

| Ưu tiên | Gap | Thứ tự |
|---|---|---|
| P0 | Không có period-end reminder và không có next-day auto-draft guarantee. Command/unique key chỉ là primitives, chưa có worker. | 1. Triển khai job/worker cho reminder và draft generation; idempotency, retry, outage catch-up theo từng kỳ, trạng thái quan sát được; xác thực không tạo trùng và không tạo kỳ sau effective contract end. |
| P1 | Admin không có Billing workspace theo kỳ và readiness/missing-data queue; chưa thấy generation action trên UI. | 2. Xây API/read model + workspace trình bày các kỳ/Contract và thiếu sót; không thêm bulk. |
| P1 | Service/Flexible/Parking sources chưa có collection/readiness workflow thống nhất cho Admin; Invoice draft editor hiện chỉ meter. | 3. Chốt nguồn nhập cho từng domain, nối input APIs và trạng thái completeness có lý do; zero chỉ là giá trị, không phải ready. |
| P1 | Zalo chỉ best-effort sau commit; no recipient/provider and no durable outbox/replay. | 4. Làm Zalo operations/outbox/retry/recipient riêng sau khi Billing finalized snapshots tin cậy. |
| P2 | Resident invoice/payment UX/API integration chưa E2E; Payment backend chưa được migrate. | 5. Payment và Resident portal thành các task/phase riêng sau P0/P1 prerequisites; không gộp vào scheduler. |
| P2 | Draft preview chỉ có rent + zero buckets, chưa breakdown provisional. | 6. UX có thể cho biết known/provisional/pending/missing mà không tính tiền authoritative trên client. |

## 21. Mức hoàn tất

Trong 16 bước ở gap matrix: **7 IMPLEMENTED**, **6 PARTIAL**, **3 MISSING/DEFERRED**. Tỷ lệ đếm bước đã implementation tương đối đủ là 7/16 (xấp xỉ 44%); đây là cách đếm checklist để định vị gap, không phải KPI chất lượng hay mức hoàn thành sản phẩm. Luồng Billing chưa end-to-end vì hai bước đầu vào vận hành tự động — reminder và bảo đảm tạo draft — đều thiếu; downstream Payment/Resident/Zalo còn scope riêng.

## 22. Exact next task

**BILLING V1 PERIOD-END REMINDER + NEXT-DAY DRAFT SCHEDULER IMPLEMENTATION PASS** — backend/operations; dùng command `ensureNextDraft` hiện có, bổ sung scheduler retry-safe cho hai thời điểm, idempotency của reminder, catch-up các kỳ bị lỡ, eligibility theo Contract/effective end và quan sát lỗi. Giữ Database V1.8 LOCK; chỉ đề xuất DB version change nếu design chứng minh cần durable job/outbox state và đi đúng governance. Sau đó thực hiện Billing-period workspace/readiness pass. Không bắt đầu Payment trong task scheduler.

## 23. Giới hạn kiểm tra

Đây là static source/document audit dùng implementation và runtime/browser evidence đã lưu trong các report. Task này không gọi localhost, không truy vấn Goctro_test3, không chạy migration/seed/tests/build và không xác minh cấu hình provider ngoài source. Zalo production delivery và Resident portal được giữ đúng trạng thái chưa đóng; không suy ra PASS từ seed/rehearsal.

