# Yêu cầu thiết bị và khiếu nại của Resident

Ngày: 2026-10-28. Trạng thái CURRENT — source/local database complete, browser review pending.

## Phạm vi

Theo yêu cầu người dùng, Resident đăng nhập mở Cloudy → Khiếu nại / yêu cầu → chọn phòng đang ở, loại thiết bị hoặc khiếu nại khác, nhập nội dung và xác nhận gửi. Qwen chỉ phân loại requests và điền nội dung; không tự chọn phòng/thiết bị hoặc ghi database. Chủ trọ dùng /admin/requests (sidebar Dịch vụ & Hỗ trợ); Admin Cloudy có liên kết tới yêu cầu thật, demo yêu cầu giả lập vẫn giữ nguyên.

Dùng Complaint/Complaint History có sẵn. Mã thiết bị: FRIDGE, AIR_CONDITIONER, WASHING_MACHINE, WATER_HEATER, BED, WARDROBE, DESK. Pending chưa đổi phòng. Tiếp nhận chuyển in_progress; từ chối rejected; xác nhận đã bổ sung ghi room_equipment và resolved trong cùng transaction. Với khiếu nại tự do, resolved chỉ ghi trạng thái/lịch sử. Mọi xử lý có lý do, audit và notification. Khách xem lịch sử riêng; Admin chỉ xem Owner scope. Thiết bị hiển thị trong yêu cầu, lựa chọn phòng của khách và cửa sổ chỉnh phòng của chủ trọ.

Chặn chọn Occupancy người khác, thông tin owner/resident tự gửi, duplicate request key khác nội dung, yêu cầu thiết bị đã có/đang chờ, duyệt sau chuyển phòng, đổi quyết định sau kết thúc. Duyệt đồng thời cùng yêu cầu chỉ thêm một thiết bị/lịch sử. Schema trigger kiểm tra complaint/occupancy và source complaint/equipment/room. Không đổi tiền thuê/hợp đồng/hóa đơn, không thu phí. Danh sách có/không, chưa quản lý số lượng/serial; không suy đoán thiết bị cũ từ mô tả.

## Database

V1.13 exact catalog verified before write. Backup .local/setup-backups/Goctro_dev_v18_pre_V1_14_1793170584944.dump verified with 520 entries and successful disposable restore. SHA-256 d27e2c77df7d62bd4b96334af74e1369ae31708fee3ef404b124de05ce19c382. Disposable upgrade and atomic live V1.13→V1.14 passed, 46 tables; fingerprints of all 44 old tables unchanged. No seed/reset/env/credential changes. Temporary DB removed. Baselines v1.13 and earlier untouched.

## Validation

- 10 tests PASS (including 8 HTTP/PostgreSQL workflow subtests): scope/role/CSRF, pending no mutation, retries, concurrent approval updates only fixture room 301, notifications/history, rejection, free-text resolution, stale occupancy rollback and DB scope trigger. Fixture room 301 exists only in disposable test DB; no live customer request was fabricated or approved.
- Final combined regression: 22/22 PASS including existing meter/service flows and Admin navigation. Qwen live “Phòng 301 muốn thêm tủ lạnh” returns requests; live anonymous /me/room-request-targets returns 401.
- Backend/frontend typecheck PASS. CORE 89/89 and booking 17/17 PASS on target with rollback.
- Browser/mobile/authenticated visual flow not verified; previous controller error remains recorded. No claim of visual PASS.
- No commit/push. Existing service booking/meter approval and other working-tree changes retained.

## Exact next task

Review authenticated UI: a Resident submits a real equipment request; Owner opens Yêu cầu & Khiếu nại and confirms only after equipment has actually been supplied; verify room equipment and both histories.
