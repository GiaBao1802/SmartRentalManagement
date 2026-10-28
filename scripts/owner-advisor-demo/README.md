# Trợ lý chủ trọ — demo local

Thay thế hướng tư vấn chọn phòng của standalone advisor theo yêu cầu người dùng. Cloudy trong ứng dụng nay đọc database hiện tại qua API có xác thực `/api/v1/cloudy/owner`; không cần chạy port 4332. Standalone này vẫn dùng JSON giả lập riêng. Luồng truy vấn phòng vẫn dành cho khách/người thuê.

Chạy `npm run demo:advisor` hoặc `npm run demo:owner`; setup mục 4 cũng mở trợ lý này. Cổng mặc định 4332. `npm run test:owner` kiểm tra nghiệp vụ/HTTP; `npm run eval:owner` gọi Qwen3 1.7B thật. Ollama tại 127.0.0.1:11434; không dùng model trả phí.

Luồng: câu hỏi → Qwen đề xuất một trong bốn tác vụ → chủ trọ chọn/xác nhận kỳ và phòng → backend đọc hóa đơn mẫu trong phạm vi chủ mẫu → giao diện trình bày dữ kiện có nguồn. Câu hỏi chưa tự trích kỳ/phòng; UI nói rõ và yêu cầu chọn. Có thể chọn tác vụ trực tiếp khi AI lỗi. AI không nhận dữ liệu tài chính, không sinh SQL, tính tiền hoặc sửa trạng thái.

- Hóa đơn chưa thanh toán: chỉ unpaid đã finalize, tách quá hạn/đến hạn hôm nay/chưa đến hạn. Tổng không gồm draft/paid.
- Điện nước: giải thích chỉ số đầu/cuối, tiêu thụ, bậc giá và thành tiền trong snapshot đã lưu; không tái tính bằng giá hiện tại. Chưa hỗ trợ tính nháp từ chỉ số người dùng nhập.
- Thiếu dữ liệu: liệt kê blocker của draft.
- Tổng quan: các hóa đơn chưa thanh toán và bản nháp cần kiểm tra trong kỳ đã chọn; không tự gửi thông báo.

Đăng nhập tài khoản chủ trọ tại `http://localhost:3000/login`, sau đó mở `http://localhost:4332`. Phải dùng cùng hostname `localhost` để cookie đăng nhập được gửi. Backend quản lý tại `http://localhost:4000/api/v1` phải đang chạy; có thể cấu hình `OWNER_ADVISOR_API_BASE` sang backend HTTP loopback khác. Mỗi request giao diện/API được xác thực lại qua `/auth/me`: chưa đăng nhập/hết phiên trả 401, Resident trả 403, lỗi backend trả 503. Không tin role/owner do client gửi; không có chế độ bỏ qua đăng nhập. `/health` chỉ trả định danh dịch vụ và yêu cầu đăng nhập.

Bộ đang chạy là [`data/owner-ai/v1`](../../data/owner-ai/v1/README.md): 100 phòng/5 khu, 160 hóa đơn mẫu tháng 9–10, gắn với tài khoản có sẵn `admin.one@example.test` (account/owner `1`). Server kiểm tra cả account và owner lấy từ session; tài khoản khác nhận danh sách rỗng. `data.mjs` cũ chỉ dùng cho unit test, không còn là dữ liệu server. Mọi phòng/hóa đơn/đơn giá đều giả lập; không thêm bản ghi vào database. Xem README bộ dữ liệu để biết ca thử và cách tạo lại.

Chưa nối Invoice/Billing API thật. Khi tích hợp phải dùng scope của session Admin backend, phân trang đầy đủ và dùng Invoice Items snapshot/Billing readiness hiện hành. Không thêm endpoint public tài chính. Không migrate/seed. Repo canonical Requirements §10–11 và API §5.8 là authority, không dùng công thức mẫu thay resolver production.

Các script room-advisor-demo và dataset 300 phòng được giữ làm lịch sử/nguồn cho trợ lý truy vấn; `demo:advisor:legacy` chạy bản cũ. Cổng cũ đang mở có thể vẫn hiển thị demo cũ; sử dụng URL mới.
