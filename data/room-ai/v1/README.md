# Bộ phòng giả lập cho AI local — v1

300 phòng / 60 khu trọ, hoàn toàn giả lập; có thể lưu Git và dùng offline. Không có tài khoản, mật khẩu, số điện thoại, CCCD, địa chỉ thật hoặc thông tin khách thuê. Đây không phải 300 tin cho thuê thật.

## File sử dụng

- `rooms.json`: danh mục nguồn, gồm metadata, từ điển tiện ích, 60 properties và 300 rooms.
- `train.jsonl`: 720 mẫu chat từ 180 phòng.
- `validation.jsonl`: 240 mẫu từ 60 phòng.
- `test.jsonl`: 240 mẫu từ 60 phòng khác.
- `stats.json`: thống kê phạm vi/độ đa dạng.
- `manifest.json`: SHA-256 để kiểm tra file sau khi chia sẻ qua Git.

Mỗi JSONL chứa `messages` theo role system/user/assistant và metadata `room_id`, `property_id`, `split`, `task`, `synthetic`. Nếu công cụ fine-tune chỉ nhận messages, hãy bỏ metadata khi chuyển đổi. Chưa chạy fine-tune hoặc benchmark model thật trên bộ này.

## Phạm vi và ý nghĩa dữ liệu

12 chủ đề, mỗi chủ đề 25 phòng: sinh viên, tiết kiệm, người đi làm, ca đêm, gia đình, thú cưng, studio, gác lửng, sân vườn, làm việc tại nhà, co-living thuê cả phòng, ưu tiên tiếp cận.

Giá thuê 1,2–6,7 triệu đồng/cả phòng/tháng; sức chứa 1–5 người. Có nội thất, điều hòa, tủ lạnh, máy giặt, sân vườn, ban công, thang máy, lối vào không bậc, điểm sạc xe điện và nhiều tổ hợp khác. Có/không có một tiện ích được biểu diễn bằng tập `features`, không suy diễn theo chủ đề.

`access.mode`:
- `24h`: ra vào 24/7, vẫn có giờ yên tĩnh.
- `curfew`: cửa mở/đóng đúng `gate_opens`/`gate_closes`; chưa có ngoại lệ về trễ.
- `notify_late`: về trễ phải báo trước `late_notice_before`, không coi là 24/7 vô điều kiện.
- `unknown`: chưa biết; AI phải hỏi thêm.

Có giờ tiếp khách, quy định khách qua đêm, nấu ăn, thú cưng có giới hạn cân nặng và cần duyệt, hút thuốc, chủ ở cùng, lịch hẹn xem phòng, thời hạn thuê và tiền cọc. Không diễn giải nhãn “ưu tiên tiếp cận” thành chứng nhận đủ tiêu chuẩn tiếp cận.

Tiền trong pricing là số nguyên VND. `estimated_total_month_vnd` = thuê + điện theo kWh + nước theo m³ + internet + dịch vụ + đỗ xe, theo `estimate_assumptions` của từng phòng. Không gồm tiền cọc; không phải báo giá, không phải resolver hóa đơn của V1.8. So sánh các tổng có assumptions khác nhau cần chuẩn hóa trước. null là chưa biết/không áp dụng theo trường, không được đổi thành 0. Phí đỗ xe null nghĩa là không có chỗ để xe; flood_history null nghĩa là chưa biết.

Các khu/địa chỉ, thời gian đi tới Trường A/Văn phòng B/Khu công nghệ C đều giả lập. Không có tọa độ thực, không xác nhận tình trạng ngập/an ninh. `availability.as_of` là ngày chụp dữ liệu mẫu 2026-10-26, không tự cập nhật theo ngày hiện tại. Chỉ trạng thái available được đề xuất cho nhu cầu thuê ngay.

## Sử dụng với AI

1. Dùng rooms.json làm nguồn truy xuất: lọc các điều kiện cứng bằng code trước, gửi phòng phù hợp vào context.
2. Dùng JSONL để luyện/đánh giá cách đọc chi phí, nội quy, tình trạng và trả lời chưa biết. Đáp án sinh từ trường có nguồn, không phải lời nhận xét của người thuê.
3. Giữ nguyên split theo khu trọ: không dùng validation/test để train. Mỗi tập có đủ 12 chủ đề. Tuy nhiên các mẫu câu/kiểu sinh giống nhau giữa các tập; kết quả chỉ đo dữ liệu tổng hợp, không chứng minh hiểu tiếng Việt thực tế. Cần bộ câu hỏi độc lập do người viết trước khi đánh giá chất lượng.
4. Bộ này chưa nối vào Cloudy, chưa thay catalog 18 phòng của room-advisor-demo (schema cũ khác), chưa import PostgreSQL. Một số trường như giờ cổng/quy định thú cưng không có ánh xạ trực tiếp sang public Room DTO V1.8; không tự bỏ mất trường để import.

Từ thư mục gốc dự án:

```powershell
npm.cmd run data:rooms:check
# Chỉ tái tạo khi muốn trở lại toàn bộ dữ liệu v1 chuẩn; lệnh ghi đè các file sinh:
npm.cmd run data:rooms:generate
```

Sau khi push các file này, người khác pull là đọc được JSON/JSONL giống nhau, không cần cloud, Ollama hoặc PostgreSQL để kiểm tra. Không cần chạy setup để có file; setup không tự ghi chúng vào database. Generator cố định seed 20261026; khi sửa thủ công dữ liệu cần quản lý phiên bản/manifest tương ứng, không chạy generate đè lên thay đổi cần giữ.
