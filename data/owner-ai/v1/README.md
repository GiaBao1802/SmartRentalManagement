# Bộ thử trợ lý chủ trọ — 100 phòng

Dữ liệu giả lập, chỉ nằm trong JSON; không import database, không phải khoản nợ thực.

- Tài khoản có sẵn: `admin.one@example.test`, account ID `1`, owner ID `1`; đã xác minh bằng truy vấn chỉ đọc vào database cấu hình của backend ngày 2026-10-28. Không lưu mật khẩu/token trong bộ dữ liệu.
- `manifest.json`: phiên bản, tài khoản được gán và ngày đối chiếu 2026-10-28.
- `properties.json`: 5 khu trọ giả lập.
- `rooms.json`: 100 phòng, mã K1-P01 đến K5-P20; 80 đang thuê, 10 trống, 10 ngừng sử dụng. ID có tiền tố SYN, không phải ID database.
- `invoices.json`: 160 hóa đơn, 80 mỗi kỳ 2026-09 và 2026-10. Tháng 9 đã thanh toán; tháng 10 có 20 đã thanh toán, 15 quá hạn, 15 đến hạn hôm nay, 15 chưa đến hạn, 15 draft thiếu chỉ số.

Đăng nhập bằng tài khoản trên tại localhost:3000, mở http://localhost:4332, chọn kỳ 2026-10 rồi xác nhận. Thử tác vụ chưa thanh toán (45 hóa đơn), thiếu dữ liệu (15 bản nháp), điện nước K1-P01, phòng trống K1-P17 (không hóa đơn). Admin khác không thấy bộ dữ liệu này. Phạm vi lấy từ session được backend xác thực, không từ câu hỏi/model.

Giá phòng/điện/nước đều giả lập. Snapshot điện có ba bậc, nước giá cố định; chỉ số đầu tháng 10 nối cuối tháng 9. Bản nháp không có tổng tiền phải thu. Khoảng kỳ mẫu 21 tháng trước đến 20 tháng hiện tại chỉ phục vụ dữ liệu thử này.

Tạo lại: `node scripts/owner-advisor-demo/generate-dataset.mjs` (ghi lại bốn JSON). Kiểm tra: `npm run test:owner`. `data.mjs` cũ chỉ còn làm fixture unit test. Không thay dữ liệu 300 phòng của Cloudy.


Cloudy Admin now works directly in the main app via `/api/v1/cloudy/owner` (cookie Path=/api/v1). `requests.json` adds 20 request fixtures (10 utilities / 10 complaints), 16 pending and four completed. Choose the request task and month 2026-10, confirm scope, then filter type/status and explicitly confirm a simulated action with a reason. Changes/history are only in server memory, reset on restart; no real charges, notifications or DB changes. This request file is separately maintained; the room generator rewrites only the original four JSON files.
