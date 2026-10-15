# Góc Trọ — Agent Working Rules

These rules apply to the whole `SmartRentalManagement` repository. If working under `frontend/`, also follow [`frontend/AGENTS.md`](frontend/AGENTS.md), which adds frontend-specific instructions. Frontend-specific guidance does not override canonical business, API, or database authority.

## 1. Start Here

Before any meaningful task:

1. Read [`docs/DOCUMENTATION_RULES.md`](docs/DOCUMENTATION_RULES.md), [`docs/00_CURRENT_STATE.md`](docs/00_CURRENT_STATE.md), and [`docs/DOCUMENT_CATALOG.md`](docs/DOCUMENT_CATALOG.md).
2. Read task-relevant canonical sources.
3. Inspect the current implementation.
4. Compare code with the repository Source of Truth.
5. Only then modify files.

Do not start implementation from memory or a previous session summary.

## 2. Source of Truth Order

1. `../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` — business rules.
2. `../GocTro-SmartBuilding/docs/04_API_SPEC.md` — API contract.
3. `../GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md` and current database artifacts — physical database truth.
4. `docs/00_CURRENT_STATE.md` — current project checkpoint.
5. `docs/DOCUMENT_CATALOG.md` — document index/status.
6. Reports — evidence and history, interpreted by date and scope.
7. Agent memory/chat — convenience only.

Repository Source of Truth always wins over memory/chat.

## 3. Current State Rule

`docs/00_CURRENT_STATE.md` summarizes the current database version, active module, blockers, frozen/deferred work, latest milestone, and one exact next task. It is a navigation/checkpoint document, not business authority. If it conflicts with canonical Requirement, API, or Database sources, the canonical sources win and Current State must be corrected.

## 4. Do Not Code From Memory

Never implement business rules, pricing, API contracts, database structure, lifecycle behavior, permissions/security, or financial calculations based only on ChatGPT/Codex memory, Agent Memory, prior-session summaries, or old reports. Memory may help locate files. Verify decisions against repository Source of Truth before implementation.

## 5. Conflict Rule

When implementation and Source of Truth disagree, classify the issue:

- **Code is stale:** change code to match canonical sources within the authorized scope.
- **Documentation is stale:** update it only when newer approved evidence exists.
- **Unclear:** stop dependent work and report the conflict and evidence.

Never guess silently or rewrite canonical documents merely to match existing code.

## 6. Task Scope Rule

Respect the requested scope. `REVIEW ONLY` means do not implement. `DATABASE ONLY` excludes frontend/backend business logic. `NO COMMIT/PUSH` means do not commit or push. Do not expand scope without authorization.

## 7. Database Safety

- Verify the target before any authorized write.
- Follow the current locked database baseline; do not make ad hoc schema edits.
- Use the approved version/migration process; never use `db push` or reset as a shortcut.
- Take and verify a backup when the task requires it.
- Never seed a populated target unless explicitly authorized.
- Design, rehearsal, or a successful clean install alone does not make a version the current physical baseline. Promote only after the authorized apply and required validation pass.

## 8. Task-End Documentation Check

At the end of each meaningful task, evaluate whether:

- Business rules changed → update `01_REQUIREMENTS.md`.
- API contract changed → update `04_API_SPEC.md`.
- Physical database/version changed → update `DATABASE_CHANGELOG.md` and authorized database artifacts.
- Reports/documents were created or superseded → update `docs/DOCUMENT_CATALOG.md`.
- Project status changed (module, blocker, DB baseline, milestone, deferred work, or next task) → update `docs/00_CURRENT_STATE.md`.

Do not update documents when nothing meaningful changed.

## 9. Exact Next Task Rule

`docs/00_CURRENT_STATE.md` should identify exactly one primary next task. Do not casually start another major module before reviewing it. When a task changes project status, update the next task if appropriate.

## 10. Reports

Reports provide evidence; they do not automatically have authority. An older report may accurately describe an earlier state. A later successful apply/validation may supersede its current-state claim. Preserve historical reports and record their status in the catalog; do not delete them casually.

## 11. Frontend-Specific Instructions

When working anywhere under `frontend/`, read and follow [`frontend/AGENTS.md`](frontend/AGENTS.md) in addition to these project-wide rules. Root `AGENTS.md` defines repository-wide workflow; frontend guidance is supplementary and cannot override canonical business/API/database authority.

## 12. Communication

Use simple Vietnamese in user-facing final responses. State what changed, what did not change, whether the task passed, and the exact next task. Explain necessary technical terms briefly and avoid unnecessary jargon.
