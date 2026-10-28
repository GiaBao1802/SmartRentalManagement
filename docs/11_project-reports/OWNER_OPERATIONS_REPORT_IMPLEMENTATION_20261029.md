# Báo cáo vận hành theo dữ liệu chủ trọ — 2026-10-29

**Trạng thái:** CURRENT IMPLEMENTATION; chờ kiểm tra trực tiếp trên trình duyệt đã đăng nhập.  
**Phạm vi:** API báo cáo tổng hợp, phân quyền Owner, giao diện `/admin/reports`; chỉ đọc các bảng hiện có.

## Nguồn đã kiểm tra

- `docs/01_REQUIREMENTS.md` — Admin xem thống kê trong phạm vi Owner; backend là lớp phân quyền.
- `docs/04_API_SPEC.md` §5.15 — hai đường dẫn dashboard đã có trong hợp đồng API.
- `database/schema.prisma` và `docs/DATABASE_CHANGELOG.md` — cấu trúc hiện hữu cho Property/Room, Resident/RoomResident/Contract, Invoice, ParkingSlotAssignment/Vehicle và Complaint.
- Các repository hiện hành cho occupancy, Invoice, parking và Complaint.

## Thay đổi

- Thêm `GET /api/v1/dashboard/summary` và `GET /api/v1/properties/{property_id}/dashboard` qua API hợp đồng hiện hành. Backend bắt buộc Admin, lấy `ownerId` từ session và áp dụng Owner/Property scope riêng cho từng phần tổng hợp. Property ngoài phạm vi trả generic 404.
- Báo cáo tổng hợp phòng đang ở/còn trống, hồ sơ lưu trú chưa hoàn tất/tạm trú/tạm vắng, hợp đồng sắp hết hạn, hóa đơn đã chốt chưa thanh toán/quá hạn, lượng điện/nước của hóa đơn đã chốt gần nhất, xe đang gắn với phòng, và khiếu nại theo loại/phòng.
- Bảng chi tiết hiển thị dữ liệu nghiệp vụ cần cho thao tác quản lý, không đưa tên/CCCD/điện thoại cư dân, biển số xe, nội dung khiếu nại, ID hóa đơn hoặc thông tin nhà cung cấp thanh toán ra báo cáo tổng hợp.
- Thêm trang responsive `/admin/reports`, lọc toàn bộ hoặc từng khu trọ, làm mới dữ liệu, thẻ chỉ số, bảng xếp hạng điện/nước/xe và bảng theo từng phòng.
- Bổ sung khu vực tài chính trên dashboard: tiền thuê đã lập hóa đơn, tiền thuê thuộc hóa đơn đã thanh toán, tiền thuê còn nợ và xu hướng 12 kỳ theo tháng; API Spec §5.15 định nghĩa rõ phạm vi và giới hạn dữ liệu. Requirement nghiệp vụ không đổi.

## Giới hạn và xác minh

- Không thêm/sửa bảng, schema, migration, seed, giá điện nước, hóa đơn, hợp đồng hay bản ghi cư dân trong lượt này. Báo cáo đọc dữ liệu hiện có và không ghi lại aggregate.
- Lượng điện/nước lấy từ Invoice đã chốt gần nhất mỗi Contract trong 180 ngày; không phải số đo realtime. `unpaid_amount` là tổng các hóa đơn đã chốt mang trạng thái chưa thanh toán.
- Tiền thuê được nhóm theo tháng của `Invoice.periodStart`; “đã thu” là thành phần tiền thuê trên Invoice hiện có trạng thái `paid`, không khẳng định tháng nhận tiền. Đây không phải báo cáo dòng tiền theo ngày thanh toán. Chưa có sổ chi phí vận hành nên không tính hoặc suy đoán lợi nhuận ròng.
- Bản mở rộng tài chính giữ phạm vi read-only, không thêm/sửa bảng, schema, migration, seed, giá điện nước, hóa đơn, hợp đồng hay bản ghi cư dân. Repository + route tests 4/4 pass; backend typecheck pass. Frontend typecheck pass; API/UI test suite 79/79 pass. `npm run build` pass cả Next frontend và TypeScript backend; route `/admin/reports` được build. Chưa review trực quan trong browser.
- `frontend/node_modules/next/dist/docs/` không tồn tại trong checkout. Đã đối chiếu hướng dẫn App Router chính thức về Server/Client Components và fetching; trang tương tác dùng Client Component gọi API backend có session, không truy cập DB/secret từ browser.

## File triển khai

- `backend/src/reports/owner-operations.repository.ts`
- `backend/src/reports/owner-operations.routes.ts`
- `backend/src/reports/owner-operations.repository.test.ts`
- `backend/src/reports/owner-operations.routes.test.ts`
- `frontend/src/app/admin/reports/page.tsx`
- `frontend/src/app/admin/reports/report.tsx`
- `frontend/src/lib/api/ownerReportApi.ts`
- `frontend/src/app/components/admin-navigation.ts`
- `frontend/src/app/globals.css`

