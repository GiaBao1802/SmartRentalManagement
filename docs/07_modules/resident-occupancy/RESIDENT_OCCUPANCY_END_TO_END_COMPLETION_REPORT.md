# Resident / Occupancy End-to-End Completion Pass

**Ngày cập nhật:** 11/10/2026  
**Phạm vi:** Resident / Occupancy V1 — backend, frontend, canonical Requirement/API Spec và validation local.  
**Kết quả hiện tại:** Admin Resident/Occupancy runtime + browser smoke PASS. Core module đạt `END-TO-END COMPLETE FOR LOCAL/DEV V1`. Resident portal browser login chưa xác minh vì không có plaintext credential V1; ghi nhận riêng là `NOT VERIFIED — CREDENTIAL NOT AVAILABLE`. Một dependency legacy cross-domain ngoài scope vẫn được giữ nguyên.

## 1. Scope và nguồn

- Đã đọc `docs/DOCUMENTATION_RULES.md`, canonical `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` và `docs/04_API_SPEC.md`, `RESIDENT_OCCUPANCY_BUSINESS_AUDIT.md`, Resident/Occupancy backend/frontend source và tests.
- Contract backend chỉ được đọc để xác nhận `GET /contracts/{contract_id}` có Resident-safe authorization; không sửa Contract.
- Không sửa Property/Room business logic, Database/Prisma/schema, migration, seed, Payment hay domain khác.

## 2. Business rule và tài liệu

`residence_status` (`living` / `left`) là server-managed, suy ra từ Occupancy `active`: có ít nhất một thì `living`, không còn thì `left`. Resident mới chưa có Occupancy bắt đầu `left`. Client không thể gửi trạng thái này khi tạo/PATCH.

- Add occupancy đặt `living`; end occupancy kiểm tra số lượt active còn lại và đặt `living` hoặc `left`; transfer thành công giữ `living`. Cả cập nhật Resident và Occupancy nằm trong cùng transaction.
- `residence_registration_status` vẫn là dữ liệu nghiệp vụ riêng, không bị suy ra từ Occupancy.
- Canonical Requirement §7/§21.3 đã bổ sung nguồn sự thật và quy tắc đồng bộ.
- Canonical API Spec §5.5 đã bỏ `residence_status` khỏi create/PATCH allowlist, nêu default `left`, transactional sync, transfer rollback, và giữ `residence_status` trong Resident response.

## 3. Backend implementation và tests

- Create validation từ chối `residence_status`; repository gán `left`.
- PATCH allowlist không nhận `residence_status`; API trả `400 VALIDATION_ERROR` nếu client cố gửi.
- Add/end/transfer cập nhật trạng thái trong Serializable transaction hiện có. Transfer destination fail rollback toàn giao dịch. Capacity conflict và foreign Owner/Resident không cập nhật trạng thái.
- Thêm regression cho create default, HTTP create/PATCH rejection, add lần đầu/đã living, end cuối/đa occupancy, transfer success/failure rollback, foreign Owner, capacity conflict và archive eligibility.
- **Resident/Occupancy: 49/49 PASS** (37 test nền + 12 test bổ sung/điều chỉnh trạng thái và HTTP guard).
- **Auth: 20/20 PASS.** **Property/Room: 44/44 PASS.** Role/privacy guards Resident self vs Admin và Resident không truy cập Admin endpoints tiếp tục PASS.

## 4. Frontend changes

- Admin create/edit không còn input/select hoặc payload cho `residence_status`; detail/list chỉ render trạng thái server trả về. Sau add/end/transfer, trang reload dữ liệu từ backend; không optimistic update.
- Đổi nhãn rõ `Trạng thái cư trú`, `Trạng thái đăng ký lưu trú`, `Trạng thái lượt ở`; Resident portal dùng cùng cách phân biệt. Admin list có tổng theo filter và thống kê trang hiện tại: đang ở, đã rời, chưa hoàn tất đăng ký.
- Admin detail thêm hierarchy hồ sơ, nơi ở hiện tại, trạng thái, hợp đồng hiện tại read-only, history và transfer/end actions. Contract summary hiển thị mã, trạng thái, ngày và sức chứa nếu API trả về.
- Transfer option hiển thị phòng/Property, trạng thái và summary occupancy/capacity từ Room API; backend vẫn quyết định capacity.
- Resident portal dùng `/me/rental` và `/me/contracts`; Resident có thể mở chi tiết read-only qua `GET /contracts/{contract_id}`. Chỉ render mã/trạng thái/thời hạn/sức chứa/phòng; không thêm authoring, audit, upload hoặc download.
- Frontend API helpers kiểm tra route `/me/contracts` và Contract detail; **API tests 5/5 PASS**, **typecheck PASS**, **production build PASS**.

## 5. Ba trạng thái

| Trạng thái | Nguồn | Nhãn UI |
|---|---|---|
| Resident `residence_status` | Backend suy ra từ Occupancy active | Đang ở / Đã rời đi |
| `residence_registration_status` | Quy trình đăng ký độc lập | Chưa hoàn tất đăng ký lưu trú / Tạm trú / Tạm vắng |
| Occupancy `status` | Vòng đời từng lượt phòng | Đang hoạt động / Đã kết thúc |

## 6. Legacy audit

- **USED AT RUNTIME:** `/admin/tenants`, Resident detail, Room Resident panel và `/tenant` dùng V1 Resident/Occupancy helpers; danh tính/Owner lấy từ session; không có mock Resident list hay hardcoded authority ID trong các flow này.
- **DEAD/REFERENCE:** `frontend/src/app/tenants/tenant-management.tsx` là component legacy không có `page.tsx` route hiện hành; không được AdminShell hoặc route Resident V1 import.
- **LEGACY BLOCKER / OUT-OF-SCOPE DEPENDENCY:** `backend/src/app.ts` vẫn mount `/api/tenants` legacy; một số trang Admin Accounts/Bookings/Contracts/Complaints khác còn gọi endpoint này. Resident V1 pages trong scope không gọi nó. Không tắt/xóa vì sẽ làm hỏng caller của domain ngoài scope. Cần task riêng để migrate các consumer đó trước khi gỡ legacy API.
- Không có `owner_id`/`resident_id` hardcode làm authority hoặc client-side occupancy mutation trong Resident V1 pages.

## 7. Contract detail và các backend gaps khác

- Admin Resident detail dùng summary fields sẵn trong Resident detail response; không thêm Contract authoring.
- Resident contract list/detail đã được nối bằng các endpoint V1 Resident-safe hiện có. Không có browser session để verify nội dung thực tế do runtime blocker ở mục 8.
- `/me/profile`, account invitation, CT01, Vehicle/Parking, Complaint, Invoice, Payment, Amenities vẫn là domain gaps ngoài scope; không thêm mock UI hoặc backend.

## 8. Runtime và browser smoke — lần thử trước

Đã chạy `npm run dev:all`. Script dừng ở prerequisite:

```text
POSTGRES_NOT_REACHABLE: PostgreSQL is not reachable at localhost:5432
```

Điều tra read-only: Windows service `postgresql-x64-18` báo `Running`, nhưng `pg_ctl status -D "C:\Program Files\PostgreSQL\18\data"` báo không có server và `pg_isready` báo `no response`. `Restart-Service` không có quyền mở service; không thay đổi service/data directory. `dev:all` không khởi động backend/frontend sau khi prerequisite fail. Browser điều hướng `http://localhost:3000/admin/tenants` nhận `ERR_CONNECTION_REFUSED`.

| Kiểm tra | Kết quả |
|---|---|
| PostgreSQL / database health | BLOCKED — service process không phản hồi; `dev:all` không qua prerequisite |
| Backend health / CSRF | NOT RUN — backend không được launcher khởi động |
| Frontend URL | BLOCKED — frontend không được launcher khởi động; browser connection refused |
| Admin browser flow | BLOCKED — cần runtime trước; chưa tạo Resident/Occupancy test records |
| Resident browser flow | BLOCKED — runtime không sẵn sàng; legacy `DEV_TENANT_PASSWORD` là credential cho model legacy, không dùng làm V1 Resident login và không reset/provision account |
| Admin summary và Resident contract detail UI | Code/API wiring đã compile và tests PASS; browser runtime verification pending |

Không tạo Resident/Occupancy smoke data, không đăng nhập bằng credential legacy, không reset account, không chạy SQL/schema/migration/seed. Local smoke data do task này tạo: **none**.

## 9. Files changed

**Backend:**

- `backend/src/residents/resident.validation.ts`
- `backend/src/residents/resident.repository.ts`
- `backend/src/residents/resident.test.ts`

**Frontend:**

- `frontend/src/app/admin/tenants/resident-management.tsx`
- `frontend/src/app/admin/tenants/[residentId]/resident-detail.tsx`
- `frontend/src/app/tenant/tenant-portal.tsx`
- `frontend/src/lib/api/residentApi.ts`
- `frontend/src/lib/api/apiClient.test.ts`

**Canonical docs:**

- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` — phần Residence/Occupancy rule.
- `GocTro-SmartBuilding/docs/04_API_SPEC.md` — phần Resident/Occupancy §5.5.

**Report:** file này.

Backend modified: **YES**. Frontend modified: **YES**. Database/schema/Prisma/migration/seed modified: **NO**. Contract backend, Property/Room logic và domain khác modified: **NO**.

## 10. Definition of Done — snapshot trước runtime/browser smoke

Bảng dưới đây giữ lại trạng thái ở lượt hoàn tất code, trước lần runtime/browser smoke mới. §11 là trạng thái hiện hành và supersede các mục runtime/browser còn BLOCKED ở snapshot này.

| Hạng mục | Trạng thái |
|---|---|
| CRUD Resident / Occupancy lifecycle / capacity / Owner scope | PASS theo V1 implementation và regression |
| `residence_status` sync, client write reject, transaction/rollback | PASS — 49/49 tests |
| FE status read-only, registration độc lập, reload from backend | PASS theo source, typecheck/build/API tests |
| Admin contract summary và Resident-safe read-only detail | PASS theo available API/source wiring; browser verification pending |
| Legacy/mock/privacy audit | PASS cho Resident V1 path; legacy `/api/tenants` còn được domain khác dùng, ghi nhận blocker ngoài scope |
| Auth regression | PASS — 20/20 |
| Property/Room regression | PASS — 44/44 |
| FE API / typecheck / build | PASS — 5/5 / PASS / PASS |
| `dev:all`, DB health, backend, frontend, CSRF | BLOCKED bởi PostgreSQL local không phản hồi |
| Admin browser smoke | BLOCKED bởi runtime |
| Resident browser smoke | BLOCKED bởi runtime và không có V1 plaintext credential được xác nhận |
| Không sửa DB/schema/Prisma/migration/seed | PASS |


## 11. FINAL RUNTIME / BROWSER SMOKE

**Ngày chạy:** 11/10/2026  
**Kết quả:** Admin Resident/Occupancy core browser flow PASS; Resident portal bị block đúng theo policy do không có plaintext credential V1.

### Runtime

Chạy lại `npm run dev:all`. Launcher xác nhận và reuse các instance đang chạy, không tạo instance trùng:

| Thành phần | Kết quả |
|---|---|
| PostgreSQL localhost:5432 | PASS — accepting |
| Backend health `http://localhost:4000/api/health` | PASS — HTTP 200, service backend |
| Database health `/api/health/db` | PASS — HTTP 200 |
| Frontend `http://localhost:3000` | PASS — HTTP 200 |
| CSRF `/api/v1/auth/csrf` | PASS — HTTP 200; dev launcher xác nhận CORS credentials/origin |
| Backend/frontend processes | PASS — launcher xác nhận instance hiện tại khỏe và reuse |

### Admin browser smoke

- Admin DEV đăng nhập thành công, vào `/admin/tenants`; danh sách cư dân tải từ API V1.
- Tạo **Resident `DEV-SMOKE-RES-20261011-A` (resident_id `2006`)** qua form. Sau tạo, `residence_status = left` / “Đã rời đi”.
- Resident detail không có control chỉnh `residence_status`; chỉ có trường `residence_registration_status`. Hai loại trạng thái hiển thị riêng.
- Add vào **Nhà mẫu Bình An · `QA-ROOM-20261009-1142`** ngày 11/10/2026: API thành công, status chuyển `living` / “Đang ở”; tải lại danh sách/detail vẫn giữ `living`.
- Transfer từ `QA-ROOM-20261009-1142` sang **Nhà mẫu Bình An · `A01-1`** ngày 11/10/2026: source occupancy kết thúc, destination occupancy active, status vẫn `living`. Refresh xác nhận destination đang ở và lịch sử source đã kết thúc.
- End occupancy cuối cùng ở `A01-1` ngày 11/10/2026: status tự chuyển `left`; refresh xác nhận status và cả hai occupancy đã kết thúc.
- Các hàng UI cho thấy `residence_registration_status = not_completed` độc lập với `residence_status`. Không sửa/xóa Resident thật.
- Contract summary dùng Resident fixture có sẵn (resident_id `1001`): `DEMO-HD-001`, `active`, 15/09/2026–14/09/2027, sức chứa 3. Không tạo/sửa Contract.
- Không chạy multi-active browser case; backend regression đã bao phủ việc kết thúc một trong nhiều active occupancy mà status vẫn `living`.

### Resident portal, privacy và legacy

- Không tìm thấy plaintext credential dùng được cho V1 Resident trong source/docs. `DEV_TENANT_PASSWORD` trong legacy seed thuộc model `UserAccount`, không phải account V1, nên không dùng. Không đoán/reset credential, không sửa DB và không dùng legacy login.
- Kết quả: **RESIDENT BROWSER SMOKE BLOCKED — CREDENTIAL NOT AVAILABLE**. `/me/rental`, `/me/contracts`, Contract detail read-only, portal không lộ CCCD, role guard trên browser và logout Resident chưa được xác minh bằng phiên Resident.
- Admin list/detail được truy cập bằng phiên Admin; route backend lấy `owner_id` từ auth context (`getAdminOwnerId(request.auth)`), không nhận Owner authority từ query/body client. Backend regression Auth/Resident role/privacy guards trước đó PASS.
- Scoped Resident/Occupancy UI imports `residentApi`/`occupancyApi` V1; không thấy `tenantApi`, `/api/tenants` hoặc mock Resident trong các component thuộc luồng được rà soát. Browser tool không cung cấp Network panel/request waterfall, nên không tuyên bố đã capture request ở tầng trình duyệt; request mapping được xác nhận bằng source helper V1 và các thao tác UI thành công. Backend legacy `/api/tenants` vẫn được các domain Admin khác dùng và tiếp tục là **OUT-OF-SCOPE DEPENDENCY**; không sửa trong lượt này.

### Smoke data và thay đổi

- Tạo đúng một hồ sơ test: `DEV-SMOKE-RES-20261011-A`, `resident_id=2006`.
- Occupancy test: `QA-ROOM-20261009-1142` bắt đầu 11/10/2026 và kết thúc khi transfer; occupancy tại `A01-1` bắt đầu cùng ngày, sau đó kết thúc 11/10/2026.
- Hồ sơ Resident test được giữ lại làm dấu vết smoke; không xóa vì API hiện không cung cấp cleanup phù hợp mà không xóa lịch sử. Hiện không còn active occupancy. Không ghi dữ liệu SQL thủ công.
- Bug/fix phát sinh trong smoke: **không có**. Không sửa source trong lượt runtime/browser này.
- Database/schema/Prisma/migration/seed: **không đổi**.

### DoD cuối

| Hạng mục | Trạng thái |
|---|---|
| Runtime PostgreSQL, backend, DB health, frontend, CSRF | PASS |
| Resident list V1 browser và Admin login | PASS |
| Create → `left`; add occupancy → `living` | PASS — UI/API, persistence sau refresh |
| Transfer: source ended, destination active, status `living` | PASS — persistence sau refresh |
| End occupancy cuối → `left` | PASS — persistence sau refresh |
| `residence_status` read-only; registration status riêng | PASS |
| History và Admin Contract summary | PASS |
| Owner scope / không dùng client Owner authority | PASS — route/backend context và Admin session |
| Resident role portal/privacy browser | BLOCKED — không có plaintext credential V1 |
| Resident V1 request mapping | PASS — scoped source dùng V1 helpers, không mock/legacy helper; Network panel capture không khả dụng |
| DB/schema/Prisma/migration/seed thay đổi | NO |
| Regression từ lượt code trước | PASS — Resident/Occupancy 49/49, Auth 20/20, Property/Room 44/44, FE API 5/5, typecheck/build PASS; không rerun vì lượt này không sửa code |

**Trạng thái module:** `RESIDENT / OCCUPANCY MODULE — ✅ END-TO-END COMPLETE FOR LOCAL/DEV V1` cho Admin/core flow.  
**Portal note:** `RESIDENT PORTAL BROWSER LOGIN — 🟡 NOT VERIFIED — CREDENTIAL NOT AVAILABLE`. Không gọi là production-ready.  
**Legacy note:** endpoint `/api/tenants` ở các domain khác là dependency riêng ngoài scope và không chặn luồng Resident V1 đã smoke.
