# Góc Trọ — Lưu phiên đăng nhập bền vững để chuẩn bị đưa web lên AWS

**Trạng thái:** CURRENT — mã nguồn đã kiểm tra; ứng viên auth V1.9 là lịch sử, schema hiện hành gộp trong V1.10; AWS chưa triển khai  
**Ngày:** 2026-10-26  
**Phạm vi:** nơi giữ phiên cho Admin/Resident hiện có. Chưa triển khai vai trò Superadmin, dịch vụ gửi liên kết hay hạ tầng AWS.

## Đã làm

1. Thêm script nâng cấp từ V1.8 sang V1.9 dự kiến, tạo bảng `auth_sessions` với dấu kiểm tra của mã phiên, tài khoản, thời điểm tạo/truy cập/hết hạn. Có khóa ngoại, giới hạn thời gian, chỉ mục để thu hồi theo tài khoản và dọn phiên hết hạn. Script chặn chạy lại và chặn tự áp dụng lên `Goctro_test3`. Bổ sung `schema.sql` V1.9 để dựng mới trực tiếp; `seed.sql` dữ liệu mẫu giữ nguyên từ V1.8.
2. Backend production dùng PostgreSQL chung cho phiên; dev/test tiếp tục dùng bộ nhớ. Khi khởi động ở production, backend kiểm tra bảng phiên đã tồn tại trước khi mở cổng. Cookie vẫn là mã ngẫu nhiên chỉ nằm ở trình duyệt; database chỉ lưu HMAC. Mỗi yêu cầu xác thực tiếp tục đọc trạng thái Account. Phiên vừa bị thu hồi trong khi xử lý không được gia hạn thành công.
3. Khi có hoạt động, backend gia hạn cả phiên phía server và cookie phía trình duyệt, tối đa theo hạn tuyệt đối. Điều này sửa tình trạng cookie hết sau 30 phút dù phiên phía server đã được gia hạn.

## Đã kiểm tra

| Kiểm tra | Kết quả |
|---|---|
| Backend typecheck và build | PASS |
| Auth HTTP hiện có | 20/20 PASS |
| Accounts/khóa tài khoản | 19/19 PASS |
| PostgreSQL 18.6 V1.8 + seed + migration V1.9 trên database tạm | PASS |
| PostgreSQL 18.6 dựng mới từ schema V1.9; đối chiếu với đường V1.8→V1.9 | Cùng cấu trúc, 41 bảng |
| CORE V1.9 và fixture trên cả hai đường | 82/82 và 171/171 PASS mỗi đường |
| HTTP với phiên PostgreSQL: đăng nhập ở một nơi, đọc ở nơi thứ hai; cookie gia hạn; đăng xuất; hết hạn; khóa/mở khóa; thu hồi tất cả phiên | 1/1 bài tích hợp PASS |

Đây là bằng chứng của giai đoạn triển khai mã ban đầu: V1.9 auth là ứng viên trên nhánh local, được kiểm tra trước khi commit V1.9 Flexible của team xuất hiện. Sau đó `Goctro_test3` đã được sao lưu, diễn tập và ghép vào **V1.10**, gồm cả hai bảng mới. Đường dựng sạch và hai đường nâng cấp V1.10 đều qua CORE 89/89; xem [báo cáo nâng cấp local](../../10_operations/LOCAL_DATABASE_V1_10_PROMOTION_2026_10_27.md). Bài tích hợp cần biến `GOCTRO_AUTH_SESSION_TEST_DATABASE_URL` trỏ đến database thử nghiệm; nếu không có biến, bài kiểm tra tự bỏ qua.

## Còn lại trước khi đưa lên AWS

- Chưa tạo database AWS. Khi triển khai, cần tạo mới từ schema V1.10, kiểm tra lại và chỉ sau đó khởi động backend. `Goctro_test3` hiện là V1.10 bị khóa. Prisma mapping không khai báo `auth_sessions`; backend truy cập bảng này bằng SQL riêng.
- Bí mật `SESSION_SECRET` phải giống nhau ở mọi tiến trình backend và được giữ ngoài mã nguồn. Chưa cấu hình AWS Secrets Manager, tên miền, HTTPS, database AWS hoặc pipeline triển khai.
- Các cổng sản phẩm khác vẫn riêng: Superadmin chưa được triển khai; Zalo/luồng cấp tài khoản production và giới hạn đăng nhập dùng chung nhiều tiến trình chưa được hoàn tất. Báo cáo này chỉ xác nhận phần **phiên đăng nhập**.

**Bước kế tiếp của nhánh này:** dùng GitHub `main` sau khi push làm nguồn triển khai AWS, tạo máy Lightsail 8 GB ở `ap-southeast-2`, cài PostgreSQL trên máy đó, dựng database mới bằng schema V1.10 rồi chạy validator. Chỉ sau khi có kết quả thật mới kết luận đã có database AWS.
