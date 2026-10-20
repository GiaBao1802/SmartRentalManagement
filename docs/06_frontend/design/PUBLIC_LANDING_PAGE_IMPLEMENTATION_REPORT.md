# Góc Trọ public landing page implementation

**Date:** 2026-10-20  
**Status:** CURRENT — SOURCE + AUTOMATED CHECKS PASS; BROWSER VISUAL REVIEW NOT VERIFIED

## Scope

Triển khai landing page giới thiệu Góc Trọ tại `/landing` bằng Next.js App Router, React, TypeScript và CSS Modules hiện có. Trang `/` tiếp tục là Public Explorer tìm phòng; không thay route, API hoặc tương tác bản đồ hiện hành.

Nguồn thiết kế đã đọc gồm toàn bộ chín board được đóng gói trong `Góc Trọ – Bộ nhận diện thương hiệu.html`, bao gồm board 09 Landing page. Implementation giữ logo **Ô cửa sáng**, Xanh Hiên, Mực Hiên, Vàng Đèn, nền Vôi, Be Vietnam Pro, JetBrains Mono và nguyên tắc dùng Vàng cho hành động chính. Nội dung AI/demo/giá/liên hệ chưa có căn cứ trong board tham khảo không được đưa vào sản phẩm.

## Kết quả

- Header có logo về `/`, anchor navigation, `/login` và CTA về Explorer `/`.
- Hero tập trung người tìm phòng, có visual minh họa rõ là không phải dữ liệu thật.
- Luồng nội dung mô tả đúng khả năng hiện hành: khám phá bản đồ, lọc/xem thông tin phòng, xem chi tiết và gửi liên hệ.
- Phần bổ trợ cho chủ nhà chỉ mô tả các workspace quản lý hiện có và giới hạn theo vai trò/dữ liệu được cấp quyền.
- Public Explorer có liên kết `Giới thiệu Góc Trọ` tới `/landing`.
- Animation hero dùng transform/opacity; section reveal dùng IntersectionObserver + Web Animations API. Nội dung vẫn hiển thị khi JavaScript không chạy. `prefers-reduced-motion` tắt animation và transition.
- Responsive CSS có breakpoint cho tablet, mobile 390px và overflow 320px; focus-visible và scroll-margin cho anchor được khai báo.

Không cài dependency, không tạo hệ thống token song song, không dùng iframe/3D cho landing, không đổi backend/API/database/Prisma/env/nghiệp vụ và không ghi `Goctro_test3`.

## Validation

| Kiểm tra | Kết quả |
|---|---|
| Frontend typecheck | PASS — `npm run typecheck` |
| Frontend API/UI/navigation tests | PASS — 76/76 (`npm run test:api`) |
| Production build | PASS — Next.js 16.4.0; `/landing` static; 20/20 static pages generated |
| `git diff --check` trong task scope | PASS |
| Route/link source verification | PASS — `/landing` → `/`, `/login`; Explorer → `/landing` dùng `next/link` |
| Browser desktop/mobile | NOT VERIFIED |
| Animation/reduced-motion/console/network/overflow quan sát trực tiếp | NOT VERIFIED |

Browser controller trả `ERR_CONNECTION_TIMED_OUT` với `localhost:3100`; địa chỉ network cũng timeout. HTTP loopback từ sandbox bị Windows từ chối socket, còn lượt kiểm tra ngoài sandbox không nhận được phản hồi từ server nằm trong sandbox. Vì vậy không có screenshot và không tuyên bố browser PASS.

## Files chính

- `frontend/src/app/landing/page.tsx`
- `frontend/src/app/landing/landing.module.css`
- `frontend/src/app/landing/reveal.tsx`
- `frontend/src/app/_property-explorer/explorer.tsx`
- `frontend/src/app/_property-explorer/explorer.css`

Task này thêm một bề mặt marketing/public mới nhưng không thay Active Module hoặc Exact Next Task của dự án.
