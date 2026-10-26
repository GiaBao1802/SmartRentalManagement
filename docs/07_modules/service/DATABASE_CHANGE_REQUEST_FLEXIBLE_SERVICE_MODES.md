# Database Change Request — Flexible Service Booking and Packages

**Date:** 2026-10-26<br>
**Status:** Approved and implemented; Database V1.9 is locked on local target `Goctro_dev_v18`.<br>
**Scope:** Versioned database/API/Admin configuration for two Flexible Service modes. Resident booking, package enrollment, payment, attendance and billing lifecycle are deferred until Admin review.<br>
**Unchanged:** Fixed Service, Utilities, Parking, current charges and Invoice snapshots.

## 1. Product decision

Each new Flexible Service is configured as exactly one of:

- **BOOKING:** the Owner chooses open weekdays, one local opening/closing window shared across selected weekdays, duration per appointment and maximum concurrent attendees per appointment. Future Resident booking must only be confirmed when capacity remains.
- **SUBSCRIPTION:** the Owner chooses open weekdays/window and a package duration measured in months or years. The Resident later registers once and can use the service during this window without booking each visit. Concurrent attendance is not limited in this scope; check-in/density controls need a separate decision.

Admin publishes the existing Property price version for each service item. The API derives the unit (`lượt` or `gói`) from the configured mode. Package payment timing, enrollment lifecycle, booking cancellation/refund and the point at which a package fee is billed remain future Resident/Billing contract work. Existing V1.8 Flexible items have no inferred mode. An item with a historical price version cannot be configured retroactively; create a new item to preserve the historical unit interpretation.

Weekday values use ISO numbering (1 Monday–7 Sunday). Times are local `HH:mm` in the property's operating timezone (`Asia/Ho_Chi_Minh` for the current product). Overnight windows are not supported. One shared window is used for all selected weekdays in this version.

## 2. Physical change

Keep every V1.8 artifact and the locked V1.8 baseline unchanged. V1.9 adds one table, `property_flexible_service_configurations`, keyed one-to-one by `property_pricing_item_id` and linked by the composite `(property_pricing_item_id, owner_id, property_id, kind)` FK to `property_pricing_items`. The table also has a matching composite unique key so Prisma can represent the scoped one-to-one relation.

The table stores:

- `service_mode`: `BOOKING` or `SUBSCRIPTION`;
- opening/closing time and seven weekday booleans, with at least one selected day and a same-day increasing time range;
- booking-only `slot_duration_minutes` and `capacity_per_slot`; or package-only `package_duration_count` and `package_duration_unit` (`MONTH`/`YEAR`);
- creation/update timestamps.

Mode-specific CHECK constraints require exactly one matching parameter set and reject mixed or incomplete configurations. The FK and fixed `kind='FLEXIBLE_SERVICE'` check keep the configuration tied to the same Owner, Property and pricing item. Legacy items are left without configuration and remain readable by existing code.

## 3. Migration and target safety

The V1.8→V1.9 migration is additive and transactional. It must verify the V1.8 catalog and absence of the new table, create the table/index/constraints, and verify the V1.9 postconditions. It does not update or delete existing rows. `Goctro_dev_v18` must be identified from the connected PostgreSQL server, backed up and the backup verified before applying the migration. Never use `db push`, reset, seed or V1.8 files for the upgrade.

After migration, verify the new catalog table/checks/FK and run the V1.9 schema/runtime validation. Promote V1.9 only after the migration and required validation pass. No changes are made to `Goctro_test3`.

**Completed 2026-10-26:** PostgreSQL 18.6 clean schema/seed and populated V1.8 upgrade rehearsals passed; V1.9 CORE validator passed 85/85. The exact V1.8 target catalog was verified on `localhost:5432/Goctro_dev_v18`; the custom-format backup archive and SHA-256 were verified before migration. Post-migration catalog/validator passed, and all 40 pre-existing tables preserved row counts and SHA-256. The target is now V1.9 with 41 public tables. See [`FLEXIBLE_SERVICE_SCHEDULING_ADMIN_IMPLEMENTATION_REPORT.md`](FLEXIBLE_SERVICE_SCHEDULING_ADMIN_IMPLEMENTATION_REPORT.md) and [`../../10_operations/DATABASE_V1_9_SETUP.md`](../../10_operations/DATABASE_V1_9_SETUP.md).

## 4. API and implementation boundaries

Admin may create a Flexible catalog item with its configuration atomically, list its current configuration, and replace the current configuration using an Owner-scoped update route. Mode is immutable after first save. Mode-specific validation is performed both by the API and SQL CHECK constraints. Price history continues to use the existing append-only Property pricing authority.

This change does not create availability instances, bookings, package subscriptions, payment attempts, attendance records, or additional Flexible charges. Resident work begins only after the Owner tests the Admin module and reviews its output.

## 5. Rollback

The migration only adds a table and index. Before any V1.9 configuration rows are created, rollback may drop those new objects in one guarded transaction. After V1.9 rows exist, do not drop them; roll forward or preserve the V1.9 database. No existing V1.8 row or invoice snapshot is changed by migration.
