# Demo tư vấn phòng local — triển khai và kiểm thử ngữ cảnh

**SUPERSEDED về hướng sản phẩm standalone (2026-10-28):** người dùng chuyển sang [trợ lý chủ trọ](../invoice-zalo/OWNER_ADVISOR_DEMO_REPORT.md). Các kết quả dưới đây là lịch sử và vẫn đúng trong phạm vi lúc kiểm thử.

- Ngày triển khai: 2026-10-23; kiểm tra mở rộng: 2026-10-24–26.
- Trạng thái: CURRENT — bộ lọc/UI đã kiểm tra; độ ổn định model được báo riêng bên dưới.
- Phạm vi: demo local độc lập được người dùng yêu cầu, không đưa AI/Foxi vào V1.

## Tiền ghép đơn vị và giá trị ước lượng — 2026-10-28 (CURRENT)

Chốt trước inference bốn câu ở `paraphrases-round3.mjs`: tiền ghép, khoảng ngân sách, hơn hai người, khoảng thời gian. Kỳ vọng giữ nguyên qua các lượt. Lượt đầu **0/4 PASS**, `.local/room-advisor/paraphrases-1793124005040.json`: bỏ sót 3,5 triệu; tự chốt khoảng 3 triệu thành 3 triệu, hơn hai người thành 2, khoảng 20 phút thành 20. Model đã trích đúng đoạn tiền ghép; nguyên nhân thuộc lớp chuẩn hóa.

Sửa `numbers.mjs` và các guard: cộng triệu + nghìn chỉ khi hai đơn vị liền nhau, phần nghìn < 1000, không vượt dấu câu/“hoặc”; giữ nguyên evidence. Không biến “khoảng/hơn/gần/ít nhất/tối thiểu” thành tiêu chí số chính xác. Kiểm tra trên mô tả gốc nên model không thể tránh guard bằng cách chỉ trích phần số. Giữ nguyên cách hiểu “tối đa” cho ngân sách/phút. Không sửa prompt, model hoặc selection. Hai nhóm test mới tái hiện lỗi trước sửa; **71/71 tests PASS** sau sửa. Replay 4 output bộ quality và 6 output paraphrase trước qua mã mới đạt **10/10**; không phải 10 lượt model mới.

Lượt model thật sau sửa: **4/4 PASS**, `.local/room-advisor/paraphrases-1793124100572.json`. Tiền ghép 13.278 ms; khoảng ngân sách 14.574 ms; hơn hai người 14.732 ms; khoảng phút 22.487 ms. So sánh đủ tám trường mỗi ca. Bộ đã dùng để sửa nên kết quả cuối là hồi quy, không còn là kiểm định độc lập. Một ca đầu có giá trị rõ được chuẩn hóa; ba ca còn lại giữ trường ước lượng ở null và không tự chốt điều kiện.

Browser cổng 4329: “Tổng ba triệu năm trăm nghìn mỗi tháng, ở hai người, cần nấu ăn” điền 3.500.000 và 2 người, giữ nguyên đoạn nguồn; các tiêu chí không được nêu bị xóa giá trị cũ, chưa tự xác nhận/tìm phòng.

Đổi sang “Ngân sách khoảng ba triệu, ở một người, cần chỗ để xe” xóa số tiền 3.500.000 cũ, hiện yêu cầu xác nhận ngân sách, cập nhật 1 người/chỗ xe và bỏ nấu ăn. Xác nhận vẫn chưa chọn; console không error/warn.

Bản hiện hành 300 phòng tại http://127.0.0.1:4329. Không đổi JSON/JSONL, DB/V1/Cloudy/tính năng truy vấn; không commit/push. Bước tiếp theo riêng demo: đánh giá cách viết tiền rút gọn và giới hạn thời gian chưa có trong bộ hồi quy. Primary Exact Next Task dự án giữ nguyên.

## Chuẩn hóa số tiếng Việt — 2026-10-28 (REFERENCE)

Theo yêu cầu cải thiện sau đánh giá, thêm `numbers.mjs`: bản biểu diễn số chỉ dùng cho lấy ứng viên/chuẩn hóa, không sửa mô tả hoặc evidence. Nhận dạng số đơn/hàng chục/trăm, linh/lẻ, một số biến thể không dấu và tiền rưỡi. Prompt yêu cầu giữ nguyên văn cả số viết bằng chữ. Ví dụ “hai người”, “ba triệu rưỡi”, “hai mươi lăm phút” trở thành 2 / 3.500.000 / 25 nhưng trích dẫn vẫn nguyên câu.

Giữ kiểm tra phủ định trên văn bản gốc. Kiểm tra mâu thuẫn dùng cùng bản số nên không bỏ sót cặp chữ/số; khoảng số người/phút/tiền hoặc ngân sách mỗi người không tự chốt một giá trị. Bổ sung ba nhóm test về bằng chứng, các dạng số và xung đột/range; **69/69 tests PASS**. Không hỗ trợ mọi cấu trúc số tự nhiên; tiền ghép nhiều đơn vị, ước lượng và phân số thời gian còn cần nhập tay. Không thay lựa chọn phòng, dataset, DB/V1/Cloudy hoặc model; không commit/push.

Model thật: `quality-1793123764264.json`, **4/4 câu, 32/32 trường đúng**, tăng từ 3/4 và 29/32. Đây nay là bộ hồi quy đã dùng sửa, không phải holdout độc lập. Extraction lần lượt 16.931 / 21.820 / 22.264 / 23.682 ms. Ba ca đủ tiêu chí chạy selection đều đúng thứ hạng ưu tiên: bus-two 6 ứng viên/3 kết quả (19.587 ms); five-people 2/2 (13.123 ms); số viết chữ 7/3 (19.060 ms), giá 1.645.000/1.915.000/2.160.000 đ. Ca phủ định có tiện ích chưa xác định không tự chọn phòng. Guard khoảng ngân sách không lặp đơn vị được thêm sau khi inference đã bắt đầu: unit và replay cả bốn raw output trên mã cuối đều PASS, không coi replay là inference mới.

Bản code cuối dùng demo 300 phòng tại http://127.0.0.1:4328. Browser PASS cho câu số viết chữ: các ô hiện 3.500.000, 2 người, 25 phút; trích dẫn vẫn nguyên văn, checkbox xác nhận vẫn chưa chọn, không tự tìm phòng. Console không error/warn. Bước tiếp theo riêng demo: đánh giá bộ câu mới chưa dùng chỉnh sửa, gồm tiền ghép đơn vị và cách nói ước lượng; không tuyên bố đã hỗ trợ các dạng này. Primary Exact Next Task dự án giữ nguyên.

## Đánh giá hiểu nhu cầu và thứ hạng — 2026-10-28 (REFERENCE)

Thêm `evaluate-quality.mjs`: bốn câu viết tay/kỳ vọng được chốt trước inference, lưu hash code/dataset, so sánh đủ tám trường. Ca trích xuất đúng và đủ mới tiếp tục lựa chọn bằng tiêu chí đã được fixture xác nhận; không bỏ qua bước xác nhận của UI thật. Không chỉnh prompt, model, bộ lọc hoặc dữ liệu để đạt bộ này. Bộ chấm điểm phân biệt lỗi dịch vụ/timeout với lỗi ngữ nghĩa.

Chấm lại ba kết quả đã lưu ở `dataset-1793087921048.json`: cả ba hợp lệ và đúng thứ tự ba mức tốt nhất theo ưu tiên chính. Đi lại: 6/10/11 phút; chi phí: 1.472.500/1.675.000/1.757.500 đ; diện tích: 38/25/23 m². Đối chiếu chấp nhận phòng đồng hạng, không bắt buộc cùng ID; đây là replay đánh giá lại kết quả cũ, không phải ba lượt model mới. Chưa đo mức hài lòng của người thuê hoặc tối ưu nhiều mục tiêu.

Lượt đầu `quality-1793088171610.json` có timeout ở extraction bus-two và selection five-people, elapsed lần lượt 3.501.373 và 31.703.919 ms. Thời gian tường bất thường trong lượt kéo dài qua hai ngày; chưa xác minh nguyên nhân. Không dùng hai số này làm độ trễ model bình thường, không coi timeout là tám trường hiểu sai. File gốc được giữ nguyên; harness sửa cách phân loại lỗi dịch vụ riêng. Ca số viết bằng chữ bỏ trống ngân sách/số người/phút; ca năm người và phủ định dùng chung trích đúng.

Phân tích giới hạn số viết bằng chữ: lớp lấy ứng viên cho ngân sách/số người yêu cầu chữ số; bộ chuẩn hóa phút/tiền cũng dựa vào chữ số. Vì vậy đây là hạn chế của toàn bộ pipeline hiện tại, không đủ bằng chứng kết luận riêng Qwen không hiểu số bằng chữ. Bước xác nhận vẫn cần người dùng nhập lại các ô này.

Lượt chạy lại không sửa runtime/prompt: `quality-1793123462745.json`, **3/4 câu đúng toàn bộ; 29/32 trường đúng, 3 trường bị bỏ sót, không có trường thêm sai trong bốn ca này**. Bus-two 23.974 ms, five-people 22.140 ms, số viết chữ 18.061 ms, phủ định dùng chung 22.511 ms. Không có timeout trong lượt này. Hai ca đủ tiêu chí được chạy selection thật: bus-two có 6 ứng viên, chọn 3 mức chi phí thấp nhất 1.815.000/2.280.000/2.845.000 đ trong 21.896 ms; five-people có 2 ứng viên, trả đúng 2 phòng 49/36 m² theo thứ tự diện tích trong 14.932 ms. Không bịa phòng thứ ba. Ca có trường thiếu không tự chuyển sang chọn phòng.

Kết luận phạm vi: **2/2 lựa chọn mới đúng ưu tiên chính**, cộng 3/3 replay cũ; trích xuất còn hạn chế số bằng chữ. Mẫu nhỏ, tổng hợp, không đại diện độ chính xác thực tế; kiểm tra này không đánh giá độ bền khi đảo thứ tự ứng viên hoặc chất lượng tối ưu nhiều mục tiêu. Không đổi runtime/demo, DB, dữ liệu, model hoặc Cloudy. Chỉ thêm/cải thiện harness và tài liệu; kiểm tra cú pháp harness PASS, không chạy lại 66 test runtime vì không sửa runtime. Bước tiếp theo riêng demo: bổ sung số tiếng Việt có căn cứ nguồn và kiểm thử hồi quy; primary Exact Next Task của dự án giữ nguyên.

## Nối bộ 300 phòng giả lập — 2026-10-27 (REFERENCE)

Theo yêu cầu trực tiếp của người dùng, thêm adapter đọc `data/room-ai/v1/rooms.json` và entry `server-dataset.mjs` (cổng 4326). Đã đối chiếu README/report dataset, Requirements §17–18 và public Room API: đây vẫn là demo ngoài V1; không import DB hoặc train. Giữ nguyên file nguồn, manifest và các tập train/validation/test. Bản 18 fixture còn chạy bằng lệnh cũ.

Adapter lấy đủ 300 phòng, chỉ `available` được thuê ngay; 90 phòng trạng thái khác bị loại. Tính lại chi phí trên cùng 45 kWh + 3 m³/người, 1 xe máy khi có chỗ xe hoặc 0 xe buýt; giữ phí thiếu là không hợp lệ, không coi null là 0 trừ đỗ xe không sử dụng. Cho phép 1–5 người. Hiển thị giả định, cọc/thời hạn thuê, mốc dữ liệu và hạn chế thú cưng. Chỉ 24h đáp ứng yêu cầu ra vào 24 giờ; notify_late/unknown không bị ghi thành đóng cửa 23h. Bốn tiện ích của demo được ánh xạ; chưa mở rộng truy vấn các tiện ích còn lại. Thú cưng cần duyệt/giới hạn cân nặng chưa được xác nhận phù hợp với vật nuôi cụ thể.

Qwen xét tất cả phòng đạt điều kiện theo nhóm tối đa 24, chọn ba mỗi nhóm rồi qua các vòng tiếp theo. Không chọn sẵn ba bằng code trước AI, nhưng đây là chọn nhiều vòng, không chứng minh tối ưu toàn cục. Giữ context 4096; 60 giây/lượt, deadline 15 phút. Bất kỳ nhóm lỗi thì dự phòng trên toàn bộ nhóm gốc; nhãn nguồn không được báo thành AI hoàn tất. Hủy tiêu chí chặn nhóm tiếp theo; tradeoff cuối đối chiếu nhóm đủ điều kiện ban đầu.

Kiểm thử tự động **66/66 PASS**, gồm bảy ca adapter/chia nhóm/HTTP/hủy; bộ toàn vẹn dataset **6/6 PASS**, bao gồm manifest hashes. Không đổi DB/public API/Cloudy/tính năng truy vấn, không commit/push.

Model thật với tiêu chí xác nhận sẵn: **3/3 ca hợp lệ**, bằng chứng `.local/room-advisor/dataset-1793087921048.json`. Về khuya: 13 ứng viên → SYN-R0116/R0078/R0004, 18.776 ms, 1 lượt. Ngân sách rộng: 152 ứng viên → SYN-R0247/R0066/R0003, 220.038 ms, 8 lượt. Hai người có thú cưng: 5 ứng viên → SYN-R0175/R0196/R0188, 18.103 ms, 1 lượt. Kiểm tra ID nằm trong nhóm đủ điều kiện và đủ ba kết quả; không khẳng định thứ hạng tối ưu hoặc độ chính xác trích xuất ngôn ngữ tự do trên dataset. Đây không phải đánh giá các tập JSONL train/validation/test.

Browser cổng 4326: hiển thị 300 phòng và lựa chọn 1–5 người; sau xác nhận hiện 13/300 ứng viên trước thẻ kết quả. Kết quả Qwen hiển thị đúng ba mã của ca về khuya, giả định điện/nước/xe trên từng thẻ. Mở điểm cân nhắc SYN-R0004 thấy cọc 1 tháng, tối thiểu 12 tháng, thú cưng tối đa 1 con/15 kg/cần chủ duyệt. Console không có error/warn. Chưa kiểm tra viewport mobile hoặc chạy extraction mới qua UI trong pass dataset này.

Bước tiếp theo riêng demo: chạy câu mô tả độc lập qua toàn bộ extraction → xác nhận → adapter 300 phòng, và đánh giá chất lượng thứ hạng/độ trễ ở nhóm lớn. Bộ rộng hiện mất ~3 phút 40 giây nên chưa phù hợp phản hồi tức thời. Primary Exact Next Task của dự án giữ nguyên.

## Lựa chọn chưa rõ và phủ định chung câu — 2026-10-27 (REFERENCE)

Bộ round 2 chốt trước lượt đầu trong `paraphrases-round2.mjs`: không dấu câu, xe máy hoặc xe buýt, 2 hoặc 3 người, cần nấu ăn không cần máy lạnh. So sánh đủ tám trường, không đổi kỳ vọng sau khi xem model. Lượt đầu **1/4 PASS**: câu không dấu câu đạt; ba ca còn lại lần lượt bị tự chọn xe máy, chốt 3 người và bỏ nấu ăn. Bằng chứng `.local/room-advisor/paraphrases-1793087153696.json` (17–44 giây/ca). Model đã trích đúng đoạn nguồn trong ba ca lỗi; lỗi nằm ở chuẩn hóa/kiểm tra ý nghĩa đoạn trích.

Sửa `extraction.mjs`: hai phương tiện hoặc khoảng/nhiều số người giữ null để xác nhận; kiểm tra tiện ích theo từng phần câu, giữ nấu ăn và loại máy lạnh khi phủ định chỉ áp dụng máy lạnh. Giữ kiểm tra phủ định dùng chung như “không cần máy lạnh và bếp”. Không thay prompt/model hoặc cơ chế chọn phòng. Hai kiểm thử mới đã tái hiện lỗi trước sửa; sau sửa **59/59 kiểm thử tự động PASS**. Phát lại sáu output gốc của bộ 26/10 qua lớp chuẩn hóa mới đạt **6/6**; đây là replay, không phải sáu lượt inference mới.

Chạy model thật sau sửa **4/4 PASS**, bằng chứng `.local/room-advisor/paraphrases-1793087304405.json`: không dấu câu 33.526 ms; hai phương tiện 17.891 ms; khoảng số người 15.951 ms; tiện ích chung câu 17.568 ms. Lượt đầu có 2 trường bị chốt sai và 1 trường tiện ích bị bỏ sót; lượt cuối không có sai lệch trong 32 trường được đối chiếu. Đây là hồi quy trên bốn ca vừa dùng sửa, không phải độ chính xác tổng quát. Bộ đánh giá ghi hash extraction/flow/bộ round 2 trước inference. Chưa kiểm chứng hội thoại nhiều lượt hoặc tiếng Việt viết hoàn toàn bằng chữ.

Bản server mới: http://127.0.0.1:4325, HTTP trang chính 200. Không chạy lại kiểm tra trực quan trình duyệt trong pass này; bằng chứng UI ngày 26/10 giữ phạm vi cũ. Các cổng cũ là bản lịch sử. Không đổi DB, API V1, tính năng truy vấn, Cloudy hoặc dataset 300 phòng của task khác; vẫn dùng 18 fixture. Không commit/push. Bước tiếp theo riêng demo: kiểm tra một bộ câu mới có phủ định dùng chung, sửa ý định và số tiền/số người viết bằng chữ trước khi mở rộng bộ nhận diện. Primary Exact Next Task dự án giữ nguyên.

## Kiểm tra diễn đạt mới và siết đoạn nguồn — 2026-10-26 (REFERENCE)

Bộ 6 câu mới được chốt trước lượt đầu: tiếng Việt không dấu, phủ định sau danh từ, hai điểm đến, ngân sách mỗi người, tiện ích tùy chọn và thay đổi mức tiền. Kỳ vọng được lưu trong `evaluate-paraphrases.mjs`; mỗi ca so sánh đủ 8 trường, không chỉ schema hợp lệ.

- Lượt đầu trước sửa: **2/6 PASS** (`.local/room-advisor/paraphrases-1793023542936.json`). Ca không dấu bị model tự thêm dấu/đổi cách viết; phủ định sau “nuôi mèo thì không” bị thêm pets; một số tiện ích bị viết lại và mất căn cứ. Hai unit mới tái hiện lỗi phủ định sau và tự rút hai điểm đến về một.
- Sửa lớp kiểm tra: nhìn cả trước/sau đoạn trích, loại tùy chọn, không tự chọn một trong nhiều điểm đến, không suy ưu tiên rẻ chỉ từ ngân sách. Đối chiếu chữ hoa/dấu chỉ nhận khi tìm được đoạn nguồn duy nhất; không thay từ đồng nghĩa tùy ý.
- Sửa hợp đồng model: code tách các đoạn nguồn, giữ nguyên dấu thập phân; giới hạn lựa chọn từng trường theo từ vựng liên quan. Qwen nhận rõ ứng viên theo trường và chỉ được trả nguyên đoạn hoặc null. Đây là **code truy hồi ứng viên + AI chọn đoạn + code chuẩn hóa/kiểm tra**, không tuyên bố model tự xử lý mọi dạng ngôn ngữ.
- Hai lượt trung gian 1/6 và 4/6 được giữ ở `paraphrases-1793023725054.json` / `paraphrases-1793023867597.json`. Sau đưa ứng viên theo trường vào prompt và nêu rõ số người: **6/6 PASS**, `paraphrases-1793024026014.json`. Vì đã dùng các ca này để sửa, kết quả cuối là hồi quy trên bộ đã biết, không còn là holdout độc lập.

| Ca cuối | Thời gian | Kết quả chính |
|---|---:|---|
| Không dấu | 20.264 ms | Đúng 3,5 triệu / Văn phòng B / xe buýt / 40 phút / 2 người / không về khuya / bếp / giá rẻ |
| Phủ định phía sau | 15.711 ms | 3 triệu, 1 người, chỉ nấu ăn; không thú cưng/máy lạnh |
| Hai điểm đến | 17.705 ms | Điểm đến null, giữ đúng 4 triệu / xe máy / 25 phút |
| Ngân sách mỗi người | 15.146 ms | Tổng ngân sách null; giữ 2 người và thú cưng |
| Máy lạnh tùy chọn | 26.436 ms | Không bắt buộc máy lạnh, giữ chỗ xe và các tiêu chí khác |
| Đổi ngân sách | 16.415 ms | Hai mức tiền yêu cầu xác nhận, giữ nấu ăn |

**57/57 kiểm thử tự động PASS.** Không đổi bước chọn phòng, dữ liệu 18 phòng, DB, public API V1, tính năng truy vấn hoặc Cloudy frontend; không commit/push. Các nội dung setup/GitHub/Cloudy được task khác cập nhật trong Current State vẫn giữ nguyên. Kiểm tra `git diff --check` cho các file tracked trong phạm vi đã đạt.

Kiểm tra trình duyệt trên bản 4324: mô tả phủ định phía sau xóa lựa chọn thú cưng cũ, giữ nấu ăn; các trường chưa biết để trống và trình duyệt chặn tìm khi thiếu điểm đến. Ca “Về khuya” trích đủ tiêu chí; sau xác nhận hiển thị 8/18 phòng đủ điều kiện trước khi có thẻ kết quả. Qwen sau đó chọn DEMO-07, DEMO-02, DEMO-12, kèm ưu điểm và đánh đổi từ dữ liệu mẫu.

Bản hiện hành http://127.0.0.1:4324. Bước tiếp theo riêng demo: chạy tập câu độc lập tiếp theo với cách nói chưa đưa vào bộ ứng viên, đo cả tỷ lệ bỏ sót và điều kiện bị thêm sai; chưa tích hợp dữ liệu thật. Primary Exact Next Task dự án không đổi.

## Cải thiện trích xuất tiếng Việt 1.7B — 2026-10-25 (CURRENT)

Model nay chỉ trích các đoạn nguyên văn theo trường, thay vì đồng thời phải sinh giá trị/mã và bảng evidence. `extraction.mjs` chuẩn hóa số tiền, địa điểm mẫu, phương tiện, phút/số người, giờ ra vào và tiện ích từ đoạn có nguồn. Có kiểm tra ngữ cảnh phủ định quanh đoạn trích để không chấp nhận model cắt bỏ chữ “không”; tiện ích tùy chọn không trở thành bắt buộc. Đây là AI chọn đoạn + code chuẩn hóa/kiểm tra, không tuyên bố toàn bộ suy luận do model làm.

Ô chưa xác định được xóa giá trị cũ; select có mục trống bắt buộc chọn lại, số bỏ trống bắt buộc nhập, checkbox chưa rõ bỏ chọn và nhắc xác nhận. Không giữ thú cưng/ngân sách/địa điểm của nhu cầu cũ dưới nhãn nhu cầu mới. Xác nhận vẫn bắt buộc, không thay luồng chọn phòng.

Kiểm thử **52/52 PASS**. Bổ sung: câu phủ định bị cắt bỏ, ngân sách mỗi người/giá thuê riêng/mâu thuẫn, số thập phân, không dấu, tiện ích tùy chọn, địa điểm gần giống, giá trị quá giới hạn, phục hồi mốc giờ chỉ khi đoạn giờ xuất hiện nguyên văn duy nhất trong nguồn, và xóa tiêu chí cũ trên UI.

Bộ model thật nay ghi `semanticPass` đối chiếu tiêu chí kỳ vọng, không chỉ JSON hợp lệ. Chạy cuối theo từng ca:

| Ca | Kết quả | Thời gian |
|---|---|---:|
| Mô tả đầy đủ | Đúng 8/8 tiêu chí, gồm Văn phòng B và về 1 giờ sáng | 13.826 ms |
| Phủ định | 3 triệu, 2 người, chỉ nấu ăn; không thêm thú cưng/máy lạnh; các trường thiếu để null | 12.496 ms |
| Ngân sách mâu thuẫn, Trường Z | Để trống, yêu cầu người dùng làm rõ | 14.327 ms |
| Lệnh chèn đổi phòng/giá | Không áp dụng tiêu chí bịa; để người dùng nhập lại | 16.961 ms |

Bằng chứng lượt đầy đủ trước sửa lỗi gõ trích giờ: `.local/room-advisor/flow-1792941765354.json` đạt 3/4, ca đầy đủ thiếu giờ vì model trả “véo 1 giờ sáng”. Bản sửa chỉ lấy phần “1 giờ sáng” có nguyên văn duy nhất trong cả nguồn và output, không sửa gần đúng nội dung khác. Chạy thật lại ca đầy đủ sau sửa: `.local/room-advisor/flow-1792941824221.json` đạt 8/8. Các ca còn lại không chạy lại sau sửa riêng giờ; số liệu bảng không phải một lần chạy chung 4/4. Các lần trước/đầu ra gốc được giữ nguyên để đối chiếu. Hai lựa chọn ưu tiên commute/budget vẫn trả hợp lệ trong lượt đầu của pass này (~19–21 giây).

Đây là 4 ca giả lập đã dùng để chỉnh prompt, **không phải tập kiểm định độc lập**, không chứng minh hiểu mọi tiếng Việt hoặc chống injection tổng quát. Những dạng như nhiều điểm đến, giờ/tiền viết hoàn toàn bằng chữ, viết tắt khác, điều kiện cấm, phủ định phức tạp vẫn cần người dùng kiểm tra.

Bản hiện hành http://127.0.0.1:4323. Không đổi DB/V1/tính năng truy vấn, không cloud/key, không commit/push. Bước tiếp theo riêng demo: đánh giá bộ câu mới chưa dùng chỉnh prompt, gồm thiếu dấu, nói vòng, thay đổi ý định và nhiều mức ngân sách; primary Exact Next Task của dự án giữ nguyên.

## Luồng đọc nhu cầu → xác nhận → AI chọn phòng — 2026-10-25 (CURRENT)

Phần này thay thế mô tả luồng cũ “ghi chú không gửi AI / code chọn trước 3 phòng” ở các mục lịch sử bên dưới. Người dùng đã yêu cầu triển khai luồng mới trong demo độc lập; không đổi phạm vi V1.

- Qwen3 1.7B đọc tối đa 500 ký tự, trả tiêu chí nullable, trích dẫn và câu hỏi. Người dùng kiểm tra/sửa tất cả ô rồi tích xác nhận. Không tự tìm ngay sau khi AI điền form.
- Kiểm tra đề xuất theo schema/giá trị/trích dẫn, đối chiếu mã điểm đến, căn cứ giờ khuya/tiện ích và phát hiện nhiều mức tiền; trường thiếu căn cứ bị bỏ về null và nêu rõ. Các kiểm tra là lớp bảo vệ, không bảo đảm hiểu đúng mọi câu tiếng Việt.
- Sau xác nhận, `/demo/candidates` chỉ trả số lượng và thống kê, không trả 3 phòng được chọn sẵn. Code lọc toàn bộ 18 fixture, loại phòng không đạt điều kiện bắt buộc.
- `/demo/select` lọc lại từ tiêu chí xác nhận, gửi toàn bộ ứng viên đủ điều kiện cho model, cho phép chọn và đổi thứ tự tối đa 3 phòng bất kỳ trong nhóm. Không nhận candidates từ client. AI nhận tiêu chí có cấu trúc, không nhận mô tả tự do gốc ở bước này.
- AI trả `cards[{id,focus,tradeoff}]`. Kiểm tra mã phòng hợp lệ/không trùng/đủ số lượng; dựng lý do ngân sách, đường đi, ý nhấn mạnh và chiều so sánh từ dữ liệu đã kiểm tra. Không hiển thị văn bản tùy ý về an ninh/ngập/yên tĩnh. “Đánh đổi” là chênh lệch chi phí/phút/diện tích so với tốt nhất của nhóm đủ điều kiện.
- Hai bước dùng chung khóa bận trong tiến trình; timeout 60 giây/bước, hủy khi thay tiêu chí, bỏ response cũ và bỏ dấu xác nhận. Chưa có hàng đợi dùng chung với tính năng truy vấn bên ngoài demo.
- Lỗi đọc nhu cầu: đề nghị tự nhập. Lỗi chọn phòng: trả tối đa 3 phòng từ code với nhãn dự phòng rõ. Không có phòng thì không gọi AI, không tự nới điều kiện.

### Bằng chứng và giới hạn

`npm run test:advisor`: **42/42 PASS**, gồm kiểm thử xác nhận, không chọn trước 3 phòng, chọn ngoài top-3 cũ, ID không hợp lệ/trùng, dữ kiện bịa, bỏ đề xuất không có căn cứ, hủy và response cũ. Các kiểm thử UI bằng DOM giả không thay browser thật.

Lượt đầu với schema dài thất bại: 4 bước trích xuất bị từ chối, 2 bước chọn bị từ chối vì model bỏ câu bắt buộc. Đã đổi hợp đồng chọn sang `focus` để server luôn bổ sung ngân sách/đường đi. Bằng chứng lịch sử `.local/room-advisor/flow-1792924566155.json`; diagnostics riêng ghi rõ lỗi trích dẫn và sai mã địa điểm.

Lượt kế tiếp `.local/room-advisor/flow-1792924794522.json`: 4 đề xuất JSON hợp lệ trong khoảng 21 giây nhưng **không phải 4/4 hiểu đúng**. Ca đầy đủ gán sai điểm đến và trích dẫn giờ khuya; ca phủ định/thông tin thiếu tự thêm thú cưng. Sau bổ sung guards, chạy lại validator trên raw output đã lưu (`flow-reviewed-final.json`, không phải inference mới): bỏ các trường không chứng minh được, không còn thêm thú cưng trong những ca này. Ca đầy đủ giữ 6/8 trường; điểm đến/giờ khuya yêu cầu người dùng kiểm tra. Ca phủ định chỉ giữ ngân sách; ca mâu thuẫn và injection yêu cầu tự nhập. Không tuyên bố khả năng chống prompt injection tổng quát.

Hai lượt chọn phòng thật đã PASS: ưu tiên đi gần chọn DEMO-07/02/12 từ 8 ứng viên sau 16.893 ms; ưu tiên chi phí chọn DEMO-04/05/18 sau 18.162 ms. Đây là bằng chứng mới cho chọn phòng, khác bộ 6/6 trình bày cũ.

Browser bản mới: xác nhận bắt buộc chặn submit; ngân sách 1 triệu cho 0/18 và không gọi AI; mô tả về khuya điền được 6 trường và hiển thị 2 trường cần xác nhận; sau xác nhận hiển thị 8/18 đang chờ AI, chưa có thẻ phòng. Sau đó AI trả đủ DEMO-07/02/12, nhãn nguồn Qwen3 1.7B và các chênh lệch so sánh; console không có error/warn. Kiểm tra bố cục desktop 1280px không tràn ngang (scrollWidth 1265); chưa kiểm tra lại mobile cho luồng mới.

Source mới: `flow.mjs`, `flow.test.mjs`, `evaluate-flow.mjs`; cập nhật engine/server/UI/tests/runbook. Các endpoint cũ còn phục vụ test lịch sử, giao diện mới không dùng. Bản mới ở http://127.0.0.1:4321; không dừng các server cũ trong phiên. Không đổi database, public API V1, tính năng truy vấn, không dùng cloud/key và không commit/push.

**Bước tiếp theo riêng demo:** cải thiện độ chính xác trích xuất tiếng Việt 1.7B trên bộ phủ định/mâu thuẫn trước khi mở rộng dữ liệu thật; primary Exact Next Task dự án vẫn Auth GĐ2. Luồng hoạt động có người xác nhận, chưa đạt tự hiểu hoàn toàn không cần sửa.

## Nguồn và giới hạn phạm vi

Đã đọc Documentation Rules, Current State, Document Catalog; Requirement §4, §17–18; API §5.3; implementation public marketplace và code demo hiện tại. Canonical V1 không công bố tiện ích/đường đi mẫu và chưa có Foxi AI. Bản thử này không thay đổi quy tắc kinh doanh, public API hay baseline database. Không kết nối PostgreSQL, chạy scheduler, sử dụng API trả phí hoặc lưu dữ liệu người thuê.

Source: `scripts/room-advisor-demo/`. Chạy `npm run demo:advisor`, mở `http://127.0.0.1:4318`. [Hướng dẫn](../../../scripts/room-advisor-demo/README.md). Server chỉ bind loopback, có kiểm tra Host/Origin, JSON/body giới hạn 8 KiB. Không phải cấu hình triển khai công khai.

18 phòng, khoản chi phí và tuyến đi theo 3 điểm đến đều giả lập. Code lọc các điều kiện bắt buộc rồi xếp tối đa 3 phòng theo thời gian/giá/diện tích. Không tự nới điều kiện. Tổng phí mẫu cho cả phòng không tự tính lại theo số người; không phải công thức hóa đơn V1.

Qwen chỉ chọn/thứ tự hóa ID các câu đã kiểm tra, buộc giữ nguyên phòng và luôn có câu ngân sách + đường đi. Server dựng văn bản từ câu có nguồn, không render lời văn tùy ý do model tạo. Đây là AI chọn cách trình bày, không phải chatbot tư vấn tự do.

## Phát hiện và xử lý

| Ca | Bằng chứng / tác động | Xử lý |
|---|---|---|
| Đầu vào ép kiểu | Trước sửa, `destination:["office"]` được chấp nhận; tiện ích dạng mảng cũng qua bước kiểm tra key | Kiểm tra kiểu chuỗi trước lookup, reject input sai |
| Tuyến thiếu / không hợp lệ | Test thay dữ liệu tuyến bằng `undefined`, NaN, số âm… vẫn có thể được gợi ý | Tuyến thiếu, không hữu hạn hoặc âm bị loại; không coi là 0 phút |
| Giá/phòng lỗi | Test fixture có tổng NaN hoặc không khớp thuê + chi phí vẫn lọt qua; không xảy ra trong 18 fixture nguyên bản | Kiểm tra dữ liệu phòng, tổng tiền, cờ boolean; bỏ mã trùng, đếm lý do dữ liệu lỗi |
| Đổi tiêu chí / ngắt kết nối | HTTP client ngắt nhưng provider vẫn chạy đến timeout; ca test trước sửa không nhận tín hiệu hủy | Truyền AbortSignal từ HTTP response tới provider; giải phóng khóa khi hủy |
| Trạng thái UI | Tìm lại lúc AI đang chạy có thể giữ nhãn đang xử lý; lỗi mạng ở lần AI sau có thể giữ lời AI cũ nhưng nhãn nguồn nói bộ lọc | Reset nhãn, lưu lời giải thích gốc, bỏ response cũ theo revision; kiểm thử riêng vòng đời client |
| Chẩn đoán model | Thông báo lỗi gộp không phân biệt model sai và quá thời gian; 6/6 lời gọi thật ở ngưỡng 15 giây đều timeout | Phân loại timeout/unavailable/incomplete/invalid/cancelled/busy; đo thời gian; điều chỉnh thời hạn dựa trên ca chạy thật |
| Ghi chú mâu thuẫn | Ghi chú “2 triệu” nhưng ô xác nhận 4 triệu vẫn lọc theo 4 triệu | Giữ giới hạn demo: ghi chú không được phân tích. Bổ sung nhắc rõ tại kết quả, không tuyên bố đã hiểu nội dung |

Các ca dữ liệu phòng lỗi là kiểm thử chèn fixture trực tiếp vào engine, **không phải** bằng chứng client sửa được dữ liệu phòng server. API vẫn từ chối `cards` hoặc room data do client gửi. Chưa thực hiện đánh giá bảo mật toàn sản phẩm.

## Kiểm thử tự động

`npm run test:advisor` bao gồm bộ test gốc, adversarial và client lifecycle.

- Bộ mới trước sửa: 4 PASS / 6 FAIL trên 10 test (gồm diagnostic chưa có, cancellation và dữ liệu lỗi).
- Sau sửa: `npm run test:advisor` **33/33 PASS**, gồm 16 test gốc, 13 test adversarial và 4 test vòng đời client (DOM giả lập, không thay thế browser test).
- HTTP: JSON hỏng, primitive/null/array, tiền sai kiểu, trường model/URL/cards do client gửi đều trả 400 trước khi gọi AI; JSONP/text trả 415; JSON kèm charset hợp lệ trả 200.
- 2.880 tổ hợp: 3 điểm đến × 2 phương tiện × 3 số người × 2 giờ ra vào × 4 bộ tiện ích × 5 ngân sách × 2 thứ tự ưu tiên × 2 giới hạn thời gian. Đây là kiểm thử code, **không phải 2.880 lời gọi AI**.
- Kiểm tra biên ngân sách bằng/vượt 1 đồng, cộng chi phí, không tự nhân ngân sách theo số người, phòng đã thuê, đường đi chưa biết, thiếu tiện ích, dữ liệu sai kiểu/không hữu hạn và mã trùng.
- 8 ghi chú gồm mâu thuẫn, tiếng Việt không dấu, HTML/script và lệnh bỏ qua hướng dẫn: không thay bộ lọc và không được đưa vào prompt. Điều này kiểm tra ranh giới dữ liệu, **không chứng minh Qwen tự chống prompt injection**.
- Model JSON sai cấu trúc, thêm lời văn, bịa ID, đảo phòng, thiếu câu ngân sách/đường đi, trùng câu: bị từ chối.
- Nhánh AI success/error/cancel và race client được kiểm tra bằng mock; không đồng nhất mock PASS với model thật PASS.

## Model thật trên máy local

Ollama `qwen3:4b`, CPU; UI dùng kết quả code ngay, AI gọi riêng. `npm run eval:advisor` chạy bộ ngữ cảnh opt-in, không dùng key/cloud.

Đo trước điều chỉnh: 7 ngữ cảnh, 6 có phòng gọi model đều timeout ~15 giây; 1 không có phòng bỏ qua AI. Kết quả hiển thị đều lấy từ câu đã kiểm tra. Bằng chứng local: `.local/room-advisor/live-contexts.json`.

Chẩn đoán cho phép chờ 45 giây:

- Một phòng “tiết kiệm”: output hợp lệ sau **17.369 ms**, nạp model 5.616 ms, 214 prompt tokens / 45 output tokens.
- Ba phòng “về khuya”: output hợp lệ sau **36.629 ms**, nạp model 6.632 ms, 493 prompt tokens / 97 output tokens.

Vì vậy default provider đổi 15 → **45 giây**, timeout trình duyệt 50 giây; tìm phòng vẫn không chờ model. Đổi tiêu chí hủy yêu cầu; lỗi giữ lời giải thích có nhãn nguồn thật.

Bộ chạy lại hoàn tất: **6/6 lời gọi model hợp lệ**, 1 ca không có phòng bỏ qua AI. Bằng chứng local: `.local/room-advisor/live-contexts-45000ms.json`.

| Ngữ cảnh | Thời gian | Kết quả |
|---|---:|---|
| Về khuya | 43.683 ms | 3 phòng, hợp lệ |
| Có thú cưng | 36.539 ms | 3 phòng, hợp lệ |
| Ngân sách thấp | 22.939 ms | 1 phòng, hợp lệ |
| Ghi chú mâu thuẫn | 40.904 ms | 3 phòng, hợp lệ |
| Ghi chú chứa lệnh vượt hướng dẫn | 42.011 ms | 3 phòng, hợp lệ |
| Thiếu tuyến đi | 24.620 ms | 1 phòng, hợp lệ |
| Không có phòng | 0 ms | Không gọi model |

Tất cả lời hiển thị thuộc tập câu đã kiểm tra. Hai ca ghi chú không đưa ghi chú vào prompt nên không đánh giá sức chống prompt injection của model. Mẫu chạy nhỏ này chỉ xác nhận output theo hợp đồng trong các ca đã thử; không chứng minh chất lượng tư vấn tổng quát. Model thường chọn câu diện tích làm câu thứ ba, khả năng nhấn mạnh thói quen còn hạn chế.

## So sánh Qwen3 1.7B — 2026-10-25

Chạy cùng 7 ngữ cảnh, prompt/schema/tham số sinh và giới hạn 45 giây như 4B; chỉ thay model bằng `--model=qwen3:1.7b`. Cả hai dùng `think:false`, `keep_alive:0`; thời gian có tính nạp model. So với lượt 4B trước đó, không phải benchmark đồng thời trên máy cô lập.

| Ngữ cảnh | 1.7B (giây) | 4B trước đó (giây) | Kết quả 1.7B |
|---|---:|---:|---|
| night-shift | 14.70 | 43.68 | validated |
| pets | 11.39 | 36.54 | validated |
| tight-budget | 6.97 | 22.94 | validated |
| contradictory-note | 11.97 | 40.90 | validated |
| prompt-injection | 15.20 | 42.01 | validated |
| missing-route | 8.46 | 24.62 | validated |
| no-match | 0.00 | 0.00 | empty |

**6/6 lời gọi 1.7B hợp lệ**, không timeout/fallback; ca không có phòng bỏ qua AI. Trung bình 11.45 giây so với 35.12 giây của 4B, nhanh khoảng 3.1 lần trong các lượt đo này. Danh sách phòng giống nhau vì bộ lọc quyết định; không phải bằng chứng hai model có khả năng xếp hạng ngang nhau. Lời hiển thị đều lấy từ dữ kiện đã kiểm tra. Bộ tự động vẫn **33/33 PASS**.

Giới hạn chất lượng: ca thú cưng chọn `hours` thay vì `amenities`; không bịa dữ kiện nhưng chọn lý do chưa sát nhu cầu. Hai ca ghi chú không gửi ghi chú vào model, nên chưa kiểm tra hiểu mâu thuẫn hay chống prompt injection. Chưa thử tải đồng thời với tính năng truy vấn.

Bằng chứng: `.local/room-advisor/live-contexts-45000ms-qwen3-1.7b-1792923786723.json`. Script nay lưu tên model và thời điểm trong tên file, giữ nguyên bằng chứng cũ. Có thể dùng 1.7B cho vai trò trình bày giới hạn của demo; chưa đánh giá đạt cho tư vấn tự do. Lượt này chỉ thử nghiệm, không đổi mặc định 4B của server/giao diện, tính năng truy vấn hay database. Bước tiếp theo riêng demo: cấu hình dùng chung 1.7B và kiểm tra điều phối với tính năng truy vấn trước khi mở rộng hiểu nhu cầu tự do.

## Browser và tài liệu

### Chuyển mặc định sang 1.7B theo yêu cầu — 2026-10-25

Provider và script đánh giá dùng chung `DEFAULT_MODEL = qwen3:1.7b`; README cập nhật model/thời gian đo. Không thay bộ lọc, prompt/schema, timeout, dữ liệu hay tính năng truy vấn. `npm run test:advisor`: 33/33 PASS. HTTP thực tế trên server mới cổng 4319 trả `source:ollama`, `reason:validated`, thông báo `qwen3:1.7b`, đủ 3 phòng sau 10.965 ms. Cơ chế kiểm duyệt tự động chặn dừng server cũ cổng 4318; giữ nguyên tiến trình cũ và mở server mới 4319. Link dùng trong phiên này: http://127.0.0.1:4319. Khi tự khởi động lần sau, cổng mặc định vẫn 4318.

Luồng hiện tại: form tiêu chí → kiểm tra đầu vào → lọc/xếp tối đa 3 phòng từ 18 fixture → hiển thị ngay → người dùng bấm gọi AI → server lọc lại → gửi ưu tiên/giờ giấc/tiện ích và câu dữ kiện của các phòng tới Qwen → nhận `cards[{id,factIds}]` → kiểm tra và dựng lời giải thích. Ghi chú tự do chưa được phân tích và không gửi tới Qwen. Output gồm thẻ phòng, chi phí, thời gian mẫu, lý do, điểm cần lưu ý và nguồn lời giải thích; không có phòng thì không gọi AI. Bước tiếp theo riêng demo vẫn là kiểm tra điều phối khi tính năng truy vấn và gợi ý cùng dùng model.

Lượt 2026-10-23: preset mặc định/về khuya top DEMO-07/02/12 (8 phù hợp); tiết kiệm DEMO-09 (1); thú cưng DEMO-05/12/15 (3); ngân sách 1 triệu (0), AI disabled. DOM không tràn ngang ở 1440/390/320px. Screenshot full-page desktop có hiện tượng ghép lặp từ công cụ nên không khẳng định pixel-perfect. Hai lần AI thật khi đó dùng fallback. Không lưu screenshot dài hạn.

Lượt 2026-10-24–25: ghi chú mâu thuẫn kèm HTML và lệnh vượt bộ lọc vẫn trả đúng các phòng theo ô xác nhận, không chạy HTML. Đổi sang xe buýt còn 2 phòng; tăng lên 3 người còn 0 và khóa nút AI. Bấm AI rồi tìm lại khi đang xử lý khôi phục đúng nhãn bộ lọc và kết quả 3/8 phòng; quan sát sau đó không bị response cũ ghi đè. Console kiểm tra cuối không có error/warn. Hủy ở tầng provider được xác nhận riêng bằng HTTP/mock test; không dùng quan sát giao diện để khẳng định tiến trình tính toán Ollama đã dừng ngay.

README trước lượt này có link đến báo cáo chưa tồn tại do turn bị ngắt; báo cáo này hoàn thiện link và checkpoint còn thiếu. Không sửa canonical Requirement/API/DB, không commit/push; giữ thay đổi setup/database có sẵn từ trước task.

## Giới hạn còn lại / bước tiếp theo

Không tự hiểu nhu cầu tiếng Việt tự do, không phân giải mâu thuẫn giữa ghi chú và form, không có bản đồ/đánh giá khu vực thật. AI không được đưa ra cam kết an ninh, không ngập hay yên tĩnh khi không có dữ liệu.

Bước tiếp theo riêng của demo: thiết kế bước trích xuất nhu cầu từ lời người thuê thành tiêu chí **để người dùng xác nhận**, dùng các ca phủ định/mâu thuẫn đã thu được làm tiêu chí nghiệm thu. Chưa tự thực hiện trong lượt kiểm thử này. Primary Exact Next Task của dự án vẫn là Auth GĐ2 như checkpoint hiện hành.
