# Prisma V1.2 Remap Report

## 1. Source of truth

- `GocTro-SmartBuilding/Database V1.2/schema.sql` (locked physical schema)
- `GocTro-SmartBuilding/Database V1.2/erd.md`
- `GocTro-SmartBuilding/DATABASE_V1_2_IMPLEMENTATION_REPORT.md`
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md`
- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`
- `GocTro-SmartBuilding/docs/04_API_SPEC.md`

## 2. V1.1 → V1.2 physical schema diff

The SQL comparison confirmed that only `invoices` has V1.2 changes:

- `status` default changes from `unpaid` to `draft`; allowed values add `draft`.
- `due_date` changes from `date NOT NULL` to nullable `date`.
- Adds nullable `finalized_at timestamptz`.
- Adds `invoices_lifecycle_consistent`: draft requires both lifecycle timestamps null; unpaid/paid require both non-null.

No other physical table, column, relation, or index change was detected.

## 3. Prisma changes

Updated `database/schema.prisma` only for the V1.2 invoice fields:

```prisma
dueDate     DateTime? @map("due_date") @db.Date
status      String    @default("draft") @db.VarChar(16)
finalizedAt DateTime? @map("finalized_at") @db.Timestamptz(6)
```

Invoice relations, unique constraints, indexes, and all other fields were retained. Status remains `String`; no Prisma enum or compatibility model was added.

## 4. Model/table mapping

The schema contains **25 Prisma models and 25 `@@map` table mappings**, matching all Database V1.2 tables:

`accounts`, `account_invitations`, `amenities`, `amenity_price_history`, `amenity_subscription_cycles`, `amenity_subscriptions`, `complaint_history`, `complaints`, `contact_requests`, `contract_documents`, `contracts`, `invoice_zalo_oa_send_logs`, `invoices`, `notification_preferences`, `notifications`, `owners`, `parking_areas`, `parking_slot_assignments`, `parking_slots`, `payment_transactions`, `properties`, `residents`, `room_residents`, `rooms`, `vehicles`.

## 5. Invoice mapping before/after

| Field | V1.1 mapping | V1.2 mapping |
|---|---|---|
| `dueDate` | `DateTime @map("due_date") @db.Date` | `DateTime? @map("due_date") @db.Date` |
| `finalizedAt` | absent | `DateTime? @map("finalized_at") @db.Timestamptz(6)` |
| `status` | `String @default("unpaid") @db.VarChar(16)` | `String @default("draft") @db.VarChar(16)` |

The generated Invoice type exposes `dueDate: Date | null` and `finalizedAt: Date | null`; the schema default for `status` is `draft`.

## 6. Database-enforced rules not represented in Prisma

**DATABASE-ENFORCED RULE — Database V1.2 remains authoritative.** Prisma DSL does not fully represent PostgreSQL CHECK constraints. In particular, `invoices_lifecycle_consistent` and `invoices_status_allowed` remain enforced by PostgreSQL and are intentionally not duplicated as a Prisma enum or pseudo-constraint. Other existing database-only CHECKs, partial unique indexes, trigger-enforced history immutability, and advanced tenant-consistency invariants remain as before.

## 7–8. Prisma validation and generation

- `prisma validate --schema database/schema.prisma`: **PASS**.
- `prisma generate --schema database/schema.prisma`: **PASS**, Prisma Client **6.12.0**.
- Generation required elevated filesystem access after a sandboxed attempt failed with Windows `EPERM` resolving `node_modules/@prisma/client`. No database connection was made.

## 9. Backend typecheck/build

- Backend typecheck: **FAIL**, 209 TypeScript diagnostics, all in `backend/src/app.ts`.
- Backend build: **FAIL** on the same legacy code incompatibilities.
- A direct diagnostic comparison was run against Prisma Client generated from the preserved V1.1 schema: V1.1 and V1.2 each produce 209 diagnostics at the same file/line/code locations; **0 new diagnostic locations/codes** were introduced by the V1.2 invoice mapping.

## 10. Existing legacy errors grouped by domain

- **Legacy persistence models:** backend still references `userAccount`, `tenant`, `leaseContract`, `payment`, `amenityBooking`, `roomViewingRequest`, and `maintenanceRequest`, which are absent from the current 25-model schema.
- **Legacy entity shape:** code assumes fields such as generic `id`, `tenantId`, `billingYear`, `billingMonth`, `invoiceNumber`, `totalVnd`, room `floor`/`roomNumber`, and legacy relation names.
- **Legacy role/payment domain:** backend uses `LANDLORD`/`TENANT` and older payment vocabulary instead of V1.2 account and payment models.
- The failures represent the already-known backend migration from demo models to the locked database model, not a Prisma V1.2 mapping regression.

## 11. V1.2-specific backend impact

There are no new TypeScript diagnostic locations/codes from V1.2. During backend migration, invoice consumers must nevertheless account for:

- `dueDate` being nullable while an invoice is draft;
- `finalizedAt` being nullable until finalization;
- `status` remaining a string while now including `draft` in addition to `unpaid` and `paid`.

Static review found existing create/read flows that require non-null `dueDate` and use legacy calendar-month invoice fields. Those flows must be redesigned for draft/finalize and contract-anchored periods during backend migration. They were not modified here.

## 12. Seed and migration status

- No Prisma seed was run; legacy TypeScript seed was not changed.
- No SQL was executed; no database was connected to or modified.
- No Prisma migration, `db pull`, or `db push` command was run. Existing migrations were untouched.
- The physical migration and SQL seed remain maintained under the locked `Database V1.2` artifacts.

## 13. Files modified/created

- Modified: `database/schema.prisma`.
- Created: `database/schema.v1_1.prisma` as the preserved V1.1 Prisma mapping.
- Created: `PRISMA_V1_2_REMAP_REPORT.md`.
- Generated: Prisma Client under `node_modules/.prisma/client`; backend build output under `backend/dist`.
- Left unchanged: `database/schema.legacy.prisma`, `database/migrations/`, backend, frontend, and database files.

## 14. Next step

Begin the separately scoped Backend Foundation + API V1.2 migration from `docs/04_API_SPEC.md`, starting with Auth and Owner tenant isolation. Do not add aliases for legacy models; migrate each backend domain to the V1.2 model deliberately.
