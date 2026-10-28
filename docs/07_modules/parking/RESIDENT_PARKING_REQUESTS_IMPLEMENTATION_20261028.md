# Resident Parking requests and Admin approval — implementation report

**Integration note (2026-10-28):** The V1.13 Parking candidate documented below came from the pulled branch and conflicts in version number with the user's already-promoted meter V1.13. Its original artifacts are preserved in `database/parallel-baselines/parking-v1.13/`. The local canonical chain retains meter V1.13 and room requests V1.14; Parking DDL is now a rehearsed V1.15 candidate. The local V1.14 application database has not received Parking DDL.

**Status: source implementation complete; Database V1.13 applied locally; authenticated user review pending.** This report records source implementation and local schema apply, not a completed authenticated UI flow or full baseline promotion.

## Delivered flow

- Admin configures active parking slots with an optional accepted vehicle category and either a FREE or PAID offer. Paid offers reference the existing Property-scoped Parking price authority.
- Resident registers a vehicle, selects an Admin-created parking area in a Property covered by their active Contract, then sees compatible physical vacancies only in that area by location note and slot code, even if the Contract is already at capacity. Submitting a request checks capacity and returns a readable `409` with used/maximum counts when full. The request start date is set automatically to the current Vietnam business date; the Resident UI does not ask for date entry. The UI asks for a Contract only if the Resident has multiple eligible contracts in that Property and never asks them to pick a Room to find Parking.
- A pending request reserves one slot and one unit of its Contract's parking capacity for 24 hours. A Resident can have one pending request and can cancel it; rejected, cancelled, or expired requests retain history and release capacity.
- Contract capacity checks include unexpired pending Parking requests, and Contract expiry/termination cancels its outstanding requests so they immediately release held slots and capacity.
- Admin sees the request queue and may approve or reject. Rejection requires a reason. Approval rechecks eligibility/capacity/configuration and atomically creates the linked Parking assignment. The request itself never charges or pays an Invoice.
- Residents can delete a mistakenly added vehicle while it has no Parking request or assignment history. The API rejects deletion with a readable `409` when history exists; the Resident list hides the delete control and labels vehicles that are active or history-linked.
- Resident `GET /me/parking` returns the eligible areas separately from free slots; area-first selection prevents showing slots from another area and removes Room from the slot card/history presentation.
- Residents can refresh availability after an Admin update. Admin slot status distinguishes an inactive entitlement or a PAID offer without a current effective price from a bookable `Trống` slot; the Resident empty state lists the remaining eligibility checks.
- A successful Resident Parking request creates an account-scoped `parking_request` notification for active Owner Admin accounts in the same transaction. The Admin bell shows an unread count and filters Parking notices by read state alongside Invoice and feedback notices.
- Admin's legacy direct-assignment flow remains available and now respects configured slot type, pending holds, and Contract capacity. The user-facing design uses the existing Góc Trọ brand tokens; slot guidance is text-based (Property, area/location and slot code), without a floor-plan editor.

## Source changes

- `backend/src/services/parking-management.repository.ts` and `parking-management.routes.ts`: Owner-scoped slot configuration, Resident area/slot read model, vehicle/request APIs including guarded vehicle deletion, Admin request queue/review, expiry, cross-resident slot availability, price validity, and capacity checks.
- `backend/src/contracts/contract.repository.ts`: counts pending Parking holds during capacity changes and releases pending requests when a Contract expires or terminates.
- `frontend/src/app/admin/services/parking/parking-management.tsx`: slot offer configuration and request approval queue inside the existing Parking workspace.
- `frontend/src/app/tenant/parking/page.tsx` and `resident-primary-navigation.tsx`: Resident Parking screen starts from the Admin-created area, lists only that area's free slots, and supports deleting unused vehicle records.
- `frontend/src/lib/api/parkingApi.ts` and `frontend/src/app/globals.css`: API models and branded responsive styles.
- `database/schema.prisma`, `database/baselines/v1.13/`, and guarded setup/migration tooling: additive Parking request schema candidate.
- `docs/01_REQUIREMENTS.md` and `docs/04_API_SPEC.md`: approved workflow and API contract. Project status and this report are indexed in `docs/00_CURRENT_STATE.md`, `docs/DATABASE_CHANGELOG.md`, and `docs/DOCUMENT_CATALOG.md`.

## Database status and constraints

V1.13 is an additive candidate to the last verified V1.12 baseline. It adds accepted vehicle type and default entitlement to `parking_slots`, and `parking_slot_requests` with 24-hour expiry/review state, composite Owner/Property/Resident/Room/Contract/Vehicle/slot references, and unique pending holds. Existing V1.12 and earlier baseline bytes are unchanged. The migration has now been applied locally; the candidate's exact expected catalog and V1.13 runtime validator remain pending. Guarded vehicle deletion uses the existing foreign keys and does not change the physical schema.

A fresh custom-format backup was created at `.local/backups/Goctro_dev_v18_pre_V1_13_20261028.dump` and verified (292,404 bytes; 523 archive entries; SHA-256 `0A88BCF1995A9C3B49A9582ECB301506C9915CDBF6A669C35CC71EF2A116C882`). The exact-catalog-guarded V1.12→V1.13 migration passed on `Goctro_dev_v18`; read-only state reports `v113_populated`, inspect passes, Prisma can count the new request table (0 rows), and `/api/health/db` returned HTTP 200. No seed/reset ran. Exact expected-catalog capture, V1.13-specific runtime validation, and authenticated UI review remain pending. No service was started/stopped; no commit or push was made.

## Validation and review limits

- Prisma schema validation: PASS.
- Backend typecheck: PASS.
- Frontend typecheck: PASS.
- `scripts/database-v111.mjs` syntax and PowerShell setup-script parse: PASS.
- Baseline artifact byte hashes and V1.13 candidate attributes: recorded in the candidate provenance; local PostgreSQL catalog is not available to verify.
- Authenticated Admin/Resident interaction, cross-role refresh, invoice behavior after approval, vehicle deletion/history protection, and browser responsive layout: NOT VERIFIED. Automated tests were not run; the user plans to test the app.

## Next task

Refresh the running local app and test Admin parking-area/slot setup, Resident area selection and area-filtered slots, vehicle add/delete (unused vehicle), request/cancel/history, and Admin approve/reject. Confirm history-linked vehicles are kept with a clear explanation. If any Parking action still returns the generic error, capture its new request ID and tell Codex. Keep the changes local until the user confirms the review; do not push before that confirmation.
