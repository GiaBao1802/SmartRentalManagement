# Contract API V1.3 Migration Report

## Source of truth reviewed

- `GocTro-SmartBuilding/docs/04_API_SPEC.md` — Contract API §5.7 and shared auth, error, pagination, and concurrency rules.
- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` — contract, occupancy, termination, and resident access rules.
- `GocTro-SmartBuilding/Database V1.3/schema.sql` and `erd.md` — Contract, ContractChangeHistory, ContractDocument, room/Resident/occupancy, invoice, parking, and amenity relations.
- `GocTro-SmartBuilding/docs/DATABASE_V1_3_CONTRACT_AUDIT_CHANGE_REQUEST.md`, `GocTro-SmartBuilding/docs/DATABASE_V1_3_CONTRACT_AUDIT_IMPLEMENTATION_REPORT.md`, and the V1.3 runtime-validation material.
- `SmartRentalManagement/database/schema.prisma` and `docs/03_database/prisma/PRISMA_V1_3_CONTRACT_AUDIT_REMAP_REPORT.md` — current V1.3 Prisma mapping.
- `docs/07_modules/contract/CONTRACT_API_V1_2_MIGRATION_REPORT.md` — previous Contract API migration state.

Database V1.3 schema and Prisma files were treated as read-only. No database command, SQL write, migration, or Prisma schema command was run.

## Implemented API surface

Mounted under `/api/v1`:

| Endpoint | Behavior |
| --- | --- |
| `GET /contracts` | Owner-scoped list, filters, and pagination. |
| `POST /contracts` | Creates an Owner-scoped draft at revision 0; client cannot set Owner, status, revision, or lineage. Requires `Idempotency-Key` header validation. |
| `GET /contracts/:contract_id` | Admin reads within authenticated Owner; Resident reads only a contract associated with their authenticated resident profile. Foreign resources return the shared 404. |
| `PATCH /contracts/:contract_id` | Draft changes are sparse and unaudited. Active material changes require `If-Match` and `change_reason`, lock/recheck the contract, increment revision once, and add changed-field history in the same transaction. |
| `POST /contracts/:contract_id/activate` | Activates a valid draft at revision 1 and writes the complete baseline history entry atomically. Checks Owner scope, representative Resident, active Room/Property, date overlap, and capacity. |
| `POST /contracts/:contract_id/renew` | Creates a revision-0 draft successor; predecessor remains unchanged. Checks revision, eligible predecessor status, single successor, dates, overlap, Resident, and capacity. |
| `POST /contracts/:contract_id/terminate` | Requires `If-Match`; unpaid invoices block termination. Writes terminated status/revision/history and closes dependent occupancy, parking, amenity subscription, and planned-cycle records atomically. |
| `GET /contracts/:contract_id/history` | Owner-only paginated allowlisted audit fields. Implementation uses ascending revision order as specified by API Spec §5.7. |
| `GET /me/contracts` | Resident-only list scoped to the authenticated resident profile. |
| `GET /contracts/:contract_id/documents` | Owner or related Resident may list safe document metadata; durable object key is never returned. |
| `GET /contract-documents/:document_id` | Owner or related Resident may read safe metadata and an optional short-lived URL; object key is stripped. |
| `POST /contracts/:contract_id/documents` | Validates scope/header and delegates staged upload + immutable versioned metadata to the document service. Binary upload currently returns an explicit unavailable/configuration error because production storage and multipart adapter are not configured. |

### Renewal payload decision

The API Spec did not define the renewal request body. The user confirmed: **clone terms; require a new `contract_no` and new dates**. `POST /contracts/:contract_id/renew` therefore accepts only `contract_no`, `start_date`, and `end_date`; Room, Property, Resident, rent, deposit, capacity, and initial readings are copied from the predecessor. The new draft can then be edited under the ordinary draft rules.

## Transaction and authorization controls

- Tenant scope and actor identity come from the authenticated session; request bodies cannot select an Owner.
- Resource lookups are Owner-scoped, and foreign-resource responses share the not-found behavior.
- Locking uses parameterized Prisma raw queries with `FOR UPDATE`; revision/state checks and audit writes run in serializable transactions.
- Termination's debt check and dependent lifecycle updates run in the same transaction as the Contract transition.
- `Idempotency-Key` presence/shape is validated. Durable replay storage is not implemented because the database/API design has no idempotency table; requests are not falsely reported as replay-safe.
- Contract documents use a storage abstraction and stage-before-metadata flow with cleanup on DB failure. A production object-storage provider and multipart adapter remain integration blockers.

## History ordering note

The task brief requested history `revision DESC`, while API Spec §5.7 specifies `revision ASC`. Per the stated source-of-truth precedence, implementation follows the API Spec and orders ascending. This conflict should be resolved in the API contract before client history-order assumptions are locked.

## Validation

| Check | Result |
| --- | --- |
| Contract validation/repository/routes/document service tests | **105/105 PASS** |
| Auth regression | **20/20 PASS** |
| Property/Room regression | **33/33 PASS** |
| Resident/Occupancy regression | **37/37 PASS** |
| Typecheck before this Contract work | **173 TypeScript errors**, all in legacy `backend/src/app.ts` |
| Typecheck after | **173 TypeScript errors**, all in legacy `backend/src/app.ts`; zero errors in Contract modules, V1 router, or document service/tests |
| Build | **Blocked by the same 173 legacy `src/app.ts` errors**; no Contract-module errors remain |
| Database/schema validation | Not run; no database command was executed |

The remaining compile errors are legacy backend routes/types incompatible with the current Prisma V1.3 model (including old `userAccount`, `tenant`, `leaseContract`, billing-month fields, and old Property/Room/Amenity fields). They were inventoried but not migrated in this task.

## Legacy route handling

The old unversioned `/api/contracts` demo route is retired with the existing legacy Property/Room routes and returns the migration response. Other unrelated legacy domains remain outside this Contract migration. The V1 Contract router is mounted through `createV1Router`.

## Changed files

- `SmartRentalManagement/backend/src/contracts/contract.validation.ts`
- `SmartRentalManagement/backend/src/contracts/contract.repository.ts`
- `SmartRentalManagement/backend/src/contracts/contract.routes.ts`
- `SmartRentalManagement/backend/src/contracts/contract.validation.test.ts`
- `SmartRentalManagement/backend/src/contracts/contract.repository.test.ts`
- `SmartRentalManagement/backend/src/contracts/contract.routes.test.ts`
- `SmartRentalManagement/backend/src/contract-documents/object-storage.ts`
- `SmartRentalManagement/backend/src/contract-documents/contract-document.service.ts`
- `SmartRentalManagement/backend/src/contract-documents/contract-document.service.test.ts`
- `SmartRentalManagement/backend/src/auth/v1.router.ts`
- `SmartRentalManagement/backend/src/app.ts`
- `SmartRentalManagement/backend/package.json`
- `SmartRentalManagement/docs/07_modules/contract/CONTRACT_API_V1_3_MIGRATION_REPORT.md`

No API Spec, Requirement, frontend, database schema, Prisma schema, migration, or seed file was changed.

## Remaining blockers and next step

1. Configure production object storage and a multipart upload adapter before enabling binary contract-document upload.
2. Add durable idempotency replay handling if required by the API contract; currently only header validation is implemented.
3. Migrate or retire the remaining legacy `src/app.ts` domains before expecting backend-wide typecheck/build to pass.
4. Resolve the API Spec history-order decision (`ASC` versus task-brief `DESC`) before clients depend on a different order.

Contract API V1.3 implementation is complete within the requested backend scope. The next domain migration should start only after reviewing this report; no Invoice or other domain migration was started.
