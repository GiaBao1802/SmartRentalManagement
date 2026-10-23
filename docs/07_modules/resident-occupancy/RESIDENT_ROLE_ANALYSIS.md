# Phân tích role Cư dân (Resident)

**Ngày:** 2026-10-21  
**Trạng thái:** CURRENT — phân tích và kế hoạch triển khai theo module; chưa phải khóa nghiệm thu toàn role.  
**Phạm vi:** Đối chiếu toàn bộ `docs/01_REQUIREMENTS.md` với API, trạng thái dự án và source hiện tại để chia nhỏ công việc role Cư dân.  
**Nguồn chuẩn đã đọc:** `docs/01_REQUIREMENTS.md` (toàn bộ §§1–21 và mục điểm chưa xác định), `docs/04_API_SPEC.md` (§§2, 5.1–5.14, 10–14 và endpoint/permission matrix), `docs/DATABASE_CHANGELOG.md`, `docs/00_CURRENT_STATE.md`, `docs/DOCUMENT_CATALOG.md`, `frontend/AGENTS.md`; schema V1.8 và báo cáo Resident/Occupancy hiện hành được dùng để đối chiếu implementation. Khi tài liệu bất đồng, Requirement/API là authority nghiệp vụ/API; trạng thái vật lý được lấy từ Current State/Database Changelog.

## 1. Tổng quan role

Cư dân là người dùng đã đăng nhập, có Account liên kết với một Resident cụ thể. Cư dân chỉ được đọc hoặc thao tác dữ liệu của chính hồ sơ thuê đó: nơi ở và lịch sử cư trú, hợp đồng/tài liệu, hóa đơn/thanh toán, tiện ích liên quan, phương tiện/bãi xe, khiếu nại và thông báo. Backend lấy `resident_id` và Owner từ session/quan hệ đã xác thực; frontend không được chọn Resident khác hoặc tự khai Owner/role.

Resident không có quyền quản trị Owner, Property, Room, tài khoản người khác, CT01, báo cáo Admin, giá dịch vụ, cấu hình bãi xe, hoặc quy trình xử lý khiếu nại của Admin. Các yêu cầu thuộc hệ thống hỗ trợ/nhân sự và tính năng ngoài V1 vẫn ngoài phạm vi.

## 2. Permissions

| Tài nguyên | Quyền Cư dân theo API/Requirement | Ranh giới chính |
|---|---|---|
| Account/session | Đọc summary của mình; đăng nhập/đăng xuất; đổi mật khẩu | Không đọc hash/session/token; không đổi role/trạng thái |
| Hồ sơ cá nhân | Đọc/sửa trường hồ sơ được cho phép | Chỉ self; không tự sửa ID, Owner, role, trạng thái tài khoản hoặc residence status |
| Property/Room/Occupancy | Đọc ngữ cảnh nơi ở an toàn và lịch sử của mình | Không đọc hồ sơ cư dân khác hay quản lý Property/Room |
| Contract/tài liệu | Đọc hợp đồng được liên kết, metadata và tài liệu được phép | Không tạo/sửa/activate/renew/terminate hợp đồng |
| Invoice/Zalo log/payment | Đọc hóa đơn, lịch sử gửi và giao dịch của mình; bắt đầu payment theo điều kiện | Không sửa/finalize/gửi hóa đơn; chỉ hóa đơn unpaid đã finalized mới thanh toán; không refund |
| Tiện ích/dịch vụ | Đọc thông tin liên quan; quyền tự phục vụ chưa được định nghĩa đầy đủ | Fixed/Flexible contract Admin-only; chưa có request/use API Resident rõ ràng |
| Vehicle/Parking | Đọc và tạo/sửa phương tiện của mình; đọc/đăng ký/kết thúc assignment của mình theo contract | Không cấu hình khu/slot hay gán xe cho người khác |
| Complaint | Tạo và đọc complaint của mình; thêm note/reopen theo điều kiện contract | Không đổi trạng thái xử lý hoặc xem complaint người khác |
| Notifications/preferences | Đọc/cập nhật thông báo và tùy chọn của mình | Không có email/push trong V1 |
| Public rooms/contact | Không cần quyền Resident đặc biệt; phần public vẫn theo allowlist khách | Không có booking/giữ chỗ |
| Admin dashboard, CT01, Owner configuration | Không có quyền | Backend trả từ chối, không chỉ ẩn UI |

## 3. Danh sách màn hình

| Màn hình/route dự kiến | Nội dung | Hiện trạng quan sát được |
|---|---|---|
| Đăng nhập Cư dân (`/login`) | Phone/email theo contract, mật khẩu, định tuyến theo role | Auth V1 và định tuyến Resident đã có |
| Quên/đặt lại mật khẩu, nhận lời mời | Luồng enrollment/reset bảo mật | Có luồng local/dev; production delivery/session infrastructure còn điều kiện mở theo Current State |
| Trang Cư dân (`/tenant`) | Hồ sơ summary, nơi ở/Occupancy, hợp đồng và tài liệu | Có UI gọi `/me/rental`, `/me/contracts` và document APIs; authenticated Resident browser E2E chưa được xác nhận trong báo cáo hiện hành |
| Hồ sơ/liên hệ cá nhân | Xem/cập nhật thông tin được phép; đổi avatar khi có transport | Chưa có `/me/profile` route; avatar upload chưa có transport contract |
| Hóa đơn/thanh toán | Danh sách/chi tiết hóa đơn, lịch sử thanh toán, checkout | API có các endpoint Resident trong contract; cần đối chiếu/hoàn thiện UI riêng |
| Tiện ích/dịch vụ | Xem và yêu cầu sử dụng dịch vụ có sẵn | Resident service request flow/API chưa được mô tả đủ; không tự dựng booking/subscription |
| Xe và bãi xe | Xe, khu/slot khả dụng, assignment và lịch sử của mình | API Resident được liệt kê; cần xác minh UI/endpoints thực thi và rule khi cạnh tranh slot |
| Khiếu nại | Tạo, theo dõi trạng thái/lịch sử, note/reopen | API Resident được liệt kê; UI cần xác minh |
| Thông báo/cài đặt | Inbox, đánh dấu đã đọc, notification preferences | API được liệt kê; UI cần xác minh |
| Đổi mật khẩu | Xác minh mật khẩu hiện tại, đổi và đăng nhập lại | Auth API được mô tả; màn hình riêng chưa xác minh |

Đây là danh sách sản phẩm cần có, không khẳng định tất cả route/UI đã tồn tại. Các đường dẫn màn hình chưa có trong Requirement được xem là cách nhóm UI đề xuất, không phải API contract mới.

## 4. APIs liên quan

Tất cả path dưới đây tương đối với `/api/v1`; authorization luôn phải được kiểm tra backend và lấy phạm vi từ session.

| Nhóm | APIs Resident trong API Spec | Trạng thái theo source/reports đã đối chiếu |
|---|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `POST /auth/change-password`; public enrollment/reset: `POST /auth/accept-invitation`, `POST /auth/forgot-password`, `POST /auth/reset-password`, `POST /auth/credential-link/inspect` | Auth/enrollment/reset đã được triển khai local/dev theo Current State; không khẳng định production delivery đã sẵn sàng |
| Profile | `GET /me/profile`, `PATCH /me/profile` | API Spec có contract role-shaped; hiện chưa thấy route mounted. Mutable phone/email/avatar được nêu; upload avatar và một số DTO/validation chưa chốt |
| Rental | `GET /me/rental` | Backend route/repository và UI `/tenant` hiện có; Resident session/browser closure còn thiếu trong báo cáo Resident/Occupancy |
| Contracts | `GET /me/contracts`, `GET /contracts/{id}`, `GET /contracts/{id}/documents`, `GET /contract-documents/{id}` | Backend/API và một phần UI hợp đồng/tài liệu hiện có; Resident authenticated E2E chưa đóng |
| Invoices/payments | `GET /invoices`, `GET /invoices/{id}`, `GET /invoices/{id}/zalo-send-logs`, `POST /invoices/{id}/payment-sessions`, `POST /payment-sessions/{id}/attempts`, `GET /payment-sessions/{id}`, `GET /invoices/{id}/payments` | Contract đã định nghĩa; Resident UI/runtime phụ thuộc payment provider và cần xác minh theo source hiện hành |
| Service | API Fixed/Flexible hiện chủ yếu là Admin; Resident tự yêu cầu/sử dụng dịch vụ chưa có endpoint/DTO cụ thể trong API Spec | Requirement muốn xem và sử dụng tiện ích; rule Flexible cancellation/refund và flow resident còn mở |
| Parking | `GET /properties/{id}/parking-areas`, `GET /parking-areas/{id}/slots`, `GET /me/vehicles`, `POST /me/vehicles`, `PATCH /vehicles/{id}`, `GET /parking-assignments`, `POST /me/parking-assignments`, `POST /parking-assignments/{id}/end` | API Spec liệt kê quyền Resident; cần đối chiếu route implementation/UI từng bước trước khi chọn module |
| Complaints | `POST /complaints`, `GET /me/complaints`, `GET /complaints/{id}`, `POST /complaints/{id}/notes`, `POST /complaints/{id}/reopen` | API Spec liệt kê; SLA target còn mở; phải dùng Complaint category cho “Báo cáo nhà trọ” |
| Notifications | `GET /notifications`, `PATCH /notifications/{id}/read`, `POST /notifications/read-all`, `GET /notification-preferences`, `PATCH /notification-preferences` | API Spec liệt kê; delivery chỉ in-app, không email/push |

Không được thêm endpoint tiện ích, booking, payment hoặc profile/avatar transport mới bằng suy luận. API Spec §13 còn nêu các blocker cross-domain; cần kiểm tra lại chính xác implementation khi giao từng module.

## 5. User flow

1. Admin mời Resident trong Owner scope. Hệ thống xác minh recipient binding, token một lần và hạn 24 giờ; Resident tự đặt mật khẩu, sau đó đăng nhập bằng phone (email login tương thích theo contract). Không trả token/password cho Admin; reset là luồng riêng, token 30 phút, thành công thu hồi session và không auto-login.
2. Sau đăng nhập, frontend lấy role/profile từ `/auth/me` và điều hướng Resident sang `/tenant`. Mọi `me` endpoint tự suy ra Resident từ session; truy cập tài nguyên người khác phải bị từ chối/che bằng 404 theo API.
3. Resident xem phòng, lượt cư trú hiện tại/lịch sử và hợp đồng/tài liệu của mình.
4. Resident xem hóa đơn; chỉ hóa đơn unpaid đã finalize mới có thể mở payment session. Theo dõi attempt/callback và trạng thái thanh toán từ backend; hai lần thất bại trong một phiên kết thúc phiên nhưng có thể mở phiên mới.
5. Resident có thể quản lý xe/đăng ký slot theo quyền và điều kiện hợp đồng/sức chứa; lịch sử assignment phải được giữ.
6. Resident gửi Complaint gắn nơi ở hợp lệ, theo dõi lịch sử, và chỉ thực hiện note/reopen theo quy tắc trạng thái.
7. Resident xem/cập nhật tùy chọn thông báo in-app; thay đổi preference không đồng nghĩa thông báo đã gửi.
8. Resident cập nhật trường hồ sơ được phép/đổi mật khẩu bằng API đã xác thực; mọi thay đổi danh tính và xác thực phải đồng bộ và không cho client tự chọn ID/role.

## 6. Thứ tự module cư dân đang triển khai

Ngày 2026-10-23, chủ dự án chọn triển khai theo từng module và dừng chờ review sau mỗi module. Thứ tự hiện hành dưới đây thay thế thứ tự khảo sát ban đầu ở thời điểm lập phân tích; không có nghĩa là toàn bộ Resident role đã hoàn tất.

| Thứ tự | Module độc lập | Phạm vi | Tình trạng/điều kiện |
|---:|---|---|---|
| 1 | Tổng quan/hồ sơ cư dân | Thông tin liên hệ, trạng thái cư trú và hợp đồng từ dữ liệu hiện có | UI nền đã có; không thêm chức năng sửa hồ sơ chưa có API |
| 2 | Trung tâm hóa đơn | Đếm theo trạng thái, lọc, phân trang và xem chi tiết an toàn | Đã triển khai và được người dùng xem; không thêm nút thanh toán khi checkout chưa sẵn sàng |
| 3 | Thông báo/cài đặt in-app | Inbox self-scope, lọc chưa đọc, read/read-all và lưu preference | Đã triển khai; chờ review. Chỉ hiển thị notification đã tồn tại; producer/trigger mapping chưa đầy đủ |
| 4 | Tiện ích/dịch vụ và đăng ký sử dụng | Danh mục chủ trọ đã tạo, thông tin và đăng ký của cư dân | Chưa code. Resident request API/DTO và flow nghiệp vụ chưa đủ; phải chốt contract trước khi nối UI |
| 5 | Thanh toán | Checkout hóa đơn hoặc khoản phí, attempt và provider return | Chưa code. Chỉ tiếp tục khi provider/runtime readiness được xác nhận; không mô phỏng kết quả thanh toán |
| — | Khiếu nại/phản hồi | Tạo và theo dõi yêu cầu của cư dân | Tạm hoãn theo quyết định của người dùng cho tới khi Admin có nơi tiếp nhận/xử lý |
| — | Auth/enrollment/reset | Đăng nhập, lời mời, quên/reset và đổi password | Nền local/dev đã có; production delivery/runtime còn gate riêng |

## 7. Assumptions và requirement còn thiếu

- Profile API Spec nói Admin và Resident cùng dùng `/me/profile`, trả role-shaped profile. Module được chọn tập trung vào Resident UI nhưng endpoint dùng chung phải giữ đúng behavior Admin theo API; không mở rộng Admin screen ngoài phần cần để giữ contract.
- API cho phép Resident tự sửa phone/email/avatar nhưng không chốt request schema, chuẩn email, cách xác thực thay đổi phone/email, hay cách cập nhật đồng bộ `residents.phone/email` với `accounts.phone/email` (hai bảng có unique constraint riêng). Không được để login identity khác hồ sơ hiển thị; module đầu tiên phải kiểm tra uniqueness và cập nhật nguyên tử hoặc báo rõ blocker nếu canonical behavior chưa đủ.
- Phone normalization đã có helper `normalizeVietnamPhone`; dùng cùng helper cho login/enrollment/profile. Số phone profile `null` và khả năng bỏ phone sau khi đã provisioned cần đối chiếu enrollment/login invariants.
- Avatar được duyệt ở mức nghiệp vụ và storage key trong V1.8, nhưng API Spec nói rõ upload transport chưa chỉ định. Module đầu tiên không thêm upload giả, file URL công khai, DB binary hoặc path tuyệt đối.
- API Spec chưa định nghĩa cách Resident đăng ký/sử dụng Fixed/Flexible service; Requirement §13 cũng để cancellation/refund chi tiết mở. Chưa được suy diễn thành subscription/booking.
- Một số quyền endpoint liệt kê trong API Spec có thể chưa được mount hoặc chưa có UI. Cần đánh dấu “chưa xác minh” cho đến khi source/API runtime được đối chiếu ở module tương ứng.
- Resident/Occupancy report hiện trạng thái PARTIAL/NO LOCK vì chưa xác nhận Resident authenticated E2E và ghi nhận các profile/self-service gaps; trạng thái hiện tại mới hơn xác nhận enrollment/reset đã có local/dev, nên không dùng câu blocker lịch sử như mô tả toàn bộ hiện tại.
- `docs/01_REQUIREMENTS.md` có header/schema alignment cũ V1.6; `docs/00_CURRENT_STATE.md` và `docs/DATABASE_CHANGELOG.md` xác định physical baseline hiện là Database V1.8. Task này không thay đổi schema.
- Chưa có yêu cầu về accessibility, thiết kế mobile cụ thể, hay notification trigger mapping riêng cho Resident; áp dụng UI system hiện có và không invent business behavior.

## 8. Scope của module đầu tiên — lịch sử 2026-10-21

**Module 1 được chọn:** UI hồ sơ Cư dân trong `/tenant`, trình bày phone/email và các trạng thái cư trú đã có trong dữ liệu `/me/rental`. Đây chỉ là cách trình bày; không thêm API, form sửa/lưu, persistence giả hoặc avatar upload. Không triển khai dashboard, billing, parking, complaint, notification hay service flow trong lượt này.

Trước khi sửa code, phải nêu file tạo/sửa và ảnh hưởng đến auth/profile hiện có. Module 1 đã được triển khai riêng. Quy tắc dừng chờ review vẫn áp dụng; thứ tự module hiện hành nằm ở §6.

## 9. Kết quả module 1 — 2026-10-21

Module được giới hạn lại theo yêu cầu thành UI-only. `/tenant` trình bày phone/email và trạng thái bằng response hiện có từ `GET /me/rental`; không có API profile mới, form lưu, thay đổi backend, hoặc persistence giả. API Spec vẫn mô tả `/me/profile`, nhưng endpoint đó chưa được triển khai trong source và nằm ngoài phạm vi lượt này. Không thêm/chạy tests và chưa browser-verify ở checkpoint ban đầu. **Trạng thái tại 2026-10-21: UI implemented, validation pending review; các checkpoint sau được ghi riêng bên dưới.**

## 10. Kết quả module 2 — Trung tâm hóa đơn — 2026-10-23

Đã thêm `/tenant/invoices` với tổng số theo trạng thái, lọc, phân trang và phần chi tiết dùng đúng dữ liệu Resident scope. Không tạo dữ liệu dòng hóa đơn Admin-only và không thêm thao tác thanh toán. Người dùng đã xem giao diện, xác nhận phù hợp và góp ý chưa cần nút thanh toán. API payment/runtime readiness vẫn là gate riêng. Chi tiết source, kiểm tra typecheck và browser đã được ghi trong `docs/00_CURRENT_STATE.md` tại checkpoint triển khai.

## 11. Kết quả module 3 — Thông báo — 2026-10-23

Đã thêm trang `/tenant/notifications`, menu cư dân, lọc thông báo chưa đọc, phân trang, đánh dấu từng thông báo/đánh dấu tất cả đã đọc và form lưu bốn preference in-app. API routes được bổ sung theo §5.14 và dùng account hiện tại; không thêm schema/migration. API contract áp dụng Admin và Resident theo account-self; không có thay đổi Admin UI.

Browser authenticated ban đầu tải được một notification chưa đọc. Agent không bấm hành động đọc, không sửa preference và không ghi thêm dữ liệu; một snapshot read-only sau đó cho thấy unread count bằng 0, nguyên nhân thay đổi chưa được xác minh. Frontend/backend `typecheck` PASS; automated tests và mobile/production-build verification chưa chạy.

Theo góp ý review, badge chấm vàng và số notification chưa đọc được dùng chung trên menu Tổng quan, Hóa đơn và Thông báo. Hai trang đầu đọc số đếm từ API self-account; trang Thông báo dùng số đếm đang cập nhật trong inbox. Khi count bằng 0 hoặc chưa tải được, menu không hiện badge.

Source hiện chỉ có scheduler tạo notification chốt kỳ cho tài khoản Admin và chưa có đầy đủ Resident notification producers hoặc consumer áp dụng bốn preference. Vì vậy trang chỉ hiện record đã lưu; preference được lưu theo account nhưng không tuyên bố mọi loại trigger đã được nối. Không có email/push trong V1. **Trạng thái: module UI/API implemented; chờ review người dùng; trigger integrations còn ngoài phạm vi/requirement mapping chưa đủ.**
