# Góc Trọ — Đặc tả yêu cầu sản phẩm V1 (đồng bộ business decisions Database V1.6)

**Phiên bản:** 1.0 — đặc tả phạm vi sản phẩm, không phải mô tả hành vi demo hiện tại  
**Nguồn:** `GOCTRO_FUNCTION_SCOPE.md` (nguồn quyết định phạm vi), `GOCTRO_FUNCTION_MATRIX.md` (truy vết demo/code cũ), các business rule V1.2 được phê duyệt trong `DATABASE_V1_2_CHANGE_REQUEST.md`, các quyết định Contract audit/revision V1.3 đã được phê duyệt, và `01_REQUIREMENTS.md` phiên bản trước.  
**Phạm vi tài liệu:** xác định sản phẩm V1 cần cung cấp. Tài liệu này không quyết định schema database, API cụ thể hay kiến trúc triển khai chi tiết.

**Database alignment:** Database V1.6 là current local/development physical baseline / LOCK (PostgreSQL 18.6, 28 public tables; schema, seed, runtime validator 97/97, Prisma validate/generate PASS). V1.1–V1.5 là historical locked snapshots. Prisma V1.6 là mapping hiện hành tại `SmartRentalManagement/database/schema.prisma`. Database lock xác định schema authority cho local/development; không thay thế gate migration dữ liệu populated trước khi nâng cấp staging/production. Các Billing/Pricing business rules trong tài liệu này không tự thay đổi baseline; triển khai vật lý cần design/version/migration riêng.

## 1. Mục tiêu sản phẩm

Góc Trọ là hệ thống quản lý bất động sản cho thuê, giúp chủ trọ quản lý nhiều khu trọ, phòng, cư dân, hợp đồng, hóa đơn, thanh toán, tiện ích, bãi xe và khiếu nại. Cư dân sử dụng tài khoản của mình để xem thông tin thuê, hóa đơn, tiện ích và gửi yêu cầu liên quan đến nơi ở. Khách chưa đăng nhập có thể tìm phòng và gửi thông tin để chủ trọ liên hệ lại.

V1 phải dùng dữ liệu tập trung ở backend để các thao tác được lưu bền vững, đồng bộ giữa thiết bị và được phân quyền theo chủ trọ/cư dân.

## 2. Vai trò người dùng

### 2.1 Chủ trọ / Admin

Trong V1, **mỗi Owner có đúng một Admin Account**; tài khoản đó là authority đã xác thực cho Owner tương ứng. Một Owner không hỗ trợ nhiều Admin Account trong V1. Admin là tài khoản quản trị của một chủ trọ, không phải quản trị viên toàn nền tảng. Superadmin là vai trò quản trị nền tảng mới được chốt trong `07_modules/superadmin/SUPERADMIN_REQUIREMENTS_SPEC.md`; vai trò này tách khỏi Owner/Admin và chưa được triển khai trong source/API/database. Staff hoặc delegated admin vẫn chưa thuộc phạm vi.

- Quản lý nhiều khu trọ thuộc quyền của chính chủ trọ đó.
- Quản lý phòng, hồ sơ cư dân, tài khoản cư dân, hợp đồng, hóa đơn, giao dịch thanh toán, tiện ích, bãi xe và khiếu nại trong phạm vi được cấp quyền.
- Xem báo cáo và thống kê được tổng hợp từ dữ liệu thuộc phạm vi của mình.
- Quản lý hồ sơ cá nhân và thông tin xác thực của chính mình.
- Không được xem hoặc sửa dữ liệu thuộc chủ trọ khác.

### 2.2 Cư dân

- Chỉ truy cập dữ liệu gắn với tài khoản và hồ sơ thuê của mình.
- Xem thông tin phòng, hợp đồng, hóa đơn, lịch sử thanh toán, thông báo và các tiện ích liên quan.
- Đăng ký/sử dụng tiện ích và slot đỗ xe theo điều kiện nghiệp vụ.
- Gửi khiếu nại, bao gồm khiếu nại category “Báo cáo nhà trọ”; xem trạng thái và lịch sử xử lý yêu cầu do mình gửi.
- Không được xem hồ sơ, hợp đồng, hóa đơn hay yêu cầu của cư dân khác.

### 2.3 Khách chưa đăng nhập

- Xem và tìm kiếm phòng/khu trọ được công khai.
- Xem thông tin phòng được phép công khai.
- Gửi yêu cầu liên hệ cho chủ trọ. Khách không được truy cập các màn quản trị hoặc dữ liệu cá nhân của cư dân.

## 3. Multi-tenant và phân quyền dữ liệu

- Một chủ trọ có thể quản lý nhiều khu trọ.
- Trong V1, mỗi tài khoản Admin đại diện cho chính chủ trọ tương ứng; không có quyền quản trị dữ liệu toàn nền tảng.
- Mỗi bản ghi nghiệp vụ phải thuộc một phạm vi chủ trọ/khu trọ xác định phù hợp với nghiệp vụ.
- Chủ trọ/Admin chỉ được đọc, tạo, sửa, xóa hoặc xuất dữ liệu của các khu trọ thuộc quyền mình.
- Không chủ trọ nào được truy cập dữ liệu của chủ trọ khác, kể cả khi tự sửa URL, request, mã bản ghi hoặc dữ liệu gửi từ trình duyệt.
- Cư dân chỉ được đọc và thao tác trên dữ liệu thuộc tài khoản/hồ sơ thuê đã được liên kết với họ; thao tác thay mặt cư dân khác phải bị từ chối.
- Backend phải xác thực danh tính, vai trò và phạm vi dữ liệu cho mọi thao tác. Ẩn nút hoặc kiểm tra quyền ở frontend không được xem là biện pháp phân quyền đủ.
- Báo cáo và thống kê phải được tổng hợp sau khi áp dụng cùng phạm vi phân quyền, không để lộ số liệu từ chủ trọ khác.

## 4. Trang công khai và tìm phòng

- Khách chưa đăng nhập có thể xem danh sách/phần chi tiết chỉ của phòng được chủ trọ công khai, đang hoạt động, còn khả dụng và thuộc khu trọ đang hoạt động. Tình trạng khả dụng do backend suy ra; không dựa vào trạng thái hoặc bộ lọc do client tự khai báo.
- Tìm kiếm theo địa chỉ và tỉnh/thành; bộ lọc có thể dùng giá thuê, diện tích, sức chứa và tiện ích công khai có cấu trúc. Không dùng tên tòa nhà làm điều kiện tìm kiếm. Danh sách có phân trang và sắp xếp ổn định.
- Chi tiết công khai chỉ hiển thị dữ liệu phục vụ quyết định thuê: mã phòng, tên khu trọ, địa chỉ/tỉnh thành, giá thuê, diện tích, sức chứa, trạng thái còn khả dụng, tiện ích đã được chủ trọ xác nhận và mô tả công khai nếu có. Tiện ích gồm máy lạnh, bãi gửi xe, Wi-Fi, thang máy, máy giặt, tủ lạnh, máy nước nóng, bếp/phòng vệ sinh riêng, ban công và chính sách nuôi mèo/chó. Chỉ chủ trọ được quản lý danh sách tiện ích có cấu trúc của phòng; dữ liệu cũ để trống và không được suy ra từ mô tả. Mã bãi gửi xe chỉ xác nhận có chỗ gửi xe để khách hỏi thêm; không tự hàm ý miễn phí hoặc đã gồm trong giá thuê. Danh sách trả ảnh cover nếu có; chi tiết trả gallery nếu có. Không có ảnh thì dùng placeholder thương hiệu, không tạo RoomImage giả hoặc dùng ảnh stock như ảnh phòng. Không tự tạo đánh giá, khuyến mãi hoặc số liệu không có dữ liệu nguồn đáng tin cậy.
- Khách có thể gửi yêu cầu liên hệ gồm họ tên, số điện thoại, email/tin nhắn tùy chọn và phòng hoặc khu trọ quan tâm. Hệ thống lưu yêu cầu ở backend và chuyển tới đúng phạm vi chủ trọ/khu trọ; Owner được backend suy ra, không lấy từ dữ liệu client.
- V1 dùng form liên hệ đã lưu làm funnel contact. Chỉ công khai số điện thoại/Zalo của chủ trọ khi có quy tắc đồng ý công khai và API hỗ trợ rõ ràng; hiện không suy ra sự đồng ý từ dữ liệu liên hệ nội bộ.
- V1 không có chức năng booking lịch xem phòng, giữ chỗ, đặt cọc hoặc thanh toán từ public site. Không hiển thị hành vi giả như đã đặt lịch khi thực tế chỉ cuộn trang hoặc gửi thông tin liên hệ.
- Public API không được làm lộ Owner/account ID nội bộ, Resident/CCCD, Occupancy, Contract, Invoice hoặc dữ liệu phòng/khu trọ không công khai. Gửi liên hệ không yêu cầu tạo tài khoản.

## 5. Authentication và tài khoản

- Hệ thống hỗ trợ đăng nhập, đăng xuất, session có thời hạn và kiểm soát quyền theo vai trò.
- Tài khoản có trạng thái hoạt động/khóa. Tài khoản bị khóa không thể tạo session mới; session hiện có phải được xử lý theo chính sách bảo mật.
- Tài khoản cư dân có thể được liên kết với đúng một hồ sơ cư dân theo quy tắc nghiệp vụ; việc liên kết phải tránh tạo liên kết trùng hoặc nhầm người.
- Trong V1, mỗi Owner có đúng một Admin Account; không tạo thêm Admin Account cho cùng Owner. Database V1.5/V1.6 enforce tối đa một Admin Account cho mỗi Owner bằng `accounts.owner_id UNIQUE`. Superadmin không làm thay đổi invariant này; việc triển khai Superadmin phải qua permission/Auth/Account design, database version/migration nếu cần, security review và E2E trước release.
- Resident đăng nhập bằng số điện thoại Việt Nam và mật khẩu. Phone có giá trị phải được chuẩn hóa trước khi so sánh/lưu theo dạng `+84XXXXXXXXX`; chấp nhận đầu vào bắt đầu `0`, `84` hoặc `+84`, bỏ khoảng trắng đầu/cuối và separator space, `-`, `.`. Số quốc tế khác `+84` và đầu vào không hợp lệ bị từ chối; PostgreSQL enforce phone không NULL là duy nhất. Cùng một hàm chuẩn hóa phải được dùng cho đăng nhập, cập nhật hồ sơ và cấp tài khoản. Email login hiện có vẫn được giữ theo contract.
- Mật khẩu phải được băm bằng thuật toán phù hợp. Không lưu hoặc trả mật khẩu plaintext; không dùng mật khẩu mẫu cố định trong sản phẩm.
- Backend quyết định vai trò và quyền từ danh tính đã xác thực; không tin role, user ID hay phạm vi khu trọ do frontend tự gửi.

### Hoàn thiện enrollment/reset — quyết định ngày 2026-10-18

- Kế thừa approval provisioning đã có: Resident có thể có hồ sơ/hợp đồng mà chưa có Account; Admin mời Resident trong Owner scope, không xem token/mật khẩu hoặc đặt mật khẩu thay Resident. Invitation dùng một lần, hết hạn sau 24 giờ; gửi qua Zalo với recipient binding đã xác minh, không suy ra quyền nhận tin chỉ từ số điện thoại. DEV/test harness retrieval được phép, không public endpoint lấy token và không bật adapter DEV ở production.
- Reset token dùng một lần và hết hạn sau **30 phút**. TTL reset này là quyết định mới từ yêu cầu hoàn thiện ngày 2026-10-18, không phải approval lịch sử. Phát hành token không đổi mật khẩu; reset thành công thu hồi các reset token liên quan và mọi phiên đăng nhập, không tự mở khóa Account và không auto-login. Public forgot-password trả kết quả chung để không tiết lộ Account có tồn tại hay không.
- Lịch sử invitation accepted/expired/revoked được giữ lại. Accept tạo/link Account và đánh dấu accepted nguyên tử, không ghi đè Account có sẵn. Delivery thất bại/timeout không được âm thầm vô hiệu lời mời đang dùng; không báo đã gửi khi chưa có xác nhận. Chi tiết endpoint/DTO và giới hạn hạ tầng DEV/production ở API Spec §5.2.

### Superadmin — quyết định nghiệp vụ ngày 2026-10-26 (chưa triển khai)

- Superadmin là loại tài khoản quản trị nền tảng riêng, không gắn với Owner hoặc Resident. Tài khoản Superadmin đầu tiên do người phụ trách kỹ thuật tạo theo yêu cầu của chủ dự án và ghi dấu vết. Quyền xem nhật ký được cấp riêng theo chỉ định của chủ dự án; Superadmin không tự cấp quyền đó cho chính mình. Chủ trọ/Admin vẫn chỉ quản lý dữ liệu Owner của mình.
- Superadmin tạo hồ sơ Owner và lời mời trước. Chỉ khi chủ trọ tự đặt mật khẩu từ liên kết hợp lệ, hệ thống mới tạo Admin Account tương ứng; Superadmin không biết hoặc đặt mật khẩu thay. Liên kết gửi đến email đã xác nhận với chủ trọ qua một kênh khác, ví dụ cuộc gọi. Cần có dịch vụ gửi email thật và xác nhận kết quả gửi trước khi vận hành luồng này. Đây là ngoại lệ có phạm vi hẹp cho liên kết tài khoản Owner trong giai đoạn Superadmin; không mở rộng email/push notification V1 nói chung.
- Liên kết mời tạo tài khoản Owner dùng một lần, hết hạn sau **24 giờ**. Liên kết đặt lại mật khẩu dùng một lần, hết hạn sau **30 phút**. Gửi liên kết mới làm liên kết cũ mất hiệu lực. Chỉ việc chủ trọ tự đặt lại mật khẩu thành công mới đổi mật khẩu và thu hồi phiên; gửi liên kết không mở khóa tài khoản.
- Khóa hoặc mở khóa tài khoản Owner đều bắt buộc ghi lý do và người thực hiện. Khóa phải chặn yêu cầu tiếp theo, thu hồi tất cả phiên và chặn đăng nhập mới. Nếu thu hồi phiên lỗi, hệ thống báo để xử lý lại; không được coi phiên còn hiệu lực là hợp lệ. Mở khóa không phục hồi phiên cũ; chủ trọ đăng nhập lại. Dữ liệu khu trọ và lịch sử giữ nguyên.
- Phản ánh gửi tới nền tảng là dữ liệu riêng với Complaint nội bộ. Bản đầu chỉ nhận phản ánh gắn với một Property, cho phép gửi ẩn danh hoặc để lại liên hệ nếu muốn được phản hồi. Superadmin có thể phản hồi thủ công khi có liên hệ; chưa hỗ trợ tệp đính kèm, phản ánh chung hoặc mở lại phản ánh đã giải quyết. Mục tiêu nội bộ là kiểm tra phản ánh mới trong **2 ngày làm việc**, chưa công bố thời hạn cam kết với người gửi. Mỗi lần đổi trạng thái ghi người xử lý và ghi chú; giới hạn tần suất gửi để chống spam.
- Người được cấp quyền xem nhật ký phải nhập lại mật khẩu tài khoản của chính mình. Quyền xem tạm hết sau **10 phút không hoạt động** hoặc tối đa **30 phút** kể từ lần nhập lại, tùy mốc nào tới trước; cũng hết khi phiên gốc kết thúc hoặc quyền bị thu hồi. Ghi nhận lần xác thực/truy cập thành công hoặc thất bại. Định hướng giữ nhật ký **12 tháng** đã được chốt; trước production cần rà soát lại theo nhu cầu vận hành và chính sách bảo vệ dữ liệu.
- Các quyết định này chưa sửa hợp đồng API V1.2 hoặc database V1.8. Thiết kế đã duyệt ở `07_modules/superadmin/SUPERADMIN_IDENTITY_REPORT_AUDIT_DESIGN.md`; trước khi triển khai cần API contract, database change request, kiểm thử và hạ tầng gửi email/kho phiên phù hợp.

## 6. Quản lý khu trọ và phòng

- Chủ trọ có thể tạo, xem, cập nhật và xóa khu trọ của mình khi không còn ràng buộc nghiệp vụ ngăn việc xóa.
- Một chủ trọ có thể quản lý nhiều khu trọ; mỗi khu trọ có mã, tên, địa chỉ/tỉnh thành, người phụ trách, trạng thái và các thông tin cấu hình cần cho phòng.
- Chủ trọ có thể tạo, xem, cập nhật trạng thái và quản lý giá thuê, diện tích, sức chứa của phòng thuộc khu trọ mình. `rooms.default_capacity` là số người tối đa mặc định được phép ở trong căn/phòng cho thuê.
- Admin có thể chọn 0–5 ảnh ngay trong luồng tạo một Room; hệ thống tạo Room trước rồi xử lý ảnh. Nếu tải một phần ảnh thất bại, Room và ảnh tải thành công vẫn được giữ, UI báo riêng từng ảnh lỗi. Khi bulk create nhiều Room, Admin có thể chọn tối đa 5 ảnh dùng chung; ảnh chỉ được tải/lưu vật lý một lần và được gắn vào các Room tạo thành công. Room tạo thất bại không nhận ảnh. Sau đó, Admin có thể chỉnh gallery riêng của từng Room: thêm ảnh riêng, xóa ảnh khỏi Room, đổi cover và sắp xếp; thao tác trên một Room không ảnh hưởng Room khác. Room có ảnh phải có đúng một cover; khi xóa cover, ảnh còn lại có thứ tự nhỏ nhất được chọn làm cover. Ảnh được giữ khi Room ngừng hoạt động/lưu trữ để bảo toàn lịch sử; object vật lý chỉ được xóa khi không còn Room nào tham chiếu. Cách lưu dùng chung là chi tiết triển khai, không làm thay đổi trải nghiệm xem ảnh theo từng Room. Hỗ trợ gallery dùng chung được thêm ở Database V1.4 và được giữ trong baseline Database V1.6 hiện hành.
- Phòng có trạng thái phù hợp vòng đời cho thuê, tối thiểu phân biệt phòng có thể thuê, đang thuê và không hoạt động.
- Admin có thể tìm phòng theo mã phòng; danh sách phòng hỗ trợ lọc theo khu trọ, trạng thái và phân trang. Có thống kê số phòng, số phòng đang thuê và tỷ lệ lấp đầy.
- Phòng có thể được liên kết với cư dân, hợp đồng, hóa đơn và phương tiện theo nghiệp vụ. Thay đổi phòng phải giữ tính toàn vẹn của các liên kết này.
- Backend phải kiểm tra quyền sở hữu khu trọ và các ràng buộc khi tạo, sửa, xóa khu trọ/phòng.

## 7. Quản lý cư dân

- Lưu hồ sơ cư dân gồm thông tin định danh, liên hệ, phòng/khu trọ, tình trạng đang ở/đã rời đi, thông tin lưu trú và phương tiện liên quan.
- Chủ trọ có thể tra cứu và quản lý hồ sơ trong các khu trọ thuộc phạm vi của mình.
- Hồ sơ cư dân liên kết với tài khoản, hợp đồng và phương tiện phù hợp; dữ liệu liên quan phải nhất quán khi cập nhật.
- Backend kiểm tra định dạng CCCD theo quy tắc đã thống nhất, phát hiện trùng và kiểm tra sức chứa phòng trước khi thêm hoặc chuyển cư dân.
- Số người đang ở trong phòng không được vượt sức chứa áp dụng cho phòng/hợp đồng. Việc thêm cư dân phải căn cứ sức chứa đã cấu hình và các cư dân đang ở hiện tại. `contracts.resident_capacity` là snapshot điều khoản hợp đồng; khi hợp đồng active, chủ trọ có thể thay đổi giá trị này như một amendment có lý do, `If-Match`, revision và durable history. Backend chặn mức mới thấp hơn số Occupancy active hoặc parking assignment active cộng với yêu cầu Parking chưa hết hạn đang giữ sức chứa; không thay đổi `rooms.default_capacity`. Không dùng legacy `occupantCount` làm nguồn capacity có thẩm quyền.
- Có thông tin đăng ký tạm trú/tạm vắng và tình trạng lưu trú để chủ trọ tra cứu, lọc và theo dõi.
- `residence_status` (`living` / `left`) là trạng thái do backend quản lý, suy ra từ các Occupancy `active` của Resident: có ít nhất một lượt đang hoạt động thì `living`, không còn lượt nào thì `left`. Đây là source of truth; client không được tự đặt/chỉnh trạng thái này. Tạo hồ sơ mới chưa có Occupancy mặc định `left`; thêm, kết thúc hoặc chuyển lượt cư trú phải cập nhật nhất quán trong cùng transaction với Occupancy.
- Không cho xóa hồ sơ nếu còn liên kết nghiệp vụ cần lưu giữ; phải có quy tắc lưu trữ/ngừng hoạt động phù hợp thay vì làm mất lịch sử.

## 8. CT01

- Chủ trọ chọn một khu trọ; hệ thống lọc cư dân của tất cả phòng thuộc khu đó chưa hoàn tất đăng ký tạm trú/tạm vắng theo trạng thái nghiệp vụ.
- Danh sách cư dân này được dùng để chuẩn bị/xuất dữ liệu CT01. Chủ trọ phải rà soát dữ liệu trước khi xuất/in.
- Chỉ lấy cư dân thuộc khu trọ mà chủ trọ hiện tại được quyền quản lý.
- Biểu mẫu cần thể hiện rõ dữ liệu lấy từ hồ sơ và trường cần người dùng bổ sung/xác nhận.
- Bản xuất từ Góc Trọ không được mặc định quảng bá là biểu mẫu pháp lý hoàn chỉnh. Mẫu chính thức, nội dung và quy trình áp dụng phải được xác minh trước khi đưa vào production.

## 9. Hợp đồng

Các quyết định Contract audit/revision dưới đây được ghi nhận theo lịch sử V1.3 và hiện đã được đồng bộ vào baseline Database V1.6 / Prisma V1.6. Database V1.3 là historical locked snapshot; Database V1.6 là current local/development physical baseline. Migration lên staging/production vẫn cần gate riêng.

- Mỗi hợp đồng phải tham chiếu đúng một cư dân đại diện/người đứng tên hợp đồng.
- Ngoài người đứng tên, phòng có thể có các cư dân khác đang sinh sống. Danh sách người đang ở được quản lý riêng qua hồ sơ cư dân và quan hệ cư dân/phòng; họ không tự động trở thành người đứng tên hoặc đồng đứng tên hợp đồng.
- Hợp đồng lưu ngày bắt đầu/kết thúc, tiền thuê, tiền cọc, sức chứa được ký (`resident_capacity`), điều khoản cần thiết và chỉ số điện/nước ban đầu. Sức chứa là snapshot của điều khoản hợp đồng, không đổi theo `rooms.default_capacity` về sau; khi Contract active, thay đổi sức chứa là amendment có lý do, revision/history và kiểm tra số Occupancy/slot xe đang dùng.
- Có thể tra cứu hợp đồng theo phòng, cư dân đại diện, mã và trạng thái; xem hồ sơ/tệp hợp đồng được phép.
- Vòng đời Contract bắt đầu ở trạng thái `draft` (revision 0). Draft creation và draft edits không phải revision chính thức và không nằm trong durable official Contract audit history. Các validation nghiệp vụ vẫn áp dụng cho draft; `contract_no` có thể sửa khi còn draft.
- Activation `draft → active` là mốc Contract chính thức đầu tiên: revision chuyển `0 → 1` và tạo audit event đầu tiên, lưu baseline đầy đủ của Contract được kích hoạt. Revision chính thức tăng đơn điệu sau mỗi material PATCH hoặc lifecycle mutation được chấp nhận.
- Hỗ trợ gia hạn và thanh lý hợp đồng, lưu người thao tác, thời gian và thông tin thay đổi cần thiết trong durable audit từ activation trở đi. Material PATCH sau activation chỉ áp dụng cho Contract `active`, phải có lý do thay đổi, lưu before/after và tăng revision trong cùng giao dịch. Không PATCH material chung cho Contract `expired` hoặc `terminated` nếu chưa có workflow correction được duyệt.
- Renewal tạo Contract successor mới ở trạng thái `draft`, revision 0, `previous_contract_id` do backend gán và chưa có audit history. Contract predecessor không đổi revision. Successor có audit chính thức đầu tiên khi được activate.
- `contract_no` editable khi Contract còn draft và immutable sau activation. Termination chỉ áp dụng cho official Contract; tăng revision, ghi audit cùng giao dịch, dùng `termination_reason` làm lý do nghiệp vụ và không yêu cầu thêm `change_reason`.
- Tra cứu Contract hỗ trợ tìm theo mã hợp đồng, không thay thế bằng tìm tên Property.
- Ngày nghiệp vụ Contract dùng `Asia/Ho_Chi_Minh`. Khi ngày nghiệp vụ đã qua `end_date`, Contract `active` chuyển persisted status sang `expired`; ngày `end_date` vẫn còn active. Chuyển trạng thái phải nguyên tử, idempotent, tăng revision và ghi một lifecycle history event; Contract `terminated` không chuyển sang `expired`.
- Lệnh terminate chỉ nhận ngày từ `start_date` đến hết ngày hiện tại theo `Asia/Ho_Chi_Minh`, không nhận ngày tương lai. Không có scheduled termination trong V1.
- Termination kết thúc các Occupancy gắn Contract trong cùng transaction rồi tính lại `residents.residence_status` từ tất cả Occupancy active của từng Resident: còn ít nhất một lượt thì `living`, không còn thì `left`.
- Mỗi Contract là một meter continuity riêng. Contract mới do thuê mới hoặc renewal không tự kế thừa initial/final reading hay reading Invoice của Contract predecessor/khách thuê trước; Admin phải nhập initial Electricity/Water riêng trên Contract draft. Successor vẫn giữ `previous_contract_id` cho lineage Contract, nhưng lineage này không dùng làm nguồn meter reading. Activation successor bị chặn nếu thiếu một trong hai initial reading; Admin có thể bổ sung qua draft PATCH rồi thử lại.
- Các Contract command yêu cầu `Idempotency-Key` phải có durable server-side replay: namespace luôn scope theo Owner + Account + operation + key; cùng payload trả lại kết quả thành công ban đầu, dùng lại key với payload khác trả conflict. Cách ly giữa hai Owner là kiểm thử bắt buộc. Cách ly giữa nhiều Admin Account cùng Owner là N/A trong V1 vì invariant một Owner = một Admin Account; nếu multi-admin được đưa vào phiên bản tương lai, kiểm thử cách ly Account cùng Owner trở thành bắt buộc trước release. Header validation hoặc process-memory cache không đủ để coi là replay-safe.
- Durable official Contract history chỉ Admin cùng Owner được đọc; Resident không được xem before/after, `change_reason` hoặc actor context nội bộ. Không thay thế audit bền vững bằng log-only. Các status hiện có là `draft`, `active`, `expired`, `terminated`: draft dùng revision 0; các trạng thái official còn lại dùng revision >=1. Dữ liệu V1.2 khi migrate: draft→0, non-draft→1 và không tạo lịch sử giả; baseline non-draft có thể chưa có history row tương ứng.
- Official mutations dựa trên Contract hiện hành dùng revision precondition `If-Match: "<revision>"`; stale revision trả HTTP 409 `CONTRACT_REVISION_CONFLICT` và không ghi thay đổi/audit. Draft PATCH không dùng revision-based `If-Match`; activation lock/reload draft và validate trạng thái mới nhất.
- Khi hợp đồng hết hiệu lực, entitlement/assignment bãi xe gắn với hợp đồng/phòng đó kết thúc và lịch sử được giữ lại. Paid Service chỉ phát sinh charge hợp lệ theo rule hiệu lực của chính dịch vụ; không mặc định tồn tại đăng ký Pool/Gym định kỳ.
- Trước thanh lý, hệ thống kiểm tra công nợ. Việc tính hoàn/khấu trừ cọc phải dựa trên số tiền cọc, khoản khấu trừ hợp lệ và dữ liệu chốt chỉ số.
- Không cho tạo hai hợp đồng đang hiệu lực cho cùng phòng nếu quy tắc thuê không cho phép; backend phải kiểm tra xung đột thời hạn.
- OCR/AI đọc hợp đồng hoặc CCCD không phải yêu cầu bắt buộc của V1. Nếu có bước nhập hồ sơ thủ công, dữ liệu cần được người có quyền kiểm tra trước khi lưu.

## 10. Hóa đơn

- Billing period được neo theo `contracts.start_date`, không theo tháng dương lịch, ngày đặt cọc hoặc chu kỳ cố định 30 ngày. Các mốc kỳ hàng tháng được tính từ ngày bắt đầu gốc của hợp đồng; nếu tháng đích không có ngày 29/30/31 tương ứng thì clamp về ngày cuối tháng, nhưng không dùng ngày đã clamp làm anchor cho kỳ sau. Ví dụ anchor ngày 31 có các mốc 31/01, 28/02, 31/03, 30/04, 31/05.
- Ngày kết thúc hợp đồng có hiệu lực cho billing (`effective_contract_end_date`) là `contracts.termination_date` khi `contracts.status = terminated` và `termination_date` có giá trị; các trường hợp khác dùng `contracts.end_date`. Kỳ hóa đơn kết thúc vào ngày trước mốc bắt đầu kỳ tiếp theo; kỳ cuối có `period_end = min(normal_period_end, effective_contract_end_date)`. Không tạo kỳ hóa đơn bắt đầu sau `effective_contract_end_date`.
- Kỳ cuối vẫn thu nguyên tiền thuê kỳ, không prorate. Điện/nước usage-based được tính đến ngày kết thúc hợp đồng có hiệu lực; dịch vụ fixed-per-period thu đủ kỳ, dịch vụ usage-based tính đến `effective_contract_end_date`. Hợp đồng hết hạn bình thường dùng `end_date`; hợp đồng chấm dứt sớm dùng `termination_date`.
- Điện dùng biểu giá chính thức/theo quy định Nhà nước dạng nhiều bậc, đơn vị kWh. Mỗi tariff version thuộc Property, có effective date và source/reference; chứa các tier với ngưỡng/khoảng và đơn giá. Tính usage qua các bậc lũy tiến (không lấy toàn bộ usage nhân đơn giá bậc cuối). Tariff được chọn theo tariff có hiệu lực tại `period_start` và giữ nguyên trong toàn kỳ hóa đơn.
- Nước dùng đơn giá theo m³, tính usage bằng current reading trừ previous reading. Mỗi tariff/price version thuộc Property, có effective date và source/reference; version áp dụng được chọn tại `period_start` và giữ nguyên cả kỳ. V1 không áp dụng nhiều bậc cho nước. Owner/Admin không được override giá điện/nước theo Contract. V1 không yêu cầu live API Nhà nước; cập nhật giá tạo version mới, không update đè lịch sử hoặc làm đổi Invoice finalized. Provider/locality/source name/reference/published date (nếu có) chỉ là metadata audit nguồn giá, không tạo subsystem vận hành Water provider. OCR meter reading cơ sở nằm ngoài V1; ngoại lệ được duyệt ngày 2026-10-28 là luồng Resident gửi ảnh, xác nhận chỉ số và chờ chủ trọ duyệt theo mục bổ sung dưới đây.
- Mỗi billing period chỉ dùng một tariff version cho mỗi utility, chọn theo tariff có hiệu lực tại `period_start`; giá có hiệu lực giữa kỳ chỉ áp dụng từ billing period kế tiếp. Không split utility theo tariff giữa kỳ, không chia usage theo ngày/tỷ lệ, không tính lại kỳ đang chạy bằng giá mới và không cần intermediate reading chỉ vì tariff đổi. Admin nhập thủ công beginning và ending/current readings. Meter Reading business data cần đủ utility type, Room/Contract context, ngày/giờ và value; source/status nếu cần. Không chốt field/schema trong Requirement.
- Meter continuity được phân tách theo `contract_id`, không theo Room hoặc Contract lineage. Kỳ Invoice đầu tiên của mỗi Contract dùng initial reading của chính Contract đó. Từ kỳ thứ hai, từng utility dùng ending/current reading của Invoice finalized gần nhất thuộc chính Contract đó và có `period_end` trước kỳ hiện tại. Không dùng draft, Invoice chưa finalized, Invoice của Contract khác, predecessor/successor Contract hoặc Room history của khách thuê trước. Nếu Invoice finalized gần nhất trong Contract thiếu hoặc có ending reading không hợp lệ cho utility cần resolve thì utility đó unresolved; không lùi về Invoice cũ hơn hoặc initial reading để che lỗi. Nếu chưa có Invoice finalized trước đó thì dùng initial reading của chính Contract; nếu initial reading thiếu/không hợp lệ, Invoice có thể ở draft nhưng không được finalize.
- Fixed Service là phí định kỳ cấu hình theo Property và tính theo Room (ví dụ quản lý, Internet/WiFi, rác); trong V1, một dịch vụ đã bật áp dụng cho tất cả Room đủ điều kiện tại Property, không có ngoại lệ theo Room và không cần bảng applicability riêng. Không override theo Contract. Giá có version/effective date; chọn version có hiệu lực tại `period_start` và giữ cho cả kỳ. Giá đổi giữa kỳ chỉ áp dụng từ kỳ kế tiếp, không prorate chỉ vì đổi giá.
- Facility là tài sản/tiện ích chung của Property (ví dụ hồ bơi, gym, sân chơi, lounge) và không mặc định có phí/subscription. Flexible Paid Service là dịch vụ có charge theo billable event hợp lệ; có thể one-time, per-use, quantity-based, booking-based hoặc recurring nếu dịch vụ yêu cầu. Pool/Gym không phải model mặc định cho Flexible Paid Service và có thể là Facility. Billing nhận charge hợp lệ từ nghiệp vụ dịch vụ; không biến Góc Trọ thành POS/restaurant system. Một Flexible Service charge thuộc kỳ Invoice khi ngày lịch của `occurred_at` theo `Asia/Ho_Chi_Minh` nằm trong khoảng từ `period_start` đến hết `period_end` (bao gồm cả hai ngày biên).
- **Định hướng Resident Flexible Service được chốt (2026-10-26):** Admin là nguồn cấu hình cho dịch vụ phát sinh và giá. Với mode `BOOKING`, Admin đặt ngày trong tuần, khung giờ trong ngày, thời lượng mỗi lượt và sức chứa tối đa mỗi lượt. Hệ thống chia khung mở thành các suất liên tiếp theo thời lượng; mỗi yêu cầu của một Resident chiếm một chỗ trong lúc chờ quyết định và sau khi duyệt. Khi đủ sức chứa, suất không còn khả dụng. Lịch dùng múi giờ `Asia/Ho_Chi_Minh`; chỉ nhận ngày hôm nay/tương lai. Một Resident không thể gửi hai yêu cầu cho cùng dịch vụ/ngày/suất đang chờ hoặc đã duyệt. Yêu cầu ở trạng thái `PENDING` cho tới khi Admin duyệt hoặc từ chối; chỉ Admin duyệt trước giờ bắt đầu mới chuyển `APPROVED`. Resident nhận notification in-app và chỉ hủy được yêu cầu đang `PENDING`; yêu cầu đã duyệt không tự hủy để tránh xóa phí đã ghi nhận. Đây là lịch sử dụng, không phải booking xem phòng.
- Với mode `SUBSCRIPTION`, Admin đặt thời hạn tháng/năm, các ngày được phép và khung giờ sử dụng; sau khi đăng ký gói, cư dân dùng trong khung đã cấu hình mà không cần chọn từng lượt. Trang Resident hiện hiển thị thông tin gói nhưng chưa đăng ký gói hoặc thu tiền; lifecycle đăng ký, ngày bắt đầu, phê duyệt, giới hạn đồng thời theo giờ, charge và thanh toán cần API/nghiệp vụ riêng. Dữ liệu Flexible cũ chưa có cấu hình không tự suy diễn thành mode nào.
- **APPROVED (2026-10-27):** Khi Resident gửi yêu cầu `BOOKING`, hệ thống lưu ảnh chụp tên dịch vụ, Owner/Property/Resident/Room/Contract, ngày/giờ/thời lượng, đơn vị và giá niêm yết đã phát hành có hiệu lực vào ngày sử dụng. Yêu cầu ở `PENDING` giữ một chỗ nhưng chưa tạo khoản phải thu. Chỉ Admin mới được duyệt/từ chối; từ chối hoặc Resident hủy khi `PENDING` không tạo charge và nhả chỗ. Admin chỉ duyệt trước giờ bắt đầu khi lịch, sức chứa, Occupancy/Contract và đúng phiên bản/giá đã báo lúc đăng ký còn hợp lệ. Duyệt nguyên tử tạo một Flexible Service charge `READY` theo giá đã chụp và `occurred_at` là giờ bắt đầu suất; charge được resolver đưa vào hóa đơn hợp đồng thông thường khi kỳ phù hợp được lập/chốt. Yêu cầu chưa phải hóa đơn; duyệt không tự lập/chốt/gửi hóa đơn và không thu/đánh dấu thanh toán. Payment/check-out là module riêng.
- Từ chối hoặc Resident hủy khi `PENDING` không tạo charge và giải phóng sức chứa. Sau khi duyệt, lịch đã gắn charge; không có hủy/hoàn tiền tự động sau duyệt, nên không cho Resident tự hủy. Mọi điều chỉnh phí đã ghi nhận tuân theo luồng correction/amendment hóa đơn, không rewrite lịch sử.
- **Subscription package:** gói tháng/năm sau khi đăng ký sẽ dùng trong ngày/khung giờ Admin cấu hình, không cần chọn từng suất. Resident module hiện chỉ hiển thị quy tắc; enrollment, ngày bắt đầu/kết thúc, duyệt/giới hạn đồng thời và thu phí gói là scope riêng cần được chốt.
- Parking xác định area/slot/vehicle/card/entitlement/assignment, Resident/Room/Contract/capacity và trạng thái active (“WHAT IS ASSIGNED / ACTIVE?”); Billing xác định giá (“HOW MUCH?”). Entitlement gồm paid slot, free slot, motorcycle/apartment vehicle card và các loại tương lai; không mặc định mọi assignment có phí. Free entitlement không tạo Invoice Item; assignment legacy chưa phân loại không tự suy diễn thành paid hoặc free. Paid Parking dùng duy nhất Property pricing authority; không tạo nguồn giá trùng giữa Parking và Amenity/Billing. Recurring charge chỉ phát sinh khi assignment/entitlement active và explicitly classified paid, có Property price item/version hợp lệ và đủ điều kiện tại `period_start`. Nếu paid entitlement bắt đầu sau `period_start`, recurring charge bắt đầu từ kỳ kế tiếp; nếu đã active tại `period_start`, tính đủ kỳ. Không prorate. Phí kích hoạt một lần trong tương lai phải là charge/item riêng nếu được duyệt.
- Price History là append-only business history. Sau khi có hiệu lực, không update giá cũ thành giá mới; version cũ được giữ và price version đã dùng không bị xóa làm mất audit. Sai giá cần controlled correction/superseding version hoặc approved amendment, không rewrite âm thầm.
- Với Invoice V1.7 được finalize, `invoice_items` là authority của financial detail; aggregate fields (`rent_amount`, `electricity_amount`, `water_amount`, `service_amount`, `total_amount`) là compatibility snapshots được suy ra từ items. Thứ tự: tính items có thẩm quyền → làm tròn line/tier theo rule → suy ra aggregate buckets → suy ra total bằng tổng amount đã làm tròn → reconcile → finalize nguyên tử. Không có hai nguồn tài chính độc lập cùng được sửa.
- Invoice finalized phải giữ financial item snapshot giải thích được loại khoản (tối thiểu RENT, ELECTRICITY, WATER, FIXED SERVICE, FLEXIBLE SERVICE, PARKING), label tại thời điểm đó, quantity, unit, unit price, price/source version, khoảng thời gian tính khi cần và amount. Electricity dùng một parent item cùng tier detail; tổng quantity và amount các tier phải bằng parent. Không render hóa đơn finalized bằng cách tra giá/tên hiện hành. Legacy finalized Invoice V1.6 giữ nguyên aggregate, không tạo breakdown giả và API đánh dấu `itemization_available=false`; Invoice V1.7 mới đánh dấu itemized. Finalized financial data và item snapshot bất biến.
- Rounding V1.7 dùng decimal-safe arithmetic: meter reading lưu tối đa 3 chữ số thập phân và usage không làm tròn sớm; từng Electricity tier amount làm tròn đến VND nguyên theo half-up; Water làm tròn line amount cuối theo half-up; Fixed Service dùng VND nguyên; Flexible Service làm tròn amount từng line theo half-up; Parking dùng cùng quy tắc line-level nếu phép tính cho kết quả lẻ. Total bằng tổng item amount đã làm tròn, không cộng raw amounts rồi làm tròn riêng; không dùng binary floating-point cho tiền.
- Flexible Service chọn Property price version theo thời điểm xảy ra dịch vụ (`effective_from <= occurred_at`, lấy version hợp lệ mới nhất). Backend tự giải quyết giá; client không gửi giá authoritative. Không chọn giá theo Invoice `period_start`.
- Contract không lưu override giá điện/nước/dịch vụ/bãi xe. Contract tiếp tục lưu rent/terms/context/capacity/lifecycle và meter baseline/final readings nếu áp dụng. Rent lấy từ Contract, được ghi thành khoản rent của kỳ trong Invoice; rent không thuộc Property service catalog.
- Vòng đời hóa đơn là `draft → unpaid → paid`. Không lưu trạng thái `overdue`; overdue là trạng thái suy ra.
- Vào `period_end`, hệ thống nhắc Admin/chủ trọ nhập hoặc chốt điện, nước và dữ liệu dịch vụ. Reminder này chưa tạo hóa đơn final, không gửi Zalo và không mở thanh toán.
- Vào ngày lịch kế tiếp sau `period_end`, hệ thống bảo đảm có một hóa đơn `draft` cho hợp đồng/kỳ đó. Scheduler retry phải idempotent và không tạo trùng hóa đơn cùng kỳ.
- Draft chưa finalized, `finalized_at` và `due_date` đều chưa có. Admin có thể nhập/chỉnh dữ liệu được phép; nếu meter/service data chưa đủ, hóa đơn tiếp tục là draft. Draft không được thanh toán hoặc gửi Zalo OA.
- Trong draft, amount và total có thể là provisional; các amount vẫn là số, có thể tạm 0. API/UI phải thể hiện rõ tổng draft chưa phải tổng phải trả. Giá trị amount bằng 0 không chứng minh dữ liệu đã đầy đủ; completeness được backend xác minh từ readings và dữ liệu nghiệp vụ bắt buộc.
- Khi dữ liệu bắt buộc đầy đủ, Admin hoặc workflow backend được ủy quyền finalize. Backend xác minh completeness, tính lại các khoản và tổng tiền có thẩm quyền, đặt `finalized_at`, tính hạn thanh toán, chuyển status sang `unpaid` trong một transition nguyên tử. Chỉ sau commit mới enqueue/gửi Zalo; chỉ sau finalize mới cho thanh toán.
- Hạn thanh toán bằng ngày lịch của `finalized_at` theo múi giờ `Asia/Ho_Chi_Minh` cộng 5 ngày lịch. Người thuê luôn có đủ 5 ngày sau finalize. Ngày hạn chưa overdue; overdue bắt đầu khi `status = unpaid AND current_date > due_date` theo lịch `Asia/Ho_Chi_Minh`.
- Hóa đơn thể hiện tiền thuê, điện, nước, dịch vụ/phí liên quan, kỳ hóa đơn, hạn thanh toán (null khi draft), tổng tiền, trạng thái, revision và thời điểm finalize nếu có.
- Dữ liệu hóa đơn được liên kết với chủ trọ, khu trọ, phòng, hợp đồng và cư dân liên quan.
- Backend ngăn tạo trùng hóa đơn cho cùng hợp đồng và kỳ, kể cả yêu cầu đồng thời hoặc scheduler retry.
- Có thể tra cứu/lọc hóa đơn theo kỳ, khu trọ, phòng, cư dân và trạng thái; cư dân chỉ xem hóa đơn thuộc hồ sơ thuê của mình.
- Draft được chỉnh sửa trong các trường được phép mà chưa phát hành thì không nhất thiết tăng revision. Sau finalize, mọi sửa đổi material financial fields phải đi qua controlled amendment: xác thực, tính lại, tăng revision và gửi revision mới; không cho PATCH tùy ý. Log Zalo của revision trước được giữ nguyên. Hóa đơn paid không được sửa trực tiếp khoản tiền hoặc ghi đè lịch sử thanh toán; correction/adjustment workflow riêng có thể được thiết kế sau.
- Client không được tự đặt trạng thái final, `finalized_at`, `due_date`, tổng tiền, revision, tenant context hoặc quyền thanh toán. Thay đổi chỉ số/khoản phí phải được backend xác thực và tính lại; giá trị frontend không phải nguồn có thẩm quyền.
- Các quyết định billing cadence theo Contract anchor, month-end clamp/no-drift, ngày kết thúc hiệu lực, kỳ cuối/full rent, draft/finalize timing, due date +5 ngày và overdue derived đã được chốt. Utility tariff theo Property/version/source, period-start tariff selection, điện nhiều bậc, nước đơn giá/m³, meter continuity riêng theo từng Contract, Fixed Service price-period selection, Facility/Flexible boundary, Parking entitlement/pricing, append-only Price History, Invoice Items authority và snapshot đã được APPROVED. Rounding, Flexible price date, Fixed Service áp dụng mọi Room đủ điều kiện, Water metadata audit-only, Parking no-proration và billability rule cũng đã chốt. Còn mở: quy trình nạp/version tariff điện, Flexible cancellation/refund và exact schema/API fields.

## 11. Thanh toán

- V1 phải ghi nhận giao dịch thanh toán riêng biệt với trạng thái hóa đơn. Một hóa đơn có thể có nhiều lần thử hoặc giao dịch.
- V1 chỉ xử lý thu tiền hóa đơn qua MoMo và ZaloPay; không triển khai workflow hoàn tiền tự động hoặc hoàn tiền qua provider. Việc hoàn/khấu trừ tiền cọc khi thanh lý hợp đồng ở Mục 9 là quyết toán tiền cọc, không phải refund giao dịch thanh toán.
- V1 hỗ trợ hai provider thanh toán: MoMo và ZaloPay.
- V1 không hỗ trợ thanh toán một phần. Mỗi giao dịch thanh toán thành công phải trả đủ số tiền còn phải trả của hóa đơn; không có trạng thái `partial_paid`.
- Mỗi transaction lưu tối thiểu hóa đơn liên quan, provider, provider transaction/reference ID, số tiền, trạng thái, thời điểm tạo/thanh toán và lỗi từ provider nếu có. Mỗi lần thử thanh toán tạo transaction riêng; không ghi đè transaction cũ.
- Giao dịch thất bại/đang xử lý/thành công phải được phân biệt; giao dịch lỗi không được tự động coi là đã thanh toán.
- Chỉ giao dịch thành công với số tiền bằng đủ số tiền còn phải trả mới chuyển hóa đơn sang trạng thái đã thanh toán. Giao dịch thất bại, đang xử lý hoặc số tiền không đủ không làm hóa đơn thành đã thanh toán.
- Chỉ hóa đơn `unpaid` đã finalize (`finalized_at` có giá trị) mới được bắt đầu payment session/attempt. Từ chối invoice draft, paid hoặc chưa finalize; payment success chỉ chuyển `unpaid → paid`.
- Trong một phiên thanh toán, người dùng được tối đa hai lần thất bại liên tiếp. Khi cả hai lần đều thất bại, phiên hiện tại kết thúc, người dùng được đưa về màn hình chính/trang chủ và hóa đơn vẫn chưa thanh toán.
- Giới hạn hai lần thất bại áp dụng riêng cho từng phiên, không giới hạn tổng số lần thanh toán của hóa đơn. Người dùng có thể mở lại hóa đơn và bắt đầu phiên thanh toán mới; hóa đơn/khả năng thanh toán không bị khóa vì hai lần thất bại trước đó.
- Trạng thái hóa đơn được cập nhật dựa trên giao dịch hợp lệ và quy tắc đối soát, không chỉ bằng cách đổi trực tiếp một cờ `paid`.
- Requirement xác định provider và dữ liệu giao dịch cần lưu, không quy định API kỹ thuật cụ thể của MoMo/ZaloPay.
- Webhook/callback từ provider phải được xác minh và xử lý idempotent để không ghi nhận giao dịch thành công nhiều lần.

## 12. Zalo OA và thông báo

- V1 hỗ trợ gửi hóa đơn cho cư dân qua Zalo OA.
- Mỗi lần gửi hóa đơn qua Zalo OA phải có log riêng để truy vết, gồm trạng thái gửi và thông tin lỗi/mã phản hồi nếu có; không xóa log các lần gửi trước.
- Nếu hóa đơn đã gửi được cập nhật hợp lệ về nội dung hoặc số tiền, hệ thống phải gửi lại phiên bản đã cập nhật cho cư dân. Log phải phân biệt các lần gửi và chỉ rõ phiên bản hóa đơn hiện hành được gửi.
- Chỉ enqueue/gửi hóa đơn có `status = unpaid` và đã finalize. Draft bị từ chối; paid không được gửi như một invoice mới. Mỗi lần gửi ghi `invoice_revision` riêng; revision mới tạo log mới và không ghi đè/xóa log cũ.
- Hóa đơn chỉ được gửi đến người nhận gắn với đúng hồ sơ thuê và theo quyền/trạng thái liên hệ phù hợp.
- Các thông báo nghiệp vụ khác hiển thị trong ứng dụng.
- V1 không yêu cầu gửi email hoặc push notification.

## 13. Tiện ích

Facility và Paid Service là hai khái niệm riêng. Facility mô tả tài sản/tiện ích chung của Property, ví dụ hồ bơi, gym, sân chơi hoặc lounge. Facility không mặc định là dịch vụ có phí, yêu cầu đăng ký hay subscription.

Các rule Pool/Gym paid subscription theo chu kỳ 30 ngày/720 giờ, tự gia hạn, hủy cuối kỳ và áp giá mới ở cycle tiếp theo trước đây đã **SUPERSEDED / REPLACED**. Pool/Gym có thể là Facility; chúng không còn là model mặc định của Flexible Paid Service. Không áp dụng đồng thời rule chu kỳ cũ như business rule hiện hành.

Paid Service có thể tạo charge. Fixed Service là phí định kỳ cấu hình theo Property và charge basis theo Room; ví dụ phí quản lý, Internet/WiFi, rác và phí cố định tương tự. V1 áp dụng một dịch vụ đã bật cho tất cả Room đủ điều kiện tại Property; không có ngoại lệ theo Room hay bảng applicability riêng. Giá không được override theo Contract, phải có price version/effective date, thay đổi bằng version mới và giữ lịch sử cũ. Chọn price version tại `period_start`, giữ giá cho cả kỳ; giá giữa kỳ chỉ áp dụng từ kỳ tiếp theo và không prorate vì đổi giá.

Flexible Paid Service không bắt buộc subscription 30 ngày và có thể dùng one-time, per-use, quantity-based, booking-based hoặc recurring nếu chính dịch vụ cần. Ví dụ spa, pet care, dịch vụ kinh doanh trong tòa nhà, nhà hàng/quán ăn. Billing chỉ nhận billable charge hợp lệ do nghiệp vụ dịch vụ tạo; Góc Trọ không trở thành POS/restaurant-management system. V1 không tự động refund; billed/finalized charge không tự hoàn hoặc rewrite Invoice. Chi tiết cancellation/refund vẫn chưa được chốt.

**Cấu hình Tiện ích phát sinh được duyệt ngày 2026-10-26:** Mỗi dịch vụ mới phải chọn đúng một cách dùng. (1) `BOOKING`: Admin cấu hình các ngày mở, một khung giờ mở/đóng dùng chung cho các ngày đã chọn, thời lượng một lượt và số người/lượt có thể phục vụ đồng thời. Khi luồng Resident được triển khai, backend chỉ xác nhận đặt chỗ nếu khung giờ còn đủ sức chứa; không xác nhận vượt chỗ hoặc trùng năng lực. (2) `SUBSCRIPTION`: Admin tạo gói có giá theo gói, thời hạn số tháng hoặc số năm, các ngày mở và khung giờ sử dụng; cư dân đăng ký gói một lần và được sử dụng trong khung giờ đã cấu hình, không đặt lịch cho từng lượt. V1 chưa giới hạn số người dùng gói có mặt cùng lúc; theo dõi check-in/mật độ sử dụng là phạm vi cần chốt riêng. Admin chỉ cấu hình danh mục, lịch, sức chứa của lượt đặt và giá; đăng ký gói/đặt lịch/thanh toán phía Resident không thuộc phần triển khai Admin này. Không suy luận loại dùng của dữ liệu Flexible cũ; bản ghi V1.8 chưa cấu hình phải được Admin chọn loại trước khi được đưa vào luồng Resident mới. Tiện ích cố định, Điện & nước, Parking và các khoản hóa đơn hiện hữu không đổi.

Giá và lịch sử giá thuộc Property pricing authority; không đưa giá sang Contract. Price History là append-only business history: không update đè giá cũ, giữ version đã dùng và không xóa version làm mất audit. Nếu nhập sai, xử lý bằng controlled correction/superseding version hoặc approved Invoice amendment; không silent rewrite.

## 14. Bãi xe

Bãi xe là nghiệp vụ riêng với tiện ích thông thường.

- Quản lý khu vực đỗ xe, slot, phương tiện, biển số, chủ phương tiện/cư dân và phòng liên quan.
- Một cư dân có thể đăng ký nhiều phương tiện; mỗi phương tiện được quản lý riêng. Số phương tiện của cư dân không làm tăng giới hạn slot của phòng.
- Cư dân có thể xóa phương tiện đã nhập nhầm nếu phương tiện chưa được dùng trong bất kỳ yêu cầu Parking hoặc assignment nào. Không xóa phương tiện đã có lịch sử; backend trả xung đột có giải thích để giữ nguyên lịch sử yêu cầu/đăng ký.
- Số slot xe đang hoạt động tối đa của một phòng bằng số người/sức chứa được khai báo trên hợp đồng đang hiệu lực áp dụng cho phòng đó.
- V1 không cho phép chủ trọ/Admin ghi đè giới hạn slot cho từng phòng.
- Mỗi đăng ký slot phải lưu phòng, cư dân/phương tiện liên quan, slot, ngày đăng ký/ngày bắt đầu sử dụng, trạng thái và ngày kết thúc/ngày thu hồi nếu có.
- Slot thuê gắn với hợp đồng kết thúc khi hợp đồng đó hết hiệu lực; lịch sử đăng ký được giữ lại.
- Khi sức chứa hợp đồng được giảm, backend phải kiểm tra số slot xe đang hoạt động trước khi áp dụng thay đổi. Nếu số slot vượt giới hạn mới, phải chặn việc áp dụng cho đến khi người có quyền chủ động xử lý số slot vượt mức; không tự động xóa đăng ký slot hiện có.
- Một slot không được cấp cho nhiều phương tiện trong cùng thời điểm; kiểm tra xung đột phải ở backend.
- Parking là authority về “WHAT IS ASSIGNED / ACTIVE?”: quản lý entitlement/loại thẻ, khu vực, slot, vehicle, Resident, Room, Contract/capacity, assignment và trạng thái active/inactive.
- V1 cần biểu diễn entitlement miễn phí hoặc trả phí; entitlement miễn phí có charge bằng 0 và không tạo dòng phí. Các loại concept gồm paid/reserved slot, thẻ xe máy/phương tiện và loại entitlement tương lai.
- Billing/Pricing là authority về “HOW MUCH DOES IT COST?”. Paid Parking entitlement dùng duy nhất Property pricing authority chung với Billing; không tạo hai bảng giá cho cùng một loại charge.
- Supported charge basis có thể theo slot, vehicle/card hoặc billing period; thiết kế phải biểu diễn loại charge. Recurring entitlement đủ điều kiện tại `period_start` tính đủ kỳ; bắt đầu sau mốc đó thì bắt đầu tính từ kỳ kế tiếp. Không prorate khi assignment bắt đầu/kết thúc giữa kỳ.
- Camera hoặc AI nhận diện biển số tự động không thuộc V1.
- Parking V1.13 có luồng yêu cầu duyệt: Admin cấu hình slot đang hoạt động với nhóm xe được nhận (xe máy/ô tô/xe đạp/khác hoặc mọi loại) và một entitlement FREE hoặc PAID. Slot legacy chưa cấu hình không hiện cho cư dân.
- Cư dân đang ở theo hợp đồng hiệu lực đăng ký phương tiện, chọn bãi xe Admin đã tạo trong Property thuộc hợp đồng, rồi xem slot vật lý còn trống, đã bật/cấu hình và phù hợp với xe trong bãi đã chọn. Danh sách vẫn hiển thị slot trống khi hợp đồng đã hết sức chứa; khi cư dân gửi yêu cầu, backend kiểm tra sức chứa và từ chối bằng lỗi `409` có số đã dùng/tối đa nếu đã đầy. Ngày bắt đầu tự lấy theo ngày gửi yêu cầu theo giờ Việt Nam; màn cư dân không yêu cầu nhập/chọn ngày. Contract/Room là ngữ cảnh xác nhận sức chứa, không phải cách tìm bãi; chỉ khi có nhiều hợp đồng hợp lệ trong cùng Property mới cần chọn hợp đồng áp dụng, không cần chọn số phòng riêng. Backend lấy Resident/Owner/Room từ phiên đăng nhập và quan hệ cư trú/hợp đồng đã xác minh; ID contract, vehicle, slot phía client chỉ là lựa chọn và phải được kiểm tra thuộc đúng Resident/Property.
- Yêu cầu `pending` giữ một slot và chiếm một đơn vị sức chứa hợp đồng tối đa 24 giờ. Mỗi cư dân chỉ có một yêu cầu chờ duyệt cùng lúc. Hết hạn, cư dân hủy, Admin từ chối, hoặc hợp đồng hết hiệu lực/kết thúc thì slot/sức chứa được trả lại; lịch sử yêu cầu vẫn được lưu. Không có thanh toán ở bước đăng ký.
- Admin duyệt hoặc từ chối yêu cầu; từ chối cần ghi lý do. Duyệt tạo đúng một Parking assignment gắn với entitlement đã lưu trên yêu cầu, sau khi kiểm tra lại hợp đồng, cư trú, sức chứa, slot, phương tiện và cấu hình. Không tự duyệt, không mua đứt slot trong luồng này.
- Màn hình cư dân bắt đầu bằng danh sách bãi xe trong Property hợp đồng, sau đó chỉ hiển thị slot còn trống thuộc bãi đang chọn; không dùng số phòng để tìm slot. Vị trí được chỉ dẫn bằng tên bãi, ghi chú vị trí và mã slot; bản đồ tọa độ/vẽ mặt bằng chưa thuộc V1.13. Giá trả phí hiển thị là giá hiện hành tham khảo; Billing vẫn chọn giá theo `period_start`, bắt đầu giữa kỳ tính từ kỳ kế tiếp và không prorate. FREE không tạo Invoice Item.

## 15. Khiếu nại / sự cố

- Cư dân có thể gửi khiếu nại/sự cố gắn với người gửi và khu trọ/phòng liên quan. “Báo cáo nhà trọ” là một category/type của Complaint, không phải entity hoặc luồng dữ liệu riêng.
- Luồng trạng thái chính: `Chờ xử lý → Đang xử lý → Đã giải quyết`. Có thể từ chối hoặc mở lại khi phù hợp và phải lưu lý do/lịch sử.
- Bản ghi lưu loại/category, nội dung, mức độ ưu tiên, trạng thái, người gửi, khu trọ/phòng, thời điểm tạo/cập nhật/giải quyết, lịch sử trạng thái/xử lý và dữ liệu phục vụ SLA.
- Trong V1, Chủ trọ/Admin trực tiếp tiếp nhận và xử lý Complaint thuộc khu trọ của mình. V1 chưa có role nhân sự như CSKH, quản lý vận hành hoặc nhân viên kỹ thuật và không yêu cầu workflow phân công/chuyển người phụ trách giữa các nhân viên.
- Complaint đã giải quyết vẫn được giữ trong lịch sử. Cư dân xem lại được complaint do mình gửi; chủ trọ/Admin xem lại được complaint trong phạm vi quản lý.
- Chủ trọ/Admin chỉ tiếp nhận và xử lý khiếu nại thuộc khu trọ trong phạm vi quản lý; cư dân chỉ xem yêu cầu do mình gửi.
- Có dữ liệu thời gian phục vụ theo dõi SLA. Mục tiêu thời gian SLA cụ thể cần được chốt trước khi dùng để đánh giá vận hành.
- Cư dân gửi báo cáo về khu trọ/phòng bằng cách tạo một Complaint có category phù hợp, ví dụ `Báo cáo nhà trọ`. Complaint được chủ trọ/Admin của khu trọ đó tiếp nhận và xử lý trong trang khiếu nại.
- Không tạo hoặc duy trì entity/nguồn dữ liệu `report` riêng cho cùng nghiệp vụ; một sự kiện chỉ tạo một Complaint.

## 16. Cài đặt và hồ sơ cá nhân

- Người dùng có thể cập nhật hồ sơ cá nhân trong phạm vi trường thông tin được phép. Resident có thể tự cập nhật avatar; ảnh được lưu ngoài PostgreSQL, database chỉ lưu `residents.avatar_storage_key` là khóa tham chiếu tương đối. Không lưu binary ảnh, đường dẫn máy tuyệt đối hoặc URL gắn với một môi trường.
- Người dùng có thể đổi mật khẩu qua hệ thống xác thực an toàn.
- Có thể cấu hình tùy chọn thông báo trong ứng dụng nếu sản phẩm cần; cài đặt không đồng nghĩa thông báo đã được gửi.
- Không có gói SaaS Cơ bản/Nâng cao/Chuyên nghiệp trong V1. Giao diện chọn gói demo cũ không phải nghiệp vụ sản phẩm.

## 17. Foxi

- Foxi được định hướng là trợ lý AI thật trong tương lai.
- Foxi không thuộc phạm vi V1.
- V1 không được xem luật/từ khóa, câu trả lời dựng sẵn hoặc dữ liệu mẫu trong demo là năng lực AI sản phẩm.
- Ngoại lệ thử nghiệm local do người dùng yêu cầu ngày 2026-10-28: mascot Cloudy gọi Qwen3 1.7B qua Ollama trong development. Sau khi khách xác nhận điều kiện, chỉ đọc tin phòng công khai qua API hiện có; không sinh SQL, truy cập dữ liệu riêng, đặt phòng hoặc tự nới điều kiện. Chỉ lọc giá, diện tích, sức chứa, khu vực công khai và tiện ích có cấu trúc do chủ trọ xác nhận; không suy đoán tiện ích từ mô tả. Lọc mới bỏ điều kiện cũ; Lọc tiếp giữ bộ lọc đã xác nhận, từ “thêm” tiện ích sẽ cộng vào tiện ích cũ, còn “đổi” tiện ích sẽ thay thế. Cả hai chế độ đều hỏi xác nhận trước truy vấn. Nếu Cloudy không hiểu một từ/cụm từ hoặc điều kiện, phải trích phần chưa rõ khi có thể, đưa câu hỏi làm rõ cụ thể (ví dụ hỏi ngân sách tối đa với “rẻ”), nói rõ giới hạn dữ liệu (ví dụ chưa lọc khoảng cách tới trường/nơi làm việc) và chờ khách cập nhật; không tự đoán, không tạo bộ lọc và chưa tiếp tục truy vấn. Ngữ cảnh chỉ nằm trong phiên chat. Đây chưa phải mở phạm vi AI sản phẩm V1. Xem [báo cáo tích hợp](07_modules/public-marketplace/CLOUDY_LOCAL_AI_INTEGRATION_REPORT.md).
- Bổ sung local ngày 2026-10-28: khi Admin đăng nhập, chính khung Cloudy chuyển sang tư vấn công nợ/điện nước, không dùng luồng tìm 300 phòng. Bộ thử 100 phòng/160 hóa đơn chỉ gắn với account 1 / Owner 1 đã xác minh; Admin khác không được xem bộ này. Luồng câu hỏi → AI đề xuất tác vụ → chủ trọ chọn kỳ/phòng và xác nhận → server đọc JSON đúng scope. Chỉ đọc, luôn ghi nhãn giả lập, không ghi nhận thanh toán hay gửi nhắc tiền; chưa phải dữ liệu tài chính production.

## 18. Chức năng không thuộc V1

- Booking lịch xem phòng.
- Các gói SaaS và thu phí thuê bao.
- Foxi AI và hội thoại AI thật.
- OCR/AI thật để đọc hợp đồng, CCCD hoặc ảnh đồng hồ điện/nước.
- Camera/AI nhận diện biển số.
- Email và push notification nói chung; ngoại lệ hẹp cho liên kết tài khoản Owner trong luồng Superadmin mới được quyết định ở §5, chưa triển khai.
- Các tích hợp nâng cao chưa được duyệt, ngoài các hướng đã xác định cho thanh toán và gửi hóa đơn qua Zalo OA.
- Hoàn tiền/refund tự động hoặc qua provider trong V1.
- Role CSKH, quản lý vận hành, nhân viên kỹ thuật và các role nhân sự khác; workflow phân công/chuyển người phụ trách Complaint và lịch sử assignment (định hướng V2).
- Mô hình căn hộ đã bán/owner-occupied và API/schema dành cho mô hình này thuộc V2, không thuộc V1.2.
- Hành vi mô phỏng, dữ liệu mẫu hoặc nút chỉ hiện toast thay cho nghiệp vụ thật.

## 19. Yêu cầu dữ liệu

- PostgreSQL là nguồn dữ liệu sản phẩm chính thức cho dữ liệu tài khoản, chủ trọ, khu trọ, phòng, cư dân, hợp đồng, hóa đơn, giao dịch, log gửi hóa đơn Zalo OA, đăng ký tiện ích/bãi xe, lịch sử giá tiện ích theo chu kỳ, phương tiện, khiếu nại, lịch sử trạng thái/xử lý và dữ liệu phục vụ báo cáo thống kê. Báo cáo nhà trọ được lưu như Complaint theo category, không có nguồn dữ liệu report riêng.
- Dữ liệu nghiệp vụ phải được lưu ở backend và truy cập qua các luồng được xác thực/phân quyền.
- `localStorage`, `sessionStorage` và JSON demo không được dùng làm persistence production. Frontend có thể giữ trạng thái giao diện tạm thời nhưng không làm nguồn sự thật nghiệp vụ.
- Dữ liệu demo chỉ dùng trong môi trường phát triển/demo và phải tách khỏi dữ liệu production.
- Ràng buộc toàn vẹn quan trọng phải được đảm bảo ở backend/database, bao gồm phạm vi chủ trọ, liên kết hồ sơ, sức chứa, hóa đơn trùng kỳ và slot đỗ xe.

## 20. Yêu cầu bảo mật

- Băm mật khẩu; không ghi log hoặc trả mật khẩu plaintext.
- Xác thực và authorization ở backend cho từng thao tác đọc/ghi/xuất.
- Cô lập dữ liệu theo chủ trọ; cư dân chỉ truy cập hồ sơ thuê của chính mình.
- Không tin role, ID bản ghi, chủ trọ hoặc khu trọ do frontend cung cấp khi chưa đối chiếu với session đã xác thực.
- Validate dữ liệu đầu vào ở backend; xử lý an toàn các giá trị tiền, ngày tháng, CCCD, trạng thái và tệp tải lên.
- Kiểm soát truy cập hồ sơ cư dân, CCCD, hợp đồng, hóa đơn và giao dịch; chỉ thu thập/lưu dữ liệu cần cho nghiệp vụ.
- Các thao tác nhạy cảm như khóa tài khoản, reset mật khẩu, thanh lý hợp đồng và cập nhật giao dịch phải có quyền phù hợp và dấu vết kiểm tra cần thiết. Với Contract, durable audit bắt đầu tại activation; các thay đổi chính thức sau đó phải lưu actor, thời điểm, loại thay đổi, before/after và reason khi quy tắc yêu cầu. Chỉnh sửa draft được lưu như trạng thái hiện tại nhưng không thuộc official audit history.

## 21. Acceptance Criteria cấp cao

### 21.1 Vai trò và phạm vi dữ liệu

- Admin trong V1 là chủ trọ, có thể quản lý nhiều khu trọ của mình. Superadmin là vai trò nền tảng được đặc tả riêng nhưng chưa triển khai; không được dùng quyền Superadmin để bỏ qua Owner scope của Admin.
- Chủ trọ/Admin A có thể quản lý nhiều khu trọ của A nhưng mọi thao tác đọc/ghi vào dữ liệu chủ trọ B đều bị backend từ chối.
- Sửa URL hoặc mã bản ghi ở trình duyệt không giúp chủ trọ A truy cập dữ liệu chủ trọ B.
- Cư dân chỉ xem hồ sơ, hợp đồng, hóa đơn, giao dịch và yêu cầu gắn với tài khoản/hồ sơ thuê đã liên kết của mình.

### 21.2 Tìm phòng và liên hệ

- Khách có thể tìm/lọc và xem thông tin phòng đang công khai.
- Gửi yêu cầu liên hệ tạo bản ghi backend gắn đúng chủ trọ/khu trọ để chủ trọ tiếp nhận.
- Luồng V1 không tạo booking lịch xem.

### 21.3 Khu trọ, phòng và cư dân

- Khu trọ/phòng không thể được tạo hoặc sửa bởi chủ trọ không sở hữu/phụ trách theo phân quyền.
- Không thể thêm cư dân nếu CCCD sai/trùng theo quy tắc hoặc sức chứa bị vượt.
- `residence_status` luôn khớp Occupancy `active`: thêm lượt đầu đặt `living`; kết thúc lượt cuối đặt `left`; kết thúc một lượt khi còn lượt active khác giữ `living`; transfer thành công giữ `living`. Tạo Resident mới mặc định `left`; client không thể set status khi create/PATCH. Transfer phải atomic để lỗi phòng đích không làm sai Occupancy hay trạng thái cư trú.
- `rooms.default_capacity` là sức chứa mặc định; Contract lưu snapshot điều khoản trong `resident_capacity`. Active Contract có thể amendment capacity bằng lý do, `If-Match`, revision/history và phải giữ giới hạn trên số Occupancy/parking đang active cùng yêu cầu Parking pending chưa hết hạn. Thay đổi capacity mặc định của Room không làm thay đổi hợp đồng cũ; không dùng `occupantCount` legacy làm nguồn có thẩm quyền.
- Xóa hồ sơ/khu trọ có liên kết nghiệp vụ phải bị chặn hoặc tuân theo chính sách lưu trữ, không làm mất lịch sử cần thiết.

### 21.4 Hợp đồng và hóa đơn

- Mỗi hợp đồng có đúng một cư dân đại diện/người đứng tên được tham chiếu rõ ràng.
- Nhiều cư dân có thể đang ở cùng phòng nếu tổng số người không vượt sức chứa; cư dân ở cùng phòng không tự động trở thành người đứng tên/đồng đứng tên hợp đồng.
- Hợp đồng có liên kết đúng phòng và cư dân đại diện; backend ngăn hợp đồng hiệu lực xung đột theo quy tắc thuê.
- Contract mới và successor do renewal tạo ở `status=draft`, `revision=0`; tạo/chỉnh draft không tạo durable audit history và không tăng revision. Draft PATCH chỉ nhận allowlist: `contract_no`, `representative_resident_id`, `start_date`, `end_date`, `rent_amount`, `deposit_amount`, `resident_capacity`, `initial_electric_kwh`, `initial_water_m3`; vẫn phải validate kiểu dữ liệu, Room/Owner/Resident, ngày và capacity.
- `contract_no` có thể sửa trong draft, bắt buộc khi tạo theo API contract hiện tại, và không thể sửa sau activation. Không chấp nhận material PATCH chung với Contract `expired` hoặc `terminated` nếu chưa có correction workflow được duyệt.
- Activation là audit point chính thức đầu tiên: Contract chuyển `draft → active`, revision `0 → 1`, và lưu activation history trong cùng transaction. Event `activation` có `before_data={"status":"draft"}` và `after_data` là full official baseline gồm `contract_no`, `room_id`, `representative_resident_id`, `previous_contract_id` nếu có, `start_date`, `end_date`, `rent_amount`, `deposit_amount`, `resident_capacity`, `initial_electric_kwh`, `initial_water_m3`, `status`; không kèm PII cư dân không liên quan.
- Material PATCH trên Contract `active` chỉ dùng allowlist đã nêu trừ `contract_no`; bắt buộc `change_reason` tối đa 1000 ký tự, tăng revision N→N+1 và append before/after changed-fields-only history atomically. Draft PATCH không cần `change_reason` vì audit, không tăng revision và không ghi history.
- Renewal giữ nguyên predecessor và revision của nó; successor có `previous_contract_id` do backend gán, bắt đầu `draft/revision=0`, không có history cho tới activation. Khi activate, successor bắt đầu revision 1 với event `activation` và baseline riêng.
- Termination chỉ áp dụng cho official Contract, tăng revision N→N+1 và append `status_transition` history trong transaction. `termination_reason` là business reason; không yêu cầu `change_reason` riêng. Vẫn chặn khi còn hóa đơn chưa thanh toán và giữ validation chỉ số, settlement, cùng xử lý vòng đời liên quan.
- Contract code search trim input, case-insensitive partial match, Owner-scoped, và kết hợp được với status/property/room filters cùng pagination.
- Contract business date là `Asia/Ho_Chi_Minh`: đến hết `end_date` vẫn active; ngày kế tiếp persisted status chuyển `active → expired`, một lần duy nhất với revision/history. `terminated` không chuyển sang `expired`.
- Termination date không vượt ngày hiện tại tại `Asia/Ho_Chi_Minh`. Sau khi kết thúc Occupancy liên kết, mỗi Resident được tính lại `residence_status` từ toàn bộ Occupancy active trong cùng transaction.
- Successor là meter continuity mới: không nhận chỉ số final/closing hay Invoice của predecessor. Admin phải nhập initial reading mới cho từng utility trên draft successor; thiếu một utility thì không activate.
- Active capacity amendment yêu cầu `change_reason` và `If-Match`, tăng revision/history nếu thay đổi thực; không thể giảm dưới active Occupancy, active parking assignments và pending Parking holds chưa hết hạn; không thay đổi Room default.
- Các Contract command create, activate, renew và terminate có durable server-side replay theo namespace Owner + Account + operation + key + payload; payload khác với key đã dùng trả `409 IDEMPOTENCY_KEY_REUSED`. Cách ly cross-Owner phải được runtime kiểm thử. Cách ly giữa nhiều Admin Account cùng Owner là N/A trong V1 do invariant mỗi Owner có đúng một Admin Account; nếu multi-admin được phê duyệt trong tương lai, test này trở thành release gate. Runtime lưu digest SHA-256 của key, fingerprint có version và response thành công được mã hóa AES-256-GCM trong cùng transaction với mutation. Upload tài liệu vẫn chỉ xác thực header; durable replay cho object storage chưa được triển khai. Thực hiện theo report runtime Contract; không thay đổi business rule này theo trạng thái triển khai.
- Admin chỉ đọc audit history trong Owner scope qua history endpoint. Resident không có history endpoint và không được xem `change_reason`, before/after hoặc actor context; Resident có thể thấy revision hiện tại nếu thuộc representation chung.
- PATCH active, renewal và termination dùng `If-Match: "<revision>"`; stale official revision trả `409 CONTRACT_REVISION_CONFLICT` và không thay đổi Contract/history. Activation lock/reload draft thay vì dùng revision 0 làm token; draft PATCH không dùng revision-based `If-Match`.
- Tìm theo `contract_no` là case-insensitive, partial match, được trim và kết hợp với các bộ lọc/phân trang hiện có trong phạm vi Owner.
- Ngày nghiệp vụ Contract dùng `Asia/Ho_Chi_Minh`: hết `end_date` mới chuyển `active → expired`; transition được đồng bộ từ backend, atomic/idempotent, tăng revision và chỉ ghi một history event. Không tự tái kích hoạt hoặc chuyển `terminated` sang `expired`.
- Termination không chấp nhận ngày tương lai theo ngày hiện tại tại `Asia/Ho_Chi_Minh`; sau khi kết thúc Occupancy phải tính lại `residence_status` từ mọi Occupancy active trong cùng transaction.
- Renewal successor không lấy bất kỳ reading nào từ predecessor; mỗi utility cần initial reading được Admin nhập trên chính draft successor. Activation bị chặn nếu thiếu reading.
- Idempotency replay phải được lưu bền vững, cách ly theo Owner/account và operation; cùng key/payload replay kết quả thành công, khác payload conflict. Runtime hỗ trợ Contract create, activate, renew và terminate trên baseline Database V1.6 (bảng replay được thêm từ V1.5); upload và các domain khác cần triển khai riêng trước khi được coi là replay-safe.
- Đối với dữ liệu V1.2 khi nâng cấp lên V1.3: draft được đặt revision 0; non-draft được đặt revision 1. Không tạo lịch sử giả. Revision của dữ liệu đã migrate là baseline, nên non-draft revision 1 có thể chưa có history row tương ứng.
- Không thể thanh lý khi còn công nợ chưa được xử lý theo quy tắc nghiệp vụ.
- Backend không tạo hai hóa đơn cho cùng hợp đồng/kỳ, kể cả khi hai yêu cầu đến đồng thời.
- Kỳ hóa đơn tính từ `contracts.start_date`, giữ original anchor, clamp ngày 29/30/31 về cuối tháng khi cần và không drift tích lũy.
- Kỳ cuối kết thúc tại ngày sớm hơn giữa mốc kỳ thông thường và ngày kết thúc hợp đồng; tiền thuê không prorate, điện/nước và dịch vụ usage-based tính đến ngày kết thúc thực tế, dịch vụ fixed-per-period thu đủ kỳ.
- Tại `period_end`, hệ thống chỉ gửi reminder chốt dữ liệu; ngày tiếp theo scheduler bảo đảm tạo một draft duy nhất. Reminder không tạo final invoice, không gửi Zalo và không mở payment.
- Draft tiếp tục tồn tại khi dữ liệu chưa đủ; amount/total có thể provisional và amount bằng 0 không được xem là completeness. Chỉ finalize sau khi backend xác minh đủ dữ liệu và tính lại khoản tiền.
- Finalize đặt `finalized_at`, hạn `due_date` bằng ngày finalize ở `Asia/Ho_Chi_Minh` cộng 5 ngày lịch và chuyển invoice sang `unpaid` nguyên tử. Zalo chỉ enqueue sau commit và payment chỉ mở sau finalize.
- Overdue được suy ra khi `status=unpaid` và ngày hiện tại ở `Asia/Ho_Chi_Minh` lớn hơn `due_date`; không lưu status overdue.
- Draft có thể chỉnh trong phạm vi cho phép. Sửa material financial fields sau finalize cần controlled amendment, tính lại, tăng revision và tạo Zalo log mới; PATCH tùy ý không được phép. Invoice paid không được sửa trực tiếp financial amounts.
- Cư dân chỉ thấy hóa đơn thuộc hồ sơ thuê của mình.
- Electricity dùng official multi-tier tariff theo kWh; Water dùng một per-m³ rate. Mỗi utility có Property-scoped version/effective date/source-reference, được chọn theo period_start và cố định cho toàn kỳ. Thay đổi giữa kỳ áp dụng từ kỳ sau; old mid-period split rule is SUPERSEDED. Không cần intermediate reading để đổi tariff.
- Beginning meter reading được resolve riêng theo Contract: Invoice đầu tiên dùng initial reading của chính Contract; các kỳ sau dùng ending reading của finalized Invoice gần nhất thuộc cùng Contract. Không kế thừa qua predecessor/successor Contract hoặc Room history; thiếu/không hợp lệ thì giữ draft và chặn finalize.
- Fixed Service thuộc Property, charge theo Room; trong V1 dịch vụ đã bật áp dụng cho tất cả Room đủ điều kiện. Price version chọn tại period_start và giữ cả kỳ, giá mới áp dụng kỳ sau, không prorate vì đổi giá.
- Flexible Paid Service chỉ tạo phí từ billable event hợp lệ; price version được backend chọn theo `occurred_at`, không theo Invoice `period_start`; không có automatic refund hoặc rewrite Invoice sau khi billed/finalized. Facility (kể cả Pool/Gym) không mặc định là paid subscription.
- Finalized Invoice giữ immutable item snapshot gồm category, historical label, quantity/unit, unit price, amount, source/version và applicable period/calc version khi cần. Electricity phải giải thích được từng tier đã áp dụng; không tạo lines theo mid-period tariff segments.
- Với Invoice V1.7 được finalize, `invoice_items` là financial detail authority; aggregate buckets và total là compatibility snapshots suy ra trong cùng finalize transaction. Total phải bằng tổng item amount đã làm tròn; Electricity tier quantity/amount phải reconcile với parent item. V1.6 finalized aggregate Invoice được giữ nguyên, không tạo breakdown giả và trả `itemization_available=false`; V1.7 finalized Invoice trả `ITEMIZED`.
- Meter readings giữ tối đa 3 chữ số thập phân; usage không làm tròn sớm. Electricity làm tròn từng tier amount, Water làm tròn amount cuối của từng line, Flexible/Parking làm tròn từng line đến VND nguyên theo half-up. Phép tính dùng decimal-safe arithmetic; không cộng raw amounts rồi làm tròn total riêng.
- Flexible service charge dùng price version có hiệu lực tại `occurred_at` (`effective_from <= occurred_at`, lấy version đủ điều kiện mới nhất); backend chọn giá, không nhận giá authoritative từ client.
- Parking quản lý area/slot/vehicle/card/entitlement/assignment/capacity. Hỗ trợ paid slot, free slot, motorcycle/apartment vehicle card và entitlement tương lai; không mặc định mọi assignment có phí. Free entitlement không tạo Invoice Item; assignment legacy chưa phân loại không tự suy diễn billability. Paid Parking dùng một Property pricing authority. Chỉ charge recurring nếu assignment và paid entitlement active, có price version hợp lệ và eligible tại `period_start`; bắt đầu sau mốc đó thì charge từ kỳ kế tiếp. Không prorate; phí kích hoạt một lần phải là item riêng nếu được duyệt.
- Contract không có override tariff/service/Parking price; rent tiếp tục lấy từ Contract và được ghi trên Invoice.
- Khi hợp đồng hết hiệu lực, slot/entitlement Parking gắn với Contract kết thúc và history được giữ; Paid Service chỉ tính theo charge hợp lệ và rule hiệu lực của chính dịch vụ.

### 21.5 Thanh toán và thông báo

- Thanh toán thật trong V1 chỉ dùng MoMo/ZaloPay; transaction thật lưu provider, mã giao dịch/tham chiếu từ provider, trạng thái, số tiền, thời điểm tạo/thanh toán và lỗi provider nếu có.
- **APPROVED (2026-10-27 — demo presentation only):** Môi trường demo có thể hiển thị QR minh họa không thể quét và ghi một transaction provider=`demo`, tách rõ khỏi MoMo/ZaloPay. Resident có thể chọn kết quả mô phỏng thành công hoặc thất bại (lý do mặc định: không đủ số dư); thành công đánh dấu Invoice đã thanh toán và tạo mã/thời điểm giao dịch demo, thất bại giữ Invoice unpaid. API demo bị tắt ở production; không gọi ngân hàng/ví, không chuyển tiền và không giả mạo callback provider. Admin nhận notification in-app về Invoice demo đã thanh toán.
- V1 từ chối thanh toán một phần và không có trạng thái `partial_paid`.
- Chỉ transaction thành công với số tiền đủ bằng số tiền còn phải trả mới làm hóa đơn chuyển sang đã thanh toán.
- Mỗi lần thử thanh toán được ghi thành transaction riêng; thử lại sau giao dịch lỗi không ghi đè lịch sử cũ.
- V1 chỉ xử lý thu tiền hóa đơn qua MoMo/ZaloPay; không có workflow refund/hoàn tiền qua provider. Các rule retry và thanh toán đủ hóa đơn vẫn áp dụng.
- Hai lần thất bại liên tiếp trong cùng phiên thanh toán kết thúc phiên hiện tại và đưa người dùng về màn hình chính/trang chủ; hóa đơn giữ trạng thái chưa thanh toán.
- Người dùng có thể mở lại hóa đơn và bắt đầu phiên mới; giới hạn hai lần không áp dụng tổng cộng cho vòng đời hóa đơn và không khóa hóa đơn.
- Giao dịch lỗi/đang xử lý không làm hóa đơn chuyển sang đã thanh toán; callback lặp lại không tạo giao dịch thành công trùng.
- Payment session/attempt chỉ được tạo cho invoice `unpaid` đã finalized; draft, paid và chưa finalized bị từ chối. Callback phải xác minh/idempotent và kiểm tra lại trạng thái trong transaction.
- Nếu hóa đơn đã gửi được cập nhật hợp lệ, hệ thống gửi lại phiên bản hiện hành; log các lần gửi trước và sau vẫn được giữ và phân biệt.
- Thông báo ngoài hóa đơn hiển thị trong ứng dụng; V1 không cần email/push.
- Resident có thể gửi phản hồi theo hồ sơ lưu trú hiện hành; phản hồi được lưu thành Complaint category, giữ lịch sử khởi tạo và tạo notification in-app cho Admin cùng Owner. Đây là kênh tiếp nhận phản hồi, không tự tạo thêm workflow phân công.
- Khi Resident gửi yêu cầu chỗ đỗ xe, Admin nhận notification in-app loại Parking để mở hàng đợi duyệt; thông báo có thể lọc theo loại và trạng thái đã đọc/chưa đọc.

### 21.6 Tiện ích và bãi xe

- Facility, kể cả Pool/Gym, không mặc định là paid service/subscription; rule Pool/Gym 30 ngày/720 giờ cũ đã **SUPERSEDED / REPLACED**.
- Fixed Service định kỳ được cấu hình ở Property và tính theo Room; trong V1 áp dụng cho tất cả Room đủ điều kiện; giá có version/effective date, không override theo Contract và lịch sử không bị ghi đè.
- Flexible Paid Service không có charging mode mặc định; có thể one-time, per-use, quantity-based, booking-based hoặc recurring theo yêu cầu dịch vụ. Chỉ billable charge hợp lệ được đưa vào Invoice; không biến Góc Trọ thành POS.
- Fixed Service dùng price version có hiệu lực tại `period_start` cho trọn kỳ; giá mới chỉ áp dụng từ kỳ kế tiếp và không prorate chỉ vì đổi giá. Trong V1 không có applicability exception theo Room.
- Parking quản lý entitlement/area/slot/vehicle/card/assignment/Resident/Room/Contract/capacity và trạng thái active. Free entitlement không tạo Invoice Item; paid entitlement lấy giá từ duy nhất Property pricing authority dùng chung với Billing. Legacy unclassified không tự coi paid/free.
- Supported Parking charge basis đã chốt: theo slot, vehicle/card hoặc billing period; chỉ recurring entitlement đã active và billable, có giá hợp lệ tại `period_start`, mới charge trọn kỳ. Bắt đầu giữa kỳ tính từ kỳ kế; không prorate.
- Mọi Price History là append-only. Không update đè hoặc xóa version đã dùng làm mất audit. Finalized Invoice giữ snapshot riêng và không lookup giá/tên hiện tại; sửa sai dùng controlled correction/superseding version hoặc approved amendment.
- Một cư dân có thể có nhiều phương tiện, mỗi phương tiện được quản lý riêng; số phương tiện không làm tăng giới hạn slot của phòng.
- Số slot xe đang hoạt động của một phòng không vượt sức chứa/số người được khai báo trên hợp đồng đang hiệu lực áp dụng cho phòng đó; việc kiểm tra được thực hiện ở backend.
- V1 không cho phép override giới hạn slot và backend kiểm tra giới hạn trước khi cấp slot.
- Mỗi đăng ký slot lưu phòng, cư dân/phương tiện liên quan, slot, ngày bắt đầu đăng ký/sử dụng, trạng thái và ngày kết thúc/thu hồi nếu có.
- Không thể cấp một slot đỗ xe cho hai phương tiện cùng thời điểm, kể cả khi có yêu cầu đồng thời.
- Khi giảm sức chứa hợp đồng, backend kiểm tra các slot hiện có và chặn áp dụng giới hạn mới nếu số slot đang hoạt động vượt mức, cho đến khi người có quyền chủ động xử lý xung đột; không âm thầm xóa đăng ký bãi xe.

### Lịch sử business decision Billing/Pricing

- **SUPERSEDED:** Rule cũ bắt buộc Pool/Gym là paid subscription theo chu kỳ 30 ngày/720 giờ, tự tiếp tục/hủy cuối kỳ và áp giá mới từ cycle kế được giữ để tra cứu lịch sử, nhưng không còn là current rule sau khi tách Facility và Flexible Paid Service.
- **SUPERSEDED (2026-10-13):** Rule cũ yêu cầu utility tariff đổi giữa kỳ phải split theo intermediate meter readings và có thể tạo nhiều tariff segment trong một Invoice. Thay bằng đúng một tariff version cho mỗi utility/billing period, chọn tại `period_start`, giữ nguyên cả kỳ; giá mới chỉ áp dụng kỳ sau, không chia usage theo ngày/tỷ lệ và không cần intermediate reading chỉ vì tariff đổi.
- **APPROVED (2026-10-13):** Mỗi billing period dùng một tariff version theo period_start. Electricity là progressive multi-tier theo kWh; Water là một rate theo m³. Meter continuity được phân tách theo Contract: Invoice đầu dùng initial reading của Contract; kỳ sau dùng Invoice finalized gần nhất của chính Contract; không kế thừa qua Contract predecessor/successor hoặc Room.
- **APPROVED (2026-10-13):** Fixed Service per Room dùng price version tại period_start, giữ cả kỳ; giá mới áp dụng kỳ tiếp theo, không prorate vì đổi giá. Flexible Paid Service không tự refund/rewrite billed Invoice. Facility không đồng nghĩa paid subscription.
- **APPROVED (2026-10-13):** Parking entitlement gồm paid/free slot, vehicle card và loại tương lai; pricing do một Property authority; supported charge basis có thể slot, vehicle/card hoặc billing period. Legacy unclassified không tự suy diễn billability. Paid recurring Parking charge trọn kỳ khi eligible tại `period_start`; bắt đầu sau đó charge từ kỳ kế tiếp, không prorate.
- **APPROVED:** Property-scoped utility/service/Parking pricing boundary as specified above; append-only Price History; immutable Invoice item snapshot with electricity tier detail; no Contract price overrides; Rent remains Contract-sourced.
- **APPROVED (2026-10-13):** Flexible Service price theo `occurred_at`; deterministic half-up VND rounding với decimal-safe arithmetic; Fixed Service áp dụng mọi Room đủ điều kiện trong Property ở V1; Water provider/locality chỉ là audit metadata; V1.7 `invoice_items` là authority và Invoice aggregates là compatibility snapshots; legacy V1.6 invoices không được bịa itemization.
### 21.7 Khiếu nại và CT01

- Báo cáo nhà trọ được tạo và xử lý như một Complaint category, ví dụ `Báo cáo nhà trọ`.
- Một sự kiện báo cáo không tạo đồng thời một bản ghi report riêng và một Complaint khác.
- Trong V1, Chủ trọ/Admin trực tiếp tiếp nhận và xử lý Complaint trong phạm vi khu trọ của mình; không yêu cầu phân công giữa nhiều role nhân sự.
- Complaint đi qua các trạng thái chính đã quy định và lưu lịch sử trạng thái/xử lý.
- Complaint đã giải quyết vẫn xem lại được: cư dân xem complaint của mình, chủ trọ/Admin xem complaint trong phạm vi quản lý.

- Chủ trọ chọn một khu trọ; CT01 lọc cư dân chưa hoàn tất đăng ký tạm trú/tạm vắng từ toàn bộ phòng trong khu đó, chỉ lấy dữ liệu chủ trọ có quyền quản lý và cho rà soát trước khi xuất/in.
- Mẫu CT01 chính thức phải được xác minh trước production.

### 21.8 Tài khoản và persistence

- Reset mật khẩu yêu cầu xác minh an toàn; mật khẩu không thể đọc lại từ database/log.
- Sau khi đăng xuất/đăng nhập trên thiết bị khác, dữ liệu nghiệp vụ vẫn nhất quán do lấy từ backend/PostgreSQL, không phụ thuộc dữ liệu local của trình duyệt.

## Các quyết định thay đổi so với Requirement cũ

| Chức năng | Requirement/demo cũ | Requirement V1 mới | Lý do |
|---|---|---|---|
| Vai trò chủ trọ | Tên vai trò Admin có thể bị hiểu là quản trị viên toàn nền tảng | Chủ trọ = Admin của chính chủ trọ đó; không có super admin trong V1 | Chốt phạm vi quyền quản trị và tenant |
| Mục đích tài liệu | Kiểm kê chi tiết những gì source demo đang làm | Đặc tả những gì sản phẩm V1 phải làm | Tách trạng thái demo khỏi cam kết sản phẩm |
| Lưu trữ | Dữ liệu chủ yếu nằm ở localStorage/sessionStorage; một phần dùng JSON demo | PostgreSQL/backend là nguồn dữ liệu chính thức | Cần dữ liệu bền vững, dùng chung và phân quyền |
| Nhiều chủ trọ | Demo không cô lập dữ liệu thật giữa chủ trọ | Mỗi chủ trọ quản lý nhiều khu trọ của mình và bị cô lập với chủ trọ khác | Phạm vi multi-tenant đã được chốt trong Scope |
| Tìm phòng | CTA “đặt lịch” thực tế chỉ cuộn trang; có form demo | Chỉ tìm, xem phòng và gửi yêu cầu liên hệ; không booking lịch xem | Scope xác nhận chỉ nhận thông tin liên hệ |
| Đăng nhập/tài khoản | Role và mật khẩu được xử lý ở frontend; reset có thể chỉ hiện chuỗi mẫu | Backend xác thực/phân quyền, session an toàn, mật khẩu băm và reset có xác minh | Hành vi demo không đáp ứng an toàn sản phẩm |
| Cư dân/lưu trú | Validation và liên kết dựa trên dữ liệu trình duyệt | Backend xác nhận CCCD, sức chứa, quan hệ tài khoản/hồ sơ và phạm vi dữ liệu | Bảo vệ tính toàn vẹn dữ liệu |
| CT01 | Demo xuất tài liệu từ dữ liệu có thể thiếu, chưa xác nhận pháp lý | Chủ trọ chọn khu trọ, lọc toàn bộ cư dân chưa hoàn tất đăng ký tạm trú/tạm vắng trong khu, rà soát trước khi xuất; mẫu chính thức cần xác minh | Hỗ trợ lập danh sách cấp khu trọ và giữ đúng phạm vi truy cập |
| Hợp đồng/OCR | Luồng quét điền dữ liệu mẫu và giả lập AI | Quản lý hợp đồng thật thuộc V1; OCR/AI không bắt buộc | Scope không duyệt OCR trong V1 |
| Người đứng tên hợp đồng | Requirement cũ có thể gắn hợp đồng với nhiều cư dân | Mỗi hợp đồng có đúng một cư dân đại diện; các cư dân ở cùng phòng được quản lý riêng | Phân biệt người ký hợp đồng với danh sách người cư trú |
| Hóa đơn/thanh toán | Nút có thể chỉ đổi trạng thái hóa đơn | Lưu transaction riêng; hỗ trợ MoMo/ZaloPay; tối đa hai lần thất bại mỗi phiên; phiên mới có thể bắt đầu sau đó; chỉ thanh toán đủ hóa đơn | Chốt provider V1, retry theo phiên và không partial payment |
| Zalo/thông báo | Nút Zalo chỉ hiện toast; cài đặt thông báo chưa gửi | Gửi hóa đơn qua Zalo OA, lưu log từng lần và gửi lại phiên bản hiện hành sau cập nhật hợp lệ | Chốt khả năng truy vết và đồng bộ nội dung hóa đơn |
| Tiện ích | Đăng ký và lịch có thể ghi vào các danh sách riêng, trạng thái không nhất quán | Quyết định Pool/Gym subscription 30 ngày trước đây nay **SUPERSEDED** bởi Facility vs Paid Service; Fixed Service tính theo Room, Flexible Paid Service theo billable event và mọi khoản giá dùng Property pricing authority | Chốt Facility/Paid Service boundary, Fixed/Flexible billing, giá theo Property; thay thế rule cycle cũ |
| Billing pricing history/snapshot | Giá hiện hành hoặc aggregate có thể không giải thích được lịch sử | Một tariff version per utility per billing period theo period_start; Electricity multi-tier; Water single per-m³ rate; Invoice opening reading theo Contract: initial reading ở kỳ đầu, Invoice finalized gần nhất cùng Contract ở kỳ sau; append-only versions; immutable Invoice item snapshot với tier detail; Contract không override | Chốt period-start price selection, tiered electricity, flat water, same-Contract meter continuity, history và snapshot; field/schema/API cụ thể được thiết kế riêng |
| Parking pricing boundary | Parking có thể bị coi như tiện ích chung hoặc chứa nguồn giá riêng | Parking sở hữu entitlement/assignment; Billing/Pricing sở hữu amount theo một Property pricing authority; miễn phí không tạo charge | Tách rõ “what is assigned” và “how much it costs”, tránh duplicate pricing source |
| Bãi xe | Có thể hiển thị như một tiện ích thông thường | Nhiều phương tiện mỗi cư dân; giới hạn slot theo sức chứa hợp đồng đang hiệu lực, không override; kết thúc theo hợp đồng | Chốt giới hạn theo phòng và vòng đời slot thuê |
| Khiếu nại/báo cáo | Trạng thái đơn giản, thiếu lịch sử; báo cáo có thể nằm local | Báo cáo nhà trọ là Complaint category; Chủ trọ/Admin trực tiếp xử lý và giữ lịch sử Complaint đã giải quyết | Hợp nhất loại báo cáo và xác định role xử lý V1 |
| Thanh toán và refund | Demo có thể chỉ đổi trạng thái hóa đơn và không ghi transaction | Chỉ transaction thành công đủ số dư mới trả hóa đơn; mọi lần thử riêng, callback idempotent; MoMo/ZaloPay thu tiền, refund ngoài V1 | Chốt thanh toán đủ hóa đơn và loại refund khỏi V1 |
| Nhân sự và assignment Complaint | Có thể hiểu Chủ trọ/Admin như role toàn nền tảng hoặc có người phụ trách thay đổi | Chủ trọ/Admin trực tiếp xử lý trong V1; role nhân sự và assignment chuyển V2 | Chốt phạm vi role và workflow V1 |
| Gói dịch vụ | Có giao diện chọn gói nhưng không thu phí | Không thuộc V1 | Scope xác nhận chỉ là demo |
| Foxi | Trả lời theo từ khóa/dữ liệu mẫu nhưng có thể được trình bày như AI | Không thuộc V1; AI thật để phiên bản sau | Scope định hướng AI thật nhưng chưa cần ở V1 |

## Các mục để phiên bản sau

- Booking lịch xem phòng.
- Gói SaaS và thanh toán thuê bao.
- Foxi AI thật.
- OCR/AI đọc hợp đồng, CCCD hoặc đồng hồ điện/nước.
- Camera và nhận diện biển số tự động.
- Gửi email hoặc push notification.
- Các tích hợp ngoài khác chưa được duyệt.
- Refund/hoàn tiền tự động hoặc qua provider.
- Role CSKH, quản lý vận hành, nhân viên kỹ thuật và các role khác.
- Workflow phân công/chuyển người phụ trách Complaint và lịch sử assignment theo nhân sự.

## Các điểm còn chưa xác định

Các quyết định phạm vi cấp cao đã được ghi trong `GOCTRO_FUNCTION_SCOPE.md`. Trước khi triển khai production, cần chốt các chi tiết vận hành/kỹ thuật chưa có trong Scope:

- Các quyết định sau đã được chốt và không còn là mục chưa xác định: capacity snapshot; billing anchor `contracts.start_date`; clamp cuối tháng/no-drift; hành vi kỳ cuối và full rent; lifecycle draft/finalize; reminder và draft generation timing; due date +5 ngày lịch theo `Asia/Ho_Chi_Minh`; overdue derived; payment/Zalo chỉ sau finalize; revision/amendment có kiểm soát; paid invoice không sửa trực tiếp financial fields.
- Quy tắc giá điện nhiều bậc theo kWh, nước một đơn giá theo m³, chọn đúng một tariff version tại period_start cho toàn kỳ, giá đổi giữa kỳ chỉ áp dụng kỳ sau; old tariff split/intermediate-reading-for-boundary rule is superseded. Beginning reading được resolve trong phạm vi một Contract: kỳ đầu từ initial reading của Contract, kỳ sau từ Invoice finalized gần nhất cùng Contract. Cross-Contract/predecessor/Room inheritance bị cấm.
- Quy trình nạp/version và đối soát tariff điện chính thức còn cần thiết kế vận hành. Water provider/locality/source metadata chỉ phục vụ audit; không cần live integration V1. Rounding đã chốt: decimal-safe, Electricity từng tier, Water/Flexible/Parking từng line theo half-up, total bằng tổng item amount đã làm tròn.
- Fixed Service áp dụng cho tất cả Room đủ điều kiện trong Property ở V1; không có room-specific applicability table. Ngoại lệ theo Room là nhu cầu tương lai.
- Flexible service catalog/charge validation chi tiết và cancellation/refund details còn mở; không tự động refund hoặc rewrite Invoice đã billed/finalized. Flexible price date (`occurred_at`) đã chốt.
- Parking recurring charge bắt đầu từ kỳ kế tiếp nếu paid entitlement được active sau `period_start`; không prorate và không charge khi thiếu entitlement/price/eligibility. Future activation fee/proration policy cần business approval mới.
- Exact schema/API field names, DTOs và cách serialize tier detail, meter readings, Invoice items/price references là chi tiết kỹ thuật cần design, không phải business rule chưa chốt.
- Chi tiết kỹ thuật callback/đối soát MoMo và ZaloPay có thể được chốt ở giai đoạn triển khai; provider V1 và các trường transaction tối thiểu đã được chốt.
- Cấu hình tài khoản Zalo OA, mẫu tin, chính sách gửi lại khi lần gửi thất bại và quy tắc người nhận (đại diện hợp đồng hay toàn bộ cư dân đủ điều kiện); gửi chỉ sau finalize và log theo revision đã được chốt.
- Thời hạn SLA cụ thể và cách áp dụng các mức ưu tiên khiếu nại.
- Phiên bản/mẫu CT01 chính thức và quy trình pháp lý áp dụng tại thời điểm triển khai.
- Provider/retention/backup và vận hành object storage, nếu chưa được quyết định.


## Bổ sung được duyệt 2026-10-28 — Cloudy cho Resident

- Chỉ tài khoản Resident đã đăng nhập được dùng trợ lý đăng ký dịch vụ và gửi ảnh chỉ số. Backend kiểm tra phiên/quyền cho mọi thao tác; không nhận Owner/Resident từ client hoặc AI.
- Đặt lịch dùng danh mục, suất trống, giá và luồng BOOKING hiện hành; khách xem lại và xác nhận gửi, chủ trọ duyệt theo quy tắc đã có. Gói SUBSCRIPTION vẫn chỉ hiển thị cho tới khi có quyết định lifecycle riêng.
- Khi khách nói chung chung muốn thêm tiện ích/dịch vụ, Cloudy hỏi họ muốn xem/đặt tiện ích hiện có hay đề nghị chủ trọ bổ sung thiết bị cho phòng. Xem/đặt dẫn đến danh mục và lịch BOOKING; đề nghị bổ sung dẫn đến yêu cầu của phòng đang ở và chờ chủ trọ duyệt. Thiết bị chỉ cập nhật sau khi chủ trọ xác nhận đã bổ sung.
- Khách chọn hóa đơn nháp thuộc hợp đồng và Occupancy đang ở, loại điện/nước, gửi ảnh và xác nhận chỉ số đọc được. Nếu có nhiều phòng/kỳ hợp lệ, khách chọn rõ trong danh sách được backend cấp; không suy đoán phòng bằng nội dung chat. OCR chỉ gợi ý; ảnh mờ/không rõ cho phép khách nhập số từ ảnh.
- Khi khách hỏi hóa đơn thuộc địa điểm/phòng nào, Cloudy trả lời bằng danh sách hóa đơn nháp hợp lệ của Occupancy hiện tại, hỏi khách xác nhận/chọn đúng phòng và kỳ. Chat không tự chọn hóa đơn hoặc gửi chỉ số.
- Nếu Cloudy không hiểu rõ câu hỏi hoặc không chắc ý định, phải nói chưa hiểu và hỏi khách diễn đạt rõ hơn; không đoán hoặc tự chuyển sang một tác vụ bất kỳ.
- Yêu cầu chỉ số lưu ảnh, giá trị, người gửi, hợp đồng/phòng/kỳ và trạng thái PENDING. Mỗi hóa đơn/utility có tối đa một yêu cầu đang chờ. Chưa duyệt không sửa chỉ số hoặc số tiền.
- Chỉ chủ trọ đúng phạm vi được xem ảnh, duyệt hoặc từ chối. Duyệt nguyên tử kiểm tra lại Occupancy/Contract, hóa đơn còn nháp, meter continuity cùng Contract và chỉ số không nhỏ hơn chỉ số đầu kỳ. Nếu chỉ số nháp đã thay đổi từ lúc gửi, chặn duyệt để chủ trọ xử lý xung đột. Duyệt lưu chỉ số vào đúng Invoice draft và lịch sử quyết định, không finalize, thu tiền hoặc gửi Zalo. Từ chối chỉ ghi quyết định. Lặp lại cùng quyết định không ghi lần hai; quyết định ngược sau xử lý bị chặn.


### Thử nghiệm local Cloudy Chủ trọ — yêu cầu người thuê (2026-10-28)

Trong bộ 100 phòng giả lập, thêm danh sách yêu cầu tiện ích/khiếu nại theo tài khoản chủ trọ, tháng gửi, phòng, loại và trạng thái. Chủ trọ tự chọn thao tác và xác nhận kèm lý do; AI chỉ hướng tới danh sách. Trạng thái/lịch sử chỉ mô phỏng trong bộ nhớ máy chủ, mất khi khởi động lại, không tạo phí/thông báo/yêu cầu thật. Không thay quy tắc duyệt booking và Complaint production hiện có.


Cloudy Chủ trọ — điều chỉnh hội thoại local 2026-10-28: thay form chọn tác vụ/kỳ/phòng và checkbox bằng câu hỏi tự nhiên. Cloudy đề xuất tác vụ, hỏi bổ sung tháng/phòng chưa rõ, rồi diễn giải đầy đủ phạm vi với “Đúng, tra cứu” / “Chưa đúng, sửa lại”. Chưa bấm đúng thì không gửi truy vấn kết quả. Mọi thay đổi câu hỏi hủy đề xuất cũ; các quyết định xử lý yêu cầu vẫn xác nhận riêng kèm lý do. Dữ liệu vẫn giả lập; tháng tương đối dùng ngày mẫu hiển thị, không giả làm ngày thực tế.

## Bổ sung được duyệt 2026-10-28 — Yêu cầu thiết bị theo phòng

- Resident đã đăng nhập gửi khiếu nại/yêu cầu cho một Occupancy và Contract đang hoạt động của mình; phòng 301 trong chat chỉ là mô tả, không có quyền chọn phòng ngoài phạm vi. Nếu có nhiều phòng, phải chọn rõ.
- Tái sử dụng Complaint và Complaint History, không tạo entity khiếu nại song song. Yêu cầu thiết bị có mã trong danh sách tủ lạnh, máy lạnh, máy giặt, máy nước nóng, giường, tủ quần áo, bàn học/làm việc; nội dung tự do không được thực thi thành thao tác database. Danh sách thiết bị đã xác nhận được lưu riêng theo Room; không suy diễn dữ liệu cũ từ mô tả phòng.
- Gửi yêu cầu tạo pending, chưa thay đổi thiết bị. Admin cùng Owner có thể tiếp nhận (in_progress), từ chối (rejected) hoặc xác nhận đã giải quyết (resolved), luôn có ghi chú/lịch sử và notification cho khách.
- Với yêu cầu bổ sung thiết bị, nút xác nhận của chủ trọ có nghĩa thiết bị đã được bổ sung và hiện có trong phòng. Trong một transaction, backend kiểm tra lại Occupancy/Contract gốc, cập nhật danh sách thiết bị đúng Room và hoàn tất Complaint. Duyệt không đổi phòng khác, giá thuê, hợp đồng, hóa đơn hoặc tạo phí.
- Mỗi Room/mã thiết bị chỉ có một bản ghi hiện có; đây là danh sách có/không, không quản lý số lượng/serial/tài sản. Một yêu cầu pending/in_progress cho cùng thiết bị/phòng; gửi lại cùng request key và nội dung không tạo bản ghi mới. Duyệt lặp cùng kết quả không ghi lần hai, đổi quyết định sau hoàn tất bị chặn. Không tự xóa thiết bị khi từ chối.
- Khiếu nại tự do chỉ thay trạng thái và lịch sử, không tự sửa phòng. Luồng mở lại Complaint đã giải quyết ngoài phạm vi lần bổ sung này; không mở lại yêu cầu thiết bị để chạy lại cập nhật.


Cloudy Chủ trọ — thử database hiện tại (2026-10-28): theo yêu cầu người dùng, Cloudy trong app đọc dữ liệu thật qua API backend đã xác thực. Không cố định account/Owner mẫu, không fallback JSON khi API lỗi. Tra cứu hóa đơn theo tháng kết thúc kỳ; hiển thị kỳ thực tế, snapshot đã lưu và cảnh báo thiếu dữ liệu từ backend. Tra cứu yêu cầu chỉ dẫn sang màn quản lý hiện có để xác nhận xử lý thật, không chạy thao tác mô phỏng lên database. Bộ JSON/standalone vẫn dùng riêng cho kiểm thử. Không thay luật tiền điện nước hoặc quyền Owner.


Cloudy Chủ trọ — tiếp lời làm rõ phạm vi (2026-10-28): khi Cloudy hỏi tháng/phòng còn thiếu, người dùng có thể trả lời tự nhiên ngay trong ô chat; câu trả lời được áp dụng vào yêu cầu đang chờ thay vì bị phân loại thành phiên truy vấn mới. Khi đã có tóm tắt xác nhận, người dùng có thể sửa tháng/phòng bằng tin nhắn; phạm vi mới phải hiện lại để xác nhận, chưa đọc kết quả ngay. Nếu người dùng nêu một nhóm tác vụ khác, bắt đầu diễn giải ý định mới.

Cloudy Chủ trọ — tạo tiện ích miễn phí/có phí qua chat (2026-10-28): chủ trọ đã đăng nhập có thể chọn tạo Facility chung miễn phí hoặc Fixed Service có phí cho Property thuộc tài khoản. Facility chỉ thu thập Property, tên và vị trí; không có giá hay phát sinh khoản thu. Fixed Service thu thập Property, tên, đơn vị, VND nguyên và ngày hiệu lực; mã được sinh xác định từ tên và kiểm tra trùng trước khi tạo. Cloudy phải trình bày loại, phạm vi và chi phí cùng thông tin cần thiết rồi yêu cầu xác nhận riêng trước khi ghi dữ liệu. Dùng API §5.10 và session/CSRF hiện có; không gửi Owner ID và không tạo Flexible Service, booking hay charge qua chat. Nếu bước phát hành giá lỗi sau khi tạo Fixed Service, phải báo trạng thái một phần và không gửi lại yêu cầu tạo tự động.
