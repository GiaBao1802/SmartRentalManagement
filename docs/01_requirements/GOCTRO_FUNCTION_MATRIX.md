# Góc Trọ V1 — Ma trận chức năng và truy vết migration

## Mục tiêu và nguyên tắc đối chiếu

Tài liệu này là ma trận truy vết migration chính thức từ demo/legacy sang Góc Trọ V1. Nó giữ dấu vết `goctro_ver01` → `goctro` hiện tại → Requirement V1, đồng thời quyết định giữ, viết lại, loại khỏi V1 hay chuyển phiên bản sau.

### Thứ tự ưu tiên nguồn

1. `01_REQUIREMENTS.md` — đặc tả V1 đã khóa.
2. `GOCTRO_FUNCTION_SCOPE.md` — phân loại và bối cảnh quyết định.
3. `GOCTRO_FUNCTION_MATRIX.md` bản trước — truy vết lịch sử.
4. Hành vi/source demo trong `goctro_ver01` và `goctro`.

Khi nguồn cũ hoặc code demo trái V1, giữ dấu vết cũ để migration tham khảo nhưng quyết định đích theo Requirement V1. `GOCTRO_FUNCTION_SCOPE.md` có một số nhận xét dựa trên Requirement trước đó; chúng không thay thế V1 đã khóa. Source chỉ giúp xác định vị trí và hiện trạng, không quyết định nghiệp vụ đích.

### Bằng chứng và giới hạn source

- `goctro_ver01/index.html` chứa phần lớn màn hình và logic inline. Helper hiện có gồm `app-fixes.js`, `role-user.js`, `settings-demo.js`, `foxi.js`, `server.js`, `demo-database.json`. Không gán các controller chỉ xuất hiện ở source hiện tại cho legacy; ghi `index.html` nếu logic cũ nằm inline.
- `goctro/src/pages/*.jsx` chứa React shell/màn hình; `goctro/public/assets/js/*.js` chứa controller legacy đang được nạp. `goctro/src/main.jsx` nạp 15 controller từ `/assets/js/`: UI đã có React component nhưng nghiệp vụ chưa tách khỏi controller DOM.
- `goctro/server.cjs` và `demo-database.json` là API/JSON demo, không phải backend/PostgreSQL production. Không có bằng chứng về authorization backend hoặc isolation multi-tenant thật.
- File/module dưới đây là dấu vết mã, không xác nhận toàn bộ luồng chạy đúng. Ma trận không thay audit runtime.

### Trạng thái V1

Mỗi dòng chỉ dùng một trạng thái:

- 🟢 Giữ và migrate
- 🟡 Giữ nhưng viết lại
- 🔴 Loại khỏi V1
- 🔵 V2 / phiên bản sau
- ⚪ Chưa xác định

Không dùng trạng thái ghép; tách những hành vi có quyết định khác nhau. Không có dòng ⚪ vì Requirement V1 đã khóa các quyết định phạm vi ở ma trận này. Chi tiết kỹ thuật chưa chốt được ghi chú riêng, không biến thành requirement mới.

## Ma trận chức năng chính

| Nhóm chức năng | Legacy/source cũ | Code hiện tại | Requirement V1 | Trạng thái V1 | Hành động migration | File/module liên quan | Dependency | Ghi chú |
|---|---|---|---|---|---|---|---|---|
| Chủ trọ/Admin và phạm vi dữ liệu nhiều chủ trọ | Role/quản trị giả lập trong `index.html`; không có isolation server được xác minh | `auth.js`, `router.js`, `data-core.js` và controller phía trình duyệt | §2, §3, §20: Chủ trọ = Admin; không super admin; nhiều khu trọ/owner; cấm truy cập chéo; backend authorization | 🟡 Giữ nhưng viết lại | Thay role/ID client bằng xác thực backend; owner/property scope từ session; enforce trên mọi API, truy vấn và export | Legacy: `goctro_ver01/index.html`; hiện tại: `goctro/src/main.jsx`, `public/assets/js/auth.js`, `router.js`, `data-core.js` | Auth/session; Owner; Property; API/PostgreSQL | Legacy không có isolation thật. Đây là nền tảng bảo mật, không migrate nguyên trạng. |
| Trang công khai: danh sách, lọc và chi tiết phòng | Trang chủ/tìm phòng trong `index.html` | `TrangChu.jsx`, `TimPhong.jsx`, `role-user.js`, `tenant-and-areas.js` | §4: công khai phòng được phép; lọc địa chỉ/tỉnh thành/thuộc tính; chi tiết phòng, giá, diện tích, sức chứa | 🟢 Giữ và migrate | Giữ trải nghiệm tìm phòng; React quản lý UI/state; đọc qua API chỉ trả trường công khai, lọc theo điều kiện V1 | Legacy: `goctro_ver01/index.html`, `role-user.js`; hiện tại: `src/pages/TrangChu.jsx`, `TimPhong.jsx`, `public/assets/js/role-user.js`, `tenant-and-areas.js` | Property; Room; public API | Không dùng tên tòa nhà làm điều kiện tìm nếu chưa được duyệt. |
| Yêu cầu liên hệ chủ trọ | Form/CTA trong legacy `index.html` | `TrangChu.jsx`, `TimPhong.jsx`, `role-user.js` | §4: khách gửi thông tin; backend lưu và chuyển đúng chủ trọ/khu trọ | 🟡 Giữ nhưng viết lại | Giữ contact request; thay lưu cục bộ/toast bằng API và persistence; gắn đúng owner/property | Legacy: `goctro_ver01/index.html`, `role-user.js`; hiện tại: `src/pages/TrangChu.jsx`, `TimPhong.jsx`, `public/assets/js/role-user.js`, `data-core.js` | Room public; contact API; owner scope | Đây là yêu cầu liên hệ, không phải tạo tài khoản. |
| Booking lịch xem phòng | CTA/hành vi demo trong `index.html` | `TrangChu.jsx`, `TimPhong.jsx`, `role-user.js` | §4: V1 không có booking; không giả thông báo đã đặt lịch | 🔴 Loại khỏi V1 | Bỏ booking/appointment request và xác nhận giả; contact request được giữ riêng | Legacy: `goctro_ver01/index.html`; hiện tại: `src/pages/TrangChu.jsx`, `TimPhong.jsx`, `public/assets/js/role-user.js` | Trang công khai | `appointment_requests`/booking demo không migrate. |
| Đăng nhập, đăng xuất, session | Dialog/router và role demo trong `index.html` | `auth.js`, `router.js`, `data-core.js`; loader trong `src/main.jsx` | §5, §20: session có hạn, logout, khóa tài khoản, quyền dựa trên danh tính xác thực | 🟡 Giữ nhưng viết lại | Thay auth phía trình duyệt bằng backend; session expiry/revocation; không tin role/user ID do client gửi | Legacy: `goctro_ver01/index.html`, `role-user.js`; hiện tại: `src/main.jsx`, `public/assets/js/auth.js`, `router.js`, `data-core.js` | Multi-tenant; account; backend auth | Nút điền nhanh chỉ thuộc demo/dev. |
| Tài khoản cư dân, khóa/mở khóa và liên kết hồ sơ | Màn tài khoản/logic inline trong `index.html` | `TaiKhoan.jsx`, `account-management.js`, `auth.js`, `data-core.js` | §5: trạng thái khóa; một account liên kết đúng một resident; quản trị trong owner scope | 🟡 Giữ nhưng viết lại | Giữ chức năng; backend enforce quyền, liên kết không trùng và session của tài khoản bị khóa | Legacy: `goctro_ver01/index.html`, `role-user.js`; hiện tại: `src/pages/TaiKhoan.jsx`, `public/assets/js/account-management.js`, `auth.js`, `data-core.js` | Auth; Resident; owner scope | Không có super admin hoặc role nhân sự V1. |
| Quản lý khu trọ | CRUD/tổng quan inline trong legacy | `KhuVuc.jsx`, `QuanLyKhuTro.jsx`, `tenant-and-areas.js`, `data-core.js` | §6: CRUD khu trọ; nhiều khu trên một owner; xóa có ràng buộc | 🟢 Giữ và migrate | Giữ CRUD, lọc, thống kê; chuyển state/validation sang React/API; enforce owner scope; kiểm tra quan hệ trước khi xóa | Legacy: `goctro_ver01/index.html`, `app-fixes.js`; hiện tại: `src/pages/QuanLy/KhuVuc.jsx`, `src/pages/QuanLyKhuTro.jsx`, `public/assets/js/tenant-and-areas.js`, `data-core.js` | Owner/Admin; Room; API/PostgreSQL | Handler xóa khu vực được sửa trong code hiện tại theo Scope; điều này không chứng minh authorization backend. |
| Quản lý phòng | Danh sách/tạo phòng trong khu quản trị legacy | `KhuVuc.jsx`, `QuanLyKhuTro.jsx`, `tenant-and-areas.js`, `property-wizard.js` | §6: phòng thuộc khu trọ; trạng thái, giá, diện tích, sức chứa, tìm/lọc/thống kê, liên kết nghiệp vụ | 🟢 Giữ và migrate | Giữ CRUD/vòng đời; business logic sang backend; lưu API/PostgreSQL; validate owner scope và liên kết | Legacy: `goctro_ver01/index.html`, `app-fixes.js`; hiện tại: `src/pages/QuanLy/KhuVuc.jsx`, `src/pages/QuanLyKhuTro.jsx`, `public/assets/js/tenant-and-areas.js`, `property-wizard.js` | Property; Resident; Contract; Invoice; Vehicle | Room là khái niệm nghiệp vụ bắt buộc. Cấu trúc bảng/entity vật lý đối chiếu ERD/schema riêng; Matrix không chốt schema. |
| Cư dân: hồ sơ, CCCD, liên hệ, phòng, tình trạng và phương tiện | Quản lý cư dân inline; helper legacy `app-fixes.js`, `role-user.js` | `KhachThue.jsx`, `CuDan.jsx`, `tenant-and-areas.js`, `app-fixes.js`, `role-user.js` | §7: quản lý hồ sơ/lưu trú/phương tiện; backend kiểm tra CCCD trùng, sức chứa, liên kết; bảo toàn lịch sử | 🟢 Giữ và migrate | Giữ hồ sơ/tra cứu; chuyển validation, sức chứa và toàn vẹn liên kết sang backend; dùng archive khi còn ràng buộc | Legacy: `goctro_ver01/index.html`, `app-fixes.js`, `role-user.js`; hiện tại: `src/pages/QuanLy/KhachThue.jsx`, `src/pages/CuDan.jsx`, `public/assets/js/tenant-and-areas.js`, `app-fixes.js` | Room; Contract; Account; Vehicle; owner scope | Số người đang ở phải tuân sức chứa áp dụng cho phòng/hợp đồng. |
| Tình trạng đăng ký tạm trú/tạm vắng | Trường lưu trú/CT01 trong legacy UI/helper | `KhachThue.jsx`, `CuDan.jsx`, `app-fixes.js` | §7: lưu tình trạng đăng ký để tra cứu/lọc/theo dõi | 🟢 Giữ và migrate | Giữ dữ liệu và trạng thái; xây API và validation phù hợp Requirement; bảo vệ PII theo quyền | Legacy: `goctro_ver01/index.html`, `app-fixes.js`; hiện tại: `src/pages/QuanLy/KhachThue.jsx`, `src/pages/CuDan.jsx`, `public/assets/js/app-fixes.js` | Resident; Property; authorization | Không thêm trạng thái ngoài Requirement. |
| CT01 theo khu trọ và xuất/in có rà soát | Legacy helper sinh biểu mẫu từ dữ liệu; mẫu file có trong repo | `KhachThue.jsx`, `app-fixes.js`, `public/assets/files/MauCT01-53-2025-BCA.doc` | §8: chọn khu; lọc cư dân chưa hoàn tất ở mọi phòng; rà soát trước xuất; owner scope; xác minh mẫu | 🟡 Giữ nhưng viết lại | Thay xuất từng cư dân bằng danh sách cả khu; review trước xuất; truy vấn có scope backend; xác minh CT01 chính thức trước production | Legacy: `goctro_ver01/index.html`, `app-fixes.js`; hiện tại: `src/pages/QuanLy/KhachThue.jsx`, `public/assets/js/app-fixes.js`, `public/assets/files/MauCT01-53-2025-BCA.doc` | Property; Room; Resident; authorization | Nếu legacy xuất CT01 từng cư dân thì đây là breaking change. File mẫu không đồng nghĩa đã xác nhận pháp lý. |
| Hợp đồng: tạo, gia hạn, thanh lý, cọc, điện/nước và công nợ | Wizard/dialog/list inline trong legacy | `HopDong.jsx`, `QuanLyKhuTro.jsx`, `contracts.js`, `property-wizard.js`, `data-core.js` | §9: lifecycle; đúng một cư dân đại diện; công nợ/cọc; khi hết hiệu lực dừng slot và pool/gym | 🟢 Giữ và migrate | Giữ lifecycle; tách người đại diện khỏi danh sách cư dân; chuyển luật/validation sang API/backend; khi hết hạn kết thúc các đăng ký liên quan | Legacy: `goctro_ver01/index.html`, `app-fixes.js`; hiện tại: `src/pages/QuanLy/HopDong.jsx`, `src/pages/QuanLyKhuTro.jsx`, `public/assets/js/contracts.js`, `property-wizard.js` | Resident; Room; Invoice; Amenity; Parking; Payment | Người ở khác không tự thành đồng đứng tên hợp đồng. |
| OCR hợp đồng/CCCD mô phỏng | Upload/scan và dữ liệu mẫu trong legacy UI | `HopDong.jsx`, `contracts.js`, `property-wizard.js` | §9, §18: OCR không bắt buộc V1 | 🔴 Loại khỏi V1 | Không migrate OCR giả, dữ liệu mẫu hoặc tuyên bố AI; upload hồ sơ thủ công có thể thuộc flow hợp đồng riêng | Legacy: `goctro_ver01/index.html`; hiện tại: `src/pages/QuanLy/HopDong.jsx`, `public/assets/js/contracts.js`, `property-wizard.js` | Contract; file storage | OCR thật là V2 ở dòng riêng. |
| OCR thật cho hợp đồng/CCCD | Không có dịch vụ OCR được xác minh | Scan hiện tại là mô phỏng | §18: ngoài V1 | 🔵 V2 / phiên bản sau | Không triển khai V1; xem xét dịch vụ thật, quyền riêng tư và quy trình người dùng xác nhận ở V2 | Legacy: không có; hiện tại: `contracts.js` mô phỏng | Contract; file storage; privacy | — |
| Hóa đơn: lập kỳ, tra cứu, chi tiết, trạng thái và chống trùng | Form/tab/detail inline trong legacy | `HoaDon.jsx`, `QuanLyKhuTro.jsx`, `invoices.js`, `data-core.js` | §10: liên kết owner/property/room/contract/resident; phí, kỳ, hạn, tổng, trạng thái; không tạo trùng kỳ | 🟢 Giữ và migrate | Giữ luồng lập/tra cứu; tạo/lưu/chống trùng ở backend; áp scope tenant trên truy vấn | Legacy: `goctro_ver01/index.html`; hiện tại: `src/pages/HoaDon.jsx`, `src/pages/QuanLyKhuTro.jsx`, `public/assets/js/invoices.js`, `data-core.js` | Contract; Room; Resident; backend | — |
| Tính hóa đơn và chỉ số điện/nước | Tính/nhập liệu ở script giao diện | `invoices.js`, `HoaDon.jsx`, `data-core.js` | §10: giá trị frontend không có thẩm quyền; validate khoản phí/chỉ số backend | 🟡 Giữ nhưng viết lại | Backend tính/kiểm tra tổng tiền, chỉ số, đơn giá; lưu lịch sử cần thiết; UI trình bày kết quả đã xác nhận | Legacy: `goctro_ver01/index.html`; hiện tại: `src/pages/HoaDon.jsx`, `public/assets/js/invoices.js`, `data-core.js` | Contract; rates; meter readings | Không tin số tổng do client gửi. |
| Đánh dấu paid trực tiếp trên hóa đơn | Demo có thể chỉ đổi `invoice.status` | `invoices.js`, `HoaDon.jsx` | §11: không đổi cờ paid trực tiếp; cần transaction hợp lệ đủ số tiền | 🟡 Giữ nhưng viết lại | Bỏ thao tác đổi status trực tiếp; invoice cập nhật theo payment transaction và đối soát backend | Legacy: `goctro_ver01/index.html`; hiện tại: `src/pages/HoaDon.jsx`, `public/assets/js/invoices.js` | Payment; Invoice | Đây là sai khác legacy cần thay. |
| Thanh toán MoMo/ZaloPay, transaction/session/callback | Không chứng minh tích hợp thật; demo đổi trạng thái | `HoaDon.jsx`, `invoices.js`; không thấy provider backend xác thực | §11: hai provider; transaction riêng; không partial; đủ tiền mới paid; callback idempotent; 2 thất bại/phiên rồi kết thúc; mở phiên mới được | 🟡 Giữ nhưng viết lại | Xây API/provider flow; transaction riêng mỗi lần thử; xác minh callback idempotent; kiểm tra tiền và đếm lỗi theo session | Legacy: `goctro_ver01/index.html`; hiện tại: `src/pages/HoaDon.jsx`, `public/assets/js/invoices.js`, `data-core.js` | Invoice; backend; MoMo; ZaloPay | Giao thức tích hợp cụ thể thuộc thiết kế triển khai, không thay quyết định V1. |
| Refund giao dịch/provider | Không thấy workflow thật trong demo | Không có flow refund V1 | §11, §18: refund giao dịch qua provider ngoài V1 | 🔵 V2 / phiên bản sau | Không migrate refund; giữ quyết toán/hoàn khấu trừ tiền cọc hợp đồng riêng theo §9 | Legacy/current: không có flow V1 | Payment; Contract deposit | Refund khác settlement tiền cọc. |
| Gửi hóa đơn qua Zalo OA và send log | Toast/nút demo; chưa có gửi thật | `settings-demo.js`, `invoices.js`, `server.cjs`, `demo-database.json` | §12: gửi hóa đơn OA; log từng lần; gửi bản cập nhật hợp lệ; đúng người nhận | 🟡 Giữ nhưng viết lại | Thay toast bằng backend integration; lưu log/version/response từng lần; recipient từ hồ sơ thuê; giữ lịch sử và gửi lại bản cập nhật | Legacy: `goctro_ver01/index.html`, `settings-demo.js`, `server.js`; hiện tại: `src/pages/HoaDon.jsx`, `public/assets/js/invoices.js`, `settings-demo.js`, `server.cjs` | Invoice; Resident contact; Zalo OA; backend | Tài khoản OA/template/chính sách lỗi là chi tiết kỹ thuật triển khai. |
| Thông báo nghiệp vụ trong ứng dụng | Toast/thông báo giao diện | `SharedChrome.jsx`, `CuDan.jsx` và controller liên quan | §12: thông báo khác chỉ hiển thị trong ứng dụng | 🟢 Giữ và migrate | Giữ notification trong app; lưu/đọc qua backend, đúng recipient và tenant; phân biệt notification bền vững với toast tạm | Legacy: `goctro_ver01/index.html`, `role-user.js`; hiện tại: `src/pages/SharedChrome.jsx`, `src/pages/CuDan.jsx` | Account; auth; backend | Toast không tự là notification đã lưu. |
| Email/push notification | Không có integration provider thật | Không có integration V1 được xác nhận | §12: V1 không yêu cầu email/push | 🔴 Loại khỏi V1 | Không xây/migrate các kênh này vào V1 | Legacy/current: không có integration thật | Ngoài V1 | In-app notification vẫn giữ. |
| Danh mục tiện ích và cấu hình theo khu | `settings-demo.js`/giao diện legacy | `TienIch.jsx`, `CaiDat.jsx`, `settings.js`, `settings-demo.js` | §13: tên/mô tả/giá/khu vực/giờ/trạng thái/nội quy; quản lý và hiển thị cùng nguồn | 🟢 Giữ và migrate | Giữ CRUD/cấu hình; chuyển JSON demo sang API/PostgreSQL; scope owner/property và đồng bộ quản trị/cư dân | Legacy: `goctro_ver01/index.html`, `settings-demo.js`; hiện tại: `src/pages/QuanLy/TienIch.jsx`, `src/pages/CaiDat.jsx`, `public/assets/js/settings.js`, `settings-demo.js` | Property; Resident; API | Ngoài Pool/Gym/Parking, tiện ích khác có thể chỉ hiển thị theo Requirement. |
| Đăng ký Hồ bơi/Gym 30 ngày | Booking/lịch slot trong legacy `index.html`/`role-user.js` | `role-user.js`, `settings.js`, `TienIch.jsx`, `CuDan.jsx` | §13: cycle từ ngày đăng ký; tự nối kỳ; hủy cuối kỳ; giá theo property, giá mới kỳ sau; lưu price history; hết hợp đồng thì kết thúc | 🟡 Giữ nhưng viết lại | Thay booking time slot bằng subscription; hợp nhất state; lưu cycle/status/cancel dates/price snapshot; chống overlap; giữ lịch sử và chặn gia hạn sau hợp đồng | Legacy: `goctro_ver01/index.html`, `role-user.js`; hiện tại: `src/pages/CuDan.jsx`, `src/pages/QuanLy/TienIch.jsx`, `public/assets/js/role-user.js`, `settings.js` | Property; Resident; Contract; Invoice; backend | Không theo tháng dương lịch, không tính lẻ chu kỳ, không hồi tố giá. |
| Hai danh sách đăng ký `resident_bookings`/`amenity_registrations` cùng mô tả nghiệp vụ | State/booking legacy | Requirement lịch sử ghi `B`/`RG` đọc-ghi khác luồng ở controller hiện tại | §13 yêu cầu một nguồn nghiệp vụ thống nhất | 🔴 Loại khỏi V1 | Không migrate hai luồng song song; map bản ghi hợp lệ vào mô hình subscription thống nhất, bảo toàn lịch sử | Legacy: `goctro_ver01/role-user.js`, `index.html`; hiện tại: `public/assets/js/role-user.js`, `settings.js`, `settings-demo.js`, `data-core.js` | Amenity subscription; Resident | Không xóa lịch sử hợp lệ khi chuyển đổi. |
| Parking: phương tiện và slot assignment vật lý | `parking_slot` có thể là text trên vehicle trong demo | `tenant-and-areas.js`, `role-user.js`, `data-core.js`, màn cư dân | §14: slot vật lý riêng; nhiều phương tiện; giới hạn theo sức chứa hợp đồng; không override/cấp trùng; bắt đầu/kết thúc; giữ history | 🟡 Giữ nhưng viết lại | Tách slot và assignment; lưu room/resident/vehicle/slot/start/status/end; backend kiểm tra capacity, xung đột đồng thời, hợp đồng; khi giảm capacity phải chặn và xử lý chủ động | Legacy: `goctro_ver01/index.html`, `role-user.js`; hiện tại: `src/pages/CuDan.jsx`, `src/pages/QuanLy/KhachThue.jsx`, `public/assets/js/tenant-and-areas.js`, `role-user.js`, `data-core.js` | Contract capacity; Resident; Vehicle; Slot; backend constraints | Nếu chỉ có text `parking_slot`, phải thiết kế lại data model. |
| Camera/AI biển số | Không có integration được xác minh | Không có integration V1 | §18: ngoài V1 | 🔵 V2 / phiên bản sau | Không migrate/build trong V1 | Legacy/current: không có | Parking; AI/camera | — |
| Report/Báo cáo nhà trọ là Complaint category | Report có thể lưu cục bộ hoặc riêng | `role-user.js`, `complaints.js`, `KhieuNai.jsx`, `CuDan.jsx` | §2, §15, §19: report là category Complaint, không entity report; lưu backend và đúng scope | 🟡 Giữ nhưng viết lại | Hợp nhất submission/list/detail/state vào Complaint; map dữ liệu report cũ; không duy trì nguồn riêng; scope người gửi/property | Legacy: `goctro_ver01/index.html`, `role-user.js`, `demo-database.json`; hiện tại: `src/pages/QuanLy/KhieuNai.jsx`, `src/pages/CuDan.jsx`, `public/assets/js/complaints.js`, `role-user.js`, `data-core.js` | Resident; Property/Room; Complaint; authz | `room_reports` riêng nếu có thì bỏ/hợp nhất nhưng bảo toàn lịch sử. |
| Complaint workflow, priority và history | Form/trạng thái đơn giản trong legacy | `KhieuNai.jsx`, `complaints.js`, `CuDan.jsx` | §15: Chờ xử lý → Đang xử lý → Đã giải quyết; từ chối/mở lại nếu phù hợp; Admin trực tiếp xử lý; lưu lịch sử | 🟡 Giữ nhưng viết lại | Giữ gửi/xem; backend quản lý transition, history, priority và quyền; lưu complaint đã giải quyết; không chỉ toast/đổi client state | Legacy: `goctro_ver01/index.html`, `role-user.js`; hiện tại: `src/pages/QuanLy/KhieuNai.jsx`, `src/pages/CuDan.jsx`, `public/assets/js/complaints.js`, `role-user.js` | Resident; Property; owner/admin authorization | SLA cụ thể là chi tiết còn mở, không thay đổi vai trò V1. |
| Nhân sự và assignment Complaint | Không có role nhân sự được xác minh ở legacy | Không phải flow V1 cần giữ | §15, §18: Admin xử lý trực tiếp; role CSKH/vận hành/kỹ thuật và assignment là V2 | 🔵 V2 / phiên bản sau | Không thêm role/assignment vào V1; ở V2 thiết kế như chức năng riêng | Legacy/current: không có flow V1 | Owner/Admin; Complaint | Audit người thao tác không đồng nghĩa assignment nhân viên. |
| Báo cáo/thống kê vận hành | Dashboard/statistics demo trong `index.html` | `QuanLyKhuTro.jsx`, `KhuVuc.jsx`, `HoaDon.jsx`, `data-core.js` | §2, §6: thống kê từ dữ liệu thuộc owner; số phòng, đang thuê, lấp đầy | 🟢 Giữ và migrate | Giữ chỉ số V1; tổng hợp server-side sau khi áp quyền; không rò số liệu tenant khác | Legacy: `goctro_ver01/index.html`; hiện tại: `src/pages/QuanLyKhuTro.jsx`, `src/pages/QuanLy/KhuVuc.jsx`, `src/pages/HoaDon.jsx`, `data-core.js` | Property; Room; Contract; Invoice; Payment; authz | Báo cáo cư dân là Complaint category, không phải report entity riêng. |
| Hồ sơ cá nhân/cài đặt | View cài đặt legacy và `settings-demo.js` | `CaiDat.jsx`, `settings.js`, `settings-demo.js` | §16: hồ sơ và tùy chọn cá nhân thuộc V1 | 🟢 Giữ và migrate | Giữ phần đã nêu trong Requirement; lưu qua API; áp quyền từ session, không dùng JSON demo làm nguồn chính | Legacy: `goctro_ver01/index.html`, `settings-demo.js`; hiện tại: `src/pages/CaiDat.jsx`, `public/assets/js/settings.js`, `settings-demo.js`, `server.cjs` | Account; auth/session; backend | Chỉ migrate khả năng thuộc V1. |
| Đổi/reset mật khẩu | Hành vi demo trong UI/controller | `auth.js`, `account-management.js`, `settings.js` | §5, §20: xác minh reset; hash; không plaintext; session và quyền an toàn | 🟡 Giữ nhưng viết lại | Xây flow backend xác minh/reset; hash phù hợp; loại password mẫu/toast giả; bảo vệ session | Legacy: `goctro_ver01/index.html`, `role-user.js`; hiện tại: `TaiKhoan.jsx`, `CaiDat.jsx`, `public/assets/js/auth.js`, `account-management.js`, `settings.js` | Auth/session; verification | Không lưu/trả/log plaintext. |
| Gói SaaS | Chọn gói demo ở giao diện | `CaiDat.jsx`, `settings-demo.js`, endpoint `/api/demo/plan` | §18: ngoài V1 | 🔴 Loại khỏi V1 | Bỏ flow/endpoint khỏi nghiệp vụ V1; giữ dữ liệu riêng demo nếu cần | Legacy: `goctro_ver01/index.html`, `settings-demo.js`; hiện tại: `src/pages/CaiDat.jsx`, `public/assets/js/settings-demo.js`, `server.cjs` | — | Gói hiện có chỉ là demo. |
| Foxi rule-based | Keyword response và mascot | `foxi.js`, `SharedChrome.jsx`, `foxi.svg` | §18: Foxi AI ngoài V1 | 🔴 Loại khỏi V1 | Không migrate câu trả lời từ khóa như AI hoặc dùng làm nguồn dữ liệu V1 | Legacy: `goctro_ver01/foxi.js`, `foxi.svg`; hiện tại: `src/pages/SharedChrome.jsx`, `public/assets/js/foxi.js`, `public/assets/images/foxi.svg` | — | Rule demo không phải AI thật. |
| Foxi AI thật | Không có AI backend | Không có AI service xác thực | §18: phiên bản sau | 🔵 V2 / phiên bản sau | Không triển khai V1; V2 cần quyết định quyền truy cập và bảo vệ dữ liệu tenant | Legacy/current: không có AI backend | Authz; AI service; privacy | — |
| localStorage/sessionStorage/JSON demo | `index.html`, `demo-database.json`, `server.js` | `data-core.js`, controllers, `server.cjs`, `demo-database.json` | §19–20: backend/PostgreSQL là source of truth; local/JSON chỉ dev/test | 🔴 Loại khỏi V1 | Migration đích `legacy persistence → API → PostgreSQL`; tách seed/mock dev; mọi truy vấn áp tenant scope | Legacy: `goctro_ver01/demo-database.json`, `server.js`, `index.html`; hiện tại: `public/assets/js/data-core.js`, `server.cjs`, `demo-database.json` | Tất cả module; PostgreSQL; API; authz | Không chốt schema/API contract trong tài liệu này. |

## Breaking Changes từ demo sang V1

| Breaking change | Legacy/demo | V1 mới | Ảnh hưởng migration |
|---|---|---|---|
| Chủ trọ/Admin multi-tenant thật | Role giả lập; chưa có isolation backend | Admin là owner; nhiều khu; không super admin; authorization backend | Thêm identity/owner scope; kiểm tra chéo tenant ở mọi API/truy vấn/export. |
| Không booking xem phòng | CTA có thể trông như đặt lịch hoặc chỉ cuộn trang | Chỉ xem phòng và gửi contact request | Bỏ booking model/API; giữ contact request riêng. |
| Có Room nghiệp vụ | Phòng có thể chỉ là object/list demo | Phòng có trạng thái và quan hệ theo §6 | Đối chiếu ERD/schema để bảo đảm biểu diễn Room; Matrix không chốt bảng. |
| Report hợp nhất vào Complaint | Report có thể lưu riêng/cục bộ | Report là Complaint category; không entity report | Map category, bảo toàn lịch sử và bỏ persistence report riêng. |
| Một hợp đồng, một người đứng tên | Có thể gộp nhiều người ở vào hợp đồng | Một cư dân đại diện; người ở khác quản lý riêng | Chuyển quan hệ; xác định hợp đồng legacy có nhiều người đứng tên. |
| Payment là transaction riêng | Demo chỉ đổi invoice status | Mỗi lần thử có transaction; paid khi callback hợp lệ và đủ tiền | Xây transaction lifecycle/đối soát; không tin client. |
| MoMo + ZaloPay | Không chứng minh provider thật | Hai provider thuộc V1 | Tích hợp provider/backend callback. |
| Không partial payment | Có thể đánh dấu paid không kiểm đủ tiền | Thanh toán đủ số dư; không `partial_paid` | Backend kiểm tiền và cập nhật theo transaction. |
| Refund ngoài V1 | Chưa phân định phạm vi | Không refund giao dịch/provider; tiền cọc là settlement riêng | Không xây refund provider; giữ quyết toán cọc theo §9. |
| Pool/Gym theo chu kỳ 30 ngày | Booking ngày/slot, chưa có cycle V1 | Chu kỳ từ ngày đăng ký, tự tiếp tục, hủy cuối kỳ, kết thúc theo hợp đồng | Thay booking model; lưu cycle/status và ngăn overlap. |
| Giá tiện ích có lịch sử theo chu kỳ | Có thể ghi đè giá hiện tại | Giá kỳ cũ bất biến; giá mới kỳ sau; lưu snapshot/history | Bổ sung lịch sử giá khi audit data design. |
| Parking là slot assignment riêng | `parking_slot` dạng text trên vehicle | Slot vật lý, thời hạn, sức chứa hợp đồng, unique đồng thời, giữ history | Thiết kế lại; xử lý concurrency và giảm sức chứa. |
| Complaint do Admin xử lý V1 | Trạng thái đơn giản/assignee có thể hàm ý | Admin xử lý trực tiếp; workflow/history V1 | Xây transition và history; role staff không vào V1. |
| SaaS/Foxi/OCR/Camera AI | UI/card, keyword hoặc scan mô phỏng | SaaS và mô phỏng loại khỏi V1; tích hợp AI thật là V2 | Không migrate demo thành sản phẩm/tuyên bố tính năng thật. |
| Persistence sang API/PostgreSQL | localStorage/JSON demo | Backend + PostgreSQL source of truth | Data migration và API; seed/mock chỉ dev/test. |

## Migration Backlog

### P0 — Foundation

- Multi-tenant identity: Chủ trọ/Admin là owner; scope lấy từ session tin cậy.
- Authentication/session, khóa tài khoản và mật khẩu an toàn.
- Backend authorization mọi thao tác; cư dân chỉ truy cập hồ sơ thuê của mình.
- Data access/API layer và PostgreSQL; chốt data contract trong audit riêng.
- React routing/state và thay controller DOM legacy theo module.
- Backend validation, audit trail cần thiết, xử lý lỗi và ràng buộc tenant.

### P1 — Core

- Khu trọ/phòng: CRUD, lọc, trạng thái, sức chứa, giá và thống kê — pilot đề xuất.
- Cư dân: hồ sơ, lưu trú, CCCD, phòng, phương tiện và tài khoản.
- Hợp đồng: một người đại diện, lifecycle, cọc, chỉ số, công nợ.
- Hóa đơn: tính backend, chống trùng kỳ, tra cứu và quyền.
- Payment: transaction, MoMo/ZaloPay, thanh toán đủ, callback idempotent và giới hạn phiên.

### P2 — Supporting

- Complaint (kể cả Report category), workflow, quyền Admin và history.
- CT01 theo khu, review trước export và xác minh mẫu production.
- Catalog và Pool/Gym subscription theo cycle/price rules.
- Parking slot assignment theo capacity hợp đồng.
- Zalo OA send/log; in-app notification.
- Contact request cho khách.

### P3 — V2

- Foxi AI thật; OCR hợp đồng/CCCD; camera AI biển số.
- Role CSKH/nhân viên và Complaint assignment.
- Refund giao dịch/provider.
- SaaS plan nếu tương lai cần.

## Dependency graph nghiệp vụ

```text
Owner/Admin
    ↓ owns / authorized scope
Property/Khu trọ
    ↓ contains
Room
    ↓ occupancy / active agreement
Resident + Contract
    ↓ billing
Invoice
    ↓ payment session / attempts
Payment Transaction
```

```text
Contract
 ├── Amenity Subscription (Pool/Gym; 30-day cycles and price history)
 └── Parking Slot Assignment (capacity limited; ends with contract)

Resident
 ├── Account (optional access; one linked resident profile)
 └── Complaint (Report is a Complaint category)

Public Room Listing
 └── Contact Request → owning Owner/Admin
```

Đây là dependency phục vụ migration, không phải ERD/schema cuối cùng.

## Module pilot: Quản lý khu trọ / phòng

Ưu tiên pilot này vì §6 xác định khu trọ/phòng là core V1 và module có CRUD, lọc, trạng thái, quan hệ và thống kê. Nó cho phép kiểm chứng React UI, API, persistence và owner/property authorization trước khi nối cư dân/hợp đồng. Dùng dữ liệu dev/test; source demo chưa phải pilot production.

| Hạng mục pilot | Dấu vết hiện có / đích migration |
|---|---|
| JSX hiện tại | `goctro/src/pages/QuanLy/KhuVuc.jsx` và `goctro/src/pages/QuanLyKhuTro.jsx` |
| Controller legacy hiện tại | `goctro/public/assets/js/tenant-and-areas.js`, `app-fixes.js`, `data-core.js`, được nạp trong `src/main.jsx` |
| Source cũ | `goctro_ver01/index.html` và `app-fixes.js`; phần lớn logic legacy nằm inline trong `index.html` |
| Data demo | `goctro/demo-database.json` và browser storage qua `data-core.js`; không phải production source of truth |
| Database entity dự kiến | Owner, Property/Khu trọ, Room/Phòng và quan hệ liên quan; đối chiếu ERD/schema ở lượt riêng, không chốt cấu trúc tại đây |
| API dự kiến | CRUD khu/phòng, lọc/thống kê và liên kết cần thiết; backend auth + scope mọi request |
| Authorization | Session xác định owner; backend từ chối đọc/sửa/xóa khu/phòng thuộc owner khác |
| Validation | Trạng thái, giá, diện tích, sức chứa, quan hệ và điều kiện xóa được backend kiểm tra |
| Dependency | P0 auth/API/PostgreSQL → Property/Room → Resident → Contract → Invoice; public listing dùng projection công khai |

## Definition of Done

Module chỉ coi là migrate hoàn toàn khi:

- UI do React quản lý.
- Business logic không phụ thuộc controller DOM legacy.
- Không còn gọi logic bằng `new Function(...)` hoặc bridge legacy tương ứng.
- Dữ liệu đọc/ghi qua API và PostgreSQL là source of truth production.
- Authorization backend hoạt động trên mọi thao tác và đúng tenant scope.
- Validation ở đúng tầng; tiền/ngày/định danh/quan hệ được bảo vệ backend/database.
- CRUD và flow chính được test; regression cơ bản đạt.
- JS legacy tương ứng có thể gỡ; CSS legacy có thể gỡ hoặc không còn dependency.
- Seed/demo tách khỏi production, không rò dữ liệu tenant khác.

## Tổng hợp trạng thái

Đếm theo **37 dòng** trong Ma trận chức năng chính; một trạng thái cho mỗi dòng:

- 🟢 Giữ và migrate: **11**
- 🟡 Giữ nhưng viết lại: **14**
- 🔴 Loại khỏi V1: **7**
- 🔵 V2 / phiên bản sau: **5**
- ⚪ Chưa xác định: **0**

Không còn ⚪ vì các quyết định phạm vi V1 đã khóa. Chi tiết triển khai còn mở (giao thức callback/provider, cấu hình OA, cấu trúc schema/API) thuộc thiết kế kỹ thuật tương ứng, không phải requirement mới.

### Việc tiếp theo duy nhất

`Audit và cập nhật erd.md, schema.sql và seed.sql theo Requirement V1 + Scope + Matrix mới.`
