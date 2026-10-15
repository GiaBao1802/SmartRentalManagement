# BÁO CÁO TIẾN ĐỘ DỰ ÁN GÓC TRỌ

**Ngày audit:** 09/10/2026  
**Phạm vi:** Source SmartRentalManagement, tài liệu canonical, Database V1.3, Prisma, package scripts và local development setup.  
**Chỉ audit và report:** Không sửa code/cấu hình/database/Prisma/migration/Requirement/API Spec. Không chạy seed/migration, không commit/push.

## 1. Tổng quan dự án

Dự án đang trong giai đoạn **migrate các domain từ legacy sang API V1.3 và nối Frontend từng phần**. API V1 thật đã có cho Auth, Property/Room, Resident/Occupancy, Contract và Invoice/Zalo. Frontend V1 đã tích hợp Auth, Property/Room và Resident/Occupancy; Contract, Invoice và phần lớn màn tài khoản/tiện ích/khiếu nại/public vẫn phụ thuộc endpoint legacy.

Không có module nào hoàn thiện end-to-end và production-ready. Property/Room và Resident/Occupancy có mức triển khai cao nhất; Contract có backend khá đầy đủ nhưng FE chưa nối; Invoice/Zalo đã được harden và ghi LOCKED/DOCUMENTED nhưng chưa cấu hình vận hành. Payment, Vehicle/Parking, Complaint, CT01 chưa có V1 backend runtime.

## 2. Giai đoạn hiện tại

| Milestone | Trạng thái |
|---|---|
| Database baseline | ✅ Database V1.3 LOCK cho fresh install; schema/seed PASS, runtime validator 64/64 PASS trên PostgreSQL 18 theo changelog. |
| Backend V1 domains | 🟡 Có Auth, Property/Room, Resident/Occupancy, Contract, Invoice/Zalo. |
| Frontend integration | 🟡 Auth, Property/Room, Resident/Occupancy đã nối API V1; các module khác còn legacy hoặc chưa có. |
| Business coverage | 🟡 Core flows đã có nhưng Resident status sync và các domain liên quan còn thiếu. |
| SaaS UI | 🟡 Có UI mới cho homepage và Property/Room; chưa có redesign được xác minh cho toàn bộ module. |
| Production readiness | ⚠️ Chưa đạt: thiếu hạ tầng durable, cấu hình pricing/provider, Payment và runtime smoke. |

## 3. Database / Prisma

- Database V1.3 là current locked development baseline cho fresh install, PostgreSQL 18, **26 public tables**. SQL schema, seed và runtime validator được ghi PASS; validator 64/64.
- database/schema.prisma có **26 model** map các bảng V1.3. schema.v1_1.prisma, schema.v1_2.prisma và schema.legacy.prisma là snapshot/reference.
- Database có Owner-scoped CCCD và composite tenant FKs; Contract status/revision consistency; append-only Contract history triggers; document version/history protection; Invoice period/amount/lifecycle checks; partial unique cho successful payment; Pool/Gym cycle 720 giờ; partial unique cho active parking slot/vehicle assignment.
- Prisma biểu diễn các quan hệ/unique/index chính; CHECK, partial unique, trigger và một số invariant vẫn do PostgreSQL/backend enforce. DB READY không đồng nghĩa module READY.
- database/migrations trong ứng dụng chỉ có ba migration demo/legacy ngày 2026-10-07; không phải migration chain cho V1.3 và không được coi là có thể áp lên baseline hiện hành.
- Populated migration V1.2 → V1.3 còn PENDING runtime validation theo changelog. Fresh-install PASS không xác nhận nâng database đang có dữ liệu PASS.

## 4. Auth / Foundation

### Backend
- ✅ V1 login/logout, auth/me, CSRF bootstrap, cookie opaque HttpOnly gt_session.
- ✅ Role V1 admin/resident; Admin Owner scope và Resident self-scope suy từ account/session; account locked được kiểm tra lại.
- ✅ CSRF, role guards, client authority rejection, revoke/logout có regression tests.
- 🟡 Login rate limit là in-memory, không phân tán.
- ⚠️ Session store là in-memory; production chủ động fail startup cho tới khi có durable store. Restart backend làm mất DEV sessions.
- ⏳ Password reset/change, invitation/enrollment và delivery channel chưa có.
- 🟡 Idempotency-Key mới được validate ở một số route, chưa có durable replay/payload store.
- ⚠️ backend/src/app.ts còn nhiều legacy routes dùng role/session/schema cũ. Không tính là V1.

### Frontend
- ✅ Login dùng API client V1, CSRF, session cookie, AuthProvider gọi auth/me và logout.
- ✅ AdminShell/Tenant portal có role gate.
- 🟡 Nhiều trang sau gate vẫn gọi endpoint unversioned/schema legacy; Auth V1 không làm các API đó thành V1.

### Production gap
Cần durable session store, distributed rate limit, quản lý secret/observability và dọn legacy auth/routes trước khi production.

## 5. Property / Room

### Backend
- ✅ Owner-scoped Property CRUD/list/detail/filter/archive.
- ✅ Room CRUD/list/detail/filter, pagination, deactivate/reactivate, validation rent/area/capacity.
- ✅ Room response có current contract, occupancy count/capacity/status server-derived; archive/deactivate conflict được kiểm tra.
- ✅ Property/Room tests 33/33 PASS.
- 🟡 Public room/contact V1 chưa mount trong v1.router; route public hiện có là legacy.
- ⚠️ Contract overlap/capacity có logic ứng dụng; không có DB exclusion constraint cho overlap.

### Frontend
- ✅ /admin/properties dùng Property API V1; list, filters/search/province, pagination, create/edit/archive.
- ✅ Room page dùng Room API V1; list/filter/pagination, current contract/occupancy, create/edit/deactivate/reactivate và bulk create dạng chuỗi request từng phòng.
- 🟡 Khu vực archived chưa có nút bật hoạt động lại theo scope trước đây.
- 🟡 Source có giao diện hướng SaaS cho Property/Room; chưa có browser smoke hiện hành.
- Business Audit riêng, UX audit và browser smoke: ⏳ chưa có bằng chứng hiện hành trong report catalog.
- Backend contract gap còn lại: public listing/contact V1 chưa được tích hợp.

## 6. Resident / Occupancy

### Backend
- ✅ Resident list/filter/pagination, exact CCCD search theo Owner, create/detail/update/archive.
- ✅ Room resident list/add occupancy, end, transfer, history và /me/rental.
- ✅ Capacity theo Contract snapshot nếu áp dụng, nếu không theo Room default; Owner/Room/Contract scope được kiểm tra.
- ✅ Privacy test cho cùng CCCD khác Owner và tránh tiết lộ kết quả cross-Owner.
- ✅ Resident/Occupancy suite 37/37 PASS.
- ⚠️ Backend create/PATCH vẫn nhận residence_status; add/end/transfer không tự đồng bộ giá trị này.

### Business rule Residence Status
Theo quyết định nghiệp vụ được nêu trong yêu cầu audit: có active occupancy → living; không còn active occupancy → left; add đầu tiên → living; transfer vẫn living; end occupancy cuối → left; FE không cho sửa tay sau khi rule chạy.

**⏳ CHƯA IMPLEMENT — BUSINESS RULE ĐÃ CHỐT.** Repository hiện không đồng bộ rule; validation/PATCH cho phép sửa residence_status; FE list/detail vẫn có lựa chọn “Đang ở/Đã rời đi”. Requirement/API Spec hiện mô tả field/filter và enum nhưng chưa tìm thấy phương trình đồng bộ này. Đây là mismatch cần được cập nhật ở tài liệu canonical trước khi triển khai; task audit này không sửa tài liệu hoặc code.

### Frontend
- ✅ Resident list/filter/search, create/edit/archive, detail/history, add/end/transfer gọi API V1.
- ✅ Resident portal gọi /me/rental bằng identity từ session.
- 🟡 Portal mới có thông tin cư trú và Contract summary; thiếu Resident Contract detail, invoices/payment, tiện ích, xe/parking, complaint và profile self-service.
- ✅ Có Resident/Occupancy Business Audit; audit nêu Business Gap on FE, UX gap, Backend Contract Gap.
- 🟡 FE Business Gap Fix chưa hoàn tất; sau khi sync rule phải bỏ chỉnh residence_status thủ công.
- SaaS redesign: ❌ chưa có bằng chứng triển khai cho Resident module.
- Browser smoke: ⏳ Pass 2 ghi authenticated smoke pending; hiện local runtime không chạy.

## 7. Contract

### Backend
- ✅ Draft, activate, PATCH/revision/history, renew, terminate, If-Match, document metadata/list/read và /me/contracts.
- ✅ Privacy fix cho successor visibility có test.
- ✅ Contract suite 112/112 PASS.
- 🟡 Idempotency-Key chưa có durable replay.
- ⚠️ Object storage/multipart chưa cấu hình; upload fail-closed 503 STORAGE_UNAVAILABLE.
- API Spec §5.7 được ghi LOCKED/DOCUMENTED; project-wide backend build vẫn lỗi legacy.

### Frontend
- ❌ Admin /admin/contracts dùng generic DataManagement và legacy /api/contracts; endpoint cũ bị trả 410.
- 🟡 Resident portal chỉ hiện Contract summary, chưa tích hợp /me/contracts/Resident detail.
- ❌ Chưa có UI V1 cho Contract detail/history/renew/terminate/documents.
- Browser smoke: ⏳ chưa chạy.

## 8. Invoice / Zalo

### Backend
- ✅ List/detail, draft/generate, meter PATCH, finalize, billing cycle theo Contract anchor và termination boundary.
- ✅ Invoice/Zalo tests 36/36 PASS; tests có normal end_date, termination_date, no drift và rent không prorate.
- ✅ API hardening report đánh dấu LOCKED / DOCUMENTED.
- ⚠️ InvoicePricing hiện unconfigured nên finalize fail-closed với INVOICE_DATA_INCOMPLETE.
- ⚠️ Zalo provider, recipient policy/OA credentials/template/queue chưa cấu hình; không có real delivery.
- ⚠️ Không có scheduler/reminder/outbox, durable idempotency replay; amendment sau finalize chưa implement.

### Frontend
- ❌ /admin/invoices còn gọi legacy /api/invoices; route trả 410.
- ❌ Chưa có UI V1 cho draft/finalize/log gửi Zalo; Resident portal chưa có invoice/payment.
- Browser smoke: ⏳ chưa chạy.

## 9. Payment

Requirement/API Spec/DB có MoMo và ZaloPay, session/attempt, retries và one-success constraint. Backend Payment routes/provider callback/checkout **❌ CHƯA BẮT ĐẦU**; FE checkout/status/retry **❌ CHƯA BẮT ĐẦU**. Chưa có callback verification, reconciliation, durable idempotency hay provider adapter. V1 không có partial payment hoặc provider refund.

## 10. Vehicle / Parking

Requirement/API Spec/DB có Vehicle, Parking Area/Slot/Assignment, tenant scope và capacity rules. Backend V1 routes/repository **❌ CHƯA BẮT ĐẦU**; FE quản lý xe/slot/lịch sử **❌ CHƯA BẮT ĐẦU**. Contract flow có kiểm tra số active parking assignment khi đổi capacity, nhưng đây không phải Parking module runtime.

## 11. Complaint

Requirement/API Spec/DB V1.3 có Complaint/priority/history. Backend V1 complaint routes/history **❌ CHƯA BẮT ĐẦU**. Admin /admin/complaints còn gọi legacy /api/maintenance-requests, tức MaintenanceRequest model cũ, không phải Complaint V1. Resident complaint V1 **❌ CHƯA BẮT ĐẦU**.

## 12. CT01 / Residence Registration

Requirement/API Spec mô tả Property-wide pending list và export CT01. DB có residence_registration_status nhưng đây chỉ là dữ liệu nền. Backend pending/review/export và FE V1 **❌ CHƯA BẮT ĐẦU**. Mẫu CT01 chính thức vẫn cần xác nhận; mock/export legacy không phải workflow backend.

## 13. Public Marketplace

DB có is_public/public_description. Trang chủ FE dùng NEXT_PUBLIC_API_URL và unversioned /api/public/rooms, response camelCase/pagination legacy; contact gửi preferredDate/preferredTime tới /api/public/viewing-requests. V1 router chưa mount public room/contact API.

Đây là **LEGACY DEPENDENCY**, không phải V1 integration. API Spec V1 có public listing/contact nhưng không mặc định booking xem phòng; appointment fields hiện tại chưa phù hợp scope V1.

## 14. Local Development / Operations

- Có npm run dev:all và npm run dev:stop; launcher kiểm tra process dự án, DB target, health, CSRF và tránh start trùng/kill process ngoài dự án.
- Health endpoints có trong backend source. Startup report trước đây từng ghi local PASS.
- Kiểm tra thực tế lượt này: không listener tại 3000, 4000 hoặc PostgreSQL 5432; /api/health, /api/health/db và frontend root không phản hồi. Local runtime hiện chưa được xác nhận chạy.
- Không có bằng chứng về Redis/durable session, background scheduler/outbox, configured object storage, Payment provider hay Zalo OA provider.
- PostgreSQL V1.3 PASS là kết quả changelog/validator; không có DB connection trong audit này. Populated migration V1.2→V1.3 còn pending.

## 15. Frontend progress theo giai đoạn

| Module | FE↔BE | Audit nghiệp vụ | Bổ sung nghiệp vụ | UX cleanup | SaaS redesign | Smoke | Trạng thái |
|---|---|---|---|---|---|---|---|
| Auth | ✅ V1 login/me/session | 🟡 source review | 🟡 reset/invitation thiếu | 🟡 chưa audit toàn màn | 🟡 shared style | ⏳ runtime off | Nền tảng có, production session thiếu |
| Property/Room | ✅ Admin CRUD V1 | ⏳ chưa report riêng | ✅ core + bulk flow | 🟡 có chỉnh source | 🟡 source hướng SaaS | ⏳ chưa chạy | Core đã nối; public V1 thiếu |
| Resident/Occupancy | ✅ list/detail/occupancy/self rental | ✅ audit có | 🟡 business gap chưa đóng | 🟡 pending/error/history | ❌ chưa có bằng chứng | ⏳ authenticated smoke pending | Đã tích hợp, còn status rule và self-service |
| Contract | ❌ Admin legacy; Resident summary một phần | ⏳ | ❌ detail/docs/history UI | ⏳ | ❌ | ⏳ | Backend có, FE chưa migrate |
| Invoice/Zalo | ❌ endpoint legacy 410 | ⏳ | ❌ FE lifecycle/Zalo | ⏳ | ❌ | ⏳ | Backend có, chưa nối FE/config |
| Payment | ❌ | ⏳ | ❌ | ⏳ | ❌ | ⏳ | Chưa bắt đầu |
| Vehicle/Parking | ❌ | ⏳ | ❌ | ⏳ | ❌ | ⏳ | DB/Spec có, chưa runtime |
| Complaint | ❌ legacy maintenance only | ⏳ | ❌ | ⏳ | ❌ | ⏳ | Chưa V1 |
| CT01 | ❌ | 🟡 Resident audit đề cập | ❌ pending/review/export | ⏳ | ❌ | ⏳ | Chưa runtime |
| Public Marketplace | 🟡 gọi legacy | ⏳ | 🟡 UI appointment ngoài V1 | 🟡 | 🟡 landing mới | ⏳ | LEGACY DEPENDENCY |

Typecheck/build là kiểm tra toàn project, không phải module readiness. Frontend typecheck/build pass; Backend typecheck/build fail do legacy code. Regression modules có mock repository/HTTP test, không thay thế database integration hoặc browser smoke.

## 16. Backend gaps

### A. BACKEND BUSINESS RULE
- Residence status ↔ active Occupancy sync chưa implement.
- Capacity/Owner consistency có ở Property/Resident/Contract flows nhưng các domain parking/complaint/amenity chưa có route runtime.
- Contract overlap cần PostgreSQL concurrency validation trước production.

### B. BACKEND CONTRACT GAP
Chưa có API V1 runtime cho account/invitation admin, /me/profile, CT01 pending/export, Vehicle/Parking, Complaint/history, Amenities/subscriptions/cycles, notifications, dashboard summary, Public Marketplace/contact.

### C. FRONTEND INTEGRATION
Contract, Invoice/Zalo, Payment, Vehicle/Parking, Complaint, CT01, Amenities/subscriptions, account invitation và Public Marketplace V1.

### D. FRONTEND BUSINESS GAP
Resident Contract detail/profile/invoice/amenities/vehicle/complaint; Admin Contract summary/detail; bỏ sửa tay residence_status; CT01 pending/review/export; Invoice/Zalo flows.

### E. UX / SAAS REDESIGN
Audit UX toàn module; thay các màn legacy trước redesign cuối; bổ sung portal workflows sau khi API có; authenticated browser smoke cho Admin/Resident.

### F. INFRASTRUCTURE / PRODUCTION DEBT
Durable session + distributed rate limit; durable idempotency; object storage/multipart; authoritative invoice tariff; Zalo OA + recipient/outbox/worker; Payment providers/callback/reconciliation; schedulers; PostgreSQL concurrency tests; populated migration V1.2→V1.3 runtime check.

### G. TEST / SMOKE / VALIDATION
- ✅ FE typecheck, frontend API tests, backend domain regression tests.
- ⚠️ Backend project typecheck/build fail.
- ✅ V1.3 fresh-install runtime validation theo changelog.
- ⏳ Populated DB migration validation và browser smoke chưa PASS.
- ⏳ Runtime health/login/room list trong môi trường hiện tại chưa xác minh được.

## 17. Business rules chưa implement

1. **Residence status sync:** ⏳ CHƯA IMPLEMENT — BUSINESS RULE ĐÃ CHỐT theo decision trong yêu cầu audit; cần đồng bộ trong transaction add/transfer/end và bỏ field edit trên FE. Requirement/API Spec cần ghi rõ để thống nhất source of truth.
2. **Payment:** checkout chỉ với finalized unpaid invoice, full amount, callback/idempotency/retry theo session chưa có.
3. **Amenities:** cycle 30 ngày, price snapshot và cancel lifecycle chưa có runtime.
4. **Parking:** đăng ký/thu hồi slot, capacity enforcement khi cấp assignment chưa có module runtime.
5. **Invoice/Zalo:** code fail-closed đúng khi thiếu tariff/provider; production behavior chưa được cấu hình.

## 18. UX / SaaS status

Property/Room có source UI SaaS-oriented rõ nhất. Resident có thao tác/history/error states nhưng audit đã chỉ ra self-service/business gaps. Contract/Invoice/Accounts/Amenities/Complaints/Bookings/Viewings còn legacy components/endpoints. Chưa browser smoke nên chưa xác nhận layout/responsive/accessibility và end-to-end hiện hành.

## 19. Production blockers

- 173 Backend TypeScript diagnostics, đều trong backend/src/app.ts.
- Durable session/rate limit chưa có; production store intentionally fail-closed.
- Pricing, Zalo provider/recipient, object storage, Payment chưa cấu hình.
- FE legacy dependencies; một số endpoints đã retired trả 410.
- Public marketplace còn appointment-style legacy.
- Residence status sync chưa implement.
- V1.2 populated migration chưa runtime validate.
- Local servers và PostgreSQL không chạy lúc audit; không có browser smoke.

## 20. Việc đã hoàn thành

Database V1.3 fresh-install baseline và Prisma mapping; Auth V1; Property/Room V1 backend + FE; Resident/Occupancy V1 backend + FE; Contract V1.3 backend; Invoice/Zalo lifecycle/hardening; frontend API client và regression test coverage.

## 21. Việc đang làm / đã có một phần

Resident FE đã nối nhưng business gaps/status sync chưa đóng. Contract backend đã có nhưng FE còn legacy. Invoice/Zalo backend có nhưng FE/config/scheduler còn thiếu. Property/Room có bulk flow và SaaS-oriented UI nhưng chưa browser smoke. Legacy backend giữ lại dẫn tới 173 type errors.

## 22. Việc chưa bắt đầu

Payment; Vehicle/Parking V1 API/FE; Complaint/history V1; CT01 pending/review/export; Amenities/subscription; account invitations/admin V1; public contact/listing V1 migration; durable production adapters.

## 23. Việc bị blocker

Backend build/typecheck fail do legacy Prisma references trong app.ts. FE Contract/Invoice/account/complaint có luồng gọi endpoint legacy, một số trả 410 hoặc dùng cookie/schema cũ. Invoice finalize, Zalo send và contract upload fail-closed khi thiếu config. Browser smoke và DB health chưa thể xác nhận vì runtime services dừng. Populated V1.2→V1.3 migration là deployment gate.

## 24. Roadmap đề xuất

1. Đóng legacy backend debt trong app.ts theo domain; retire routes cũ và đưa backend build/typecheck xanh, không tạo Prisma alias giả.
2. Đồng bộ Residence Status: cập nhật Requirement/API Spec theo decision đã chốt; implement transaction sync cho add/transfer/end; thêm tests; bỏ field sửa tay ở FE.
3. Hoàn thiện Resident FE gaps: Admin Contract summary, Resident Contract detail/profile và self-service; authenticated browser smoke.
4. Migrate Contract FE khỏi /api/contracts legacy sang /api/v1/contracts; UI detail, create/activate/renew/terminate/history/documents; giải quyết storage và idempotency.
5. Migrate Invoice FE sang V1; cấu hình tariff, Zalo recipient/provider/outbox/scheduler; smoke lifecycle.
6. Xây V1 cho CT01, Vehicle/Parking, Complaint, Amenities và account invitation; kèm FE/test.
7. Sau Invoice/Zalo, bắt đầu Payment adapter/callback/retry/full-payment và FE.
8. UX/SaaS pass sau khi API/data flow ổn định; chạy Admin/Resident browser smoke, PostgreSQL concurrency tests và populated migration validation trước deploy.

### Bảng tổng hợp cuối

| Module | Database | Backend | FE Integration | Business Audit | Business Gap Fix | SaaS UI | Smoke | Tổng trạng thái |
|---|---|---|---|---|---|---|---|---|
| Auth | ✅ | 🟡 | ✅ | 🟡 | 🟡 | 🟡 | ⏳ | V1 có; durable sessions thiếu |
| Property/Room | ✅ | ✅ | ✅ | ⏳ | 🟡 | 🟡 | ⏳ | Core quản lý nối V1; public gap |
| Resident/Occupancy | ✅ | ✅ | ✅ | ✅ | 🟡 | ❌ | ⏳ | Status rule/self-service gaps |
| Contract | ✅ | ✅ | 🟡 summary | ⏳ | ❌ | ❌ | ⏳ | Backend có, FE chưa nối |
| Invoice/Zalo | ✅ | 🟡 fail-closed | ❌ | ⏳ | ❌ | ❌ | ⏳ | API LOCKED/DOCUMENTED, FE/config thiếu |
| Payment | ✅ | ❌ | ❌ | ⏳ | ❌ | ❌ | ❌ | Chưa bắt đầu |
| Vehicle/Parking | ✅ | ❌ | ❌ | ⏳ | ❌ | ❌ | ❌ | DB/Spec có, chưa runtime |
| Complaint | ✅ | ❌ | ❌ legacy UI | ⏳ | ❌ | ❌ | ❌ | V1 chưa bắt đầu |
| CT01 | ✅ data fields | ❌ | ❌ | 🟡 Resident audit | ❌ | ❌ | ❌ | Chưa pending/review/export |
| Public Marketplace | ✅ | 🟡 legacy | 🟡 legacy | ⏳ | ❌ | 🟡 landing page | ⏳ | LEGACY DEPENDENCY |

## Nguồn và kết quả kiểm tra

Đã đọc Documentation Rules/README/Catalog; Requirement/API Spec canonical trong project GocTro-SmartBuilding; current reports Resident, Contract, Invoice/Zalo và frontend integration; backend/frontend source; Prisma và Database V1.3 schema/ERD/seed/validator/changelog; package scripts và local development scripts.

- Frontend typecheck: **PASS**.
- Frontend API client tests: **5/5 PASS**.
- Backend regression suites: Auth **20/20**, Property/Room **33/33**, Resident/Occupancy **37/37**, Contract **112/112**, Invoice/Zalo **36/36**; tổng **238/238 PASS**. Các suite dùng loopback tạm; chạy lại với quyền mạng local sau khi sandbox báo EACCES.
- Backend typecheck: **FAIL**, 173 diagnostics, toàn bộ backend/src/app.ts.
- Frontend production build: **PASS** khi chạy ngoài giới hạn path-access của sandbox.
- Backend build: **FAIL** cùng 173 diagnostics.
- Local runtime health/browser smoke: **chưa xác minh**; port 3000, 4000, 5432 không có listener.
- Database runtime không được kết nối trong lượt này; PASS/LOCK V1.3 được trích từ changelog/validator. Populated V1.2→V1.3 migration chưa PASS.

Báo cáo phản ánh source tại ngày 09/10/2026. Source mới hơn ngày audit cần được kiểm tra lại.
