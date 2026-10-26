# Góc Trọ — Xử lý liên hệ trùng khi cấp tài khoản chủ trọ

**Trạng thái:** REFERENCE — quyết định thiết kế và kiểm kê chỉ đọc; chưa sửa dữ liệu hay chương trình  
**Ngày:** 2026-10-26  
**Phạm vi:** email và số điện thoại trong luồng Superadmin tạo Owner/lời mời/Admin Account.

## 1. Kết quả kiểm tra dữ liệu demo

Đã kết nối đúng PostgreSQL `Goctro_test3`, cổng 5432, phiên bản 18.6. Truy vấn chạy trong giao dịch `READ ONLY`; báo cáo chỉ ghi số lượng, không xuất địa chỉ email hoặc số điện thoại.

| Kiểm tra | Kết quả |
|---|---:|
| Owner / Account | 2 / 6 |
| Email rỗng nhưng khác NULL trong mỗi bảng | 0 / 0 |
| Nhóm email trùng giữa các Owner sau `lower(trim(...))` | 0 |
| Nhóm email trùng giữa các Account sau `lower(trim(...))` | 0 |
| Cặp email Owner–Account thuộc hai chủ thể khác nhau | 0 |
| Owner và Admin Account của chính Owner có email khác nhau | 0 |
| Nhóm số điện thoại trùng trong mỗi bảng sau khi bỏ dấu phân cách | 0 / 0 |
| Cặp số điện thoại Owner–Account thuộc hai chủ thể khác nhau | 0 |

Kết quả chỉ phản ánh thời điểm kiểm tra và dữ liệu demo hiện có; không chứng minh rằng thiết kế hiện tại tự chặn dữ liệu trùng về sau. Truy vấn số điện thoại này chỉ dùng phát hiện sơ bộ; quy tắc chính thức của dự án phải chuẩn hóa số Việt Nam về `+84XXXXXXXXX` trước khi so sánh.

## 2. Quy tắc áp dụng cho luồng mới

1. Email được bỏ khoảng trắng đầu/cuối và so sánh không phân biệt chữ hoa/thường. Không tự bỏ dấu chấm, phần sau dấu `+` hoặc sửa tên miền: đó có thể là địa chỉ khác. Email rỗng hoặc sai định dạng bị từ chối. Lưu cùng một dạng chuẩn để kiểm tra và cấp tài khoản.
2. Nếu email đã thuộc **Owner khác**, **Account khác** (kể cả Resident hoặc Superadmin), hoặc một lời mời Owner khác đang chờ, dừng tạo mới với `409 OWNER_IDENTITY_CONFLICT`. Cho người vận hành thấy hồ sơ liên quan ở mức đủ nhận biết và hướng tới hồ sơ hiện có; không tự gộp Owner, đổi email, chuyển tài khoản hoặc phát lời mời thứ hai.
3. Nếu Owner đã tồn tại và có Admin Account, dùng hồ sơ hiện có; không tạo Owner/Account mới. Nếu Owner chưa có Account nhưng còn lời mời, dùng thao tác gửi lại sau khi kiểm tra người nhận. Nếu hồ sơ cũ cần đổi địa chỉ liên hệ, xử lý như yêu cầu sửa hồ sơ có xác minh riêng trước khi phát lời mời; không tự chuyển liên kết sang email mới.
4. Số điện thoại nếu có phải chuẩn hóa bằng cùng quy tắc `+84XXXXXXXXX` đang dùng cho Account. Trùng số điện thoại chỉ là tín hiệu cần kiểm tra vì một số có thể được nhiều người dùng chung. Tạm dừng cấp mới, kiểm tra người nhận và hồ sơ liên quan; sau khi xác nhận là hai người khác nhau mới tiếp tục theo quy trình có ghi lý do. Không dùng số điện thoại một mình để gộp hồ sơ hoặc xác nhận quyền sở hữu email. Nếu định dùng số đó làm `accounts.phone`, vẫn phải tuân thủ ràng buộc duy nhất của Account.
5. Một người muốn quản lý nhiều Owner bằng cùng email hiện không thể biểu diễn bằng một Admin Account/Owner như thiết kế này. Dừng trường hợp đó để thiết kế quyền nhiều Owner riêng; không dùng email phụ hoặc hồ sơ giả để lách quy tắc.

## 3. Chốt chặn kỹ thuật trước khi mở chức năng

- Kiểm kê lại dữ liệu thật ngay trước migration, gồm Owner/Account và lời mời mới nếu đã có; kiểm tra email sau chuẩn hóa, số điện thoại sau chuẩn hóa và cặp email Owner–Admin Account. Nếu phát hiện trùng, ghi danh sách nội bộ đã che thông tin liên hệ và xử lý từng trường hợp với người có trách nhiệm. Không tự cập nhật hoặc xóa dữ liệu cũ.
- Sau khi dữ liệu sạch, thêm chốt chặn duy nhất cho email chuẩn hóa của `owners.contact_email`, `accounts.email` và email nhận lời mời Owner đang chờ. Vì email nằm ở nhiều bảng, **mọi đường tạo/sửa email liên quan**, kể cả cấp Account từ luồng khác, phải dùng cùng cơ chế giữ chỗ/khóa theo email chuẩn hóa và kiểm tra lại cả ba nguồn trong giao dịch. Nếu không đưa được mọi đường ghi vào cùng cơ chế, dùng bảng giữ chỗ email chung có ràng buộc duy nhất. Hai yêu cầu đồng thời cho cùng email phải có tối đa một yêu cầu thành công. Chỉ kiểm tra ở giao diện hoặc truy vấn trước khi lưu là chưa đủ. Không áp ràng buộc mới trực tiếp vào V1.8 đang khóa.
- Khi email Owner đổi, phải xác minh người nhận, cập nhật hoặc thu hồi lời mời cũ và giữ cho Owner liên hệ/Admin Account đồng nhất theo quy trình riêng; không sửa một bảng rồi để bảng kia mang email cũ.
- API trả mã lỗi rõ ràng cho trùng email, lời mời đang chờ và số điện thoại cần đối soát. Nhật ký chỉ ghi loại xung đột, ID nội bộ và kết quả; không ghi email/số điện thoại đầy đủ. Không tiết lộ hồ sơ người khác trong API công khai.

## 4. Kiểm chứng cần có khi triển khai

Kiểm tra cùng email khác chữ hoa/thường/khoảng trắng, email Resident Account, lời mời đang chờ, hai lệnh tạo đồng thời, một Owner đã có Admin Account, số điện thoại khác cách viết nhưng cùng số, và Owner đổi email giữa lúc lời mời còn hiệu lực. Kiểm tra trên bản sao database riêng trước khi nâng cấp; `Goctro_test3` chưa bị thay đổi trong lượt này.
