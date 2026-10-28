# Rà soát UI/UX toàn ứng dụng — 2026-10-29

**Trạng thái:** CURRENT — rà soát một phần; còn chờ kiểm tra màn hình đã đăng nhập và API public hoạt động.  
**Phạm vi:** rà soát source và browser UI công khai cho trang gốc, `/landing`, `/tim-phong`, `/rooms`, `/tim-phong/danh-sach`, `/login`, và chuyển hướng vào `/tenant/amenities`. Không thay đổi code nghiệp vụ, không đăng nhập, không gửi biểu mẫu, không ghi database.

## Kết quả ưu tiên

### P1 — CTA tìm phòng và logo quay về sai trang

`frontend/src/proxy.ts` viết lại `/` sang `/intro/index.html`, trong khi `frontend/src/app/page.tsx` xuất trang khám phá phòng và API spec mô tả explorer là trang chủ. Runtime xác nhận `/` đang hiện intro cũ; `/tim-phong` mới mở bản đồ tìm phòng. Các nút “Tìm phòng ngay”, “Mở bản đồ tìm phòng” và logo trên `/landing` đều trỏ về `/`, nên đưa người dùng quay lại intro thay vì vào kết quả tìm phòng. Logo của explorer cũng trỏ về `/`. Điều này tạo hai trang giới thiệu (`/` và `/landing`) cùng một trang tìm phòng, làm hành trình tìm phòng không nhất quán.

**Đề nghị:** thống nhất một URL cho trang tìm phòng và một URL cho giới thiệu; cập nhật rewrite, logo và CTA cùng lúc. Xác nhận đích đến bằng kiểm tra browser sau sửa.

### P1 — Link Zalo/WhatsApp không trùng số hotline đang hiển thị

Intro hiển thị hotline Việt Nam `0988 123 456` (`frontend/public/intro/index.html:309–320`), nhưng nút hỗ trợ nổi mở `wa.me/601111421029` (đầu số `+60`, khác số hotline được công bố). Chưa tìm thấy quy tắc hay xác nhận trong source rằng đây là số hỗ trợ đúng.

**Đề nghị:** xác minh số nhận hỗ trợ; nếu chưa có số được duyệt thì bỏ link ngoài hoặc trỏ tới đúng kênh công khai.

### P1 — Claim quảng bá chưa có nguồn kiểm chứng trong repository

Intro tự nhận “100% ảnh phòng chụp thật”, “hàng ngàn cư dân”, “120 căn hộ”, “500+ phòng” và “hệ thống đang vận hành thực tế” (`frontend/public/intro/index.html:99, 113, 269–291`). Repository ghi rõ dữ liệu chủ trọ/phòng dùng cho AI là dữ liệu giả lập. Rà soát này không tìm được nguồn xác minh rằng các số liệu/ảnh quảng bá là khách hàng và phòng thật.

**Đề nghị:** chỉ giữ claim sau khi có nguồn được xác nhận; nếu nội dung là demo, ghi rõ “minh họa” và không gọi là ảnh hoặc dự án vận hành thực tế.

### P2 — Banner lỗi API che phần hướng dẫn trên bản đồ

Khi API không phản hồi, banner “Chưa tải được tin đăng” xuất hiện phía trên trái với `z-index: 9`, trong khi panel hướng dẫn bản đồ ở cùng khu vực. Browser screenshot cho thấy banner che phần tiêu đề/nội dung của panel. Đây là trạng thái lỗi dễ gặp khi API chưa sẵn sàng; người dùng vẫn có thể chọn dữ liệu minh họa nhưng phần hướng dẫn bị khó đọc.

**Đề nghị:** đặt lỗi trong vùng nội dung dành riêng, cho phép đóng banner, hoặc tự bố trí lại panel để hai thành phần không chồng nhau ở desktop hẹp.

### P2 — Markup hotline có link lồng link

`frontend/public/intro/index.html:309–310` đặt một `<a>` bên trong một `<a>`. HTML không hỗ trợ link lồng nhau; cây accessibility hiện tạo hai mục Hotline chồng nội dung. Nên dùng một link duy nhất với nội dung đầy đủ.

## Điểm đã kiểm tra và chưa thấy lỗi

- Màn hình `/login` ở kích thước desktop và mobile hiển thị trường có nhãn, nút đăng nhập và đường dẫn quên mật khẩu; quét cơ bản không thấy input thiếu nhãn, button/link không có tên truy cập, ảnh thiếu `alt`, ID trùng hoặc tràn ngang.
- Trang `/landing` ở kích thước mobile đọc được và không tràn ngang trong lần kiểm tra. Đường dẫn cư dân chưa đăng nhập chuyển tới `/login?next=...` như dự kiến.
- Trang tìm phòng có trạng thái lỗi và thao tác thử lại/dữ liệu minh họa; bộ lọc có nhãn, các trường tiện ích có tên truy cập. Card demo ở màn nhỏ cuộn được và giá/địa chỉ không tràn khỏi card.
- Header đang hiển thị lối đăng nhập cư dân và admin khi chưa đăng nhập là lựa chọn hai vai trò, không được xem là lỗi. Chưa có browser evidence cho header sau đăng nhập từng vai trò.
- Ảnh bìa `null` dùng placeholder có ghi thiếu ảnh; đó là hành vi đúng theo requirement, không phải lỗi UI. Chưa có ảnh phòng thật trong các response đã kiểm tra.

## Bằng chứng và giới hạn

- Browser: `/`, `/landing`, `/tim-phong`, `/rooms`, `/tim-phong/danh-sach`, `/login`, và redirect từ `/tenant/amenities`; kiểm tra trực quan ở desktop và cửa sổ hẹp khoảng 422×630 px.
- Local public API `http://localhost:4000/api/v1/public/rooms` timeout trong phiên rà soát. Vì vậy danh sách/card dữ liệu thật, ảnh bìa, chi tiết phòng và trạng thái API phục hồi chưa được kiểm tra; chỉ kiểm tra được error state và bộ dữ liệu minh họa. Không đăng nhập nên các trang Admin/Cư dân đã xác thực, phân quyền hiển thị, booking và luồng duyệt chưa được kiểm tra trực quan.
- Quét accessibility là kiểm tra DOM cơ bản, không phải audit WCAG/axe; không đo tương phản đầy đủ, thao tác bằng bàn phím toàn site, screen reader, hoặc ma trận viewport 360–1440 px.
- `npm run test:api`: 77/77 PASS. Frontend typecheck và production build đã PASS trong lượt sửa UI ngay trước audit này; audit không sửa code.

## Theo dõi sửa lỗi — 2026-10-29

Đã sửa các mục có thể xử lý từ source trong phạm vi frontend:

- Bỏ Proxy viết lại `/` sang `/intro/index.html`; `/` nay render explorer trong `app/page.tsx`, đúng với API spec. Browser xác nhận nút “Tìm phòng ngay” từ `/landing` chuyển đến bản đồ tại `/`.
- Đặt banner lỗi public explorer trong vùng bên phải panel thông tin trên desktop; quy tắc mobile hiện có tiếp tục đưa banner thành dải ngang bên dưới header.
- Sửa link lồng nhau ở hotline; bỏ khẳng định ảnh thật/dự án/số lượng khách hàng chưa có nguồn và claim VietQR/ký số/thời gian thực chưa đúng với luồng đã xác minh. Cả intro được phục vụ và preview tĩnh đã đồng bộ; ảnh và nội dung demo ghi rõ là minh họa.
- Đồng bộ số link WhatsApp với số hotline đang hiển thị trong cả hai bản JavaScript intro. Việc xác minh số đó có nhận WhatsApp hay không vẫn chưa có bằng chứng trong repository.

**Kiểm tra sau sửa:** frontend typecheck PASS; `npm run test:api` 77/77 PASS; `npm run build` PASS, route table xác nhận `/` được phục vụ từ App Router; JavaScript intro parse PASS và hai bản preview HTML/JS có hash giống nhau. Browser spot-check xác nhận CTA `/landing` → `/` và banner lỗi API không che panel ở desktop. API `localhost:4000` vẫn không phản hồi nên chỉ kiểm tra được error state, chưa xác minh dữ liệu live; Admin/Cư dân đã đăng nhập cũng chưa được duyệt lại. Audit tổng thể tiếp tục là `PARTIAL`.

Không thay đổi Requirement/API/database, không gửi biểu mẫu và không ghi dữ liệu.

## Kết luận

Chưa thể kết luận toàn bộ UI/UX đã đạt vì các màn cư dân/admin cần phiên đăng nhập và API public đang timeout. Các việc nên xử lý trước là thống nhất đích trang chủ/CTA, xác minh kênh liên hệ và claim quảng bá, rồi sửa chồng lấp banner lỗi. Sau đó cần browser walkthrough có phiên cho Admin và Cư dân trên các luồng hóa đơn, tiện ích/booking, khiếu nại, điện nước và duyệt yêu cầu.
