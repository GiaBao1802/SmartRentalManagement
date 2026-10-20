# Góc Trọ V1.6 — ERD PostgreSQL

ERD này mô tả Database V1.6: Database V1.5 được bổ sung khóa tham chiếu avatar Resident và PostgreSQL unique partial indexes cho phone Account/avatar key khác NULL. Giữ nguyên 28 bảng.

```mermaid
erDiagram
    OWNERS ||--o{ PROPERTIES : owns
    OWNERS ||--o| ACCOUNTS : admin_account
    OWNERS ||--o{ RESIDENTS : resident_scope
    OWNERS ||--o{ ACCOUNT_INVITATIONS : invitation_scope
    RESIDENTS ||--o{ ACCOUNT_INVITATIONS : invited_resident
    ACCOUNTS ||--o{ ACCOUNT_INVITATIONS : created_by_admin
    PROPERTIES ||--o{ ROOMS : contains
    ROOMS ||--o{ ROOM_IMAGES : gallery
    ROOMS ||--o{ ROOM_RESIDENTS : occupancy_history
    RESIDENTS ||--o{ ROOM_RESIDENTS : occupies
    CONTRACTS o|--o{ ROOM_RESIDENTS : context
    ROOMS ||--o{ CONTRACTS : leased_under
    CONTRACTS o|--o{ CONTRACTS : renewal_successor
    RESIDENTS ||--o{ CONTRACTS : representative
    CONTRACTS ||--o{ CONTRACT_CHANGE_HISTORY : revisions
    OWNERS ||--o{ CONTRACT_CHANGE_HISTORY : tenant_scope
    ACCOUNTS ||--o{ CONTRACT_CHANGE_HISTORY : changed_by
    CONTRACTS ||--o{ CONTRACT_DOCUMENTS : document_versions
    ACCOUNTS ||--o{ CONTRACT_DOCUMENTS : uploaded_by_admin
    RESIDENTS o|--o| ACCOUNTS : resident_login
    CONTRACTS ||--o{ INVOICES : billed
    INVOICES ||--o{ PAYMENT_TRANSACTIONS : attempts
    INVOICES ||--o{ INVOICE_ZALO_OA_SEND_LOGS : send_history
    PROPERTIES ||--o{ AMENITIES : offers
    AMENITIES ||--o{ AMENITY_PRICE_HISTORY : price_changes
    AMENITIES ||--o{ AMENITY_SUBSCRIPTIONS : subscribed
    RESIDENTS ||--o{ AMENITY_SUBSCRIPTIONS : subscribes
    CONTRACTS ||--o{ AMENITY_SUBSCRIPTIONS : eligibility
    AMENITY_SUBSCRIPTIONS ||--o{ AMENITY_SUBSCRIPTION_CYCLES : cycles
    INVOICES o|--o{ AMENITY_SUBSCRIPTION_CYCLES : billed_on
    PROPERTIES ||--o{ PARKING_AREAS : has_parking
    PARKING_AREAS ||--o{ PARKING_SLOTS : contains
    RESIDENTS ||--o{ VEHICLES : owns
    PARKING_SLOTS ||--o{ PARKING_SLOT_ASSIGNMENTS : assignment_history
    VEHICLES ||--o{ PARKING_SLOT_ASSIGNMENTS : assigned
    RESIDENTS ||--o{ PARKING_SLOT_ASSIGNMENTS : registered_by
    ROOMS ||--o{ PARKING_SLOT_ASSIGNMENTS : for_room
    CONTRACTS ||--o{ PARKING_SLOT_ASSIGNMENTS : under_contract
    PROPERTIES ||--o{ COMPLAINTS : receives
    ROOMS o|--o{ COMPLAINTS : about_room
    RESIDENTS ||--o{ COMPLAINTS : submits
    COMPLAINTS ||--o{ COMPLAINT_HISTORY : history
    ACCOUNTS o|--o{ COMPLAINT_HISTORY : actor
    PROPERTIES ||--o{ CONTACT_REQUESTS : receives
    ROOMS o|--o{ CONTACT_REQUESTS : inquiry_for
    ACCOUNTS ||--o{ NOTIFICATIONS : receives
    ACCOUNTS ||--o| NOTIFICATION_PREFERENCES : preferences
    OWNERS ||--o{ CONTRACT_IDEMPOTENCY_REQUESTS : tenant_namespace
    ACCOUNTS ||--o{ CONTRACT_IDEMPOTENCY_REQUESTS : actor_namespace

    OWNERS {
        bigint owner_id PK
        varchar display_name
        varchar contact_phone
        varchar contact_email
    }
    ACCOUNTS {
        bigint account_id PK
        bigint owner_id FK
        bigint resident_id FK
        varchar role
        varchar phone "canonical +84; unique when non-null"
        text password_hash
        varchar status
    }
    ACCOUNT_INVITATIONS {
        bigint invitation_id PK
        bigint owner_id FK
        bigint resident_id FK
        bigint created_by_account_id FK
        varchar token_hash UK
        varchar status
        timestamptz expires_at
        timestamptz accepted_at
    }
    PROPERTIES {
        bigint property_id PK
        bigint owner_id FK
        varchar property_code
        varchar name
        varchar province
        text address
        varchar status
    }
    ROOMS {
        bigint room_id PK
        bigint property_id FK
        bigint owner_id FK
        varchar room_code
        varchar status
        numeric area_m2
        bigint default_rent
        integer default_capacity
        boolean is_public
    }
    ROOM_IMAGES {
        bigint room_image_id PK
        bigint room_id FK
        varchar storage_key "shared across Rooms"
        boolean is_cover "unique per Room when true"
        integer sort_order
        timestamptz created_at
    }
    RESIDENTS {
        bigint resident_id PK
        bigint owner_id FK
        varchar national_id "UK(owner_id,national_id)"
        varchar full_name
        text avatar_storage_key "nullable; unique when non-null; external storage reference"
        varchar residence_status
        varchar residence_registration_status
        timestamptz archived_at
    }
    ROOM_RESIDENTS {
        bigint occupancy_id PK
        bigint room_id FK
        bigint property_id FK
        bigint owner_id FK
        bigint resident_id FK
        bigint contract_id FK
        date started_at
        date ended_at
        varchar status
    }
    CONTRACTS {
        bigint contract_id PK
        varchar contract_no UK
        bigint room_id FK
        bigint property_id FK
        bigint owner_id FK
        bigint representative_resident_id FK
        bigint previous_contract_id FK
        date start_date
        date end_date
        bigint rent_amount
        bigint deposit_amount
        integer resident_capacity
        varchar status
        integer revision "draft=0; official>=1"
    }
    CONTRACT_CHANGE_HISTORY {
        bigint change_id PK
        bigint contract_id FK
        bigint owner_id FK
        bigint changed_by_account_id FK
        integer revision UK
        varchar change_type
        varchar change_reason
        jsonb before_data
        jsonb after_data
        timestamptz created_at
    }
    CONTRACT_DOCUMENTS {
        bigint document_id PK
        bigint contract_id FK
        bigint property_id FK
        bigint owner_id FK
        varchar file_name
        text storage_key UK
        varchar mime_type
        bigint file_size
        varchar document_type
        integer version
        varchar checksum_sha256
        varchar status
        bigint uploaded_by_account_id FK
        timestamptz signed_at
    }
    INVOICES {
        bigint invoice_id PK
        varchar invoice_no UK
        bigint contract_id FK
        bigint property_id FK
        bigint owner_id FK
        date period_start
        date period_end
        date due_date "nullable while draft"
        timestamptz finalized_at "nullable while draft"
        bigint total_amount
        varchar status "draft, unpaid, paid"
        integer revision
    }
    PAYMENT_TRANSACTIONS {
        bigint payment_transaction_id PK
        bigint invoice_id FK
        uuid payment_session_id
        varchar provider
        varchar provider_transaction_id
        bigint amount
        varchar status
    }
    INVOICE_ZALO_OA_SEND_LOGS {
        bigint send_log_id PK
        bigint invoice_id FK
        bigint contract_id FK
        bigint property_id FK
        bigint owner_id FK
        bigint recipient_resident_id FK
        integer invoice_revision
        varchar status
        varchar provider_message_id
    }
    AMENITIES {
        bigint amenity_id PK
        bigint property_id FK
        bigint owner_id FK
        varchar amenity_type
        varchar name
        varchar registration_type
        boolean active
    }
    AMENITY_PRICE_HISTORY {
        bigint amenity_price_id PK
        bigint amenity_id FK
        timestamptz effective_at
        bigint price_amount
    }
    AMENITY_SUBSCRIPTIONS {
        bigint subscription_id PK
        bigint amenity_id FK
        bigint property_id FK
        bigint owner_id FK
        bigint resident_id FK
        bigint contract_id FK
        timestamptz started_at
        varchar status
        timestamptz cancellation_requested_at
        timestamptz effective_end_at
    }
    AMENITY_SUBSCRIPTION_CYCLES {
        bigint subscription_cycle_id PK
        bigint subscription_id FK
        bigint contract_id FK
        bigint property_id FK
        bigint owner_id FK
        timestamptz cycle_start
        timestamptz cycle_end
        bigint price_snapshot
        bigint invoice_id FK
    }
    PARKING_AREAS {
        bigint parking_area_id PK
        bigint property_id FK
        bigint owner_id FK
        varchar name
    }
    PARKING_SLOTS {
        bigint parking_slot_id PK
        bigint parking_area_id FK
        bigint property_id FK
        bigint owner_id FK
        varchar slot_code
        varchar status
    }
    VEHICLES {
        bigint vehicle_id PK
        bigint resident_id FK
        bigint owner_id FK
        varchar vehicle_type
        varchar plate_number
    }
    PARKING_SLOT_ASSIGNMENTS {
        bigint assignment_id PK
        bigint parking_slot_id FK
        bigint property_id FK
        bigint owner_id FK
        bigint vehicle_id FK
        bigint resident_id FK
        bigint room_id FK
        bigint contract_id FK
        date started_at
        date ended_at
        varchar status
    }
    COMPLAINTS {
        bigint complaint_id PK
        bigint resident_id FK
        bigint property_id FK
        bigint owner_id FK
        bigint room_id FK
        varchar category
        varchar priority
        varchar status
        timestamptz resolved_at
    }
    COMPLAINT_HISTORY {
        bigint complaint_history_id PK
        bigint complaint_id FK
        bigint actor_account_id FK
        varchar action
        varchar from_status
        varchar to_status
    }
    CONTACT_REQUESTS {
        bigint contact_request_id PK
        bigint property_id FK
        bigint room_id FK
        varchar requester_name
        varchar phone "unique when non-null; canonical +84"
        varchar status
    }
    NOTIFICATIONS {
        bigint notification_id PK
        bigint account_id FK
        varchar notification_type
        timestamptz read_at
    }
    NOTIFICATION_PREFERENCES {
        bigint account_id PK, FK
        boolean new_invoice
        boolean overdue_invoice
        boolean expiring_contract
        boolean complaint_updates
    }
    CONTRACT_IDEMPOTENCY_REQUESTS {
        bigint request_id PK
        bigint owner_id FK
        bigint account_id FK
        varchar operation_scope
        bytea idempotency_key_hash
        bytea request_fingerprint
        smallint fingerprint_version
        varchar state
        smallint response_status
        bytea response_ciphertext
        bytea response_nonce
        bytea response_auth_tag
        varchar response_key_version
        timestamptz created_at
        timestamptz completed_at
    }```

RoomImage is a per-Room association. A `storage_key` can appear in associations for multiple Rooms but only once per Room. Cover uniqueness is per Room. Physical image-object lifecycle is handled outside the relational database.

## Quy tắc dữ liệu và giới hạn enforcement

### Quan hệ và truy vết tenant

- `owners` là tenant root, không phải super-admin. `accounts` dùng cùng bảng cho hai role V1: Admin có `owner_id`, Resident có `resident_id`; `CHECK` loại tổ hợp role/link không hợp lệ và `UNIQUE` giới hạn một account cho mỗi owner hoặc resident.
- Việc tạo Owner và tài khoản Admin tương ứng phải nằm trong cùng transaction backend; schema bảo đảm mỗi Admin chỉ gắn một Owner, nhưng không buộc mọi Owner phải có account ngay trong lúc tạo.
- `account_invitations` lưu audit enrollment, chỉ lưu SHA-256 token hash; composite FK buộc Resident và Admin tạo invitation cùng Owner. Chỉ có tối đa một invitation pending/Resident; token/identity bất biến và row không được hard-delete. Plaintext token chỉ tồn tại trong flow bảo mật ngoài DB và không được ghi log.
- `contracts.previous_contract_id` nối hợp đồng successor với hợp đồng trước cùng Room/Owner; hợp đồng cũ không bị biến đổi thành hợp đồng mới. DB chặn self-reference và nhiều successor trực tiếp; backend transaction phải kiểm tra lineage không tạo cycle.
- `contract_documents` lưu metadata/version và object-storage key, không lưu binary. Mỗi version là record mới; unique `(contract_id, document_type, version)` giữ lịch sử. SHA-256 là checksum tùy chọn; bản signed cần `signed_at`.
- Session storage là infrastructure-level store, ưu tiên Redis hoặc server-side session store. Password-reset tokens cũng là transient security state: lưu hash với TTL tại Redis/secure infrastructure store; chưa thêm bảng PostgreSQL trong V1.1.
- `residents.owner_id` xác định hồ sơ cư dân thuộc tenant nào; `UNIQUE(owner_id, national_id)` cho phép cùng CCCD xuất hiện trong các Owner khác nhau nhưng không lặp trong cùng Owner. CCCD nullable; PostgreSQL cho phép nhiều NULL trong unique constraint mặc định.
- Bảng liên kết quan trọng mang khóa tenant để composite FK chặn nối chéo Owner: Room/Contract/Occupancy, Vehicle/Parking assignment, Complaint, Amenity subscription và Invoice/Zalo recipient. Admin account giữ `owner_id`; resident account nối profile qua `resident_id`, rồi Owner được suy ra an toàn từ Resident.
- `amenity_subscription_cycles` giữ `subscription_id, contract_id, property_id, owner_id`; composite FK buộc context này trùng subscription và composite FK Invoice buộc mọi hóa đơn được gắn trùng `invoice_id, contract_id, property_id, owner_id`. Invoice FK dùng `MATCH SIMPLE`, nên `invoice_id = NULL` hợp lệ khi cycle chưa được lập hóa đơn.
- FK đảm bảo liên kết tồn tại nhưng **không thay authorization**. Backend phải lấy owner từ session đã xác thực, join theo Property và từ chối mọi request ngoài scope. Không có super admin trong V1.
- `rooms` là entity riêng. Mã phòng unique trong Property. Không lưu `room_count` làm nguồn sự thật.
- `residents.national_id` unique trong phạm vi Owner, có thể null khi hồ sơ chưa có CCCD; `resident_id` surrogate PK tránh dùng PII làm khóa liên kết.
- `room_residents` lưu lịch sử cư trú; resident đại diện của Contract được lưu riêng, vì người ở cùng không phải đồng đứng tên. V1 không enforce một resident chỉ có một occupancy active toàn platform; capacity và tính hợp lệ occupancy do backend kiểm tra.

### Constraint/index trong schema

- PK/FK, NOT NULL, CHECK cho role/status, tiền không âm, capacity dương, định dạng CCCD 12 số, cycle đúng 720 giờ, `period_end >= period_start`, invoice total bằng tổng khoản phí.
- Unique Property code trong Owner; Room code trong Property; CCCD theo `(owner_id,national_id)`; resident account link; contract number; invoice number và `(contract_id,period_start,period_end)`.
- Partial unique index cho một contract active/Room; một active subscription cho resident/amenity; một assignment active/slot và active/vehicle; một payment success/invoice.
- Provider transaction/event ID unique khi có giá trị để hỗ trợ callback idempotent; cycle start unique trong subscription.
- FK lịch sử quan trọng dùng `RESTRICT`, không cascade xóa resident, contract, invoice, transaction, complaint, subscription hay parking history. Resident có `archived_at`; occupancy/assignment/subscription lưu trạng thái và thời điểm kết thúc.
- Invitation, contract lineage và document versions dùng FK `RESTRICT`; trigger chặn hard-delete invitation/document và chặn sửa metadata file của version cũ (chỉ cho cập nhật trạng thái/chữ ký). `contract_documents.storage_key` là opaque key; signed URL phải được tạo tạm thời qua backend, không lưu URL có hạn vào DB. Uploader được DB buộc là Admin cùng Owner; backend vẫn xác thực quyền trên session.
- `invoices` hỗ trợ lifecycle `draft → unpaid → paid`; draft có `due_date` và `finalized_at` NULL, còn unpaid/paid cần cả hai trường. `overdue` là trạng thái suy ra ở backend/API, không lưu trong database. `revision` phục vụ version gửi OA; `payment_transactions` là nguồn lịch sử từng attempt.

### Phải được backend enforce bằng transaction/locking

- Tenant authorization cho mọi truy vấn/thao tác/export; khi tra CCCD, backend lấy Owner từ authenticated session và query `residents.owner_id = authenticated_owner_id AND national_id = ...`. Không nhận Owner từ client làm nguồn xác thực, không có lookup CCCD xuyên tenant; không tìm thấy trong scope hiện tại phải không tiết lộ hồ sơ Owner khác.
- Backend sinh `period_start`/`period_end` theo chu kỳ bắt đầu từ `contracts.start_date`; tiền cọc không ảnh hưởng mốc và database không bắt kỳ đầu tháng hay ép mọi kỳ dài 30 ngày.
- Không có hai Contract có date range hiệu lực chồng lấn trên cùng Room. Partial unique bảo vệ một row `active`; backend khóa Room và kiểm tra overlap ngày trước create/renew/activate.
- Số occupancy active không vượt `resident_capacity` của Contract/Room; khóa Room/Contract khi thay đổi cư dân hoặc sức chứa.
- Composite FK chặn resident thuộc Owner này được nối vào occupancy, đại diện hợp đồng, vehicle, complaint, amenity subscription, parking assignment hoặc người nhận Zalo của Owner khác. Backend vẫn phải kiểm tra quyền trên authenticated session và nghiệp vụ người nhận Zalo có occupancy/contract hợp lệ.
- Invoice link của Amenity Cycle được database giới hạn trong cùng Owner/Property/Contract với Subscription; invoice null vẫn hợp lệ cho cycle chưa billing.
- `complaint_history.actor_account_id` liên kết account nhưng account Resident suy ra Owner qua profile; backend phải xác nhận actor thuộc cùng Owner của complaint trước khi ghi lịch sử. Resident account không nhân bản `owner_id`.
- Payment amount phải bằng số dư hóa đơn; chỉ cập nhật invoice paid sau callback hợp lệ; serialize callback/attempt theo invoice. Unique success index chặn hai payment success cho cùng invoice.
- Hai lần thất bại liên tiếp thuộc một payment session kết thúc phiên; các attempt được nhóm bằng `payment_session_id`, bộ đếm/điều hướng là application flow.
- Các cycle subscription không overlap và được nối tiếp chính xác; DB check duration/unique start, backend khóa subscription khi tạo cycle tiếp theo và lấy giá hiện hành từ `amenity_price_history` chỉ để chụp vào cycle mới. Cycle cũ giữ `price_snapshot`. Contract end phải chấm dứt subscription/assignment mà vẫn giữ history.
- Active parking assignments của Room không vượt sức chứa active Contract; khi giảm capacity phải khóa Contract/Room, kiểm tra số assignment và chặn thay đổi đến khi được xử lý. Unique index chặn cùng slot/vehicle có hơn một assignment active.
- Các assignment theo ngày lịch sử không được overlap theo khoảng ngày; ngoài unique index cho bản ghi active, backend phải kiểm tra temporal overlap khi cấp/gia hạn slot dưới transaction khóa slot.
- Zalo OA recipient được DB giới hạn cùng Owner với Invoice; backend phải xác nhận recipient có occupancy/hợp đồng thực sự liên quan tới Invoice/property; resend revision mới không xóa send log cũ.
- Backend phải từ chối invitation đã accepted/expired/revoked hoặc hết hạn, chỉ chấp nhận token một lần, và không tiết lộ token/hash. Khi renewal, backend kiểm tra predecessor chain không có cycle và dates không overlap. Khi tạo file version, cấp version kế tiếp trong transaction; upload object trước khi commit metadata hoặc có quy trình dọn object mồ côi.
- Không thêm `room_reports`, appointment booking, SaaS, staff assignment, refund, Foxi/OCR/Camera AI vào ERD V1.


## Contract audit and revision (V1.3)

- Draft Contracts have revision 0 and no history. Activation establishes revision 1; each later official mutation is expected to increment revision and append one event atomically in the backend.
- Existing V1.2 non-draft Contracts migrate to revision 1 without fabricated history. A migrated revision 1 may therefore have no matching history row.
- contract_change_history is append-only via a database trigger. Composite Contract/Owner and Account/Owner foreign keys prevent cross-tenant audit references; backend still authorizes the session and Admin role.
- History snapshots are JSON objects. Only activation, material_update, and status_transition are valid event types; material updates require a nonblank reason.

