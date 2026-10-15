# Góc Trọ — Root AGENTS.md Project Workflow Setup Report

- **Date:** 2026-10-13
- **Status:** `CURRENT`
- **Scope:** Repository-wide agent governance and documentation integration only.

## 1. Scope

Created concise project-wide instructions for task startup, source authority, conflicts, scope, database safety, and end-of-task documentation. No application or database implementation was changed.

## 2. Root AGENTS.md created

**YES** — `SmartRentalManagement/AGENTS.md` now applies across the repository.

## 3. Existing frontend AGENTS.md status

`SmartRentalManagement/frontend/AGENTS.md` exists and contains Next.js-specific generated guidance. It was not modified. The root file says frontend work must follow both instruction files, with frontend rules supplementary to canonical authority.

## 4. Source of Truth order

Recorded the required order: Requirement → API Spec → Database Changelog/current physical artifacts → Current State checkpoint → Document Catalog → reports as evidence/history → memory/chat as convenience only.

## 5. Task-start workflow

Read root `AGENTS.md`, Documentation Rules, Current State, Catalog, and relevant canonical sources; inspect the implementation; compare it with Source of Truth; only then make changes.

## 6. Task-end workflow

Evaluate changes to business rules, API contract, physical database, reports/catalog, and project status. Update only the relevant documents when meaningfully changed.

## 7. Conflict handling

Classify stale code, stale documentation, or unclear evidence. Fix code against canonical sources within scope; update documentation only with newer approved evidence; stop and report unclear conflicts. Do not guess or rewrite canonical docs to match code.

## 8. Database safety rule

Verify write targets, use approved version/migration flow, avoid ad hoc schema edits and `db push`/reset shortcuts, backup when required, do not seed populated targets without authorization, and promote a baseline only after authorized apply plus required validation.

## 9. Documentation integration

Added a short pointer in `docs/DOCUMENTATION_RULES.md` to root `AGENTS.md` and the frontend-specific supplement. Updated the Current State resume checklist to start with the root instructions. The project status and exact next task were not changed.

## 10. Catalog update

Indexed `../AGENTS.md` as `CURRENT`, role `Repository-wide agent working rules`, explicitly governance/instructions rather than business Source of Truth. Added this report as `CURRENT`.

## 11. Files changed

- `SmartRentalManagement/AGENTS.md` (created)
- `SmartRentalManagement/docs/DOCUMENTATION_RULES.md`
- `SmartRentalManagement/docs/DOCUMENT_CATALOG.md`
- `SmartRentalManagement/docs/00_CURRENT_STATE.md` (resume checklist pointer only)
- `SmartRentalManagement/docs/11_project-reports/AGENTS_MD_PROJECT_WORKFLOW_SETUP_REPORT.md` (created)

No backend, frontend application code, database, Prisma, migration, seed, Requirement, or API Spec file was changed. No commit or push was performed.

## 12. Conflicts found

No conflict between root workflow and `frontend/AGENTS.md`. Frontend instructions remain scoped to the frontend and do not supersede canonical sources.

## 13. Final result

**PASS.** Project-wide startup and governance instructions are in place. Current State remains Database V1.7 / Billing review-first, with the previously recorded blocker and exact next project task unchanged. No application or database commands were run.
