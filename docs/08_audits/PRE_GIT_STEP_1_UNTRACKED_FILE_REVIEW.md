# Pre-Git Step 1 — Untracked File Review

**Date:** 2026-10-15  
**Scope:** Review every non-ignored untracked path in `SmartRentalManagement` and classify it for a later staging decision. This is Step 1 only. No staging, deletion, refactor, commit, push, business/API/database change was performed.

## 1. Current Git state

Snapshot after this report is created: **307 untracked files**. Before creating the report there were 306. Other working-tree state at the start of this review: 27 modified tracked paths and 3 deleted tracked paths; those were not inspected or modified as part of this untracked-only step. No `git add`, `git rm`, commit or push was run.

The ignored `.next`, `dist`, `.local`, dependency folders, `.env` files and TypeScript build state are not untracked files and are not included in the 307-file matrix. They remain covered by ignore rules checked during the preceding repository audit.

## 2. Classification key and staging sets

| Code | Classification | Stage later? |
|---|---|---|
| A | SOURCE — KEEP | Yes, after normal diff review. |
| B | TEST — KEEP | Yes, with the source they protect. |
| C | DOCS — KEEP | Yes for cataloged governance/history/report documents; this class includes root `AGENTS.md` and this report. |
| D | ASSET — KEEP | Yes; current assets have runtime or documented source usage. |
| E | LEGACY — KEEP FOR NOW | Decision required before staging historical Prisma snapshots. |
| F | GENERATED — DO NOT STAGE | No such non-ignored untracked path found. |
| G | LOCAL/TEMP — DO NOT STAGE | No such non-ignored untracked path found. |
| H | DELETE CANDIDATE | No; source is preserved in this step. |
| I | REVIEW MANUALLY | No, until the purpose/status is confirmed. |

Evidence shorthand used in the complete matrix:

- **SRC-BE:** V1 router is mounted by `backend/src/app.ts`; module routes, services, repositories, validators and middleware are imported directly or transitively by `backend/src/auth/v1.router.ts` and its domain routers.
- **SRC-FE:** App Router page or active parent imports the component/helper; shared API helpers are imported by current pages/components.
- **TEST:** test file belongs to an active domain and is run by its workspace test script or dedicated runtime test command. The runtime preparation script is documented by the Contract test report.
- **DOC:** listed in `docs/DOCUMENT_CATALOG.md`; the matrix includes the catalog status. Eight reports have a clear report purpose but no catalog entry and are placed in I pending status review.
- **GOV:** root `AGENTS.md` contains current repository governance.
- **ASSET:** public brand assets are referenced by current route components; root source logo is documented in the visual redesign report.
- **PRISMA-HIST:** legacy/V1.1/V1.2 Prisma files are historical mappings; current runtime mapping is `database/schema.prisma`.
- **SCRIPT:** local development scripts are called by root `package.json` and the startup report.
- **ORPHAN:** source scan found no import or route mount; replacement is active, but deletion requires owner review.
- **ENV:** `.env.example` contains only the public frontend API-base configuration key and a localhost development value; it contains no credential.

### Set A — should stage later

- All A (SOURCE), B (TEST), cataloged C (DOCS), and D (ASSET) rows below, after ordinary content/diff review.
- The current docs tree preserves governance and historical implementation evidence. The 8 unlisted reports are excluded until their status is decided.

### Set B — should not stage

- There are **0 non-ignored untracked paths** classified F or G.
- Keep ignored `.env`, `.local`, database backups, build output and local runtime files out of staging. They are not in the untracked list.

### Set C — decision required before staging

- Three historical Prisma snapshots under `database/`.
- Three orphan UI source files in category H; do not delete or stage until their retention is decided.
- Eight report files without a Document Catalog entry.

## 3. Grouped inventory and counts

| Repository group | Untracked paths | Classification / note |
|---|---:|---|
| Backend | 104 | Modular backend source and test files; test files are individually marked B. |
| Frontend | 85 | Routes, components, API helpers, tests, two public assets and one env example; orphan components are individually marked H. |
| Docs | 110 | 101 cataloged docs are C; 8 not in catalog are I; this report is included as C. |
| Database / Prisma | 3 | Historical mapping snapshots, E. |
| Root files | 2 | `AGENTS.md` (C) and source logo SVG (D). |
| Scripts | 3 | Two local dev scripts are A; runtime test helper is B. |
| **Before this report** | **306** | Git inventory. |
| This report | 1 | C, self-included below. |
| **Total classified** | **307** | Every non-ignored untracked file listed below. |

## 4. Source usage evidence

- Backend source is mounted through the V1 router and domain dependencies, as indicated by SRC-BE. Tests are explicit test-only rows. The modular source supports Auth, Property/Room, Resident/Occupancy, Contract/documents, Invoice/Billing/Zalo, Room Images, Public Marketplace and Services.
- Frontend page files are App Router route entries. Adjacent components and API helpers are imported by those pages or shared shells, as indicated by SRC-FE.
- The three H candidates are the only orphan UI files found in this untracked set. `frontend/src/app/tenants/tenant-management.tsx` was an earlier audit candidate but is tracked, so it is outside this review's untracked-only inventory.
- `frontend/.env.example` is a safe public endpoint template, not an application secret. Actual `.env` files are ignored and excluded.
- Root and public brand assets have current/documented references; neither duplicate logo copy is identified as deletable here.

## 5. Legacy and historical review

| Path(s) | Old purpose | Current replacement | References / disposition |
|---|---|---|---|
| `database/schema.legacy.prisma` | Original demo/legacy ORM mapping | Current `database/schema.prisma` V1.8 | Historical mapping retained by the Prisma remap task; E, keep pending staging decision. |
| `database/schema.v1_1.prisma`, `database/schema.v1_2.prisma` | Prior V1.1/V1.2 ORM mappings | Current `database/schema.prisma` V1.8 | Historical mappings; no runtime import expected. E, keep pending staging decision. |
| `frontend/src/app/admin/viewings/legacy-viewing-requests-workflow.tsx` | Earlier viewing-request page backed by unversioned API | Current `/admin/viewings` deferred screen | No current import; backend legacy route still exists. H candidate, preserve pending decision. |
| `frontend/src/app/admin/complaints/legacy-complaints-workflow.tsx` | Earlier maintenance/complaint workflow | Current `/admin/complaints` deferred screen | No current import; backend legacy route still exists. H candidate, preserve pending decision. |
| `frontend/src/app/admin/services/service-overview.tsx` | Removed Services overview UI | `/admin/services` redirects to Utilities; four child tabs remain | No import/route reference; overview CSS selectors remain. H candidate, review component and CSS together later. |
| `docs/**` historical reports and schemas | Prior implementation, decisions and validation evidence | Current State + later module reports/canonical adjacent-project docs | Retain according to catalog status; eight reports missing catalog status are I. |

No files in `legacy/` itself are untracked in the current Git state; it is not part of this classification list. Do not infer it should be deleted from its name.

## 6. Docs status verification

- **101** of the 109 pre-existing untracked Markdown files under `docs/` have matching entries in `DOCUMENT_CATALOG.md`; each such file is marked C and its catalog status is printed in the matrix.
- **8** report files have no catalog row. Their purpose is identifiable from content/title, but their status is unknown for staging. They are I until the catalog is reconciled.
- Root `AGENTS.md` is a current governance instruction, not business authority.
- The Step 1 report is C and is added to the catalog by this task.
- Historical/superseded reports are retained; no historical document is removed.

## 7. Generated / temporary and ignore review

There are no F or G paths in the non-ignored untracked set. `git ls-files --others --exclude-standard` excludes ignored files by design. Earlier audit verified `.next`, `dist`, `.local`, `.env`, `*.tsbuildinfo`, `*.pid`, temp files and logs are covered by `.gitignore`; ignored local files were confirmed with `git check-ignore`. No `.env`, local database dump, PID, log or generated build output is included in this matrix. No current ignore gap was found. A future database dump created outside `.local/` would not match a global `*.dump` rule, so keep exports under `.local/` or decide whether to add that rule in a later ignore review.

## 8. Count summary

Counts include this report and add up to **307**:

| Classification | Count |
|---|---:|
| SOURCE — KEEP | 131 |
| TEST — KEEP | 56 |
| DOCS — KEEP | 103 |
| ASSET — KEEP | 3 |
| LEGACY — KEEP FOR NOW | 3 |
| GENERATED — DO NOT STAGE | 0 |
| LOCAL/TEMP — DO NOT STAGE | 0 |
| DELETE CANDIDATE | 3 |
| REVIEW MANUALLY | 8 |
| **Total** | **307** |

Of the 56 test-classified files, 55 are `*.test.*`/`*.spec.*` files and one is the documented disposable Contract runtime test helper. Docs Keep includes 101 cataloged documents, root governance instructions and this report. The 8 uncataloged reports are excluded from Docs Keep and counted as Review Manually.

## 9. Exact Step 2 input

Step 2 should consume the **307 path rows in §10** and produce a proposed staging allowlist only. Keep the current tracked changes out of scope until the user starts Step 2. Exclude categories E, H, and I from the allowlist pending decisions; never stage F/G if any are generated later. Do not delete the three H files during Step 2 unless explicitly authorized.

## 10. Complete untracked file classification matrix

| Path | Category | Used? | Evidence / status | Risk | Stage Later? | Recommendation |
|---|---|---|---|---|---|---|
| `AGENTS.md` | C DOCS KEEP | Documentation/governance | GOV — root agent instructions | Project workflow rules missing if omitted | Yes | KEEP |
| `backend/src/auth/account-repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/auth/auth.routes.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/auth/auth.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/auth/auth.types.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/auth/password.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/auth/session-store.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/auth/v1.router.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/config/env.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/contract-documents/contract-document.service.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/contract-documents/contract-document.service.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/contract-documents/object-storage.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/contracts/contract-idempotency.integration.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/contracts/contract-idempotency.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/contracts/contract-idempotency.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/contracts/contract.date.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/contracts/contract.repository.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/contracts/contract.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/contracts/contract.routes.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/contracts/contract.routes.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/contracts/contract.validation.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/contracts/contract.validation.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/billing-scheduler.postgres.integration.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/billing-scheduler.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/billing-scheduler.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/billing-scheduler.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/billing-workspace.postgres.integration.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/billing-workspace.repository.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/billing-workspace.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/fixed-service-price.repository.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/fixed-service-price.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/fixed-service-price.resolver.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/fixed-service-price.resolver.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/flexible-service-charge.repository.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/flexible-service-charge.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/flexible-service-charge.resolver.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/flexible-service-charge.resolver.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice-itemized.calculator.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice-itemized.calculator.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice-itemized.postgres.integration.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice-itemized.pricing.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice.billing.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice.billing.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice.pricing.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice.repository.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice.routes.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice.routes.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice.validation.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/invoice.validation.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/meter-continuity.repository.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/meter-continuity.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/meter-continuity.resolver.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/meter-continuity.resolver.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/parking-billing.repository.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/parking-billing.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/parking-billing.resolver.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/parking-billing.resolver.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/utility-tariff.repository.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/utility-tariff.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/invoices/utility-tariff.resolver.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/invoices/utility-tariff.resolver.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/middleware/api-error.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/middleware/auth.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/middleware/csrf.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/middleware/error-handler.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/middleware/request-id.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/properties/property-room.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/properties/property-room.routes.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/properties/property-room.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/properties/property-room.validation.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/properties/room-status.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/public-marketplace/public-marketplace.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/public-marketplace/public-marketplace.routes.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/public-marketplace/public-marketplace.routes.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/public-marketplace/public-marketplace.validation.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/residents/resident.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/residents/resident.routes.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/residents/resident.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/residents/resident.validation.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/room-images/room-image.repository.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/room-images/room-image.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/room-images/room-image.routes.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/room-images/room-image.routes.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/room-images/room-image.service.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/room-images/room-image.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/room-images/storage.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/room-images/validation.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/services/parking-management.postgres.integration.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/services/parking-management.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/services/parking-management.routes.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/services/parking-management.routes.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/services/property-service.postgres.integration.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/services/property-service.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/services/property-service.routes.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/services/property-service.routes.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/services/utility-tariff-management.repository.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/services/utility-tariff-management.repository.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/services/utility-tariff.routes.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/services/utility-tariff.routes.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/types/express.d.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/utils/ids.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/zalo/invoice-zalo.service.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `backend/src/zalo/invoice-zalo.service.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `backend/src/zalo/zalo-provider.ts` | A SOURCE KEEP | Yes, directly/transitively mounted | SRC-BE — V1 router/domain import graph | Backend domain/API implementation lost if omitted | Yes | KEEP |
| `database/schema.legacy.prisma` | E LEGACY KEEP FOR NOW | Historical mapping only | PRISMA-HIST — current mapping is schema.prisma | Useful migration/remap reference; not current mapping | No | KEEP FOR NOW |
| `database/schema.v1_1.prisma` | E LEGACY KEEP FOR NOW | Historical mapping only | PRISMA-HIST — current mapping is schema.prisma | Useful migration/remap reference; not current mapping | No | KEEP FOR NOW |
| `database/schema.v1_2.prisma` | E LEGACY KEEP FOR NOW | Historical mapping only | PRISMA-HIST — current mapping is schema.prisma | Useful migration/remap reference; not current mapping | No | KEEP FOR NOW |
| `docs/00_CURRENT_STATE.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/02_architecture/DOMAIN_MODEL.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/03_database/DATABASE_V1_6_RESIDENT_AVATAR_ACCOUNT_PHONE_MIGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — LOCKED PREDECESSOR | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/03_database/migrations/V1_1_DATA_MIGRATION_PLAN.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/03_database/prisma/PRISMA_V1_1_REMAP_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/03_database/prisma/PRISMA_V1_2_REMAP_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/03_database/prisma/PRISMA_V1_3_CONTRACT_AUDIT_REMAP_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/05_backend/auth/BACKEND_FOUNDATION_AUTH_V1_2_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/06_frontend/design/CORE_MODULES_SAAS_REDESIGN_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/06_frontend/design/wireframes/wireframe-quan-ly-khach-thue-v2.html` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/06_frontend/integrations/FRONTEND_INTEGRATION_PASS_1_AUTH_PROPERTY_ROOM_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/auth/AUTHENTICATED_ADMIN_BROWSER_SMOKE_SETUP_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — SETUP PASS | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/auth/AUTH_END_TO_END_COMPLETION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/contract/CONTRACT_API_V1_2_MIGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — SUPERSEDED | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/contract/CONTRACT_API_V1_3_MIGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/contract/CONTRACT_API_V1_3_RESIDENT_SUCCESSOR_PRIVACY_FIX_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/contract/CONTRACT_AUTHENTICATED_ADMIN_RESIDENT_E2E_CLOSURE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — PARTIAL | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/contract/CONTRACT_BUSINESS_REQUIREMENT_AUDIT.md` | C DOCS KEEP | Documentation/governance | DOC — SUPERSEDED | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/contract/CONTRACT_BUSINESS_RULE_ALIGNMENT_P1_FIX_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/contract/CONTRACT_DURABLE_IDEMPOTENCY_RUNTIME_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/contract/CONTRACT_FRONTEND_MIGRATION_E2E_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/contract/CONTRACT_P1_6_ACCOUNT_MODEL_RECONCILIATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/contract/DATABASE_V1_4_TO_V1_5_MIGRATION_FINAL_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/contract/DATABASE_V1_4_TO_V1_5_MIGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/contract/DATABASE_V1_5_CONTRACT_IDEMPOTENCY_DESIGN.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/ADMIN_BILLING_V1_BACKEND_CONNECTIVITY_AND_FINAL_BROWSER_CLOSURE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — SCOPED UI WORKFLOW PASS | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/ADMIN_BILLING_V1_BUSINESS_WORKFLOW_AND_SEARCH_UX_CLOSURE_REPORT.md` | I REVIEW MANUALLY | Report exists; status unclear | No DOCUMENT_CATALOG row | Historical/current status and staging intent unclear | No | REVIEW |
| `docs/07_modules/invoice-zalo/ADMIN_BILLING_V1_FINAL_OPERATIONAL_CLOSURE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — EARLIER PARTIAL SNAPSHOT | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/ADMIN_INVOICE_V1_BROWSER_VERIFICATION_CLOSURE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — PRE-FIX/PARTIAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/ADMIN_INVOICE_V1_BROWSER_VERIFICATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — PARTIAL SNAPSHOT | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/ADMIN_INVOICE_V1_DETAIL_METER_FINALIZE_ITEMIZED_UX_REPORT.md` | I REVIEW MANUALLY | Report exists; status unclear | No DOCUMENT_CATALOG row | Historical/current status and staging intent unclear | No | REVIEW |
| `docs/07_modules/invoice-zalo/ADMIN_INVOICE_V1_FINAL_BROWSER_CLOSURE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — EARLIER BROWSER PASS | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/ADMIN_INVOICE_V1_READ_LIST_INTEGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — PRE-CLOSURE SNAPSHOT | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/API_SPEC_INVOICE_ZALO_HARDENING_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_DEMO_INVOICE_MISSING_PRICING_DIAGNOSIS_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — READ-ONLY DIAGNOSIS | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_API_DATABASE_DESIGN_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE — APPROVED | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_BACKEND_IMPLEMENTATION_GAP_REVIEW_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE — PRE-IMPLEMENTATION REVIEW | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_CANONICAL_REQUIREMENT_SYNC_REPORT.md` | I REVIEW MANUALLY | Report exists; status unclear | No DOCUMENT_CATALOG row | Historical/current status and staging intent unclear | No | REVIEW |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_FIXED_SERVICE_PRICE_RESOLVER_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — IMPLEMENTED; USED BY ITEMIZED FINALIZE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_FLEXIBLE_SERVICE_CHARGE_RESOLVER_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — IMPLEMENTED; CONSUMED BY ITEMIZED FINALIZE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_ITEMIZED_INVOICE_CALCULATOR_ATOMIC_FINALIZATION_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — V1.7 PARKING BLOCKER | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_METER_CONTINUITY_RULE_ALIGNMENT_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — IMPLEMENTED; USED BY ITEMIZED FINALIZE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_PARKING_PRICE_ENTITLEMENT_RESOLVER_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — IMPLEMENTED; USED BY ITEMIZED FINALIZE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_PRODUCT_DECISION_CLOSURE_REPORT.md` | I REVIEW MANUALLY | Report exists; status unclear | No DOCUMENT_CATALOG row | Historical/current status and staging intent unclear | No | REVIEW |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_UTILITY_TARIFF_RESOLVER_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — IMPLEMENTED; USED BY ITEMIZED FINALIZE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_7_UX_REQUIREMENT_DATA_READINESS_AUDIT_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE — PRE-IMPLEMENTATION REVIEW | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_8_INVOICE_FINALIZE_ROUTE_POSTGRESQL_INTEGRATION_CLOSURE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — ROUTE VERIFICATION PASS | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_8_PRODUCTION_INVOICE_FINALIZATION_WIRING_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL STATUS SNAPSHOT | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_END_TO_END_BUSINESS_FLOW_GAP_AUDIT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — SCHEDULER AND WORKSPACE IMPLEMENTED | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_PERIOD_END_REMINDER_AND_DRAFT_SCHEDULER_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — IMPLEMENTATION PASS | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_PERIOD_WORKSPACE_READINESS_QUEUE_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — IMPLEMENTED / POSTGRES PASS / BROWSER PENDING | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/BILLING_V1_PRICING_SNAPSHOT_SCHEMA_GAP_AUDIT.md` | I REVIEW MANUALLY | Report exists; status unclear | No DOCUMENT_CATALOG row | Historical/current status and staging intent unclear | No | REVIEW |
| `docs/07_modules/invoice-zalo/BILLING_V1_WORKSPACE_AUTHENTICATED_BROWSER_SMOKE_CLOSURE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — CORE BROWSER FLOW PASS / CLOSURE PARTIAL | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/DATABASE_CHANGE_REQUEST_RECURRING_PARKING_BILLING.md` | C DOCS KEEP | Documentation/governance | DOC — APPROVED — IMPLEMENTED IN V1.8 | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/DATABASE_V1_7_DESIGN_REVIEW_APPROVAL_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE — APPROVED DESIGN | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/DATABASE_V1_7_LOCKED_DB_APPLY_POST_MIGRATION_VALIDATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — LOCKED PREDECESSOR | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/DATABASE_V1_7_LOCKED_DB_PROMOTION_REVIEW.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — NO-GO | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/DATABASE_V1_7_LOCKED_DB_PROMOTION_REVIEW_RERUN.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — GO, NOT PROMOTED | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/DATABASE_V1_7_MIGRATION_IMPLEMENTATION_VALIDATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — INITIAL REHEARSAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/DATABASE_V1_7_POPULATED_TARGET_VALIDATOR_COMPATIBILITY_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — REHEARSAL PASS | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/DATABASE_V1_7_PROTECTED_TARGET_GUARD_RECONCILIATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — GUARD RECONCILED | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/invoice-zalo/DATABASE_V1_8_RECURRING_PARKING_MIGRATION_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — PASS / LOCKED LOCAL-DEV | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/invoice-zalo/INVOICE_ZALO_API_MIGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/property-room/DATABASE_V1_4_RUNTIME_VALIDATOR_POPULATED_DB_COMPATIBILITY_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/property-room/LOCAL_GOCTRO_TEST3_V1_3_TO_V1_4_MIGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/property-room/PROPERTY_ROOM_API_V1_2_MIGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/property-room/PROPERTY_ROOM_E2E_CLOSURE_REPORT.md` | I REVIEW MANUALLY | Report exists; status unclear | No DOCUMENT_CATALOG row | Historical/current status and staging intent unclear | No | REVIEW |
| `docs/07_modules/property-room/PROPERTY_ROOM_END_TO_END_COMPLETION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/property-room/PROPERTY_ROOM_ROOM_IMAGES_FINAL_HOST_BROWSER_CLOSURE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/property-room/PROPERTY_ROOM_ROOM_IMAGES_FRONTEND_INTEGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/property-room/PROPERTY_ROOM_ROOM_IMAGES_HOST_BROWSER_SMOKE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/public-marketplace/DATABASE_V1_4_ROOM_IMAGES_MIGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/public-marketplace/PUBLIC_SALES_FUNNEL_RESPONSIVE_UX_AUDIT_FIX_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/public-marketplace/PUBLIC_SALES_FUNNEL_V1_AUDIT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/public-marketplace/PUBLIC_SALES_FUNNEL_V1_BACKEND_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/public-marketplace/PUBLIC_SALES_FUNNEL_V1_FRONTEND_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/public-marketplace/ROOM_IMAGES_V1_BACKEND_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/public-marketplace/ROOM_IMAGES_V1_RUNTIME_VERIFICATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/public-marketplace/ROOM_IMAGES_V1_SCHEMA_MIGRATION_DESIGN.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/resident-occupancy/FRONTEND_INTEGRATION_PASS_2_RESIDENT_OCCUPANCY_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/resident-occupancy/RESIDENT_ACCOUNT_PROVISIONING_SELF_SERVICE_FOUNDATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/resident-occupancy/RESIDENT_ACCOUNT_PROVISIONING_SELF_SERVICE_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — RESUME DEFERRED | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/resident-occupancy/RESIDENT_OCCUPANCY_API_V1_2_MIGRATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/resident-occupancy/RESIDENT_OCCUPANCY_BUSINESS_AUDIT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/resident-occupancy/RESIDENT_OCCUPANCY_END_TO_END_COMPLETION_REPORT.md` | I REVIEW MANUALLY | Report exists; status unclear | No DOCUMENT_CATALOG row | Historical/current status and staging intent unclear | No | REVIEW |
| `docs/07_modules/resident-occupancy/RESIDENT_OCCUPANCY_FINAL_BUSINESS_GAP_RECHECK_E2E_CLOSURE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — PARTIAL | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/service/SERVICE_MODULE_CURRENT_STATE_AUDIT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — AUDIT; PARTIALLY SUPERSEDED | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/service/SERVICE_MODULE_INFORMATION_ARCHITECTURE_PRODUCT_FLOW_REALIGNMENT_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — IA REALIGNED; PARKING NEXT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/service/SERVICE_PASS_2_UTILITY_TARIFF_METER_SOURCE_CLOSURE_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — PARTIAL; API/POSTGRES + CORE ADMIN BROWSER PASS | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/service/SERVICE_PASS_2_UTILITY_TARIFF_METER_SOURCE_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL — IMPLEMENTATION SNAPSHOT | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/07_modules/service/SERVICE_PASS_3_FIXED_FLEXIBLE_SERVICE_IMPLEMENTATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE — IMPLEMENTATION SNAPSHOT BEFORE IA REALIGNMENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/07_modules/ui/ADMIN_UI_BUSINESS_PRESENTATION_AUDIT_REPORT.md` | I REVIEW MANUALLY | Report exists; status unclear | No DOCUMENT_CATALOG row | Historical/current status and staging intent unclear | No | REVIEW |
| `docs/08_audits/MIGRATION_GAP_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/08_audits/PRE_GIT_REPOSITORY_AUDIT_AND_CLEANUP_PLAN.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — REVIEW REQUIRED | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/08_audits/PRE_GIT_STEP_1_UNTRACKED_FILE_REVIEW.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — STEP 1 REVIEW | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/10_operations/LOCAL_DEV_STARTUP_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/10_operations/REPOSITORY_CLEANUP_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/11_project-reports/ADMIN_SAAS_UI_UX_REDESIGN_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — REFERENCE — PRE-VISUAL-QA SNAPSHOT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/11_project-reports/ADMIN_SAAS_UI_UX_VISUAL_QA_AND_CLEANUP_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT — STATIC QA + AUTOMATED CHECKS PASS; MANUAL BROWSER REVIEW PENDING | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/11_project-reports/AGENTS_MD_PROJECT_WORKFLOW_SETUP_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/11_project-reports/BAO_CAO_TIEN_DO_DU_AN_GOC_TRO.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/11_project-reports/DOCS_REORGANIZATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/11_project-reports/PROJECT_CURRENT_STATE_AUDIT_2026_10_12.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/11_project-reports/REQUIREMENT_IMPLEMENTATION_COVERAGE_AUDIT_2026_10_13.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/11_project-reports/SOURCE_OF_TRUTH_CURRENT_STATE_GOVERNANCE_FINALIZATION_REPORT.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/11_project-reports/Tom_tat_chinh_sua_Goc_tro.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/12_decisions/V1_1_MIGRATION_DECISIONS.md` | C DOCS KEEP | Documentation/governance | DOC — HISTORICAL | Historical decision/evidence loses traceability | Yes | KEEP |
| `docs/DOCUMENTATION_RULES.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/DOCUMENT_CATALOG.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `docs/README.md` | C DOCS KEEP | Documentation/governance | DOC — CURRENT | Governance or implementation evidence missing if omitted | Yes | KEEP |
| `frontend/.env.example` | A SOURCE KEEP | Local frontend config template | ENV — public API-base key only, localhost default | Dev setup loses documented endpoint default | Yes | KEEP |
| `frontend/public/assets/goc-tro-logo-newstyle.svg` | D ASSET KEEP | Yes | `login-form.tsx` and `admin-shell.tsx` reference it | Login/sidebar branding breaks if omitted | Yes | KEEP |
| `frontend/public/assets/logo-goc-tro-mark.png` | D ASSET KEEP | Yes | `public-room-card.tsx` and `public-room-gallery.tsx` reference it | Public room image fallback breaks if omitted | Yes | KEEP |
| `frontend/src/app/admin/billing/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/billing/workspace.test.tsx` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/billing/workspace.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/complaints/legacy-complaints-workflow.tsx` | H DELETE CANDIDATE | No active import/route | ORPHAN — prior current-state/route scan | Preserved reactivation reference may be lost | No | DELETE CANDIDATE |
| `frontend/src/app/admin/contact-requests/contact-request-inbox.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/contact-requests/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/contracts/[contractId]/contract-detail.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/contracts/[contractId]/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/contracts/contract-management.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/[invoiceId]/invoice-breakdown.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/[invoiceId]/invoice-detail.logic.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/[invoiceId]/invoice-detail.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/[invoiceId]/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/business-combobox.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/invoice-detail.test.tsx` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/invoice-list-content.test.tsx` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/invoice-list-content.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/invoice-list.logic.test.tsx` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/invoice-list.logic.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/invoices/invoice-list.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/properties/[propertyId]/rooms/resident-room-panel.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/properties/[propertyId]/rooms/room-image-gallery.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/properties/[propertyId]/rooms/room-image-picker.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/charges/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/fixed/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/flexible/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/parking/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/parking/parking-management.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/service-catalog.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/service-charges.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/service-overview.tsx` | H DELETE CANDIDATE | No active import/route | ORPHAN — prior current-state/route scan | Preserved reactivation reference may be lost | No | DELETE CANDIDATE |
| `frontend/src/app/admin/services/service-workspace-nav.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/service-workspace.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/service-workspace.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/utilities/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/services/utilities/utility-management.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/tenants/[residentId]/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/tenants/[residentId]/resident-detail.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/tenants/resident-management.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/admin/viewings/legacy-viewing-requests-workflow.tsx` | H DELETE CANDIDATE | No active import/route | ORPHAN — prior current-state/route scan | Preserved reactivation reference may be lost | No | DELETE CANDIDATE |
| `frontend/src/app/api/public/room-images/[imageId]/route.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/components/admin-navigation.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/app/components/admin-navigation.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/components/auth-provider.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/components/deferred-feature-screen.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/public-room-card.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/rooms/[roomId]/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/rooms/[roomId]/public-contact-form.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/rooms/[roomId]/public-room-detail.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/rooms/[roomId]/public-room-gallery.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/rooms/page.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/app/rooms/room-listing.tsx` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/apiClient.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/apiClient.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/authApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/contractApi.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/contractApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/contractView.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/contractView.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/errors.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/invoiceApi.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/invoiceApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/occupancyApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/parkingApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/propertyApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/propertyServiceApi.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/propertyServiceApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/publicRoomApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/residentApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/roomApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/roomImageApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/roomImagePicker.test.tsx` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/roomImageWorkflow.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/roomImageWorkflow.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/utilityTariffApi.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/lib/api/utilityTariffApi.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/publicContact.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/singleFlight.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/ui/admin-presentation.test.ts` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |
| `frontend/src/lib/ui/admin-presentation.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `frontend/src/lib/ui/dialog-accessibility.ts` | A SOURCE KEEP | Yes, routed/imported | SRC-FE — App Router or active page/component import | Frontend route/feature behavior lost if omitted | Yes | KEEP |
| `goc_tro_logo_new_style.svg` | D ASSET KEEP | Brand source | Referenced in Admin redesign/visual-QA reports as supplied source board | Source brand artwork would be lost if omitted | Yes | KEEP |
| `scripts/dev-all.ps1` | A SOURCE KEEP | Yes | SCRIPT — invoked by root package.json/startup report | Local start/stop workflow breaks if omitted | Yes | KEEP |
| `scripts/dev-stop.ps1` | A SOURCE KEEP | Yes | SCRIPT — invoked by root package.json/startup report | Local start/stop workflow breaks if omitted | Yes | KEEP |
| `scripts/run-contract-idempotency-runtime.mjs` | B TEST KEEP | Test-only | TEST — module test suite or dedicated runtime helper | Regression coverage lost if omitted | Yes | KEEP |

