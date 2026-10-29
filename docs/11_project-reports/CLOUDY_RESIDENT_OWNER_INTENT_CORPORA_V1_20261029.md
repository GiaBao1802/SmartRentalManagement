# Bộ ngữ cảnh Cloudy Resident và Cloudy Owner V1

Ngày: 2026-10-29

Trạng thái: REFERENCE — bộ ví dụ có nhãn để đánh giá và chuẩn bị dữ liệu; chưa nạp corpus vào ứng dụng và chưa fine-tune trọng số model.

## Phạm vi

Tạo bộ riêng cho hai trợ lý còn lại, giữ ranh giới quyền của từng vai trò và dùng câu hỏi tiếng Việt tự nhiên, cách nói thân mật, câu thiếu thông tin, câu nối theo ngữ cảnh và yêu cầu ngoài phạm vi. Mỗi bộ có 40 câu: 28 câu tham khảo và 12 holdout không dùng để chỉnh ví dụ.

- [Resident Cloudy corpus V1](../../data/cloudy-resident/v1/assistant-corpus.json): hóa đơn, tiện ích/đặt lịch, gửi chỉ số, yêu cầu sửa chữa hoặc bổ sung thiết bị, câu hỏi cần làm rõ và câu nối có giới hạn.
- [Owner Cloudy corpus V1](../../data/cloudy-owner/v1/assistant-corpus.json): hóa đơn chưa thanh toán, giải thích điện nước, dữ liệu còn thiếu, việc cần kiểm tra, yêu cầu khách, thống kê cư dân, phòng trống, xe, điện năng, yêu cầu thường gặp và các câu phải chặn trước khi ghi dữ liệu.

Mỗi ví dụ có nhãn đích và ranh giới xử lý. Corpus không chứa tên, số điện thoại, tài khoản, mã phòng, mã hóa đơn hoặc dữ liệu sản xuất. Với cư dân, mục tiêu là chỉ mở luồng phù hợp; việc đặt lịch, gửi chỉ số hay gửi yêu cầu vẫn cần thao tác xác nhận riêng. Với chủ trọ, truy vấn chỉ đọc và nằm trong Owner scope do backend xác thực; lệnh thay đổi dữ liệu không được thực hiện như một câu hỏi tra cứu.

## Cải thiện từ holdout

Lượt chạy đầu cho thấy các câu “đặt giờ dùng hồ bơi”, “tiền điện tính ra sao”, “chưa có ai thuê”, và cách nói “báo hư/sửa chữa” chưa được nhận diện ổn định. Đã bổ sung biến thể đặt giờ cho phân loại đặt dịch vụ; mở rộng router Owner cho các cách hỏi phổ biến về dữ liệu thiếu, điện nước, hóa đơn chưa thanh toán, việc cần kiểm tra, phòng chưa có người thuê và yêu cầu sửa chữa. Câu chỉ đạo mơ hồ “xử lý hết…” nay dừng ở bước làm rõ, không bị diễn giải thành yêu cầu xem tổng quan.

Prompt Qwen Owner có thêm ví dụ ngắn về tiền điện nước, hóa đơn nháp thiếu chỉ số và việc cần kiểm tra, dựa trên phần tham khảo. Đây là prompt example, không phải fine-tuning.

## Kiểm tra

- Cấu trúc, nhãn và giới hạn an toàn của hai corpus: **4/4** kiểm tra đạt.
- Resident và Owner holdout qua đúng luồng router/classifier hiện có: **24/24** đạt bằng Qwen3 1.7B cục bộ kết hợp các luật định tuyến của ứng dụng.
- Kiểm tra bổ sung Qwen Owner tách khỏi router cho bốn intent chính: **3/4** đạt. Model riêng vẫn chọn `clarify` với câu “Tiền điện tháng trước tính ra sao?”; trong ứng dụng, router xác định đúng `utilities` trước khi gọi model. Đây là giới hạn còn lại của model độc lập.
- Backend Resident, Owner intent/server và Owner advisor tests: **34/34** đạt; Owner demo tests: **9/9** đạt.
- Frontend và backend typecheck: **đạt**.

Các lần chạy live dùng Ollama local. `DATABASE_URL` trong evaluator là địa chỉ giả `cloudy-eval.invalid`; evaluator không kết nối database, không đọc danh sách phòng/hóa đơn thật và không ghi dữ liệu.

Chạy lại:

```powershell
python -B -m unittest scripts.cloudy-ai.test_resident_owner_corpora
node node_modules/tsx/dist/cli.mjs --test backend/src/resident-assistant/assistant.test.ts frontend/src/lib/owner-chat-intent.test.ts frontend/src/lib/owner-advisor-server.test.ts
node --test scripts/owner-advisor-demo/test.mjs
$env:DATABASE_URL='postgresql://cloudy-eval.invalid/unused'; node node_modules/tsx/dist/cli.mjs scripts/cloudy-ai/evaluate_owner_resident.ts
npm --workspace frontend run typecheck
npm --workspace backend run typecheck
```

## Giới hạn và bước tiếp theo

Hai JSON là bộ tham khảo/holdout độc lập, chưa được ứng dụng nạp tự động và chưa biến thành model fine-tuned. Kết quả holdout nhỏ chỉ xác nhận các ví dụ này chạy đúng trên cấu hình hiện tại, không đảm bảo hiểu mọi cách diễn đạt. Tiếp tục bổ sung câu thực tế đã được làm sạch vào phiên bản tham khảo; giữ holdout riêng để đo lại sau mỗi lần đổi prompt hoặc router. Project Exact Next Task không đổi.
