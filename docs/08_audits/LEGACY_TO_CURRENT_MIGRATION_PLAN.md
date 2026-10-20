# Legacy → current architecture migration plan

**Ngày cập nhật:** 2026-10-16. **Trạng thái:** GIAI ĐOẠN 1 HOÀN TẤT; GIAI ĐOẠN 2 PARTIAL — Accounts V1 read/status/invitation audit-revoke implemented; enrollment/reset delivery chưa khả dụng. Không tự bắt đầu GĐ3. Đây là checklist xuyên suốt, không phải phê duyệt thay đổi business rule hoặc production readiness.

Các inventory và phép đo ở §2–6 ghi lại snapshot GĐ1. Những mô tả Accounts còn gọi API demo trong các bảng đó là lịch sử trước chuyển đổi; trạng thái source Accounts hiện tại, diagnostics và các blocker GĐ2 được cập nhật ở §7.

## 1. Authority và phạm vi

Đã đọc AGENTS.md, frontend/AGENTS.md, Documentation Rules, Current State/Catalog; Next file conventions trong node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md; canonical sibling docs/01_REQUIREMENTS.md (Account/Facility/Service/Complaints), docs/04_API_SPEC.md (§5.1, §5.2, Contract, Invoice, §5.10–5.12), docs/DATABASE_CHANGELOG.md và Database V1.8 README/schema/upgrade artifact. Các metadata cũ trong Requirement không đổi physical authority: V1.8 LOCK local/dev, PostgreSQL18.6, 40 bảng. API /api/v1 và Database V1.8 là hai hệ version khác nhau.

Giữ database/schema.prisma hiện hành; legacy_amenity_id và quan hệ composite của property_pricing_items là phần hợp lệ của SQL V1.8, không phải code chết. Mocks/test doubles và synthetic fixtures không tự động là demo cần xóa. Health không phải business legacy.

Không stage/commit/push; không cập nhật dependencies/lockfile; không sửa .env thật, DB/Prisma/SQL/migrations hoặc dữ liệu. Không kết nối database đang dùng. Những dirty changes đã có trước nhiệm vụ được giữ, gồm public explorer và tooling V1.8. Không tiếp tục Accounts/Amenities/Bookings trong lượt này.

## 2. Bằng chứng dọn code chết

Kiểm tra toàn source FE/BE, scripts/package/config, literal import/export, dynamic import/require và consumer tên component; phân giải imports theo frontend tsconfig. Bốn file dưới đây không có consumer thực thi, không phải page/layout/route convention; không tồn tại route tenants/page.tsx để mount component cũ. References còn trong báo cáo/manifest ZIP là lịch sử, không phải runtime dependency. Không sửa caller để làm chúng hết consumer.

| File / code | Caller/authority trước khi gỡ | Replacement và mức tương đương | Quyết định / điều kiện / kết quả |
|---|---|---|---|
| frontend/src/app/tenants/tenant-management.tsx | Không import/route/test/tooling consumer; gọi /api/tenants theo DTO demo | /admin/tenants/page.tsx → resident-management.tsx, V1 Resident API; /tenant dùng residentApi V1, không dùng file này | Đã xóa orphan component; không xóa /api/tenants vì Accounts còn caller |
| frontend/src/app/admin/services/service-overview.tsx | Không import; services/page.tsx đã redirect utilities | Workspace 4 tab utilities/fixed/flexible/parking; overview không còn là product entry | Đã xóa orphan; giữ redirect/menu con |
| frontend/src/app/admin/complaints/legacy-complaints-workflow.tsx | Không import; page hiện mount DeferredFeatureScreen | Deferred là lock screen, KHÔNG tương đương full Complaint workflow | Đã xóa orphan workflow; giữ page/lock, không mở feature |
| frontend/src/app/admin/viewings/legacy-viewing-requests-workflow.tsx | Không import; page hiện mount deferred amenityCalendar | Lịch tiện ích deferred, KHÔNG thay thế room viewing nghiệp vụ | Đã xóa orphan workflow; giữ page/lock |
| frontend/src/app/globals.css: service-overview-* và service-coming-soon | Chỉ overview đã bỏ sử dụng; không consumer JS/TS/HTML khác | Không cần replacement cho UI đã bỏ | Đã gỡ selector riêng và media fragment; giữ .text-success và service-table/service-row-actions shared |
| backend/src/app.ts: POST/PATCH/DELETE/GET /api/contracts | Middleware 410 đăng ký trước mọi handler, không next(); chặn prefix và mọi method | /api/v1/contracts: current auth/scope/lifecycle | Đã gỡ 4 handler chết, giữ 410 |
| backend/src/app.ts: POST/PATCH/DELETE/GET /api/invoices | Middleware 410 trước requireAdmin/handlers, response kết thúc | /api/v1/invoices: current billing | Đã gỡ 4 handler chết, giữ 410 |
| canManageContract, canManageInvoice trong app.ts | Chỉ 8 handler trên gọi; không còn identifier consumer sau gỡ | V1 dùng middleware/repository riêng | Đã gỡ 2 helper; imports Prisma/crypto vẫn cần cho code còn lại, không gỡ nhầm |

AST kiểm tra app.ts sau thay đổi đúng bằng bản trước trừ 10 ranges (8 statements và 2 helper), không sửa các statements khác. HTTP test chạy với real Express app, port loopback ngẫu nhiên, URL DB dummy; không tới PostgreSQL. Trước và sau gỡ, 8 request cũ đều 410; V1 Contract/Invoice anonymous đều 401, CSRF 200. Health 200; health/db dùng stub query chỉ kiểm wiring, KHÔNG phải DB health runtime.

## 3. Inventory active callers / phần giữ lại

| File/route/module | Caller thực tế và API/model/table | Replacement / mức tương đương | Hành động, điều kiện hoàn tất, trạng thái |
|---|---|---|---|
| frontend/src/app/admin/accounts/page.tsx | Route Next truy cập trực tiếp dù nav; fetch /api/admin/accounts và /api/tenants; role ADMIN/LANDLORD/TENANT, form password | API Spec §5.2: accounts/admin-resident, invitations/reset; router V1 chưa mount Account administration router | GĐ2 chuyển caller + triển khai đúng contract; chưa chuyển, không xóa page hoặc API |
| frontend/src/app/admin/amenities/page.tsx | Direct route → DataManagement → /api/amenities + options/properties; Prisma amenity demo fields | Facility/paid-service hiện hành khác semantic; Services KHÔNG replacement 1:1 | GĐ3 quyết định product scope/contract trước migrate hoặc retire |
| frontend/src/app/admin/bookings/page.tsx | Direct route → DataManagement → /api/amenity-bookings, options amenities/tenants/rooms; demo AmenityBooking | Future Resident request/use/scheduling/completion contract chưa được §5.10 định nghĩa | GĐ3 bổ sung replacement hoặc retire được duyệt; chưa xóa |
| frontend/src/app/components/data-management.tsx | Amenities và Bookings còn import; CRUD/options dynamic fetch | API client V1/CSRF chưa được dùng bởi component này | Giữ; chuyển hết caller và regression rồi mới gỡ |
| frontend/src/app/admin/complaints/page.tsx, viewings/page.tsx; components/deferred-feature-screen.tsx | Route trực tiếp và tests; deferred text/CTA | Chủ đích product deferred, không đủ functional equivalence để reopen | Giữ nguyên lock; có regression markup và page source |
| frontend/src/app/home-page.tsx | Không tìm thấy static importer; homepage thật export _property-explorer/listing-page | Candidate homepage cũ, không phải route convention | Chưa xóa ngoài 4 ứng viên đã xét đầy đủ; audit CSS/assets/dynamic consumer riêng trước GĐ5 |
| frontend/src/app/rooms/room-listing.tsx | Không static importer; rooms/page.tsx export explorer listing | Candidate listing cũ, còn chia sẻ public card/gallery helpers | Chưa chứng minh closure toàn dependency/assets; review GĐ5, không xóa helpers hiện hành |
| frontend/src/app/components/auth-provider.tsx, lib/api/authApi.ts, /tenant/tenant-portal.tsx | Current opaque V1 auth + residentApi; portal không gọi old tenant-portal API | Current V1 Account/Resident/Contract flow | Giữ; không coi tên tenant là bằng chứng legacy |
| backend/src/app.ts legacy auth/helper | Direct /api/auth/* và requireAdmin/platformAdminOnly/tenantOnly; goctro_session HMAC; userAccount, uppercase roles, canManage* demo fields | backend/src/auth/account-repository.ts + middleware/auth.ts dùng account/admin/resident + gt_session | GĐ2 chuyển Accounts; GĐ3 audit/retire callers legacy còn lại trước bỏ auth cũ. Không bypass hoặc chỉ đổi tên model |
| backend/src/app.ts /api/tenants | Accounts còn GET consumer; mutation/detail vẫn callable trực tiếp; Prisma tenant demo | /api/v1/residents + occupancies là current scoped API | Chuyển Accounts trước; inventory/retire route group sau, không xóa GĐ1 |
| backend/src/app.ts /api/amenities, /api/amenity-bookings | Direct frontend callers trên; Prisma amenity fields không khớp và amenityBooking không có trong mapping V1.8 | Facility vs Paid Service khác nhau | GĐ3 theo canonical và product decision; còn 27 diagnostics trong các handlers liên quan |
| backend/src/app.ts /api/viewing-requests, /api/maintenance-requests | Page workflow đã bỏ; endpoints vẫn callable URL; public viewing handler còn tạo roomViewingRequest; old tenant-portal requests còn tạo maintenanceRequest | Contact Request / Complaint không mặc nhiên tương đương | GĐ3 quyết định retire/API thay thế; giữ vì chưa đóng caller chain và ngoài 8 handler GĐ1 |
| backend/src/app.ts /api/public/rooms, /api/public/viewing-requests | Direct HTTP còn mount; old Room/RoomViewingRequest fields, không tìm current FE caller | V1 public marketplace list/detail/contact, nhưng viewing scheduling không tương đương contact | GĐ3 retire sau decision/backward compatibility; không xóa vì thiếu sidebar link |
| /api/health, /api/health/db; /api/v1 + /api/v1/public/explorer | Launcher/health monitoring và current FE/API clients | Current infrastructure/business routes | Giữ, tested mounting; DB thật chưa kiểm tra |
| backend/src/residents/resident.test.ts:256 | Current supported resident test, gọi residenceStatus không còn trong ResidentCreate | Lỗi test thuộc module hiện hành, không phải code chết | Giữ và inventory; sửa riêng theo canonical, không tắt test/tsconfig |

### 3.1 Mọi options endpoint

| Endpoint trong app.ts | Consumer FE sau cleanup | Model / điều kiện |
|---|---|---|
| GET /api/options/landlords | Không tìm literal caller hiện hành; direct URL vẫn mount | userAccount/LANDLORD; GĐ2–3 retire sau caller/contract review |
| GET /api/options/tenants | bookings/page.tsx field tenantId qua DataManagement | tenant; giữ tới migrate booking |
| GET /api/options/rooms | bookings/page.tsx field roomId qua DataManagement | room/old fields; giữ tới migrate booking |
| GET /api/options/available-rooms | Không literal FE caller; direct URL vẫn mount | room + old contracts; GĐ3 retire có kiểm chứng |
| GET /api/options/properties | amenities/page.tsx field propertyId qua DataManagement | property/old fields; giữ tới migrate facility |
| GET /api/options/contracts | Không literal FE caller; direct URL vẫn mount | leaseContract; GĐ3 retire có kiểm chứng |
| GET /api/options/amenities | bookings/page.tsx field amenityId qua DataManagement | amenity/old fields; giữ tới migrate booking |

Không tạo V1 options endpoint mới trong GĐ1. Không bỏ options test/caller để khiến route thành unused.

### 3.2 Toàn bộ legacy/ và script entry

Tất cả 18 file còn được static server cho truy cập path trực tiếp; đó không đồng nghĩa là supported V1 business. npm legacy:dev vẫn gọi server.js. Quyết định toàn folder ở GĐ5: giữ asset cần thiết bằng đường dẫn mới, bảo tồn reference/khôi phục đã rà soát, sau đó mới gỡ entry/demo. Không giữ vĩnh viễn chỉ vì guideline lịch sử cũ.

| File dưới legacy/ | Consumer / dữ liệu | Replacement và điều kiện GĐ5 |
|---|---|---|
| server.js | package.json legacy:dev; serve ROOT, index fallback, read/write JSON | Next/Express V1 là entry hiện hành; gỡ script sau archive/demo retirement |
| index.html | GET / trên legacy server; tải CSS và 5 script | FE V1 chỉ tương đương từng domain, không full demo parity |
| demo-database.json | server.js readDb/writeDb | JSON demo, không phải PostgreSQL; archive secret-safe, không import vào DB thật |
| styles.css | index.html stylesheet | Current globals/explorer CSS không chứng minh full equivalence; giữ cùng demo tới retirement |
| role-user.js | index.html script | Resident demo features khác current portal; domain-gap review |
| app-fixes.js | index.html script | Patch DOM demo; chỉ bỏ cùng root demo sau review |
| settings-demo.js | index.html script | Demo plan/profile/settings; Requirement không có SaaS plan business |
| foxi.js | index.html script và Foxi interactions | Chưa có full replacement được xác nhận |
| ui-refinements.js | index.html script | Demo DOM styling; giữ tới demo retirement |
| logo-goc-tro.png | index.html logo | Current frontend assets có đường dẫn riêng; verify/copy asset trước retire |
| foxi.svg | index.html mascot | Kiểm tra product/reference cần giữ trước archive |
| nhan_dien_thuong_hieu.jpg | Design docs reference, direct static URL | Archive/reference giữ provenance, cập nhật doc links khi di chuyển |
| logo-goc-tro-mark.png | Direct static access; chưa thấy path-specific importer | Candidate archive sau xác minh duplicate/reference |
| foxi_mascot_concept.svg | Concept/reference, direct static access | Archive concept sau review, không gọi runtime dependency V1 |
| wireframe/role_user/wireframe-tim-phong.html | Direct file/static URL; lịch sử UI | Current /rooms không bằng chứng cần xóa lịch sử; archive |
| wireframe/role_user/wireframe-man-hinh-cu-dan.html | Direct file/static URL | Current /tenant một phần tương đương; archive |
| wireframe/role_admin/wireframe-xu-ly-khieu-nai-admin.html | Direct file/static URL | Current deferred, không reopen; archive reference |
| wireframe/role_admin/settings-wireframe.html | Direct file/static URL | Settings demo không full requirement parity; archive |

### 3.3 Tooling, DB history và tài liệu

| Item | Consumer / authority | Kế hoạch / trạng thái |
|---|---|---|
| scripts/run-contract-idempotency-runtime.mjs | Đọc sibling Database V1.5/schema.sql + Database V1.4/seed.sql, kiểm 28 bảng; backend contracts integration dùng fixture/runtime path | GĐ4 chuyển test fixture sang V1.8 và kiểm idempotency lại; KHÔNG nâng DB populated V1.5 |
| backend/src/contracts/contract-idempotency.integration.test.ts | test:contracts:runtime, opt-in CONTRACT_IDEMPOTENCY_TEST_DATABASE_URL; PostgreSQL thật khi được cấp | Giữ test hỗ trợ, không chạy task này, không gọi fixture dư |
| database/schema.legacy.prisma | docs/03_database/prisma/PRISMA_V1_1_REMAP_REPORT.md reference | GĐ5 archive sau generate/CLI/khôi phục review |
| database/schema.v1_1.prisma | PRISMA_V1_2_REMAP_REPORT.md preserved mapping | GĐ5, không di chuyển/xóa GĐ1 |
| database/schema.v1_2.prisma | PRISMA_V1_3_CONTRACT_AUDIT_REMAP_REPORT.md retained snapshot | GĐ5, không di chuyển/xóa GĐ1 |
| database/seeds/seed.ts | Historical demo userAccount/tenant/uppercase roles; db:seed hiện KHÔNG gọi | GĐ5 archive secret-safe sau hết consumer và recovery review |
| database/migrations/20261007182315_initial_schema/migration.sql | Demo initial; Prisma CLI history convention | GĐ5 giữ applied history/recovery; không rewrite hoặc resolve |
| database/migrations/20261007195000_landlord_roles/migration.sql | Demo chain, LANDLORD/owner fields | GĐ5 cùng migration chain |
| database/migrations/20261007201500_room_marketplace_listing/migration.sql | Demo chain rooms.is_listed/index | GĐ5 cùng chain |
| database/migrations/migration_lock.toml + README; seeds/README | Provider/history warnings và links | Chưa chuyển history; tình trạng _prisma_migrations trên môi trường khác chưa biết, không đọc DB thật |
| database/schema.prisma; database/baselines/v1.8/ | Generate/validate hiện hành, SQL bootstrap/seed guarded, provenance/catalog | KEEP CURRENT, hash unchanged; không archive legacy_amenity_id |
| scripts/database-v18.*; package db:* | V1.8 new-empty bootstrap/seed; migrate legacy bị block | Giữ; GĐ4 kiểm tooling tích hợp, không tạo flow trùng |
| docker-compose.yml, scripts/dev-all.ps1, setup/launch | Compose PG18.6/volume riêng đã sửa; launcher guard localhost:5432/Goctro_test3; setup không tự tạo DB | GĐ4 xem target/config interoperability, chưa đổi guard hoặc env |
| README.md, SOURCE_REVIEW_GUIDE.md, DATABASE_LEGACY_REVIEW.md, FILE_MANIFEST.md và các ZIP trước | Mô tả retained demo/history và snapshot review ngày tạo | Reference có ngày, không phải lệnh migrate demo. GĐ6 sync final docs/package; không rewrite báo cáo quá khứ |
| docs/08_audits/PRE_GIT_STEP_4_LEGACY_RETIREMENT_AUDIT.md | Snapshot cũ ghi no source deleted | REFERENCE; kế hoạch này supersede status cleanup hiện tại, giữ bằng chứng quá khứ |
| .github/ / Prisma config | Không có .github/ hoặc prisma.config.* trong checkout khảo sát; root/backend explicit --schema current | Pipeline ngoài repository chưa xác định; không kết luận history unused toàn hệ thống |

## 4. Kết quả đo trước/sau

| Check / command | Trước | Sau |
|---|---|---|
| npm run typecheck --workspace=@goctro/frontend | PASS | PASS |
| npm run build --workspace=@goctro/frontend | PASS | PASS; current routes giữ nguyên gồm accounts/amenities/bookings/deferred/services |
| npm run test:api --workspace=@goctro/frontend | 64/64 PASS | 66/66 PASS; thêm 2 invariant redirect/deferred, không bỏ test cũ |
| npm run typecheck --workspace=@goctro/backend | FAIL 174 diagnostics, đo mới | FAIL 121 diagnostics |
| npm run build --workspace=@goctro/backend | FAIL 174 diagnostics | FAIL 121 diagnostics |
| npm run db:validate (URL dummy process-only) | PASS | PASS, không connect DB |
| tsx --test backend/src/legacy-retirement.test.ts / script mới test:legacy-retirement | 12/12 PASS trên source trước gỡ | 12/12 PASS sau gỡ |
| npm run test:auth --workspace=@goctro/backend | 20/20 PASS | 20/20 PASS |
| npm run test:contracts --workspace=@goctro/backend | 134/134 PASS | 134/134 PASS |
| npm run test:invoices --workspace=@goctro/backend | 157 PASS, 3 SKIP | 157 PASS, 3 SKIP |
| npm run test:db-setup | Không rerun trước do tooling không đổi | 10/10 PASS |

Sandbox đầu tiên chặn HTTP loopback EACCES. Rerun cùng tests ngoài sandbox được cấp phép đều PASS trước/sau; đây là giới hạn môi trường, không phải failing assertions nghiệp vụ. Database integration env cho Invoice bị unset trong process để 3 opt-in PG tests SKIP; không kết nối PostgreSQL hoặc chạy runtime SQL. Mock HTTP tests không chứng minh runtime DB/browser/production. Không chạy browser smoke, không restart dev stack. Dependencies hiện có đủ, không cài/nâng phiên bản. Không chạy Prisma generate trong GĐ1 vì mapping không đổi, validate là kiểm tra liên quan.

### 4.1 Phân loại lỗi backend và delta theo code

53 diagnostics mất đi đúng bên trong 8 handler/2 helper đã xóa. Đối chiếu từng diagnostic còn lại theo file/code/message/column và số dòng sau khi trừ các range xóa: **0 diagnostic mới, 0 diagnostic còn lại biến mất bất thường**. Backend mới không có lỗi trong test retirement. Còn 120 ở app.ts (active/callable legacy mismatch) và 1 ở resident.test.ts:256 (current test field mismatch). Không any/@ts-ignore hàng loạt, không bỏ tsconfig hoặc tắt tests.

| Statement/helper | Trước | Sau | Phân loại |
|---|---:|---:|---|
| helper activeSession | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| helper canManageProperty | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| helper canManageTenant | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| helper canManageRoom | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| helper canManageContract | 1 | 0 | Code chết đã gỡ |
| helper canManageInvoice | 2 | 0 | Code chết đã gỡ |
| helper canManageAmenity | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| helper canManageAmenityBooking | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| helper canManageViewing | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| helper canManageMaintenance | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| POST "/api/auth/login" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| GET "/api/tenant-portal/summary" | 8 | 8 | Legacy còn callable/caller, chưa migrate |
| POST "/api/tenant-portal/requests" | 3 | 3 | Legacy còn callable/caller, chưa migrate |
| GET "/api/public/rooms" | 14 | 14 | Legacy còn callable/caller, chưa migrate |
| POST "/api/public/viewing-requests" | 6 | 6 | Legacy còn callable/caller, chưa migrate |
| GET "/api/admin/accounts" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| POST "/api/admin/accounts" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| PATCH "/api/admin/accounts/:id" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| GET "/api/options/landlords" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| GET "/api/options/tenants" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| GET "/api/options/rooms" | 5 | 5 | Legacy còn callable/caller, chưa migrate |
| GET "/api/options/available-rooms" | 5 | 5 | Legacy còn callable/caller, chưa migrate |
| GET "/api/options/properties" | 4 | 4 | Legacy còn callable/caller, chưa migrate |
| GET "/api/options/contracts" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| GET "/api/options/amenities" | 3 | 3 | Legacy còn callable/caller, chưa migrate |
| POST "/api/tenants" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| PATCH "/api/tenants/:id" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| DELETE "/api/tenants/:id" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| POST "/api/contracts" | 7 | 0 | Code chết đã gỡ |
| PATCH "/api/contracts/:id" | 10 | 0 | Code chết đã gỡ |
| DELETE "/api/contracts/:id" | 2 | 0 | Code chết đã gỡ |
| POST "/api/invoices" | 1 | 0 | Code chết đã gỡ |
| PATCH "/api/invoices/:id" | 11 | 0 | Code chết đã gỡ |
| DELETE "/api/invoices/:id" | 5 | 0 | Code chết đã gỡ |
| POST "/api/amenities" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| PATCH "/api/amenities/:id" | 6 | 6 | Legacy còn callable/caller, chưa migrate |
| DELETE "/api/amenities/:id" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| GET "/api/amenity-bookings" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| POST "/api/amenity-bookings" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| PATCH "/api/amenity-bookings/:id" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| DELETE "/api/amenity-bookings/:id" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| GET "/api/viewing-requests" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| PATCH "/api/viewing-requests/:id" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| DELETE "/api/viewing-requests/:id" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| POST "/api/maintenance-requests" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| PATCH "/api/maintenance-requests/:id" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| DELETE "/api/maintenance-requests/:id" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| GET "/api/tenants" | 6 | 6 | Legacy còn callable/caller, chưa migrate |
| GET "/api/tenants/:id" | 1 | 1 | Legacy còn callable/caller, chưa migrate |
| GET "/api/contracts" | 2 | 0 | Code chết đã gỡ |
| GET "/api/invoices" | 12 | 0 | Code chết đã gỡ |
| GET "/api/amenities" | 13 | 13 | Legacy còn callable/caller, chưa migrate |
| GET "/api/maintenance-requests" | 2 | 2 | Legacy còn callable/caller, chưa migrate |
| src/residents/resident.test.ts | 1 | 1 | Lỗi test current module giữ nguyên |

### 4.2 Toàn bộ route registrations không version còn lại trong app.ts

Đường dẫn/line là sau cleanup; mỗi route callable được inventory, không suy ra unused chỉ vì thiếu sidebar. Models là Prisma delegate trực tiếp trong statement; helper/scope còn xem §3.

| Method | Path | app.ts line | Delegate trực tiếp | Trạng thái |
|---|---|---:|---|---|
| GET | "/api/health" | 72 | — | KEEP current health |
| GET | "/api/health/db" | 76 | — | KEEP current health |
| USE | "/api/invoices" | 93 | — | KEEP 410 retirement stub |
| POST | "/api/auth/login" | 224 | userAccount | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/auth/me" | 246 | — | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/tenant-portal/summary" | 254 | userAccount, leaseContract, invoice, maintenanceRequest, amenityBooking | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| POST | "/api/tenant-portal/requests" | 270 | userAccount, leaseContract, maintenanceRequest | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| POST | "/api/auth/logout" | 283 | — | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/public/rooms" | 288 | room | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| POST | "/api/public/viewing-requests" | 313 | room, roomViewingRequest | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/admin/accounts" | 336 | userAccount | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| POST | "/api/admin/accounts" | 343 | userAccount | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| PATCH | "/api/admin/accounts/:id" | 365 | userAccount | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/options/landlords" | 379 | userAccount | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/options/tenants" | 387 | tenant | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/options/rooms" | 395 | room | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/options/available-rooms" | 403 | room | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/options/properties" | 415 | property | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/options/contracts" | 423 | leaseContract | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/options/amenities" | 434 | amenity | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| POST | "/api/tenants" | 442 | tenant | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| PATCH | "/api/tenants/:id" | 457 | tenant | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| DELETE | "/api/tenants/:id" | 473 | tenant | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| POST | "/api/amenities" | 490 | amenity | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| PATCH | "/api/amenities/:id" | 505 | amenity | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| DELETE | "/api/amenities/:id" | 520 | amenity | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/amenity-bookings" | 525 | amenityBooking | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| POST | "/api/amenity-bookings" | 541 | amenityBooking | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| PATCH | "/api/amenity-bookings/:id" | 557 | amenityBooking | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| DELETE | "/api/amenity-bookings/:id" | 576 | amenityBooking | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/viewing-requests" | 581 | roomViewingRequest | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| PATCH | "/api/viewing-requests/:id" | 598 | roomViewingRequest | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| DELETE | "/api/viewing-requests/:id" | 607 | roomViewingRequest | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| POST | "/api/maintenance-requests" | 612 | maintenanceRequest | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| PATCH | "/api/maintenance-requests/:id" | 628 | maintenanceRequest | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| DELETE | "/api/maintenance-requests/:id" | 645 | maintenanceRequest | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/tenants" | 650 | tenant | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/tenants/:id" | 699 | tenant | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/amenities" | 726 | amenity | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |
| GET | "/api/maintenance-requests" | 753 | maintenanceRequest | Giữ GĐ1, chuyển/retire có contract ở GĐ2–3 |

Search sau gỡ: không runtime import/path tới 4 file xóa; một negative assertion nhắc service-overview để ngăn regression, không phải consumer. Không xóa CSS/assets shared. Hash toàn database/ và backend/.env khớp snapshot kiểm tra trong nhiệm vụ. Build outputs/logs chỉ ở thư mục ignored; không đóng gói secrets.

## 5. Checklist các giai đoạn tiếp theo

### GĐ1 — inventory, baseline, dead code cleanup

- [x] Đọc authority, ghi dirty status trước thay đổi, đo FE/BE mới.
- [x] Inventory demo, frontend orphan/direct routes, unversioned handlers/options/auth, test fixtures/history/config/docs.
- [x] Gỡ 4 orphan component, CSS riêng, 8 blocked handler và 2 private helper.
- [x] Regression trước/sau, so từng diagnostic; không lỗi mới, giữ 410/deferred/current V1 routes.
- [x] Cập nhật checklist/Catalog/Current State; dừng trước GĐ2.

### GĐ2 — Accounts và caller active

- [x] Implement own Admin + in-scope Resident list/detail/status và invitation history/revoke theo API Spec §5.2.
- [ ] Hoàn thiện issuance/acceptance/reset một lần, delivery và contract canonical còn thiếu; hiện fail 503 không ghi dữ liệu.
- [x] Chuyển accounts/page.tsx sang apiClient/Auth V1/CSRF; thay /api/tenants bằng Resident V1 cho selector khi cần; snake_case/string BigInt/pagination theo contract.
- [x] Loại bỏ LANDLORD/TENANT/platform-admin semantics, form tạo Admin/nhập password Resident. Một Owner đúng một Admin; không tạo Admin phụ hoặc global CCCD lookup.
- [x] Lock Resident revoke sessions; foreign/missing hidden404; không client authority, token/hash hoặc password trong responses.
- [ ] Test Owner isolation, IDOR, role/status, CSRF/pending, enrollment/reset lifecycle rồi authenticated disposable smoke. Chỉ gỡ legacy Account endpoint/helper khi mọi caller đã chuyển.

**Quyết định/điểm cần đối chiếu trước implementation GĐ2:** không cần hỏi lại role Admin/Resident hay tenant scope đã chốt. Đọc lại canonical enrollment quyết định và API response contract; Spec §5.2 quy định delivery out-of-band nhưng chưa cung cấp đầy đủ runtime adapter/DTO/error semantics. Nếu approved documents đã chốt delivery/TTL thì dùng đúng, không tự thay; nếu còn xung đột giữa canonical và report cũ phải chốt contract trước phần phụ thuộc. Cần xác định provider/DEV retrieval boundary được hỗ trợ và đường Resident accept/reset; không bật production bằng mock hoặc cho Admin xem/đặt plaintext password. Đây là gate implementation, không tự thêm requirement. Không chuyển Amenities/Bookings/Payment ở GĐ2.

### GĐ3 — Amenities/Bookings và legacy routes/helpers còn lại

- [ ] So Facility với Paid Service và booking lifecycle theo Requirement/API; Services không được tự xem replacement tương đương.
- [ ] Chốt migrate/bổ sung contract/retire từng route, options, public viewing và legacy auth/tenant-portal; giữ deferred Complaints/Viewings tới approved task.
- [ ] Chuyển hết DataManagement consumers trước khi gỡ; không xóa URL-accessible route vì không có nav link.
- [ ] Current legacy_amenity_id không đổi; không rename schema chỉ để compile.

### GĐ4 — test baseline + tooling

- [ ] Chuyển run-contract-idempotency-runtime + fixtures từ SQL V1.4/V1.5 sang disposable V1.8, giữ coverage restart/replay/conflict/concurrency/durable history.
- [ ] Rà config Docker/launcher target guard, dùng luồng V1.8 đã có; không tạo bootstrap trùng.
- [ ] Chạy disposable PG18.6, provenance/catalog và integration thật; không lấy mock PASS thay runtime.
- [ ] Tách biệt chuyển bộ test sang V1.8 với nâng DB populated V1.5→V1.8. Trường hợp nâng DB thật KHÔNG được task này cho phép.

### GĐ5 — demo retirement / history archive

- [ ] Chuyển assets/reference còn cần; audit candidate home-page/room-listing và CSS/assets trước xóa.
- [ ] Sau hết consumers mới gỡ legacy:dev và legacy/; archive history riêng, manifest/provenance và secret scan.
- [ ] Audit recovery/applied migration history và mọi môi trường hỗ trợ trước archive seed/snapshots/demo migrations. Không rewrite applied migrations, không migrate resolve để giả tương đương.

### GĐ6 — final closure

- [ ] FE/BE typecheck/build, supported tests, disposable runtime/auth/browser; đối chiếu đủ nghiệp vụ hỗ trợ.
- [ ] Sync current docs/README/guide và package review mới; phân biệt historical evidence với current result.
- [ ] Không tuyên bố whole-project PASS khi còn diagnostics (115 sau GĐ2; 121 ở snapshot GĐ1) hoặc pending product/runtime gates.

## 6. File thay đổi trong lượt này và giới hạn

1. Xóa frontend/src/app/tenants/tenant-management.tsx.
2. Xóa frontend/src/app/admin/services/service-overview.tsx.
3. Xóa frontend/src/app/admin/complaints/legacy-complaints-workflow.tsx.
4. Xóa frontend/src/app/admin/viewings/legacy-viewing-requests-workflow.tsx.
5. backend/src/app.ts: chỉ gỡ 8 handler và 2 helper.
6. frontend/src/app/globals.css: chỉ gỡ overview-only styles.
7. backend/src/legacy-retirement.test.ts: mới, HTTP regression với dummy DB và health query stub.
8. backend/package.json: thêm test:legacy-retirement; giữ mọi thay đổi có sẵn.
9. frontend/src/app/admin/services/service-workspace.test.ts: thêm 2 route invariants.
10. docs/08_audits/LEGACY_TO_CURRENT_MIGRATION_PLAN.md: kế hoạch/checklist này.
11. docs/DOCUMENT_CATALOG.md: đăng ký kế hoạch, phân loại audit cũ thành reference.
12. docs/00_CURRENT_STATE.md: milestone GĐ1, exact next task GĐ2 sau review; không nâng DB/module LOCK.

Không sửa requirements/API/business, DB/Prisma/migrations/seed/history, Docker/guard/env thật, dependencies, assets hoặc whole legacy folder. Không archive/move history hay tạo ZIP mới trong GĐ1. Các ZIP/source review trước vẫn là snapshot ngày tạo. Không restart server hoặc browser smoke; health test ở đây không chứng minh Goctro_test3 connectivity. Raw logs/local audit artifacts nằm trong .local/legacy-phase1/ (ignored), kế hoạch này lưu kết quả để review không cần logs.

**Điểm dừng của snapshot GĐ1:** đã được người dùng review và yêu cầu tiếp tục GĐ2. Trạng thái GĐ2 hiện hành nằm dưới đây.

## 7. Giai đoạn 2 — Accounts V1 implementation (2026-10-16)

**PARTIAL, không phải toàn bộ Accounts/enrollment/reset đã hoàn tất.** Không sửa canonical Requirement/API để hợp thức hóa code. Không dùng report cũ thay authority. Phần độc lập đã được triển khai và kiểm chứng thật trên disposable PostgreSQL18.6; phần có security/delivery contract chưa đầy đủ không bật.

### 7.1 Đối chiếu Accounts cũ với canonical

| Chức năng cũ | Nghiệp vụ / API hiện hành | DTO/quyền/model | Source và quyết định |
|---|---|---|---|
| List toàn platform / LANDLORD, TENANT | GET /api/v1/accounts, filter role/status/resident_id, paginate | Admin; own Admin + Resident qua Resident.ownerId; Account/Resident | API Spec §5.2; đã chuyển, AND tenant scope trước filter |
| Chi tiết / account demo fields | GET /accounts/{account_id} | Snake_case string BigInt, safe contact/status/timestamps + Resident name; không hash/CCCD/owner nội bộ không cần thiết | Đã chuyển, foreign và missing cùng hidden404 |
| Toggle isActive | PATCH /accounts/{account_id}/status body {status:active/locked} | Admin, Resident own scope only; không đổi own Admin/role/link | Đã chuyển; DB transaction row lock + Auth session store hiện hành |
| Form tạo LANDLORD/TENANT + nhập password người khác | POST /residents/{id}/account-invitations | Không thêm Admin, không plaintext password/token response | Bỏ form cũ. Route scoped trả503 ACCOUNT_DELIVERY_UNAVAILABLE, không persist/mất invitation hiện có |
| Không có audit invitation thực | GET /residents/{id}/account-invitations | Paginated safe invitation_id/resident_id/status/expiry/audit timestamps; không token_hash | Đã implement; pending quá hạn được biểu diễn expired mà không ghi đè lịch sử |
| Không có revoke an toàn | POST /account-invitations/{id}/revoke | Owner scope, CSRF, row lock; revoked idempotent, accepted/expired409 | Đã implement và concurrent PostgreSQL test |
| Admin đặt password trực tiếp | POST /accounts/{id}/password-reset | Chỉ Resident own scope, Idempotency-Key; Admin không nhận/đặt password | Bỏ input password. Route trả503 chưa delivery; không token store/notification giả |
| Accept/expired/reset consumption | Spec§5.1 reset + §5.2 one-time enrollment | Infrastructure reset/session store; không có bảng reset/session trong SQL mapping | Chưa implement consumption/accept/reset/TTL reset, không có raw-token public/dev API mới |

### 7.2 Các quyết định đã có và blocker thật

- Requirement Mục5 và Spec§5.2 chốt một Owner/một Admin, Admin quản lý Resident thuộc Owner; Owner lấy từ req.auth, Resident account suy scope qua Resident. Không cần quyết định lại roles/scope.
- Đã đối chiếu cả nguồn user request gốc attachment bb16fc6a-02de-44fa-ba60-540c11d4f734, phần “Bốn quyết định” và §4–11: invitation TTL24 giờ, one-use, Zalo tới phone Resident và DEV-only/test-harness retrieval đã được duyệt. Report RESIDENT_ACCOUNT_PROVISIONING_SELF_SERVICE_IMPLEMENTATION_REPORT.md §2/§9 chỉ là evidence lịch sử, không được dùng để ghi đè canonical. **Không coi TTL24 giờ/DEV fallback là quyết định chưa được duyệt.**
- Canonical API Spec§5.2 hiện chưa đưa accept endpoint/DTO hoặc retry/delivery failure transaction contract vào danh sách endpoint; user request cũ gọi đường accept là “concept / canonical path or approved equivalent”. Canonical§5.1 có reset-password nhưng chưa request schema, exact reset TTL, one-use store implementation hoặc delivery binding. Không mở endpoint token mới dựa riêng vào concept chưa sync contract hiện hành. Cần reconcile chính thức các chi tiết bảo mật này trước consumer công khai/DEV transport; không tự lựa TTL reset.
- Spec§5.1 hàng change-password nói revoke other sessions, đoạn ngay dưới yêu cầu current+other sessions và login lại. Reset/đổi password chưa được thực hiện trong task này; cần làm rõ canonical trước closure. Lock và unlock ở Accounts hiện luôn revoke toàn bộ session của Resident bằng store hiện hành.
- Zalo hiện có chỉ là UnconfiguredZaloProvider cho Invoice, không phải enrollment/reset adapter có xác nhận gửi. Không dùng adapter Invoice để giả “sent”. Service Accounts trả503 rõ ràng trước token creation/delivery, không hủy pending invitation đang có. Provider-failure thực và enrollment/reset consumption chưa có implementation để claim PASS.
- Không tạo thêm Admin, identity global, raw-token retrieval endpoint, token table, session store thứ hai hoặc .env config. Approved DEV test-harness retrieval vẫn là khả năng cho closure sau; chưa có endpoint/transport trong lần này.

### 7.3 Đường đi và lựa chọn kỹ thuật

FE accounts/page.tsx → accounts-content.tsx → accountApi → apiClient (gt_session/CSRF, mapping data+meta) → /api/v1 → authenticateRequest/requireAdmin → accounts/account.routes.ts → AccountManagementService cho mutation → PrismaAccountManagementRepository → Account/Resident/AccountInvitation của V1.8. Các read dùng repository/projection trực tiếp; status service reuse chính auth.sessions.

List scope là OR(own Admin, Resident.ownerId) AND filters, không OR filter với scope. rejectClientAuthority chỉ cho role/resident_id như search filter ở exact GET /api/v1/accounts; owner/header/body authority vẫn reject, mọi kết quả vẫn owner scoped. ID positive decimal PostgreSQL BigInt; order accountId ổn định; default20/max100 theo collection convention. DTO là projection allowlist, không serialize raw Prisma row.

Status transaction khóa Account và Resident row, chỉ Resident trong Owner; update status + await sessions.revokeAccount trước commit. Nếu store lỗi, DB rollback, không trả success. Unlock cũng revoke stale sessions, không phục hồi token cũ. Đây không phải distributed two-phase commit: nếu DB commit lỗi sau revocation, phiên có thể bị thu hồi thêm và người dùng cần login lại; không có quyền vượt scope hoặc false success. Middleware Auth vẫn re-check account status mỗi request. Production durable session store vẫn là gap có sẵn của Auth, không sửa/bypass.

Invitation revoke khóa row owner-scoped, terminal states không overwritten. Read derives expired từ expires_at; không tạo mới/cấp lại, không chọn tokenHash. Không tự đặt lại expired date hoặc thay luật DB.

FE có filter/pagination/loading/empty/error, server-side detail/history, pending ref chống gửi lặp, error khi BE reject; own Admin không có lock action. Không fetch /api/admin/accounts hoặc /api/tenants, không tải hồ sơ/CCCD toàn bộ để lọc client. Cấp tài khoản/reset disabled và nói rõ chưa có verified delivery; không thông báo gửi giả, không popup nhập password người khác. Reuse layout/styles, không redesign dashboard. Browser interactive chưa chạy.

### 7.4 Legacy retirement có giới hạn

Đã gỡ đúng GET/POST /api/admin/accounts và PATCH /api/admin/accounts/:id, platformAdminOnly và hashPassword chỉ phục vụ chúng; gỡ import randomBytes khi hết consumer. Giữ nhỏ gọn app.use /api/admin/accounts trả410 tới /api/v1/accounts cho cả direct URL/mutation, đã regression.

Giữ /api/tenants, options, old HMAC auth/canManage*/verifyPassword, Amenities/Bookings và các routes khác tới GĐ3: booking/DataManagement/direct URLs vẫn còn; không xóa vì Accounts hết caller. Không động 4 files đã xóa GĐ1, deferred Complaints/Viewings, legacy/ hoặc history SQL/Prisma.

### 7.5 Kiểm chứng trước/sau (đo mới, không lấy số121 từ report cũ)

| Check | Trước GĐ2 | Sau GĐ2 |
|---|---|---|
| FE typecheck/build | PASS/PASS | PASS/PASS |
| FE test:api | 66/66 PASS | 72/72 PASS |
| BE typecheck/build | FAIL121/121 diagnostics | FAIL115/115 diagnostics |
| Auth | 20/20 | 20/20 |
| Resident/Occupancy | 49/49 | 49/49 |
| Legacy retirement | 12/12 | 13/13 (thêm Accounts410 case) |
| Accounts HTTP/mock + repository units | Chưa có module | 16/16 PASS |
| Prisma validate URL dummy | PASS | PASS, không connect DB |
| Accounts PostgreSQL/API authenticated | Chưa có module | 6/6 PASS trên disposable V1.8, không SKIP |

115 còn lại gồm114 app.ts legacy callable và1 Resident test residenceStatus không thuộc Accounts. So diagnostic theo file + statement/helper + TS code + message, không so số dòng thô vì có code bị gỡ. 6 diagnostics được loại đều ở 3 Accounts demo handlers; **0 diagnostic mới**. Không tắt test/tsconfig, không any/@ts-ignore hàng loạt. Lỗi type trong test mới ở vòng làm việc đã sửa trước final regression, không ghi chúng thành baseline có sẵn.

Sau rà soát FE, build sandbox gặp EPERM khi mkdir .next/server/app/tenant.segments/tenant dù compile và TypeScript đã qua; rerun đúng command ngoài sandbox PASS. Không sửa config hoặc /tenant để né lỗi. FE72 tests và typecheck sau chỉnh lỗi tải/empty-state vẫn PASS; browser interaction chưa được kiểm tra.

PostgreSQL18.6 disposable cluster mới, role v18_smoke,127.0.0.1:55449, DB goctro_accounts_phase2_20261016; kiểm current_database/port/role/version trước write. Dựng đúng SQL V1.8/seed synthetic bằng applyDatabase/catalog guards,40 tables. Fixtures synthetic tạo riêng; Auth login thực dùng hashing V1, cookie thật và owner context; không thông báo người nhận thật. PASS scoped list/detail/filter, lock/unlock/session invalidation/relogin, DB rollback khi session store lỗi, provider503 không thay invitation, concurrent revoke row locks, hidden foreign invitation và safe history DTO. Sau đó drop duy nhất DB disposable, stop/xóa cluster riêng, kiểm55449closed. Không đọc backend/.env để lấy DB target; không connect Goctro_test3/5432 hoặc restart normal stack.

Không có runtime PASS cho issuance/accept/reset/real provider, không browser smoke; unit/HTTP mocks không bị gọi là PostgreSQL evidence. Không chạy SQL V1.4/V1.5 tests hoặc đổi Docker guard. Database/Prisma protected hashes không đổi.

### 7.6 Bằng chứng và files riêng GĐ2

.local/legacy-phase2/baseline-manifest.json và before/ được tạo một lần trước edit, gồm exact snapshots cả dirty files, không ghi đè khi rerun. git-status-before.txt phân biệt thay đổi sẵn. validation-summary.json chứa diagnostics theo file/code/message và trước/sau tests đã lọc; raw logs không chứa env/token/hash thật. PHASE2_CHANGES.diff chỉ so before/ với after/ chọn file GĐ2, không toàn git diff HEAD. changes-manifest.json ghi SHA256 và file mới/xóa. Không raw secret hoặc dữ liệu thật trong snapshots/evidence.

Sửa: backend/src/app.ts; backend/src/auth/v1.router.ts; backend/src/middleware/auth.ts; backend/src/legacy-retirement.test.ts; backend/package.json; frontend/package.json; frontend/src/app/admin/accounts/page.tsx; kế hoạch này; docs/00_CURRENT_STATE.md; docs/DOCUMENT_CATALOG.md.

Thêm: backend/src/accounts/{account.types.ts,account.repository.ts,account.service.ts,account.routes.ts,account.test.ts,account.repository.test.ts,account.postgres.integration.test.ts}; frontend/src/lib/api/accountApi.ts; frontend/src/lib/api/accountApi.test.tsx; frontend/src/app/admin/accounts/accounts-content.tsx. Không xóa file nào; page Accounts là thay nội dung, không mất route. Không đổi lockfile/dependencies/schema/SQL/Prisma/env thật.

**Nhiệm vụ tiếp theo:** closure GĐ2 — reconcile canonical acceptance/reset DTO/endpoints và reset TTL/delivery/retry; áp dụng các approval invitation24h/Zalo/DEV đã có, rồi implement/verify đầy đủ enrollment/reset và browser theo contract được khóa. Không tự chạy GĐ3.

## 8. Phase 2 review fixes — 2026-10-16 (PARTIAL)

Scope: invitation revoke Idempotency-Key and reproducible document hash evidence only. No enrollment/reset, Phase 3, database/env/Prisma changes, stage/commit/push.

### Header and retry identity

Revoke now validates Idempotency-Key after authentication/Admin authorization and before mutation, using the existing Contract/Invoice convention: 1–128 visible ASCII characters, otherwise 400 VALIDATION_ERROR. The existing Accounts header helper uses the same rule (including the currently unavailable invitation-create/reset commands). FE passes an explicit header through apiClient, retaining one operation key per invitation in the mounted workspace on failure/ambiguous response; success releases it so a new operation gets a fresh UUID. Pending guard and CSRF stay intact. Reload/remount does not persist an in-flight key.

Header validation is not durable replay. Repository Owner-scoped row locking and terminal-state handling remain unchanged: already-revoked returns current state without another update; accepted/expired are not overwritten. No generic replay storage, saved-response guarantee, or same-key/different-payload replay registry is claimed. Full §7 durable replay remains an infrastructure gap; no schema change was introduced.

### Hash findings and evidence

Original .local/legacy-phase2 diff, manifests and raw before/after snapshots are preserved. For both Current State and Document Catalog, Phase 1 ZIP bytes equal Phase 2 before bytes, and Phase 2 after bytes equal the pre-review current file and its original manifest hash. Reapplying the original document hunks to the LF-normalized ZIP reproduces the LF-normalized after content exactly. There is no demonstrated textual difference, wrong snapshot time, or divergent ZIP baseline; a ZIP-to-baseline bridge patch/corrected old raw manifest is not warranted. Mixed CRLF/LF explains the reproduced raw-byte mismatch; the separate hash report lists exact hashes, newline counts and escaped line excerpts. The reviewer's claimed mismatch after content normalization could not be reproduced with the available artifacts.

New evidence: ../SmartRentalManagement_Phase2_Review_Fixes/ relative to repository root (sibling workspace artifact directory). REVIEW_FIX_CHANGES.diff is ONLY this review fix, against immutable .local/phase2-review-fix/before; REVIEW_FIX_MANIFEST.json names raw-byte and LF-normalized SHA-256 separately. Raw final copies of all eight changed source/doc files are included, including final/docs/00_CURRENT_STATE.md and final/docs/DOCUMENT_CATALOG.md. HASH_INVESTIGATION.md and PHASE2_HASH_ADDENDUM.json explain the old evidence without rewriting it. Text patches use UTF-8/LF, preserve BOM if present and do not claim raw-byte reproduction for mixed-ending snapshots.

### Fresh verification

Accounts HTTP/mock + repository tests 19/19 PASS; legacy retirement 13/13 PASS; Auth 20/20 PASS; frontend 73/73 PASS; FE typecheck and production build PASS. HTTP tests initially hit sandbox loopback EACCES; the same commands passed on host loopback with synthetic mock ports, no PostgreSQL connection. BE typecheck FAIL115: diagnostic lines exactly equal the preceding Phase 2 log (114 app.ts legacy, one existing Resident test mismatch), zero new. A missing required argument in an updated FE test was caught by typecheck and fixed before the final PASS. PostgreSQL concurrency/browser smoke were not rerun; current concurrency evidence is HTTP mock side-effect coverage plus the unchanged prior disposable PostgreSQL row-lock test, not a new database PASS.

Phase 2 stays PARTIAL until invitation issuance/acceptance/reset and associated delivery/contracts are completed. Phase 3 has not started. Next task remains Phase 2 closure, outside this review-fix scope.

## 9. Phase 2 enrollment/reset completion — 2026-10-18

**CURRENT: local/dev API flow implemented and verified; overall Phase2 PARTIAL for production adapters and full browser closure.** Sections7–8 retain their dated evidence; their missing-implementation statements describe the 2026-10-16 snapshot. Phase3 has not started.

### 9.1 Authority and technical decisions

Read root/frontend AGENTS, Documentation Rules, Current State/Catalog, this plan, canonical Requirement§5/API§5.1–5.2/§7, current Auth/session/password/Accounts code and V1.8 mapping. Original approval source: user attachment bb16fc6a-02de-44fa-ba60-540c11d4f734/Pasted text.txt, “Bốn quyết định”: invitation24hours, one-use, Zalo and DEV/test retrieval. Current completion request: attachment659a7fb4-7774-49bc-ba23-eb4bda6e0e2d/Pasted text.txt. Reset TTL30minutes is NEW approval in the latter prompt, not a historical decision. Canonical API technical contract was added before implementation; Requirement§5 received only the enrollment/reset decisions needed for consistency. No physical V1.8, Prisma, migrations, dependencies, .env or real DB changes.

### 9.2 Implemented flow

- Admin Accounts uses Owner-scoped paginated Resident V1 selection, including Residents without Accounts. Invite/resend/reset use CSRF and visible-ASCII1–128 Idempotency-Key; FE retains a failed operation's key. Existing read/status/revoke and retired410 paths remain.
- Issuance locks the scoped Resident, checks archived/account/contact state and pending invitation. Only token hash persists in account_invitations; raw random256-bit token travels through the dedicated delivery adapter. Valid pending resend reuses the SAME token/expiry; expired pending row is retained as expired before a new24h row. No account overwrite/relink, no history deletion. Prior process pending material unavailable ->503 rather than silent replacement.
- Verified recipient binding is server-side and ties Owner/Resident/normalized phone to a delivery subject. Phone alone is insufficient. No Invoice ZaloProvider reuse. Outcomes are sent/dev_available/rejected/failed/unknown; only confirmed acknowledgement means sent. Explicit new resend can redeliver the same confirmed/failed link; same-key replay returns original safe metadata. Timeout capped10s, ambiguous outcome is not automatically redelivered. No network call occurs inside a DB transaction. Initial missing provider/binding causes503 before writing invitation; not all implementations always return503.
- POST /auth/accept-invitation consumes token only via POST+CSRF. Resident/invitation locks, fresh expiry/contact/identity checks, unique phone/email guards, Account create and accepted transition share a transaction. Exact identity comes from invitation/binding, never client Owner/role/Resident. Phone normalizer accepts0/84/+84, reused by Auth/provision/reset. Passwords use existing Auth V1 scrypt encoding, minimum12/maximum1024 at setting endpoints; no plaintext storage/API responses. Successful setup leads to login; no auto-login.
- Forgot-password has existence-neutral202 and per-IP/hashed-login limits. Admin reset is scoped and has no password/token field. Reset hashes/purpose/expiry/one-use state live in a DEV-only adapter; retry material is AES-GCM sealed under a process-ephemeral key, not plaintext outbox/log. Thirty-minute expiry and one-use are enforced; successful reset revokes all related reset tokens and all existing sessions, preserving locked status. Password update + session revocation run in a DB transaction; store failure rolls back password and keeps reset usable. A later DB-commit failure can conservatively revoke extra sessions; never false success.
- Shared account gate serializes fresh login credential re-read/verify/session publication with reset/change-password in one DEV process. Concurrent old-password login cannot resurrect a session after reset. This does not claim distributed consistency. Added the previously specified V1 change-password endpoint with current-password verification and full session/reset revocation; no existing V1 implementation was removed.
- Public FE pages /accept-invitation, /forgot-password, /reset-password use apiClient, confirmation/pending/error states; token fragment is moved to component memory and removed from URL. Reload requires reopening the original link (no token persistence). No GET consumption/localStorage/analytics. Dynamic token pages return no-store/no-referrer and CSP limits resources to same origin/API origin. Login links to forgot-password. No dashboard redesign.

### 9.3 Validation and limits

| Check | Fresh baseline | Final |
|---|---|---|
| Accounts HTTP/mock + repository units |19/19 PASS|19/19 PASS|
| Auth |20/20 PASS|20/20 PASS|
| Retirement |Prior13 snapshot, not rerun before edit|13/13 PASS after wiring|
| Enrollment unit/infrastructure |No module|11/11 PASS|
| PostgreSQL V1.8 enrollment/reset HTTP |No module|15/15 PASS (14 subtests plus parent), zero SKIP|
| FE API/UI tests |73/73 PASS|75/75 PASS|
| FE typecheck |PASS|PASS|
| FE production build |Prior review PASS, not rerun before edit|PASS on host; sandbox font fetch blocked|
| BE typecheck |FAIL115 fresh|FAIL115; same source-statement/TS-code multisets, no new errors|
| Harness standalone typecheck |No script|PASS with project's Express ambient declarations|

Native PostgreSQL18.6 disposable cluster:127.0.0.1:55450, rolev18_smoke, databasegoctro_enrollment_20261018,40 public tables. Identity verified before writes; bootstrapped exact V1.8 distribution via supported database-v18 helper; no seed wholesale. Only synthetic Prisma fixtures. Covers Owner/CSRF/key/IDOR, safe hash-only persistence/audit, pending/retry/resend, expiry/revocation, concurrent accepts, rollback on unique-phone conflict, real phone login/cookie/me, generic forgot, purpose separation, concurrent reset, session-store failure rollback, old-password/session denial, new login, locked account, changed phone binding and rate limiting. Unit tests additionally use a controlled clock for exact reset expiry, DEV/production guards, non-resolving delivery timeout and change-password. No real Zalo message/provider test.

Runtime caught a1ms invitation TTL error from separate now() calls; fixed by one issuance timestamp, exact24h assertion retained. A nondeterministic unit expected a particular concurrent-reset password winner; corrected to identical competing payloads while retaining exactly-one-success assertions. Initial harness-only tsc command omitted the project's Express ambient declarations; correct command includes src/types/express.d.ts and passes. BE printed Prisma object-property ordering differs after imports; compare TS code and exact unchanged source statement with multiplicity (Resident unchanged test uses exact diagnostic text), not raw line numbers. Logs retain full messages. No suppression or tsconfig weakening.

Browser rehearsal: FE3002, BE4002 on the disposable cluster. PASS: Admin synthetic login; scoped Resident without Account appears; invite via FE returns accurate dev_available notice; CLI-only retrieval opens setup form and strips token fragment; HTTP pages no-store/no-referrer; database confirms GET left invitation pending and account count0. User reported “Chưa thao tác được” at the required new-password handoff. **No browser PASS for accept-submit/Resident login/reset-submit/re-login**; those flows passed actual HTTP/PostgreSQL, not full browser. Tool policy requires user to enter/submit new credentials; no automated browser bypass. Normal stack was not restarted or reconfigured.

### 9.4 Supported disposable harness and production boundary

New backend/scripts/enrollment-dev-harness.ts refuses any target except explicit NODE_ENV=test and GOCTRO_ENROLLMENT_TEST_DATABASE_URL for127.0.0.1:55450/goctro_enrollment_20261018, rolev18_smoke; runtime verifies database/port/role/40tables before synthetic writes. It serves BE4002 and expects FE3002; no public token endpoint. Run with root node_modules/.bin/tsx.cmd backend/scripts/enrollment-dev-harness.ts. Terminal commands invitation/reset retrieve the link for its synthetic Resident; do not redirect stdout to logs. Start FE with process-only NEXT_PUBLIC_API_BASE_URL=http://localhost:4002/api/v1 and npm run dev --workspace=@goctro/frontend -- --port3002. The disposable DB must first be prepared via the guarded V1.8 setup path; harness does not bootstrap/seed or use backend/.env. Demo password in this test-only helper is not a production credential.

Normal app wires real repository/service with UnconfiguredEnrollmentDelivery: scoped issuance/reset fail closed when missing binding/provider; public forgot remains generic202. Injected harness adapter proves non503 issuance and complete local flow without changing .env or production Auth. Production construction rejects RAM lifecycle adapter, and existing production session-store fail-closed behavior remains. Still needed: verified Zalo recipient binding/real provider acknowledgement, durable reset/retry/session infrastructure and cross-process serialization with runtime verification. A secure infrastructure store (for example Redis) can satisfy reset state without changing SQL V1.8; no SQL change proposal is required by this implementation. RAM/ephemeral-key state is lost on restart; old unconsumed invitations are preserved but acceptance/resend fails closed if binding material is unavailable. This limitation is explicit, not a production-ready claim.

### 9.5 Evidence / stop

Task-only snapshots: .local/phase2-completion-20261018/before, with dirty source captured before each first edit. Source-relative roots preserve SmartRentalManagement and GocTro-SmartBuilding next to each other. Evidence output: sibling SmartRentalManagement_Phase2_Completion_20261018, containing completion-only diff, baseline/final snapshots, manifest with separate raw-byte/LF-normalized SHA256, validation logs and patch-replay result. No whole git diff HEAD; no historical evidence rewritten or hash reinvestigation. Environment files/secrets, database data/dumps, generated output and all .local directories are excluded from export.

**Next task:** Phase2 manual browser closure and production enrollment/reset infrastructure review/implementation with approved binding/provider/storage. No automatic Phase3, Amenities/Bookings, Payment, Docker tooling or history cleanup.

Cleanup verified: closed both agent-created rehearsal tabs, stopped only verified FE3002/BE4002 processes, dropped only goctro_enrollment_20261018 on55450, stopped the task-owned native cluster and removed its verified data directories. Ports3002/4002/55450 are closed. Normal stack and Goctro_test3 were not restarted, reconfigured, connected to or written by this task. Temporary token material was process memory only; no raw link/password log was exported.

## 10. Current product-flow baseline and source cleanup — 2026-10-19

**Status: CURRENT — SOURCE CLEANUP COMPLETE; runtime verification scoped.** This is a new user-authorized cleanup decision, superseding earlier instructions to preserve unused implementations until future migration. It does not claim HTML parity, complete product modules, or production readiness. Sections1–9 retain historical decisions/evidence from their dates.

### 10.1 Baseline and dependency review

| Keep | Entrypoint and use chain |
|---|---|
| Public | src/app/page.tsx and rooms/page.tsx → _property-explorer/listing-page → Explorer → dynamic VietnamMap, RoomFilters, PublicRoomCard → rooms/[roomId] → gallery/contact; public APIs and image proxy |
| Auth and Accounts | login → role/next routing; forgot-password, accept-invitation, reset-password → CredentialForm; root AuthProvider; Admin Accounts and invitation/status/reset/revoke APIs, credential/session security endpoints and guarded validation harness |
| Admin | admin-navigation.ts → Properties/Rooms, Residents/detail/occupancy, Contracts/detail/documents/meter source, Billing readiness, Invoices/detail/finalize/breakdown, contact inbox, Accounts |
| Service | /admin/services redirect → utilities; service-workspace.ts tabs utilities/fixed/flexible/parking → current management UI/APIs |
| Resident | /tenant → TenantPortal → scoped rental/occupancies/contracts/document reads and logout |
| Infrastructure | V1 auth/CSRF/Owner protections, health, scheduler, financial resolvers, existing stored charges and immutable snapshots, current assets/map provenance, tests and guarded disposable tooling |

Provider/delivery/object storage gaps do not justify removing current product flows. No link was added to legitimize unused code. Review covered literal imports/re-exports, dynamic import, conventions, generated URLs, role/data/conditional rendering, menu/tab/blocker/detail navigation, config/scripts and backend consumers. Current Next config has headers, no additional rewrite-based entry; no middleware/proxy or registry consumer of removed UI was found. Read installed Next page convention documentation before edits. The existing dirty worktree was preserved; no reset/clean/staging/commit/push.

### 10.2 Removed source and policy

| Group | Deleted files | Modified files | Scope |
|---|---:|---:|---|
| Frontend |10|4|home-page.tsx; rooms/room-listing.tsx; Admin amenities/bookings/complaints/viewings/services/charges pages; service-charges.tsx; DataManagement; DeferredFeatureScreen. Update propertyServiceApi, its test, Service workspace retirement test and globals.css.|
| Standalone demo |10|0|legacy/index.html, styles.css, role-user.js, app-fixes.js, settings-demo.js, foxi.js, ui-refinements.js, server.js and two duplicate logos. SHA256 confirmed independent current public logo copies before deletion.|
| Backend |0|7|app.ts, middleware/auth.ts, property-service router/repository and router/integration tests, legacy-retirement test.|
| Scripts/config |0|1|Remove only root package.json legacy:dev; do not change packages/lockfile.|
| Documentation |0|4|README, Current State, Catalog and this continuing report.|
| **Total** |**20**|**16**|Task-only source/docs counts; exclude generated .next/dist/tsbuildinfo and ignored .local validation artifacts. Pre-existing changes/deletions are not counted.|

Five removed UI routes had no current navigation/technical role; their previous direct-URL accessibility was not sufficient for retention. Complaints/Viewings workflows were already absent before this task; only their unlinked deferred pages and now-exclusive component were removed. Their Next URLs now404.

app.ts removes34 unversioned demo handlers and14 legacy auth/scope helpers, leaving the current V1 bootstrap/health and existing Property/Room/Contract/Invoice/Accounts410 responses intact. Newly retired prefixes: /api/auth, /api/tenant-portal, /api/public/rooms, /api/public/viewing-requests, /api/tenants, /api/amenities, /api/amenity-bookings, /api/maintenance-requests, /api/viewing-requests, /api/options. Prefix guards cover all methods/nested URLs without DB or legacy-cookie lookup.

The transitional /admin/services/charges screen had no retained consumer. Its FE client/types and exclusive backend list/create commands, serialization/validation, idempotency and resident_id authority exception were removed. /api/v1/properties/:property_id/flexible-service-charges now has a410 guard under existing V1 security middleware; no substitute charge-creation product flow is introduced. Billing's existing charge readers, calculators, snapshots, finalization/rollback and tables are unchanged. Property catalog/immutable price publication APIs remain, including Parking's shared consumers.

globals.css removes241 selector branches exclusive to replaced/deleted UI, retaining shared branches and classes still referenced by current source. Current public logo/gallery/map assets and shared card/form/dialog styles remain. Legacy wireframes, three reference artwork/brand files and historical demo JSON remain as documentation/data, with no application/server entry. No database data/schema/Prisma/SQL/migration/seed or sibling project edit.

### 10.3 Verification and limits

| Check | Result |
|---|---|
| Frontend typecheck |PASS after next typegen refreshed stale generated references to removed pages; final typecheck after build also PASS|
| Frontend test:api |76 PASS/0 FAIL; two removed deferred-implementation checks replaced by one route-retirement guard; retained functional tests remain|
| Frontend production build |PASS;24 product page files, no five retired UI routes; framework not-found and two technical route.ts entries remain|
| Backend typecheck before/after |115→1 diagnostics: all114 removed errors were app.ts legacy references. Remaining exact error src/residents/resident.test.ts(256,61) TS2339: residenceStatus absent on ResidentCreate; no new diagnostic|
| Backend build |FAIL only with the same pre-existing Resident test diagnostic; no cleanup error|
| Real-app retirement HTTP suite |14/14 PASS; removed prefixes/methods/nested paths return410, V1 auth/CSRF and health remain mounted. DB URL points at loopback port1, health query is stubbed; no real DB health claim|
| Service utilities/catalog |13 PASS/0 FAIL/1 opt-in PostgreSQL SKIP; removed manual-charge test replaced by410 regression|
| Invoice/Billing |157 PASS/0 FAIL/3 opt-in PostgreSQL SKIP; stored-charge read/resolve/finalize/rollback coverage retained|
| Auth / Accounts |20/20 and19/19 PASS|
| Enrollment / Parking routes |12/12 and3/3 PASS with in-memory repositories and fake process-only config|
| Browser |Task-owned production FE3210: / and /rooms shells, API-unavailable UI, login→forgot, no-token accept/reset states, anonymous Admin/Resident login redirects; all five removed UI routes404 verified. No credentials submitted or product writes.|
| Final source checks |No runtime import/script reference to deleted components/demo launcher found; TypeScript confirms retained imports. Git diff whitespace check PASS with Windows CRLF handling. Inventory65 TSX/24 pages. Task-owned frontend process and smoke tab closed.|

Initial sandbox HTTP tests failed EACCES; permitted host-loopback reruns passed. Initial build could not fetch Google Fonts in sandbox; host retry and final build passed without changing fonts/dependencies/config. Initial direct Parking test invocation lacked import-time DATABASE_URL; rerun with fake process-only DB/config passed. These are recorded setup failures, not hidden passes.

The guarded Service PostgreSQL integration test was adapted to create stored-charge fixtures directly inside its existing exact disposable-target guard, preserving immutable snapshots, period exclusion and atomic finalize/rollback checks without keeping the retired issuance implementation. No PostgreSQL integration was run in this task; fixture runtime behavior remains unverified. Opt-in DB environment variables were unset for validation processes. No Goctro_test3 connection/write and no backend/scheduler startup. Browser live data/contact submission and authenticated Admin/Resident workflow smoke were NOT RUN; the browser observations establish only the listed shell/error/anonymous behavior.

Remaining assets/data are historical references, not executable features saved for future use. Current code does not establish runtime completion of Parking or unconfigured delivery/storage. The existing Resident test typing error remains outside this cleanup. No unresolved product choice blocks the approved source baseline.

**Exact next task:** continue the previously recorded Auth credential negative-case browser closure (password mismatch and repeated submit) using an explicitly guarded disposable environment; no automatic feature implementation or DB operation.
