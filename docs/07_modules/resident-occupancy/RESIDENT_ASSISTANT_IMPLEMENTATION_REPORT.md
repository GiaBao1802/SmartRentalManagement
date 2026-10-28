# Resident Cloudy — dịch vụ và ảnh chỉ số

Ngày: 2026-10-28. Trạng thái: CURRENT — implementation và database local hoàn tất; authenticated browser review chưa xác minh.

## Phạm vi và sử dụng

Nguồn: AGENTS.md, DOCUMENTATION_RULES, Current State, Catalog, Requirement §§10/13 và bổ sung được duyệt 2026-10-28, API Invoice/Resident Services, baseline V1.8–V1.13, code auth/services/invoices/Cloudy.

- Đăng nhập Resident, bấm Cloudy: chat Qwen3 1.7B phân loại ý định hoặc chọn trực tiếp Đặt tiện ích/Gửi chỉ số điện nước. Anonymous/Admin không có công cụ Resident; backend xác thực từng request và kiểm tra role/CSRF.
- Đặt tiện ích dùng catalog/availability/booking API thật đã có; khách chọn dịch vụ/ngày/giờ, xem giá rồi xác nhận gửi PENDING. Admin duyệt qua queue dịch vụ hiện có. SUBSCRIPTION tháng/năm chưa có enrollment, giao diện nói rõ.
- Gửi chỉ số chọn Invoice draft của Occupancy/Contract đang ở; nếu nhiều phòng/kỳ thì chọn rõ. Ảnh JPG/PNG/WebP tối đa 5 MB, decode tối đa 20 triệu pixel, bỏ metadata và lưu JPEG chuẩn hóa trong PostgreSQL (không public URL). Tesseract.js chạy trên backend, cache model tại .local/meter-ocr; lần đầu tải language data. Chỉ gợi ý khi có đúng một số và confidence >=60; khách luôn đối chiếu, có thể nhập tay và xác nhận trước khi gửi.
- Chủ trọ vào Hóa đơn → Ảnh chỉ số khách gửi, xem ảnh và Invoice, duyệt/từ chối. Duyệt khóa Invoice rồi request, kiểm tra lại scope/Occupancy/draft/continuity/chỉ số giảm và chỉ số nháp đã bị người khác đổi. Ghi trạng thái/quyết định và chỉ số draft trong một transaction. Không finalize, thu tiền, đổi tổng tiền hoặc gửi Zalo.
- Pending unique theo Invoice/utility; gửi lại cùng ảnh/số/người trả request cũ. Quyết định lặp cùng chiều không cập nhật lại; ngược chiều bị chặn. Ảnh chỉ có chủ trọ đúng phạm vi hoặc người gửi được xem; private/no-store.

## Database và bằng chứng

Fresh read-only check: backend/.env → Goctro_dev_v18 localhost:5433 PostgreSQL 18.6, exact V1.8, chỉ có database này và postgres. Điều này supersedes các claim V1.12 local cũ cho target hiện tại; không suy luận nguyên nhân thay đổi.

Backup: .local/setup-backups/Goctro_dev_v18_pre_V1_13_1793169502557.dump; pg_restore --list: 466 entries; SHA-256 a8581cdd96f9dd0407c6d6840449f55c9c051b7fc28174fc1ed0bca535a205d9. Đã phục hồi thành công lên database tạm và chạy toàn bộ chuỗi canonical V1.8→V1.9→V1.10→V1.11→V1.12→V1.13, đối chiếu catalog sau mỗi bước. Sau đó chạy cùng chuỗi trong một transaction trên target. Catalog V1.13 PASS, 44 tables; count/content fingerprint cả 40 bảng cũ không đổi. Không seed/reset target, không thay credential hoặc env. Database tạm đã được xóa; backup còn giữ.

V1.13 thêm duy nhất resident_meter_submissions vào V1.12. Artifacts và migration nằm database/baselines/v1.13; raw SQL repository có composite FK nên không cần Prisma model mới. Tool state/inspect và setup update nhận biết V1.13; fresh setup cũ vẫn lên V1.12, chưa tự nâng V1.13 cho máy khác.

## Kiểm tra

- Backend/frontend TypeScript: PASS. Live backend /api/health/db trả ok; /api/v1/me/meter-targets chưa đăng nhập trả 401.
- 10 tests PASS: input/image/OCR candidate, HTTP auth/CSRF/role/revocation, service/booking route regression và database tạm kiểm tra wrong Owner/Resident, decrease, pending no mutation, duplicate submit, private image, concurrent approval, repeated/opposite decision, stale draft, rejection và finalized guard.
- V1.13 clean install + V1.12 upgrade rehearsal PASS. Core validator V1.13 89/89, booking validator 17/17 PASS trên local trong transaction rollback. Validator cũ 43-table được giữ nguyên; V1.13 copies thay expected count thành 44.
- Qwen live: “Tôi muốn đăng ký hồ bơi” → services; “Tôi muốn gửi ảnh chỉ số nước” → meter.
- Tesseract live trên ảnh số tổng hợp: 12345.678 → đúng 12345.678. Chưa đánh giá độ chính xác trên ảnh đồng hồ thực tế.
- Browser controller trả lỗi request-header policy, không có browser inventory. Không tuyên bố authenticated UI/mobile/end-to-end browser PASS.
- Không commit/push. Các thay đổi owner-advisor/public Cloudy đồng thời của task khác được giữ nguyên.

## Bước tiếp theo

Review một luồng thực tế bằng tài khoản Resident và Admin: đặt tiện ích, gửi ảnh đồng hồ thật, xem trạng thái chờ, chủ trọ duyệt, đối chiếu đúng Invoice draft; xác nhận anonymous/Admin không thấy công cụ Resident.
