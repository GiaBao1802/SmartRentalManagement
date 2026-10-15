# Báo cáo redesign SaaS UI/UX các module cốt lõi

- Ngày: 2026-10-11
- Phạm vi: frontend Auth, Property/Room, Resident/Occupancy và Resident portal.
- Trạng thái: `REFERENCE` — giao diện đã được cập nhật; runtime smoke toàn bộ màn admin còn chờ backend/PostgreSQL local khả dụng.
- Nguồn đối chiếu: brand board trong `legacy/nhan_dien_thuong_hieu.jpg`, hai logo trong `legacy/`, UI hiện tại, các API helper frontend và backend repository chỉ đọc để xác nhận dữ liệu hiển thị.

## Nhận diện thương hiệu

- Brand board: `legacy/nhan_dien_thuong_hieu.jpg`.
- Logo ngang dùng cho login/sidebar/portal: `legacy/logo-goc-tro.png` → `frontend/public/logo-goc-tro.png` (asset đã có sẵn; SHA-256 trùng file gốc).
- Logo mark dùng ở chân sidebar: `legacy/logo-goc-tro-mark.png` → `frontend/public/assets/logo-goc-tro-mark.png` (copy nguyên byte; SHA-256 trùng file gốc).
- Không đưa brand board vào static production assets, không sửa file gốc và không recolor logo.
- Design tokens: xanh khung hệ thống `#0F6B4A`, cam CTA `#E67E22`, vàng nhấn `#FFD38A`, nền workspace `#FFF9F2`, chữ chính `#1F2937`, neutral `#94A3B8`; màu success/warning/danger dùng semantic riêng.
- Typography tiếp tục dùng Be Vietnam Pro đã được tải qua `next/font/google`; không thêm package/font mới.

## Giao diện đã cập nhật

- Shared shell: chuyển điều hướng admin từ thanh ngang sang sidebar xanh cố định, có nhóm mục, trạng thái active, logo thật và topbar tên trang/tài khoản/đăng xuất. Màn nhỏ dùng drawer có nút mở, trạng thái `aria-expanded`, scrim và tự đóng khi điều hướng.
- Shared UI: token màu, hierarchy tiêu đề, khoảng cách, button, form control/focus, card, table, badge semantic, empty/loading/error presentation và pagination được thống nhất bằng CSS hiện hữu; không thêm UI framework.
- Auth: login có panel thương hiệu, logo thật, form gọn, CTA cam; giữ nguyên xử lý login, redirect, lỗi và session.
- Property/Room: giữ nguyên layout nghiệp vụ và các lớp chức năng; chuẩn màu CTA, filter, bảng, trạng thái, focus; bỏ inline style ở search form và dùng class dùng lại. Context khu vực/phòng, capacity và current Contract tiếp tục lấy từ response hiện có.
- Resident/Occupancy: chuẩn hóa bảng/filter/form/modal/status; thống kê theo trang giữ nhãn rõ phạm vi. Chi tiết hiển thị hồ sơ, nơi ở, hợp đồng, lịch sử và thao tác theo nhóm. Panel kết thúc lượt ở nêu rõ cư dân, phòng, ngày hiệu lực và hậu quả giữ nguyên hồ sơ/lịch sử. Không thay đổi request hay hành vi add/transfer/end/archive. `left` chỉ hiện “Chưa lưu trú” khi trang chi tiết có lịch sử rỗng; nếu thiếu lịch sử thì fallback “Đã rời đi”. `residence_status` tiếp tục chỉ đọc từ backend.
- Resident portal: cùng nền, card, typography và status badge với admin; chỉ trình bày nơi ở/hợp đồng/registration đang có từ API, không thêm tính năng giả.
- Responsive/accessibility: sidebar drawer và form/card phù hợp màn nhỏ; bảng giữ horizontal scroll; duy trì label, tên nút, `aria-current`, focus-visible và status có chữ đi kèm màu.

## Files thay đổi

- `frontend/src/app/components/admin-shell.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/app/login/login-form.tsx`
- `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx`
- `frontend/src/app/admin/tenants/resident-management.tsx`
- `frontend/src/app/admin/tenants/[residentId]/resident-detail.tsx`
- `frontend/src/app/tenant/tenant-portal.tsx`
- `frontend/public/assets/logo-goc-tro-mark.png` (asset copy nguyên bản)
- `docs/06_frontend/design/CORE_MODULES_SAAS_REDESIGN_REPORT.md`
- `docs/DOCUMENT_CATALOG.md`

## Validation và giới hạn

| Kiểm tra | Kết quả |
|---|---|
| Frontend typecheck | PASS — `npm run typecheck` |
| Frontend API tests | PASS — 5/5 (`npm run test:api`) |
| Production build | PASS — `npm run build --workspace=@goctro/frontend`; Next.js compile, TypeScript và static page generation hoàn tất. |
| Browser login responsive | Quan sát được trang login với bố cục mobile khoảng 360 px, logo, panel thương hiệu, label và CTA. Không submit form. |
| Browser desktop/admin | Chưa xác nhận. Route admin trả trạng thái kiểm tra phiên; browser smoke không có phiên đăng nhập hợp lệ. Không dùng dữ liệu tự điền trong trình duyệt. |
| API/DB và các luồng ghi add/transfer/end | Chưa chạy. Startup launcher báo PostgreSQL `localhost:5432` không reachable, nên không bật app stack và không chạy thao tác ghi. |
| Backend/API/Database/Prisma/migration/seed | Không sửa. |
| Business logic | Không sửa handler, API helper/contract hoặc rule nghiệp vụ. API contract test hiện có PASS; E2E regression đầy đủ chưa xác nhận do runtime blocker. |

## Các khoảng trống còn lại

- Cần chạy lại production build và browser smoke desktop/admin sau khi môi trường Next/SWC truy cập được workspace path và PostgreSQL 18 local hoạt động.
- Chưa xác nhận trực quan flow add/transfer/end occupancy, Property/Room interactions và logout qua browser trong lượt này.

## UI ALIGNMENT / LAYOUT POLISH

- Ngày: 2026-10-11.
- Phạm vi: căn chỉnh layout và spacing cho Auth, Property/Room, Resident/Occupancy và Resident portal; giữ nguyên các token màu nhận diện, nội dung nghiệp vụ và hành vi hiện có.
- Room toolbar: trước đây ô tìm mã phòng bị giới hạn 280px, trạng thái nằm tách khỏi cụm tìm kiếm và hint khiến hàng lọc thiếu trục căn chỉnh. Đã gom search, nút tìm, clear và trạng thái thành một nhóm; ô tìm kiếm co giãn chiếm phần lớn chiều rộng, trạng thái giữ 220px trên desktop, nút clear vẫn là secondary và chỉ hiện theo điều kiện sẵn có. CTA “Thêm phòng” tiếp tục ở header; tạo hàng loạt vẫn trong modal, tách khỏi filter.
- Property toolbar: dùng cùng nhịp control 40px, căn cuối hàng theo baseline; từ tablet trở xuống chuyển thành 2 cột và đưa search/action thành hàng riêng, mobile xếp dọc.
- Resident toolbar: các bộ lọc cư trú, đăng ký lưu trú, khu vực và phòng dùng lưới chung; action căn phải trên desktop, xuống hàng tablet/mobile. Tra cứu CCCD vẫn là card riêng và giữ nguyên flow privacy hiện có.
- Shared polish: chuẩn button trong admin về 40px để khớp input/select; page heading và CTA căn giữa theo trục; khoảng cách form/modal, detail grid và bảng được thống nhất; bảng vẫn scroll ngang trong vùng bảng; context khu vực/phòng giữ gọn ở header và back row.
- Responsive: các layout filter dùng breakpoint 1100px, 760px, 600px và 360px; ở 360px Room search/status/actions xếp dọc, table giữ cuộn ngang riêng. Browser đo login tại viewport 360px: document width 345px, không vượt viewport. Chưa đo trực tiếp các route admin vì Room route chuyển về login khi không có phiên.
- Kiểm tra browser: login tại `http://localhost:3000/login` render được; truy cập trực tiếp `/admin/properties/11/rooms` chuyển đến `/login?next=...`, nên không có quyền truy cập để xem Property/Room/Resident detail và portal dưới phiên cư dân. Không nhập thông tin đăng nhập được lưu trong trình duyệt.
- Automated validation: frontend API tests PASS 5/5; `npm run typecheck --workspace=@goctro/frontend` PASS; `npm run build --workspace=@goctro/frontend` PASS khi chạy ngoài sandbox do SWC bị Windows chặn canonicalize workspace path trong sandbox.
- Files được chỉnh trong pass này: `frontend/src/app/globals.css`, `frontend/src/app/admin/properties/page.tsx`, `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx`, `frontend/src/app/admin/tenants/resident-management.tsx`, và report này.
- Backend modified: NO. Database/Prisma modified: NO. API, request/response mapping, validation nghiệp vụ, auth và business logic modified: NO.
- Khoảng trống còn lại: visual browser smoke từng route admin, form, occupancy action và portal cần một phiên phù hợp cùng backend runtime khả dụng; build/typecheck/API helper tests không thay thế xác minh đó.

## FINAL VISUAL BROWSER SMOKE

- Ngày: 2026-10-11.
- Trạng thái: `BLOCKED` — UI baseline **NOT LOCKED**.
- Runtime recheck: chạy `npm run dev:all` trong task này; preflight trả `POSTGRES_NOT_REACHABLE` cho `localhost:5432` và xác nhận script không khởi động/dừng database. Browser hiện mở được `http://localhost:3000/login`, nhưng mở endpoint `http://localhost:4000/api/health` bị `net::ERR_BLOCKED_BY_CLIENT`. HTTP probes từ shell cũng bị giới hạn socket của sandbox, nên không dùng kết quả đó để kết luận trạng thái service trên host người dùng. Kết luận hiện tại: launcher check FAIL trong execution environment; backend/DB host health chưa xác minh độc lập.
- Login/session: chưa thực hiện. Không xác nhận được CSRF/backend từ browser, vì vậy chưa submit login hoặc đánh giá Admin session; không tạo fake session, không nhập credential.
- Browser visual: login route tải được; dừng trước visual smoke theo điều kiện runtime của task. Chưa xác nhận shell, Property, Room, Resident list/detail hoặc occupancy action. Không đánh dấu PASS từ source hay lần quan sát trước.
- Responsive: 1440px, 1024px, 768px, 360px cho các màn yêu cầu chưa được smoke trong browser ở pass này.
- Accessibility/brand: chưa đủ quan sát browser để kết luận quick check trong pass này. Không có UI bug mới được xác nhận; không sửa presentation trong pass này.
- Validation trước đó vẫn là frontend API tests 5/5 PASS, typecheck PASS và production build PASS như ghi ở section `UI ALIGNMENT / LAYOUT POLISH`; không có code thay đổi trong lượt smoke bị chặn này.
- Files được chỉnh trong pass này: chỉ report này.
- Backend modified: NO. Database/Prisma modified: NO. API/business logic modified: NO.
- Lock decision: không khóa `CORE DESIGN SYSTEM`, Auth UI, Property/Room UI hoặc Resident/Occupancy UI. Cần launcher/runtime health được xác nhận và phiên Admin hợp lệ để chạy lại các bước visual/browser criteria.
