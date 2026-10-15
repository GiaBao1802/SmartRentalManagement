# Invoice + Zalo OA API V1.3 Migration Report

## 1. Sources used

- `GocTro-SmartBuilding/docs/04_API_SPEC.md` §§2.2, 5.8, 6, 7, 8, 9.3, 13, 14.
- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` §§10, 12, 21.4 and privacy/tenant-isolation requirements.
- `GocTro-SmartBuilding/Database V1.3/schema.sql`, `erd.md`.
- `SmartRentalManagement/database/schema.prisma` (current Database V1.3 mapping).
- Contract V1.3 routes/repository and Resident/Occupancy implementation, including the successor privacy fix report.

No API Spec or Requirement rule was changed. No database or Prisma command was run.

## 2. Prisma models audited

`Invoice`, `Contract`, `Room`, `Property`, `Resident`, `RoomResident`, `PaymentTransaction` (read-only summary only), and `InvoiceZaloOaSendLog`. The current physical schema provides period identity, the invoice lifecycle checks, amount buckets/readings, payment relation, and append-only-by-application Zalo logs. No invoice-line or utility tariff table exists; none was added.

## 3. Endpoints implemented

| Endpoint | Behavior |
|---|---|
| `GET /api/v1/invoices` | Admin Owner filters and Resident's session-scoped rental history; shared pagination. |
| `POST /api/v1/invoices` | Admin creates a reviewed draft for a scoped Contract and exact anchor-derived period. Requires Idempotency-Key. |
| `POST /api/v1/contracts/{contract_id}/invoices/generate` | Admin ensures the ended/eligible period draft from server-side Contract anchor. Requires Idempotency-Key. |
| `GET /api/v1/invoices/{invoice_id}` | Admin Owner scope or Resident's own related rental Contract; returns safe payment summary and derived state. |
| `PATCH /api/v1/invoices/{invoice_id}` | Admin may update draft current meter readings only. Finalized amendment and paid financial edits are rejected. |
| `POST /api/v1/invoices/{invoice_id}/finalize` | Admin; transaction locks and rechecks Invoice, recalculates via pricing boundary, and commits lifecycle/amount fields atomically. Zalo enqueue is attempted only after transaction commit. |
| `POST /api/v1/invoices/{invoice_id}/send-zalo` | Admin; finalized unpaid only; appends a revision-specific send log before calling the provider queue. Requires Idempotency-Key. |
| `GET /api/v1/invoices/{invoice_id}/zalo-send-logs` | Admin Owner scope or authorized Resident's own invoice history; recipient phone/ID and provider response are not exposed. |

There is no scheduler/job runner in this migration. The generate service operation is retry-safe and uses the database's unique period identity plus a scoped Contract lock; production reminder/scheduler infrastructure remains pending.

## 4–8. Lifecycle, billing, create/generate, draft PATCH, finalize

Persisted states remain `draft`, `unpaid`, and `paid`; `overdue` is calculated at read time using the `Asia/Ho_Chi_Minh` business date and strict `today > due_date`. Drafts have null `finalized_at`/`due_date` and are labeled `amount_provisional=true`, including zero-valued buckets.

Billing uses the original `contracts.start_date` day anchor. Each month's anniversary is calculated independently; short months clamp to their final day and the next month returns to the original anchor (no drift). Period end is the day before the next anniversary, clipped to Contract end or its earlier termination date. Rent remains the full period rent for a truncated final period. The generate command creates/returns one draft for an eligible completed period; invoice number/context/Owner are server-derived. Manual create validates exact period dates against the same anchor. `INVOICE_PERIOD_CONFLICT` is the duplicate-period response.

Draft PATCH accepts only `electricity_current_kwh` and `water_current_m3`, the meter inputs explicitly shown by §9.3. Client totals, status, revision, due/finalization fields, and tenant/Contract authority fields are rejected. Generic post-finalize edits return `INVOICE_AMENDMENT_NOT_ALLOWED`; paid financial edits return `INVOICE_ALREADY_PAID`. Controlled amendment is not implemented because its exact allowlist is unresolved.

Finalize locks the Owner-scoped Invoice, verifies draft state and required meter readings, validates final readings against prior readings, invokes an injectable authoritative pricing calculator, and only then writes amounts, `finalized_at`, due date, and `unpaid` status in one transaction. Due date is the finalized instant's Ho Chi Minh calendar date plus five calendar days. Repeated finalize is rejected consistently. The deployed app uses `UnconfiguredInvoicePricing`, so it correctly returns `INVOICE_DATA_INCOMPLETE` and leaves drafts unchanged until approved tariff/service pricing is configured. A fake pricing adapter verifies the successful calculation path. No rent/utility/service tariff formula was invented.

## 9–14. Finalize, due date, overdue, pricing, paid immutability

Due-date/overdue boundary tests cover due date itself and the first following business date. Paid invoices are never changed by Invoice code; no Payment transition or provider callback was migrated. Payment data is queried only to build `{attempt_count, successful_amount, latest_status}`.

## 15–20. Zalo, recipient derivation, revision logs, provider, tenant scope, idempotency

Zalo send is allowed only for `status=unpaid` and non-null `finalized_at`. A queued row stores the exact Invoice's Contract/Owner/Property, `invoice_revision`, selected Resident and server-read phone. Every invocation creates another log; old logs remain. Provider response bodies/secrets are never returned; provider failure stores only a fixed safe message.

A recipient resolver/provider abstraction is present, with a fake adapter for tests. Production `UnconfiguredZaloProvider` and the default unconfigured recipient policy fail closed; no real Zalo delivery is claimed. The current business sources leave representative-only versus all-eligible-occupants unresolved, so production recipient selection cannot be enabled without that decision. The validator checks a resolver's Resident against the same Owner and the exact Invoice Contract (representative or occupancy); a predecessor link alone cannot authorize a recipient. This was explicitly tested for an Invoice on a successor Contract.

Admin Owner identity and Resident identity always come from the authenticated session. Resident list/detail/log queries apply Owner + own representative/occupancy relation before returning results. Foreign/missing Invoice returns the same `404 NOT_FOUND`. Resident DTO omits Owner and representative Resident identity; resident send logs omit recipient identity/phone, raw provider response, and provider error details.

Idempotency-Key shape validation is enforced on the four §7 Invoice commands. Durable replay and same-key payload conflict handling remain pending infrastructure; no fake replay is claimed.

## 21–23. Validation results

- Invoice/Zalo module: **34/34 PASS** (billing clamp/no-drift, final period, overdue, validators, Owner/Resident scoping, generate idempotency, finalize pricing fail-closed and successful injected path, successor recipient privacy, post-commit queue order, append-only revision logs, HTTP route behavior).
- Auth regression: **20/20 PASS**.
- Property/Room regression: **33/33 PASS**.
- Resident/Occupancy regression: **37/37 PASS**.
- Contract regression: **112/112 PASS**.
- Typecheck before: **173 errors**, all in legacy `backend/src/app.ts`.
- Typecheck after: **173 errors**, all in legacy `backend/src/app.ts`; **0 errors in Invoice/Zalo or other migrated modules**.
- Backend build: blocked by the same **173 existing legacy `app.ts` type errors**; no new Invoice/Zalo errors.
- No PostgreSQL runtime/database validation was run in this task.

## 24–27. Legacy code, blockers, changed files, next step

Legacy `/api/invoices` GET/POST/PATCH/DELETE endpoints are retired with HTTP 410 before the old handlers. This prevents client-supplied totals/status and the legacy path's fake manual payment transition. Payment itself remains unmigrated. Old dashboard/embedded legacy Invoice references in `app.ts` remain part of the existing legacy application and were not migrated.

Remaining decisions/infrastructure: authoritative electricity/water tariffs and service pricing (currently blocks all production finalization); exact Zalo recipient policy; production OA/template/provider and queue/worker; durable idempotency replay; scheduler/reminder infrastructure; controlled finalized-invoice amendment fields. The API Spec describes `POST /invoices` purpose and context validation but does not give an exact request schema; the implementation accepts only the necessary `contract_id,period_start,period_end` tuple and rejects all other fields. It describes draft edits as allowed meter/service inputs but only explicitly shows current electricity/water readings, so PATCH is constrained to those two documented fields; service input schema remains an API clarification item. These are reported as blockers, not silently assumed.

Files changed for this task:

- `backend/src/invoices/invoice.billing.ts`
- `backend/src/invoices/invoice.billing.test.ts`
- `backend/src/invoices/invoice.validation.ts`
- `backend/src/invoices/invoice.validation.test.ts`
- `backend/src/invoices/invoice.repository.ts`
- `backend/src/invoices/invoice.repository.test.ts`
- `backend/src/invoices/invoice.routes.ts`
- `backend/src/invoices/invoice.routes.test.ts`
- `backend/src/invoices/invoice.pricing.ts`
- `backend/src/zalo/zalo-provider.ts`
- `backend/src/zalo/invoice-zalo.service.ts`
- `backend/src/zalo/invoice-zalo.service.test.ts`
- `backend/src/auth/v1.router.ts`
- `backend/src/app.ts`
- `backend/package.json`
- `docs/07_modules/invoice-zalo/INVOICE_ZALO_API_MIGRATION_REPORT.md`

No frontend, Database V1.3, Prisma, Requirement, or API Spec file changed.

**Current status:** Invoice/Zalo API endpoints and safe application behavior are implemented. Pricing, recipient policy, durable replay, scheduler, and real Zalo provider remain explicit deployment/business blockers. Next domain remains Payment API migration; it was not started here.