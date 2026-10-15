# Pre-Git Repository Audit and Cleanup Plan

**Date:** 2026-10-15  
**Scope:** Repository structure, Git delta, usage/route audit, legacy review, safe cleanup preparation. No business or database design was changed.

## 1. Repository summary

Repository: `SmartRentalManagement` (`D:\\codexapp\\SmartRentalManagement`). Current branch is `main`, ahead of `origin/main` by 2 commits. The committed Git baseline contains 68 tracked paths. The working tree already contains a substantial multi-pass implementation and documentation reorganization; it should not be described as a clean comparison to a pristine legacy archive. This audit compares it to the current Git HEAD and uses the dated current-state and legacy reports as historical references.

After safe cleanup, the non-vendor inventory contains **377 files**. This excludes `.git`, `node_modules`, `.next`, `dist`, `coverage`, and `.local` data. It includes 235 source files, 55 test files, and 110 Markdown files (109 under `docs/` plus root `AGENTS.md`). `legacy/` contains 18 files. The current frontend has 26 App Router `page.tsx` entrypoints. Inventory is a point-in-time count; ignored runtime/build data is intentionally outside it.

## 2. Legacy baseline

The comparison baseline is:

- Git HEAD on `main` (68 tracked paths), plus the earlier architecture snapshots in `docs/11_project-reports/PROJECT_CURRENT_STATE_AUDIT_2026_10_12.md` and `docs/08_audits/MIGRATION_GAP_REPORT.md`.
- The standalone demo under `legacy/` (HTML/CSS/JS, demo JSON, wireframes and brand assets), launched only by the `legacy:dev` script.
- Older unversioned routes still defined in `backend/src/app.ts` and pages still using them.

There is no separate untouched copy of the original application in this repository, so an exact “files changed from original legacy” count cannot be established. The reliable exact delta is against Git HEAD, reported below.

## 3. Current file inventory

| Group | Files | Notes |
|---|---:|---|
| `frontend/` | 113 | 25 route entrypoints, shared components/API clients, styles and tests; public assets are included here. |
| `backend/` | 115 | V1 modules, retained compatibility routes, tests and configuration. |
| `database/` | 9 | Current Prisma mapping plus historical mapping copies and database support files. |
| `docs/` | 109 | Current checkpoint, module reports, historical reports and decision records. |
| `legacy/` | 18 | Standalone HTML demo, server, scripts, branding and wireframes. |
| `scripts/` | 3 | Local development scripts. |
| Root/config | 10 | Includes root instructions, manifests, launcher and source brand asset. |
| **Total** | **377** | Excludes dependency, Git, local database/runtime and build directories. |

There are **55 test files** (15 frontend and 40 backend). Generated/local inventory excluded from the table: `.local/` contains database clusters, three database backup dumps, browser-smoke fixtures and logs; `frontend/.next/` and `backend/dist/` are ignored build output; `frontend/tsconfig.tsbuildinfo` is generated and ignored.

## 4. Git change summary

Final snapshot after safe cleanup, `.gitignore` update and report creation:

| Status | Paths |
|---|---:|
| Modified tracked | 27 |
| Deleted tracked | 3 |
| Untracked | 306 |
| **Working-tree paths** | **336** |

The tracked diff is **30 paths, +3,291 / -1,479 lines** (`git diff --stat`; untracked additions are not included). The three tracked deletions are `docs/DOMAIN_MODEL.md`, `docs/Tom_tat_chinh_sua_Goc_tro.md`, and `docs/design/wireframes/wireframe-quan-ly-khach-thue-v2.html`. These were already deleted before this audit and are not restored or changed here. The 306 untracked paths include new backend domains, frontend pages/components/tests, the reorganized documentation tree, Prisma snapshots, assets and this report; each must be reviewed before staging.

## 5. Legacy versus current delta

| Module | Legacy path / behavior | Current replacement | Status |
|---|---|---|---|
| Auth | `legacy/server.js`, demo login/storage; unversioned `/api/auth/*` in `backend/src/app.ts` | `backend/src/auth/`, V1 router, `frontend/src/lib/api/authApi.ts`, auth provider/login | **PARTIALLY REPLACED** — V1 is current FE flow; unversioned compatibility handlers remain. |
| Property / Room | legacy hash pages and older unversioned/demo handlers | `backend/src/properties/`, `frontend/src/app/admin/properties/`, `/rooms`; V1 API | **REPLACED for current flow** — old `/api/properties`, `/api/rooms` requests receive retired-route response; standalone legacy app remains. |
| Resident / Occupancy | legacy tenants and unversioned `/api/tenants` | `backend/src/residents/`, Admin tenant pages and Resident portal | **PARTIALLY REPLACED** — V1 resident/occupancy exists; unversioned tenant handlers and an orphan page remain. |
| Contract | old lease form and legacy `/api/contracts` handlers | `backend/src/contracts/`, `backend/src/contract-documents/`, Admin list/detail | **REPLACED for current FE flow** — retirement middleware returns 410 before old contract handlers; old handler code remains below it. |
| Billing / Invoice | legacy monthly invoice page and unversioned handlers | `backend/src/invoices/`, `backend/src/zalo/`, Admin Billing/Invoice list/detail | **REPLACED for current flow** — V1.8-backed invoice workflow is current; unversioned `/api/invoices` is retired. |
| Service | `legacy` amenities/booking data and `/admin/amenities`, `/admin/bookings` | `backend/src/services/`, `/admin/services/{utilities,fixed,flexible,parking}` | **PARTIALLY REPLACED** — Utilities/Fixed/Flexible are current; Amenities/Bookings old routes remain reachable. |
| Parking | demo parking cards and old data | `/admin/services/parking`, service parking backend/tests | **DEFERRED / PARTIAL** — current-state checkpoint still names Parking operations as next implementation; do not infer full closure from route presence. |
| Payment | demo payment/bank transfer concepts | no complete Payment V1 flow | **DEFERRED** — current state explicitly defers Payment. |
| Zalo | mock notification/demo state | Invoice send-log integration in `backend/src/zalo/` | **PARTIALLY REPLACED** — production provider delivery and recipient closure remain separate gaps. |
| Deferred features | complaint/viewing mock workflows | lock screens at `/admin/complaints`, `/admin/viewings` | **DEFERRED** — legacy workflow source is preserved but not rendered by current page. |

The `legacy/` app is still independently runnable via `npm run legacy:dev`; it is not a React route and must be treated as a retained demo, not as unused files.

## 6. Active frontend routes

Current Next App Router entries:

- Public: `/`, `/rooms`, `/rooms/[roomId]`, `/login`.
- Admin: `/admin/accounts`, `/admin/billing`, `/admin/contracts`, `/admin/contracts/[contractId]`, `/admin/invoices`, `/admin/invoices/[invoiceId]`, `/admin/properties`, `/admin/properties/[propertyId]/rooms`, `/admin/tenants`, `/admin/tenants/[residentId]`, `/admin/services`, `/admin/services/charges`, `/admin/services/fixed`, `/admin/services/flexible`, `/admin/services/parking`, `/admin/services/utilities`, `/admin/amenities`, `/admin/bookings`, `/admin/complaints`, `/admin/contact-requests`, `/admin/viewings`.
- Resident: `/tenant`.

`/admin/services` redirects to `/admin/services/utilities`; its four internal tabs are Utilities, Fixed, Flexible and Parking while the sidebar has one service entry. `/admin/services/charges` is a directly reachable operational route even though it is no longer a primary navigation action. `/admin/complaints` and `/admin/viewings` are active deferred lock screens. `/admin/amenities` and `/admin/bookings` remain routable legacy pages despite having no current sidebar link.

## 7. Backend route audit

- Current V1 API is mounted by `backend/src/app.ts` at `/api/v1` through the modular router. Health routes are `/api/health` and `/api/health/db`.
- Retired prefixes `/api/properties`, `/api/rooms`, `/api/contracts` and `/api/invoices` are intercepted by early middleware and return 410. Later definitions for Contract/Invoice and some Property/Room-era handlers remain in the same file and are unreachable behind that middleware.
- Still-active unversioned handlers include `/api/auth/*`, `/api/tenant-portal/*`, `/api/public/rooms`, `/api/public/viewing-requests`, `/api/admin/accounts`, `/api/tenants`, `/api/amenities`, `/api/amenity-bookings`, `/api/maintenance-requests`, `/api/viewing-requests`, and `/api/options/*`.
- Active old endpoints are a competing compatibility surface; remove only after verifying no current FE or external dev client depends on them. FE Accounts still calls unversioned tenant/account endpoints; the legacy amenity/booking pages call their matching endpoints.

## 8. File usage audit

| Classification | Evidence / examples |
|---|---|
| **USED** | App Router `page.tsx` files; `frontend/src/lib/api/*`; `frontend/src/app/components/admin-shell.tsx`, auth provider and shared components; current modular V1 domain routers/services/repositories; current Prisma schema. |
| **INDIRECTLY USED** | `backend/src/app.ts` mounts the V1 router, middleware, health checks and legacy compatibility endpoints; `backend/src/server.ts` loads runtime config/scheduler and starts the app; `legacy/server.js` serves the demo when `legacy:dev` is invoked. |
| **TEST ONLY** | `*.test.ts` and `*.test.tsx` files (55 total); some integration tests are opt-in through dedicated disposable database URL variables. |
| **DOC ONLY / HISTORICAL** | Old audits, migration plans, legacy model descriptions and redesign/closure reports; retain for traceability and use catalog status rather than deleting. |
| **LEGACY** | `legacy/index.html`, CSS/JS, demo database and wireframes. Used by the standalone legacy server, not the Next application. |
| **UNUSED CANDIDATE** | Four source components listed in §10. Evidence is based on route/import/reference scans; keep pending explicit source cleanup review. |

Current API helper files separate HTTP/session/CSRF and domain DTO mapping under `frontend/src/lib/api/`. Some legacy Admin components still use direct `fetch` to unversioned endpoints; this is a migration gap, not a reason to delete the shared API client.

## 9. Special route review

| Route/source | Current state | Recommendation |
|---|---|---|
| `/admin/amenities` | Real Next page but unlinked from current sidebar; uses `DataManagement` + `/api/amenities`. | Keep during compatibility review; propose removal only with old endpoint. |
| `/admin/bookings` | Real Next page but unlinked; uses `/api/amenity-bookings`. | Keep during compatibility review; propose removal only with old endpoint. |
| Old viewing calendar workflow component | Not rendered; new route is a deferred screen. | Candidate after confirmation; keep source now. |
| Complaint old workflow component | Not rendered; new route is a deferred screen. | Candidate after confirmation; keep source now. |
| `/admin/services/charges` | Active manual operations route, even though not primary navigation. | Keep; not unused. |
| Parking | Route exists and service backend/tests are present; current checkpoint says Parking operational management is next. | Keep and finish existing scoped work; do not call complete. |
| Old invoice/contract/property routes | Requests are intercepted by 410 handlers; route definitions remain later in `app.ts`. | Remove stale handlers only after careful reachability/compatibility review. |

## 10. Unused file candidates

There are **4 source-file unused candidates**, none deleted:

| Candidate | Why it appears unused | Replacement | Risk if deleted |
|---|---|---|---|
| `frontend/src/app/admin/services/service-overview.tsx` | No import/route reference; `/admin/services` now redirects to Utilities. | Child service routes and internal nav. | Low for runtime; global CSS still contains `.service-overview-*` selectors and may be removed separately after CSS reference check. |
| `frontend/src/app/admin/viewings/legacy-viewing-requests-workflow.tsx` | No import; current `/admin/viewings/page.tsx` renders deferred screen. | Deferred screen. | Could lose preserved reactivation reference; backend old viewing endpoints remain active. |
| `frontend/src/app/admin/complaints/legacy-complaints-workflow.tsx` | No import; current `/admin/complaints/page.tsx` renders deferred screen. | Deferred screen. | Could lose preserved reactivation reference; old maintenance-request backend remains active. |
| `frontend/src/app/tenants/tenant-management.tsx` | No route `page.tsx`, no import from current Admin/Resident routes. Two earlier reports classify it as retained reference. | Current `/admin/tenants` and Resident module/API. | It still calls `/api/tenants`; deleting may remove a manual compatibility reference. |

`/admin/amenities` and `/admin/bookings` are excluded from this unused count because each remains a live App Router page, even though not linked in the sidebar.

## 11. Large / monolithic files

| File | Size | Assessment |
|---|---:|---|
| `frontend/src/app/globals.css` | 1,633 lines / 140,505 bytes | **HIGH PRIORITY SPLIT SOON** — shared tokens/layout plus many module-specific rules; use shared tokens and scoped CSS modules after a Git checkpoint. |
| `legacy/styles.css` | 3,260 lines / 104,801 bytes | **KEEP AS LEGACY** — large standalone demo stylesheet; no refactor needed for current Next workflow. |
| `database/schema.prisma` | 905 lines / 62,194 bytes | **GOOD ENOUGH** — current V1.8 mapping, generated/types dependent; do not split schema ad hoc. |
| `backend/src/app.ts` | 884 lines / 61,285 bytes | **HIGH PRIORITY SPLIT SOON** — V1 mounts/health mixed with extensive legacy routes and retired handlers; separate route registration after compatibility decisions. |
| `frontend/src/app/admin/properties/[propertyId]/rooms/page.tsx` | 369 lines / 36,708 bytes | **SHOULD SPLIT SOON** — route shell and complex Room interactions could move into hooks/components. |
| `frontend/src/app/admin/contracts/[contractId]/contract-detail.tsx` | 198 lines / 34,877 bytes | **SHOULD SPLIT SOON** — dense detail/history/forms composition despite line count below threshold. |
| `frontend/src/app/admin/services/parking/parking-management.tsx` | 93 lines / 29,732 bytes | **SHOULD SPLIT SOON** — dense component; keep operational sections/components distinct as Parking is completed. |
| `frontend/src/app/admin/billing/workspace.tsx` | 236 lines / 20,217 bytes | **GOOD ENOUGH FOR NOW** — business workflow and tests are separate; avoid cosmetic refactor before finishing Billing closure. |

No aesthetic split is a must-fix before Git. The `app.ts` retired handlers are a correctness/maintainability issue, but they are currently protected by earlier retirement middleware; remove/split only after route compatibility review.

## 12. Frontend structure review

Route entrypoints are grouped by domain. Most large pages now delegate to adjacent components and domain API helpers; invoice and service workspaces have separate logic/tests. `globals.css` remains the largest shared style surface. Some older pages still use generic `DataManagement` and direct fetches, while the V1 paths use typed API helpers. Modals/drawers are not uniformly shared. Recommendation: split module styles and reuse form/dialog primitives incrementally after checkpoint; keep each business flow's state transitions in its domain helper/hook rather than expanding route components.

## 13. Backend structure review

Current V1 domains are separated into auth, properties, residents, contracts/documents, invoices/Zalo, room images, public marketplace and services; route validators, repositories and services exist in these module folders. `backend/src/app.ts` remains an 884-line composition root and contains SQL/Prisma-driven legacy endpoint logic inline. Scheduler startup is in the server/runtime bootstrap and invoice/service resolvers are modular. There is no requirement to refactor before checkpoint; split compatibility endpoints after documenting which old FE/routes are removed.

Backend `npm run typecheck` currently fails with **174 diagnostics**, concentrated in `src/app.ts` legacy Prisma calls and one Resident test typing issue. The mismatches include removed demo Prisma models/fields (`userAccount`, `tenant`, `leaseContract`, legacy invoice month/year). This appears to be existing legacy-vs-current Prisma drift; no backend source was changed in this audit. Do not hide it with aliases. Treat backend production build readiness as open.

## 14. Asset audit

| Asset | Usage | Recommendation |
|---|---|---|
| `frontend/public/logo-goc-tro.png` | Used by public homepage, Tenant portal and public room pages; identical copy also serves legacy app. | **KEEP** both copies; each application has its own path. |
| `frontend/public/assets/goc-tro-logo-newstyle.svg` | Used by Admin shell and Login; standalone derivative documented in visual QA report. | **KEEP**. |
| `frontend/public/assets/logo-goc-tro-mark.png` | Used by public room card/gallery empty and broken-image states; identical source copy exists in `legacy/`. | **KEEP** both copies. |
| Root `goc_tro_logo_new_style.svg` | Brand source/master asset, retained in root and documented by redesign report. | **KEEP** as source. |
| `legacy/foxi.svg` | Referenced by legacy resident UI and Foxi widget. | **KEEP** with legacy app. |
| `legacy/foxi_mascot_concept.svg` | No runtime source reference found. | **DELETE AFTER CONFIRMATION**; legacy concept art may be useful archive material. |
| `legacy/nhan_dien_thuong_hieu.jpg` | Legacy brand reference; not an active frontend runtime asset. | **KEEP / reference** until product owner reviews legacy folder. |

No duplicate active logo can be deleted safely: byte-identical copies are independently referenced by the React app and legacy app.

## 15. Temp, build and local artifacts

Removed in this pass (resolved and verified under repository root):

- `.tmp-bb-restore.err.log` — empty temporary error log.
- `.tmp-bb-restore.log` — temporary restore log.
- `frontend/tsconfig.tsbuildinfo` — generated TypeScript incremental state.

Retained: `.local/` contains PostgreSQL data/backup dumps, smoke fixtures and operational logs; its contents may be user data or evidence. Do not delete as generic cleanup. `frontend/.next/` and `backend/dist/` are generated/ignored output; `.next` is retained because it can be used by a running local dev server. No PID/temp/dump files are tracked by Git. `.local` and build output are ignored.

## 16. `.gitignore` audit

Already ignored: `node_modules/`, `.next/`, `dist/`, `coverage/`, `*.log`, `.env`, `.env.*` (with `.env.example` exception), generated directories, `.local/`, backend local object storage. Added: `*.tsbuildinfo`, `*.pid`, `*.tmp`, `*.temp`, `.DS_Store`, `Thumbs.db`, `*.log.*`, npm/yarn debug logs, `build/`, `.cache/`, `.turbo/`, and `.idea/`. Verified local `.env`, `.next`, `dist` and tsbuildinfo are ignored. `.vscode/` is not blanket-ignored because repository-specific shared settings can be intentional source/config.

## 17. Secret / environment audit

- `backend/.env` and `frontend/.env` exist locally and are ignored; neither is tracked. Their values were not printed or copied into this report.
- `backend/.env.example` is tracked; `frontend/.env.example` is an untracked example file. Review both for placeholder-only values before staging.
- A source scan for common live-token, bearer-token and credential-bearing PostgreSQL URL patterns found no matching non-env tracked source file. This is a pattern scan, not a formal secret scanner; inspect the complete staged diff before push.
- Do not stage `.env`, local database backups, or `.local` files. No secret values were included in command output/report.

## 18. Cleanup recommendations

### A. Safe to delete now

Three safe temporary/generated files were removed as listed in §15. **No further source file is safe to delete in this pass.**

### B. Delete after confirmation

- Four unused source candidates in §10.
- `legacy/foxi_mascot_concept.svg` after owner confirms no archive need.
- `/admin/amenities`, `/admin/bookings`, old unversioned handlers and old routes only after confirming compatibility consumers and retiring matching backend endpoints.
- Retired/dead contract/invoice handlers in `backend/src/app.ts` only after checking route order and external scripts.

### C. Keep

- All `legacy/` code/data/wireframes and deferred complaint/viewing implementation source pending review.
- Historical reports, Database migrations/schema snapshots, current canonical docs, and the three `.local` database backups/runtime data.
- Logo/mark files referenced separately by the Next app and legacy app.
- `node_modules`, `.next` and `dist` as local ignored runtime/build data unless the user asks for a cleanup while no dev server is using them.

## 19. Required pre-push fixes

**No verified secret leak, tracked build output, or broken frontend import was found.** No aesthetic refactor is a must-fix solely for Git. Before pushing this working tree:

1. Review the 305 untracked paths and intentionally stage the desired source/docs only.
2. Review the 3 pre-existing deleted tracked documents and confirm their replacements/links.
3. Run a staged-diff secret scan; keep `.env`, `.local`, backups and generated output excluded.
4. Resolve or explicitly accept the 174 backend typecheck diagnostics before claiming backend build readiness; they are legacy Prisma/app drift and not fixed here.

Therefore this repository is **READY FOR CLEANUP REVIEW**, but **NOT READY FOR GIT/PUSH as a clean reviewed change set**. A Git checkpoint can be prepared after scope/staging review; no commit or push was made.

## 20. Recommended refactors

| Priority | Recommendation |
|---|---|
| Should fix soon | Split `backend/src/app.ts` into health/V1 mount, active compatibility routes, and retired route registrations; remove unreachable handlers only after compatibility decisions. |
| Should fix soon | Reduce `frontend/src/app/globals.css` by migrating domain-specific groups to scoped styles while preserving shared design tokens. |
| Should fix soon | Split Room page, Contract detail and Parking management components into route shell, data/state hooks and presentation sections. |
| Can defer | Migrate old Accounts/Amenities/Bookings pages from direct unversioned fetch to V1 or replace them with deferred lock screens based on approved feature scope. |
| Can defer | Normalize reusable modal/drawer/form primitives and remove their unused CSS selectors after the components are approved for deletion. |

## 21. Validation

| Check | Result |
|---|---|
| Frontend typecheck | **PASS** |
| Frontend tests | **64/64 PASS** (`npm run test:api`) |
| Frontend production build | **PASS** (`next build`, Next.js 16.4.0) |
| Backend Auth | **20/20 PASS** |
| Property / Room | **44/44 PASS** |
| Resident / Occupancy | **49/49 PASS** |
| Contract | **134/134 PASS** |
| Room Images | **21/21 PASS** |
| Public Marketplace | **7/7 PASS** |
| Service Utilities | **13 PASS / 1 opt-in PostgreSQL integration SKIP** |
| Invoice | **157 PASS / 3 opt-in PostgreSQL integrations SKIP** |
| Backend typecheck | **FAIL — 174 existing diagnostics**; concentrated in legacy `src/app.ts` and one Resident test type. |

The first Auth test attempt was blocked by sandbox loopback `EACCES`; the permitted local rerun passed 20/20. PostgreSQL integration tests requiring dedicated rehearsal URL variables were skipped because no rehearsal URL was supplied to these commands. No migration, seed or database command was run.

## 22. Final cleanup matrix

| Path | Type | Used? | Replacement | Risk | Recommendation | Action |
|---|---|---|---|---|---|---|
| `.tmp-bb-restore.err.log` | Temporary log | No | None | None | DELETE SAFE | Removed; empty. |
| `.tmp-bb-restore.log` | Temporary log | No | None | None | DELETE SAFE | Removed. |
| `frontend/tsconfig.tsbuildinfo` | Generated TypeScript state | No runtime use | Regenerated by TypeScript | None | DELETE SAFE | Removed; ignore rule added. |
| `frontend/src/app/admin/services/service-overview.tsx` | Old UI component | No import/route | Utilities/fixed/flexible/parking tabs | Low runtime, reference loss | DELETE AFTER CONFIRM | Keep pending source review. |
| `frontend/src/app/admin/viewings/legacy-viewing-requests-workflow.tsx` | Deferred legacy UI | No import | Deferred feature page | Medium; reactivation reference | DELETE AFTER CONFIRM | Keep. |
| `frontend/src/app/admin/complaints/legacy-complaints-workflow.tsx` | Deferred legacy UI | No import | Deferred feature page | Medium; reactivation reference | DELETE AFTER CONFIRM | Keep. |
| `frontend/src/app/tenants/tenant-management.tsx` | Orphan UI component | No current route/import | `/admin/tenants` and current Resident API | Medium; compatibility reference | DELETE AFTER CONFIRM | Keep. |
| `frontend/src/app/admin/amenities/page.tsx` | Legacy active page | Yes, direct route | Service UI only partially overlaps | High if old capability expected | KEEP / REVIEW | Still routable and uses live old API. |
| `frontend/src/app/admin/bookings/page.tsx` | Legacy active page | Yes, direct route | No full booking replacement | High if old capability expected | KEEP / REVIEW | Still routable and uses live old API. |
| `backend/src/app.ts` | API composition/legacy routes | Yes | V1 modules + compatibility | High if removed wholesale | REFACTOR | Split; route audit first. |
| `frontend/src/app/globals.css` | Shared styles | Yes | Shared tokens + scoped modules | Medium visual regression | REFACTOR | Incremental split after checkpoint. |
| `legacy/` | Standalone demo source/data | Yes via `legacy:dev` | Current Next app for active product flow | High for demo/reference | KEEP | No legacy source deleted. |
| `legacy/foxi_mascot_concept.svg` | Legacy concept asset | No runtime reference found | `legacy/foxi.svg` for demo mascot | Low, archival loss possible | DELETE AFTER CONFIRM | Keep for review. |
| `.local/` | Local database/runtime data | Not app source; used by local workflows | None | High; contains backups/database data | KEEP | Not deleted; ignored. |
| `frontend/.next/`, `backend/dist/` | Generated build output | Local runtime/build use | Recreated by build | Low if not running | IGNORE | Retained and ignored. |
| `.env` files | Local environment secrets/config | Local runtime | `.env.example` templates | High | IGNORE | Not tracked; values not reported. |
| `frontend/public/logo-goc-tro.png`, `legacy/logo-goc-tro.png` | Brand assets | Both used in separate apps | None | Broken branding if either removed | KEEP | Preserve both copies. |
| `frontend/public/assets/logo-goc-tro-mark.png`, `legacy/logo-goc-tro-mark.png` | Brand mark | Both used in separate apps | None | Broken empty-state/demo branding | KEEP | Preserve both copies. |

## 23. Repository readiness

- **READY FOR CLEANUP REVIEW:** Yes. Safe temp cleanup is complete and candidates/evidence are documented.
- **READY FOR GIT/PUSH:** No, not as a clean reviewable change set: 305 untracked paths and 3 deleted tracked docs need intentional scope/staging review, and backend typecheck remains at 174 diagnostics.
- **Business/database files:** No business rules, API contract, Prisma/schema design, migration or database data were changed.
- **Commit/push:** Not performed.

