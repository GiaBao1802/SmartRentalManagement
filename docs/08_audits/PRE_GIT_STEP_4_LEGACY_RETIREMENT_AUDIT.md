# Góc Trọ — Pre-Git Cleanup Step 4: Legacy Retirement Audit

**Ngày:** 2026-10-15  
**Phạm vi:** Audit/read-only đối với legacy, compatibility, endpoint unversioned, dead handler, demo storage, component orphan và asset. Không xóa/sửa source, không stage, commit hoặc push.  
**Nguồn:** `AGENTS.md`, `frontend/AGENTS.md`, `docs/DOCUMENTATION_RULES.md`, `docs/00_CURRENT_STATE.md`, `docs/DOCUMENT_CATALOG.md`, Step 1–3 reports, Service Current State/IA reports, code/import/route/test/script reference search.

## 1. Executive summary

Đã audit **65 item** theo đơn vị inventory không trùng nhau: 18 file trong `legacy/`, 10 frontend page/component, 23 nhóm route unversioned (GET và mutations `/api/tenants` tách riêng), 8 handler body chắc chắn bị middleware 410 che khuất, 2 support code paths và 4 asset current bên ngoài `legacy/`.

| Phân loại | Số item | Kết luận |
|---|---:|---|
| A. KEEP CURRENT | 10 | Trang khóa hiện hành, Accounts, API Accounts/Residents, storage boundary, seed DEV và asset đang dùng |
| B. KEEP FOR COMPAT | 4 | Các middleware 410 cho old Properties, Rooms, Contracts, Invoices |
| C. KEEP LEGACY DEMO | 11 | Bộ file cần thiết để chạy `npm run legacy:dev`; không được dùng trong Next/V1 |
| D. KEEP HISTORICAL/REFERENCE | 9 | Wireframe, workflow cũ được giữ làm reference, brand board/concept và source artwork |
| E. REMOVE SAFE | 10 | Hai component FE không có consumer + tám handler body không thể tới vì 410 |
| F. REMOVE AFTER REPLACEMENT/RETIREMENT | 6 | Booking page, component dùng chung và bốn nhóm API/options liên quan |
| G. REVIEW MANUALLY | 15 | Endpoint không có consumer nội repo nhưng có thể có caller ngoài; Amenities chưa có replacement Facility; asset cũ cần quyết định lưu trữ |
| **Tổng** | **65** | Mỗi inventory item thuộc đúng một disposition |

**Kết luận vận hành:** có thể bỏ riêng 2 component và 8 handler body khỏi source ở một task cleanup được ủy quyền; giữ các stub 410. Không thể kết luận toàn bộ `legacy/` đã được thay thế đầy đủ để xóa: app legacy còn là demo độc lập, chứa luồng/auth/dữ liệu mẫu và wireframe tham khảo; các module Complaints/Amenities vẫn chưa có complete V1 flow. Có thể ngừng dùng demo trong quy trình hiện hành, nhưng quyết định archive/xóa cả bộ cần được thực hiện riêng.

`/admin/amenities` chưa có replacement tương đương cho Facility catalog; Service Current State nói rõ Facility UI/API còn thiếu. Trang này và API legacy không phải triển khai V1.8 đáng tin cậy vì dùng mô hình/field không khớp Prisma hiện tại. Đánh dấu **manual review**, không nói đã migrate xong. `/admin/bookings` là AmenityBooking cũ; không phải current Resident scheduling và không được giữ chỉ vì future scope. Đề xuất retire trang/API cũ bằng route retirement/deferred behavior trong một task sau.

Backend TypeScript diagnostics hiện tại theo `docs/00_CURRENT_STATE.md`: **174 legacy diagnostics**. Task kế tiếp là **Step 5 — Backend Typecheck Diagnostic Review**, không thực hiện trong lượt này.

## 2. Full legacy inventory and final matrix

Reachable? nói về khả năng truy cập runtime/source hiện tại. “No repo caller” không chứng minh không có external caller. “Safe To Remove?” chỉ đánh giá xóa item hiện tại mà không làm mất hành vi/replacement; cleanup thực tế chưa được thực hiện.

### 2.1 `legacy/` — 18 file

| Path / Route | Type | Current Consumer | Replacement | Reachable? | Classification | Safe To Remove? | Reason |
|---|---|---|---|---|---|---|---|
| `legacy/server.js` | Standalone legacy server | `npm run legacy:dev` (`package.json`) | Next app + V1 backend cho luồng hiện hành | Yes, qua script riêng | C. KEEP LEGACY DEMO | No | Entry point phục vụ index, assets và `/api/demo/*`; phụ thuộc các file dữ liệu/script bên dưới. |
| `legacy/index.html` | Standalone legacy app | `legacy/server.js` root `/` | Current Next public/admin/resident pages theo từng domain | Yes | C. KEEP LEGACY DEMO | No | HTML chứa router/demo UI, đăng nhập mẫu, Foxi demo, local/session storage và các asset cũ. Không được current Next import. |
| `legacy/demo-database.json` | Mock/demo data | `legacy/server.js` read/write | PostgreSQL V1.8 + API V1 cho luồng hiện hành | Yes, chỉ server legacy | C. KEEP LEGACY DEMO | No | Fake DB file được dùng làm dữ liệu khởi tạo/persistence demo. Không phải database runtime của Next. |
| `legacy/styles.css` | Legacy stylesheet | `legacy/index.html` | `frontend/src/app/globals.css` | Yes, chỉ legacy | C. KEEP LEGACY DEMO | No | Được HTML legacy link trực tiếp. |
| `legacy/role-user.js` | Legacy UI script | `legacy/index.html` | Current `/tenant`, `/rooms` | Yes, chỉ legacy | C. KEEP LEGACY DEMO | No | Thêm hành vi tìm phòng/báo cáo legacy; lưu report vào localStorage. |
| `legacy/app-fixes.js` | Legacy UI script | `legacy/index.html` | Current feature implementations | Yes, chỉ legacy | C. KEEP LEGACY DEMO | No | Chỉnh/hydrate sample data và refresh UI cho demo. |
| `legacy/settings-demo.js` | Legacy UI/API script | `legacy/index.html` | Current Admin Accounts/Service APIs từng phần | Yes, chỉ legacy | C. KEEP LEGACY DEMO | No | Gọi `/api/demo/*`, browser storage và giao diện cài đặt demo. |
| `legacy/foxi.js` | Demo assistant script | `legacy/index.html` | Chưa có trợ lý AI tương đương trong V1 hiện hành | Yes, chỉ legacy | C. KEEP LEGACY DEMO | No | Tạo câu trả lời Foxi từ dữ liệu demo; không phải AI/backend hiện hành. |
| `legacy/ui-refinements.js` | Legacy UI script | `legacy/index.html` | Current Next styles/components | Yes, chỉ legacy | C. KEEP LEGACY DEMO | No | Được nạp trực tiếp cuối HTML. |
| `legacy/foxi.svg` | Asset | `legacy/index.html`, `legacy/foxi.js` UI | Chưa có assistant mascot flow hiện hành | Yes, chỉ legacy | C. KEEP LEGACY DEMO | No | Logo/mascot Foxi dùng trong UI legacy. |
| `legacy/logo-goc-tro.png` | Asset | `legacy/index.html` | `frontend/public/logo-goc-tro.png` | Yes, chỉ legacy | C. KEEP LEGACY DEMO | No | Logo legacy độc lập; bản Current Frontend cũng được dùng riêng. |
| `legacy/wireframe/role_user/wireframe-tim-phong.html` | Historical wireframe | Không có runtime import; mở file trực tiếp | `/rooms` | Yes, mở file/static legacy | D. KEEP HISTORICAL/REFERENCE | No | Reference thiết kế; không phải màn hình Next đang chạy. |
| `legacy/wireframe/role_user/wireframe-man-hinh-cu-dan.html` | Historical wireframe | Không có runtime import; mở file trực tiếp | `/tenant` | Yes, mở file/static legacy | D. KEEP HISTORICAL/REFERENCE | No | Reference thiết kế, không có script consumer hiện hành. |
| `legacy/wireframe/role_admin/wireframe-xu-ly-khieu-nai-admin.html` | Historical wireframe | Không có runtime import; mở file/static legacy | Current complaints route là deferred lock screen | Yes, mở file/static legacy | D. KEEP HISTORICAL/REFERENCE | No | Lịch sử UI; khiếu nại hiện bị deferred, không phải replacement runtime. |
| `legacy/wireframe/role_admin/settings-wireframe.html` | Historical wireframe | Không có runtime import; mở file trực tiếp | Không có replacement tương đương được xác nhận | Yes, mở file/static legacy | D. KEEP HISTORICAL/REFERENCE | No | Chỉ giữ giá trị tham khảo; chưa có quyết định archive/xóa. |
| `legacy/nhan_dien_thuong_hieu.jpg` | Brand reference asset | Docs redesign/visual QA | Current logo assets | Yes, docs reference | D. KEEP HISTORICAL/REFERENCE | No | Nguồn tham khảo nhận diện đã được báo cáo thiết kế dẫn lại. |
| `legacy/foxi_mascot_concept.svg` | Mascot concept asset | Không có runtime reference tìm thấy | `legacy/foxi.svg` trong demo | Yes, có thể được static server phục vụ trực tiếp | D. KEEP HISTORICAL/REFERENCE | No | Không có consumer code, nhưng có giá trị concept/archive; chưa đủ căn cứ để xóa khỏi lịch sử. |
| `legacy/logo-goc-tro-mark.png` | Asset không có code reference | Không có path-specific runtime ref tìm thấy | Không cần cho Current Frontend; logo mark frontend là path riêng | Yes, có thể truy cập static | G. REVIEW MANUALLY | No | Có thể là asset bỏ sót/archival; chưa xác nhận nhu cầu lưu hoặc trùng thay thế. |

**Legacy folder:** 11 file tạo thành demo chạy được qua `npm run legacy:dev`; 5 wireframe/brand reference, 1 mascot concept và 1 logo mark cần giữ/reference hoặc quyết định thủ công. Không có bằng chứng cho thấy Current Next phụ thuộc runtime vào `legacy/`. Tuy nhiên “đã thay UI hiện hành” không đồng nghĩa demo/reference đã được archive an toàn. `legacy/server.js` còn dùng CORS `*` cho demo API và SHA-256 demo password; chỉ được chạy qua script demo cục bộ, tuyệt đối không xem là production backend.

### 2.2 Frontend route, component và shared component — 10 item

| Path / Route | Type | Current Consumer | Replacement | Reachable? | Classification | Safe To Remove? | Reason |
|---|---|---|---|---|---|---|---|
| `frontend/src/app/admin/amenities/page.tsx` (`/admin/amenities`) | Frontend page | Truy cập URL trực tiếp; không có sidebar link | Service workspace không tương đương Facility catalog; Facility UI/API còn gap | Yes, Next route | G. REVIEW MANUALLY | No | Đang gọi endpoint legacy và trực tiếp render. Chưa được xem là migrated; cần chốt retire hay xây Facility V1. |
| `frontend/src/app/admin/bookings/page.tsx` (`/admin/bookings`) | Frontend page | Truy cập URL trực tiếp; không có sidebar link | Không có AmenityBooking replacement; Resident scheduling là future scope riêng | Yes, Next route | F. REMOVE AFTER REPLACEMENT/RETIREMENT | No | Legacy booking model đã superseded; route vẫn tồn tại nên phải retire rõ trước khi xóa page/API. |
| `frontend/src/app/admin/services/service-overview.tsx` | Component | Không có import/route/test consumer; `/admin/services` chuyển sang Utilities | `/admin/services/utilities`, `/fixed`, `/flexible`, `/parking` | No current render | E. REMOVE SAFE | Yes | Không có code consumer. Có selector CSS cũ trong `globals.css`; source CSS cần dọn riêng nếu xóa component. |
| `frontend/src/app/admin/viewings/legacy-viewing-requests-workflow.tsx` | Legacy component | Không được page hiện hành import | `/admin/viewings` deferred lock screen | No current render | D. KEEP HISTORICAL/REFERENCE | No | Product Current State nói workflow source được giữ; giữ làm reference không có nghĩa API vẫn phải chạy. |
| `frontend/src/app/admin/complaints/legacy-complaints-workflow.tsx` | Legacy component | Không được page hiện hành import | `/admin/complaints` deferred lock screen | No current render | D. KEEP HISTORICAL/REFERENCE | No | Component chứa workflow cũ; route hiện hành không render/API-call component. Tài liệu nói source được giữ. |
| `frontend/src/app/tenants/tenant-management.tsx` | Legacy component | Không import; không có `tenants/page.tsx` | `/admin/tenants` với Resident/Occupancy V1 API | No current render | E. REMOVE SAFE | Yes | Orphan file; current tenant admin route nằm dưới `/admin/tenants`, không dùng component này. |
| `frontend/src/app/admin/viewings/page.tsx` (`/admin/viewings`) | Frontend page | Next route trực tiếp | Deferred “Lịch tiện ích” screen | Yes | A. KEEP CURRENT | No | Lock/deferred screen là trạng thái sản phẩm hiện tại; test xác nhận không gọi workflow/API cũ. |
| `frontend/src/app/admin/complaints/page.tsx` (`/admin/complaints`) | Frontend page | Next route trực tiếp | Deferred “Khiếu nại” screen | Yes | A. KEEP CURRENT | No | Lock/deferred screen là trạng thái hiện tại; test xác nhận không có thao tác/API legacy. |
| `frontend/src/app/admin/accounts/page.tsx` (`/admin/accounts`) | Frontend page | Sidebar/current Admin | Chưa có V1 Account Admin API/UI migration | Yes | A. KEEP CURRENT | No | Dùng `/api/admin/accounts` và GET `/api/tenants`; đây là migration gap còn active, không phải dead page. |
| `frontend/src/app/components/data-management.tsx` | Shared component | `/admin/amenities`, `/admin/bookings`; hai legacy workflow component không render | Tùy route retire; chưa có current V1 consumer | Yes, qua các page trên | F. REMOVE AFTER REPLACEMENT/RETIREMENT | No | Còn được dùng bởi hai page truy cập trực tiếp; chỉ xóa sau khi retire các page và quyết định lưu workflow reference. |

**Navigation/test evidence:** Sidebar chỉ có một entry Service; không link `/admin/amenities` hoặc `/admin/bookings`. Test `service-workspace.test.ts` xác nhận 4 tab Service hiện hành, ẩn hai route Amenity/Booking khỏi sidebar và xác nhận complaints/viewings page dùng deferred screen không có old API reference. Ẩn sidebar không làm route trực tiếp biến mất.

### 2.3 Backend unversioned route inventory — 23 nhóm + 8 dead handler body

| Path / Route | Type | Current Consumer | Replacement | Reachable? | Classification | Safe To Remove? | Reason |
|---|---|---|---|---|---|---|---|
| `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` | API endpoint family | Không tìm thấy Current FE caller; FE dùng `/api/v1/auth/*` | Auth V1 | Yes | G. REVIEW MANUALLY | No | Auth V1 replacement có test/caller hiện hành, nhưng không biết external clients còn dùng cookie/session cũ hay không. |
| `GET /api/tenant-portal/summary` | API endpoint | Không tìm thấy Current FE caller; Tenant Portal dùng `residentApi.meRental()` + `meContracts()` | Resident V1 self-service | Yes | G. REVIEW MANUALLY | No | Đã có replacement trong app; external compatibility chưa được xác minh. |
| `POST /api/tenant-portal/requests` | API endpoint | Không tìm thấy Current FE caller; complaints screen hiện deferred | Chưa có Resident request/scheduling V1; future scope | Yes | G. REVIEW MANUALLY | No | Không giữ chỉ vì future feature; cần quyết định retire endpoint cũ và external caller. |
| `GET /api/public/rooms` | Public API endpoint | Không có caller FE hiện hành; FE dùng `/api/v1/public/rooms` | Public Marketplace V1 | Yes | G. REVIEW MANUALLY | No | Có API V1 thay thế, nhưng public endpoint có thể được nhúng ngoài repo. |
| `POST /api/public/viewing-requests` | Public API endpoint | Không tìm thấy caller FE hiện hành | Không có viewing scheduler hiện hành; contact request V1 khác semantics | Yes | G. REVIEW MANUALLY | No | Không được coi contact request là replacement tương đương lịch xem; cần quyết định API retirement/external callers. |
| `/api/admin/accounts` GET/POST/PATCH | API endpoint family | `frontend/src/app/admin/accounts/page.tsx` | Chưa migrate Account Admin | Yes | A. KEEP CURRENT | No | Active UI đọc/tạo/cập nhật account qua các route này. |
| `/api/tenants` GET/list+detail | API endpoint family | `/admin/accounts` gọi GET list; legacy orphan tenant management không được tính là consumer | `/api/v1/residents` cho Resident/Occupancy | Yes | A. KEEP CURRENT | No | GET list đang cung cấp Tenant options cho Account Admin; endpoint family có handler cũ. |
| `/api/tenants` POST/PATCH/DELETE | API handler family | Không tìm thấy Current FE caller cho mutation | Resident/Occupancy V1 | Yes | G. REVIEW MANUALLY | No | Legacy CRUD có thể được thay bằng Resident V1 nhưng route còn expose; phải tách khỏi GET đang dùng và xác định compat. |
| `/api/properties` middleware 410 | Retired API endpoint | Không có old FE caller; V1 Property callers đã chuyển | `/api/v1/properties` | Yes (returns 410) | B. KEEP FOR COMPAT | No | Giữ phản hồi retirement rõ ràng cho client cũ; không cần handler CRUD cũ. |
| `/api/rooms` middleware 410 | Retired API endpoint | Không có old FE caller; V1 Room callers đã chuyển | `/api/v1/properties/:id/rooms` | Yes (returns 410) | B. KEEP FOR COMPAT | No | Explicit old-path behavior; giữ stub cho tới policy retirement riêng. |
| `/api/contracts` middleware 410 | Retired API endpoint | V1 Contract callers hiện hành | `/api/v1/contracts` | Yes (returns 410) | B. KEEP FOR COMPAT | No | Giữ stub; các handler cũ bên dưới không reachable và được liệt kê riêng. |
| `POST /api/contracts` old body | Backend handler | Không có; bị middleware trả 410 trước | `/api/v1/contracts` | No | E. REMOVE SAFE | Yes | Handler body không thể chạy do middleware mount trước; không có route-level test/script consumer old path. |
| `PATCH /api/contracts/:id` old body | Backend handler | Không có; bị middleware trả 410 trước | `/api/v1/contracts/:id` | No | E. REMOVE SAFE | Yes | Dead body sau middleware 410; giữ middleware độc lập. |
| `DELETE /api/contracts/:id` old body | Backend handler | Không có; bị middleware trả 410 trước | V1 Contract lifecycle/archive | No | E. REMOVE SAFE | Yes | Dead body sau middleware 410. |
| `GET /api/contracts` old body | Backend handler | Không có; bị middleware trả 410 trước | `/api/v1/contracts` | No | E. REMOVE SAFE | Yes | Dead body sau middleware 410. |
| `/api/invoices` middleware 410 | Retired API endpoint | FE hiện dùng `/api/v1/invoices`; test đảm bảo không gọi old path | `/api/v1/invoices` | Yes (returns 410) | B. KEEP FOR COMPAT | No | Test `invoiceApi.test.ts` xác nhận không gọi old URL; stub nêu retired behavior rõ. |
| `POST /api/invoices` old body | Backend handler | Không có; bị middleware trả 410 trước | `/api/v1/invoices` | No | E. REMOVE SAFE | Yes | Dead handler chấp nhận total client-supplied; comment nguồn xác nhận đã retire. |
| `PATCH /api/invoices/:id` old body | Backend handler | Không có; bị middleware trả 410 trước | V1 draft meter/finalize APIs | No | E. REMOVE SAFE | Yes | Dead body sau middleware 410. |
| `DELETE /api/invoices/:id` old body | Backend handler | Không có; bị middleware trả 410 trước | Không có delete tương đương cần thiết | No | E. REMOVE SAFE | Yes | Dead body sau middleware 410. |
| `GET /api/invoices` old body | Backend handler | Không có; bị middleware trả 410 trước | `/api/v1/invoices` | No | E. REMOVE SAFE | Yes | Dead body sau middleware 410. |
| `GET/POST/PATCH/DELETE /api/amenities` | API endpoint family | `/admin/amenities` direct route | Không equivalent confirmed; Service pages là pricing/service domain, Facility UI/API gap còn mở | Yes | G. REVIEW MANUALLY | No | Model/field cũ không khớp Prisma V1.8 theo Service audit; cần quyết định retire hoặc implement Facility, không gọi là migrated. |
| `GET/POST/PATCH/DELETE /api/amenity-bookings` | API endpoint family | `/admin/bookings` direct route | Không có old booking replacement; future Resident requests là scope riêng | Yes | F. REMOVE AFTER REPLACEMENT/RETIREMENT | No | Legacy Pool/Gym booking không phải product authority. Phải retire page/API cùng nhau; không để giữ chỉ vì future scope. |
| `GET/PATCH/DELETE /api/viewing-requests` | API endpoint family | Chỉ orphan component không render | Deferred `/admin/viewings`; current page không gọi route | Yes | G. REVIEW MANUALLY | No | Không giữ mặc định vì tương lai, nhưng cần kiểm tra external caller trước khi loại bỏ. |
| `GET/POST/PATCH/DELETE /api/maintenance-requests` | API endpoint family | Chỉ orphan complaints component không render; tenant portal dùng V1 | Deferred `/admin/complaints`; Resident request chưa implement | Yes | G. REVIEW MANUALLY | No | Legacy complaint/maintenance semantics khác feature future; kiểm tra external caller và retire chính thức sau quyết định sản phẩm. |
| `GET /api/options/landlords` | API endpoint | Không tìm thấy FE/script caller hiện hành | Không cần sau Account Admin V1 migration | Yes | G. REVIEW MANUALLY | No | Không có consumer nội repo, nhưng là route reachable; external use chưa xác minh. |
| `GET /api/options/tenants` | API endpoint | `/admin/bookings` và orphan complaint workflow source | Khi page retire, V1 Resident picker tương lai | Yes | F. REMOVE AFTER REPLACEMENT/RETIREMENT | No | Hiện page Booking gọi; handler không còn cần sau retire page/API cũ. |
| `GET /api/options/rooms` | API endpoint | `/admin/bookings` và orphan complaint workflow source | V1 Room selector tương lai | Yes | F. REMOVE AFTER REPLACEMENT/RETIREMENT | No | Hiện page Booking gọi; orphan component không phải runtime consumer. |
| `GET /api/options/available-rooms` | API endpoint | Không tìm thấy FE/script caller hiện hành | V1 Room API nếu có nhu cầu | Yes | G. REVIEW MANUALLY | No | No repo consumer là bằng chứng dead-in-repo, chưa loại trừ external use. |
| `GET /api/options/properties` | API endpoint | `/admin/amenities` | V1 Property picker trong Service/Property flows | Yes | G. REVIEW MANUALLY | No | Old page gọi; cần đi cùng quyết định Facility/Amenities. |
| `GET /api/options/contracts` | API endpoint | Không tìm thấy FE/script caller hiện hành | V1 Contract API nếu có nhu cầu | Yes | G. REVIEW MANUALLY | No | Route reachable, không có consumer nội repo; chưa chứng minh safe removal. |
| `GET /api/options/amenities` | API endpoint | `/admin/bookings` | Không có booking replacement | Yes | F. REMOVE AFTER REPLACEMENT/RETIREMENT | No | Chỉ cấp option cho legacy Amenity booking flow. |

**`app.ts` retired-handler result:** bốn middleware 410 mounts — Properties, Rooms, Contracts, Invoices — vẫn reachable và nên giữ để trả retired response. Dưới Contracts/Invoices có chính xác **8 CRUD handler body** (POST/PATCH/DELETE/GET mỗi nhóm) không thể chạy vì thứ tự middleware; các body này là **REMOVE SAFE**. Không tìm thấy CRUD body legacy cho Properties/Rooms phía sau stub. Không gỡ 410 middleware trong cùng thao tác cleanup.

### 2.4 Support code và current assets ngoài `legacy/` — 6 item

| Path / Route | Type | Current Consumer | Replacement | Reachable? | Classification | Safe To Remove? | Reason |
|---|---|---|---|---|---|---|---|
| `backend/src/contract-documents/object-storage.ts` — `UnconfiguredObjectStorage` | Compatibility/fail-closed adapter | Wired in `backend/src/app.ts` for current Contract document service | Real object storage chưa configured | Yes | A. KEEP CURRENT | No | Adapter `available=false`, throw rõ ràng khi stage/read; giữ boundary fail-closed cho feature binary storage đang blocked. |
| `backend/src/contract-documents/object-storage.ts` — `FakeObjectStorage` | Test adapter | Contract document unit tests | Không phải production storage | Test reachable only | A. KEEP CURRENT | No | Được unit tests dùng; file comment cấm wiring production. Không phải fake runtime data. |
| `database/seeds/seed.ts` | DEV/test seed | Explicit seed command/configuration | PostgreSQL V1.8 current DB | Yes, khi chạy seed chủ động | A. KEEP CURRENT | No | Sample records và `DEMO-SEED` thuộc explicit DEV seed; không phải production persistence. Không chạy seed trong audit. |
| `goc_tro_logo_new_style.svg` | Master brand asset | Docs redesign/visual-QA reference | Current derivative ở `frontend/public/assets/goc-tro-logo-newstyle.svg` | Yes, source/reference | D. KEEP HISTORICAL/REFERENCE | No | Source artwork được report thiết kế dẫn; không trùng path với asset runtime. |
| `frontend/public/logo-goc-tro.png` | Current public/portal asset | Homepage, Tenant portal, room listing/detail | N/A | Yes | A. KEEP CURRENT | No | Được các trang public/resident hiện hành tham chiếu path tuyệt đối. |
| `frontend/public/assets/logo-goc-tro-mark.png` | Current placeholder asset | Public room card/gallery | N/A | Yes | A. KEEP CURRENT | No | Dùng cho trạng thái ảnh trống/lỗi ở hai component. |
| `frontend/public/assets/goc-tro-logo-newstyle.svg` | Current Admin/login asset | Admin shell, Login | Root master artwork | Yes | A. KEEP CURRENT | No | Được dùng trong navigation/login brand. |

**Count:** 2 support paths (`object-storage.ts` và `database/seeds/seed.ts`) + 4 asset paths = 6 items. Hai adapter trong `object-storage.ts` được tính cùng một path.

### 2.5 Count convention

- `legacy/`: 18 distinct paths.
- Frontend page/component: 10 paths.
- Backend route families, gồm route properties/rooms/contracts/invoices 410: 23 logical groups.
- Dead handler bodies dưới hai nhóm Contracts/Invoices: 8 handler items riêng.
- Support code: 2 paths (`object-storage.ts` tính một item, `database/seeds/seed.ts` một item).
- Current/master assets ngoài `legacy/`: 4 paths.
- **Tổng 65**. Các method handlers trong nhóm API CRUD không đếm lặp như từng inventory item; tám function bodies phía sau 410 được tách riêng để có disposition chính xác.

## 3. Frontend legacy routes and replacement status

- Sidebar hiện không link `/admin/amenities` hoặc `/admin/bookings`, nhưng cả hai là Next App Router page nên truy cập URL trực tiếp được.
- `/admin/amenities` gọi `/api/amenities` và `/api/options/properties`. Service Current State xác nhận legacy Amenity không phải Facility/Fixed/Flexible pricing V1.8, đồng thời Facility UI/API hiện vẫn thiếu. Do đó đây **không phải chức năng đã migrate hoàn toàn**; quyết định nên là manual review: retire old Admin page/API hay xây Facility management.
- `/admin/bookings` gọi `/api/amenity-bookings` và option APIs. Service IA report ghi old pages/data chưa bị xóa chỉ vì bỏ navigation; product decision xác nhận Amenity booking/calendar không phải authority hiện tại và Resident future scheduling là scope khác. Đề nghị retire route/API cũ đồng bộ, nhưng chưa an toàn xóa route ngay vì URL/API hiện vẫn reachable.
- `/admin/viewings` và `/admin/complaints` vẫn là route hiện hành nhưng render lock screens. Tests bảo đảm các screen không import workflow cũ hoặc gọi old API.
- `service-overview.tsx` và `tenant-management.tsx` là orphan code, không được route/import dùng; là hai file source safe-remove. `service-overview` có CSS selectors cũ cần xử lý cùng cleanup CSS.
- `DataManagement` vẫn được các Amenity/Booking pages sử dụng; không xóa cho tới khi các route đó retired. Component này cũng được hai workflow source không render sử dụng.
- `/admin/accounts` vẫn hoạt động theo unversioned endpoints; đây là gap/migration current chứ không phải orphan.

## 4. Backend unversioned routes and consumers

Route consumer evidence từ repository:

| Group | Current FE/script evidence | Disposition |
|---|---|---|
| `/api/v1/auth/*` | Shared auth provider/API client và auth tests | Current replacement cho old `/api/auth/*` |
| `/api/auth/*` | Không có Current FE path; legacy Next dùng V1; old legacy app dùng sessionStorage chứ không gọi backend route này | Manual review do external clients/session compatibility unknown |
| `/api/v1/public/rooms` | `publicRoomApi.ts`, homepage/list/detail, route/API tests | Current replacement cho old public rooms |
| `/api/public/rooms` | Không có current FE caller | Manual review vì public API external callers chưa kiểm kê |
| `/api/public/viewing-requests` | Không có current FE caller; contact-request V1 là lead/contact, không phải schedule | Manual review; không coi API khác semantics là replacement |
| `/api/admin/accounts` | `/admin/accounts` GET/POST/PATCH | Keep current |
| `/api/tenants` | `/admin/accounts` gọi GET list để chọn resident account; old tenant component không render | GET giữ hiện tại; CRUD mutation handler manual review/migrate |
| `/api/amenities`, `/api/options/properties` | Direct `/admin/amenities` page | Review manually; Facility gap còn mở |
| `/api/amenity-bookings`, `/api/options/tenants`, `/api/options/rooms`, `/api/options/amenities` | Direct `/admin/bookings` page; option calls từ page | Retire cùng legacy booking page; not future scheduling authority |
| `/api/viewing-requests` | Chỉ legacy workflow component orphan | Manual review external caller; current page lock |
| `/api/maintenance-requests` | Chỉ complaints legacy component orphan; tenant portal V1 | Manual review external caller; current page lock |
| `/api/options/landlords`, `/api/options/available-rooms`, `/api/options/contracts` | Không có FE/script consumer tìm thấy | Manual review, không tự xóa chỉ từ no in-repo ref |
| `/api/properties`, `/api/rooms`, `/api/contracts`, `/api/invoices` | Current FE gọi V1; invoice test phủ định old path | Keep explicit 410 compatibility stubs |

Tất cả route unversioned nằm phía dưới `/api/v1` mount trong `backend/src/app.ts`; chúng vẫn có thể được gọi trực tiếp trừ old Properties/Rooms/Contracts/Invoices bị 410 middleware chặn.

## 5. 410 dead-handler audit

| Old path | Handler body reachable? | Current old-path caller? | Handler disposition | 410 stub disposition |
|---|---|---|---|---|
| `/api/properties` | Stub reachable; không có CRUD body legacy sau stub | Không | Chỉ giữ middleware | KEEP FOR COMPAT |
| `/api/rooms` | Stub reachable; không có CRUD body legacy sau stub | Không | Chỉ giữ middleware | KEEP FOR COMPAT |
| `/api/contracts` | Stub reachable; 4 old bodies unreachable | Không | Remove POST, PATCH `/:id`, DELETE `/:id`, GET bodies | KEEP FOR COMPAT |
| `/api/invoices` | Stub reachable; 4 old bodies unreachable | Không; frontend test xác nhận V1 path | Remove POST, PATCH `/:id`, DELETE `/:id`, GET bodies | KEEP FOR COMPAT |

Không có code test/script nào yêu cầu old CRUD bodies. User-facing old URLs nhận HTTP 410 từ middleware đặt trước; body cũ không thể hoạt động. Remove code bodies không đồng nghĩa retire API behavior; explicit 410 vẫn được giữ.

## 6. Complaint and viewing workflows

- Current Admin pages chỉ cần deferred/locked screen; `service-workspace.test.ts` render screen và kiểm tra không xuất hiện `/api/viewing-requests`, `/api/maintenance-requests` hay workflow actions.
- `legacy-viewing-requests-workflow.tsx` là orphan source, ghi trong Current State là preserved. Phân loại **historical/reference**, không runtime dependency.
- `legacy-complaints-workflow.tsx` là orphan source, cũng được Current State ghi nhận là retained; phân loại **historical/reference**.
- Backend `/api/viewing-requests` và `/api/maintenance-requests` còn live nhưng không có current FE consumer. Không nên giữ vì giả định future; future Resident request/scheduling cần design/API riêng. Do chưa audit external integrations, hai route được manual review trước khi retire.
- `/api/tenant-portal/requests` tạo maintenance request cũ nhưng không có current FE consumer; cũng cần external compatibility review, không coi như implementation của future flow.
- `/api/public/viewing-requests` là lịch xem marketplace; không đồng nhất nó với Admin viewing-request list hoặc public contact request V1.

## 7. Mock/demo/localStorage audit

| Occurrence | Runtime scope | Classification | Current production risk |
|---|---|---|---|
| `legacy/index.html`: `localStorage.gt_data_v2` | Standalone legacy browser demo only | LEGACY DEMO | Không có Current Next reference; rủi ro nếu demo server bị public hóa, không phải production persistence |
| `legacy/index.html`: `sessionStorage.gt_user`, `gt_auth` | Demo-only fake auth/session | LEGACY DEMO | Không thay thế Auth V1; không có Current Next reference |
| `legacy/role-user.js`: `localStorage.gt_room_reports` | Legacy demo report persistence | LEGACY DEMO | Không có Current FE caller |
| `legacy/settings-demo.js`: storage sync + `/api/demo/*` | Legacy settings UI | LEGACY DEMO | Không phải Current API/data flow |
| `legacy/server.js` + `demo-database.json` | Standalone JSON fake DB/API | LEGACY DEMO | Chỉ qua `npm run legacy:dev`; demo password hash dùng SHA-256, wildcard CORS. Không production safe |
| `database/seeds/seed.ts` (`DEMO-SEED`, sample rows) | Explicit DB seed | DEV/TEST ONLY | Không tự chạy khi app render/request; không phải runtime fake DB |
| `backend/src/contract-documents/object-storage.ts` Fake adapter | Unit test only; explicit tests instantiate it | TEST ONLY | `app.ts` wires `UnconfiguredObjectStorage`, not fake; production runtime is fail-closed |
| Current `frontend/src`, `backend/src` | Repository search for `localStorage`/`sessionStorage` runtime usage | Không tìm thấy current product persistence occurrence | Không có bằng chứng production flow hiện hành dựa trên browser local/session storage |

Search `mock/fake/sample/demo` cũng thấy fixtures trong test files, DEV seed và explicit runtime helpers. Không phân loại test fixtures là production data. Backend typecheck diagnostics 174 là legacy debt theo Current State, không tự động chứng minh từng diagnostic dead code; Step 5 sẽ phân tích riêng.

## 8. Asset audit

| Asset | Reference evidence | Classification | Remove decision |
|---|---|---|---|
| `legacy/logo-goc-tro.png` | `legacy/index.html`; byte-identical current public copy is separately used | USED LEGACY DEMO | Keep with demo until demo archive decision |
| `legacy/logo-goc-tro-mark.png` | No path-specific runtime reference; not same use/path as current public mark | REVIEW MANUALLY | Candidate, not safe remove without archive decision |
| `legacy/foxi.svg` | `legacy/index.html` resident panel/Foxi widget | USED LEGACY DEMO | Keep with demo |
| `legacy/foxi_mascot_concept.svg` | No runtime source reference | REFERENCE ONLY | Archive/manual decision; not definite deletion |
| `legacy/nhan_dien_thuong_hieu.jpg` | Referenced by core redesign report | REFERENCE ONLY | Keep as source reference |
| `frontend/public/logo-goc-tro.png` | Homepage, room pages, Tenant portal | USED CURRENT | Keep |
| `frontend/public/assets/logo-goc-tro-mark.png` | Public room card/gallery fallback components | USED CURRENT | Keep |
| `frontend/public/assets/goc-tro-logo-newstyle.svg` | Admin shell and login | USED CURRENT | Keep |
| Root `goc_tro_logo_new_style.svg` | Master/source referenced by redesign and QA reports | REFERENCE ONLY | Keep source artwork |

**Assets safe to remove now:** 0. There is an unreferenced legacy mark candidate and a concept SVG, but reference/archive disposition is not established. The legacy logo is used by the standalone app.

## 9. Dependency and reachability evidence

- `package.json` defines the only discovered runnable legacy entry as `legacy:dev`; `legacy/server.js` links its `index.html`, `styles.css`, `role-user.js`, `app-fixes.js`, `settings-demo.js`, `foxi.js`, and `ui-refinements.js`. The JSON file is read/written by the server.
- The four wireframes have no import/script reference; they remain directly viewable as historical HTML assets.
- Current FE consumer checks: Accounts calls `/api/admin/accounts` + GET `/api/tenants`; Amenities and Bookings page definitions call old endpoints directly; current complaints/viewings route files render deferred screens; `DataManagement` is imported by only those two pages and the two unrendered legacy workflow components.
- Current Service sidebar/test evidence: one Service entry, four child sections; Amenities/Bookings absent from sidebar. The IA report explicitly says their pages/data were not deleted when navigation was removed.
- Invoice test explicitly asserts old `/api/invoices` path is not used; it does not prove absence of external callers.
- `backend/src/app.ts` middleware order proves Contracts/Invoices old CRUD handlers cannot be reached. There are 4 bodies per domain (8 total). Properties/Rooms only have 410 middleware; no bodies behind them.
- Tests for complaints/viewings test deferred screen output and no legacy API references; no runtime test imports the two old workflow components. Fake storage is exercised only by focused unit tests.
- Root `AGENTS.md` says reports are evidence, canonical product/database sources retain authority. This audit does not promote any old endpoint to current contract.

## 10. KEEP / REMOVE disposition summary

| Classification | Exact scope |
|---|---|
| A. KEEP CURRENT (10) | Deferred current complaint/viewing route pages; current Accounts page; `/api/admin/accounts`; current GET tenant option/read path; object-storage boundary/test adapter path; explicit dev seed; three current FE logos |
| B. KEEP FOR COMPAT (4) | Middleware 410 stubs `/api/properties`, `/api/rooms`, `/api/contracts`, `/api/invoices` |
| C. KEEP LEGACY DEMO (11) | `legacy/server.js`, `index.html`, `demo-database.json`, `styles.css`, `role-user.js`, `app-fixes.js`, `settings-demo.js`, `foxi.js`, `ui-refinements.js`, `foxi.svg`, `logo-goc-tro.png` |
| D. KEEP HISTORICAL/REFERENCE (9) | Four wireframes, brand board, Foxi concept; two old complaint/viewing workflow source files; master root logo art |
| E. REMOVE SAFE (10) | `service-overview.tsx`, `tenant-management.tsx`; 8 unreachable Contracts/Invoices handler bodies listed in §5 |
| F. REMOVE AFTER REPLACEMENT/RETIREMENT (6) | `/admin/bookings`, `DataManagement`, old `/api/amenity-bookings`, its three option dependencies; this count includes route/API/options and shared component; retire/replace route before removing |
| G. REVIEW MANUALLY (15) | Legacy logo mark; `/admin/amenities` + `/api/amenities`; `/api/tenants` mutations; old Auth 3-route family; tenant portal summary/request; public rooms/viewing request; old viewing/maintenance endpoints; options landlords/available rooms/contracts/properties. |

**Disposition counts are reconciled in §14.** The Amenity page is manual review (G), and the Booking page is retirement candidate (F).

## 11. Exact safe-remove set

Only the following items meet the in-repository safe-removal evidence threshold:

### Frontend source files (2)

1. `frontend/src/app/admin/services/service-overview.tsx` — no import/route/test consumer; `/admin/services` redirects to Utilities. Remove its stale CSS selectors in `frontend/src/app/globals.css` in the same future cleanup change, then typecheck/build.
2. `frontend/src/app/tenants/tenant-management.tsx` — no import/route; current Resident page lives at `/admin/tenants` and uses V1 API.

### Backend handler bodies (8)

1. `POST /api/contracts`
2. `PATCH /api/contracts/:id`
3. `DELETE /api/contracts/:id`
4. `GET /api/contracts`
5. `POST /api/invoices`
6. `PATCH /api/invoices/:id`
7. `DELETE /api/invoices/:id`
8. `GET /api/invoices`

Remove only those bodies. Keep all four 410 middleware stubs for now. The route stubs and code are not deleted in Step 4.

**Safe set: 2 source files + 8 function bodies = 10 removable units.** No asset or complete API route is safe for removal now.

## 12. Compatibility set

- Keep `/api/properties`, `/api/rooms`, `/api/contracts`, `/api/invoices` 410 stubs. Current callers use V1; the old paths explicitly communicate retirement.
- Keep current `/api/admin/accounts` + the GET tenant list needed by the Accounts UI until that domain migrates.
- Keep the object storage boundary; current `UnconfiguredObjectStorage` intentionally fails closed and documents a real Contract document-storage blocker. Keep `FakeObjectStorage` as test-only support.
- Keep explicit seed/sample data as DEV/TEST fixtures; do not confuse it with app runtime persistence.
- The legacy demo can be isolated from current runtime, but its `legacy:dev` script and all linked files form one runnable demo bundle. Do not selectively remove linked assets/scripts while retaining that entry point.

## 13. Manual-review set

Before any future deletion/route retirement, decide:

1. `/admin/amenities`: retire old generic Amenity management or create a supported Facility admin flow. Current Fixed/Flexible/Utilities pages are not direct replacements for `property_facilities`; Service audit identifies this gap.
2. Legacy Account/Admin and tenant mutation APIs: migrate `/admin/accounts`; split GET `/api/tenants` still consumed from old POST/PATCH/DELETE handlers before deleting any shared route family.
3. Old Auth, tenant portal, public rooms/viewing, viewing-request, maintenance-request and option endpoints: no Current FE caller was found for listed obsolete paths, but external integrations are unknown. Confirm external caller policy/API exposure before removal.
4. `legacy/logo-goc-tro-mark.png` and `legacy/foxi_mascot_concept.svg`: decide archive/reference retention.
5. Whole `legacy/` retirement: decide whether to preserve a runnable demo, archive its source, or remove it as a separate explicit operation. Current UI replaces much of the visible workflow, but data/model parity is not complete for Complaints/Amenities/Resident scheduling; therefore “fully replaced” is not established.

## 14. Count summary — reconciled unique inventory

| Inventory group | Items |
|---|---:|
| `legacy/` distinct file paths | 18 |
| Frontend pages/components | 10 |
| Backend unversioned route families (GET/mutation `/api/tenants` split by disposition) | 23 |
| Dead handler bodies behind 410 | 8 |
| Support code paths | 2 |
| Current/master assets outside `legacy/` | 4 |
| **Total** | **65** |

Classification totals reconcile by inventory row:

| Classification | Count |
|---|---:|
| KEEP CURRENT | 10 |
| KEEP FOR COMPAT | 4 |
| KEEP LEGACY DEMO | 11 |
| KEEP HISTORICAL/REFERENCE | 9 |
| REMOVE SAFE | 10 |
| REMOVE AFTER REPLACEMENT/RETIREMENT | 6 |
| REVIEW MANUALLY | 15 |
| **Total** | **65** |

Breakdown: legacy (11 C, 6 D, 1 G); frontend (3 A, 2 D, 2 E, 2 F, 1 G); API families (2 A, 4 B, 4 F, 13 G); dead handler bodies (8 E); support (2 A); other assets (3 A, 1 D). Thus 2 source files + 8 handler bodies are safe-removal units; 4 retirement stubs stay; no whole route family or asset is safe to remove now.
## 16. Exact Step 5 input

**Step 5 — Backend Typecheck Diagnostic Review**

Input:

- **174 backend diagnostics** currently recorded in `docs/00_CURRENT_STATE.md`.
- Legacy drift findings in this report, especially old Prisma model/field references in unversioned handlers and any diagnostic in routes behind 410.

Goal: classify each diagnostic as accepted legacy debt, dead-handler diagnostic removable with a later approved cleanup, or a real current-backend defect that must be fixed before push. Inspect actual current compiler output before classification; the 174 value is the repository checkpoint and was not rerun in Step 4. **Step 5 was not performed.**

## 17. Completion / limits

- Step 4 audit completed from current path/import/route/test/script/document references; no tests or database operations were run.
- No source, API, DB, Prisma, frontend behavior or business rule was changed. No deletion/stage/commit/push was performed.
- External callers cannot be ruled out by repository searches; endpoints marked G require compatibility review before retirement.
- Inventory counts and category totals reconcile to 65 unique items. The safe-removal exact list is 2 source files + 8 dead handler bodies.



