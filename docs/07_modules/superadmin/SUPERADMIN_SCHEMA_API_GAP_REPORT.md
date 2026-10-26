# Góc Trọ — Superadmin schema/API gap report

**Trạng thái:** CURRENT — review-only, chưa triển khai  
**Ngày đối chiếu:** 2026-10-26  
**Nguồn đã kiểm tra:** `SUPERADMIN_REQUIREMENTS_SPEC.md`, `docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`, `database/schema.prisma`, `database/baselines/v1.8/schema.sql`, `backend/src/auth`, `backend/src/accounts`, `backend/src/properties`, `backend/src/app.ts`, `frontend/src/app/_property-explorer`.

## 1. Kết luận ngắn

Superadmin hiện **chưa tồn tại trong mô hình quyền, Auth context, API hoặc giao diện**. Database hiện có các entity nền tảng có thể tái sử dụng — `owners`, `properties`, `accounts`, `account_invitations`, `complaints`, `complaint_history` — nhưng chúng đều được thiết kế cho Owner/Admin hoặc Resident scope.

Mức độ gap chính:

| Khu vực | Kết quả | Mức độ |
|---|---|---|
| Role/Auth | Chỉ có `admin` và `resident`; `requireAdmin` luôn là Owner-scoped | Critical |
| Owner provisioning | Có enrollment/reset cho Resident, chưa có tạo Owner account | High |
| Khóa/mở khóa Owner | Có status `active/locked`, nhưng route hiện tại chỉ cho Admin quản lý Resident | High |
| Platform map/read model | Có Property/province và Public Explorer tổng hợp, chưa có tọa độ/ghim/lookup platform | High |
| Platform report | `Complaint` hiện là Resident → Owner, status khác và Resident bắt buộc | Critical |
| Audit | Chỉ có lịch sử Contract/Complaint; chưa có audit log nền tảng hoặc re-auth grant | Critical |
| Internal export | Chưa có UI/API; đây là đúng với quyết định không đưa vào bản đầu | Intentional gap |

Không có cơ sở để bắt đầu code Superadmin trực tiếp trên API hiện tại mà không thiết kế lại authorization boundary và versioned contract.

## 2. Đối chiếu schema/database

### 2.1 Thành phần có thể tái sử dụng

- `Owner`: có `display_name`, contact fields và quan hệ tới `Account`/`Property`.
- `Property`: có `owner_id`, `name`, `province`, `address`, `status`; status physical V1.8 là `active`, `building`, `paused`, `archived`.
- `Account`: có `owner_id` unique, `role`, `status` (`active/locked`), email/phone unique và password hash. Invariant hiện tại là một Owner tối đa một Admin Account.
- `AccountInvitation`: có token hash, expiry, status, creator và Owner/Resident linkage; thiết kế hiện tại dành cho Resident invitation.
- `Complaint`/`ComplaintHistory`: có property/owner linkage, status, note, actor và timestamps; hiện thuộc Complaint nội bộ.
- `ContractChangeHistory`: chứng minh pattern lưu audit nghiệp vụ, nhưng chỉ dành cho Contract.

### 2.2 Gaps schema

1. `Account.role` hiện chỉ chấp nhận vai trò hiện hành qua application/DB validation; không có Superadmin account model hoặc role constraint/seed.
2. `Account` không có cơ chế biểu diễn quyền xem audit riêng, thời hạn quyền, re-auth grant, số lần thử hoặc thời điểm hết hạn.
3. Không có bảng audit log platform-wide. `ComplaintHistory` và `ContractChangeHistory` không đủ vì chỉ gắn với từng domain và không bao phủ login, account provisioning, lock/unlock, report access.
4. Không có entity platform report tách khỏi `Complaint`. `Complaint` bắt buộc `resident_id` và status physical là `pending/in_progress/resolved/rejected`, không tương thích anonymous report và trạng thái chuẩn `NEW/IN_PROGRESS/RESOLVED`.
5. Không có trường latitude/longitude hoặc geometry cho `Property`; `province` chỉ là text. Vì vậy chưa thể tạo ghim tọa độ thật hoặc kiểm tra chất lượng tọa độ.
6. Không có model cho dữ liệu nguồn tọa độ, độ chính xác, thời điểm xác minh hoặc geocoding provenance.
7. Không có durable record cho internal export request/handoff. Điều này không phải blocker của bản đầu vì đặc tả cố ý loại chức năng khỏi UI; sẽ là gap bắt buộc nếu quy trình export được sản phẩm hóa.
8. Không có chỉ mục/read model dành cho platform-wide filtering theo province/status/report status; các index hiện tại chủ yếu bắt đầu từ `owner_id`.

### 2.3 Rủi ro khi tái sử dụng trực tiếp

- Mở rộng `Complaint` để nhận anonymous platform report sẽ làm lẫn hai nghiệp vụ đã được đặc tả là tách biệt.
- Cho Superadmin dùng `Account.owner_id = null` mà không có model quyền rõ ràng dễ tạo account “mồ côi” và phá các invariant Auth hiện tại.
- Dùng `Property.province` làm tọa độ hoặc suy ra ghim từ địa chỉ sẽ tạo dữ liệu bản đồ không đáng tin cậy.
- Dùng `ComplaintHistory` như audit log chung sẽ thiếu actor cho anonymous submit và thiếu loại sự kiện ngoài Complaint.

## 3. Đối chiếu API/backend

### 3.1 Những gì hiện có

- Auth context chỉ định nghĩa `AdminAuthContext` và `ResidentAuthContext`; không có `SuperadminAuthContext`.
- `resolveContext` chỉ chấp nhận account role `admin` hoặc `resident`; account khác không đăng nhập được.
- `requireAdmin` chỉ kiểm tra role `admin`; các helper lấy `ownerId` từ session và áp Owner scope.
- `GET/PATCH /accounts` hiện cho Admin liệt kê và khóa/mở khóa account trong Owner scope; route chỉ cho `role=admin|resident`, và password reset chỉ cho Resident.
- Enrollment flow có invitation/reset token hash, TTL và rate limiting, nhưng dành cho Resident và route tạo invitation yêu cầu `resident_id` trong Owner scope.
- Property API có list/detail/filter theo `status`, `province`, `search`, nhưng chỉ cho Admin và Owner-scoped.
- Public Explorer có tổng hợp province và public property/room counts, nhưng không trả Property IDs, Owner IDs, tọa độ hay non-public data.
- Contract history là audit domain-specific, không phải platform audit.

### 3.2 Gaps API/backend

| Nhu cầu | Hiện trạng | Gap cần thiết kế |
|---|---|---|
| Đăng nhập Superadmin | Bị từ chối vì Auth context không có role | Role/context, routing, session policy, authorization tests |
| Tạo Owner account | Không có endpoint tương ứng | Owner provisioning command, idempotency, delivery contract |
| Gửi link Owner | Có flow tương tự nhưng chỉ Resident | Recipient binding, DTO, delivery failure/retry semantics |
| Lock/unlock Owner | Có route nhưng Owner-scoped Resident management | Global authorization, reason bắt buộc, revoke sessions, audit |
| Platform Owner/Property list | Property list chỉ Admin scope | Pagination/search/filter cross-Owner, privacy-safe DTO |
| Map detail/ghim | Không có endpoint tọa độ | Coordinate data contract, map read model, quality/error handling |
| Platform report public/anonymous | Không có report route; Complaint route hiện không triển khai trong backend hiện tại | Separate resource, anonymous intake, anti-spam/rate limit, status transitions |
| Audit log | Không có platform audit endpoint/model | Append-only event contract, authorization, re-auth challenge/grant, expiry |
| Audit failed access | Không có event sink chung | Must audit failed re-auth and failed log access without leaking secrets |
| Internal export | Không expose — phù hợp bản đầu | SOP/tooling later; no UI/API in current scope |

## 4. Đối chiếu với API spec hiện tại

`docs/04_API_SPEC.md` hiện tuyên bố Admin là Owner-scoped, Resident là self-scoped và role matrix chỉ có Public/Admin/Resident. Phần account administration cũng chỉ cho Admin quản lý Resident account; không có Superadmin endpoints, DTO hoặc error codes.

Đặc biệt, API spec hiện vẫn có các quyết định “không có super-admin” trong các phần role/permission và acceptance criteria lịch sử. Đặc tả mới đã cập nhật phần canonical Requirements để ghi nhận Superadmin là vai trò được chốt nhưng chưa triển khai; API spec chưa được mở rộng vì API/DTO chưa được duyệt. Trước implementation cần tạo một API change request riêng, tránh thêm endpoint trực tiếp vào bảng endpoint hiện tại.

## 5. Đối chiếu giao diện/bản đồ

Public Explorer hiện dùng Three.js/React Three Fiber và GeoJSON 34 tỉnh/thành. Nó chọn tỉnh, hiển thị số liệu phòng/tin công khai và danh sách phòng; không có đường phố, tọa độ Property thật, ghim từng khu trọ hoặc panel Owner/Property dành cho Superadmin.

Do đó:

- Có thể tái sử dụng province catalog, camera/focus interaction và khung layout.
- Không thể chỉ phóng to scene hiện tại để đáp ứng bản đồ Superadmin.
- Cần nguồn bản đồ chi tiết và data contract tọa độ trước khi chọn provider hoặc viết marker layer.
- Public DTO không thể làm nguồn trực tiếp cho Superadmin vì cố ý loại Property IDs, Owner IDs và dữ liệu không công khai.

## 6. Các gap phải xử lý trước implementation

### Critical — cần quyết định và thiết kế

1. Chọn mô hình identity: Superadmin có phải Account role riêng hay identity store riêng; xác định `owner_id` null có hợp lệ hay cần bảng principal/role riêng.
2. Thiết kế authorization matrix và helper middleware cho platform scope, Owner scope và quyền audit riêng.
3. Tách Platform Report khỏi Complaint nội bộ; chốt anonymous identity/contact retention, spam controls, attachment, reopen và SLA.
4. Thiết kế append-only platform audit event, retention, actor reference, redaction, correlation ID và query authorization.
5. Thiết kế re-auth challenge/grant: TTL không hoạt động, retry lockout, session binding, audit success/failure.

### High — cần chốt trước map/account flow

6. Owner provisioning và secure delivery: token TTL, verified recipient, resend/idempotency, delivery adapter và session revocation.
7. Property coordinates: fields/precision/source/status, validation, migration/backfill policy và index/read model.
8. Platform list/detail DTO: dữ liệu được phép xem, pagination, search, filters, cross-Owner privacy boundary.
9. Bản đồ provider: license, pricing, attribution, tile/geocoding limits, fallback, performance và coordinate accuracy.

### Intentional/deferred

10. Internal full-property export không phải gap cần lấp trong bản đầu; chỉ cần tài liệu SOP nội bộ nếu nhóm muốn vận hành ngoài ứng dụng.

## 7. Đề xuất thứ tự triển khai sau khi duyệt

1. API/security design: identity, role matrix, audit/re-auth threat model.
2. Database change request và migration cho role/principal, audit, platform report và coordinates; không sửa trực tiếp V1.8 baseline.
3. Owner account lifecycle và session revocation.
4. Platform read APIs và seed dữ liệu giả riêng cho test.
5. Anonymous platform report + moderation workflow.
6. Map provider adapter và marker/detail UI.
7. Audit UI/re-authentication, rồi mới đánh giá production readiness.

## 8. Kết luận và gate

Gap report này không phê duyệt schema/API change và không cho phép triển khai. Gate tiếp theo là duyệt một API/database design cho năm điểm Critical, sau đó cập nhật `docs/04_API_SPEC.md`, database change request và kế hoạch test trước khi sửa source.

