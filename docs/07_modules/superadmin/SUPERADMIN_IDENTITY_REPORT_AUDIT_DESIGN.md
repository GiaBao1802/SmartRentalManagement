# Góc Trọ — Thiết kế Superadmin: quyền, tài khoản, phản ánh và nhật ký

**Trạng thái:** REFERENCE — hướng nghiệp vụ được chủ dự án chốt ngày 2026-10-26; chưa là hợp đồng API hoặc lệnh thay đổi database  
**Ngày:** 2026-10-26  
**Phạm vi:** bốn luồng nêu trong tiêu đề; bản đồ chi tiết và trích xuất dữ liệu không thuộc thiết kế này.  
**Nguồn:** [đặc tả Superadmin](SUPERADMIN_REQUIREMENTS_SPEC.md), [gap report](SUPERADMIN_SCHEMA_API_GAP_REPORT.md), `docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`, `database/baselines/v1.8/schema.sql`, `database/schema.prisma`, Auth/Accounts/Enrollment backend hiện tại.

## 1. Ranh giới hiện tại

Database V1.8 chỉ cho `accounts.role` là `admin` hoặc `resident`, đồng thời bắt buộc một trong `owner_id` hoặc `resident_id` tương ứng và bắt buộc `password_hash`. Backend chỉ tạo phiên đăng nhập cho hai vai trò này. `account_invitations` luôn gắn với Resident, còn `complaints` luôn gắn với Resident và Owner. Nhật ký Contract/Complaint không phải nhật ký quản trị nền tảng. Vì vậy các cấu trúc đó chỉ cung cấp mẫu thiết kế, không được dùng nguyên trạng để cấp quyền Superadmin.

Các lựa chọn nghiệp vụ ở §9 đã được chủ dự án chốt. Chi tiết giao tiếp, cấu trúc database và hạ tầng vận hành tiếp tục cần thiết kế/kiểm chứng trước khi sửa source. Chưa đổi baseline V1.8 hoặc mở route mới.

## 2. Quyền và danh tính

### 2.1 Loại tài khoản

Đề xuất thêm vai trò `superadmin` vào `accounts`, với `owner_id = NULL` và `resident_id = NULL`. Ràng buộc database phải chấp nhận đúng ba trường hợp: Admin có Owner, Resident có Resident, Superadmin không gắn hai đối tượng đó. Superadmin phải có mật khẩu do chính người sở hữu đặt và trạng thái `active` hoặc `locked` như tài khoản khác. Không gán một Owner giả để vượt qua kiểm tra hiện tại.

Superadmin đầu tiên do người phụ trách kỹ thuật tạo theo yêu cầu của chủ dự án và ghi dấu vết; không có trang tự đăng ký. Người được xem nhật ký do chủ dự án chỉ định và được cấp quyền theo quy trình nội bộ; Superadmin không tự cấp quyền xem nhật ký cho chính mình. Tài khoản Owner/Admin được Superadmin tạo vẫn chịu quy tắc một Owner có tối đa một Admin Account.

### 2.2 Bảng quyền đã chốt cho phạm vi này

| Hành động | Khách | Cư dân | Chủ trọ/Admin | Superadmin thường | Superadmin được cấp quyền nhật ký |
|---|---:|---:|---:|---:|---:|
| Gửi phản ánh nền tảng | Có | Có | Có | Có | Có |
| Xem Owner/Property toàn nền tảng | Không | Không | Không | Có | Có |
| Tạo Owner, gửi liên kết, khóa/mở khóa Owner | Không | Không | Không | Có | Có |
| Xem và xử lý phản ánh nền tảng | Không | Không | Không | Có | Có |
| Xem nhật ký nền tảng | Không | Không | Không | Không | Có, sau khi nhập lại mật khẩu |
| Quản lý Property/Room/Contract/Invoice của Owner bằng API Admin | Không | Không | Chỉ của mình | Không | Không |

Backend kiểm tra quyền ở từng yêu cầu. Giao diện ẩn nút chỉ để giảm nhầm lẫn; ẩn nút không phải biện pháp bảo vệ. Quyền xem nhật ký được lưu dưới dạng cấp quyền riêng theo `account_id`, có người cấp, thời điểm cấp/thu hồi và dấu vết thay đổi. Bản đầu không có màn hình tự cấp quyền này: người được chủ dự án chỉ định cấp/thu hồi qua quy trình nội bộ đã xác thực và có nhật ký. Chỉ người có quyền `PLATFORM_AUDIT_READ` mới được thử nhập lại mật khẩu để xem nhật ký.

### 2.3 Cách kiểm tra trong chương trình

Thêm nhánh đăng nhập Superadmin và bộ kiểm tra riêng cho API nền tảng. Không cho Superadmin đi qua `requireAdmin` hoặc hàm lấy `owner_id` từ phiên đăng nhập. Các API `/api/v1/platform/*` mặc định từ chối nếu không có quyền nền tảng tương ứng; các API Admin hiện hữu giữ nguyên phạm vi Owner. Mọi ID Owner/Property do client gửi là **đối tượng cần tra cứu**, không phải nguồn cấp quyền. Khi tài khoản Superadmin bị khóa hoặc quyền nhật ký bị thu hồi, yêu cầu tiếp theo phải bị từ chối ngay; mọi quyền xem nhật ký tạm thời bị xóa.

### 2.4 Tình huống cần kiểm tra

- Admin/Resident gọi API nền tảng → bị từ chối; Superadmin gọi API Admin của một Owner → bị từ chối.
- Superadmin không có quyền nhật ký → không được vào màn hình nhật ký dù biết đường dẫn.
- Quyền nhật ký bị thu hồi trong lúc đang xem → yêu cầu kế tiếp bị từ chối.
- Dữ liệu từ client tự khai `role`, `owner_id` hoặc quyền → không làm thay đổi phạm vi truy cập.
- Tài khoản khóa, phiên hết hạn hoặc đăng xuất → không còn quyền truy cập và quyền nhật ký tạm thời.

## 3. Cấp và quản lý tài khoản chủ trọ

### 3.1 Tạo mới

1. Superadmin nhập tên chủ trọ và email nhận liên kết. Người vận hành xác nhận email đó thuộc đúng chủ trọ qua kênh khác, ví dụ gọi điện; kiểm tra trùng email/số điện thoại và Owner đã có tài khoản.
2. Hệ thống tạo `Owner` cùng lời mời đặt mật khẩu trong một giao dịch. Giao diện hiển thị **Chờ chủ trọ thiết lập mật khẩu**. Chưa tạo `Account`, vì bảng hiện tại bắt buộc mật khẩu; không ghi mật khẩu giả hoặc mật khẩu do Superadmin chọn.
3. Hệ thống phát hành liên kết ngẫu nhiên dùng một lần, có thời hạn; chỉ lưu bản kiểm tra của mã liên kết. Phần liên kết rõ chỉ gửi bằng dịch vụ email thật đến địa chỉ đã xác nhận; không có trong phản hồi API, màn hình quản trị, nhật ký hoặc log kỹ thuật. Phải biết kết quả gửi trước khi hiển thị “đã gửi”.
4. Chủ trọ mở liên kết, tự đặt mật khẩu. Hệ thống khóa bản ghi lời mời, kiểm tra còn hiệu lực/chưa sử dụng, tạo đúng một `Account(role=admin, owner_id=...)`, đánh dấu lời mời đã nhận trong cùng giao dịch. Sau đó chủ trọ tự đăng nhập; không tự đăng nhập ngay sau khi đặt mật khẩu.

Lời mời hết hạn, bị thu hồi hoặc đã dùng phải bị từ chối như nhau ở màn hình công khai. Nếu việc gửi không xác nhận được, giao diện báo rõ **chưa xác nhận giao thành công**; không coi tạo Owner là đã giao liên kết. Cần quy trình xử lý Owner ở trạng thái chờ lâu ngày, không xóa tự động Owner nếu sau này có Property hoặc dữ liệu liên quan.

Thời hạn lời mời Owner đã chốt là **24 giờ**. Cần thiết kế số lần thử và dịch vụ gửi email cụ thể trước khi triển khai.

### 3.2 Gửi lại và đặt lại mật khẩu

Gửi lại lời mời chỉ áp dụng khi chưa có Admin Account. Nếu đã có Account, dùng luồng **đặt lại mật khẩu**. Một Owner chỉ có tối đa một lời mời chờ còn hiệu lực. Nút gửi lại không tạo nhiều tài khoản hoặc nhiều liên kết dùng đồng thời. Khi phát hành liên kết mới, liên kết cũ bị thu hồi trong cùng giao dịch; phải hiển thị tình trạng giao của liên kết mới để người vận hành có thể xử lý lỗi. Không tự động gửi lại sau kết quả gửi không rõ ràng, nhằm tránh gửi trùng ngoài ý muốn. Nếu email mới giao thất bại, giao diện báo rõ liên kết cũ đã mất hiệu lực và cho phép Superadmin yêu cầu liên kết khác.

Đặt lại mật khẩu chỉ gửi liên kết cho chính chủ trọ qua email đã xác minh. Thời hạn đã chốt là **30 phút** như luồng đặt lại mật khẩu đang có. Chỉ khi chủ trọ tự đặt mật khẩu mới cập nhật mật khẩu và thu hồi tất cả phiên cũ. Gửi liên kết không được mở khóa tài khoản; chủ trọ bị khóa vẫn không đăng nhập sau khi đổi mật khẩu. Phản hồi gửi lại/đặt lại không chứa mã hoặc mật khẩu.

### 3.3 Khóa và mở khóa

- Chỉ khóa/mở khóa `Account(role=admin)` gắn với Owner có thật; không áp dụng endpoint này cho Resident hoặc Superadmin.
- Cả hai thao tác yêu cầu lý do rõ ràng; ghi người thao tác, thời điểm, trạng thái trước/sau và kết quả. Nếu trạng thái đã đúng, trả kết quả nhất quán và ghi nhận lần yêu cầu mà không tạo chuyển trạng thái giả.
- Khóa đặt `status=locked` để mọi request kế tiếp bị từ chối theo trạng thái tài khoản, rồi vô hiệu hóa tất cả phiên của chủ trọ. Nếu kho phiên lỗi, màn hình phải báo cần xử lý lại/đối soát; không được báo đã thu hồi đủ phiên. Việc thu hồi cần cơ chế thử lại vì kho phiên và database không thể cùng nằm trong một giao dịch.
- Mở khóa đặt `status=active` nhưng không phục hồi phiên cũ. Chủ trọ phải đăng nhập lại.
- Không xóa Owner, Property, Room, Resident, Contract hoặc Invoice khi khóa. Không tự thay đổi trạng thái công khai của Property chỉ vì Owner bị khóa.

### 3.4 Dữ liệu và giao diện tối thiểu

Đề xuất bảng lời mời Owner riêng với `owner_id`, địa chỉ người nhận đã xác minh, mã liên kết dạng kiểm tra, trạng thái, hạn dùng, người tạo, thời điểm tạo/gửi/chấp nhận/thu hồi và kết quả giao. Bảng lời mời Resident hiện có không phù hợp vì bắt buộc `resident_id` và người tạo cùng Owner. Cần kiểm tra trùng Owner và địa chỉ nhận trước khi commit.

Màn hình quản lý Owner hiển thị tên, liên hệ cần thiết, trạng thái **Chờ đặt mật khẩu / Hoạt động / Đã khóa**, ngày gửi/hạn liên kết, kết quả giao và lịch sử thao tác. Không hiển thị mật khẩu, mã liên kết hoặc bản kiểm tra của mã.

## 4. Phản ánh gửi tới nền tảng

### 4.1 Nguồn và cách gửi

Tạo nguồn dữ liệu **phản ánh nền tảng** riêng. Không ghi phản ánh này vào `complaints`: Complaint hiện bắt buộc Resident và thuộc quy trình Owner giải quyết. Form công khai cho phép người chưa đăng nhập gửi; người đã đăng nhập có thể dùng cùng form. Người gửi chọn Property được phản ánh, nhập nội dung, có thể gửi ẩn danh; tên và kênh liên lạc chỉ cần khi họ muốn nhận phản hồi. Khi có liên hệ, Superadmin có thể phản hồi thủ công. Khi không có thông tin liên hệ thì giao diện không hứa phản hồi riêng.

Bản đầu yêu cầu `property_id` hợp lệ để bảo đảm phản ánh gắn đúng khu trọ; chưa nhận phản ánh chung không chỉ rõ khu trọ. Không hiển thị thông tin cá nhân của người gửi cho Owner/Admin trong bản đầu. Người gửi nhận thông báo tiếp nhận với một mã tham chiếu; mã này không tự cho phép đọc hồ sơ hoặc thông tin liên hệ. Chưa hỗ trợ tệp đính kèm.

Chống gửi liên tục bằng giới hạn theo địa chỉ mạng và dấu hiệu lặp nội dung, giới hạn độ dài và kích thước yêu cầu. Không dựa vào một cách nhận diện thiết bị duy nhất và không chặn cứng cả mạng dùng chung nếu có thể tránh. Thời gian giữ thông tin liên hệ, địa chỉ mạng và chính sách bảo vệ dữ liệu phải được chốt trước khi lưu production.

### 4.2 Trạng thái và lịch sử

| Từ | Sang | Ai làm | Điều kiện |
|---|---|---|---|
| Mới | Đang xử lý | Superadmin có quyền xử lý | Ghi chú bắt buộc |
| Đang xử lý | Đã giải quyết | Superadmin có quyền xử lý | Ghi chú kết quả bắt buộc |

Tạo mới mặc định ở trạng thái **Mới**. Mọi lần chuyển trạng thái lưu người làm, thời điểm, trạng thái trước/sau và ghi chú trong lịch sử riêng; cập nhật trạng thái và thêm lịch sử trong cùng giao dịch. Ghi chú nội bộ không gửi tự động cho người phản ánh. Trạng thái **Đã giải quyết** được giữ để tra cứu. Bản đầu chưa có thao tác mở lại hoặc bỏ qua. Mục tiêu nội bộ là kiểm tra phản ánh mới trong **2 ngày làm việc**; chưa công bố hạn xử lý cam kết với người gửi. Cách tính ngày làm việc và người theo dõi hàng đợi cần ghi trong quy trình vận hành.

Danh sách Superadmin hỗ trợ tìm theo mã, khu trọ, chủ trọ, trạng thái và ngày gửi; có phân trang. Màn hình chi tiết thể hiện nội dung, thông tin liên hệ nếu có, lịch sử xử lý và ghi chú. Tình trạng phản ánh dùng cho bộ lọc bản đồ phải định nghĩa rõ: đề xuất **có ít nhất một phản ánh chưa giải quyết**; không tính phản ánh đã giải quyết. Đây là đề xuất cần duyệt khi chốt phần bản đồ.

### 4.3 Dữ liệu tối thiểu

Đề xuất bảng phản ánh có mã, `property_id`, `owner_id` suy ra từ Property, nội dung, trạng thái, tùy chọn thông tin liên hệ, dấu hiệu gửi ẩn danh, thời điểm gửi/cập nhật/giải quyết. Bảng lịch sử có mã phản ánh, người xử lý, trạng thái trước/sau, ghi chú và thời điểm. Chỉ phản ánh mới được tạo từ form công khai; lịch sử xử lý chỉ do Superadmin ghi. Không gắn `resident_id` bắt buộc.

## 5. Nhật ký quản trị nền tảng

### 5.1 Những việc phải ghi

Tạo một nguồn nhật ký chung, chỉ thêm sự kiện, không sửa hoặc xóa sự kiện qua API ứng dụng. Mỗi sự kiện ghi: loại hành động, kết quả, người thực hiện nếu đã xác định, đối tượng và mã đối tượng, thời điểm, mã nối các bước của cùng yêu cầu, lý do/ghi chú đã rút gọn khi cần. Không ghi mật khẩu, liên kết đặt lại, mã liên kết, dữ liệu liên hệ đầy đủ hoặc toàn bộ nội dung phản ánh.

| Sự kiện | Ghi tối thiểu |
|---|---|
| Tạo Owner và lời mời | Người tạo, Owner, kết quả, tình trạng gửi |
| Gửi lại lời mời / yêu cầu đặt lại mật khẩu | Người yêu cầu, Owner/Account, kết quả giao; không ghi mã liên kết |
| Khóa/mở khóa Owner | Người làm, Account, trước/sau, lý do, kết quả thu hồi phiên |
| Đổi trạng thái phản ánh | Người làm, mã phản ánh, trước/sau, kết quả |
| Nhập lại mật khẩu để xem nhật ký | Người thử, thành công/thất bại, thời điểm; không ghi mật khẩu |
| Truy cập nhật ký | Người yêu cầu, thành công/bị từ chối, bộ lọc ở mức an toàn |
| Cấp/thu hồi quyền xem nhật ký | Người cấp/thu hồi, người nhận, thời điểm, lý do |

Đối với thay đổi dữ liệu thành công, ghi sự kiện cùng giao dịch với thay đổi. Với yêu cầu bị từ chối hoặc lỗi sau khi giao dịch đã quay lại trạng thái cũ, ghi sự kiện qua đường ghi độc lập. Nếu không ghi được sự kiện cho một thao tác nhạy cảm, thao tác đó phải dừng hoặc báo cần đối soát; không tuyên bố hoàn thành khi thiếu dấu vết. Cần theo dõi lỗi ghi nhật ký và có quy trình khôi phục/đối soát, vì kho phiên, nơi gửi liên kết và database không thể luôn commit đồng thời.

### 5.2 Mở màn hình nhật ký

1. Hệ thống kiểm tra Superadmin đang đăng nhập và đã được cấp quyền xem nhật ký.
2. Người đó nhập lại **mật khẩu của chính tài khoản đang đăng nhập**. Giới hạn số lần thử; lỗi trả lời chung, không tiết lộ chi tiết tài khoản.
3. Sau khi đúng mật khẩu, server cấp quyền xem tạm gắn với đúng tài khoản và phiên hiện tại. Không dùng mật khẩu chung, không chỉ lưu cờ ở trình duyệt.
4. Mỗi lần tải trang, lọc hoặc phân trang nhật ký, server kiểm tra lại cả quyền được cấp lẫn quyền tạm. Khi không hoạt động quá thời hạn, đăng xuất, đổi mật khẩu, bị khóa hoặc bị thu hồi quyền, người dùng phải xác thực lại.
5. Ghi cả lượt xác thực và lượt đọc nhật ký thành công/thất bại. Chỉ ghi metadata an toàn, tránh để việc đọc nhật ký lại lộ chính nội dung nhạy cảm.

Quyền xem tạm hết sau **10 phút không hoạt động** hoặc **30 phút kể từ lần nhập lại mật khẩu**, tùy mốc nào đến trước; cũng không vượt quá thời điểm hết hạn phiên đăng nhập gốc. Quyền tạm nên đặt ở kho phiên phía server có chia sẻ giữa các máy chạy ứng dụng; lưu trạng thái cấp quyền cố định ở database. Kho phiên dạng bộ nhớ của một tiến trình hiện chỉ dành cho dev/test và không đáp ứng production. Khi thu hồi quyền xem nhật ký, mọi phiên của Superadmin đó phải mất quyền xem tạm ở yêu cầu kế tiếp.

### 5.3 Màn hình và tra cứu

Danh sách nhật ký có bộ lọc thời gian, người thao tác, hành động, kết quả và đối tượng; phân trang ổn định. Chỉ trả trường cần thiết. Không có chức năng xóa/sửa nhật ký hay xuất toàn bộ trong ứng dụng bản đầu. Thời gian lưu định hướng là **12 tháng**, sau đó rà soát lại theo nhu cầu vận hành và chính sách bảo vệ dữ liệu trước khi đưa vào production. Người có quyền xem do chủ dự án chỉ định; việc cấp/thu hồi có dấu vết.

## 6. Hợp đồng giao tiếp dự kiến để rà soát

Các đường dẫn dưới đây là **phác thảo**, chưa thuộc `docs/04_API_SPEC.md`. API đang dùng cho Admin/Resident giữ nguyên. Mọi thao tác thay đổi dùng kiểm tra phiên, chống gửi yêu cầu giả mạo và giới hạn tần suất phù hợp; phản hồi không chứa bí mật.

| Yêu cầu | Người gọi | Ý nghĩa |
|---|---|---|
| `POST /api/v1/platform/owners` | Superadmin | Tạo Owner và lời mời; trả Owner ID, trạng thái chờ và tình trạng gửi |
| `GET /api/v1/platform/owners` | Superadmin | Danh sách Owner và tình trạng Account, phân trang |
| `POST /api/v1/platform/owners/{id}/invitation-resend` | Superadmin | Gửi lại lời mời khi chưa có Account |
| `POST /api/v1/platform/accounts/{id}/password-reset` | Superadmin | Gửi liên kết đặt lại mật khẩu Owner |
| `POST /api/v1/platform/accounts/{id}/lock` | Superadmin | Khóa; lý do bắt buộc |
| `POST /api/v1/platform/accounts/{id}/unlock` | Superadmin | Mở khóa; lý do bắt buộc |
| `POST /api/v1/public/platform-reports` | Bất kỳ ai | Tiếp nhận phản ánh, trả mã tham chiếu |
| `GET /api/v1/platform/reports` | Superadmin | Danh sách phản ánh, phân trang/lọc |
| `GET /api/v1/platform/reports/{id}` | Superadmin | Chi tiết và lịch sử |
| `POST /api/v1/platform/reports/{id}/transition` | Superadmin | Đổi trạng thái và ghi chú trong cùng giao dịch |
| `POST /api/v1/platform/audit/recheck` | Superadmin có quyền nhật ký | Nhập lại mật khẩu của mình, cấp quyền xem tạm |
| `GET /api/v1/platform/audit-events` | Superadmin có quyền nhật ký và quyền xem tạm | Danh sách nhật ký |

Luồng chấp nhận lời mời Owner và đặt lại mật khẩu có thể dùng màn hình đặt mật khẩu hiện có, nhưng backend phải nhận diện đúng loại liên kết và kiểm tra riêng. Tên đường dẫn, trường yêu cầu/trả lời, mã lỗi, cách thử lại và giới hạn phân trang phải được viết chính thức trong API spec sau khi duyệt.

## 7. Các thay đổi dữ liệu cần yêu cầu riêng

1. Mở rộng ràng buộc `accounts` cho `superadmin`; giữ nguyên quy tắc Admin ↔ Owner và Resident ↔ Resident.
2. Bảng quyền xem nhật ký và lịch sử cấp/thu hồi quyền.
3. Bảng lời mời Owner độc lập với lời mời Resident; trạng thái, hạn dùng và chỉ một lời mời đang chờ trên mỗi Owner.
4. Bảng phản ánh nền tảng và lịch sử chuyển trạng thái; ràng buộc Property/Owner nhất quán.
5. Bảng nhật ký nền tảng chỉ thêm mới, với chỉ mục theo thời gian, người thao tác, loại hành động và đối tượng.
6. Cơ chế lưu quyền xem tạm trong kho phiên; không cần bảng nghiệp vụ chỉ để ghi cờ tạm.

Lập yêu cầu thay đổi cho phiên bản **sau V1.8**; số phiên bản cụ thể do quy trình database quyết định. Viết kế hoạch chuyển dữ liệu cũ, xác minh trên database thử riêng và kiểm tra trường hợp database đang có dữ liệu. Không sửa trực tiếp baseline V1.8, không nạp dữ liệu giả vào database đang dùng.

## 8. Kiểm tra chấp nhận trước khi giao sửa source

- Ba loại tài khoản đăng nhập/định tuyến đúng; không có đường vòng cho Superadmin vào API Owner.
- Hai yêu cầu tạo Owner đồng thời không tạo hai Admin Account hay hai lời mời còn hiệu lực.
- Liên kết sai/hết hạn/đã dùng không tạo Account; chủ trọ tự đặt mật khẩu thành công chỉ một lần.
- Gửi lại/đặt lại không để lộ mã hoặc mật khẩu; liên kết cũ bị thu hồi theo quy tắc đã duyệt.
- Khóa Owner cắt phiên hiện tại và chặn đăng nhập mới; mở khóa không khôi phục phiên cũ và giữ nguyên dữ liệu khu trọ.
- Khách chưa đăng nhập và người gửi ẩn danh tạo được phản ánh hợp lệ; gửi dồn dập bị giới hạn; Owner không đọc được phản ánh nền tảng.
- Mỗi chuyển trạng thái phản ánh tạo đúng một dòng lịch sử có người làm và ghi chú; lỗi giữa chừng không để trạng thái và lịch sử lệch nhau.
- Người không có quyền, nhập sai mật khẩu, hết thời gian xem tạm và bị thu hồi quyền đều không đọc được nhật ký; những lần thử này vẫn có dấu vết.
- Nhật ký không chứa mật khẩu, mã liên kết và thông tin liên hệ đầy đủ.

## 9. Quyết định đã chốt và việc còn cần thiết kế

| Vấn đề | Quyết định nghiệp vụ đã chốt | Việc kỹ thuật/vận hành cần hoàn tất |
|---|---|---|
| Tài khoản Superadmin | Cùng bảng `accounts`, vai trò riêng, không gắn Owner/Resident; người phụ trách kỹ thuật tạo tài khoản đầu theo yêu cầu chủ dự án; quyền nhật ký được chủ dự án chỉ định, không tự cấp | Quy trình định danh người được cấp và ghi nhận yêu cầu/cấp quyền |
| Tạo Owner | Tạo Owner + lời mời; tạo Admin Account khi chủ trọ tự đặt mật khẩu; gửi email sau khi xác nhận địa chỉ qua kênh khác | Chọn dịch vụ email và chứng cứ xác nhận người nhận |
| Thời hạn liên kết | Mời 24 giờ, đặt lại 30 phút; dùng một lần; gửi liên kết mới làm liên kết cũ mất hiệu lực | Chi tiết giao thất bại/không rõ và giới hạn gửi lại |
| Khóa/mở khóa | Đều bắt buộc lý do; khóa chặn yêu cầu tiếp theo, thu hồi phiên; mở khóa cần đăng nhập lại | Quy trình thử lại/đối soát kho phiên lỗi |
| Phản ánh | Gắn Property, cho phép ẩn danh và liên hệ để phản hồi thủ công; không có tệp, phản ánh chung hoặc mở lại; kiểm tra phản ánh mới trong 2 ngày làm việc, chưa hứa hạn xử lý công khai | Quy trình theo dõi hàng đợi, ngày làm việc, giới hạn spam và thời gian giữ liên hệ |
| Quyền xem nhật ký | Quyền riêng; nhập lại mật khẩu; hết sau 10 phút không hoạt động hoặc 30 phút tuyệt đối; định hướng giữ 12 tháng | Giới hạn thử, nơi lưu phiên production và rà soát thời hạn lưu theo chính sách dữ liệu |

Các quyết định nghiệp vụ đã được ghi vào canonical Requirements. Bước tài liệu tiếp theo là lập yêu cầu thay đổi database, viết API contract chi tiết và kế hoạch kiểm thử; các việc kỹ thuật/vận hành ở cột cuối phải hoàn tất trước khi vận hành thật. Bản thiết kế này tự nó không thay đổi source hoặc database.
