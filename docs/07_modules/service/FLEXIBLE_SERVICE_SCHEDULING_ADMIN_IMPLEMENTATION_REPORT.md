# Tiện ích phát sinh Admin — đặt lịch và gói đăng ký

**Date:** 2026-10-26<br>
**Status:** Implemented for Admin; waiting for the user’s browser review. Resident booking/enrollment is explicitly deferred.

## Scope

Added configuration for the two approved Flexible Service models:

- **Đặt lịch:** Admin chooses open weekdays, a shared daily opening window, duration per visit, and capacity per simultaneous slot. These settings are source data for a future Resident flow; this task does not create availability instances or bookings.
- **Gói đăng ký:** Admin chooses open weekdays, a shared daily opening window, a package duration in months or years, and a package price. The future Resident flow will register once and use the service during the configured hours. This scope has no concurrent-attendance cap or check-in tracking.
- A service’s mode cannot be changed after configuration. Create a new service when switching between booking and subscription. A legacy item that has price history cannot be assigned an assumed mode or have its old unit relabeled.

Fixed Service, Electricity/Water, Parking, Resident screens/endpoints, booking/payment flows, and AI integration are outside this implementation.

## Files changed

- `frontend/src/app/admin/services/flexible-service-catalog.tsx`, `frontend/src/app/admin/services/flexible/page.tsx`: create/view/configure Flexible services, schedules, slot/package settings and price history.
- `frontend/src/app/admin/services/service-catalog.tsx`, `frontend/src/app/admin/services/fixed/page.tsx`, `frontend/src/app/globals.css`: keep the existing Fixed page on the Fixed-only catalog flow and add styles scoped to the Flexible page.
- `frontend/src/lib/api/propertyServiceApi.ts`: typed Flexible configuration DTOs and API methods.
- `backend/src/services/property-service.routes.ts`, `backend/src/services/property-service.repository.ts`: strict validation, Owner/Property scope, atomic create, safe legacy handling and persisted configuration.
- `database/schema.prisma`, `database/baselines/v1.9/`: one additive configuration table and V1.8→V1.9 migration; V1.8 artifacts remain unchanged.
- `scripts/database-v19.mjs`, package scripts, `scripts/setup-interactive.ps1`, `scripts/verify-baseline-integrity.mjs`: V1.9 bootstrap/inspect/seed, V1.8 catalog recognition and guarded migration.
- `docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`, `docs/DATABASE_CHANGELOG.md`, README, setup guide and Current State: approved behavior, API/schema contract and handoff status.

## Validation and current database

- Backend TypeScript: PASS.
- Frontend TypeScript: PASS.
- Prisma schema validation: PASS.
- JavaScript syntax checks: PASS.
- PostgreSQL 18.6 clean install + seed: 41 tables, two configured demo services; runtime validator 85/85 PASS.
- Populated V1.8→V1.9 disposable rehearsal: 85/85 PASS; row counts and SHA-256 fingerprints match for all 40 pre-existing tables.
- The local target `localhost:5432/Goctro_dev_v18` was verified at PostgreSQL 18.6/V1.8, backed up and migrated to V1.9. The backup is 265,487 bytes; `pg_restore --list` returned 481 entries; SHA-256 is `790C7D1E86FF80809142A2A4F569F6F951DBFE9E7B900643E7479CABA77A8CBB`.
- Post-migration inspect and state: PASS; 41 public tables. V1.9 runtime validator 85/85 PASS. All 40 existing table row counts and SHA-256 fingerprints match the pre-migration snapshot. The new configuration table is empty; the migration did not infer service types from legacy rows.
- Tests and manual Admin browser interaction have not been run. No commit or push has been made.

Next: restart the local app if needed, then let the user review `/admin/services/flexible` before any work on Resident.
