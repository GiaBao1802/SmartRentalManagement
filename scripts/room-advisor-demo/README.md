# Góc Trọ — demo tư vấn local

Demo độc lập, Qwen3 1.7B qua Ollama local. Có bản fixture 18 phòng và bản đọc trực tiếp 300 phòng từ `data/room-ai/v1/rooms.json`. Không phải Foxi/V1, không đọc/ghi PostgreSQL hoặc gọi API trả phí.

## Bản 300 phòng

Chạy `npm run demo:advisor:dataset`, mở http://127.0.0.1:4326. Chạy `npm run eval:advisor:dataset` để kiểm tra model thật với ba nhu cầu có tiêu chí xác nhận sẵn. File nguồn được đọc nguyên trạng; không train model, không sửa JSON/JSONL hoặc split.

Bản cải thiện số tiếng Việt trong phiên hiện tại chạy tại http://127.0.0.1:4328 (`ROOM_ADVISOR_PORT=4328`). `numbers.mjs` tạo bản số phục vụ kiểm tra/chuẩn hóa, còn đoạn gửi Qwen và evidence giữ nguyên chữ người dùng. Hỗ trợ số đơn, hàng chục/trăm, dạng không dấu và “triệu rưỡi”; ví dụ hai người → 2, hai mươi lăm phút → 25, ba triệu rưỡi → 3.500.000. Khoảng/lựa chọn số và ngân sách mỗi người vẫn cần xác nhận. Chưa hỗ trợ mọi lối nói ước lượng, tiền ghép nhiều đơn vị hoặc phân số thời gian; không coi đây là bộ hiểu số tiếng Việt đầy đủ.

Adapter chỉ đề xuất trạng thái `available`, giữ đường đi null là chưa biết, nhận số người 1–5. Tổng chi phí được tính lại trên cùng giả định 45 kWh + 3 m³ nước/người/tháng, internet/dịch vụ theo phòng, 1 xe khi đi xe máy và có chỗ xe, 0 xe khi đi buýt. Không dùng tổng có assumptions khác nhau để xếp hạng. Chưa gồm cọc/gửi xe ngoài; đây là quy ước demo, không phải hóa đơn V1 hoặc báo giá thực tế.

Giờ giấc giữ đúng 24h/có giờ cổng/báo trước/chưa biết. Chỉ 24h đạt checkbox ra vào 24 giờ. Thú cưng phải có `allowed=true`; số lượng/cân nặng/cần duyệt hiển thị ở điểm cân nhắc, chưa thể xác nhận phù hợp với từng con vật. Bộ lọc hiện hỗ trợ bốn tiện ích nấu ăn/chỗ xe/thú cưng/máy lạnh; chưa truy vấn toàn bộ tiện ích khác của dataset.

Sau xác nhận, code lọc đủ 300 phòng, không chốt trước ba phòng. Tối đa 24 ứng viên được gửi mỗi lượt; Qwen chọn tối đa ba từ mỗi nhóm, tiếp tục so sánh các phòng được chọn qua các vòng đến kết quả cuối. Mọi ứng viên đạt điều kiện được xét ở vòng đầu; không bảo đảm tương đương xếp hạng tất cả đồng thời. Giới hạn 60 giây/lượt, 15 phút/toàn quá trình. Lỗi bất kỳ nhóm nào thì trả dự phòng từ toàn bộ bộ lọc và ghi rõ không phải AI; đổi tiêu chí hủy quá trình. Chênh lệch cuối được tính với nhóm đủ điều kiện gốc.

## Chạy và sử dụng

```powershell
npm run demo:advisor
```

Mặc định http://127.0.0.1:4318, chỉ bind loopback. Nếu cổng bận, đặt `ROOM_ADVISOR_PORT` trước khi chạy. Bản luồng mới trong phiên phát triển dùng http://127.0.0.1:4325. Ollama cần model `qwen3:1.7b`.

1. Mô tả nhu cầu hoặc chọn tình huống mẫu, bấm **Nhờ AI đọc nhu cầu**.
2. Code tách mô tả thành các đoạn nguồn và giới hạn lựa chọn theo loại tiêu chí; Qwen chọn đoạn phù hợp trong tập đó; `extraction.mjs` chuẩn hóa số tiền, địa điểm, thời gian và tiện ích từ các đoạn trích thành tiêu chí. Code không tự bổ sung tiêu chí không được model trích ra. Kiểm tra cả phủ định trước/sau đoạn trích; nhiều điểm đến yêu cầu người dùng chọn lại. Đây là AI kết hợp chuẩn hóa có giới hạn, không phải hiểu ngôn ngữ tự do hoàn toàn. Ô chưa xác định được xóa giá trị cũ và liệt kê rõ; người dùng tự điền. Điều kiện dạng checkbox chưa rõ được bỏ chọn, cần người dùng kiểm tra trước khi xác nhận. Kiểm tra cả những giá trị đã được AI điền: trích dẫn có thật không bảo đảm AI hiểu đúng ý nghĩa.
3. Tích xác nhận tất cả tiêu chí, bấm **Xác nhận và nhờ AI chọn phòng**.
4. Code lọc toàn bộ phòng đủ điều kiện; giao diện chỉ hiện số lượng trong lúc AI xử lý, chưa chọn trước 3 phòng.
5. Qwen so sánh tất cả ứng viên trong catalog nhỏ này, chọn/thay đổi thứ tự tối đa 3 phòng, chọn ý giải thích và một chiều đánh đổi. Server kiểm tra ID/dữ kiện rồi dựng văn bản và số liệu so sánh từ dữ liệu thật của fixture.

AI lỗi: đọc nhu cầu thì đề nghị tự điền; chọn phòng thì hiển thị tối đa 3 phòng dự phòng theo code với nhãn rõ. Không có phòng thì không gọi AI, không tự nới điều kiện. Đổi tiêu chí sẽ hủy yêu cầu cũ và bỏ xác nhận.

## Đầu vào / đầu ra

- Đầu vào mô tả: chuỗi tối đa 500 ký tự. Gửi local Ollama khi người dùng bấm phân tích; không lưu nội dung thật vào file/database.
- Đề xuất: `criteria` gồm budget, destination, mode, maxMinutes, people, late, required, priority; giá trị chưa rõ là null. `evidence` là trích dẫn, `questions` là câu hỏi cần làm rõ.
- Tiêu chí xác nhận: ngân sách tổng cả phòng; 3 điểm đến mẫu; xe máy/xe buýt; số người; giờ ra vào; tiện ích bắt buộc; ưu tiên chi phí/thời gian/diện tích.
- Ứng viên cho AI: mọi phòng đạt điều kiện, gồm mã/chi phí/phút/diện tích/sức chứa/nội quy/tiện ích. Không gửi mô tả gốc sang bước chọn phòng.
- AI trả `cards[{id,focus,tradeoff}]`. Chỉ chấp nhận ID đủ điều kiện, không trùng, đủ số phòng cần chọn, các dữ kiện có thật. AI được phép chọn ngoài 3 phòng đầu của code. Ưu/nhược điểm trình bày bằng câu có nguồn, không render lời văn tự do.
- Kết quả người dùng: thẻ phòng, chi phí, thời gian mẫu, lý do, so sánh chênh lệch so với nhóm và điểm cần cân nhắc. Ghi rõ nguồn lựa chọn AI hay code dự phòng.

## Giới hạn

Chỉ hỗ trợ địa điểm giả lập Trường A/Văn phòng B/Khu công nghệ C. Không có bản đồ thật, không xác minh an ninh/ngập/tiếng ồn. Không hỗ trợ điều kiện cấm tiện ích, ngân sách mỗi người, nhiều điểm đến hoặc lịch sử hội thoại. Model có thể hiểu sai, nhất là phủ định/mâu thuẫn; bước người dùng xác nhận là bắt buộc. Chi phí sinh hoạt là số mẫu cả phòng, không tăng theo số người; không phải công thức hóa đơn V1.

`flow.mjs` phục vụ hai bước AI với khóa bận chung trong tiến trình, timeout 60 giây/bước, client 65 giây. Chưa điều phối với tính năng truy vấn khác. Các endpoint/adapter cũ vẫn giữ cho kiểm thử lịch sử; giao diện mới không dùng chúng.

## Kiểm tra

```powershell
npm run test:advisor
node scripts/room-advisor-demo/evaluate-flow.mjs
node scripts/room-advisor-demo/evaluate-paraphrases.mjs
node scripts/room-advisor-demo/evaluate-paraphrases.mjs --round=2
node scripts/room-advisor-demo/evaluate-paraphrases.mjs --round=3
node scripts/room-advisor-demo/evaluate-quality.mjs
node scripts/room-advisor-demo/evaluate-flow.mjs --extract-only
node scripts/room-advisor-demo/evaluate-flow.mjs --case=negation
```

Bộ đánh giá luồng mới chạy model thật và lưu **chỉ dữ liệu thử giả lập** trong `.local/room-advisor/`. Bộ đọc nhu cầu có `semanticPass` đối chiếu tiêu chí kỳ vọng của 4 ca giả lập; phân biệt JSON đúng cấu trúc với hiểu đúng ý nghĩa, không coi đây là thước đo tổng quát. `evaluate-local.mjs` là bộ so sánh cách trình bày cũ, không chứng minh luồng mới đạt.

[Báo cáo và bằng chứng](../../docs/07_modules/public-marketplace/LOCAL_ROOM_ADVISOR_DEMO_REPORT.md).

Bản tiếp theo tại http://127.0.0.1:4329 hỗ trợ tiền ghép hai đơn vị liền nhau: “ba triệu năm trăm nghìn” → 3.500.000. Không cộng các giá trị ngăn bởi dấu câu/“hoặc”, và phần nghìn phải nhỏ hơn 1.000. “Khoảng”, “hơn”, “gần”, “ít nhất” trước lượng tiền/số người/phút không bị chuyển thành giới hạn chính xác; trường tương ứng để trống cho người dùng xác nhận. “Tối đa” vẫn được nhận theo ý nghĩa giới hạn của form. Chưa hỗ trợ đầy đủ tiền viết tắt hoặc mọi cách diễn đạt khoảng giá.

Bộ round 2 gồm câu không dấu câu, hai phương tiện thay thế, khoảng số người và tiện ích có yêu cầu/phủ định chung một câu. Code giữ phương tiện/số người chưa rõ ở null để người dùng chọn; không lấy tùy ý một phương án. Phủ định tiện ích được kiểm tra theo từng phần câu, giữ yêu cầu nấu ăn trong “cần nấu ăn không cần máy lạnh”. Các cấu trúc phức tạp hơn vẫn cần kiểm tra thủ công. File đánh giá ghi hash của lớp trích xuất, luồng AI và bộ round 2 để truy vết phiên bản.

`evaluate-quality.mjs` chốt bốn câu viết tay và kỳ vọng trước inference, ghi hash code/dataset, phân biệt timeout với lỗi ngữ nghĩa. Ca đủ tiêu chí đúng mới chạy lựa chọn với xác nhận giả lập của fixture; không tự xác nhận trường thiếu. Xếp hạng được đối chiếu theo ưu tiên chính (giá/phút/diện tích, chấp nhận đồng hạng), không coi ID hợp lệ là bằng chứng thứ hạng tốt. Phần replay mặc định dùng bằng chứng local `.local/room-advisor/dataset-1793087921048.json`; thiếu file thì ghi rõ bỏ qua replay và vẫn chạy câu mới. Có thể chỉ định file khác bằng `--replay=đường-dẫn`. Đây không phải benchmark JSONL hoặc đánh giá người dùng thật.

## Chạy không cần PostgreSQL

Mở `setup.bat`, chọn **4. Demo AI 300 phòng JSON**. Demo sẽ mở ở http://127.0.0.1:4330. Chế độ này dùng backend demo đọc `data/room-ai/v1/rooms.json`, không khởi động backend quản lý, không dùng database. `GET /demo/status` và `GET /demo/rooms` cho phép kiểm tra backend đang phục vụ đúng 300 phòng giả lập. Cần Node.js 24.11+; Ollama chỉ cần khi muốn AI local phân tích/chọn phòng, không cần để xem dữ liệu hoặc bộ lọc code.

Mục 1/2 của setup là ứng dụng quản lý đầy đủ và vẫn dùng PostgreSQL. Xem [báo cáo chế độ JSON](../../docs/07_modules/public-marketplace/JSON_ONLY_DEMO_SETUP_20261028.md).
