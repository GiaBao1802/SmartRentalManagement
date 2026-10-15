# Resident / Occupancy Business Audit

**Ngày audit:** 2026-10-09  
**Phạm vi:** Admin Resident management, Room occupancy, Resident self-service và các dependency được Requirement gắn với cư dân.  
**Chế độ:** Source audit, không redesign và không chạy mutation.

## 1. Tóm tắt

Các luồng cốt lõi Resident/Occupancy đã được tích hợp API V1 thật: danh sách/lọc, tra cứu CCCD theo Owner, tạo/sửa/lưu trữ hồ sơ, xem lịch sử, thêm cư dân vào phòng, kết thúc lượt cư trú, chuyển phòng và cổng cư dân đọc nơi ở của chính mình. Backend kiểm tra Owner, capacity và lifecycle; FE không tự quyết định các rule này.

Các phần còn thiếu tập trung ở trải nghiệm self-service và domain liền kề. Contract summary đã hiện một phần; FE chưa mở Contract detail. API Spec mô tả profile self-service, CT01, vehicle/parking, complaint và account invitations nhưng các route tương ứng chưa được mount/implement trong V1 backend hiện tại. Không nên xây UI giả hoặc gọi legacy để lấp các khoảng trống đó.

**Ước lượng bao phủ audit scope: khoảng 66%.** Cách tính: trong 24 dòng ma trận, loại 5 dòng `NOT REQUIRED`; còn 19 capability theo Requirement. Có 12 capability được thể hiện đầy đủ, 1 capability thể hiện một phần (tính nửa), và 6 chưa có luồng end-to-end (`12.5 / 19 ≈ 66%`). Đây là ước lượng bao phủ nghiệp vụ, không phải code coverage. Nếu chỉ xét CRUD Resident và lifecycle Occupancy đã có backend, các luồng hiện tại được bao phủ đầy đủ; phần còn lại chủ yếu là contract/dependency và self-service liên miền.

**Không thấy lỗi P0 privacy/security trực tiếp trong các màn Resident/Occupancy đã audit.** Các rủi ro cần ưu tiên là thiếu endpoint cho một số luồng bắt buộc, cùng quy tắc chưa rõ về đồng bộ `residence_status` với Occupancy.

## 2. Nghiệp vụ rút ra từ Requirement

| Vai trò | Mục tiêu / hành động | Thông tin, trạng thái và rule liên quan | Nguồn |
|---|---|---|---|
| Admin / chủ trọ | Quản lý hồ sơ cư dân trong Owner của mình; tra cứu, tạo, cập nhật, lưu trữ | Định danh/liên hệ; phòng và khu trọ; `living` / `left`; đăng ký lưu trú; phương tiện liên quan. Không mất lịch sử do xóa. | Requirement §§2.1, 3, 7 |
| Admin / chủ trọ | Quản lý thành viên đang ở phòng | Thêm hoặc chuyển phải kiểm tra CCCD, Owner, quan hệ Room/Contract và capacity đang áp dụng; không vượt capacity. | Requirement §§7, 9, 21.3 |
| Admin / chủ trọ | Theo dõi tạm trú/tạm vắng, chuẩn bị CT01 | Lọc cư dân chưa hoàn tất theo toàn khu trọ; rà soát trước khi xuất; dữ liệu chỉ trong Owner scope; biểu mẫu chưa được mặc định là mẫu pháp lý chính thức. | Requirement §§7–8, 21.7 |
| Cư dân | Xem dữ liệu của chính mình và sử dụng dịch vụ liên quan | Xem phòng, hợp đồng, hóa đơn, lịch sử thanh toán, thông báo, tiện ích; đăng ký tiện ích/slot xe; gửi và theo dõi khiếu nại của mình. Không xem dữ liệu cư dân khác. | Requirement §§2.2, 3 |
| Người dùng đã đăng nhập | Cập nhật hồ sơ cá nhân trong allowlist và đổi mật khẩu an toàn | API Spec mô tả `/me/profile`; đây là phần self-service, không đồng nghĩa quyền tự sửa tình trạng lưu trú hoặc Occupancy. | Requirement §16; API Spec §5.1 |

Requirement không yêu cầu màn Resident phải hiển thị tỉnh/thành ở danh sách, số ngày còn lại của hợp đồng, bằng chứng/ngày nộp đăng ký lưu trú, hoặc complaint bên trong hồ sơ cư dân. Không đề xuất thêm các trường đó chỉ vì có thể tồn tại trong DB/API khác.

## 3. API Spec so với backend hiện hành

### 3.1 API Spec có định nghĩa

| Capability | API Spec |
|---|---|
| Danh sách và lọc cư dân | `GET /residents` với `residence_status`, `residence_registration_status`, `property_id`, `room_id`, pagination |
| Tra cứu CCCD | `POST /residents/search`, exact match trong Owner scope; CCCD nằm trong body |
| Hồ sơ | `POST /residents`, `GET /residents/{resident_id}`, `PATCH /residents/{resident_id}`, `DELETE /residents/{resident_id}` (archive) |
| Occupancy | `GET/POST /rooms/{room_id}/residents`; `POST /occupancies/{occupancy_id}/end`; `POST /residents/{resident_id}/transfer` |
| Cư dân tự phục vụ | `GET /me/rental`; §5.1 còn mô tả `GET/PATCH /me/profile` |
| CT01 | `GET /properties/{property_id}/residence-registration/pending`; `POST /properties/{property_id}/ct01/exports` |
| Hợp đồng | `GET /me/contracts`, Resident-safe contract detail và document read theo Contract API |
| Vehicle / Parking | §5.11 định nghĩa `/vehicles`, `/me/vehicles`, `/parking-assignments`, slot/assignment operations |
| Complaint | §5.12 định nghĩa `POST /complaints`, `GET /me/complaints`, detail/history và lifecycle |
| Account | §5.2 định nghĩa account/invitation cho Resident trong Owner scope |

### 3.2 Xác nhận implementation trong backend

`backend/src/app.ts` khởi tạo `residentOccupancyRepository`, `contractRepository` và mount `createV1Router`. V1 router mount Auth, Property/Room, Resident/Occupancy, Contract và Invoice có đủ dependencies.

Trong source hiện tại, các route sau **được implement**: Resident CRUD/search; Room resident list/add; end occupancy; transfer; `/me/rental`; Contract `/me/contracts`, Resident detail và document-read paths. Owner context lấy từ session; `/me/rental` lấy Resident từ session, không nhận Resident ID từ client.

Các API được mô tả trong Spec nhưng **chưa được mount/implement trong V1 router/source hiện tại**: `/me/profile`; account administration/invitation V1; CT01 pending/export; Vehicle/Parking; Complaint. Có bảng và relation tương ứng trong Prisma/database cho một số domain, nhưng DB không đồng nghĩa endpoint đã hoạt động. Các endpoint legacy trong `backend/src/app.ts` không được tính là API V1 hoặc bằng chứng cho FE V1.

### 3.3 Rule và phản hồi backend đã xác nhận

- Admin Owner được lấy từ session; Resident context cũng được suy ra từ session. Foreign/missing resource trả về kiểu 404 đã quy định; CCCD tra cứu chỉ exact match theo Owner và không tiết lộ tồn tại ở Owner khác.
- Resident search/list không có tìm kiếm tên/điện thoại; chỉ có CCCD exact search cùng các filter và pagination đã liệt kê. Requirement không buộc tìm kiếm tên/điện thoại.
- `GET /rooms/{room_id}/residents` trả occupancy active lẫn ended, kèm Resident, Room, Property, Contract summary; không pagination.
- Khi thêm occupancy, capacity dùng Contract `resident_capacity` áp dụng tại ngày bắt đầu; nếu không có Contract áp dụng thì dùng `rooms.default_capacity`. Backend đếm occupancy active đã bắt đầu ở ngày hiệu lực. Vượt mức trả `409 ROOM_CAPACITY_EXCEEDED`.
- Transfer thực hiện trong transaction; end source và create destination cùng giao dịch, xác thực capacity, Owner và Contract. Lỗi đích rollback toàn bộ. Duplicate cùng Resident/Room bị chặn; V1 không cấm một Resident có active occupancy ở nhiều Room khác nhau trên toàn platform.
- Archive Resident là lưu trữ, không hard delete; active occupancy hoặc active representative Contract chặn thao tác cho tới khi close-out.
- API Spec ghi `Idempotency-Key` cần có nhưng durable replay store chưa implement. Đây là blocker reliability đã được tài liệu đánh dấu, không phải FE được phép tự mô phỏng thành công.

## 4. Database / Prisma relations được dùng trong audit

`database/schema.prisma` hiện có các model/relation phù hợp với nghiệp vụ:

- `Resident.ownerId` thuộc Owner; Resident liên kết Account tùy trạng thái tài khoản, RoomResident history, Contract đại diện, Vehicle và Complaint.
- `RoomResident` giữ `ownerId`, `propertyId`, `roomId`, `residentId`, `contractId`, `startedAt`, `endedAt`, `status`; lịch sử không bị xóa khi kết thúc lượt.
- `Contract` liên kết Room, Property, Resident đại diện, lưu `residentCapacity`, start/end/status và lineage/audit/document.
- `Vehicle`, parking assignment và Complaint/ComplaintHistory tồn tại trong Prisma/database, nhưng backend V1 route hiện chưa expose các module này.

DB hiện lưu `residence_status` và `residence_registration_status` riêng trên Resident. Occupancy status là một lifecycle riêng (`active` / `ended`). Không nên gộp ba trạng thái này ở UI. DB có `vehicles`/`complaints` relation không tự cho phép FE lấy dữ liệu; phải có API scoped trước.

## 5. Frontend hiện tại: màn hình → API → coverage

| Màn hình | API/data hiện dùng | Actions/coverage |
|---|---|---|
| `/admin/tenants` | `GET /residents`; exact CCCD `POST /residents/search`; Property/Room lists | Pagination server-side; lọc hai trạng thái và Property/Room; tạo hồ sơ; archive; hiển thị tên, CCCD, liên hệ, current Property/Room, hai trạng thái riêng. Không giả lập tìm tên/điện thoại. |
| `/admin/tenants/[residentId]` | `GET/PATCH/DELETE /residents/{id}`; end/transfer APIs; Room/Property APIs cho đích | Sửa hồ sơ; history gồm Property/Room, ngày bắt đầu/kết thúc, occupancy status; end, transfer, archive; tải lại từ server sau mutation. Contract hiện chỉ hiện mã ở mỗi dòng, bỏ qua ngày/status/capacity dù API detail trả về. |
| Room Resident panel | `GET/POST /rooms/{room_id}/residents`; `POST /occupancies/{id}/end` | Active + ended history; tìm bằng CCCD hoặc list; add; end; hiển thị capacity summary và để backend quyết định hiệu lực theo ngày. Không xóa history. |
| Room list | Property/Room API | Có số người đang ở, capacity mặc định/Contract capacity và các trạng thái phòng từ backend. Room status không bị suy diễn từ Resident profile status. |
| `/tenant` | Shared Auth session; `GET /me/rental` | Chặn/redirect role phù hợp; chỉ hiện phone/email, residence + registration state của chính mình, current/history occupancy, Property/Room/date/status, Contract summary và representative Contract dates/status/capacity. Không hiện CCCD hoặc Resident khác. Không có edit hồ sơ, Contract detail/document, Complaint, Vehicle/Parking, invoice/payment hoặc amenity V1 API integration. |

Client helpers hiện có là `residentApi.ts` và `occupancyApi.ts`. Không thấy client V1 cho `me/profile`, Contract, Account invitation, CT01, Vehicle/Parking hoặc Complaint trong frontend API folder.

## 6. Business capability matrix

`Requirement` = nhu cầu sản phẩm; `Backend/API` phân biệt API Spec với implementation hiện hữu; `Database` chỉ xác nhận dữ liệu/quan hệ. `FE` mô tả màn hiện tại.

| Business capability | Requirement | Backend/API | Database | FE hiện tại | Classification | Priority |
|---|---|---|---|---|---|---|
| Danh sách, pagination, filter residence/registration/property/room | Có: §7 tra cứu/lọc; statuses và CT01 scope | Spec + backend hỗ trợ server filters | Resident + active RoomResident | Đang dùng filters/paging từ server | KEEP | — |
| Tìm cư dân bằng CCCD | Có: §7; privacy ở §§3,20 | Exact scoped POST search; backend test Owner isolation | Tenant-scoped unique `(owner_id,national_id)` | Form exact 12 số; CCCD không lên URL | KEEP | — |
| Tìm theo tên hoặc phone | Không yêu cầu cụ thể | Không có filter/search trong contract | Có scalar name/phone | Không có | NOT REQUIRED | — |
| Tạo/sửa/lưu trữ Resident | Có: §§7,19; không mất lịch sử | CRUD/archive có thật; archive conflict được trả về | archived_at + history relations | Create/edit/archive; không hard delete | KEEP | — |
| Residence status và registration status | Có: §7 | Admin list/PATCH hỗ trợ hai field enum | Hai field riêng | Hai cột/select/filter riêng; nhãn hiển thị | KEEP + UX GAP | P1 |
| Current location: Property + Room | Có: §7 | Resident list/detail trả active room context | RoomResident → Room → Property | Hiện ở list/detail/portal | KEEP | — |
| Occupancy history và ngày/status | Có: cư trú/lịch sử theo §§7,21.3 | Active + ended rows trả qua API | RoomResident giữ start/end/status | Admin detail, Room panel, portal cùng hiển thị | KEEP | — |
| Thêm cư dân vào phòng | Có: §§7,21.3 | API thực; Owner/Contract/capacity enforced | RoomResident + FK/composite tenant relations | CCCD/list selection và submit | KEEP | — |
| Kết thúc lượt cư trú, giữ history | Có: §§7,19 | Lifecycle API thực; validate date/conflict | ended_at/status, không xóa row | Admin detail và Room panel | KEEP | — |
| Chuyển phòng | Có: §7 yêu cầu kiểm tra sức chứa trước khi chuyển; §6 yêu cầu toàn vẹn liên kết khi đổi phòng | Atomic transfer API thực; rollback/capacity conflict | Hai occupancy rows liên kết đúng tenant | Form chọn đích/ngày, refresh history sau thành công | KEEP | — |
| Sức chứa | Có rõ: §7/§21.3, Contract snapshot | Backend authoritative; `409 ROOM_CAPACITY_EXCEEDED` | Contract resident_capacity + Room default | Hiện capacity summary; không tự tính/quyết định | KEEP | — |
| Resident tự xem rental/current + history | Có: §2.2 | `/me/rental` thực, derives identity from session | Own Resident + Occupancy + Contract relation | Portal chỉ load dữ liệu của session | KEEP | — |
| Resident Contract summary | Có: §2.2 và §9 | `/me/rental` + `/me/contracts`/detail có thật | Contract relation/capacity/audit | Portal có mã, thời hạn, trạng thái/capacity; admin detail chỉ hiện mã | BUSINESS GAP ON FE (một phần) | P1 |
| Resident xem Contract detail | Có: §2.2 yêu cầu xem thông tin hợp đồng | `/me/contracts` and Resident-safe detail API có thật | Contract relation, dates/status/capacity | Portal chỉ có summary; chưa mở detail | BUSINESS GAP ON FE | P1 |
| Người dùng tự cập nhật hồ sơ | Có: §16 | Spec nói `GET/PATCH /me/profile`; current V1 router chưa có route | Account → Resident relation | Portal chỉ đọc contact; không có edit | BACKEND CONTRACT GAP | P1 |
| Link/provision Resident account trong Owner | Có: §§2.2,7 và nhu cầu Resident đăng nhập | Spec §5.2 có account/invitation; V1 routes chưa mount | Account-resident relation, invitations table | Không có V1 invitation/link flow ở FE Resident | BACKEND CONTRACT GAP | P1 |
| Lọc pending CT01 và xuất sau rà soát | Có: §§8,21.7 | Spec §5.6 định nghĩa, runtime route chưa implement/mount | Status có thể lọc; export không chỉ dựa DB | Chưa có flow V1 CT01 | BACKEND CONTRACT GAP | P1 |
| Resident quản lý Vehicle/Parking | Có: §§2.2,7,14 | Spec §5.11 mô tả; runtime V1 modules/routes chưa có | Vehicle/parking tables tồn tại | Portal chưa có V1 API/UI | BACKEND CONTRACT GAP | P1 |
| Resident tạo/xem Complaint và lịch sử | Có: §§2.2,15,21.7 | Spec §5.12 mô tả; runtime V1 modules/routes chưa có | Complaint + history tables tồn tại | Portal chưa có V1 API/UI | BACKEND CONTRACT GAP | P1 |
| Lịch sử đăng ký lưu trú có ngày/chứng từ | Không quy định trong Requirement | API trả enum status, không có workflow/chứng từ trong contract | Resident lưu enum status, không thấy registration document model | FE chỉ hiển thị status | NOT REQUIRED | — |
| Province/address trong danh sách Resident | Requirement chỉ cần khu/phòng; không yêu cầu tỉnh/thành ở list | Detail API trả Property address/province; list trả Property name | Property có province/address | List hiện khu + phòng; detail/portal hiện address khi API có | NOT REQUIRED cho list; hiện đủ mục tiêu location | — |
| Thời hạn còn lại dạng số ngày | Không yêu cầu cách tính | API trả start/end dates, không có “days remaining” | Contract dates | Không tính ngày còn lại | NOT REQUIRED | — |
| Complaint nằm bên trong Resident detail Admin | Complaint là domain/luồng riêng; Requirement không yêu cầu ghép vào hồ sơ | Complaint scoped API chưa implement | Relation tồn tại | Không ghép vào detail | NOT REQUIRED trong Resident detail | — |
| Privacy: CCCD/Owner/role/Resident khác | Có: §§3,20 | Backend session-scoped; generic foreign 404; exact Owner CCCD lookup | residents.owner_id + scoped relations | Không gửi owner_id; IDs là string; portal không dùng Resident ID/query | KEEP; không thấy P0 gap | — |

## 7. BUSINESS GAP ON FE

1. **Contract summary không đồng đều giữa Admin và Resident.** Resident portal đã hiện representative Contract dates/status/capacity và occupancy-linked mã/status, nhưng Admin Resident detail chỉ hiện mã hợp đồng trong lịch sử dù Resident detail API trả dates/status/capacity. Nên bổ sung summary read-only cho Admin detail theo response sẵn có.
2. **Resident chưa xem Contract detail/tệp của mình.** Requirement cho Resident xem hợp đồng; Contract API hiện có Resident-safe detail/document access. Portal hiện chỉ có summary và chưa có link/document action. Đây là FE gap có backend support; không cần tích hợp toàn bộ Contract authoring/admin module để giải quyết.

Không xếp thiếu name/phone search, ngày/chứng từ đăng ký lưu trú, thời hạn còn lại dạng số ngày, province trong bảng cư dân, hoặc complaint nhúng vào hồ sơ thành FE gap vì Requirement hiện hành không yêu cầu các cách trình bày đó. API Spec cho phép Resident đọc một số tài liệu Contract; Requirement chưa chốt riêng nhu cầu tải tệp của Resident, vì vậy quyền/tác vụ download cần được xác nhận trước khi đưa vào scope UI.

## 8. BACKEND CONTRACT GAP

Các mục dưới đây được Requirement/API Spec nêu nhưng runtime V1 hiện chưa hỗ trợ; **không tạo UI giả hoặc dùng endpoint legacy**:

1. `GET/PATCH /me/profile`: người dùng phải có khả năng cập nhật hồ sơ theo Requirement §16; Spec có route nhưng current V1 router/auth implementation không có. FE cũng chưa có client/form. Backend contract/runtime phải được reconcile trước khi làm UI.
2. Account invitation/link cho Resident: Spec §5.2 và DB có quan hệ/invitation, nhưng V1 router chưa mount `/accounts` hoặc `/residents/{id}/account-invitations`. Phải có flow để Admin gắn tài khoản an toàn và Resident đăng nhập; các route platform-admin legacy không thay thế API này.
3. CT01 pending/export: Requirement §§8/21.7; Spec §5.6 định nghĩa exact paths, nhưng route/service không có trong backend hiện tại. Cần backend export API và bảo đảm Property/Owner scope trước khi FE hiển thị danh sách/xuất.
4. Vehicle/Parking: Requirement §§2.2,7,14; Spec §5.11 có contract chi tiết, database có tables, nhưng không có runtime V1 router/repository/client tương ứng. Cần API scoped cho Admin và Resident trước UI.
5. Complaint Resident self-service: Requirement §§2.2/15; Spec §5.12 nêu create/list/detail/history, nhưng module/routes chưa có trong V1 runtime. FE không được join Complaint theo Resident từ suy đoán.
6. **Quan hệ giữa Resident `residence_status` và Occupancy lifecycle chưa được chốt/đồng bộ.** API cho PATCH `living|left` độc lập; end/transfer Occupancy không tự đổi `residence_status`. Requirement §7 yêu cầu các dữ liệu liên quan nhất quán nhưng không định nghĩa hai trạng thái có nguồn nào chi phối. Cần chốt business rule rồi mới yêu cầu backend enforce; FE không nên tự đồng bộ một trạng thái theo suy đoán.

Ngoài các business gaps này, API Spec §5.5 ghi nhận durable idempotency replay chưa được implement dù mutation yêu cầu `Idempotency-Key`. Đây là blocker hạ tầng/reliability cần xử lý trước production; không thay đổi FE flow thành optimistic success.

## 9. UX GAP (không đồng nghĩa thiếu nghiệp vụ)

- Admin Resident detail để chỉnh `residence_status` và thao tác End occupancy ở hai khu vực riêng. Người dùng có thể hiểu hai field là một; cần làm rõ “trạng thái hồ sơ cư trú” so với “trạng thái lượt ở trong phòng” và nêu hậu quả trước khi cho chọn `Đã rời đi`. Không tự gắn hai giá trị.
- Nhãn `Chưa hoàn tất` ở filter/list ngắn và có thể không rõ là đăng ký lưu trú; nên dùng “Chưa hoàn tất đăng ký lưu trú” nhất quán. Các enum `residence_status`, `residence_registration_status`, occupancy `status` hiện được map riêng, không bị gộp ở FE.
- Form chuyển phòng liệt kê các phòng đích và status nhưng chưa cho thấy occupancy/capacity summary ngay trong từng option. Đây là cải thiện hỗ trợ quyết định (backend vẫn là authority); server conflict hiện vẫn phải được xử lý đúng.
- Admin detail chỉ hiện mã Contract thay vì summary dates/status/capacity trả về. Phần này cũng là business gap về thông tin, nêu ở §7; link và cách hiển thị là UX của bước tiếp theo.
- Admin list có CCCD đầy đủ để thực hiện hồ sơ/tra cứu. Quyền hiện Owner-scoped; nên giữ quyền Admin và không đưa CCCD sang portal/Room history. Nếu sau này giảm hiển thị, không được làm hỏng use case kiểm tra CCCD mà Requirement yêu cầu.

## 10. Residence status và residence-registration status

| Khái niệm | Stored value / nguồn | Display hiện tại | Đánh giá |
|---|---|---|---|
| `residence_status` | Resident enum: `living` / `left` | “Đang ở” / “Đã rời đi” | Tình trạng cư trú/hồ sơ; Admin filter và edit |
| `residence_registration_status` | Resident enum: `not_completed` / `temporary_resident` / `temporary_absence` | “Chưa hoàn tất”, “Tạm trú”, “Tạm vắng”; portal dùng “Đã đăng ký tạm trú”, “Đăng ký tạm vắng” | Tình trạng đăng ký tạm trú/tạm vắng; Admin filter/edit; không phải occupancy |
| Occupancy `status` | RoomResident lifecycle: `active` / `ended`; kèm `started_at`/`ended_at` | “Đang ở” / “Đã kết thúc” | Trạng thái một lượt gắn với phòng; backend end/transfer bảo toàn history |

FE đang tách ba khái niệm đúng về mặt mapping. Tuy nhiên hai `residence_status` và Occupancy chưa có rule sync ở backend; không suy ra một cái từ cái kia cho tới khi business rule được phê duyệt. Requirement hiện chỉ yêu cầu trạng thái registration, chưa yêu cầu ngày nộp/chứng từ hoặc workflow pháp lý.

## 11. Occupancy, location, capacity và Contract

- Admin Resident detail và Resident portal có Property/Room, ngày bắt đầu/kết thúc, active/ended. API chi tiết trả thêm province/address; Requirement cần khu/phòng nhưng không yêu cầu tỉnh/thành trong danh sách.
- Room history panel lấy danh sách occupancy từ `GET /rooms/{room_id}/residents`; Resident history lấy từ detail hoặc `/me/rental`. Đây là history server-backed, không dựng từ danh sách Resident hiện tại.
- FE gửi ngày end/transfer; backend validate ngày không trước ngày bắt đầu. Transfer gửi destination `room_id`, source occupancy ID, ngày và `contract_id: null` để backend chọn Contract phù hợp.
- Capacity được backend quyết định theo Contract snapshot tại ngày hiệu lực hoặc Room default nếu không có Contract áp dụng. FE không được dùng `default_capacity` để override Contract capacity; lỗi 409 không được biến thành thành công.
- Requirement yêu cầu tra cứu Contract theo cư dân/phòng và xem phần được phép. `/me/rental` và Resident detail API trả summary; Contract detail/document API có privacy filtering. Portal chưa expose các hành động đọc đó.
- Không có Requirement về “còn X ngày”; có thể format ngày bắt đầu/kết thúc nhưng không tự thêm công thức/cảnh báo thời hạn.

## 12. Privacy / role observations

**Đã xác nhận từ source hiện tại:**

- Admin Resident pages ở `AdminShell`; Resident route tự redirect admin sang Admin area và unauthenticated user về login.
- Portal chỉ gọi `residentApi.meRental()` không truyền resident/owner ID. `/me/rental` derives Owner + Resident từ auth session.
- CCCD search dùng POST body exact 12 số, không đưa CCCD vào URL. API/backend search theo authenticated Owner; foreign Owner được che bằng generic 404.
- FE không gửi `owner_id` khi create/update/add/transfer. IDs giữ dạng string để không mất độ chính xác BigInt.
- Resident portal không render CCCD hoặc hồ sơ người thuê khác. Admin room history chỉ hiển thị tên Resident, không CCCD.
- Backend archive/occupancy/transfer scope được kiểm tra lại; UI role gate chỉ là UX, không phải security boundary.

**Kết luận:** chưa thấy P0 FE privacy issue trong các flow được implement. Chưa runtime smoke với tài khoản đăng nhập trong lượt audit này; kết luận là source review, không phải kiểm chứng session live.

## 13. Cross-domain dependencies

| Domain | Resident dependency | Hiện trạng | Hướng xử lý |
|---|---|---|---|
| Account/Auth | Resident cần account; self profile | Login/session có; account invitation và `/me/profile` thiếu runtime routes/client | Chốt và hoàn thiện backend V1 contract trước FE |
| Contract | Own contract information; capacity context | Backend Contract routes có Resident visibility; FE chỉ summary | FE read-only Contract detail riêng; chỉ đưa download vào sau khi quyền Resident được chốt, không nhập Contract lifecycle |
| CT01/residence registration | Pending residents across Property, reviewed export | Requirement + Spec có; runtime route chưa có | Backend scoped query/export rồi FE review/confirm |
| Vehicle/Parking | Own vehicles/slots and Admin view | DB/Spec có; backend module chưa có | Backend API + validation/privacy trước FE |
| Complaint | Resident create and read own history | DB/Spec có; backend module chưa có | Complaint API first; no guessed joins |
| Invoice/payment/amenity/notification | Resident role broad self-service needs | Requirement mentions; domains are outside this audit, some frontend remains legacy/not V1 integrated | Separate domain integration audit/task; do not attach fake data to Resident profile |

## 14. Khuyến nghị thứ tự triển khai

1. **P0 – privacy/security:** không có FE P0 blocker tìm thấy; tiếp tục giữ `me/*` session-derived, CCCD owner-scoped, role gates và không chấp nhận authority IDs từ client.
2. **P1 – chốt consistency rule:** định nghĩa quan hệ giữa `residence_status` và occupancy lifecycle, rồi cập nhật API/backend validation nếu cần. Không workaround ở FE.
3. **P1 – backend contract gaps:** `/me/profile`, Resident account invitation/link, CT01 pending/export, Vehicle/Parking và Complaint. Implement/test scope, conflict và Owner/Resident privacy trước khi tạo UI.
4. **P1 – FE thông tin đã có API:** hoàn thiện Contract summary ở Admin Resident detail; thêm Resident-safe Contract detail/document navigation trong portal.
5. **P2 – UX cleanup:** làm rõ nhãn ba trạng thái, cân nhắc thông tin occupancy/capacity trong destination selector, đặt CTA theo workflow Resident/Occupancy.
6. **SaaS redesign:** chỉ sau khi các capability và API dependency được khóa; giữ separation giữa hồ sơ, registration status, Occupancy lifecycle và Contract.

## 15. Đề xuất scope cho bước SaaS redesign kế tiếp

Sau khi backend gaps được giải quyết, redesign tập trung vào một workflow Admin “Hồ sơ cư dân → Nơi ở hiện tại → Lịch sử/Chuyển phòng → Contract/registration actions” và một Resident portal “Nơi ở → Contract detail → xe → tiện ích/khiếu nại”. Chỉ thêm tải tệp Contract nếu business policy xác nhận Resident được xem file. Mỗi panel chỉ dùng endpoint đã có; `residence_status`, registration status và occupancy status phải có nhãn/nguồn riêng. Đây là đề xuất scope, chưa triển khai.

## 16. Files inspected

**Source-of-truth tài liệu:**

- `D:\codexapp\GocTro-SmartBuilding\docs\01_REQUIREMENTS.md` — §§2, 3, 7–9, 14–16, 20, 21.3, 21.6–21.8.
- `D:\codexapp\GocTro-SmartBuilding\docs\04_API_SPEC.md` — §§2, 5.1–5.2, 5.5–5.7, 5.11–5.12, 10–11.

**Backend:**

- `backend/src/app.ts`
- `backend/src/auth/v1.router.ts`
- `backend/src/auth/auth.routes.ts`
- `backend/src/residents/resident.routes.ts`
- `backend/src/residents/resident.repository.ts`
- `backend/src/residents/resident.validation.ts`
- `backend/src/residents/resident.test.ts`
- `backend/src/properties/property-room.routes.ts`
- `backend/src/properties/property-room.repository.ts`
- `backend/src/contracts/contract.routes.ts`
- `backend/src/contracts/contract.repository.ts`

**Database / frontend:**

- `database/schema.prisma`
- `frontend/src/app/admin/tenants/page.tsx`
- `frontend/src/app/admin/tenants/resident-management.tsx`
- `frontend/src/app/admin/tenants/[residentId]/page.tsx`
- `frontend/src/app/admin/tenants/[residentId]/resident-detail.tsx`
- `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx`
- `frontend/src/app/admin/properties/[propertyId]/rooms/resident-room-panel.tsx`
- `frontend/src/app/tenant/page.tsx`
- `frontend/src/app/tenant/tenant-portal.tsx`
- `frontend/src/lib/api/residentApi.ts`
- `frontend/src/lib/api/occupancyApi.ts`
- `frontend/src/lib/api/authApi.ts`
- `docs/07_modules/resident-occupancy/FRONTEND_INTEGRATION_PASS_2_RESIDENT_OCCUPANCY_REPORT.md` (historical integration report, corroborating only)
- `docs/07_modules/contract/CONTRACT_API_V1_3_RESIDENT_SUCCESSOR_PRIVACY_FIX_REPORT.md` (privacy fix evidence)

## 17. Change boundary

- Created: `docs/07_modules/resident-occupancy/RESIDENT_OCCUPANCY_BUSINESS_AUDIT.md`
- Backend modified: **NO**
- Database / Prisma / migration / seed modified: **NO**
- Frontend modified: **NO**
- Tests or live data mutations run: **NO**
- Redesign / Contract implementation started: **NO**
