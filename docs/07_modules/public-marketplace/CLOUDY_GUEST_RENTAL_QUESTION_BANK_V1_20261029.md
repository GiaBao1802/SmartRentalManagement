# Cloudy — bộ câu hỏi khách thuê V1

Ngày: 2026-10-29  
Trạng thái: CURRENT — bộ đánh giá và cải thiện local development; không huấn luyện model, không đổi hành vi production.

## Mục tiêu

Chuẩn bị các câu hỏi tự nhiên mà người đang tìm chỗ thuê thường hỏi Cloudy, kèm route kỳ vọng và giới hạn câu trả lời để sau này cải thiện tư vấn mà không bịa thông tin. Bộ JSON dùng làm tập kiểm tra hồi quy/đánh giá trước khi bật thêm chủ đề; nó không phải nguồn dữ liệu phòng hay câu trả lời mẫu.

File câu hỏi: [`data/cloudy-guest/v1/question-bank.json`](../../../data/cloudy-guest/v1/question-bank.json).

## Phạm vi hiện có của Cloudy khách

Theo Requirement §4, Cloudy công khai có thể hỗ trợ tìm phòng theo tỉnh/thành/địa chỉ, giá thuê, diện tích, sức chứa, tiện ích phòng có cấu trúc do chủ trọ xác nhận và tên tiện ích chung đang hoạt động của khu trọ. Guest phải xác nhận bộ lọc trước khi Cloudy truy vấn. Cloudy có thể mở luồng liên hệ hiện có; sản phẩm V1 không đặt lịch xem, giữ phòng, nhận cọc hoặc thanh toán.

API công khai hiện có thể trả thông tin phòng/khu trọ, giá thuê mặc định, diện tích, sức chứa, mô tả công khai, tiện ích đã xác nhận, tên tiện ích chung và metadata ảnh. API không cung cấp chính sách cọc/hợp đồng/khách qua đêm, giá điện nước/phí gửi xe, lịch/giá/sức chứa hiện thời của facility, lịch xem, tình trạng ngập/an ninh, hay khoảng cách tới địa điểm. Không được lấy dữ liệu Resident/Owner, hóa đơn hay dataset demo để trả lời guest.

Vì vậy, bộ câu hỏi phân thành ba hướng xử lý:

1. **Tìm/lọc phòng:** hiểu ý, tạo JSON điều kiện, nêu lại cho khách và đợi xác nhận. Không sinh SQL, không tự nới điều kiện.
2. **Thông tin có trong tin công khai:** trả lời chỉ từ đúng phòng/khu trọ đang được xem và nêu rõ khi không xác minh được.
3. **Thông tin chưa có hoặc ngoài phạm vi:** nói rõ chưa có dữ liệu/chưa hỗ trợ, hỏi lại nếu thiếu thông tin, hoặc hướng khách tới form liên hệ. Không tự suy diễn câu trả lời.

## Nhóm câu hỏi trong bộ V1

JSON có **53 tình huống** gồm tìm phòng (địa điểm, ngân sách, diện tích, số người, thiết bị, thú cưng, facility), lọc tiếp/lọc mới, đọc tin phòng/ảnh, tiền thuê và phí, cọc/hợp đồng/nội quy, facility và quyền sử dụng, điều kiện phòng/khu vực, bảo trì, xem phòng và ngày chuyển vào.

Một tập holdout riêng [`edge-question-bank.json`](../../../data/cloudy-guest/v1/edge-question-bank.json) bổ sung 18 câu nhắn nhanh/thiếu dấu và nối tiếp hội thoại. Nó kiểm tra cách nói “đổ lại”, “giá vẫn như cũ”, bỏ điều kiện có từ đệm, vị trí đứng sau các tiện ích, điều kiện phủ định/lựa chọn, yêu cầu khoảng cách chưa hỗ trợ và các FAQ cần chủ trọ xác nhận. Tập này không được nạp vào runtime hoặc dùng fine-tune.

Các trường cần chú ý:

- `id`, `group`, `message`: câu đầu vào và nhóm đánh giá.
- `mode`, `context`: có ở các tình huống kiểm tra nối tiếp hội thoại.
- `expected_route`, `expected_filters`: hành vi/ý định cần nhận diện; một số route là giới hạn được ghi lại để không nhầm hướng dẫn trên Marketplace với tính năng chat.
- `boundary`: điều Cloudy không được khẳng định hoặc bỏ qua.

## Cải thiện local đã thực hiện — 2026-10-29

- Câu hỏi rõ ý nhưng cần dữ liệu chưa công khai (cọc, phí, hợp đồng, nội quy, tình trạng phòng, bảo trì, xem/giữ phòng, thông tin của một tin cụ thể) được phản hồi là Cloudy hiểu chủ đề nhưng chưa có dữ liệu xác nhận, sau đó hướng khách tới form liên hệ trong chi tiết phòng. Câu thật sự chưa hiểu vẫn trích cụm chưa rõ và chờ khách diễn đạt lại.
- “Có tiện ích gì?” hỏi khách muốn xem tiện ích trong phòng hay tiện ích chung. “Mèo hoặc chó” hỏi chọn mèo, chó hay cả hai để tránh vô tình lọc thành điều kiện AND sai ý. Câu tìm tiện ích chung hướng khách tới bộ lọc Marketplace hiện có; chat chưa thêm facility vào filter context.
- Các câu nối tìm kiếm hỗ trợ tiền tố “Lọc mới/Lọc tiếp”, “còn giá giữ nguyên” và cách nói “thôi bỏ giới hạn giá”. “Tầm A đến B m²” hiểu là khoảng đã nêu; “tầm 20 m²” đơn lẻ vẫn cần làm rõ, không bị đoán thành diện tích tối thiểu.
- Kiểm tra câu đời thường đã bổ sung cách gọi “tìm/cần trọ” trước địa điểm, “đổ lại” như giới hạn giá tối đa, từ nối “nhưng” giữa điều kiện số, “giá vẫn như cũ” khi đổi khu vực và “thôi bỏ giá đi nhé”. Cụm gần trường/quanh đây không bị nhận nhầm thành tên địa điểm.
- Câu tư vấn đã nhận diện nhưng thiếu dữ liệu không gọi model và không truy vấn phòng. Luồng lọc phòng vẫn cần xác nhận; kết quả chỉ đọc qua public API sau xác nhận.

## Nguồn tham khảo để chọn chủ đề

Nguồn được dùng để chọn **chủ đề câu hỏi**, không dùng để xác lập luật hay câu trả lời cho từng tin đăng. Hướng dẫn chỗ ở của RMIT Việt Nam gợi ý người thuê hỏi về ngân sách/khu vực, phí dịch vụ, xem phòng, chi phí tiện ích, cọc, trách nhiệm sửa chữa và quy định khách/thú cưng/giờ yên tĩnh. Checklist tiếng Việt của Alberta được dùng thêm như một danh sách câu hỏi thực tế về giá, cọc, điện nước, chỗ gửi xe, internet và sửa chữa; đó không phải quy định áp dụng ở Việt Nam.

- [RMIT Vietnam — Accommodation advice for international students in Vietnam](https://www.rmit.edu.vn/content/dam/rmit/vn/en/assets-for-production/documents/pdfs/students/accommodation/accommodation-advice-for-international-students-in-vietnam.pdf)
- [Government of Alberta — Checklist and sample cleaning list for tenants (Vietnamese)](https://www.alberta.ca/system/files/custom_downloaded_images/sa-checklist-sample-cleaning-list-vietnamese.pdf)

## Kiểm tra

JSON có 53 tình huống, 8 nhóm, ID duy nhất và các trường bắt buộc đầy đủ. Tập edge có 18 tình huống. Bộ Python Cloudy đạt **60/60 PASS**. Live runner [evaluate_guest_question_bank.py](../../../scripts/cloudy-ai/evaluate_guest_question_bank.py) đánh giá **53/53 PASS** với Qwen3 1.7B; tập [edge](../../../scripts/cloudy-ai/evaluate_guest_edge_question_bank.py) đạt **18/18 PASS**, trong đó FAQ an toàn được trả lời không gọi model. Bộ tìm phòng holdout riêng đạt **12/12 PASS**. Các runner không gọi database.

Không thay API, schema, database, model, dataset phòng hoặc production. Cloudy development local thay đổi. Không dùng Computer Use.
