# Tóm tắt các chỉnh sửa cho app "Góc trọ"

File kết quả: `Góc_trọ___Ứng_dụng_quản_lý.html`

## Lần 1: Thêm "Quản lý phòng"

Thêm trang mới vào menu quản lý gồm thống kê, sơ đồ phòng, tìm kiếm/lọc, danh sách, thêm/sửa/xóa. Sau đó bị thay bằng bản "Quản lý khu vực" ở lần 2.

## Lần 2: Đổi thành "Quản lý khu vực"

- Trang mới `#/quan-ly-khu-vuc`, thay hoàn toàn trang phòng.
- Có thống kê (tổng khu vực, tổng phòng, đang thuê, tỷ lệ lấp đầy), thẻ tổng quan có thanh lấp đầy, tìm kiếm/lọc theo tỉnh và trạng thái, danh sách, thêm/sửa/xóa.
- Có nút "Xem khách" để chuyển sang trang khách thuê.

## Lần 3: Liên kết Khu vực với Khách thuê

- **Form thêm/sửa khách thuê:** Tỉnh → Tòa nhà → Số phòng liên động theo dữ liệu khu vực. Phòng đã có người bị khóa.
- **Kiểm tra dữ liệu:** CCCD đúng 12 số và không trùng, một phòng không có hai người cùng ở.
- **Trang khách thuê:** bảng lấy dữ liệu thật, bộ lọc hoạt động (thêm lọc theo tòa nhà), sắp xếp, phân trang, ngăn chi tiết, danh sách xe.
- **Khu vực:** số phòng đang thuê tự tính từ khách thuê. Mỗi khu vực có tiền tố mã phòng và phòng tự sinh (10 phòng mỗi tầng).

## Lần 4: Liên kết toàn bộ các trang

- **Kho dữ liệu chung** cho khu vực, khách thuê, hợp đồng, hóa đơn, tài khoản.
- **Hợp đồng:** trang hoạt động đầy đủ, gồm danh sách, bộ lọc, chi tiết, gia hạn, thanh lý. Form tạo hợp đồng 4 bước: chọn khách, chọn phòng trống, điện nước đầu kỳ, ký.
- **Thanh lý:** tính tiền cọc hoàn trả, khách chuyển sang "Đã rời đi", phòng về trống, tài khoản khách bị khóa.
- **Hóa đơn:** chọn phòng từ các hợp đồng đã ký, tự lấy tên khách, giá thuê và chỉ số điện nước cũ. Mỗi phòng một hóa đơn mỗi kỳ.
- **Tài khoản người thuê:** chọn từ danh sách khách thuê đang ở, tên/SĐT/email tự điền và đồng bộ hai chiều.
- **Trang chủ:** mục "Phòng đang trống" lấy từ dữ liệu thật.
- **Khu vực:** thêm giá thuê mặc định và diện tích phòng.

## Các chặn để dữ liệu không lệch

- Không xóa khách thuê hoặc khu vực đã có hồ sơ hợp đồng.
- Không cho khách "Đã rời đi" khi còn hợp đồng hiệu lực.
- Còn hóa đơn chưa thu thì không thanh lý được hợp đồng.
- Đổi phòng hoặc CCCD thì dữ liệu liên quan đổi theo.

## Chưa làm

- Tiện ích, Tài khoản của tôi và màn hình đăng nhập vẫn dùng dữ liệu mẫu riêng.
- Dữ liệu lưu trong bộ nhớ trình duyệt, tải lại trang là về dữ liệu mẫu ban đầu.
