# Rà soát trải nghiệm ba trợ lý Cloudy — 2026-10-29

**Trạng thái:** CURRENT — bài hồi quy hội thoại và đánh giá Qwen local đã chạy; chưa kiểm tra giao diện trực quan hoặc thao tác đăng nhập thật.

## Phạm vi

Rà soát ba luồng hiện có bằng mã nguồn, test HTTP, test hồi quy và câu hỏi thật chạy qua Ollama cục bộ: Cloudy tìm phòng công khai, Cloudy cho khách thuê và Cloudy cho chủ trọ. Không dùng computer use/trình duyệt; không ghi database, hóa đơn, yêu cầu hoặc dịch vụ thật.

## Kết quả và sửa đổi

- **Tìm phòng công khai:** Lần đầu mở chat không còn bắt người dùng chọn “Lọc mới” trước khi hỏi. Chế độ lọc tiếp/lọc mới chỉ hiện sau khi đã có bộ lọc được xác nhận. Bốn câu hỏi chạy qua Qwen3 1.7B: câu có máy lạnh, khu vực, giá và số người cùng lúc; cùng câu có Wi-Fi, bãi xe và giá đều được phân tích đầy đủ. Hai câu mơ hồ/không hỗ trợ được giữ ở trạng thái hỏi lại; Cloudy không tự nới điều kiện hay tìm phòng.
- **Khách thuê:** Các lối tắt Hóa đơn, Tiện ích, Gửi chỉ số và Yêu cầu/sự cố ban đầu được thêm để khách vào nhanh từng nghiệp vụ. Sau khi xem giao diện, người dùng yêu cầu chỉ giữ chat; các nút lối tắt mặc định đã được gỡ, lời chào ngắn lại và ô nhập dùng placeholder chung. Khi cần làm rõ yêu cầu tiện ích chung, Cloudy hỏi trong tin nhắn và chờ khách trả lời bằng lời; câu trả lời về xem tiện ích hoặc đề nghị bổ sung thiết bị được định tuyến tiếp bằng chat. Tải danh sách tiện ích, kỳ hóa đơn và lịch sử gửi chỉ số độc lập, mỗi mục có nút thử lại; lỗi một endpoint không làm mất dữ liệu các mục khác. Sau khi gửi chỉ số thành công, lỗi tải lại lịch sử không còn thay thông báo thành công bằng thông báo lỗi có thể khiến khách gửi lại.
- **Phân loại khách thuê:** Qwen3 1.7B phân loại sai câu “Đặt lịch giặt đồ” thành khiếu nại. Đã thêm nhận diện chắc chắn cho câu đặt lịch/đăng ký dịch vụ và sửa chuẩn hóa chữ `Đ` hoa, vốn làm các câu bắt đầu bằng “Đặt…” trượt qua bộ nhận diện. Câu này giờ mở đúng luồng Tiện ích.
- **Chủ trọ:** Khi Cloudy chưa hiểu câu hỏi, phần gợi ý giờ cũng nêu rõ chủ trọ có thể yêu cầu tạo tiện ích miễn phí hoặc có phí. Kiểm thử model thô cho thấy Qwen3 1.7B có thể phân loại “thống kê cư dân” thành việc tổng quan hoặc chưa nhận ra khiếu nại; route hiện tại có bộ nhận diện theo cụm từ cho hai nghiệp vụ này và test xác nhận các câu đại diện được đưa vào đúng truy vấn đọc dữ liệu. Hành động tạo dịch vụ và quyết định yêu cầu vẫn dùng xác nhận riêng.

## Tiếp tục cải thiện hội thoại — 2026-10-29

- Resident Cloudy giữ một nhãn chủ đề trong lúc cửa sổ chat đang mở (`services`, `meter`, `requests`, hoặc `invoice`). Với câu nối rõ như “còn cái nào nữa?” sau khi xem tiện ích, backend chỉ nhận nhãn này; không gửi lịch sử, ID phòng/dịch vụ/hóa đơn hay dữ liệu cá nhân. Ý định mới nói rõ luôn được ưu tiên. Phản hồi nối lượt được đánh dấu riêng: mở danh sách/lịch sử để xem và nói rõ chưa đặt lịch, chưa tạo yêu cầu mới, chưa gửi chỉ số hay thanh toán; yêu cầu mới không bị điền sẵn nội dung câu hỏi trạng thái. Đóng chat hoặc đổi tài khoản xóa nhãn trong bộ nhớ giao diện.
- Câu gửi chỉ số có động từ và nhắc rõ chỉ số/đồng hồ được nhận diện trực tiếp để mở biểu mẫu kiểm tra; phân loại không gửi ảnh hay ghi dữ liệu.
- Bộ chuẩn hóa tìm phòng giờ coi `Wi-Fi`, `Wi Fi` và `wifi` là cùng mã tiện ích. Bộ đánh giá live lần đầu bắt được lỗi “thêm Wi-Fi” bị hỏi lại; sau sửa, tìm tiếp giữ đủ khu vực/giá/số người/máy lạnh và thêm Wi-Fi.
- Ảnh người dùng bắt lỗi với “tôi muốn tìm phòng 2tr”: bộ tạo ứng viên trước đây bỏ số tiền vì chưa có phép so sánh, khiến Cloudy gọi đây là cụm chưa hiểu. Nay Cloudy nhận `2tr` là 2.000.000đ/tháng và hỏi người dùng muốn mức tối đa hay giá chính xác; không lọc hoặc tìm phòng cho tới khi làm rõ. “Ngân sách 2tr” và “dưới 2tr” vẫn được hiểu thành bộ lọc có phép so sánh rõ.
- Có thể chạy lại bộ đánh giá câu hỏi thật bằng `python -B scripts/cloudy-ai/evaluate_live.py`. Runner dùng Qwen3 1.7B cục bộ, xác thực Owner được giả lập, không kết nối database và không tạo dữ liệu.

## Kiểm tra

- Backend Cloudy khách thuê: **13/13 test PASS**, bao gồm HTTP auth, context giới hạn, trả lời làm rõ bằng chat, câu đặt dịch vụ và gửi chỉ số.
- Frontend assistant, owner route/intent và public chat service: **27/27 test PASS** trong lượt UX trước; bộ Owner classifier/scope hiện tại **19/19 PASS**.
- Bộ test Cloudy phòng công khai: **31/31 test PASS**, gồm bare `2tr`, ngân sách `2tr`, giá `dưới 2tr` và phản hồi khi model còn đánh dấu chưa rõ.
- Frontend và backend TypeScript typecheck: **PASS**.
- Qwen3 1.7B qua bộ đánh giá live hiện tại: **18/18 PASS** — năm trường hợp public (gồm tìm tiếp và cách viết `2tr`), sáu câu Resident và bảy câu Owner. Lượt đầu **3/5** ở phần public; lỗi `Wi-Fi` đã được sửa rồi chạy lại. Đây là bộ hồi quy nhỏ có chủ đích, không phải benchmark độ chính xác tổng quát.
- Kiểm tra mở rộng lại cùng runner sau khi bổ sung câu hỏi Cloudy khách thuê: **22/29 PASS**. Phần public đạt **5/5**, Resident **11/12**, Owner **6/12**. Bảy trường hợp chưa đạt nằm ở phân loại câu Resident/Owner (`resident.test-005`; `owner.test-002/003/005/007/010/012`); không thuộc parser public vừa chỉnh và không được sửa trong task này. Đây là bộ rộng hơn bằng chứng 18/18 ở trên; không kết nối database và không ghi dữ liệu.
- `git diff --check`: PASS; chỉ có cảnh báo chuyển LF/CRLF trên các file vốn đã thay đổi.

## Giới hạn còn lại

Qwen3 1.7B vẫn nhỏ hơn ChatGPT và có thể nhầm câu ít phổ biến. Hệ thống bù bằng bộ định tuyến nghiệp vụ, dữ liệu có nguồn từ API, hỏi lại khi mơ hồ và xác nhận riêng trước thao tác ghi. Chưa kiểm tra trực quan sau khi gỡ lối tắt hoặc thử luồng chat với tài khoản Resident đang đăng nhập; các biểu mẫu nghiệp vụ, thông báo tải lỗi và luồng đặt tiện ích vẫn cần review trong app.

API contract được bổ sung trường ngữ cảnh tùy chọn có schema giới hạn; không đổi quy tắc nghiệp vụ, schema hoặc dữ liệu database.

## Resident Cloudy: làm chat tự nhiên hơn — 2026-10-29

Khung khách thuê hiện lưu hội thoại trong phiên mở: tin nhắn khách nằm bên phải, Cloudy bên trái. Trong lúc API xử lý, chat báo “Cloudy đang nghĩ” với dấu chấm chuyển động; sau khi nhận đủ phản hồi, nội dung hiện theo nhịp gõ ngắn. Đây là hiệu ứng hiển thị, chưa phải token streaming từ model. Lỗi kết nối được trả thành tin nhắn dễ hiểu và câu hỏi vẫn còn trong lịch sử. Khung chat cao hơn, lịch sử có vùng cuộn riêng và ô nhập luôn dễ tiếp cận; hỗ trợ `prefers-reduced-motion` và thông báo nội dung hoàn chỉnh cho trình đọc màn hình mà không đọc từng ký tự.

Frontend typecheck PASS; Resident assistant backend suite 13/13 PASS. `git diff --check` trên hai file UI PASS; lệnh toàn repo vẫn báo trailing whitespace ở các dòng đã tồn tại trong `backend/src/services/property-service.routes.test.ts`. Lượt UI ban đầu chưa xác minh được production build vì Next báo một tiến trình khác giữ lock; ở lượt tiếp theo production build đã chạy PASS. Chưa kiểm tra trực quan/đăng nhập thật theo yêu cầu không dùng computer use; không đổi API, nghiệp vụ, schema hay database.

## Resident Cloudy: xác nhận yêu cầu dễ thấy hơn — 2026-10-29

Sau khi cư dân gửi khiếu nại/yêu cầu, biểu mẫu hiện thẻ xác nhận màu xanh có mã yêu cầu và trạng thái, còn Cloudy thêm một tin nhắn xác nhận vào hội thoại. Cả hai nêu rõ phòng chưa thay đổi và đang chờ chủ trọ xử lý. Form, chat log và composer được bố trí thành vùng cuộn riêng với composer cố định bên dưới để tránh che phần cuối biểu mẫu. Thẻ xác nhận tự cuộn vào vùng nhìn thấy; hiệu ứng tôn trọng `prefers-reduced-motion`. Nếu gửi thành công nhưng tải lại lịch sử lỗi, UI vẫn giữ xác nhận và báo riêng việc danh sách chưa cập nhật.

Frontend typecheck, CSS parse, `git diff --check` trên ba file UI và frontend production build PASS. Không đổi API, nghiệp vụ, schema/database. Không dùng computer use nên chưa có visual review trong app.

## Resident Cloudy: sửa cuộn lồng nhau — 2026-10-29

Ảnh người dùng cho thấy transcript chat, kết quả hóa đơn và hộp thoại có các thanh cuộn lồng nhau. Đã bỏ overflow riêng trên transcript, gom hội thoại và nội dung nghiệp vụ vào một vùng cuộn duy nhất, giữ composer cố định ở đáy, đồng thời khóa cuộn trang nền khi modal mở và khôi phục trạng thái ban đầu lúc đóng. Chat mới tiếp tục tự cuộn xuống cuối; khi gửi yêu cầu từ biểu mẫu, vùng cuộn đưa thẻ xác nhận tới vị trí nhìn thấy.

Frontend typecheck, CSS parse và production build PASS. Không dùng computer use nên chưa xác minh trực quan sau sửa; không đổi API, nghiệp vụ hoặc database.

## Resident Cloudy: avatar Messenger cho tin nhắn trợ lý — 2026-10-29

Tái sử dụng mascot Cloudy 2D hiện có làm avatar ở cạnh trái mỗi tin nhắn trợ lý và trạng thái “đang nghĩ”; tin nhắn cư dân tiếp tục căn bên phải. Avatar được tách thành component dùng chung với Cloudy chat công khai để hai giao diện giữ cùng hình ảnh, thu nhỏ còn 34px trong chat cư dân để giữ chỗ cho nội dung ở màn hình hẹp. Frontend typecheck và production build PASS; `git diff --check` trên các file đã sửa PASS. Không đổi API, nghiệp vụ hoặc database. Không dùng computer use nên chưa xác minh trực quan trong app.

## Đồng bộ avatar và trạng thái chờ ở Cloudy chủ trọ/tìm phòng — 2026-10-29

Cloudy chủ trọ dùng cùng mascot bên trái lời chào, từng tin nhắn trợ lý và trạng thái đang nghĩ; tin nhắn người dùng căn phải. Cloudy tìm phòng công khai đã có avatar cho lời chào, từng phản hồi và đang chờ; phần chờ nay dùng cùng dấu chấm chuyển động như chat Resident/Owner. Dấu chấm tắt chuyển động khi bật `prefers-reduced-motion`. Cả ba giao diện dùng chung component mascot 2D. Frontend typecheck và production build PASS. Không đổi API, nghiệp vụ, schema hoặc database. Không dùng computer use nên chưa xác minh trực quan trong app.

## Owner Cloudy: kéo đổi kích thước khung chat — 2026-10-29

Theo ảnh người dùng, bỏ các nút `+ / −` ở header. Khung Owner Cloudy có tay kéo trên bốn cạnh và bốn góc để thay đổi cả chiều rộng lẫn chiều cao; giới hạn kích thước theo vùng nhìn thấy và safe area. Tay kéo hỗ trợ chuột, cảm ứng ở desktop/tablet và phím mũi tên khi focus. Ở màn hình mobile, khung vẫn dùng chiều ngang màn hình và ẩn các tay kéo. Nút đóng vẫn giữ nguyên.

Frontend typecheck và production build PASS; `git diff --check` trên hai file giao diện PASS. Chưa kiểm tra trực quan thao tác kéo trong browser; không đổi API, nghiệp vụ hoặc database.

## Owner Cloudy: bỏ nút câu hỏi gợi ý mặc định — 2026-10-29

Đã gỡ các nút lối tắt ban đầu như hóa đơn chưa trả, yêu cầu từ khách, thống kê cư dân, phòng còn trống và dữ liệu hóa đơn thiếu để chủ trọ bắt đầu bằng chat tự do. Các lựa chọn cần thiết trong luồng tạo tiện ích và xác nhận tra cứu vẫn xuất hiện theo bước. Frontend typecheck và production build PASS; `git diff --check` trên các file đã sửa PASS. Không đổi API, nghiệp vụ hoặc database. Không dùng computer use nên chưa kiểm tra trực quan trong app.

## Lời chào Cloudy theo đúng vai trò — 2026-10-29

Ảnh người dùng cho thấy lời chào ở trang tìm phòng liệt kê cả chức năng của khách thuê và chủ trọ, khiến Cloudy công khai có vẻ đại diện cho cả ba trợ lý. Đã thu gọn lời chào này về đúng một vai trò: tìm phòng công khai, với ví dụ về khu vực/giá/tiện ích và nhắc xác nhận trước khi lọc. Lời chào Resident vốn chỉ nói về trợ lý khách thuê, còn Owner chỉ nói các việc quản lý chủ trọ; giữ nguyên hai lời chào đó. Frontend typecheck và production build PASS. Không đổi API, nghiệp vụ hoặc database. Không dùng computer use nên chưa kiểm tra trực quan.

## Owner Cloudy: làm mềm dấu kéo ở bốn góc — 2026-10-29

Ảnh người dùng cho thấy các góc chữ L trông như khung bị lỗi. Thay dấu viền góc vuông bằng vạch ngắn bo tròn, đặt chéo theo hướng kéo; vùng bắt thao tác và khả năng kéo bằng chuột/phím vẫn giữ nguyên. Frontend typecheck, production build và kiểm tra whitespace PASS. Không đổi API, nghiệp vụ hoặc database; chưa xác minh trực quan trong browser.

## Public Cloudy: nhận diện địa điểm trong câu ví dụ — 2026-10-29

Người dùng báo câu “Tìm phòng Thủ Đức dưới 4 triệu, có máy lạnh, cho 2 người” bị trả lời chưa hiểu địa điểm. Bộ tách trước đó chỉ nhận địa điểm sau “ở/tại/khu vực”, trong khi câu ví dụ lược chữ “ở”. Giờ Cloudy cũng nhận địa điểm ngay sau “tìm/thuê/cần phòng”, nhưng không nhầm “có máy lạnh”, “cho 2 người” hay “tại Huế” thành địa điểm sai. Thêm hồi quy cho đúng ví dụ với cả bốn tiêu chí. Python Cloudy 33/33 và live Qwen3 1.7B trích đủ bộ lọc, trả trạng thái `ready`. Frontend typecheck chưa đạt do lỗi trùng khóa `electricity_ranking` có sẵn trong `frontend/src/lib/owner-chat-intent.ts`, ngoài các file task; chưa chạy production build. Không đổi API, database hoặc business flow.

## Bộ câu hỏi hồi quy tìm phòng công khai — 2026-10-29

Thêm `scripts/cloudy-ai/room_search_question_bank.json` với 15 câu có kỳ vọng cụ thể: tìm nhiều tiêu chí, tên địa điểm viết tắt/không dấu, tiền viết tắt hoặc có dấu phân nhóm, nhiều tiện ích, tiêu chí thiếu giá, và các trường hợp cần hỏi lại như khoảng cách, giá không rõ phép so sánh, phủ định, giới hạn mâu thuẫn và mức giá/diện tích ước lượng. `evaluate_room_search_bank.py` chạy từng câu qua Qwen cục bộ; `test_room_search_bank.py` kiểm tra bộ lọc xác định mà không gọi model. Benchmark Qwen đạt 15/15; nó phát hiện tên “Bình Thạnh khoảng” bị dính vào địa điểm, nên ranh giới địa điểm nay dừng trước “khoảng/tầm” và regression xác nhận chỉ giữ “Bình Thạnh”. Python Cloudy 43/43, riêng parser và question bank 11/11. Bộ đánh giá không truy cập hoặc ghi database; không đổi API hay nghiệp vụ.
