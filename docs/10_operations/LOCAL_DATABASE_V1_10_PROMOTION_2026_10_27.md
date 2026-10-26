# Góc Trọ — ghép database local vào V1.10

**Ngày:** 2026-10-27  
**Trạng thái:** CURRENT — local `Goctro_test3` PASS; AWS chưa triển khai  
**Đích:** PostgreSQL 18.6, `localhost:5432/Goctro_test3`

## Lý do có V1.10

GitHub `main` đã dùng V1.9 cho bảng `property_flexible_service_configurations` của Admin Flexible Service. Cùng lúc, `Goctro_test3` trên máy này được nâng từ V1.8 bằng một bản V1.9 ứng viên khác, chỉ thêm `auth_sessions`. Hai cấu trúc cùng tên V1.9 không tương đương. V1.10 giữ nguyên V1.9 của team và thêm phiên đăng nhập. Migration chính thức V1.9→V1.10 thêm `auth_sessions`; migration `V1_8_auth_to_V1_10_flexible_service_modes.sql` chỉ dùng để đưa local `Goctro_test3` từ nhánh ứng viên vào cùng cấu trúc V1.10.

## Bằng chứng

- Trước lần nâng đầu, `Goctro_test3` là V1.8 với 40 bảng. Backup `D:\codexapp\db-backups\Goctro_test3_pre_v1_9_20261026_231544.dump` đã được `pg_restore --list` kiểm tra. Bản sao có dữ liệu được nâng bằng migration auth và CORE 82/82 PASS; target thật cũng CORE 82/82 PASS, dữ liệu cũ khớp.
- Trước khi ghép với V1.9 của team, tạo backup mới `D:\codexapp\db-backups\Goctro_test3_pre_v1_10_20261027.dump`, 287.292 byte, SHA-256 `400E0A1AC4455CCF66AE422960812CBAE3FC4C2919DAEEF9C4A3C973C9A3F247`. `pg_restore --list` đọc được và khôi phục thành công vào database diễn tập.
- Dựng sạch bằng `database/baselines/v1.10/schema.sql`: 42 bảng, CORE **89/89 PASS**. Chụp `expected-catalog.json` từ bản sạch trước seed.
- Đường nâng chính thức V1.9 Flexible→V1.10 auth: database thử CORE **89/89 PASS**.
- Đường ghép nhánh auth trước→V1.10 Flexible: bản sao dữ liệu local CORE **89/89 PASS**, catalog trùng bản dựng sạch, các bản ghi cũ trùng SHA-256 chuẩn hóa `93FED45B87E5D7F4E811384A08604799127AB68A0C8C5595FE518DFFC78DC259`.
- Áp dụng đúng migration nhánh auth trước lên target với `goctro.allow_locked_db_migration=V1.10` trong một phiên: 42 bảng, 6 Account, cả `auth_sessions` và `property_flexible_service_configurations` hiện diện. CORE **89/89 PASS**. Bản ghi cũ trước/sau target trùng cùng SHA-256 ở trên. Không chạy seed lên target và không sửa dữ liệu nghiệp vụ.
- Backend typecheck/build PASS; Auth 20/20, Accounts 19/19, tích hợp phiên PostgreSQL 1/1 PASS trên database thử V1.10. Bài tích hợp không ghi vào target thật.
- Seed tổng hợp V1.10 và fixture kế thừa đã điều chỉnh kiểm kê 42 bảng: **171/171 PASS** trên database thử. Không chạy fixture này trên target thật.

## Ranh giới

Backup chứa dữ liệu thật và được giữ **ngoài Git**. Git chứa schema, migration, validator và mã ứng dụng; push `main` không tự tạo hoặc đồng bộ database AWS. `Goctro_dev_v18` được nhắc trong commit V1.9 của team nhưng không tồn tại trên PostgreSQL localhost:5432 của máy kiểm tra này; báo cáo này chỉ xác nhận `Goctro_test3`. V1.9 của team vẫn được giữ nguyên trong Git như tiền nhiệm. Việc khôi phục backup lên target cần một lượt vận hành riêng với xác nhận đúng đích.
