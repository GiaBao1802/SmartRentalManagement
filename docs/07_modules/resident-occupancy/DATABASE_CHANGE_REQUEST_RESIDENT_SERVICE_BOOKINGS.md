# Database Change Request — Resident Flexible Service bookings

**Decision:** Approved by the user on 2026-10-27 for implementation and the local/development migration. **Physical status:** V1.11 promotion is recorded in `DATABASE_CHANGELOG.md` after target validation.

## Scope

Add an Owner/Property-scoped request record for Residents booking Admin-configured `BOOKING` Flexible Services. Preserve the existing V1.9 tables, invoices, charges, prices, and service configuration. Do not alter `Goctro_test3`.

Each request stores the Resident, Room, Contract, service name, local service date/time, duration, unit, and the published price version/amount quoted when the Resident submits the request. `PENDING` and `APPROVED` requests consume one place in the configured slot capacity. Rejection or cancellation while pending releases capacity and creates no charge. Admin approval before the slot starts revalidates schedule, capacity, occupancy, contract, and the quoted price; it atomically creates one `READY` Flexible Service charge linked to the request. Existing Billing resolves that charge into the ordinary Contract Invoice period. A request is not itself an Invoice; approval does not finalize/send an Invoice or take payment.

## Schema change

V1.11 adds `resident_service_bookings` with scoped foreign keys to Owner, Property, Resident, Room, Contract, Flexible pricing item/configuration, quoted Property Price Version, decision Account, and approved Flexible Service charge. It adds capacity/Resident-slot lookup indexes, a partial unique key preventing duplicate pending/approved slots per Resident, and a trigger that forbids package-mode bookings. It adds no package enrollment or payment schema.

The additive V1.10→V1.11 migration runs only after exact V1.10 catalog validation. Bootstrap uses the V1.11 clean-install baseline. The existing V1.8, V1.9 and V1.10 artifacts remain immutable. A separately guarded recovery migration exists only for the exact pre-release booking-first branch on `Goctro_dev_v18`.

## Required validation

- Clean V1.11 install and seed; 43 public tables.
- V1.10→V1.11 populated-data rehearsal and preservation comparison for all 42 old tables.
- V1.11 rollback-only CORE and booking-schema validators, Prisma validate/generate, and application typechecks.
- Before applying to the locked local target, verify target identity and a fresh recoverable backup. Do not seed a populated database.
