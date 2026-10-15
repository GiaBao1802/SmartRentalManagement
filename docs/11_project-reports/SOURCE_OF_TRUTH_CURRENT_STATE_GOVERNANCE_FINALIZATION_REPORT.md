# Góc Trọ — Source of Truth + Current State Governance Finalization Report

- **Date:** 2026-10-13
- **Status:** `CURRENT`
- **Scope:** Documentation workflow, project checkpoint, catalog, and correction of stale physical-baseline metadata in the API Spec. No application or database implementation.

## 1. Scope

Reviewed the documentation rules, current-state checkpoint, catalog, canonical Requirement/API/Database Changelog, and current Database V1.7 plus Billing, Resident, Contract, and project audit reports. Updated the checkpoint and governance workflow, indexed current/historical documents, and corrected stale API Spec statements about the physical database baseline. No API endpoint, payload, authorization rule, or business behavior was changed.

## 2. Current State verification

`00_CURRENT_STATE.md` was checked against the later V1.7 target-apply report and the V1.7 section of `DATABASE_CHANGELOG.md`. Earlier reports that say V1.6 was current are time-scoped historical evidence and do not override the later apply result.

## 3. Current physical database

- Target: `Goctro_test3`, PostgreSQL 18.6.
- Current physical version: Database V1.7; 40 public tables; `LOCKED LOCAL/DEV`.
- Latest repository evidence: migration PASS, 28/28 legacy table fingerprints preserved, populated-target CORE validator 71/71 PASS, Prisma format/validate/generate PASS, and local backend health endpoints HTTP 200.
- No V1.7 seed or fixture validator was run against the populated target. This pass did not reconnect to or modify the database.
- Database V1.6 is the historical locked predecessor.

## 4. Active module

Billing V1.7 backend implementation gap review. This is review-first; it does not authorize implementation.

## 5. Current blocker

Billing is not end-to-end. Application pricing/charge inputs and item snapshots are not connected to production finalization, which remains fail-closed. The Admin Invoice frontend still uses a retired legacy route, and the production Zalo OA provider is not configured.

## 6. Frozen / deferred modules

- Resident provisioning/self-service and authenticated Resident portal closure remain deferred; Resident/Occupancy remains PARTIAL, not locked.
- Payment is deferred until an authoritative Invoice finalization path exists and its readiness has been reviewed.
- Contract remains PARTIAL, not locked; authenticated Resident/privacy and full browser closure remain open. Contract document binary storage remains blocked by unconfigured storage.
- Amenities, Parking, Complaints, CT01, Notifications, and Dashboard/Reports do not have complete V1 application flows established by the inspected evidence.

## 7. Exact next task

**GÓC TRỌ — BILLING V1.7 BACKEND IMPLEMENTATION GAP REVIEW** — compare current source with canonical Requirement/API and the locked V1.7 schema; identify concrete gaps and dependencies before any implementation.

## 8. Source of Truth order

1. `01_REQUIREMENTS.md` — business rules.
2. `04_API_SPEC.md` — API contract.
3. `DATABASE_CHANGELOG.md` plus current database artifacts — physical database truth.
4. `00_CURRENT_STATE.md` — project checkpoint, not business authority.
5. `DOCUMENT_CATALOG.md` — document index/status.
6. Reports — evidence/history, interpreted by scope and date.
7. Agent memory/chat — convenience only; repository source wins.

## 9. Task-start workflow

Before meaningful implementation work: read Documentation Rules, Current State, Catalog, task-relevant canonical docs, inspect current implementation, compare it with Source of Truth, then modify files. Do not code from memory/chat.

## 10. Task-end workflow

Evaluate whether business rules, API contract, physical database/version, reports/catalog, or project status changed. Update only the relevant canonical document, Catalog, Current State, and report when there is a meaningful change.

## 11. Catalog changes

- `00_CURRENT_STATE.md` is indexed as `CURRENT`, role `Project Checkpoint / Navigation`, explicitly not canonical business authority.
- Added this governance report as `CURRENT`.
- Indexed the Oct 12 project audit and Oct 13 coverage audit as `HISTORICAL` snapshots because their V1.6 current-baseline statements predate V1.7 target promotion.
- Existing V1.7 apply report remains the current physical promotion evidence; Resident and Contract statuses remain partial per their reports.

## 12. Documentation Rules changes

Added the concise `SOURCE OF TRUTH + CURRENT STATE WORKFLOW` section covering authority order, task-start sequence, task-end updates, and conflict handling.

## 13. Agent instruction file status

No suitable repository-wide agent instruction file was present. `frontend/AGENTS.md` exists but is scoped to the frontend and contains Next.js-generated guidance; it is not a repository-wide startup instruction. It was left unchanged. **Repo-wide instruction status: NOT PRESENT.**

## 14. Conflicts found

The API Spec header and status paragraphs still described V1.6 as the current physical baseline and said V1.7 had not been physically implemented or runtime-validated. Those claims conflicted with the later V1.7 apply report and Database Changelog. The API Spec was corrected only for physical-baseline/runtime-status metadata. Its API version, endpoints, DTOs, business rules, and runtime contract were not changed. Earlier audit reports retain their original facts and are now catalogued as historical snapshots. **No unresolved current-state conflict remains in the reviewed metadata.**

## 15. Files changed

- `SmartRentalManagement/docs/00_CURRENT_STATE.md`
- `SmartRentalManagement/docs/DOCUMENTATION_RULES.md`
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`
- `SmartRentalManagement/docs/11_project-reports/SOURCE_OF_TRUTH_CURRENT_STATE_GOVERNANCE_FINALIZATION_REPORT.md`
- `GocTro-SmartBuilding/docs/04_API_SPEC.md` — physical-baseline metadata only

No backend, frontend, database, Prisma, migration, seed, Requirement, or business-rule file was modified. No commit or push was performed.

## 16. Final result

Current State and governance workflow are finalized. Database V1.7 is the current locked local/development baseline (40 public tables); V1.6 is historical. Billing is the active review module and remains incomplete/fail-closed. The exact next task is the Billing V1.7 backend implementation gap review. No live database operation or application test was run in this documentation pass.
