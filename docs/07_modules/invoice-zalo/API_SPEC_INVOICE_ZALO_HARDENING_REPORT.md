# Invoice + Zalo OA API Hardening Report

## 1. Final status

**LOCKED / DOCUMENTED.** Business has resolved the final-period boundary: use `termination_date` only when Contract status is `terminated` and that date is present; otherwise use `end_date`. Requirements, API Spec, and backend now match. Invoice/Zalo tests and all regression suites pass. Known fail-closed pricing/provider and infrastructure gaps remain documented but do not block the API contract lock.

## 2. Sources reviewed

- `docs/04_API_SPEC.md` §§2, 5.7–5.9, 7, 9.3, 13–14.
- `docs/01_REQUIREMENTS.md` Invoice, Contract termination, privacy, and tenant-scope sections.
- `docs/07_modules/invoice-zalo/INVOICE_ZALO_API_MIGRATION_REPORT.md`.
- `backend/src/invoices/**`, `backend/src/zalo/**`, `backend/src/auth/v1.router.ts`, and legacy route registration in `backend/src/app.ts`.
- Contract V1.3 implementation and `docs/07_modules/contract/CONTRACT_API_V1_3_RESIDENT_SUCCESSOR_PRIVACY_FIX_REPORT.md`.
- `GocTro-SmartBuilding/Database V1.3/schema.sql`, `GocTro-SmartBuilding/Database V1.3/erd.md`, and `database/schema.prisma`.

## 3. Endpoint matrix

All paths are under `/api/v1`; normal session, CSRF, common error envelope, and request ID middleware apply. Owner and Resident IDs are taken from authenticated context.

| Endpoint | Role and exact input | Success | Scope, mutation and transaction | Main errors |
|---|---|---|---|---|
| `GET /invoices` | Admin: `page,page_size,property_id,room_id,contract_id,resident_id,status,period_start,period_end`; Resident: only `page,page_size,status,period_start,period_end` | `200 {data,meta}` | Owner-scoped Admin query; Resident is own representative or Contract-specific occupant; `period_start` means stored start >= filter; `period_end` means stored end <= filter; read only | `400 VALIDATION_ERROR`; `401`; `403`; no cross-Owner rows |
| `POST /invoices` | Admin; required `Idempotency-Key`; exact body `contract_id,period_start,period_end` | `201 {data: Invoice}` | Locks scoped Contract and creates provisional draft in serializable transaction. Context, invoice number, status, readings, and amounts are server-owned. | `400 VALIDATION_ERROR`; `404 NOT_FOUND`; `409 INVOICE_PERIOD_CONFLICT` or `CONFLICT` for draft Contract |
| `POST /contracts/:contract_id/invoices/generate` | Admin HTTP route; required key; omitted body or `{}` only | `200 {data: Invoice}` | Locks scoped Contract; selects ended eligible period; returns the existing Invoice for that period in its current state (including finalized/paid) or creates a draft if absent. Retries unique/serialization races up to three transaction attempts. No production scheduler is implemented. | `400 VALIDATION_ERROR`; `404 NOT_FOUND`; `409 CONFLICT` when no eligible period; `409 INVOICE_PERIOD_CONFLICT` after exhausted duplicate race |
| `GET /invoices/:invoice_id` | Admin or authorized Resident; no body | `200 {data: Invoice}` | Owner scope or own representative/occupancy on this exact Contract. Foreign and missing Invoice both return 404. | `400 VALIDATION_ERROR`; `401`; `403`; `404 NOT_FOUND` |
| `PATCH /invoices/:invoice_id` | Admin; exact non-empty body allowlist: `electricity_current_kwh`, `water_current_m3`, either or both; nonnegative, max 3 fractional digits | `200 {data: Invoice}` | Invoice row lock + serializable transaction; only draft meter readings change. | `400 VALIDATION_ERROR`; `404 NOT_FOUND`; `409 INVOICE_AMENDMENT_NOT_ALLOWED`; `409 INVOICE_ALREADY_PAID` |
| `POST /invoices/:invoice_id/finalize` | Admin; required key; omitted body/`{}` or same optional meter-readings allowlist | `200 {data: Invoice}` | Row lock + serializable transaction; requires complete readings and authoritative pricing; writes amounts, final timestamp, due date, and `unpaid` atomically. Then attempts Zalo enqueue post-commit, best effort. | `400 VALIDATION_ERROR`; `404 NOT_FOUND`; `409 INVOICE_DATA_INCOMPLETE`; `409 INVOICE_ALREADY_FINALIZED`; `409 INVOICE_ALREADY_PAID` |
| `POST /invoices/:invoice_id/send-zalo` | Admin; required key; omitted body or `{}` only; no recipient/phone fields | `202 {data:{send_log_id,invoice_id,invoice_revision,status,created_at}}` | Transaction locks scoped Invoice, validates eligibility and server-resolved recipient, creates a new revision log; only after commit calls provider/queue. | `400 VALIDATION_ERROR`; `404 NOT_FOUND`; `409 INVOICE_NOT_SENDABLE`; `503 SERVICE_UNAVAILABLE` |
| `GET /invoices/:invoice_id/zalo-send-logs` | Admin or Resident authorized for the Invoice | `200 {data:[send log...]}` | Scoped by Invoice and authenticated Owner/Resident. Resident sees no recipient ID/phone, provider response, or error text. | `400 VALIDATION_ERROR`; `401`; `403`; `404 NOT_FOUND` |

The `/api/v1` unknown-path handler returns common `404 NOT_FOUND`. Unsupported methods falling through the Invoice router currently return `409 CONFLICT`; this is an implementation inconsistency for undeclared paths, not a mutation bypass. Request payloads with unsupported fields return `400 VALIDATION_ERROR`.

## 4. Lifecycle and field mutability

Persisted Invoice states are exactly `draft`, `unpaid`, and `paid`; overdue is derived as `status=unpaid AND Ho_Chi_Minh business date > due_date`. Equality with the due date is not overdue. Drafts have null `finalized_at` and `due_date`; their amount buckets/total are provisional and `amount_provisional=true`.

| Physical Invoice field | Response | Create request | Draft PATCH | Server-owned / post-finalize behavior |
|---|---:|---:|---:|---|
| `invoice_id` | Yes | No | No | Generated; immutable |
| `invoice_no` | Yes | No | No | Generated from Contract and period; immutable |
| `contract_id` | Yes | Yes | No | Create value is validated in Owner scope; immutable after create |
| `property_id` | Yes | No | No | Derived from Contract; immutable |
| `owner_id` | Admin only | No | No | Derived from session/Contract; omitted from Resident DTO; immutable |
| `period_start` | Yes | Yes | No | Must match Contract anchor; immutable |
| `period_end` | Yes | Yes | No | Must match Contract period rule; immutable |
| `due_date` | Yes | No | No | Null in draft; assigned at finalize; immutable in Invoice API |
| `finalized_at` | Yes | No | No | Null in draft; set at finalize; immutable in Invoice API |
| `rent_amount` | Yes | No | No | Derived from Contract; immutable after create/finalize |
| `electricity_previous_kwh` | Yes | No | No | Carried from Contract/prior Invoice; not client-editable |
| `electricity_current_kwh` | Yes | No | Yes | Draft only; immutable after finalize |
| `electricity_amount` | Yes | No | No | Provisional until pricing configured/finalize; immutable after finalize and paid |
| `water_previous_m3` | Yes | No | No | Carried from Contract/prior Invoice; not client-editable |
| `water_current_m3` | Yes | No | Yes | Draft only; immutable after finalize |
| `water_amount` | Yes | No | No | Provisional until pricing configured/finalize; immutable after finalize and paid |
| `service_amount` | Yes | No | No | Server pricing output only; immutable after finalize and paid |
| `total_amount` | Yes | No | No | Sum enforced by DB; no client authority; immutable after finalize and paid |
| `status` | Yes | No | No | Draft/finalize code owns draft→unpaid; Payment owns future unpaid→paid |
| `revision` | Yes | No | No | Starts at 1; amendment behavior is not implemented |
| `created_at` | Yes | No | No | Database-owned |
| `updated_at` | Yes | No | No | Database/ORM-maintained |

Successful list/detail DTOs also contain `is_overdue`, `amount_provisional`, `payment_summary`, and a safe Contract/Room/Property summary. `line_items` is not a separate DTO array; the current response exposes the physical amount buckets.

## 5. Billing and final-period rule

Billing periods are computed independently from original `contracts.start_date`, so a Jan 31 anchor clamps in February then returns to day 31 in March; no cumulative clamp drift. `effective_contract_end_date` is `termination_date` only when Contract status is `terminated` and the date is present; otherwise it is `end_date`. The final period is `min(normal_period_end,effective_contract_end_date)`, and no later period is generated. Period uniqueness is `(contract_id,period_start,period_end)`. Period validity requires end >= start. Rent and fixed-period services remain full-period with no proration; usage-based utilities/services are bounded by the final period's effective end. Authoritative utility/service amounts still fail closed until pricing is configured.

## 6. Draft, finalize, pricing and due date

Manual draft create validates exact Contract-anchored dates and derives all context. Generate locks the Contract and relies on the DB unique tuple for duplicate protection. Draft creation initializes amount buckets but labels them provisional; these values do not permit payment or Zalo.

The deployed `UnconfiguredInvoicePricing` returns `null`. Finalize then returns `409 INVOICE_DATA_INCOMPLETE`, leaving the draft unchanged. No arbitrary tariff, service price, or client total is used. With a configured trusted calculator, finalize requires both current readings and valid prior readings, rejects decreased meters, calculates server-side amount buckets, sets `finalized_at`, sets due date to the Ho Chi Minh calendar date of finalization plus five days, and changes state to `unpaid` in one serializable Invoice-row-locked transaction. Paid state and payment completion are outside this module.

The finalize lock/recheck yields `INVOICE_ALREADY_FINALIZED` on a second successful-finalize attempt; if Payment has made it paid, the result is `INVOICE_ALREADY_PAID`. Tests exercise this with repository fakes; no PostgreSQL concurrency integration test was run.

## 7. Paid immutability and amendment

Invoice routes cannot set `paid`. The Invoice module never changes a paid Invoice's financial fields; PATCH rejects it with `INVOICE_ALREADY_PAID`. A finalized unpaid Invoice is not patchable and returns `INVOICE_AMENDMENT_NOT_ALLOWED`. There is no amendment endpoint, no revision increment path, and no Payment implementation in scope.

## 8. Zalo eligibility, recipient authority and privacy

Only `status=unpaid AND finalized_at IS NOT NULL` is sendable. Other states return `409 INVOICE_NOT_SENDABLE` before recipient resolution. The client cannot submit resident ID or phone. The production default resolver returns no recipient and fails closed with `503 SERVICE_UNAVAILABLE` before log creation. Any injected resolver output is revalidated as a same-Owner Resident who is either the exact Invoice Contract representative or linked by occupancy to that exact Contract. The implementation does not select a recipient when policy is absent; representative-only versus all eligible occupants remains an unresolved business choice.

Successor privacy is **PASS**: a Resident linked only to predecessor Contract A is not in the authorized Resident scope for successor Contract B's Invoice; recipient validation uses Invoice B's exact Contract and never `previous_contract_id`. Tests cover Resident list/detail/log access and attempted predecessor recipient selection.

## 9. Send-log behavior and provider boundary

Each send invocation allocates a new `invoice_zalo_oa_send_logs` row with `invoice_revision` in a transaction before crossing the provider boundary. Prior send attempts remain. A queued row's delivery status may transition to `sent`/`failed`; therefore rows are retained append-per-attempt, while delivery status is mutable. The production provider is unconfigured. On provider queue failure, the newly allocated row is marked `failed`, the manual send endpoint returns `503 SERVICE_UNAVAILABLE`, and provider internals are not returned. If recipient policy is missing, no log is created. Finalize attempts Zalo only after its commit and swallows enqueue errors so it cannot roll back or misreport the already-committed Invoice. There is no durable outbox/worker; a crash window between invoice commit and enqueue remains infrastructure debt. Real OA delivery is not claimed.

## 10. Error matrix (implemented Invoice/Zalo errors)

| Condition | HTTP/code |
|---|---|
| Invalid path/body/query/meter or invalid Idempotency-Key | `400 VALIDATION_ERROR` |
| Missing/foreign scoped Invoice or Contract | `404 NOT_FOUND` |
| Wrong role | `403 FORBIDDEN` |
| Missing/invalid session | `401 UNAUTHENTICATED` |
| Duplicate period / unique violation | `409 INVOICE_PERIOD_CONFLICT` |
| No eligible generate period / draft-only Contract | `409 CONFLICT` |
| Incomplete readings or missing authoritative pricing | `409 INVOICE_DATA_INCOMPLETE` |
| Finalize after prior finalize | `409 INVOICE_ALREADY_FINALIZED` |
| Attempt to edit paid Invoice/finalize paid Invoice | `409 INVOICE_ALREADY_PAID` |
| PATCH finalized Invoice | `409 INVOICE_AMENDMENT_NOT_ALLOWED` |
| Send draft/paid/unfinalized Invoice | `409 INVOICE_NOT_SENDABLE` |
| No recipient policy, invalid resolved recipient, or provider/queue unavailable | `503 SERVICE_UNAVAILABLE` |

`INVOICE_NOT_PAYABLE` and revision-conflict codes are not used by this module: Payment and Invoice amendment are not implemented here. `INVOICE_DATA_INCOMPLETE` is the actual pricing fail-closed code. The generic API Spec's invoice error list is broader than currently exercised code and should not be read as meaning Payment/Amendment endpoints exist.

## 11. Idempotency

`Idempotency-Key` shape is validated on POST create, generate, finalize, and send-zalo (1–128 visible ASCII characters). This is header validation only. No durable replay storage, same-key/same-payload replay, or same-key/different-payload detection exists. Repeated generate is naturally period-idempotent through the scoped lock and unique key; the other POSTs do not have durable replay semantics. This is documented infrastructure debt, not described as full idempotency.

## 12. Tenant isolation and successor checks

Admin queries always pass `req.auth.ownerId`; Resident ID comes from the session. Repositories apply Owner and exact own representative/Contract occupancy relation before returning invoices or logs. Foreign and absent resources share 404 behavior. Database composite FKs tie Invoice to Contract/Property/Owner and send log to Invoice context and Resident/Owner. The Prisma models expose these relations/unique keys. Application queries enforce Resident visibility and recipient's exact-Contract relation. No code assumption depends on an Invoice field absent from Database V1.3/Prisma.

## 13. Database and Prisma consistency

The physical schema has all fields used by Invoice/Zalo: anchored period dates and unique key, lifecycle and amount checks, Contract composite FK, Zalo revision/status/provider metadata, and Owner-scoped recipient FK. Prisma models `Invoice`, `PaymentTransaction`, `InvoiceZaloOaSendLog`, `Contract`, `Resident`, and `RoomResident` match those fields and relations. No schema or Prisma changes were made. DB checks enforce end >= start, total arithmetic, status set, lifecycle nullability and nonnegative buckets; PostgreSQL runtime validation was not rerun in this task.

## 14. Legacy retirement

`/api/invoices` is intercepted before legacy handlers and always returns `410 ENDPOINT_RETIRED`, including old list/create/patch/delete paths. Legacy code remains below the retirement middleware but is unreachable through that prefix. It no longer provides an Invoice mutation/payment bypass. Payment is not implemented by this work.

## 15. Test and build results

| Suite/command | Result |
|---|---:|
| Invoice + Zalo | **36/36 PASS** |
| Auth regression | **20/20 PASS** |
| Property/Room regression | **33/33 PASS** |
| Resident/Occupancy regression | **37/37 PASS** |
| Contract regression | **112/112 PASS** |
| All suites combined after effective-end reconciliation | **238/238 PASS** |
| Typecheck before → after | **173 → 173 existing errors** |
| Invoice/Zalo type errors | **0** |
| Backend build | Fails on the same 173 legacy errors in `backend/src/app.ts` |
| PostgreSQL integration/runtime | Not run; generate/finalize concurrency has fake-repository/unit coverage only |

An initial sandboxed run could not connect to the tests' loopback HTTP servers (`EACCES`). Rerunning with localhost permission passed all five suites; this was an environment restriction, not a test assertion failure.

## 16. Gaps and disposition

Accepted fail-closed/infrastructure gaps: authoritative electricity/water and service pricing; exact Zalo recipient-selection policy; production Zalo OA credentials/provider/template/queue; durable Idempotency-Key replay; scheduler/reminder jobs; controlled finalized-Invoice amendment; real PostgreSQL concurrency validation. Per the task's lock rule, production infrastructure gaps alone do not block documenting the API.

The previous early-termination boundary blocker is resolved. New tests cover normal-expiry `end_date`, terminated-contract `termination_date`, truncation to the termination date, no generated period beyond it, original-anchor no-drift, and full rent on the truncated final period. No other API mismatch remains that blocks the Invoice/Zalo contract lock.

## 17. Files changed in this hardening pass

- `docs/01_REQUIREMENTS.md` — defined effective Contract end date for billing, final-period truncation and full/non-prorated service/utility treatment.
- `docs/04_API_SPEC.md` — aligned billing boundary with the approved rule and marked Invoice/Zalo LOCKED / DOCUMENTED.
- `backend/src/invoices/invoice.billing.ts` and `invoice.repository.ts` — made effective-date selection explicit and used it for validation and generation.
- `backend/src/invoices/invoice.billing.test.ts` and `invoice.repository.test.ts` — added normal/terminated Contract, no-later-period, no-drift and full-rent coverage.
- `SmartRentalManagement/docs/07_modules/invoice-zalo/API_SPEC_INVOICE_ZALO_HARDENING_REPORT.md` — this report.

No Database, Prisma, frontend, or Payment files were changed. Database V1.3 and Prisma already provide Contract `status`, `end_date`, and `termination_date`.
