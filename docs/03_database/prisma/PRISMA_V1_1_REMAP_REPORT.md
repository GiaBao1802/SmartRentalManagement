# Prisma remap report — Góc Trọ Database V1.1

**Kết quả:** Manual Prisma mapping hoàn tất, Prisma validate PASS, Client generate PASS. Backend typecheck/build còn legacy breakages và cần rewrite riêng.  
**Phạm vi:** Chỉ `database/schema.prisma`, bản lưu `database/schema.legacy.prisma`, và report này. Không introspect live DB, không chạy SQL/migration/seed, không sửa backend/frontend.

## 1. Source used

Prisma mapping được viết thủ công từ locked SQL source of truth:

- `GocTro-SmartBuilding/Database V1.1/schema.sql` — PostgreSQL 18 baseline, 25 bảng.
- `GocTro-SmartBuilding/Database V1.1/erd.md` — entity/relationship intent.
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md` — V1.1 hardening, LOCK và validation state.
- Các root product/API documents được dùng làm ngữ cảnh nghiệp vụ; SQL schema quyết định physical table, column, scalar type, nullability, default và FK.

Không dùng PostgreSQL connection, `DATABASE_URL`, `prisma db pull` hay database runtime trong lượt này. Source changelog xác nhận V1.1 đã runtime validate **21/21 PASS trên PostgreSQL 18**; report này không chạy lại validator. Hash SHA-256 của locked `schema.sql` khi kiểm tra: `9FD6F3F0166423739EE71406136031B38E0BBE9D9A73841D7CE3AEC84956460E`.

## 2. 25-table Prisma mapping matrix

`MATCH` ở đây nghĩa Prisma model/physical columns được ánh xạ thủ công theo DDL, không phải kết quả live introspection. Static comparison đếm **25 bảng SQL, 25 Prisma models, 0 bảng/model thiếu, 0 cột thiếu**.

| Database table | Prisma model | Status | Notes |
|---|---|---|---|
| `accounts` | `Account` | MATCH | BigInt identity; Owner/Resident optional one-to-one, role/status giữ `String` theo `varchar + CHECK`. |
| `account_invitations` | `AccountInvitation` | MATCH | Composite Resident/Owner và creator Account/Owner relations; token hash unique. |
| `amenities` | `Amenity` | MATCH | Property/Owner composite FK; SQL check-values giữ bằng String. |
| `amenity_price_history` | `AmenityPriceHistory` | MATCH | `effective_at` timestamptz, price bigint; unique amenity/effective time. |
| `amenity_subscription_cycles` | `AmenitySubscriptionCycle` | MATCH | Composite Subscription context; Invoice composite relation nullable; `price_snapshot` bigint. |
| `amenity_subscriptions` | `AmenitySubscription` | MATCH | Amenity, Resident và Contract scoped relations; cancellation timestamps nullable. |
| `complaint_history` | `ComplaintHistory` | MATCH | Complaint FK; actor Account nullable với `SET NULL`. |
| `complaints` | `Complaint` | MATCH | Resident/Property scope, optional Room composite FK. |
| `contact_requests` | `ContactRequest` | MATCH | Property required, Room optional theo composite `(room_id, property_id)`. |
| `contract_documents` | `ContractDocument` | MATCH | Contract/uploading Admin composite relations; checksum/signature metadata nullable như DDL. |
| `contracts` | `Contract` | MATCH | Room, representative Resident, renewal self-relation; không thêm Owner FK ngoài SQL. |
| `invoice_zalo_oa_send_logs` | `InvoiceZaloOaSendLog` | MATCH | JSONB response, invoice context và Resident/Owner recipient. |
| `invoices` | `Invoice` | MATCH | `period_start/period_end`; Contract composite FK; period unique. |
| `notification_preferences` | `NotificationPreference` | MATCH | Account PK/FK one-to-one. |
| `notifications` | `Notification` | MATCH | Account FK, nullable read timestamp. |
| `owners` | `Owner` | MATCH | BigInt identity và profile fields. |
| `parking_areas` | `ParkingArea` | MATCH | Property/Owner composite FK. |
| `parking_slot_assignments` | `ParkingSlotAssignment` | MATCH | Slot, Vehicle, Resident, Room, Contract composite FK contexts. |
| `parking_slots` | `ParkingSlot` | MATCH | ParkingArea/Property/Owner composite FK. |
| `payment_transactions` | `PaymentTransaction` | MATCH | UUID session, provider fields, VND char(3), timestamptz; checks/partial indexes documented below. |
| `properties` | `Property` | MATCH | Owner FK, owner/property-code unique, address text. |
| `residents` | `Resident` | MATCH | `national_id` nullable; owner-scoped unique; birth date and timestamps mapped. |
| `room_residents` | `RoomResident` | MATCH | Room/Resident/optional Contract composite relations and historical dates. |
| `rooms` | `Room` | MATCH | Property/Owner composite FK; positive area/capacity checks remain DB-only. |
| `vehicles` | `Vehicle` | MATCH | Resident/Owner composite relation; no legacy free-text parking slot column. |

Prisma model names in generated Client: `Account`, `AccountInvitation`, `Amenity`, `AmenityPriceHistory`, `AmenitySubscription`, `AmenitySubscriptionCycle`, `Complaint`, `ComplaintHistory`, `ContactRequest`, `Contract`, `ContractDocument`, `Invoice`, `InvoiceZaloOaSendLog`, `Notification`, `NotificationPreference`, `Owner`, `ParkingArea`, `ParkingSlot`, `ParkingSlotAssignment`, `PaymentTransaction`, `Property`, `Resident`, `Room`, `RoomResident`, `Vehicle`.

Physical identifiers remain the SQL names using `@map`/`@@map`; no schema SQL was renamed or edited. PostgreSQL scalar types are represented with the corresponding Prisma scalar/native type (`BigInt`, `Int`, `String`, `Boolean`, `DateTime`, `Decimal`, `Json`, `@db.VarChar`, `@db.Text`, `@db.Date`, `@db.Timestamptz`, `@db.Time`, `@db.Uuid`, `@db.Char`, `@db.JsonB`).

## 3. Relations mapped

The manual schema contains Prisma relations for the **44 SQL foreign-key clauses**. Composite unique constraints needed as referenced keys are included so Prisma can express scoped FKs. `onDelete: Restrict` and the `complaint_history.actor_account_id → accounts` `SetNull` behavior are represented.

Notable tenant-safe composites preserved:

- Room→Property/Owner; Contract→Room/Property/Owner and Representative Resident/Owner.
- Contract renewal predecessor→same Room/Owner; ContractDocument→Contract context and uploaded Admin/Owner.
- RoomResident→Room/Property/Owner, Resident/Owner, optional Contract context.
- Invoice→Contract/Property/Owner; Zalo log→Invoice context and recipient Resident/Owner.
- Amenity/subscription/cycle and invoice cycle links preserve their composite contexts.
- Parking slot/assignment relations preserve Property/Owner, Resident/Vehicle, Room and Contract scopes.
- Complaint relations preserve Resident/Owner, Property/Owner and optional Room/Property.

There is intentionally no Prisma Owner relation for a table whose SQL has no Owner FK. A scalar `owner_id` used only as part of another composite FK does not create an additional Owner FK.

Status/category/role values remain `String`, rather than Prisma enum declarations: the locked SQL stores `varchar` columns and constrains values with PostgreSQL `CHECK`; mapping them as enums would misstate physical PostgreSQL types.

## 4. DATABASE-ENFORCED RULES NOT FULLY REPRESENTED IN PRISMA

Prisma Client is a typed data access mapping. The locked PostgreSQL schema remains authoritative for these rules; do not remove or weaken them to make Prisma/backend compile.

| Database rule | Prisma representation | Backend responsibility | Database remains authoritative |
|---|---|---|---|
| CHECK constraints for status/role/category values, account role↔Owner/Resident shape, CCCD format, positive room area/capacity, money nonnegative, contract date/settlement, invoice totals, invitation expiry/accepted state, 720-hour amenity cycle, parking/complaint state consistency, signed document timestamp and other DDL checks | Not expressible as Prisma model validation; fields use physical scalar `String`/numbers | Validate request and return useful errors; never treat app validation as replacement | YES |
| Partial unique indexes: one pending invitation per Resident, one active Contract per Room, one successor per predecessor, nullable provider transaction/event uniqueness, one successful payment per Invoice, one active subscription, one active parking assignment per slot/vehicle | Prisma 6 schema does not represent the predicates; not replaced with broader unconditional unique constraints | Handle expected conflicts; use transactions/locking for concurrent workflow | YES |
| Partial nonunique indexes (public room listing; active resident indexes; cycles with Invoice; unread notifications) | Predicate cannot be encoded in this Prisma schema; intentionally not represented as unconditional indexes | None for correctness; performance monitoring/query planning | YES |
| Invitation identity/token immutability and no hard delete | No trigger representation | Create new invitation row; never overwrite/delete invitation history | YES |
| Contract document version metadata immutability and no hard delete | No trigger representation | Insert a new document version; archive rather than delete | YES |
| Composite FKs and ordinary unique/indexes | Relations, `@@unique`, `@unique`, `@@index` where Prisma supports them | Still authorize Owner from authenticated server context | YES |
| Contract date-range overlap and multi-step renewal cycle prevention | FK/partial unique only covers some properties; full temporal/cycle rule needs workflow logic | Lock Room/Contract and validate overlap/lineage in transaction | YES for database constraints; backend enforces remaining rule |
| Occupancy/resident capacity and parking capacity/temporal overlap | Scalar fields/relations only; no cross-row CHECK representation | Transaction/locking and server-side capacity checks | YES |
| Owner authorization, CCCD lookup privacy, actor/recipient eligibility, payment callback/idempotency/session retry, cycle non-overlap/renewal and external object-storage consistency | Not a Prisma schema invariant | Enforce per `04_API_SPEC.md` with authenticated Owner context, transaction and provider/file checks | YES for schema facts; backend owns application invariants |

Prisma does not encode the V1.1 check constraints as enums or duplicate them in generated logic. The single long PostgreSQL auto-named unique constraint for amenity subscription context uses its PostgreSQL 63-byte truncated name in `map`; no physical database rename is requested.

## 5. Legacy Prisma models no longer present

Legacy models absent/renamed in the new schema include:

- `UserAccount` → `Account` plus `Owner`/`Resident` tenant identity.
- `Tenant` → Owner-scoped `Resident`.
- `LeaseContract` → `Contract`; `ContractOccupant` → `RoomResident` only where a verified occupancy record exists.
- `ContractExtension`, `ContractTermination` → no same-named Prisma models; target renewal/termination fields do not recreate legacy models.
- `InvoiceLine`, `MeterReading` → no separate target tables; target Invoice contains approved amount/meter columns.
- `Payment` → `PaymentTransaction` is provider-attempt semantics and is not a model alias for manual legacy payments.
- `AmenityBooking`, `RoomViewingRequest`, `MaintenanceRequest` → no target models; targets are subscription/cycle, contact request, and complaint/history with different semantics.

Shared names such as `Property`, `Room`, `Invoice`, `Amenity`, `Vehicle` and `NotificationPreference` were remapped to V1.1 columns/relations; they are not unchanged legacy models. Legacy `UserRole` and other enums are not carried forward because the target uses varchar/checks.

## 6. Prisma validation and client generation

| Operation | Result | Notes |
|---|---|---|
| Static SQL-to-Prisma table/column mapping comparison | PASS | 25/25 tables, 25/25 models, no missing table/model or scalar column. |
| `prisma validate --schema ../database/schema.prisma` | PASS | Prisma CLI 6.12.0; no database connection. |
| `prisma generate --schema ../database/schema.prisma` | PASS | Generated Prisma Client v6.12.0; Client exposes 25 models. No database connection. |
| PostgreSQL version/target identity in this run | Not queried | Live DB connection intentionally not attempted; PostgreSQL 18 / 21/21 is the locked SQL source documentation state. |

The first sandbox attempt to generate hit a Windows `EPERM` resolving `node_modules/@prisma/client`; retrying the authorized workspace generate succeeded. No connection string or credential was printed or changed.

## 7. Backend typecheck/build result

Both commands completed and fail on the stale legacy backend contract:

| Command | Result | Diagnostics |
|---|---|---|
| `npm run typecheck --workspace=@goctro/backend` | FAIL | 209 TypeScript diagnostics, all in `backend/src/app.ts`. |
| `npm run build --workspace=@goctro/backend` | FAIL | Same 209 diagnostics, all in `backend/src/app.ts`. |

Diagnostic counts: `TS2339=107`, `TS2353=46`, `TS2551=17`, `TS2322=15`, `TS7006=10`, `TS2724=4`, `TS2694=3`, `TS7053=3`, `TS2345=2`, `TS2561=2`. The dominant errors are removed Prisma delegates/fields, legacy string IDs where V1.1 uses `BigInt`, legacy relation names, and implicit `any` after query type inference breaks. These are not validation/generation errors and backend was not edited.

## 8. Legacy backend references grouped by domain

All concrete route/delegate references found are in `backend/src/app.ts`; it is a monolithic Express file. Severity: P0 = auth/tenant or financial integrity; P1 = core business data; P2 = domain absent/not currently implemented. “Target” names are V1.1 direction, not authorization to make code changes in this remap task.

| Domain | File / legacy dependency | V1.1 target | Severity | Rewrite required? |
|---|---|---|---|---|
| Auth | `backend/src/app.ts:69-226`; `prisma.userAccount`, `tenant`, roles `ADMIN/LANDLORD/TENANT`, string session IDs | `accounts`, `owners`, `residents`; roles `admin/resident`; server-side session and Owner scope | P0 | Yes |
| Accounts | `backend/src/app.ts:279-317`; `userAccount`, username/displayName/isActive, `tenantId`, legacy role creation | `accounts`, `account_invitations`; Owner/Admin and Resident links | P0 | Yes |
| Properties | `backend/src/app.ts:322-438,871-883`; landlord account as owner, `Property.id/code`, string `ownerId` | `owners`, `properties.owner_id`, BigInt IDs and Owner-scoped queries | P0 | Yes |
| Rooms | `backend/src/app.ts:338-375,385-480`; `id`, `roomNumber`, `floor`, `condition`, `isListed`, `rentOverrideVnd` | `rooms.room_id/room_code/status/default_capacity/is_public/default_rent` with Property/Owner FK | P1 | Yes |
| Residents | `backend/src/app.ts:94,149,200-221,330-334,486-513,799-870`; `prisma.tenant`, global `nationalId`, `createdById` | `residents.owner_id`, scoped CCCD, account via Resident | P0 | Yes |
| Occupancy | `backend/src/app.ts:204-221,529-578,799-870`; current room inferred from one Tenant/Contract; no `room_residents` use | `room_residents` history + Contract context and capacity checks | P1 | Yes |
| Contracts | `backend/src/app.ts:108,204,220,366-375,529-588,888-913`; `leaseContract`, legacy status and extension/termination assumptions | `contracts`, `previous_contract_id`, termination/settlement fields; no `ContractExtension`/`ContractTermination` delegates | P1 | Yes |
| Contract Documents | No V1.1 document upload/version routes found in active API file | `contract_documents` metadata/version; binary in object storage | P1 | Yes; domain/API absent |
| Invoices | `backend/src/app.ts:205,595-629,859,915-944`; `billingYear`, `billingMonth`, `invoiceNumber`, `totalVnd`, `paidAt` | `period_start/period_end`, amount buckets, status/revision | P0 | Yes |
| Payments | `backend/src/app.ts:601,616`; manual `prisma.payment`, `CASH/BANK_TRANSFER/OTHER`, paid status set by API | `payment_transactions` MoMo/ZaloPay attempts/session; callback verification/idempotency | P0 | Yes |
| Amenities | `backend/src/app.ts:377-382,639-726,946-971`; old amenity fields and `prisma.amenityBooking` date/time booking | `amenities`, price history, subscriptions and 720-hour cycles; hourly booking is not a target model | P1 | Yes |
| Parking | No parking area/slot/assignment API; legacy `Vehicle.parkingSlot` exists in model | `parking_areas`, `parking_slots`, `vehicles`, `parking_slot_assignments` with contract capacity | P1 | Yes; domain/API absent |
| Complaints | `backend/src/app.ts:143,206,221,761-795,862,973-984`; `prisma.maintenanceRequest`, source/priority enums | `complaints`, append-only `complaint_history`; map only verified sender/Owner | P1 | Yes |
| Contacts | `backend/src/app.ts:256-275,730-757`; `roomViewingRequest`, preferred date/time and appointment status | `contact_requests` only; no viewing appointment | P1 | Yes |
| Notifications | No notification inbox/history/preferences calls found in active API | `notifications`, `notification_preferences` | P2 | Yes; domain/API absent |
| Zalo OA | No invoice Zalo send/log endpoints found | `invoice_zalo_oa_send_logs` by revision/recipient/status | P2 | Yes; domain/API absent |
| Dashboard | No owner dashboard/report aggregate endpoint found; tenant portal summary is legacy `/api/tenant-portal/summary` at `app.ts:197-211` | Owner-scoped reporting derived from V1.1 entities | P2 | Yes |
| CT01 | No pending-residence-registration export endpoint found | Property-wide pending registration derived from `residents`/`room_residents` | P2 | Yes |

Legacy string tokens found include `LANDLORD`, `TENANT`, platform `ADMIN`, `billingYear`, `billingMonth`, manual payment `OTHER` (and relevant CASH/BANK_TRANSFER path). They must not be reintroduced as aliases/models to suppress compile errors.

## 9. Seed and migration history status

- `SmartRentalManagement/database/seeds/seed.ts` is legacy/demo seed (calendar-month invoice fields, old Tenant/Contract/AmenityBooking/Payment and demo accounts). **Not run.**
- Root locked `Database V1.1/seed.sql` remains the documented V1.1 seed source; it was not run in this task. A Prisma-compatible seed is not required just to align the schema; if a later tooling need arises, generate it from the locked schema/seed contract in a separate approved task.
- `SmartRentalManagement/database/migrations/` remains unchanged. Existing migrations are legacy/demo and **must not be applied to Database V1.1**.
- `database/schema.sql` and V1.1 database files were only read; no SQL/database command was executed and no Database V1.1 content was modified.

## 10. Recommended next step

Proceed to **BACKEND FOUNDATION + API V1.1 MIGRATION** following `04_API_SPEC.md`, beginning with Auth + Owner tenant isolation, then Property/Room pilot, Resident, Contract, Invoice/Payment, and remaining domains. Rewrite legacy API code against the generated V1.1 models; do not add compatibility aliases or run the old migration/seed chain.

## Completion checklist

```text
[x] schema.legacy.prisma created as a copy of the original legacy Prisma schema
[x] schema.prisma manually maps all 25 V1.1 tables and columns
[x] locked Database V1.1 SQL/schema files untouched
[x] no database connection, SQL write, migration or seed executed
[x] prisma validate PASS
[x] prisma generate PASS
[x] PostgreSQL-only rules documented
[x] backend legacy dependencies inventoried
[x] backend typecheck/build executed; failures documented (209 each)
[x] PRISMA_V1_1_REMAP_REPORT.md created
```
