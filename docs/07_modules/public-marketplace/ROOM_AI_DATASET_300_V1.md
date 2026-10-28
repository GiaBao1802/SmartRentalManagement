# Bộ 300 phòng cho AI local — 2026-10-26

CURRENT — synthetic dataset v1; chưa fine-tune, chưa import DB hoặc nối Cloudy.

Cập nhật 2026-10-27: người dùng yêu cầu tiếp tục demo trên `rooms.json`. Đã thêm adapter đọc nguyên trạng vào room-advisor, chuẩn hóa chi phí theo số người và chia nhóm Qwen3 1.7B; cổng demo 4326. Không sửa dữ liệu/manifest/split. Chi tiết và giới hạn kiểm thử nằm trong [báo cáo demo](LOCAL_ROOM_ADVISOR_DEMO_REPORT.md). Các đoạn bên dưới ghi lại trạng thái lúc tạo dataset ngày 26/10.

Tạo `data/room-ai/v1/`: 300 phòng, 60 khu, 12 chủ đề (25 phòng/chủ đề), 19 tiện ích, 4 dạng giờ giấc (95 ra vào 24h, 70 có giờ cổng, 70 báo trước về trễ, 65 chưa rõ). 210 available, 30 occupied, 30 maintenance, 30 available_later; giá thuê cả phòng 1,2–6,7 triệu/tháng.

1.200 mẫu hỏi–đáp có JSON nguồn, bốn tác vụ chi phí/giờ giấc/nấu ăn-thú cưng/trạng thái-thông tin chưa biết. Split theo khu trọ: train 720 mẫu, validation 240, test 240; đủ 12 chủ đề mỗi tập, không trùng phòng/khu giữa các tập. Mẫu câu có cùng cơ chế sinh; không coi đây là kiểm chứng tiếng Việt độc lập.

Kiểm tra tự động 6/6 PASS: số lượng/ID/FK giả lập, phép tính chi phí, nhất quán nội quy-tiện ích, độ đa dạng, split và nguồn context, hashes. Generator xác định theo seed; .gitattributes giữ byte JSON/JSONL cho Git. Không đổi schema/seed baseline V1.8, API hoặc dữ liệu PostgreSQL. Catalog demo 18 phòng và Cloudy giữ nguyên. Chưa commit/push trong công việc này.

Hướng dẫn và định nghĩa trường: [README dataset](../../../data/room-ai/v1/README.md).

Bước tiếp theo cho bộ dữ liệu: đánh giá luồng adapter bằng câu hỏi tiếng Việt chưa dùng để sinh dữ liệu và kiểm tra chất lượng xếp hạng khi có nhiều ứng viên. Không đổi Active Module/Exact Next Task của dự án.
