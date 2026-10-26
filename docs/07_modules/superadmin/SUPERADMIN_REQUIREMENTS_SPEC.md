# Góc Trọ — Đặc tả Superadmin

**Trạng thái:** CURRENT — đặc tả nghiệp vụ đã chốt; chưa triển khai source/API/database  
**Ngày:** 2026-10-26  
**Phạm vi:** quản trị nền tảng, tách khỏi Admin trong phạm vi một chủ trọ

## 1. Mục tiêu và nguyên tắc

Superadmin quản lý tài khoản chủ trọ, theo dõi các khu trọ đang hoạt động trên toàn nền tảng, tiếp nhận phản ánh gửi tới nền tảng và xem nhật ký hoạt động nhạy cảm. Superadmin không thay thế Admin của chủ trọ và không trực tiếp vận hành dữ liệu hằng ngày của từng khu trọ.

- Quyền Superadmin là quyền cấp nền tảng, không bị giới hạn vào một Owner duy nhất.
- Admin/Owner vẫn chỉ quản lý dữ liệu thuộc Owner của mình.
- Backend là nơi quyết định quyền; client không được tự suy ra hoặc mở rộng phạm vi dữ liệu.
- Dữ liệu production, dữ liệu thử nghiệm và dữ liệu bản đồ minh họa phải tách biệt.
- Các thao tác nhạy cảm phải có actor, thời điểm, đối tượng, kết quả và lý do khi nghiệp vụ yêu cầu.

## 2. Vai trò và quyền

### 2.1 Superadmin

Superadmin được phép tạo tài khoản Owner; gửi/gửi lại liên kết đặt mật khẩu; khóa/mở khóa tài khoản Owner; đọc số liệu Owner/Property; tìm kiếm, lọc và xem Property trên bản đồ; xử lý phản ánh gửi tới nền tảng; và xem nhật ký nếu được cấp quyền riêng.

Superadmin không được xem hoặc đặt mật khẩu thay Owner, và không được dùng màn hình ứng dụng bản đầu để trích xuất toàn bộ dữ liệu khu trọ.

### 2.2 Quyền xem nhật ký

Quyền xem nhật ký là quyền nhạy cảm, được cấp riêng theo chỉ định của chủ dự án; Superadmin không tự cấp quyền này cho mình. Có role Superadmin không mặc nhiên đồng nghĩa với quyền đọc mọi nhật ký. Tài khoản Superadmin đầu tiên do người phụ trách kỹ thuật tạo theo yêu cầu của chủ dự án và ghi dấu vết. Quy trình cấp/thu hồi quyền cần thiết kế trước implementation.

## 3. Quản lý tài khoản Owner

Superadmin tạo hồ sơ Owner và lời mời ở trạng thái chờ thiết lập mật khẩu; Account đăng nhập chỉ tạo khi chủ trọ tự đặt mật khẩu. Liên kết gửi qua email đã xác nhận với chủ trọ bằng kênh khác (ví dụ cuộc gọi), dùng một lần và hết hạn sau **24 giờ**; token không được hiển thị lại hoặc lưu dạng rõ. Cần dịch vụ gửi email thật trước khi vận hành luồng này.

Superadmin chỉ yêu cầu gửi liên kết đặt lại/thiết lập mới. Liên kết đặt lại hết hạn sau **30 phút**; liên kết mới làm liên kết cũ mất hiệu lực. Owner tự đặt mật khẩu; Superadmin không đọc, nhập, đặt hoặc xác nhận mật khẩu thay Owner.

Khóa và mở khóa đều phải có lý do không rỗng. Khi bị khóa, mọi yêu cầu tiếp theo bị chặn và các phiên của Owner bị vô hiệu hóa; nếu thu hồi phiên lỗi phải báo để xử lý lại. Owner không thể đăng nhập hoặc quản lý khu trọ. Mở khóa không khôi phục phiên cũ. Dữ liệu Owner, Property, Room, Resident, Contract, Invoice và lịch sử liên quan được giữ nguyên. Mọi thao tác tạo tài khoản, gửi liên kết, khóa/mở khóa đều phải ghi nhật ký.

## 4. Thống kê và bản đồ

Màn hình hiển thị số Owner và số Property đang hoạt động. Property đang hoạt động là Property đang bật/được hiển thị; Property ẩn, ngừng hoạt động hoặc lưu trữ không được tính. Quan hệ Owner → Property phải được trả đúng, không trộn dữ liệu giữa Owner.

Luồng bản đầu:

1. Hiển thị toàn cảnh Việt Nam.
2. Chọn hoặc tìm tỉnh/thành.
3. Phóng tới tỉnh/thành và hiển thị ghim Property có tọa độ hợp lệ.
4. Chọn ghim để xem thông tin nhanh.
5. Mở panel bên phải để xem chi tiết Property và Owner.

Thanh công cụ trái gồm chọn tỉnh/thành, bộ lọc cơ sở, phản ánh, cấp tài khoản và nhật ký hoạt động. Thanh trên gồm tìm kiếm tỉnh/thành và số liệu tổng quan. Có nút quay về toàn cảnh Việt Nam; không dùng bản đồ Việt Nam thu nhỏ ở góc dưới.

Bản đầu ưu tiên bản đồ chi tiết có đường phố, tọa độ thật và ghim thật. 3D/địa hình/tòa nhà là nâng cấp sau; bản đồ Three.js hiện tại của Public Explorer chưa có dữ liệu đường phố hoặc tọa độ Property chính xác.

Bộ lọc dự kiến gồm trạng thái Property, Owner, khu vực và tình trạng phản ánh. Danh sách, số liệu và ghim phải dùng cùng một tập kết quả sau lọc. Enum trạng thái phải đối chiếu schema/API trước khi chốt contract.

## 5. Phản ánh gửi tới nền tảng

Phản ánh nền tảng là nghiệp vụ riêng, không phải Complaint nội bộ do Owner xử lý.

- Bất kỳ người nào cũng có thể gửi, không bắt buộc đăng nhập.
- Người gửi được chọn ẩn danh; thông tin liên hệ là tùy chọn để Superadmin phản hồi thủ công.
- Tạo phản ánh phải có rate limit và biện pháp chống spam.
- Trạng thái chuẩn: `NEW` → `IN_PROGRESS` → `RESOLVED`.
- Mỗi lần đổi trạng thái lưu người xử lý, thời điểm và ghi chú.
- Phản ánh đã giải quyết vẫn được giữ để tra cứu/audit.
- Bản đầu chỉ nhận phản ánh gắn với một Property; chưa nhận phản ánh chung, tệp đính kèm hoặc mở lại sau khi giải quyết. Mục tiêu nội bộ là kiểm tra phản ánh mới trong **2 ngày làm việc**, chưa cam kết thời hạn xử lý công khai. Cần chốt cách theo dõi hàng đợi và ngày làm việc trước khi vận hành.

## 6. Nhật ký hoạt động và xác thực tăng cường

Audit tối thiểu ghi: tạo Owner account, gửi/gửi lại liên kết, khóa, mở khóa, xử lý phản ánh, và lượt truy cập nhật ký thành công/thất bại. Event có actor, hành động, đối tượng, thời điểm, kết quả, request/correlation ID nếu có, lý do khi bắt buộc và metadata tối thiểu. Không ghi mật khẩu, token rõ hoặc dữ liệu không cần thiết.

Khi mở nhật ký, người có quyền phải nhập lại mật khẩu của chính tài khoản đang đăng nhập. Không dùng mật khẩu chung hoặc mật khẩu Superadmin khác. Quyền xem tạm hết sau **10 phút không hoạt động** hoặc **30 phút** từ lúc nhập lại, tùy mốc đến trước. Lượt xác thực lại thành công/thất bại cũng phải được ghi. Định hướng lưu nhật ký **12 tháng**, rà soát theo nhu cầu vận hành và chính sách dữ liệu trước production; số lần thử và cơ chế lưu trạng thái cần thiết kế trước implementation.

## 7. Trích xuất dữ liệu nội bộ

Chức năng trích xuất toàn bộ Property, gồm Resident, Contract và Invoice liên quan, **không hiển thị trong ứng dụng Superadmin bản đầu**.

Khi có yêu cầu phối hợp hợp lệ, đội kỹ thuật thực hiện theo quy trình nội bộ có kiểm soát. Mỗi lần trích xuất ghi lý do, Property, phạm vi dữ liệu, người thực hiện, thời điểm và nơi bàn giao. Đây là trích xuất nội bộ, không phải crawl dữ liệu bên ngoài.

## 8. Tọa độ và dữ liệu thử nghiệm

Property trên bản đồ cần có tỉnh/thành và tọa độ đã kiểm tra. Không suy ra tọa độ chính xác chỉ từ tên địa chỉ nếu chưa có nguồn và quy trình xác minh.

Khi kiểm thử, chỉ nạp dữ liệu giả vào database thử nghiệm riêng. Mỗi Property mẫu có Owner giả, tỉnh/thành, tọa độ và trạng thái. Không trộn fixture với production; fixture phải nhận diện được và có cách xóa an toàn.

## 9. Màn hình bản đầu

1. Map workspace: bản đồ, tìm kiếm, số liệu và quay về toàn cảnh.
2. Owner account: tạo, gửi liên kết, khóa/mở khóa và lịch sử thao tác.
3. Property detail: thông tin nhanh và panel Owner/Property.
4. Platform reports: danh sách, chi tiết, trạng thái và ghi chú.
5. Audit access: re-authentication rồi mới mở nhật ký.

Trích xuất dữ liệu không nằm trong navigation hoặc màn hình bản đầu.

## 10. Ngoài phạm vi và điều kiện triển khai

Đặc tả này chưa chốt API path/DTO, database tables/indexes, provider bản đồ, chi phí bản đồ, dịch vụ gửi email cụ thể, giới hạn thử, cách lưu phiên và quy trình production. Các thời hạn và quy tắc nghiệp vụ đã chốt nằm ở §2–6; không tự suy ra chi tiết hạ tầng để code.

Trước implementation cần đối chiếu schema/API Owner–Property–Complaint; thiết kế role/permission và session security; chốt nguồn bản đồ; thiết kế audit model; xác định trường địa chỉ/tọa độ; rồi mới tạo API/database migration theo quy trình versioned.

## 11. Tiêu chí duyệt

- Phân biệt Superadmin với Owner/Admin và không phá Owner scope.
- Không có luồng xem hoặc đặt mật khẩu Owner.
- Khóa mất quyền truy cập nhưng bảo toàn dữ liệu.
- Active Property loại trừ Property ẩn/ngừng hoạt động.
- Lọc đồng bộ giữa số liệu, danh sách và ghim.
- Anonymous/public report có rate limit và lịch sử trạng thái.
- Audit có actor, timestamp, reason/result và re-authentication.
- Trích xuất nội bộ không xuất hiện trong UI bản đầu.
- Dữ liệu thử nghiệm tách production và dọn được.

