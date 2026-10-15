# PROPERTY / ROOM FINAL E2E CLOSURE PASS

**Ngày:** 10/10/2026  
**Phạm vi:** Admin Property/Room V1 trên local/dev; không mở rộng sang domain khác.  
**Kết quả tổng:** Các browser smoke Property pagination, Room search và current Contract summary đều PASS. Property/Room Admin local/dev V1 đạt E2E DoD.

## 1. Scope và nguồn đã kiểm tra

- Đọc `docs/DOCUMENTATION_RULES.md` và report Property/Room hiện tại.
- Canonical Requirement: `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`, §6.
- Canonical API Spec: `GocTro-SmartBuilding/docs/04_API_SPEC.md`, §5.4.
- Đối chiếu Property/Room routes, repository, validation, UI, API helper và tests hiện có trong `SmartRentalManagement`.
- Database local hiện hữu: `Goctro_test3`; không chạy schema, migration hay seed.

## 2. Room search contract và thay đổi

- Requirement hiện nêu rõ: Admin tìm phòng theo mã phòng.
- API Spec thêm query `search`: partial, case-insensitive trên `room_code`, trim khoảng trắng, tối đa 200 ký tự; chỉ trong Owner từ session và Property trên route. Có thể kết hợp status/boolean filters và pagination; search rỗng tương đương list thường.
- Backend route validate/trim từ khóa; repository thêm `roomCode contains` với mode insensitive vào điều kiện query hiện hữu. Điều kiện Owner, Property, status, ordering và pagination được giữ nguyên.
- Room page có ô “Tìm theo mã phòng”, nút Tìm/Xóa tìm kiếm. Submit/clear đưa về trang 1; đổi status giữ keyword; tìm kiếm chỉ chạy khi submit và gửi tới API, không lọc dữ liệu trên trang hiện tại. Loading/error/empty state dùng luồng hiện có.
- Không đổi response shape, trạng thái phòng, capacity, occupancy hay current Contract logic.

## 3. Files đã sửa

**Backend:**

- `backend/src/properties/property-room.routes.ts`
- `backend/src/properties/property-room.repository.ts`
- `backend/src/properties/property-room.test.ts`

**Frontend:**

- `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx`
- `frontend/src/lib/api/roomApi.ts`
- `frontend/src/lib/api/apiClient.test.ts`

**Canonical docs:**

- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` — duy nhất bullet tìm kiếm phòng tại §6.
- `GocTro-SmartBuilding/docs/04_API_SPEC.md` — endpoint/filter/query tại §5.4.

**Report:** file này.

## 4. Search tests và live API checks

- Property/Room backend tests: **44/44 PASS** (33 test cũ + 11 test search/validation bổ sung). Test mới bao phủ exact/partial keyword, no-result/empty/trim, available/inactive status, pagination, foreign Owner, Property route scope và từ khóa quá dài.
- Frontend API tests: **5/5 PASS**, bao gồm query search được trim trước khi gửi tới endpoint V1.
- Live API trên server local: exact `DEV-SMOKE-R01` trả đúng 1 phòng; partial case-insensitive `dev-smoke-a01` trả 3 phòng; từ khóa không khớp trả 0; status available trả 1 và inactive trả 0; Room page 2 trả 1/21.
- Browser: exact `DEV-SMOKE-R01` hiển thị 1 row; partial `DEV-SMOKE-A01` hiển thị 3 row; từ khóa không khớp hiển thị 0 kết quả cùng empty state rõ ràng. Chọn status `Còn trống` trong khi giữ keyword A01 vẫn giữ đúng 3 kết quả; xóa tìm kiếm khôi phục danh sách 21 phòng.
- Browser reload sau khi clear tiếp tục nạp danh sách 21 phòng; helper gửi search server-side, không filter trên trang hiện tại.

## 5. Property pagination smoke và DEV data

- Ban đầu Owner có 4 Property. Tạo **17 Property** qua `POST /api/v1/properties` bằng DEV Admin hiện có, để tổng đạt 21 và vượt page size 20.
- Tất cả mã/tên có prefix bắt buộc `DEV-SMOKE-PROP-`; bản ghi được giữ lại để xem demo. Không xóa hay sửa Property có sẵn.
- API pagination: trang 1 **20/21**, trang 2 **1/21**, `meta.total_items=21`, `total_pages=2`.
- API filter tỉnh Đồng Nai trả 19 kết quả và ở page 1; Property search prefix trả 17 và ở page 1. API có thể đọc lại dữ liệu sau khi tạo.
- Browser page 1: 20/21; page 2: 1/21 và `Trang 2 / 2`.
- Từ page 2, lọc tỉnh `Đồng Nai` đưa về page 1 với 19 kết quả; đặt lại filter khôi phục 21 kết quả. Từ page 2, tìm prefix `DEV-SMOKE-PROP-` đưa về page 1 với 17 kết quả. Đặt lại và refresh khôi phục 21 kết quả cùng 20 rows trang đầu.

## 6. Current Contract summary smoke

- Không cần tạo Contract fixture mới: API tìm được current Contract trong local DEV database ở Property `OWN1-P01` (ID `11`):
  - Room `A101` (ID `101`): `DEMO-HD-001` (ID `3001`), `active`, `2026-09-15` → `2027-09-14`, capacity `3`.
  - Room `A102` (ID `102`): `DEMO-HD-002` (ID `3002`), `active`, `2026-09-18` → `2027-09-18`, capacity `2`.
- Room list API trả `contract_no`, `status`, ngày bắt đầu/kết thúc và `contract_capacity` đúng như UI mapping hiện tại. Source Room page hiển thị mã, trạng thái, thời hạn và sức chứa hợp đồng; không hiển thị Contract ID.
- Browser tại `/admin/properties/11/rooms`: A101 hiện `DEMO-HD-001`, `Đang hiệu lực`, `2026-09-15` → `2027-09-14`, sức chứa 3; A102 hiện `DEMO-HD-002`, `Đang hiệu lực`, `2026-09-18` → `2027-09-18`, sức chứa 2. Không hiển thị internal Contract ID.
- Reload trang Room xác nhận hai summary trên vẫn đúng. Browser flow Admin kết thúc bằng logout thành công.
- Fixture có sẵn nên không phát sinh blocker cần sửa Contract; không tạo/sửa Contract.

## 7. Regression / runtime

- Property/Room backend tests: **44/44 PASS**.
- Auth regression: **20/20 PASS**.
- Frontend API tests: **5/5 PASS**.
- Frontend typecheck: **PASS**; production build: **PASS**.
- `npm run dev:all`: backend, database health, frontend và CSRF báo sẵn sàng.
- Backend project-wide `typecheck`: **FAIL do diagnostics legacy tại `backend/src/app.ts`** (Prisma models/fields legacy và type mismatch ở compatibility routes). Không sửa vì ngoài scope. Property/Room route suite liên quan vẫn PASS.
- Không chạy migration, seed, reset hay lệnh ghi SQL.

## 8. Git diff scope verification

Thay đổi do task giới hạn ở ba file backend Property/Room, ba file frontend Property/Room, hai canonical docs chỉ ở phần tìm kiếm và report này. Workspace có các thay đổi/untracked khác từ trước; không sửa/revert chúng trong pass này. Database/Prisma/schema/migration/seed và domain implementation ngoài Property/Room không được sửa trong pass này.

## 9. Remaining gaps và Definition of Done

| Hạng mục | Trạng thái |
|---|---|
| Requirement ghi tìm theo `room_code` | PASS |
| API Spec có `search`/scope/filter/pagination | PASS |
| Backend server-side partial, case-insensitive search | PASS (tests + live API) |
| Owner/Property scope, status, pagination | PASS (tests + live API) |
| Frontend API helper và Room UI wiring | PASS (API test + typecheck/build + browser) |
| Browser Room search smoke | PASS |
| Property API page 1/page 2/total | PASS |
| Property browser pagination/filter/search/clear/refresh | PASS |
| Current Contract fixture | PASS — dùng fixture có sẵn, không tạo mới |
| Current Contract API fields và UI mapping | PASS qua API/browser; không hiển thị ID nội bộ |
| Browser Contract summary/refresh | PASS |
| Regression | PASS cho Property/Room, Auth, FE API, FE typecheck/build; backend project-wide typecheck còn lỗi legacy ngoài scope |
| Database schema/Prisma/migration/seed thay đổi | NONE; local test records đã được tạo qua API như §5 |
| Thay đổi domain ngoài Property/Room | NONE do task này |

**Trạng thái cuối:** `PROPERTY / ROOM MODULE — ✅ END-TO-END COMPLETE FOR ADMIN LOCAL/DEV V1`. Property pagination, Room search và current Contract summary đã được kiểm tra trực tiếp trên browser; các test/regression yêu cầu đều PASS. Backend project-wide typecheck còn diagnostics legacy tại compatibility routes `src/app.ts`, ngoài phạm vi và không làm fail test/typecheck/build của Property/Room.
