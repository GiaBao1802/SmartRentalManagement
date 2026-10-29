# Bàn giao source V1.18 cho nhóm — 2026-10-29

**Trạng thái:** gói source đã đối chiếu `main` qua `44bfe660` và được chủ dự án cho phép đưa lên GitHub. Xác minh commit cuối trên `origin/main` trước khi dùng. Neon `goctro-shared-dev / production / neondb` đã ở catalog V1.18 (58 bảng) từ lượt nâng trước; nhiệm vụ phân phối source này không nâng database.

## Nhận và khởi động source

1. Trên checkout của từng thành viên, kiểm tra `git status`. Bảo toàn thay đổi riêng trước khi cập nhật. Khi checkout sạch, dùng `git switch main`, `git pull --ff-only origin main`, rồi kiểm tra `git log -1 --oneline` có commit bàn giao V1.18. Không force pull hoặc xóa thay đổi riêng.
2. Cài dependency theo lockfile bằng `npm ci` nếu cần. Mỗi người đăng nhập Neon bằng quyền của mình và giữ `.env.neon` ở máy cá nhân; không gửi connection string vào Git. Không sao chép file `.env.neon` hay backup từ máy người khác.
3. Chạy `setup.bat`, chọn **5. Dùng database chung Neon**. Option này xác minh source/provenance, target và **catalog V1.18 chính xác bằng truy vấn chỉ đọc**, tạo Prisma Client tại máy nếu thiếu, và chỉ hỏi khởi động sau khi kiểm tra đạt. Nó không migrate, seed, reset, fetch/switch Git hoặc tự dừng process. Cổng 3000/4000 phải trống; nếu đang bận, xác minh và đóng đúng ứng dụng của mình trước khi thử lại.
4. Sau lần cấu hình đầu, có thể chạy `npm run dev:neon`. Frontend mặc định `http://localhost:3000`, API `http://localhost:4000`. Runner cũng kiểm tra source, target và catalog trước khi mở dịch vụ. Không chạy các lệnh `db:migrate`, `db:seed`, `db:bootstrap`, `db push` hoặc reset trên Neon chung.

File cấu hình xem trước chỉ đọc trong `.local/` không thuộc Git và không phải lệnh khởi động thông thường. Chỉ dùng source đầy đủ trên `main`; không chép riêng script setup hay validator vào checkout cũ.

## Giới hạn cần biết

- Metadata ảnh phòng hiện có trong Neon, nhưng file ảnh nguồn tương ứng chưa được cung cấp cho máy chạy. Nếu chưa có thư mục riêng tư chứa file và `ROOM_IMAGE_STORAGE_ROOT` trỏ đúng tới đó, API ảnh trả 503; thẻ và chi tiết phòng hiển thị fallback. Không mở public kho ảnh riêng tư hoặc coi metadata là ảnh đã hoạt động.
- Chưa có provider gửi lời mời Owner hoặc đặt lại mật khẩu. Trên Neon, các thao tác khởi tạo này trả `DELIVERY_NOT_CONFIGURED` trước khi tạo token/Owner; không có link bí mật hoặc thông báo gửi thành công. Chức năng Superadmin khác vẫn cần tài khoản và quyền phù hợp; không tự tạo tài khoản hay cấp quyền.
- Kiểm thử giao dịch Superadmin ở cấu hình production trên PostgreSQL tạm **chưa hoàn tất sau các sửa đổi mới nhất**. Các kiểm tra build/typecheck, fake-DB route và Explorer được ghi trong [runtime follow-up](NEON_V118_RUNTIME_READINESS_20261029.md) là bằng chứng của lượt trước; lần phân phối source này không chạy lại bộ giao dịch còn thiếu. Không gọi source này là đã kiểm thử đầy đủ.
- Sau khi ghép source mới của team, typecheck backend và frontend cùng kiểm tra checksum/provenance artifacts V1.16–V1.18 đều đạt. Đây là kiểm tra trực tiếp của lượt phân phối; không thay thế bộ giao dịch Superadmin còn thiếu.
- Việc đưa source lên GitHub không triển khai máy chủ cho nhóm. Mỗi thành viên phải cập nhật checkout và cấu hình Neon riêng. Không có thay đổi dữ liệu/schema Neon, tài khoản hoặc quyền trong nhiệm vụ phân phối này.

**Việc tiếp theo:** chạy luồng giao dịch Superadmin production trên PostgreSQL tạm chuyên dụng với credential độc lập; không dùng Neon chung cho dữ liệu thử.
