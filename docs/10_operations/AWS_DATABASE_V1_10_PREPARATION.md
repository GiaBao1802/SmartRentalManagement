# Góc Trọ — Chuẩn bị database AWS cho bản demo

**Trạng thái:** CURRENT — file dựng khung đã kiểm tra, database local đã lên V1.10; chưa tạo tài nguyên AWS  
**Ngày:** 2026-10-27  
**Vùng:** `ap-southeast-2`.

## Khung database

`database/baselines/v1.10/schema.sql` dựng mới đầy đủ 42 bảng, gồm cả `property_flexible_service_configurations` và `auth_sessions`. `seed.sql` chứa dữ liệu mẫu tổng hợp và là bước tùy chọn. Hai migration có phiên bản dành riêng cho database đã có dữ liệu; không dùng khi dựng database AWS mới.

Đã thử trên PostgreSQL 18.6: dựng mới V1.10, nâng từ V1.9 của team và ghép từ nhánh auth local đều qua CORE 89/89. Bản dựng mới và bản ghép local có cùng danh mục cấu trúc. `Goctro_test3` đã nâng lên V1.10 ngày 2026-10-27 sau khi sao lưu và diễn tập trên bản sao; dữ liệu cũ được bảo toàn. Xem [báo cáo nâng cấp local](LOCAL_DATABASE_V1_10_PROMOTION_2026_10_27.md).

## AWS hiện có và cấu hình dự kiến

AWS CLI profile `sonhung` đã được xác nhận chỉ đọc. Ở `ap-southeast-2` chưa tạo database hoặc máy chạy web cho dự án. Project ở Free Plan, còn 99,98 USD tín dụng lúc kiểm tra ngày 2026-10-26. Gói Lightsail Linux 8 GB / 2 vCPU / 160 GB có IPv4 là 44 USD/tháng theo API AWS ở vùng này. Tín dụng và giá có thể đổi; kiểm tra lại trước khi tạo.

Phương án hiện hành cho demo ít người dùng là **một máy Lightsail 8 GB** chạy web, PostgreSQL và Ollama với Qwen3 1.7B/4B; dùng một mô hình tại một thời điểm và đo tốc độ thực tế. Database AWS sẽ được tạo mới trực tiếp từ `database/baselines/v1.10/schema.sql`. Ban đầu chỉ nạp **khung trống** và chạy CORE validator; không tự chép dữ liệu local hoặc chạy seed. PostgreSQL và Ollama chỉ lắng nghe nội bộ máy; chỉ mở web HTTPS ra ngoài. Cần lưu bản sao dữ liệu và cấu hình ngoài máy trước khi coi đây là bản demo có thể phục hồi.

Phương án RDS riêng khoảng 21,01 USD/tháng được khảo sát trước đó đã **bị thay thế** theo quyết định dùng một máy. Lightsail 8 GB là 44 USD/tháng nếu dùng trọn tháng; dừng máy vẫn bị tính phí cho tới khi xóa. Backup/snapshot, dữ liệu truyền vượt gói, tên miền và thuế có thể tính thêm. Tín dụng miễn phí sẽ bị trừ dần; khi hết tín dụng hoặc Free Plan hết hạn, cần nâng gói để giữ tài nguyên hoạt động.

## Trình tự triển khai AWS

1. Dùng GitHub `main` làm nguồn mã đã kiểm tra; xác nhận lại project, vùng `ap-southeast-2`, gói 8 GB và số dư tín dụng.
2. Tạo Lightsail, cài PostgreSQL 18.6 và Ollama. Chỉ cho phép cổng quản trị từ địa chỉ tin cậy; không mở cổng PostgreSQL/Ollama công khai.
3. Tạo database mới trên máy AWS, chạy `schema.sql` V1.10 và CORE validator. Không chạy fixture nếu không nạp seed.
4. Cấu hình backend kết nối database qua nội bộ, bí mật phiên ngoài Git; đưa frontend/backend lên HTTPS và kiểm tra đăng nhập/phiên. Kết nối Cloudy với Ollama là bước ứng dụng riêng vì Cloudy hiện chỉ có giao diện thử.
5. Thiết lập sao lưu, kiểm tra phục hồi, theo dõi RAM/CPU/độ trễ AI và chi phí. Nếu 8 GB hoặc 2 vCPU không đủ, đo rồi mới nâng máy.

Git `main` giữ **mã và khung** V1.10 sau khi push, không chứa dữ liệu thật, mật khẩu hoặc database đang chạy. Đẩy Git không tự tạo máy hay đồng bộ dữ liệu. Chưa có backend/database AWS để kiểm tra kết nối.

Nguồn: [Lightsail bundles](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-bundles.html), [Lightsail billing](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-frequently-asked-questions-faq-billing-and-account-management.html), AWS CLI read-only trong project.
