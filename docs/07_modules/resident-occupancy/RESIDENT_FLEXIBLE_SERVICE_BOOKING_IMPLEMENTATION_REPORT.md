# Resident Flexible Service bookings — implementation report

**Date:** 2026-10-27
**Status:** Implemented; automated and database checks passed; authenticated browser review is the next task.
**Scope:** Resident booking of Admin-configured `BOOKING` Flexible Services, Admin approval/rejection, and charge handoff to ordinary Contract Billing. Fixed Services, Electricity/Water, Parking behavior, other roles, subscription enrollment, and Payment are outside this change.

## Delivered

- `/tenant/amenities` displays active services and, for bookable services, the schedule, date-specific open slots, remaining capacity and effective price. A Resident can request a slot, review their request/status/decision and cancel only while it is pending.
- Resident APIs derive Resident and Owner scope from the authenticated session. Availability and booking submission require a matching active Contract for the requested date. The request stores service, Resident/Room/Contract, slot/duration, unit and published-price snapshots. `PENDING` and `APPROVED` requests reserve capacity. Submission sends an in-app notification and creates no charge.
- The Admin Flexible Service screen contains the property-scoped pending queue. Approval/rejection records the Admin decision and optional note. Approval rechecks service schedule, capacity, slot date, Resident/Contract scope and quoted price, then atomically creates exactly one `READY` Flexible Service charge. Rejection and Resident cancellation create no charge and release capacity.
- Existing Billing can include an approved charge in the ordinary Contract Invoice period. A request or approval does not itself create, finalize, send or pay an Invoice. Payment is not implemented here.
- Database V1.11 adds `resident_service_bookings` to the immutable V1.10 auth-session baseline. It includes composite Owner/Property/Resident/Room/Contract/service/price references, status checks, duplicate-slot protection, capacity indexes and a trigger that allows bookings only for `BOOKING` services. V1.8, V1.9 and V1.10 artifacts remain unchanged.
- Setup and package scripts now use the V1.11 baseline. Existing databases are upgraded by exact-catalog, transactional migrations; populated data is not seeded/reset. A narrow recovery path is limited to the exact pre-release booking-first branch on `Goctro_dev_v18`.

## Verification

- Frontend TypeScript: **PASS**. Backend TypeScript: **PASS**. Prisma schema validation: **PASS**.
- Backend service/route suite: **15 passed, 0 failed, 1 existing PostgreSQL integration test skipped**. New route cases cover Resident scope, booking, cancellation, Admin queue, cross-Owner isolation and invalid decisions.
- Database setup regression suite: **18 passed, 0 failed**.
- PostgreSQL 18.6 clean V1.11 install: bootstrap, optional synthetic seed and catalog inspection all **PASS**; 43 public tables. Runtime validators: CORE **89/89**, Resident booking **17/17**, synthetic fixture **171/171**, all **PASS** and rollback-only.
- Standard populated V1.10→V1.11 migration rehearsal on a disposable database: **PASS**. All **42/42** old tables retained identical row counts and row-content fingerprints; the new booking table contains zero rows.
- Authorized local target: `localhost:5432/Goctro_dev_v18`, V1.11, 43 tables. The verified pre-migration backup is `database/generated/backups/Goctro_dev_v18_pre_v1_11_20261027.dump` (288,620 bytes; `pg_restore --list` 517 entries; SHA-256 `CEE7802F282AC0B2F8E1CF5F30110A9A6A30C890A0B48613838FD82BCB46FC7A`). The narrow recovery migration added the missing V1.10 auth-session objects to the existing booking-first database; all 42 pre-existing tables and existing booking table fingerprints were preserved. No seed ran. V1.11 catalog inspection and rollback-only CORE **89/89** and booking **17/17** validation passed.
- `Goctro_test3` remains a separate V1.10 target and was not accessed by this module. No database reset or Prisma `db push` was used.

## Not verified / deferred

- The authenticated Resident→Admin approval/rejection→Billing flow has not been walked through in the browser. User review of `/tenant/amenities` and the Admin approval queue is next; do not claim browser-level completion yet.
- Production frontend build and visual review were not run during this handoff to avoid interfering with the running local app. Narrow-screen browser review is also pending.
- Subscription package enrollment, check-in/attendance limits, Payment and external payment-provider integration remain deferred.
