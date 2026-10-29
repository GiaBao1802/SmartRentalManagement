# Cloudy — bộ ngữ cảnh tìm phòng V2

Ngày: 2026-10-29

Trạng thái: REFERENCE — ứng viên dữ liệu huấn luyện và tập holdout; chưa nạp vào runtime, chưa fine-tune model.

## Mục tiêu và phạm vi

Mở rộng câu hỏi tìm phòng của khách thuê để bao quát nhiều điều kiện trong một câu, cách nói ngắn/không dấu, tiếp tục hoặc sửa lượt tìm, và những yêu cầu cần hỏi lại. Bộ dữ liệu bám theo phạm vi tin đăng công khai trong [Requirement §4](../../01_REQUIREMENTS.md#4-trang-công-khai-và-tìm-phòng) và luồng Cloudy local chờ xác nhận trong [API Spec](../../04_API_SPEC.md#local-only-cloudy-ai-demo--authorized-2026-10-28): chỉ lọc địa điểm công khai, giá thuê, diện tích, sức chứa và tiện ích có cấu trúc; chỉ truy vấn sau khi khách xác nhận.

File: [`data/cloudy-guest/v2/room-search-corpus.json`](../../../data/cloudy-guest/v2/room-search-corpus.json).

## Nội dung

Corpus có **40 tình huống** tách thành hai phần để không dùng câu đánh giá làm ví dụ tham khảo:

- **28 training reference:** câu nhiều điều kiện, ngân sách viết tắt, không dấu, tiện ích, lọc tiếp, thay/bỏ tiêu chí, bắt đầu lượt mới, giá mơ hồ, phủ định tiện ích, vị trí tương đối và thuộc tính chưa có dữ liệu xác minh.
- **12 holdout:** để đánh giá riêng; gồm tìm phòng nhiều trường, xem tất cả tin công khai, sửa yêu cầu, tiếp nối mơ hồ và các tình huống ngoài phạm vi. Không dùng phần này làm ví dụ tham khảo khi đánh giá.

Mỗi câu có nhãn đích dạng cấu trúc cùng giới hạn xử lý. `ready` yêu cầu tóm tắt toàn bộ tiêu chí và chờ xác nhận; `needs_clarification` yêu cầu nói rõ điều chưa biết, giữ nguyên giới hạn an toàn và chưa truy vấn. Tiêu chí tiếp nối bắt đầu từ `context` đã được khách chấp nhận. Lượt `new` bỏ ngữ cảnh cũ.

## Thay đổi kèm theo và kiểm tra

Khi chạy corpus qua parser, câu “rẻ hơn nữa” có thể bị nhầm là địa điểm; ranh giới địa điểm cũng có thể cắt tên thành phố “Nha Trang” hoặc “Hải Phòng”. Đã sửa dò ứng viên để không coi so sánh mơ hồ là địa điểm và giữ nguyên các tên này. Bộ định tuyến câu hỏi thú cưng cũng nhận ra “mình cần phòng” là ngữ cảnh tìm phòng, tránh chuyển nhầm yêu cầu có nuôi mèo thành câu hỏi nội quy.

- Bộ Python Cloudy: **51/51** tests đạt.
- Kiểm tra cấu trúc và 40 nhãn qua luồng xác nhận/làm rõ hiện tại: **3/3** tests đạt.
- Qwen3 1.7B trên holdout: **12/12** đạt. Một câu OR về mèo/chó được xử lý bởi luật an toàn tất định trước model; 11 câu còn lại gọi model. Không xác nhận tìm phòng và không đọc database/phòng.
- Không đổi API, database, dữ liệu phòng hoặc trọng số model. Corpus không được app nạp tự động; holdout không phải bằng chứng cho độ chính xác tổng quát của Cloudy.

Sau đó, kiểm tra chat thực tế cho thấy các câu ngắn như “tìm phòng 20m2” bị báo là cụm không hiểu. Parser hiện nhận diện m²/m2 kể cả khi model bỏ sót, rồi hỏi khách chọn diện tích tối thiểu, tối đa hay khoảng trước khi tìm. Cách ghi “20 m” được nhận diện là diện tích nhưng hỏi xác nhận đơn vị m². Python tests cho candidate/parser 18/18, worker 11/11 và corpus structure 3/3 đạt; holdout Qwen vẫn đạt 12/12.

Chạy kiểm tra cục bộ:

```powershell
python -B -m unittest discover -s scripts/cloudy-ai -p "test_room_search_training_corpus.py"
python -B scripts/cloudy-ai/evaluate_room_search_corpus.py
```

## Bước sử dụng sau này

Trước khi fine-tune model trả tiêu chí, cần chuyển các nhãn này thành đúng cặp prompt/JSON target mà runtime sử dụng, tăng holdout độc lập theo lỗi quan sát được, rồi so sánh kết quả với Qwen hiện tại. Corpus hiện chỉ giúp kiểm tra hồi quy và chuẩn bị dữ liệu; nó chưa làm Cloudy hiểu thêm các câu trong production.
