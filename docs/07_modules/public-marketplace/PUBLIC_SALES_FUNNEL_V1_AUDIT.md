# Góc Trọ — Public Website / Sales Funnel V1 Audit

**Ngày audit:** 11/10/2026  
**Trạng thái:** `AUDIT COMPLETE / CONTRACT UPDATED / IMPLEMENTATION PENDING`  
**Phạm vi:** public homepage, public listing/search/detail/contact source path, V1.3 Prisma/schema, canonical Requirement/API Spec, Admin Property/Room API scope, legacy marketplace references.  
**Không thực hiện:** UI redesign, frontend/backend implementation, schema/Prisma/migration/seed changes, runtime data mutation.

## 1. Executive summary

Homepage hiện nằm ở `/` và được render bằng Next.js. Đây là trang marketing có nội dung tĩnh, đồng thời có code gọi public endpoints chưa được tích hợp với API V1.3. Có route legacy unversioned trong `backend/src/app.ts`, nhưng route này dùng các field/model của Prisma demo cũ. API V1 router hiện không mount Public Room hoặc Contact Request endpoints. Chưa có room detail route; CTA hiện tại là form yêu cầu lịch xem, không phù hợp nghiệp vụ contact-only V1.

Database V1.3 đã có đủ field Room/Property cơ bản cho listing và bảng `contact_requests` để lưu lead tối thiểu. Không có image storage/model, Room-level amenities, public consent flag cho số điện thoại chủ trọ, hay source attribution. Kết luận: **Public Sales Funnel V1 chưa E2E-complete; P0 là backend/API V1 public list/detail/contact, sau đó FE tích hợp đúng contract và Admin xử lý contact request.**

## 2. Public routes hiện tại

| Route | Hiện trạng source | Kết luận |
|---|---|---|
| `/` | `frontend/src/app/page.tsx` render `HomePage` | Có; homepage đơn |
| `/rooms` | Không thấy route trong `frontend/src/app/` | Chưa có listing page route riêng |
| `/rooms/[id]` | Không thấy dynamic public Room route | Chưa có detail page route |
| `#phong`, `#lien-he`, `#vi-sao`, `#dich-vu` | Các section anchor trên `/` | Không thay thế listing/detail routes |
| `/login` | CTA điều hướng trong homepage | Auth route riêng, ngoài funnel contact |

## 3. Homepage current state

Component là `frontend/src/app/home-page.tsx`; metadata nằm trong `frontend/src/app/page.tsx`.

| Thành phần | Phân loại | Quan sát |
|---|---|---|
| Hero, lợi ích, dịch vụ, footer, copy marketing | `STATIC CONTENT` | Nội dung hardcode; không lấy từ DB/API |
| Khu vực phổ biến | `STATIC CONTENT` | Ba chip Hồ Chí Minh, Hà Nội, Đà Nẵng; bấm chip chỉ đặt search query |
| Room list | `LEGACY API` | Fetch `/api/public/rooms` unversioned; kiểu camelCase legacy |
| Phòng minh họa trong card | `PLACEHOLDER` | Dùng `.room-art`/mã phòng; không phải ảnh phòng |
| CTA “Hẹn xem phòng” và form | `LEGACY BOOKING FLOW` | Thu ngày/giờ ưu tiên rồi POST viewing request |
| Đăng nhập | Link | `/login` |

Fetch lỗi ban đầu bị chuyển thành danh sách trống mà không hiện lỗi; vì vậy trạng thái rỗng có thể che lỗi API. Dữ liệu card kỳ vọng `floor`, `landlordName`, `rentVnd`, `areaM2`; không khớp V1 public allowlist. Nút CTA scroll xuống form thay vì điều hướng tới chi tiết phòng.

## 4. Public API current state

Canonical API Spec hiện định nghĩa `GET /api/v1/public/rooms`, `GET /api/v1/public/rooms/{room_id}`, và `POST /api/v1/public/contact-requests`. V1.3 `createV1Router` chỉ mount Auth, Property/Room, Resident/Occupancy, Contract, Invoice/Zalo. Không có router Public Marketplace hoặc Contact Request.

Root `backend/src/app.ts` còn giữ legacy `GET /api/public/rooms` và `POST /api/public/viewing-requests`. Listing truy vấn các field cũ `isListed`, `condition`, `rentOverrideVnd`, `defaultRentVnd`, `floor`; contact ghi model cũ `roomViewingRequest`. Những field/model này không có trong Prisma V1.3. Source chứng minh đây là legacy dependency không tương thích mapping hiện hành; chưa thể kết luận HTTP runtime cụ thể vì localhost không truy cập được trong môi trường audit.

Đã thử GET read-only tới `localhost:3000/`, `localhost:4000/api/health`, legacy public list và V1 public list; công cụ sandbox trả lỗi socket permission (`An attempt was made to access a socket in a way forbidden by its access permissions`). Đây **không** xác nhận server tắt hay endpoint trả lỗi; live runtime/request logs không được kiểm chứng.

## 5. Room listing current state

FE gửi `search`, `page`, `pageSize`; legacy route search theo `Property.province`, **Property.name**, `Property.address`, phân trang 1-based và mặc định 24. Query không có price/area/capacity filters, và page size/response camelCase không khớp chuẩn API V1 (`page_size`, `meta`, snake_case). FE không gửi `credentials`/CSRF cho POST; public endpoint không cần session theo contract, nhưng abuse control vẫn cần server-side.

Legacy availability predicate chỉ loại Contract `PENDING_SIGNATURE`/`ACTIVE`, kiểm tra Room `condition=READY`, `isListed`, Property `ACTIVE`. Predicate này không kiểm tra `rooms.is_public`, `rooms.is_active` hoặc active `room_residents`; do đó không thể dùng làm V1 visibility authority và có thể bỏ sót occupancy.

## 6. Room detail current state

Không có frontend detail route/component hoặc public detail API implementation trong V1 router. Card bộc lộ một số nội dung ngay ở homepage, không có server revalidation trước khi hiển thị/chuyển contact. Canonical V1 route được xác định là `GET /api/v1/public/rooms/{room_id}`; `/rooms/[id]` là route FE đề xuất cho phase sau, chưa tồn tại.

## 7. Contact/lead current state

Form hiện là appointment-style: visitor name, phone, email, room, preferred date/time, note; POST `/api/public/viewing-requests`; backend legacy lưu `RoomViewingRequest` và message thành công xác nhận lịch xem. Đây là booking/viewing semantics ngoài V1, không phải Contact Request.

Database V1.3 đã có `contact_requests` với `property_id`, nullable `room_id`, requester name, phone, optional email/message, status và timestamps. Prisma relations liên kết đúng Property và Room cùng Property. Canonical API Spec có contract Contact Request contact-only; nhưng backend V1 public POST và Admin inbox chưa được mount/triển khai ở source đã audit. Không có `source` column; không đưa source attribution thành yêu cầu V1.

## 8. Data available from DB/API

| Dữ liệu | DB V1.3 | V1 Property/Room API | Public API hiện tại |
|---|---|---|---|
| Room code | `rooms.room_code` | Có | Legacy dùng `roomNumber` |
| Rent | `rooms.default_rent` | Có | Legacy dùng rent override/default cũ |
| Area | `rooms.area_m2` | Có | Field V1 Room API có |
| Capacity | `rooms.default_capacity` | Có | Field V1 Room API có |
| Publish/active/status | `is_public`, `is_active`, `status` | Có; status có thể derived | Legacy dùng `isListed`, `condition` |
| Property name/province/address | Có | Property API có | Legacy có, nhưng name được đưa vào search |
| Public description | `rooms.public_description` | Có | Legacy không có |
| Room/Property images | Không có model/URL/storage field | Không | Không; art đang thấy là placeholder |
| Room amenities | Không có Room relation | Không | Không; Property amenity catalog không đồng nghĩa tiện ích riêng của Room |
| Owner phone | `owners.contact_phone` | Internal profile data | Không có public consent/allowlist contract |
| Lead persistence | `contact_requests` | Có schema | Public/Admin V1 routes chưa implement |

## 9. Privacy/security

V1 listing/detail phải chỉ expose allowlist công khai và không lộ Owner/account IDs, resident/CCCD, occupancy, Contract, Invoice hoặc manager fields. Availability phải được tính tại server; `is_public=true` không được dùng để công khai phòng inactive/occupied hoặc Property archived.

Public form không cần account. Backend derives Property from Room where applicable and Owner from Property. Client cannot submit `owner_id` as authority. Rate limit/abuse protection and PII-safe logs remain production requirements. Owner contact phone is not exposed until there is an explicit consent/public visibility rule. Public detail unknown, private, occupied or inactive must be indistinguishable (`404`).

## 10. Mock/legacy dependencies

- FE homepage is real source code but its data path is legacy API, not V1 integration.
- Marketing/chips are static copy, not evidence of room inventory, regional demand, verification or service availability.
- Room graphic is placeholder art, not stored listing photography.
- The legacy room-viewing form and Admin `/admin/viewings` use appointment concepts and old endpoints/model. Do not map them silently into V1 contact requests.
- V1.3 schema and canonical API Spec are the authority for new implementation; old demo database/model must not drive the V1 contract.

## 11. V1 sales funnel

`/` homepage/search → `/rooms` listing with server pagination/filters → `/rooms/[id]` detail revalidated by public API → contact-only form/CTA → persisted `contact_requests` scoped via Property → Admin contact-request inbox and status update (`new/contacted/closed`).

No account required; no booking, appointment time, reservation, deposit, payment, online contract, or claim that a request is an accepted viewing. Routes `/rooms` and `/rooms/[id]` are phase implementation routes, not current routes.

## 12. Search/filter contract

| Capability | Classification | Evidence/decision |
|---|---|---|
| Province/city | `SUPPORTED` | `properties.province` |
| Address/location | `SUPPORTED` | `properties.address`; case-insensitive partial match |
| Keyword | `SUPPORTED WITH LIMIT` | Only province/address; never Property name or room code as implicit search |
| Price range | `SUPPORTED` | `rooms.default_rent` BigInt VND |
| Area range | `SUPPORTED` | `rooms.area_m2` decimal |
| Minimum capacity | `SUPPORTED` | `rooms.default_capacity`; `capacity_min` added to canonical API contract |
| Availability selector | `NOT A PUBLIC FILTER` | Only available Rooms may be listed; no client option to reveal other states |
| Pagination | `SUPPORTED` | Standard page/page_size and meta envelope |
| Sort | `SUPPORTED` | `newest`, `price_asc`, `price_desc`, `area_asc`, `area_desc`; stable ID tie-breaker |
| Search by Property name | `NOT SUPPORTED` | Explicitly excluded |

All supported filters use existing structured V1.3 fields; no schema change is needed.

## 13. Room list card fields

V1 public allowlist: `room_id`, `room_code`, Property `name/province/address`, `default_rent`, `area_m2`, `default_capacity`, server-derived `status=available`, and nullable `public_description`. Do not display floor, landlord person name, image gallery, room amenities, ratings/reviews, promotion, or “verified” badges without an authoritative source and approved contract.

## 14. Room detail fields

Use the same public allowlist as listing, plus full `public_description` and contact CTA. No images/amenity gallery in V1. Do not include owner IDs/contact internals, residents, occupancy counts, Contract, invoices, archived/private fields, or admin metadata.

## 15. Contact flow

V1 contact body: `room_id` or `property_id` (Room determines Property when supplied), `requester_name`, `phone`, optional `email`, optional `message`. If both target IDs are supplied they must match. Server validates the target's active/public/available state, resolves the Owner, stores `contact_requests.status=new`, and returns only safe request acknowledgement. Admin list/detail/status APIs are Owner-scoped; statuses are `new`, `contacted`, `closed`. There is no schedule/date/time or booking status.

CTA wording: “Xem phòng”, “Xem chi tiết”, “Liên hệ thuê phòng”, “Gửi thông tin liên hệ”. Avoid “Hẹn xem phòng”, “Đặt ngay”, “Giữ phòng”, “Thanh toán”, “Đặt cọc”.

## 16. Gap classification

| Gap | Class | Priority |
|---|---|---|
| Public Room list/detail and Contact Request V1 routers/repositories | `B. BACKEND/API` | P0 |
| Owner-scoped Contact Request Admin list/detail/status implementation | `B. BACKEND/API` | P0 |
| FE V1 API helpers, listing/detail routes, contact-only form; retire legacy appointment contract in public path | `A. FRONTEND ONLY` | P0 |
| Room/Property image model, object storage, publication/consent workflow if gallery/owner phone is required | `C. DATABASE/SCHEMA` + `E. PRODUCTION INFRA` | P1/future decision |
| Real listing photos, complete public descriptions | `D. CONTENT/ASSET` | P1 |
| Contact abuse throttling, monitoring, PII-safe logs | `E. PRODUCTION INFRA` | P0 before public production |
| Responsive polish and SEO metadata per detail route | `A. FRONTEND ONLY` | P1 |
| `source` attribution field | `C. DATABASE/SCHEMA` | Not required V1; future decision only |

## 17. P0 / P1 / P2

**P0 — minimum working funnel:** implement exactly the V1 public list/detail/contact contracts; server-only visibility/availability filter; pagination/filter/sort; FE uses snake_case/meta/string IDs; contact persists to `contact_requests`; Admin can triage leads; safe empty/loading/error states; no appointment/booking or owner-private-data exposure; basic rate limit and PII-safe logs before production.

**P1 — useful after core:** actual room photography with approved schema/storage/publication flow; curated regional landing content; responsive and per-room SEO; source attribution only after approved business/schema decision.

**P2 — out of V1:** booking/viewing scheduler, reservation/hold, deposit/payment, saved rooms, reviews/ratings, map, AI recommendation. No SaaS subscription in this funnel.

## 18. Requirement changes

The existing public section already states guest room discovery, address/province/attribute search, detail, persisted contact to the correct Owner, no public booking, and no fake booking action. The audit did not need a further Requirement change. Its public language was already sufficient for this minimum flow; privacy/visibility details are now made explicit in the API Spec.

## 19. API Spec changes

Updated only `§5.3 Public rooms and contact requests` in canonical `GocTro-SmartBuilding/docs/04_API_SPEC.md`: exact V1 allowlist, server-derived availability, search/filter/pagination/sort names and bounds, public detail behavior, contact target/body/validation/persistence, no phone exposure absent consent, abuse/logging requirements, and explicit no booking semantics. This is a contract/documentation update, not API implementation. API version remains unchanged.

## 20. Schema gaps

No schema gap blocks the minimum V1 contact lead: `contact_requests` stores Property, optional Room, requester name, phone, email, message, status, timestamps; relations permit deriving the correct Property/Owner. Current schema also supports list/detail fields and filters including capacity.

Images require a future schema/object-storage/publication decision; no image field/model exists. Room-level amenities, public owner-phone consent, Zalo OA contact, and `source` attribution are not represented. They are not required for the minimum V1 contact-only funnel. No schema, Prisma, migration, or seed was changed.

## 21. Frontend gaps

- Current `/` expects an unversioned legacy response (`data` + `pagination`, camelCase) and sends `pageSize`; canonical API uses `/api/v1`, snake_case, `meta`, `page_size`.
- Search only has one free-form input and its legacy backend includes Property name; V1 must limit matching to address/province.
- No listing/detail route, no room-detail API call, no filters/sort beyond legacy search.
- Initial API failure appears as empty inventory; surface error separately from a genuine zero-result state.
- CTA/form imply appointment and send unsupported preferred date/time; replace with contact-only request.
- Remove unsupported floor, landlord name, placeholder gallery/amenities/verification claims from data-driven cards unless real authoritative values are later added.

## 22. Backend gaps

- Add anonymous read-only V1 public Room list/detail endpoints to the V1 router, with allowlist serializer and shared server availability rule.
- Add public Contact Request POST persisting existing table; derive target scope and reject unexpected authority fields.
- Add Admin Owner-scoped Contact Request list/detail/status routes; ensure foreign Property/request indistinguishable from missing.
- Retire or isolate legacy `/api/public/rooms` and `/api/public/viewing-requests`; do not adapt appointment rows into ContactRequest without a separate data decision.
- Add route/repository tests for all visibility states, tenant boundaries, filters/order/pagination, contact mismatch/validation, and no private fields.

## 23. Recommended implementation sequence

1. Implement/test backend/API missing public list, detail and contact-only POST against canonical §5.3; implement Admin Contact Request inbox/status with Owner scope.
2. Add frontend public API helpers for V1 snake_case, string IDs, pagination/meta, errors and contact body.
3. Redesign homepage within the existing brand direction; remove false appointment/unsupported claims.
4. Implement `/rooms` listing, filters, sort, pagination and explicit loading/empty/error states.
5. Implement `/rooms/[id]` detail, revalidate public state and contact CTA.
6. Implement contact submit/acknowledgement; no date/time, booking or reservation state.
7. Responsive pass and accessible forms/controls.
8. Browser smoke against real V1 database: public/private/occupied/inactive cases, filters, detail, successful contact persistence, and no information leakage.
9. Admin core regression (Auth, Property/Room, Resident/Occupancy, Contract, Invoice) after public route integration.

Do not start implementation as part of this audit pass.

## 24. Definition of Done for next phase

- All public endpoints are mounted in V1 and match canonical §5.3; no request falls through to legacy/demo Prisma models.
- Listing/detail only return public, active, available Room resources from active Properties; results expose only the documented allowlist.
- Province/address, rent, area and capacity filters, stable sort and pagination work server-side; Property-name search is absent.
- `/`, `/rooms`, `/rooms/[id]` are connected to V1 and show truthful loading, empty and error states.
- Contact-only submit persists once to `contact_requests`, derives Property/Owner safely, returns no private data, and appears in the correct Admin Owner inbox.
- No booking, viewing schedule, reservation, deposit/payment, or fake review/image/amenity data is present.
- Automated API tests and browser smoke pass; contact abuse throttling and PII-safe logging are verified before production.

## Sources and audit limits

- `docs/DOCUMENTATION_RULES.md`, `docs/DOCUMENT_CATALOG.md`
- `D:/codexapp/GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` §4 and `docs/04_API_SPEC.md` §§3, 5.3, 5.4, contact-request Admin contract and explicit out-of-scope section
- `frontend/src/app/page.tsx`, `frontend/src/app/home-page.tsx`, `frontend/src/app/globals.css`
- `backend/src/app.ts`, `backend/src/auth/v1.router.ts`, `backend/src/properties/property-room.routes.ts`, `backend/src/properties/property-room.repository.ts`
- `database/schema.prisma` V1.3 models `Owner`, `Property`, `Room`, `Amenity`, `ContactRequest`
- `docs/07_modules/property-room/PROPERTY_ROOM_END_TO_END_COMPLETION_REPORT.md`
- `docs/08_audits/MIGRATION_GAP_REPORT.md`, `docs/11_project-reports/BAO_CAO_TIEN_DO_DU_AN_GOC_TRO.md`

**Runtime limit:** live browser, backend logs, API response/status, and PostgreSQL rows were not verified: localhost requests from the audit tool were blocked by sandbox socket permissions. This report distinguishes static source evidence from runtime behavior and does not claim endpoint PASS.
