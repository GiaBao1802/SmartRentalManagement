# Góc Trọ — Bản giao tiếp màn hình và hệ thống cho Superadmin

**Trạng thái:** REFERENCE — thiết kế để rà soát; chưa là hợp đồng API hiện hành  
**Ngày:** 2026-10-26  
**Phạm vi:** quyền Superadmin, tài khoản chủ trọ, phản ánh nền tảng và nhật ký. Bản đồ chi tiết và xuất dữ liệu nội bộ có thiết kế riêng.  
**Nguồn:** [quyết định nghiệp vụ](SUPERADMIN_IDENTITY_REPORT_AUDIT_DESIGN.md), [đặc tả](SUPERADMIN_REQUIREMENTS_SPEC.md), [gap report](SUPERADMIN_SCHEMA_API_GAP_REPORT.md), `docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`, Database V1.8 và Auth/Accounts hiện tại.

Các đường dẫn, tên trường và mã lỗi dưới đây là **đề nghị cho hợp đồng API mới**. `docs/04_API_SPEC.md` vẫn là hợp đồng đang có hiệu lực. Chưa mở các đường dẫn này trong ứng dụng.

## 1. Quy ước chung

- Mọi ID là chuỗi số nguyên thập phân, thời điểm là chuỗi RFC 3339, trường JSON dùng `snake_case`. Thành công trả `{ "data": ... }`; danh sách có thêm `meta` với `page`, `page_size`, `total_items`, `total_pages`. Lỗi dùng hình dạng hiện hành `{ "error": { "code", "message", "details", "request_id" } }`.
- Tất cả phản hồi chứa tài khoản, liên kết, phản ánh hoặc nhật ký dùng `Cache-Control: no-store`. Trang chứa liên kết đặt mật khẩu cũng dùng `Referrer-Policy: no-referrer`. Mã liên kết chỉ được gửi trong body của yêu cầu kiểm tra/chấp nhận, không nằm trong log hoặc phản hồi cho Superadmin.
- Yêu cầu đổi dữ liệu từ trình duyệt cần mã chống giả mạo yêu cầu hiện có. Quyền lấy từ phiên đăng nhập và database, không lấy từ `role`, `owner_id` hay `permission` do trình duyệt gửi. Sai vai trò trả `403`; chưa đăng nhập trả `401`; đối tượng không tồn tại trả `404` chung. Các ngoại lệ cho form công khai được nêu riêng.
- Các lệnh tạo, gửi lại, khóa, mở khóa và đổi trạng thái cần một khóa thử lại do client sinh (`Idempotency-Key`, 1–128 ký tự ASCII hiển thị). Cùng khóa và nội dung trả kết quả ban đầu; cùng khóa nhưng nội dung khác trả `409 IDEMPOTENCY_KEY_REUSED`. Phải lưu kết quả thử lại bền vững trước khi đưa vào vận hành; chỉ kiểm tra header là chưa đủ.
- `POST` gửi email trả trạng thái giao `sent`, `failed` hoặc `unknown`. Chỉ `sent` sau khi nơi gửi xác nhận. `unknown` không tự gửi lại. Tạo Owner/lời mời đã lưu vẫn tồn tại nếu email gửi lỗi; màn hình nêu rõ liên kết cũ có còn dùng được hay đã bị thay thế.
- Danh sách mặc định `page=1`, `page_size=20`, tối đa 100; thứ tự có ID làm khóa phụ để phân trang ổn định. Trường lọc lạ bị từ chối. Hệ thống giới hạn số lần gọi đăng nhập, gửi email, gửi phản ánh và nhập lại mật khẩu.

## 2. Quyền và vào màn hình Superadmin

Sau đăng nhập, `GET /api/v1/auth/me` cần trả `account.role=superadmin`, hồ sơ Superadmin tối thiểu và `permissions` đã cấp, chẳng hạn `PLATFORM_AUDIT_READ`. Trình duyệt mở khu vực `/platform` chỉ khi đúng vai trò. API cũ của Admin/Resident tiếp tục kiểm tra đúng vai trò của mình; Superadmin không được dùng vai trò Admin để quản lý Property/Contract/Invoice của chủ trọ.

Các lệnh nền tảng cần một bộ kiểm tra riêng: `PLATFORM_OWNER_MANAGE` cho tài khoản chủ trọ, `PLATFORM_REPORT_MANAGE` cho xử lý phản ánh, `PLATFORM_AUDIT_READ` cho nhập lại mật khẩu và đọc nhật ký. Vai trò Superadmin mặc định có hai quyền đầu; quyền nhật ký được cấp riêng theo quyết định đã chốt. Khi quyền nhật ký bị thu hồi, lần đọc kế tiếp phải bị từ chối dù người đó đang mở trang.

Tài khoản Superadmin đầu tiên được lập bằng công cụ nội bộ theo yêu cầu được ghi nhận của chủ dự án, với liên kết đặt mật khẩu một lần gửi đến người nhận đã xác minh. Liên kết này dùng nguồn lời mời người vận hành riêng trong [kế hoạch dữ liệu](SUPERADMIN_DATABASE_CHANGE_DESIGN.md), không dùng lời mời cư dân. Không có màn tự đăng ký, mật khẩu chung hoặc tài khoản Superadmin tạo sẵn bằng dữ liệu mẫu.

## 3. Màn hình tài khoản chủ trọ

### 3.1 Danh sách và chi tiết

| Yêu cầu dự kiến | Dữ liệu vào | Kết quả tối thiểu |
|---|---|---|
| `GET /api/v1/platform/owners` | `search`, `account_state`, `page`, `page_size` | `owner_id`, `display_name`, email, số khu trọ, trạng thái `pending_setup/active/locked`, ngày tạo; không có mật khẩu hoặc mã liên kết |
| `GET /api/v1/platform/owners/{owner_id}` | Owner ID | Thông tin Owner, Admin Account nếu có, lời mời gần nhất với trạng thái/hạn/kết quả giao, lịch sử thao tác an toàn |

Lọc và đếm đều thực hiện trên server. `pending_setup` là trạng thái trình bày suy ra từ Owner chưa có Admin Account và lời mời; không thêm vào `accounts.status`. Không trả dữ liệu Resident/Contract/Invoice trong màn hình này.

### 3.2 Tạo Owner và gửi lời mời

`POST /api/v1/platform/owners`, body dự kiến:

```json
{
  "display_name": "Chủ trọ mẫu",
  "contact_email": "owner@example.test",
  "contact_phone": "+84901234567",
  "recipient_verification": { "method": "phone_call", "confirmed_at": "2026-10-26T08:00:00+07:00", "note": "Đã xác nhận người nhận" }
}
```

`display_name`, `contact_email` và bằng chứng xác nhận người nhận là bắt buộc; điện thoại là tùy chọn nhưng nếu khai phải hợp lệ. Không chấp nhận password, role, account status hoặc Owner ID từ client. Bằng chứng xác nhận phải có người làm và thời điểm do server ghi; `confirmed_at` từ client chỉ là thông tin tham khảo, không là quyền. Server chuẩn hóa và kiểm tra liên hệ theo [quy tắc xử lý trùng](SUPERADMIN_DUPLICATE_CONTACT_REVIEW.md): email trùng Owner/Account/lời mời khác thì chặn; số điện thoại trùng thì tạm dừng đối soát, không tự gộp. Sau đó mới tạo Owner, lời mời 24 giờ, sự kiện nhật ký và dấu thử lại trong một giao dịch. Gửi email sau khi lưu. Kết quả `201` có `owner_id`, `invitation_id`, `account_state:"pending_setup"`, `expires_at`, `delivery_status`. Không có raw token hoặc URL.

Nếu email `failed/unknown`, không hiển thị “Đã gửi”. `503 DELIVERY_UNAVAILABLE` áp dụng khi chưa có dịch vụ gửi và không được âm thầm tạo lời mời không thể gửi; kết quả không rõ sau khi gọi nơi gửi phải trả tình trạng đã lưu để người vận hành đối soát. `409 OWNER_IDENTITY_CONFLICT` cho email thuộc Owner/Account/lời mời khác; `409 INVITATION_PENDING` khi tạo lại cùng Owner thay vì dùng gửi lại; số điện thoại trùng cần kết quả đối soát riêng trước khi cấp mới.

### 3.3 Gửi lại lời mời và đặt lại mật khẩu

- `POST /api/v1/platform/owners/{owner_id}/invitation-resend` nhận `{}` và khóa thử lại. Chỉ khi chưa có Admin Account. Lời mời mới 24 giờ; lời mời cũ bị thu hồi cùng lúc tạo lời mời mới. Trả `202` với lời mời mới và `delivery_status`. Nếu gửi lỗi, giao diện báo liên kết cũ đã hết hiệu lực và cho phép yêu cầu gửi lại sau giới hạn tần suất.
- `POST /api/v1/platform/accounts/{account_id}/password-reset` nhận `{}` và khóa thử lại. Chỉ áp dụng `role=admin` có Owner, email đã xác minh; phát hành liên kết 30 phút, thu hồi liên kết đặt lại cũ. Trả `202` với `requested:true`, `delivery_status`, `expires_at`. Không đổi mật khẩu hoặc trạng thái khóa khi mới gửi.
- Trường hợp email gửi `unknown` không tự gửi lại; người vận hành xem tình trạng và chủ động yêu cầu mới sau khi đối soát. Mỗi thao tác ghi nhật ký với kết quả gửi, không chứa email đầy đủ hoặc liên kết.

Trang đặt mật khẩu có thể dùng lại giao diện hiện hữu, nhưng backend phải phân biệt liên kết Owner với lời mời Resident và đặt lại mật khẩu. `POST /api/v1/auth/owner-invitation/inspect` nhận `{token}`, chỉ trả `{valid:true,expires_at}`. `POST /api/v1/auth/accept-owner-invitation` nhận `{token,password}`; khóa lời mời/Owner, kiểm tra còn hiệu lực, tạo đúng một Admin Account với password hash và đánh dấu đã chấp nhận trong cùng giao dịch; trả `{accepted:true}` và không tự đăng nhập. Đặt lại mật khẩu dùng liên kết riêng, một lần, kiểm tra lại trạng thái và email nhận; khi chủ trọ tự đặt thành công mới cập nhật hash, thu hồi tất cả liên kết đặt lại và phiên. Token sai/hết hạn/đã dùng trả một lỗi chung `400 TOKEN_INVALID`. Trường hợp cạnh tranh chỉ một lần chấp nhận thành công.

### 3.4 Khóa và mở khóa

| Yêu cầu | Body | Thành công |
|---|---|---|
| `POST /api/v1/platform/accounts/{account_id}/lock` | `{ "reason": "..." }` | `200` với trạng thái `locked`, thời điểm, `sessions_revoked` |
| `POST /api/v1/platform/accounts/{account_id}/unlock` | `{ "reason": "..." }` | `200` với trạng thái `active`; không phục hồi phiên |

Lý do sau khi bỏ khoảng trắng phải có nội dung, tối đa 1000 ký tự. Server kiểm tra đích là Admin Account của Owner, khóa dòng Account, ghi trạng thái và nhật ký. Sau commit, yêu cầu kế tiếp luôn kiểm tra `accounts.status`; trạng thái `locked` chặn cả khi kho phiên tạm lỗi. Lệnh thu hồi tất cả phiên cần thử lại an toàn. Nếu thu hồi lỗi, trả kết quả với `status:"locked"`, `sessions_revoked:false`, `requires_reconciliation:true`; giao diện không tuyên bố đăng xuất hoàn tất và đội kỹ thuật nhận cảnh báo. Mở khóa không cấp lại phiên. Yêu cầu khi đã ở đúng trạng thái không tạo sự kiện đổi trạng thái giả, nhưng lượt thao tác vẫn được ghi.

## 4. Màn hình gửi và xử lý phản ánh

### 4.1 Chọn khu trọ để gửi

Public Room API hiện không trả Property ID và không nên công khai mã nội bộ chỉ để nhận phản ánh. Đề nghị thêm mã ngẫu nhiên `public_report_code` cho Property. `GET /api/v1/public/platform-report-targets?search=...&page=...` trả tối thiểu mã này, tên khu trọ, tỉnh và địa chỉ cần thiết để phân biệt khu trọ; không trả Owner ID, tài khoản hoặc dữ liệu cư dân. Danh sách chỉ gồm Property được phép tìm công khai. Mã biết trước có thể dùng để gửi phản ánh về khu trọ đã bị ẩn; cần kiểm tra Property còn tồn tại. Mã này chỉ chọn đối tượng, không cấp quyền xem phản ánh.

### 4.2 Gửi phản ánh

`POST /api/v1/public/platform-reports` không cần đăng nhập, body dự kiến:

```json
{
  "public_report_code": "mã-khu-trọ-để-gửi-phản-ánh",
  "content": "Mô tả sự việc",
  "anonymous": true,
  "contact_name": null,
  "contact_email": null,
  "contact_phone": null
}
```

Nội dung bắt buộc, giới hạn độ dài do hợp đồng chính thức chốt; không nhận tệp hoặc Owner ID. Khi `anonymous=true`, không hiển thị danh tính tài khoản đã đăng nhập cho Superadmin. Thông tin liên hệ tùy chọn nếu người gửi muốn phản hồi thủ công; ghi rõ trên form rằng không có liên hệ thì không có phản hồi riêng. Server suy ra `property_id/owner_id` từ mã mục tiêu, áp giới hạn tần suất và lưu phản ánh ở trạng thái `NEW` cùng lịch sử tạo. Trả `201 {data:{reference_code,status:"NEW"}}`, không cho phép dùng mã này để đọc hồ sơ. Khu trọ không tồn tại hoặc mã không hợp lệ trả `404` chung; gửi quá thường xuyên trả `429` với thời gian thử lại.

### 4.3 Danh sách, chi tiết và xử lý

| Yêu cầu | Dữ liệu vào | Kết quả |
|---|---|---|
| `GET /api/v1/platform/reports` | `status`, `owner_id`, `property_id`, `from`, `to`, `page`, `page_size` | Danh sách theo `created_at DESC, report_id DESC` và tổng số sau lọc |
| `GET /api/v1/platform/reports/{report_id}` | Report ID | Nội dung, Property/Owner an toàn, thông tin liên hệ nếu có, trạng thái và lịch sử |
| `POST /api/v1/platform/reports/{report_id}/transition` | `{ "to_status": "IN_PROGRESS", "note": "..." }` | Trạng thái mới và dòng lịch sử vừa tạo |
| `POST /api/v1/platform/reports/{report_id}/notes` | `{ "note": "..." }` | Ghi chú nội bộ hoặc kết quả phản hồi thủ công |

Chỉ cho `NEW → IN_PROGRESS → RESOLVED`. Mọi chuyển trạng thái bắt buộc ghi chú; không cho nhảy bước, mở lại hoặc đổi sang cùng trạng thái. Server khóa dòng phản ánh, cập nhật trạng thái, thêm lịch sử với Superadmin thực hiện và sự kiện nhật ký trong cùng giao dịch. Hai người xử lý đồng thời: một thành công, người sau nhận `409 REPORT_STATUS_CHANGED` và tải lại. Thao tác ghi chú riêng không được tự đổi trạng thái. Mục tiêu kiểm tra phản ánh mới trong 2 ngày làm việc là mục tiêu nội bộ, không hiển thị như cam kết công khai.

## 5. Màn hình nhật ký

`POST /api/v1/platform/audit/recheck` nhận `{ "password": "mật khẩu của chính mình" }`. Server kiểm tra quyền `PLATFORM_AUDIT_READ` còn hiệu lực, giới hạn số lần sai, xác minh mật khẩu của Account trong phiên rồi gắn quyền đọc tạm với chính phiên đó. Thành công trả `{verified:true,idle_expires_at,absolute_expires_at}`; không trả mã quyền bí mật. Sai mật khẩu trả lỗi chung; ghi lượt thử thành công/thất bại. Quyền tạm hết sau 10 phút không hoạt động hoặc 30 phút kể từ lúc nhập lại, tùy mốc trước; đăng xuất, đổi mật khẩu, khóa Account hoặc thu hồi quyền cũng làm mất hiệu lực.

`GET /api/v1/platform/audit-events` nhận `from`, `to`, `actor_account_id`, `action`, `result`, `target_type`, `target_id`, `page`, `page_size`. Server kiểm tra cả quyền đã cấp lẫn quyền tạm **ở mỗi lần đọc**; một lượt đọc hợp lệ cập nhật thời điểm hoạt động nhưng không kéo dài hạn 30 phút tuyệt đối. Trả thông tin an toàn: thời gian, người làm, loại việc, đối tượng, kết quả, lý do đã lọc và mã nối yêu cầu. Không trả mật khẩu, token, email đầy đủ hoặc toàn bộ nội dung phản ánh. Mỗi lượt đọc thành công hoặc bị từ chối có một sự kiện truy cập nhật ký; nếu không ghi được sự kiện này, không trả dữ liệu nhật ký.

Quyền xem nhật ký chỉ được cấp/thu hồi qua quy trình nội bộ có yêu cầu của chủ dự án, ghi người thực hiện, người được cấp, thời gian và lý do. Không có endpoint tự cấp quyền trong ứng dụng bản đầu. Nhật ký có định hướng lưu 12 tháng, cần kiểm tra chính sách dữ liệu trước production.

## 6. Các lỗi cần thể hiện rõ trên màn hình

| Tình huống | Màn hình hiển thị | Hệ thống giữ gì |
|---|---|---|
| Email chưa được xác nhận | Yêu cầu xác nhận người nhận | Không phát hành liên kết |
| Email gửi thất bại/không rõ | “Chưa xác nhận gửi thành công”; hiển thị tình trạng và cách thử lại | Owner/lời mời/lịch sử đã lưu, không báo đã gửi |
| Liên kết hết hạn/đã dùng | Hướng dẫn yêu cầu liên kết mới | Không tạo/đổi Account |
| Owner đã có Admin Account | Hướng dẫn dùng đặt lại mật khẩu | Không tạo Account thứ hai |
| Khóa thành công nhưng thu hồi phiên lỗi | “Đã khóa; cần hoàn tất đăng xuất các phiên” | Account locked, có việc đối soát và nhật ký |
| Phản ánh đang được người khác xử lý | Yêu cầu tải lại trạng thái | Không ghi chuyển trạng thái sai |
| Quyền nhật ký hết hạn/thu hồi | Yêu cầu nhập lại mật khẩu hoặc báo không có quyền | Không trả dữ liệu nhật ký |

## 7. Điều kiện chuyển thành hợp đồng chính thức

Rà soát các tên đường dẫn, trường và giới hạn đầu vào với frontend/backend; chốt dịch vụ email, nguồn lưu liên kết đặt lại bền vững, giới hạn gửi/nhập sai và quy trình cấp quyền; đối chiếu [kế hoạch dữ liệu](SUPERADMIN_DATABASE_CHANGE_DESIGN.md). Sau đó cập nhật `docs/04_API_SPEC.md` bằng bản đã duyệt. Không dùng bản thiết kế này để tuyên bố endpoint đã triển khai.
