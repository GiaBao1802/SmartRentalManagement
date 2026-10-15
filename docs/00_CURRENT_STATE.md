# Góc Trọ — Current State

## Last Updated

2026-10-15

## Project Status

Local/development project. Database V1.8 is the current locked physical baseline. The Admin Invoice list/detail/meter/finalize/itemized workflow passed authenticated browser and PostgreSQL rehearsal checks. Period-end reminders, next-day draft scheduling, and the Admin period workspace/readiness model passed disposable PostgreSQL 18 V1.8 integration. Service Pass 3 implemented Fixed/Flexible catalogs, immutable price publishing and Billing integration. The subsequent Service IA realignment consolidates navigation, changes the Flexible product label to “Tiện ích phát sinh”, and records the future Resident usage-to-charge product direction. The Admin SaaS visual baseline has received a page-specific static QA cleanup: login/sidebar logo rendering, Service selector/density, and the Accounts form are corrected. Frontend tests, typecheck and production build pass; manual browser visual review remains pending. Parking remains the next Service implementation. Exact narrow viewport control remains unavailable. No Service rehearsal data was written to `Goctro_test3`.

Service Pass 2 implemented Owner-scoped Electricity/Water tariff configuration APIs and Admin UI, plus navigation to the existing Contract initial-meter source flow. Authenticated API and itemized billing passed on a disposable PostgreSQL 18 V1.8 database, including tariff versioning, immutable invoice snapshots and Owner isolation. The authenticated Admin browser smoke now passes for utility Property selection, tariff/tier rendering, Contract meter-source navigation, Billing workspace and finalized Invoice breakdown. Exact 320–390px verification remains blocked because the available Codex browser controller exposes no viewport override. Pass 2 is PARTIAL for this responsive tooling limitation; `Goctro_test3` received no test data.

## Current Physical Database

- `Goctro_test3`, PostgreSQL 18.6, Database V1.8, 40 public tables, **LOCKED LOCAL/DEV**.
- V1.7→V1.8 migration and populated-target CORE validation passed (78/78); target fingerprints match and no seed was run. Prisma format/validate/generate passed.
- Database V1.7 is the historical locked predecessor.
- See [V1.8 recurring Parking implementation report](07_modules/invoice-zalo/DATABASE_V1_8_RECURRING_PARKING_MIGRATION_IMPLEMENTATION_REPORT.md) and [Database Changelog](../../GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md).

## Active Module

**Billing / Invoice — PARTIAL.** Finalization uses `PrismaItemizedInvoicePricing`; the hourly scheduler records closeout reminders and ensures next-day drafts with catch-up. The `/admin/billing` workspace uses Owner-scoped, read-only backend readiness inspection, per-Contract periods, structured blockers, ready-to-finalize state, unpaid/overdue overview and the existing Invoice detail/finalize flow. `/admin/invoices` remains history. Disposable PostgreSQL 18 V1.8 API/browser checks verified Service-inclusive readiness, itemized finalization, READY→INVOICED charge consumption, rollback, and immutable finalized snapshots after later price versions. Invoice tests **157 PASS / 0 FAIL / 3 SKIP**, Auth **20/20**, frontend API/UI **57/57**, frontend typecheck and production build PASS. Backend typecheck still has **174 legacy diagnostics**, none in the Service Pass 3 files. Parking management remains unimplemented, so Billing is not claimed complete. No Pass 3 test data was written to `Goctro_test3`.

## Module Status

- **Billing / Invoice:** prior finalize route/PostgreSQL and authenticated Invoice browser evidence remains valid. Scheduler unit tests **8/8 PASS**; PostgreSQL V1.8 CORE **78/78**, fixture **171/171**; Invoice suite **157 PASS / 0 FAIL / 3 SKIP**, Auth **20/20 PASS**, frontend API/UI **57/57 PASS**, and frontend typecheck/production build PASS. Pass 3 browser verified Billing readiness and a successful itemized finalize with Rent, Electricity, Water, Fixed Service, Flexible Service, and Parking lines. PostgreSQL verifies charge rollback, out-of-period exclusion, and READY→INVOICED transactionality. The browser verified billed status after reload. Exact workspace narrow viewport and post-finalize filters remain incomplete. Billing stays **PARTIAL** because Parking management and final overall closure remain.
- **Service / Utilities / Paid Services:** **PARTIAL — APIs, PostgreSQL integration and core authenticated Admin browser smoke PASS; IA realignment implemented; exact responsive viewport unverified.** Sidebar exposes one “Dịch vụ & Tiện ích” entry; its workspace navigation contains four tabs: Điện & nước, Dịch vụ cố định, Tiện ích phát sinh and Parking. `/admin/services` redirects to `/admin/services/utilities`; the sidebar remains a single entry. Admin `/admin/viewings` is labeled “Lịch tiện ích” and renders a deferred-feature screen; the prior viewing-request workflow source is preserved but is not called by the page. Fixed/Flexible pricing and Billing integration remain intact. Flexible charge creation stays in backend and the direct Admin operational screen is no longer a primary navigation action. Approved future direction is Resident request/use → scheduling when needed → confirmed completion → backend charge → Billing; Resident scheduling is not implemented here. Prior Pass 3 evidence remains: CORE **78/78**, fixture **171/171**, Service **14/14**, Invoice **157 PASS / 0 FAIL / 3 SKIP**, Auth **20/20**, frontend API/UI **57/57**, frontend typecheck/build PASS; browser verified billing and service lifecycle. IA unit/type/build validation is tracked in the latest realignment report. `Goctro_test3` was not used; Parking operational management remains next.
- **Resident / Occupancy:** PARTIAL, not locked. Admin lifecycle evidence exists; Resident-authenticated portal verification and a supported onboarding path remain incomplete. Provisioning/self-service is deferred.
- **Contract:** PARTIAL, not locked. Admin HTTP lifecycle evidence exists; Resident privacy/session and full browser closure remain unverified. Contract document binary storage is blocked by unconfigured storage.
- **Complaints, Payment, Amenities, Parking, CT01, Notifications, and Dashboard/Reports:** no complete V1 application flow established by current project evidence. Complaints are explicitly deferred to a later version and their Admin route renders a lock screen; the old workflow source and backend are retained.

## Latest Milestone

Database V1.7 → V1.8 promotion completed on `Goctro_test3` with data fingerprints preserved and 40 public tables. The earlier authenticated browser closure covers Invoice list/detail/meter/finalize UI, itemization, lock and narrow layout; it is separate from the `/admin/billing` workspace browser check. The latest disposable V1.8 workspace rehearsal passed schema/seed install, CORE 78/78, fixture 171/171, manual browser login, initial missing-meter readiness, meter save/reload, READY state, successful itemized finalization, and server-loaded finalized detail. Post-finalize workspace queue/filter and exact narrow viewport remain unverified. This pass also reconfirmed the Resident filter middleware fix. Scheduler unit tests passed 8/8; prior PostgreSQL V1.8 scheduler/workspace integrations passed 1/1 each. The disposable DB was dropped; final health, DB health, CSRF, frontend and Goctro_test3:5432 identity passed. Goctro_test3 received no smoke Invoice or seed data. See the workspace browser smoke closure report. The Admin SaaS visual foundation and subsequent page-specific visual QA pass pass 64 frontend API/UI/navigation tests, typecheck and production build. Static CSS/source review covered 20 Admin/login routes; the current report records remaining manual visual review as pending.

## Scoped Public Sales prototype — 2026-10-15

The active /rooms public listing now shares the map Explorer with the retained /public-sales preview; incoming homepage/search URL filters continue using the existing public Room API. The interface uses a full-viewport React Three Fiber/Drei 34-province scene with floating inspectors/filters and a collapsible results drawer. The scene revision preserves live read-only Express/Prisma/PostgreSQL totals and room filters; Z-up camera safe-area fitting, drag rejection, desktop 1440×900/mobile 390×844, API outage/recovery, 12 scoped tests and frontend build passed. Forced WebGL hardware failure remains unverified. Default mode uses existing public available Room data; manually selected demonstration mode is explicitly labeled and never persisted. Desktop/mobile browser flow, live aggregate/DTO validation, existing public regression and frontend production build pass. No database/schema change or seed. Adoption/type/coordinates remain unavailable publicly; map provenance/limits and evidence are in [the prototype report](07_modules/public-marketplace/PUBLIC_SALES_3D_PROTOTYPE_REPORT.md). This scoped prototype does not replace the primary Parking/Billing next task.

## Remaining Limitations

Workspace code and PostgreSQL read-model integration pass on V1.8 rehearsal. Authenticated browser evidence covers readiness, meter save/reload, and successful itemized finalization. Service Pass 3 API/PostgreSQL and core Admin browser gates pass; exact viewport override and unrelated Billing workspace filters remain incomplete. `Goctro_test3` received no Pass 3 test data. Parking management is the remaining Service gap. Production Zalo delivery/recipient, Payment and Resident Invoice UX remain separate gaps. Frontend production build passes when Windows filesystem access is available; a sandbox-only SWC access denial was resolved by the permitted retry. Backend typecheck retains 174 legacy diagnostics.

## Locked Decisions

- Follow Database V1.8 physical artifacts as the current local/development schema baseline; do not make ad hoc schema changes.
- Billing business decisions and the existing finalize endpoint are recorded in the canonical Requirement and API Spec; production route wiring, disposable V1.8 PostgreSQL runtime verification, and Admin browser workflow review are complete. This establishes local operational closure only, not production deployment readiness.
- Contract API §5.7 is separately locked; that does not lock the whole Contract module.
- A future database change requires an approved business-rule change, a new version/migration, and runtime validation before promotion.

## Frozen / Deferred Work

- Resident account provisioning, self-service, and Resident-authenticated closure remain deferred; do not treat Account invitation schema as an implemented flow.
- Payment remains deferred and requires its own approved, scoped implementation task.
- Do not infer completion of legacy Admin pages for Accounts, Amenities, Parking, Complaints, or other database-only domains.

## Canonical Sources

1. [Requirement](../../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md) — business rules.
2. [API Spec](../../GocTro-SmartBuilding/docs/04_API_SPEC.md) — API contract.
3. [Database Changelog](../../GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md) and [Database V1.8 artifacts](../../GocTro-SmartBuilding/Database%20V1.8/README.md) — physical database truth.
4. This file — current project checkpoint, not business authority.
5. [Document Catalog](DOCUMENT_CATALOG.md) — document index/status.
6. Reports — evidence and history.
7. Agent memory/chat — convenience only; repository sources win.

## Latest Important Reports

- [Database V1.8 recurring Parking migration implementation](07_modules/invoice-zalo/DATABASE_V1_8_RECURRING_PARKING_MIGRATION_IMPLEMENTATION_REPORT.md) — CURRENT physical baseline/promotion evidence; V1.8 LOCKED locally. Its fail-closed note is historical and predates the production wiring report below.
- [Billing V1.8 Invoice finalize route PostgreSQL integration closure](07_modules/invoice-zalo/BILLING_V1_8_INVOICE_FINALIZE_ROUTE_POSTGRESQL_INTEGRATION_CLOSURE_REPORT.md) — CURRENT; disposable V1.8 install/validators, authenticated HTTP route, itemized persistence, concurrency, fail-closed and rollback checks pass; rehearsal deleted.
- [Admin Billing V1 backend connectivity and final browser closure](07_modules/invoice-zalo/ADMIN_BILLING_V1_BACKEND_CONNECTIVITY_AND_FINAL_BROWSER_CLOSURE_REPORT.md) — CURRENT evidence for the scoped Invoice UI workflow; it does not establish automatic period reminders or draft scheduling.
- [Billing V1 end-to-end business flow gap audit](07_modules/invoice-zalo/BILLING_V1_END_TO_END_BUSINESS_FLOW_GAP_AUDIT.md) — HISTORICAL GAP AUDIT; it recorded the missing reminder/draft scheduler before implementation. Scheduler and workspace implementation reports supersede those findings.
- [Billing V1 period-end reminder and next-day draft scheduler](07_modules/invoice-zalo/BILLING_V1_PERIOD_END_REMINDER_AND_DRAFT_SCHEDULER_IMPLEMENTATION_REPORT.md) — CURRENT implementation evidence; hourly scheduler, durable period reminder, next-day draft and chronological catch-up verified with PostgreSQL V1.8 integration.
- [Billing V1 period workspace and readiness queue](07_modules/invoice-zalo/BILLING_V1_PERIOD_WORKSPACE_READINESS_QUEUE_IMPLEMENTATION_REPORT.md) — CURRENT implementation + PostgreSQL verification; authenticated browser/narrow-viewport closure remains pending.
- [Service / Utilities / Parking current-state audit](07_modules/service/SERVICE_MODULE_CURRENT_STATE_AUDIT.md) — CURRENT read-only audit of V1.8 data models, resolver coverage, missing management surfaces, Goctro_test3 source-data blockers and next implementation sequence.
- [Service Pass 2 — Utility Tariff + Meter Source Management](07_modules/service/SERVICE_PASS_2_UTILITY_TARIFF_METER_SOURCE_IMPLEMENTATION_REPORT.md) — earlier implementation snapshot; runtime closure is in the report below.
- [Service Pass 2 recovery closure — Utility Tariff + Meter Source](07_modules/service/SERVICE_PASS_2_UTILITY_TARIFF_METER_SOURCE_CLOSURE_REPORT.md) — PARTIAL; PostgreSQL/API and core Admin browser smoke PASS; responsive viewport remains unverified because browser control does not expose a viewport override. Disposable DB removed and Goctro_test3 stack restored.
- [Service Pass 3 — Fixed + Flexible Service management](07_modules/service/SERVICE_PASS_3_FIXED_FLEXIBLE_SERVICE_IMPLEMENTATION_REPORT.md) — CURRENT implementation evidence; PostgreSQL and authenticated Admin browser flows verify creation, price versioning, event charges, Billing readiness/finalization, atomic charge consumption, rollback and immutable invoice snapshots. Parking remains the next Service gap; exact responsive viewport remains unverified.
- [Service information architecture and product flow realignment](07_modules/service/SERVICE_MODULE_INFORMATION_ARCHITECTURE_PRODUCT_FLOW_REALIGNMENT_REPORT.md) — CURRENT; unified Admin Service workspace/navigation and approved Resident-to-charge product direction; financial backend and Database V1.8 remain unchanged.
- [Billing workspace authenticated browser smoke and failure diagnosis](07_modules/invoice-zalo/BILLING_V1_WORKSPACE_AUTHENTICATED_BROWSER_SMOKE_CLOSURE_REPORT.md) — CURRENT API and core browser flow evidence; post-finalize workspace/filter and exact responsive checks remain incomplete.
- [Billing V1.8 production Invoice finalization wiring](07_modules/invoice-zalo/BILLING_V1_8_PRODUCTION_INVOICE_FINALIZATION_WIRING_REPORT.md) — HISTORICAL status snapshot; production source wiring evidence remains valid, but its pending route-verification statement was superseded by the closure report above.
- [Database V1.7 apply and post-migration validation](07_modules/invoice-zalo/DATABASE_V1_7_LOCKED_DB_APPLY_POST_MIGRATION_VALIDATION_REPORT.md) — historical predecessor promotion evidence.
- [Billing V1.7 design review](07_modules/invoice-zalo/DATABASE_V1_7_DESIGN_REVIEW_APPROVAL_REPORT.md) and [product decision closure](07_modules/invoice-zalo/BILLING_V1_7_PRODUCT_DECISION_CLOSURE_REPORT.md) — approved design/business decisions; not application implementation evidence.
- [Billing backend gap review](07_modules/invoice-zalo/BILLING_V1_7_BACKEND_IMPLEMENTATION_GAP_REVIEW_REPORT.md) — current source/schema comparison and implementation order.
- [Billing V1.7 Utility Tariff Resolver](07_modules/invoice-zalo/BILLING_V1_7_UTILITY_TARIFF_RESOLVER_IMPLEMENTATION_REPORT.md) — internal read-only tariff repository/resolver; earlier Invoice suite 51/51 PASS; now consumed through the itemized production adapter.
- [Billing V1.7 Meter Continuity Rule Alignment + Implementation](07_modules/invoice-zalo/BILLING_V1_7_METER_CONTINUITY_RULE_ALIGNMENT_IMPLEMENTATION_REPORT.md) — Requirement/API aligned to same-Contract continuity; draft openings resolve with source provenance; earlier Invoice 69/69 and Contract 134/134 tests passed; now consumed through the itemized production adapter.
- [Billing V1.7 Fixed Service Price Resolver](07_modules/invoice-zalo/BILLING_V1_7_FIXED_SERVICE_PRICE_RESOLVER_IMPLEMENTATION_REPORT.md) — Property-scoped active Fixed Service versions selected at Invoice `period_start`; earlier focused tests and Invoice suite passed; now consumed through the itemized production adapter.
- [Billing V1.7 Flexible Service Charge Resolver](07_modules/invoice-zalo/BILLING_V1_7_FLEXIBLE_SERVICE_CHARGE_RESOLVER_IMPLEMENTATION_REPORT.md) — charge eligibility and Property price at `occurred_at`, inclusive Vietnam calendar-day period membership; earlier focused tests passed; charges are consumed by the itemized adapter when finalization succeeds.
- [Billing V1.7 Parking Price + Entitlement Resolver](07_modules/invoice-zalo/BILLING_V1_7_PARKING_PRICE_ENTITLEMENT_RESOLVER_IMPLEMENTATION_REPORT.md) — paid/free/unclassified assignment resolution and Property price at `period_start`; earlier focused tests passed; now consumed through the itemized production adapter.
- [Billing V1.7 itemized calculator + atomic finalization](07_modules/invoice-zalo/BILLING_V1_7_ITEMIZED_INVOICE_CALCULATOR_ATOMIC_FINALIZATION_IMPLEMENTATION_REPORT.md) — historical initial integration failure on the old V1.7 global Parking index; V1.8 retest is in the implementation report above.
- [Recurring Parking billing database change request](07_modules/invoice-zalo/DATABASE_CHANGE_REQUEST_RECURRING_PARKING_BILLING.md) — approved V1.8 business/schema change; physical implementation and promotion are complete.
- [Billing UX, Requirement & data-readiness audit](07_modules/invoice-zalo/BILLING_V1_7_UX_REQUIREMENT_DATA_READINESS_AUDIT_REPORT.md) — Admin/Resident UI, backend, API and V1.7 structure/data gaps; review-only.
- [Admin Invoice V1 read-list integration](07_modules/invoice-zalo/ADMIN_INVOICE_V1_READ_LIST_INTEGRATION_REPORT.md) — historical implementation snapshot; live-data browser verification is recorded in the current connectivity and final browser closure report.
- [Admin Billing V1 final operational closure](07_modules/invoice-zalo/ADMIN_BILLING_V1_FINAL_OPERATIONAL_CLOSURE_REPORT.md) — earlier browser evidence; its pending status is superseded by the current connectivity and final browser closure report.
- [Admin Invoice V1 final browser closure](07_modules/invoice-zalo/ADMIN_INVOICE_V1_FINAL_BROWSER_CLOSURE_REPORT.md) — earlier post-fix browser evidence; latest overall operational status and console limitation are in the current connectivity and final browser closure report.
- [Admin Invoice V1 browser verification closure](07_modules/invoice-zalo/ADMIN_INVOICE_V1_BROWSER_VERIFICATION_CLOSURE_REPORT.md) — historical evidence for the API/filter middleware fix and the pre-final browser limitation.
- [Authenticated Admin browser smoke setup](07_modules/auth/AUTHENTICATED_ADMIN_BROWSER_SMOKE_SETUP_REPORT.md) — existing DEV Admin authenticated locally; session survived reload and 2 Invoice rows rendered; no DB rows changed.
- [Resident / Occupancy closure](07_modules/resident-occupancy/RESIDENT_OCCUPANCY_FINAL_BUSINESS_GAP_RECHECK_E2E_CLOSURE_REPORT.md) — PARTIAL; Resident authenticated closure remains open.
- [Contract authenticated E2E closure](07_modules/contract/CONTRACT_AUTHENTICATED_ADMIN_RESIDENT_E2E_CLOSURE_REPORT.md) — PARTIAL; not a whole-module lock.
- [Project current-state audit](11_project-reports/PROJECT_CURRENT_STATE_AUDIT_2026_10_12.md) and [Requirement coverage audit](11_project-reports/REQUIREMENT_IMPLEMENTATION_COVERAGE_AUDIT_2026_10_13.md) — historical snapshots; their pre-V1.7 database statements are superseded by the later apply evidence.
- [Governance finalization report](11_project-reports/SOURCE_OF_TRUTH_CURRENT_STATE_GOVERNANCE_FINALIZATION_REPORT.md) — this workflow/checkpoint update.

## Exact Next Task

**SERVICE PASS 4 — Parking operational management + Billing integration.** Fixed/Flexible service management is implemented and verified through PostgreSQL integration and an authenticated Admin browser flow. Parking remains the next Service gap. Exact responsive viewport coverage and Billing workspace post-finalize/filter closure remain documented limitations; Zalo delivery, Payment, and Resident Invoice UX remain later tasks.

## Resume Checklist

1. Read repository-wide [AGENTS.md](../AGENTS.md), [Documentation Rules](DOCUMENTATION_RULES.md), this checkpoint, and the [Document Catalog](DOCUMENT_CATALOG.md).
2. Read the relevant canonical Requirement/API/Database sources and current module reports.
3. Inspect current code and compare it with those sources before changing anything.
4. If evidence conflicts or is ambiguous, classify and report the conflict; do not guess.
5. At task end, update only the canonical docs, catalog, checkpoint, and report entries whose status meaningfully changed.
