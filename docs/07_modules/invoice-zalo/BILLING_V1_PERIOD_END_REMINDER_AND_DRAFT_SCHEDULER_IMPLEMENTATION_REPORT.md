# Billing V1 Period-End Reminder + Next-Day Draft Scheduler

- **Date:** 2026-10-14
- **Status:** IMPLEMENTATION PASS — PostgreSQL V1.8 integration PASS
- **Scope:** Backend scheduler, durable Admin closeout reminders, next-day/catch-up draft generation, tests and operational documentation.
- **Authority checked:** `../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`, Database V1.8 artifacts and changelog; repository `AGENTS.md`, documentation rules/current state/catalog; Billing end-to-end gap audit; V1.8 Invoice finalize integration closure; Admin Billing connectivity/browser closure.

## 1. Scope and previous P0 gaps

The prior audit found that the Admin generate endpoint was request-driven only, there was no `period_end` reminder producer or scheduled next-day draft guarantee, and `ensureNextDraft` could only select the latest completed period. This pass adds a server-started hourly scheduler with explicit catch-up and leaves the API generation command's behavior intact.

The scheduler does not finalize invoices, send Zalo invoices, enable Payment, or change frontend behavior.

## 2. Scheduler architecture and cadence

`backend/src/server.ts` creates one `BillingScheduler` per backend process after Express starts listening. It waits 30 seconds before its first run, then runs hourly. A delayed run covers missed dates, so correctness does not depend on firing at an exact hour. Shutdown clears timers, waits for the active run, closes HTTP, then disconnects Prisma.

An in-process in-flight guard coalesces overlapping runs in one process. Database transaction locks and the existing unique Invoice period key protect effects when separate scheduler instances or the Admin generate command race.

## 3. Business timezone and period calculation

The scheduler derives `business_date` using `Asia/Ho_Chi_Minh`. It calls the existing `billingPeriod`, `businessDate`, `periodMatchesAnchor`, and effective Contract end-date resolver; it does not add another anniversary algorithm.

The original `contracts.start_date` anchor, 29/30/31 month-end clamp/no-drift behavior and final-period clipping are preserved. Terminated Contracts use `termination_date` when present; other eligible Contracts use `end_date`. The scheduler rejects malformed lifecycle/date context and never creates periods after the effective end.

## 4. Period-end reminder behavior and idempotency

For each eligible completed or current period whose end date is today or earlier, the scheduler ensures one durable `notifications` row for an active Admin account in the Contract Owner scope. This retries a reminder missed during downtime. Its type is `billing_period_closeout` and its message is:

> Đã đến cuối kỳ hóa đơn. Vui lòng chốt chỉ số điện, nước và dữ liệu dịch vụ.

The message carries a stable Owner/Contract/period identity. V1.8 has no notification idempotency column or unique constraint, so the implementation reuses the locked schema: a PostgreSQL transaction-scoped advisory lock serializes that identity, and the committed notification row is checked before insert. The database integration test exercised the actual V1.8 schema. No schema change or database change request was needed.

The notification transaction does not create or modify an Invoice and does not call Zalo or Payment.

## 5. Next-day draft behavior and catch-up

On a Vietnam business date strictly after `period_end`, the scheduler calls `PrismaInvoiceRepository.ensureDraftForPeriod` for the exact period. It locks the Owner-scoped Contract in a serializable transaction, validates the period against the original anchor/effective end, returns any existing Invoice unchanged, or creates the ordinary provisional draft. `createDraftForPeriod` preserves existing opening-meter continuity behavior; closing readings stay unset. New drafts retain `status=draft`, `snapshot_kind=NOT_FINALIZED`, `finalized_at=null`, and `due_date=null`.

Periods are enumerated from the original anchor in chronological order, and every ended period is considered. A period draft failure stops that Contract's later periods for the current run so a gap is not hidden; later Contracts continue, and the next scheduler run retries the gap. The database unique period key remains the final duplicate guard. The existing Admin `ensureNextDraft` command was not changed and still handles its existing request-driven semantics.

## 6. Contract eligibility, concurrency and failure isolation

Only `active`, `expired`, and `terminated` Contracts are considered; `draft` and malformed lifecycle/date combinations are skipped. Each reminder/draft failure logs its Owner, Contract and period identity and a safe error code. One failed reminder does not block its independent draft; one failed Contract period does not block other Contracts.

Reminder idempotency is protected by a PostgreSQL advisory transaction lock plus persisted notification lookup. Invoice creation is protected by the Contract row lock, serializable retry for unique/serialization races, and `(contract_id, period_start, period_end)` uniqueness. The scheduler never resets existing Invoice state, including a finalized Invoice.

## 7. Startup, restart and operational limits

Startup catch-up begins after the 30-second initial delay. Reminder rows and Invoice periods are the durable state; a process restart does not rely on an in-memory completion map. The focused tests simulate restart by creating a new scheduler instance after failure. PostgreSQL integration uses independent scheduler instances and concurrent Admin generation against separate database transactions.

Every backend process currently starts a scheduler and scans eligible Contracts; there is no distributed leader election. Database locks make reminder/draft effects duplicate-safe across workers, but multiple deployed processes repeat scan work. Deployment should account for that scan load. This pass did not launch a multi-process production-like deployment.

## 8. Observability

Structured logs record job start/end, Vietnam business date, contracts scanned, reminders created/existing, drafts created/existing, failures and safe error codes. They do not log credentials, tokens, national IDs or raw exception messages.

## 9. Database impact and Goctro_test3

**Database V1.8/schema/seed/Prisma: not modified.** Durable reminder identity reuses `notifications` plus transaction advisory locking. No migration or SQL write was run against `Goctro_test3`.

PostgreSQL integration used a newly initialized disposable PostgreSQL 18 cluster, installed the locked V1.8 `schema.sql` without seed, and ran against the dedicated `goctro_v18_rehearsal` database with a test-enforced database/port guard. The disposable database was dropped and its temporary cluster/logs were removed after evidence collection. `Goctro_test3` was not connected or written.

## 10. Tests and validation

- Focused scheduler unit tests: **8/8 PASS** — Vietnam date boundary, period-end versus next-day, month-end/no drift, normal/terminated end, malformed/draft exclusion, failure isolation, overlap, shutdown wait and restart retry.
- V1.8 PostgreSQL scheduler integration: **1/1 PASS** — durable period-end reminder, next-day draft, scheduler versus Admin generation race, already-finalized Invoice reuse, multiple-period catch-up, chronological gap retry, independent scheduler concurrency, duplicate prevention and non-finalized draft fields.
- Full Invoice test command: **151 PASS, 0 FAIL, 2 SKIP**. The two skipped PostgreSQL integration tests were not enabled in this unit-suite invocation; the scheduler PostgreSQL integration was run separately and passed.
- Backend typecheck: **FAIL with 174 existing legacy diagnostics** (173 in `backend/src/app.ts`, 1 in `backend/src/residents/resident.test.ts`). There are no typecheck diagnostics in the scheduler, Invoice repository, integration test, or server files changed in this pass.
- No frontend build or browser smoke was needed; no frontend was modified.

## 11. Remaining blockers and exact next task

Automatic reminders and next-day draft generation are implemented and verified locally. At the time this report was written, end-to-end Billing remained partial because the Admin period workspace/readiness queue had not yet been implemented. The later [workspace implementation report](BILLING_V1_PERIOD_WORKSPACE_READINESS_QUEUE_IMPLEMENTATION_REPORT.md) supersedes that point: the workspace and its disposable PostgreSQL integration are implemented, while authenticated browser closure and remaining service-data source gaps remain open. Zalo provider/recipient/delivery operations, Payment and Resident Invoice UX remain separate work.

**Exact next task:** `BILLING V1 PERIOD WORKSPACE + READINESS / MISSING-DATA QUEUE`
