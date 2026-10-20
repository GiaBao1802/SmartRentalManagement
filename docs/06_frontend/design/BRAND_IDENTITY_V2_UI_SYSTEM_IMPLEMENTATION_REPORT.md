# Góc Trọ Brand Identity v2.0 — UI system implementation

- Ngày: 2026-10-20
- Phạm vi: frontend Auth, Admin shell và các module hiện hành, Resident portal, Public Explorer/list/detail/contact.
- Trạng thái: `CURRENT — SOURCE + AUTOMATED CHECKS PASS; BROWSER VISUAL REVIEW NOT VERIFIED`.
- Nguồn thiết kế: `D:\codexapp\Góc Trọ – Bộ nhận diện thương hiệu.html`.

## Quy tắc nhận diện đã xác định

File HTML được giải nén và đọc theo từng board bên trong; lớp loading bên ngoài không được dùng làm nguồn thiết kế. Board 04 xác định logo chính là **Ô cửa sáng**. Các hướng A–H ở board 07–08 chỉ là khám phá logo, không phải logo đã chọn.

- Xanh Hiên `#0E5A4F`: tiêu đề, liên kết, điều hướng và thao tác phụ.
- Mực Hiên `#0B2B2A`: chữ chính và nền sidebar/panel tối.
- Vàng Đèn `#FFB020`: hành động chính; chữ trên nút là Mực Hiên. Mỗi vùng thao tác ưu tiên một CTA vàng.
- Vôi `#F3F5F2`, Trắng `#FFFFFF`, Xi Măng `#D9DEDA`, Bê Tông `#5B6A66`: nền, surface, border và chữ phụ.
- Màu trạng thái giữ nghĩa nghiệp vụ: đã thu `#1E8E4E`, sắp đến hạn dùng vàng, quá hạn/lỗi `#C8372D`.
- Be Vietnam Pro dùng cho giao diện; JetBrains Mono dùng cho số tiền, mã và số liệu chính. Các font WOFF2 trong brand HTML được self-host cùng unicode range gốc; license được giữ trong assets.
- Giọng điệu UI áp dụng nguyên tắc Ấm, Chắc, Gọn; không thay đổi nội dung nghiệp vụ hoặc API contract.

## Implementation

- Thêm `BrandLogo` dùng đúng SVG Ô cửa sáng và wordmark dạng live text để hiển thị sắc nét, responsive và không kéo méo.
- Thay logo cũ trên Auth, Admin sidebar, Resident portal, Public Explorer và Public room detail; placeholder ảnh phòng dùng mark v2.0.
- Chuyển token dùng chung sang palette v2.0, giữ alias cũ để không phá các component hiện hành.
- Chuẩn hóa card, control, button, focus, surface và sidebar. CTA chính dùng Vàng Đèn + Mực; sidebar dùng Mực; nền ứng dụng dùng Vôi.
- Auth có panel Mực, họa tiết ô cửa, form 16px trên mobile, error/success semantic và focus vàng rõ ràng.
- Các giá trị tài chính, tổng hóa đơn, mã/số liệu quan trọng dùng JetBrains Mono và tabular numbers.
- Public 3D Explorer giữ nguyên cấu trúc, camera, bộ lọc và luồng API; chỉ thay nhận diện bao quanh và màu trạng thái bản đồ.
- Thêm reduced-motion override. Bảng vẫn cuộn trong vùng bảng, modal giữ giới hạn viewport và mobile Admin tiếp tục dùng navigation drawer hiện hành.

Không thay backend, database, Prisma, migration, env, API, quyền truy cập, tính tiền hoặc trạng thái tính năng. Không cài dependency mới. Không dùng mock thay dữ liệu thật và không ghi vào `Goctro_test3`.

## Validation

| Kiểm tra | Kết quả |
|---|---|
| Frontend typecheck | PASS — `npm run typecheck` |
| Frontend API/UI/navigation tests | PASS — 76/76 (`npm run test:api`) |
| Frontend production build | PASS — Next.js 16.4.0, 19/19 static pages generated |
| `git diff --check` trong frontend scope | PASS; chỉ có cảnh báo line-ending CRLF đã tồn tại trong working tree |
| Desktop 1440px | NOT VERIFIED — browser controller không truy cập được localhost |
| Tablet 768px | NOT VERIFIED — cùng giới hạn công cụ |
| Mobile 390px và overflow 320px | NOT VERIFIED — cùng giới hạn công cụ |

Browser tích hợp trả `ERR_CONNECTION_TIMED_OUT` với local server. Chrome/Edge headless cài trên host khởi chạy nhưng renderer không tạo screenshot trong môi trường này. Không có screenshot nào được giữ và không tuyên bố visual PASS. Production server trả build thành công; đây không được dùng thay bằng chứng thị giác.

## Files chính

- `frontend/src/app/brand-fonts.css`
- `frontend/src/app/components/brand-logo.tsx`
- `frontend/src/app/components/auth-layout.tsx`
- `frontend/src/app/components/auth-flow.module.css`
- `frontend/src/app/components/admin-shell.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/app/_property-explorer/explorer.css`
- `frontend/src/app/_property-explorer/vietnam-map.tsx`
- `frontend/src/app/tenant/tenant-portal.tsx`
- `frontend/src/app/rooms/[roomId]/public-room-detail.tsx`
- `frontend/public/assets/brand-v2/`

Task này thay thế nhận diện cam/xanh/kem cũ trong phạm vi presentation. Nó không thay đổi hoặc nâng trạng thái hoàn thành của Auth, Billing, Service, Parking, Contract, Resident hay Public Marketplace.
