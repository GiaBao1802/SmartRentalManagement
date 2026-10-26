# Góc Trọ — Kế hoạch thay đổi dữ liệu cho Superadmin

**Trạng thái:** REFERENCE — bản thiết kế thay đổi, chưa phải migration được phép chạy  
**Ngày:** 2026-10-26  
**Phạm vi:** quyền Superadmin, lời mời/đặt lại tài khoản Owner, phản ánh nền tảng và nhật ký; thêm mã khu trọ công khai chỉ để chọn đối tượng phản ánh. Tọa độ và bản đồ chi tiết là yêu cầu thay đổi riêng.  
**Nguồn:** [thiết kế giao tiếp](SUPERADMIN_SCREEN_API_DESIGN.md), [quyết định nghiệp vụ](SUPERADMIN_IDENTITY_REPORT_AUDIT_DESIGN.md), [gap report](SUPERADMIN_SCHEMA_API_GAP_REPORT.md), `docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`, `docs/DATABASE_CHANGELOG.md`, `database/baselines/v1.8/schema.sql`, `database/schema.prisma`.

## 1. Điểm xuất phát và nguyên tắc

Database V1.8 đang khóa, có 40 bảng. `accounts.role` chỉ nhận `admin/resident`; `password_hash` bắt buộc; `accounts.owner_id` là duy nhất. Lời mời cư dân bắt buộc `resident_id` và người tạo cùng Owner. Complaint bắt buộc Resident. Chưa có nhật ký chung, quyền xem nhật ký hoặc tọa độ khu trọ. Chưa kiểm tra dữ liệu thực tế trong database đang dùng ở lượt thiết kế này; mọi kiểm kê số dòng/trùng email là bước bắt buộc trước migration.

Không sửa trực tiếp V1.8 hoặc dùng `db push`/reset. Tạo một phiên bản database kế tiếp theo quy trình của dự án, với script nâng cấp cho nơi đang có dữ liệu, bản cài sạch tương ứng, kiểm tra tự động và kế hoạch khôi phục. Không xóa/migrating `complaints`, `complaint_history`, lời mời cư dân hoặc dữ liệu Owner/Property hiện có.

## 2. Các thay đổi đề nghị

### 2.1 Tài khoản và quyền

| Đối tượng | Thay đổi | Bảo vệ dữ liệu cũ |
|---|---|---|
| `accounts` | Nới ràng buộc `role` cho `superadmin`; đúng trường hợp này thì `owner_id` và `resident_id` đều `NULL` | Hai nhánh Admin/Resident giữ nguyên; `password_hash NOT NULL`, `status` và khóa unique Owner giữ nguyên |
| `platform_permissions` | Mỗi dòng ghi `account_id`, tên quyền (bản đầu `PLATFORM_AUDIT_READ`), `granted_at`, `granted_by`, `revoked_at`, `revoked_by`, lý do và mã yêu cầu phê duyệt | Chỉ Superadmin nhận quyền; một quyền đang hiệu lực trên mỗi tài khoản; không dùng quyền client tự khai |
| `platform_audit_events` | Nguồn nhật ký chỉ thêm mới, mô tả ở §2.4 | Không sửa lịch sử Contract/Complaint |

Hai quyền quản lý Owner và phản ánh được suy từ vai trò Superadmin ở backend; chỉ quyền nhật ký được cấp riêng. Database ngăn hai dòng quyền đang hiệu lực cùng tên trên một Account. Kiểm tra quan hệ Account có đúng role phải thực hiện ở service và trong bộ kiểm tra dữ liệu mới; nếu cần ràng buộc vật lý, thiết kế trigger cùng migration. Việc cấp quyền đầu tiên qua công cụ nội bộ đã xác thực, dựa trên yêu cầu của chủ dự án và có sự kiện nhật ký; không seed sẵn người có quyền.

Tài khoản Superadmin đầu tiên không dùng mật khẩu mẫu. Công cụ cấp ban đầu tạo lời mời một lần đến email đã xác minh; Account chỉ được tạo với hash sau khi chính người nhận đặt mật khẩu. Đề nghị bảng `platform_operator_invitations` có email nhận, hash của mã một lần, hạn dùng, trạng thái, mã yêu cầu của chủ dự án và người thao tác kỹ thuật. Chấp nhận lời mời tạo Account `superadmin` và đánh dấu đã dùng trong cùng giao dịch. Chưa có API công khai tự cấp Superadmin; không gán Owner giả.

### 2.2 Lời mời và đặt lại mật khẩu Owner

| Bảng mới | Trường/ràng buộc chính | Lý do |
|---|---|---|
| `owner_account_invitations` | `invitation_id`, `owner_id`, email nhận chuẩn hóa, `token_hash` unique, `status` (`pending/accepted/expired/revoked`), `expires_at`, `accepted_at`, `created_by_account_id`, `created_at`, `updated_at`, `delivery_status` | Lời mời chủ trọ 24 giờ, lịch sử gửi/chấp nhận; một lời mời `pending` mỗi Owner |
| `owner_password_resets` | `reset_id`, `account_id`, email nhận, `token_hash` unique, `status` (`pending/used/expired/revoked`), `expires_at`, `used_at`, `created_by_account_id`, `created_at`, `delivery_status` | Liên kết đặt lại 30 phút lưu bền vững; luồng Reset cư dân hiện dùng bộ nhớ dev/test, không đủ cho Owner production |
| `platform_command_requests` | `request_id`, `actor_account_id`, tên lệnh, hash khóa thử lại, dấu nội dung, kết quả an toàn, trạng thái, thời điểm | Cùng yêu cầu gửi lại không tạo hai Owner, hai lời mời, hai chuyển trạng thái hoặc hai lần gửi ngoài ý muốn |

Mã liên kết rõ chỉ tồn tại đủ để gọi dịch vụ gửi email; trong database chỉ lưu hash. Nếu tiến trình dừng sau khi commit nhưng trước khi email xác nhận, bản ghi giữ trạng thái gửi `unknown`; người vận hành phát hành liên kết mới, thu hồi liên kết cũ. Không lưu mã liên kết rõ vào bảng lệnh, nhật ký hoặc log. Không tự phát lại email chỉ từ bản ghi `unknown`. Cần chứng minh cơ chế thử lại không gửi cùng email hai lần trong tình huống mất kết nối ngay sau phản hồi của nơi gửi.

Chỉ một lời mời `pending` trên mỗi Owner và một liên kết đặt lại `pending` trên mỗi Admin Account. Khi hết hạn, lệnh tiếp theo chuyển nó sang `expired` trước khi tạo mới; `pending` hết hạn vẫn chiếm khóa duy nhất cho đến khi được chuyển trạng thái. Khi gửi liên kết mới, trong một giao dịch thu hồi liên kết cũ và tạo mới, rồi gọi dịch vụ gửi; nếu gửi thất bại, báo rõ liên kết cũ đã bị thu hồi. Chấp nhận lời mời khóa Owner và lời mời, kiểm tra email nhận còn phù hợp, hash/hạn/trạng thái, rồi tạo Admin Account và đánh dấu `accepted` nguyên tử. Unique `accounts.owner_id` là chốt chặn cuối chống tạo hai Admin Account.

Địa chỉ email trong `owners.contact_email` hiện không unique, còn `accounts.email` chỉ unique theo so sánh của database hiện tại. [Kiểm kê chỉ đọc và quy tắc xử lý liên hệ trùng](SUPERADMIN_DUPLICATE_CONTACT_REVIEW.md) đã xác nhận dữ liệu demo hiện không có nhóm trùng; trước migration vẫn phải kiểm kê lại target. Email được so sánh bằng `lower(trim(...))`; xung đột với Owner/Account/lời mời khác bị chặn, không tự gộp. Số điện thoại trùng cần đối soát người nhận, không tự coi là cùng người. Luồng tạo mới phải khóa theo email đã chuẩn hóa và kiểm tra lại trong giao dịch để hai yêu cầu đồng thời không giữ hai lời mời tới cùng địa chỉ; nếu không chứng minh được chốt chặn này bằng dữ liệu/transaction, chưa mở lệnh tạo Owner.

### 2.3 Phản ánh nền tảng và chọn khu trọ

| Đối tượng | Trường/ràng buộc chính | Ranh giới |
|---|---|---|
| `properties.public_report_code` | Mã ngẫu nhiên, unique, không suy ra từ `property_id`; cấp cho Property cũ sau khi kiểm kê | Chỉ dùng chọn khu trọ để phản ánh; không cho đọc dữ liệu nội bộ |
| `platform_reports` | `report_id`, `reference_code` unique, `property_id`, `owner_id`, `content`, `anonymous`, thông tin liên hệ nullable, `status` (`NEW/IN_PROGRESS/RESOLVED`), `created_at`, `updated_at`, `resolved_at` | `owner_id` lấy từ Property tại thời điểm tạo; không có Resident ID bắt buộc; Owner/Admin không có quyền đọc |
| `platform_report_history` | `history_id`, `report_id`, `actor_account_id` nullable khi tạo từ công khai, `action`, `from_status`, `to_status`, `note`, `created_at` | Chuyển trạng thái và lịch sử trong cùng giao dịch; ghi chú không tự gửi cho người phản ánh |

Thêm ràng buộc ghép để `platform_reports(property_id, owner_id)` luôn khớp `properties(property_id, owner_id)`. Mã tham chiếu gửi cho người phản ánh chỉ để tra cứu nội bộ, không là mật khẩu đọc hồ sơ. Dữ liệu liên hệ là tùy chọn; không lưu IP đầy đủ dài hạn trong bảng phản ánh chỉ để chống spam. Bộ giới hạn gửi dùng kho tạm riêng với thời gian sống ngắn và chính sách riêng. Thông tin liên hệ được truy cập chỉ khi xử lý phản ánh; thời gian lưu/ẩn sau khi giải quyết cần được rà soát với chính sách dữ liệu trước production.

Migration cấp `public_report_code` cho Property cũ theo từng lô, kiểm tra đủ số dòng và không trùng, sau đó mới đặt `NOT NULL` nếu toàn bộ Property cần mã. API công khai chỉ tìm những Property được phép xuất hiện công khai; Property ẩn có thể được phản ánh qua mã đã biết, nhưng màn hình tìm kiếm không tự tiết lộ chúng. Cần kiểm tra cách hiển thị địa chỉ để tránh làm lộ dữ liệu của Property không công khai.

### 2.4 Nhật ký nền tảng

`platform_audit_events` dự kiến có `event_id`, `occurred_at`, `actor_account_id` nullable khi chưa xác định được người gọi, `action`, `result`, `target_type`, `target_id` nullable, `reason` đã lọc, `request_id`, metadata JSON theo danh sách trường cho phép. Chỉ mục theo thời điểm/ID, người thực hiện/thời điểm và đối tượng/thời điểm. Không có API sửa hoặc xóa. Mỗi thao tác nhạy cảm thành công ghi event cùng transaction dữ liệu; thất bại ghi event độc lập. Với lượt đọc nhật ký, phải ghi sự kiện truy cập trước khi trả dữ liệu; lỗi ghi thì không trả dữ liệu.

Không lưu mật khẩu, hash mật khẩu, raw token, email đầy đủ, số điện thoại đầy đủ hoặc nội dung phản ánh trong nhật ký. Thời gian lưu định hướng **12 tháng**; việc dọn dữ liệu cũ là thao tác vận hành riêng có thẩm quyền và có dấu vết, không phải nút xóa trong ứng dụng. Trước production phải rà soát nhu cầu điều tra và chính sách dữ liệu. Cần bảo vệ quyền ghi/sửa/xóa trực tiếp vào bảng, backup và theo dõi lỗi ghi; ràng buộc “chỉ thêm” ở ứng dụng chưa đủ nếu tài khoản database có thể sửa/xóa.

### 2.5 Quyền xem tạm

Quyền `PLATFORM_AUDIT_READ` cố định nằm trong database; quyền xem tạm sau nhập lại mật khẩu nằm trong kho phiên phía server và gắn với `account_id` cùng mã phiên. Lưu `verified_at`, `last_used_at`, `absolute_expires_at`; khi đọc, kiểm tra 10 phút không hoạt động và tối đa 30 phút kể từ `verified_at`. Không tạo cờ quyền ở trình duyệt. Thu hồi quyền cố định, đăng xuất, đổi mật khẩu hoặc khóa tài khoản làm quyền tạm vô hiệu ở lần yêu cầu tiếp theo. Kho phiên production phải dùng chung giữa các tiến trình; bản `InMemorySessionStore` hiện tại chỉ dùng dev/test.

## 3. Trình tự nâng cấp an toàn

1. **Kiểm kê chỉ đọc:** xác nhận đúng database/phiên bản, số dòng và khóa của `owners`, `accounts`, `properties`, `complaints`, `account_invitations`; phát hiện email Owner/Account trùng sau chuẩn hóa, Property thiếu địa chỉ/tỉnh, dữ liệu bất thường. Không in dữ liệu liên hệ đầy đủ vào báo cáo.
2. **Viết change request:** liệt kê ràng buộc mới, câu lệnh nâng cấp và đường khôi phục; chọn số phiên bản sau V1.8. Bản cài sạch, Prisma mapping, ghi chú thay đổi và bộ kiểm tra phải khớp nhau. Không áp lịch sử Prisma demo lên V1.8.
3. **Diễn tập trên bản sao riêng:** tạo bản sao/backup đã kiểm tra; chạy migration một lần, chạy lại lệnh kiểm tra để xác nhận không tạo trùng; kiểm tra dữ liệu cũ trước/sau bằng số dòng, khóa ngoại và dấu nhận dạng phù hợp.
4. **Kiểm tra quyền và cạnh tranh:** ba vai trò đúng ràng buộc; Owner chỉ một Admin Account; hai lời mời đồng thời chỉ một còn chờ; dùng lại token bị từ chối; hai người đổi trạng thái cùng lúc chỉ một thành công; Superadmin không vào API Owner; Owner không đọc phản ánh/nhật ký nền tảng.
5. **Kiểm tra sự cố:** email lỗi/không rõ; lỗi giữa lúc lưu dữ liệu và gửi; kho phiên lỗi sau khóa; lỗi ghi nhật ký; backend restart giữa lời mời và chấp nhận; email trùng; backfill mã Property chạy lại.
6. **Đánh giá trước áp dụng:** xác nhận dịch vụ email, kho phiên chung, quyền cấp Superadmin đầu tiên và quy trình vận hành phản ánh. Chỉ sau khi được phép mới backup target thật, áp migration theo kế hoạch rồi xác minh lại. Không seed dữ liệu giả vào target đang có dữ liệu.

## 4. Khôi phục và giới hạn

Migration dự kiến thêm bảng/trường/ràng buộc, không xóa dữ liệu cũ. Trước khi chạy trên nơi có dữ liệu phải có backup đã thử đọc được và cửa sổ bảo trì. Nếu migration lỗi trước commit, giao dịch được quay lại. Nếu đã áp và có dữ liệu Superadmin mới, **không** dùng lệnh xóa bảng hoặc reset để “quay lại” vì sẽ mất sự kiện; cần kế hoạch khôi phục từ backup cùng đối soát sự kiện phát sinh, do người phụ trách phê duyệt.

Kế hoạch này chưa bao gồm tọa độ, nguồn bản đồ, ghim hoặc trích xuất toàn bộ Property. Không có số phiên bản, SQL migration, thời gian chạy hay xác nhận production cho đến khi kiểm kê target và duyệt change request. Bước tiếp theo là đối chiếu hai thiết kế này, chốt phần hạ tầng còn mở và đưa các đường dẫn đã duyệt vào API spec cùng migration versioned.
