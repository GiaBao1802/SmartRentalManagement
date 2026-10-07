# Phân tích dữ liệu nghiệp vụ Góc trọ

Tài liệu đầu vào cho thiết kế PostgreSQL. Đây là bước khảo sát; chưa tạo bảng, migration hay thay đổi dữ liệu ứng dụng.

## Nguồn đã rà soát

- `../legacy/index.html` và các script giao diện: state mẫu `GT`, luồng quản lý khu vực/phòng, khách thuê, hợp đồng, hóa đơn, tài khoản, tiện ích và khiếu nại.
- `app-fixes.js`, `role-user.js`, `settings-demo.js`: các luồng bổ sung, đặt tiện ích, báo sự cố và cài đặt.
- `../legacy/demo-database.json` và `../legacy/server.js`: API demo cho hồ sơ, gói, thông báo và dịch vụ.
- `Tom_tat_chinh_sua_Goc_tro.md`: mô tả quy tắc nghiệp vụ đã được thêm vào giao diện.

## Hiện trạng lưu trữ

- `GT.A`, `GT.T`, `GT.C`, `GT.I`, `GT.U`, `GT.UT`, `GT.RG`, `GT.B`, `GT.KN` được lưu chung ở `localStorage` với khóa `gt_data_v2`; đây là dữ liệu demo phía trình duyệt.
- Một số báo cáo từ màn hình cư dân dùng khóa localStorage riêng `gt_room_reports`, chưa đồng bộ với danh sách khiếu nại `GT.KN`.
- `demo-database.json` **không** chứa các khu vực, khách thuê, hợp đồng và hóa đơn. File này dùng cho hồ sơ tài khoản mẫu, gói, mật khẩu hash mẫu, tùy chọn thông báo và danh sách dịch vụ demo.
- Tiện ích có hai dạng dữ liệu: cấu hình dịch vụ trong `demo-database.json` (`name`, `area`, `price`, `unit`, giờ, `active`) và dữ liệu hiển thị/đặt chỗ trong state `GT.UT`/`GT.RG`.
- `GT.B` đang nhận hai cấu trúc khác nhau: yêu cầu đặt lịch xem phòng và đặt tiện ích của cư dân. Hai loại này cần tách riêng trong cơ sở dữ liệu.

## Vai trò và nhóm chức năng

- **Khách xem phòng:** tìm phòng trống theo từ khóa/tỉnh, xem thông tin phòng, gửi yêu cầu đặt lịch xem.
- **Chủ trọ/quản trị viên:** quản lý khu vực, khách thuê, tài khoản, hợp đồng, hóa đơn, tiện ích và khiếu nại.
- **Người thuê:** xem thông tin lưu trú, hóa đơn, tiện ích; đăng ký tiện ích và gửi phản ánh.

## Thực thể đề xuất

Các tên dưới đây là tên nghiệp vụ dễ hiểu, chưa phải schema cuối cùng.

| Thực thể | Dữ liệu quan sát được / đề xuất | Quan hệ chính |
|---|---|---|
| **UserAccount** | Mã tài khoản, vai trò (admin/tenant), tên đăng nhập hoặc thông tin đăng nhập, trạng thái hoạt động; dữ liệu mẫu còn có tên, điện thoại, email, phòng và mật khẩu | Tài khoản người thuê gắn với một Tenant; hồ sơ admin gắn với tài khoản admin |
| **Property / Building** (hiện gọi là khu vực) | Mã (`c`), tên (`n`), tỉnh/thành (`p`), tiền tố phòng (`pf`), địa chỉ (`ad`), số phòng (`r`), giá mặc định (`gia`), diện tích (`dt`), người quản lý (`mg`), trạng thái (`s`), ghi chú (`note`) | Một property có nhiều Room; có thể có nhiều Contract theo thời gian |
| **Room** | Hiện được sinh từ tiền tố và số phòng; số tầng suy ra theo quy tắc 10 phòng/tầng. Nên có số phòng, tầng, diện tích/giá ghi đè nếu cần, trạng thái vận hành | Thuộc một Property; có hợp đồng theo thời gian; tại một thời điểm chỉ có tối đa một hợp đồng thuê hiệu lực |
| **Tenant** | Họ tên, CCCD, điện thoại, email, trạng thái cư trú, trạng thái đăng ký; dữ liệu xe hiện là danh sách lồng gồm loại xe, biển số và slot | Có thể là người đứng tên nhiều Contract theo thời gian; gắn với tài khoản tùy chọn; có Vehicles và Complaints |
| **Vehicle** | Loại xe, biển số, slot/ghi chú gửi xe | Thuộc Tenant; hiện đang lồng trong `Tenant.xe` |
| **LeaseContract** | Mã hợp đồng (`no`), người thuê/CCCD, khu vực, phòng, ngày bắt đầu/kết thúc, cọc, giá thuê, số người, chỉ số điện/nước đầu kỳ và gần nhất, đã ký hay chưa, thông tin thanh lý | Thuộc Tenant và Room; có thể có nhiều Invoice; có lịch sử gia hạn/thanh lý |
| **ContractExtension** | Ngày gia hạn, ngày kết thúc mới, giá/cọc mới và thời điểm thay đổi | Thuộc LeaseContract; đề xuất để giữ lịch sử thay vì chỉ tăng `ext` và ghi đè hợp đồng |
| **Invoice** | Mã hóa đơn, hợp đồng, kỳ tháng, phòng, người thuê, tổng tiền, tiền điện/nước, hạn thanh toán, trạng thái | Thuộc LeaseContract; ràng buộc duy nhất theo hợp đồng và kỳ |
| **InvoiceMeterReading / InvoiceLine** | Chỉ số cũ/mới và lượng dùng điện/nước, đơn giá; tiền thuê và các phí bổ sung như dịch vụ/rác | Thuộc Invoice; giao diện hiện tính tiền thuê + điện + nước + phí cố định, nhưng chỉ lưu một phần chi tiết |
| **Amenity** | Tên dịch vụ/tiện ích, khu vực hoặc vị trí, giá, đơn vị tính, giờ hoạt động, trạng thái, hướng dẫn, sức chứa/tài nguyên nếu có | Có nhiều AmenityBooking; cấu hình hiện bị chia giữa `demo-database.json` và `GT.UT` |
| **AmenityBooking** | Tiện ích, ngày, khung giờ, người thuê/phòng, ghi chú, trạng thái (chờ duyệt/đã duyệt/đã dùng/đã hủy) | Thuộc Amenity và người thuê; hiện biểu diễn bằng `GT.RG` hoặc một dạng của `GT.B` |
| **RoomViewingRequest** | Phòng quan tâm, tên người liên hệ, điện thoại, ngày/giờ mong muốn, ghi chú, thời điểm gửi và trạng thái xử lý | Có thể gắn với Room; người gửi chưa chắc đã có tài khoản/Tenant |
| **Complaint / MaintenanceReport** | Mã, người gửi, phòng, loại phản ánh, nội dung, mức ưu tiên, ngày gửi/cập nhật, trạng thái | Thường gắn với Tenant và Room; cần hợp nhất hai luồng `GT.KN` và `gt_room_reports` hoặc xác định rõ chúng khác nhau |
| **NotificationPreference** | Bật/tắt thông báo hóa đơn, quá hạn, hợp đồng, sự cố | Thuộc UserAccount; hiện ở `demo-database.json` hoặc state tùy người dùng |

## Quy tắc nghiệp vụ đã quan sát

1. CCCD người thuê phải gồm đúng 12 chữ số và không trùng.
2. Một phòng không được có hai người thuê chính cùng trạng thái đang ở; phòng đang có người bị loại khỏi danh sách chọn khi lập hợp đồng.
3. Mã phòng sinh từ tiền tố property; mỗi tầng có 10 phòng theo dữ liệu hiện tại. Cần quyết định đây là quy tắc cố định hay chỉ là giá trị khởi tạo để tạo Room.
4. Số phòng đang thuê và tỷ lệ lấp đầy được tính từ dữ liệu người thuê/phòng, không nên lưu thêm một con số tổng có thể lệch.
5. Không xóa Tenant hoặc Property đã có lịch sử hợp đồng.
6. Không chuyển Tenant sang “Đã rời đi” khi còn hợp đồng hiệu lực.
7. Không thanh lý hợp đồng khi còn hóa đơn chưa thanh toán.
8. Thanh lý ghi ngày, lý do, chỉ số điện/nước cuối, khoản khấu trừ và tiền cọc hoàn trả; người thuê chuyển sang đã rời đi.
9. Hóa đơn được tạo từ hợp đồng đã ký còn hiệu lực; mỗi hợp đồng/phòng chỉ có tối đa một hóa đơn mỗi kỳ.
10. Chỉ số đầu kỳ hóa đơn lấy từ chỉ số gần nhất của hợp đồng; khi tạo hóa đơn, chỉ số mới cập nhật lại hợp đồng.
11. Giá thuê, cọc và đơn giá cần được chụp lại tại thời điểm ký/lập hóa đơn để lịch sử không đổi khi cấu hình mặc định thay đổi.
12. Tài khoản người thuê chọn từ Tenant đang ở; tên, điện thoại và email đồng bộ hai chiều trong giao diện hiện tại. Khi người thuê rời đi, tài khoản bị khóa.

## Điểm cần chốt trước khi viết schema

1. **Nhiều người trong một phòng:** hợp đồng có `ppl` lớn hơn 1 nhưng dữ liệu chỉ lưu một Tenant đứng tên. Có cần lưu từng người cùng ở và CCCD của họ không?
2. **Tên “khu vực”:** mỗi bản ghi hiện giống một tòa/khu trọ có tỉnh, địa chỉ và danh sách phòng. Tên chuẩn trong hệ thống nên là Property, Building hay giữ Area?
3. **Phòng và hợp đồng:** có cho phép gia hạn bằng cách sửa hợp đồng cũ như demo, hay tạo bản ghi gia hạn/hợp đồng mới để giữ lịch sử?
4. **Thanh toán:** hiện hóa đơn chỉ có trạng thái đã/chưa thanh toán. Có cần thanh toán một phần, nhiều lần thu, biên nhận hoặc phương thức thanh toán không?
5. **Điện/nước và phí:** xác nhận đơn giá, ngày chốt chỉ số, phí cố định, cách xử lý phòng trống và các phí khác.
6. **Hai loại yêu cầu:** chốt quy trình/trạng thái riêng cho đặt lịch xem phòng và đặt tiện ích.
7. **Phản ánh:** xác định báo sự cố từ cư dân có chung luồng với khiếu nại admin hay cần hai loại nghiệp vụ.
8. **Quản lý người dùng:** chốt một chủ trọ hay nhiều admin; một Tenant có thể có nhiều tài khoản hay chỉ một.
9. **Lưu ảnh:** hợp đồng/CCCD hiện có thể nằm trong dữ liệu trình duyệt dạng ảnh. Cần chọn kho lưu file riêng và chỉ lưu đường dẫn/metadata trong PostgreSQL.
10. **Thông tin địa chỉ:** tỉnh/thành hiện là text; quyết định có cần chuẩn hóa danh mục địa lý hay giữ chuỗi địa chỉ.

## Giả định dùng trong bản schema đầu tiên

Đây là các lựa chọn để có thể chuẩn bị schema; chúng chưa thay thế xác nhận nghiệp vụ của chủ dự án.

- Dùng tên `Property` cho bản ghi hiện gọi là khu vực/tòa; mỗi phòng được lưu thành một `Room` thực. Quy tắc tiền tố và 10 phòng/tầng chỉ dùng lúc chuyển dữ liệu mẫu để sinh các phòng ban đầu.
- Trạng thái phòng chỉ lưu tình trạng vận hành (`READY`, `MAINTENANCE`, `UNAVAILABLE`). Còn trống/đang thuê được suy ra từ hợp đồng, tránh hai nguồn trạng thái lệch nhau.
- Một `LeaseContract` có một Tenant đứng tên và có thể có thêm `ContractOccupant`; chưa yêu cầu tạo hồ sơ Tenant đầy đủ cho từng người ở cùng.
- Gia hạn và thanh lý lưu thành lịch sử riêng; không ghi đè mất dữ liệu hợp đồng cũ. Hạn hợp đồng được dùng để suy ra “sắp hết hạn/hết hạn”; trạng thái kết thúc được lưu riêng.
- Hóa đơn có các dòng chi tiết, chỉ số điện/nước và có thể nhận nhiều Payment. Trạng thái hóa đơn vẫn được lưu, nên API phải cập nhật trạng thái cùng giao dịch ghi nhận thanh toán.
- Hai luồng phản ánh được gom về một `MaintenanceRequest`, có trường nguồn để phân biệt portal cư dân, admin và khách công khai.
- UserAccount tách khỏi Tenant; một Tenant có tối đa một tài khoản. Thông tin cư dân lưu ở Tenant, hồ sơ admin ở account.
- Giá tiền lưu số nguyên VND; diện tích và chỉ số đồng hồ dùng Decimal. File hợp đồng/CCCD lưu ở kho file ngoài, PostgreSQL chỉ giữ khóa lưu trữ và tên file.
- Các bảng có quan hệ lịch sử dùng `Restrict` để tránh xóa dây chuyền. Chỉ các liên kết phụ không làm mất dữ liệu nghiệp vụ mới cho phép `SetNull`.

Prisma DSL không mô tả được unique index có điều kiện cho hợp đồng đang mở. Migration SQL đầu tiên đã thêm partial unique index PostgreSQL cho `room_id` và `tenant_id` với trạng thái `PENDING_SIGNATURE` hoặc `ACTIVE`, cùng các check dữ liệu cơ bản. API vẫn cần kiểm tra rồi ghi hợp đồng trong transaction.

Migration ban đầu đã bổ sung partial unique index cho cả phòng và người thuê đang có hợp đồng `PENDING_SIGNATURE`/`ACTIVE`, CCCD 12 chữ số, ngày hợp đồng hợp lệ, số tiền/chỉ số không âm và tháng hóa đơn từ 1 đến 12. Seed demo upsert các bản ghi mẫu nghiệp vụ và không xóa dữ liệu khác. Seed không tạo tài khoản đăng nhập vì mật khẩu mẫu ở HTML không phù hợp để đưa vào PostgreSQL.

Migration SQL và seed script chỉ mới được tạo tại local. Chưa áp dụng migration hoặc chạy seed do máy chưa có Docker/PostgreSQL.

## Quy mô dữ liệu mẫu quan sát được

- 5 Property/Building, 5 Tenant, 4 Contract, 3 Invoice, 5 tài khoản, 6 tiện ích hiển thị, 3 đăng ký tiện ích và 5 khiếu nại mẫu.
- `demo-database.json` có 4 dịch vụ cấu hình, một hồ sơ admin, gói dịch vụ và 4 tùy chọn thông báo.

Đây là số bản ghi trong dữ liệu khởi tạo HTML/JSON, không phải dữ liệu production. Một số ngày được tạo tương đối theo ngày chạy demo.
