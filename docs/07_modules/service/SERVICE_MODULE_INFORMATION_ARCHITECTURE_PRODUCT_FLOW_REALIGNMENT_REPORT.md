# Service Module Information Architecture and Product Flow Realignment

**Status:** PASS — workspace/navigation and product terminology realigned. Parking operations and Resident scheduling remain future work.  
**Date:** 2026-10-14  
**Scope:** Admin Service UI, approved product-flow documentation, and project status/catalog.  
**Database:** No schema, Prisma, migration, seed, or row changes.

## 1. Decisions applied

- The Admin sidebar has one Service entry: **Dịch vụ & Tiện ích**.
- A Service workspace navigation is shared by the overview and its screens: **Tổng quan**, **Điện & nước**, **Dịch vụ cố định**, **Tiện ích phát sinh**, **Parking**.
- Flexible Service is presented to Admin as **Tiện ích phát sinh**.
- Manual Admin charge entry is removed from the sidebar, Service overview, catalog screen, and Billing blocker action. Its existing route remains available for authorized internal/transition operation and is labeled as such.
- Legacy `/admin/amenities` and `/admin/bookings` pages/data were not deleted, but their obsolete navigation entries were removed.

## 2. Navigation change

**Old:** the sidebar separately exposed utility tariffs, Fixed Service, Flexible catalog, manual charges, legacy amenities, and legacy bookings. Billing blockers could send Admin directly to manual charge entry.

**New:** “Dịch vụ & Hỗ trợ” contains only “Dịch vụ & Tiện ích”. Other support/admin entries remain grouped separately. Utility, Fixed, Flexible, and Parking navigation now lives inside the Service workspace; the billing blocker for Flexible configuration opens the “Tiện ích phát sinh” catalog.

The active sidebar entry stays selected for all Service child routes. Existing direct URLs remain intact.

## 3. `/admin/services` workspace

The overview now asks Admin to select a Property and reads its actual data from the existing Property, utility tariff, and Fixed/Flexible catalog APIs. It presents:

- Electricity and Water effective-price configuration status;
- active Fixed Service count and items without a current price;
- active Tiện ích phát sinh count and items without a current price;
- Parking as “Sắp hoàn thiện”;
- a Billing link explaining that readiness is calculated per Contract and period.

No demo metrics or synthetic catalog rows are added. An API failure is shown as an error instead of being interpreted as zero configured services.

## 4. Terminology and internal charge operation

The Flexible catalog heading, metadata, workspace tab, form labels, overview card, and Billing blocker now use **Tiện ích phát sinh**. Implementation identifiers (`FLEXIBLE_SERVICE`, `flexible_service_charges`) are unchanged.

The Admin-only charge screen and API remain available to authorized internal/transition operation. They are no longer linked by primary Service or Billing navigation. The internal screen explains that the future primary source is a Resident use/request that is completed or confirmed, after which the system creates the financial charge.

No financial infrastructure was removed or changed: catalog/version rows, occurrence-time price resolution, charge snapshots, idempotency, READY/INVOICED lifecycle, Invoice linkage, atomic finalization, and rollback behavior remain in place.

## 5. Approved future Resident direction

The product direction is:

```text
Resident sees available amenities
→ selects/requests a flexible amenity
→ chooses a time or submits a request when scheduling is required
→ system checks/schedules it
→ service is performed or completion is confirmed
→ backend creates the billable Flexible charge
→ Billing consumes that eligible charge in its Invoice period
```

Spa, Room Care, laundry, and cleaning are examples. This task does not implement Resident booking, calendars, scheduling, or completion endpoints.

## 6. Requirement and API impact

- `docs/01_REQUIREMENTS.md`: added the approved Service product direction, explicitly separating Admin catalog/price management, Resident use/request, backend charge creation after completion, and Billing consumption. It also states that manual Admin charge entry is an internal/transition capability, not the primary product flow; Resident scheduling remains a separately scoped implementation.
- `docs/04_API_SPEC.md`: clarified that the existing Admin-only charge-create endpoint is an internal/operational capability, not the intended Resident-facing flow. Existing paths, payloads, validation, authentication, idempotency, and response contract are unchanged. Future Resident request/scheduling/completion APIs need a separate contract.

## 7. Tests and verification

- Admin sidebar IA and Service workspace section tests: **2 PASS** as part of the frontend suite.
- Frontend API/UI suite: **59/59 PASS**.
- Frontend typecheck: **PASS**.
- Frontend production build: **PASS**; build includes `/admin/services/parking` placeholder and preserves all existing utility/catalog/charge routes.
- Backend Service/utilities regressions: **13 PASS, 0 FAIL, 1 PostgreSQL integration test skipped** because no rehearsal database was configured for this IA-only task.
- Invoice/Billing regressions: **157 PASS, 0 FAIL, 3 PostgreSQL integration tests skipped** because no rehearsal database was configured. Flexible resolver and charge behavior tests remain in the suite and passed.
- Initial backend test attempts without Windows loopback permission failed with `EACCES` on ephemeral test ports; reruns with permitted loopback access passed. This was test-environment access, not a product failure.
- Local frontend restarted at `http://localhost:3000`; `/admin/services` returned HTTP 200.

## 8. Database impact

**None.** Database V1.8, Prisma schema, migrations, seeds, and `Goctro_test3` were not changed or used for writes.

## 9. Files changed

- Frontend: Admin navigation, Service workspace overview/navigation, Fixed/Flexible labels, internal charge screen wording, Billing blocker action, and focused IA tests/styles.
- Canonical docs: `docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`.
- Checkpoint/catalog: `docs/00_CURRENT_STATE.md`, `docs/DOCUMENT_CATALOG.md`.
- This report.

## 10. Exact next task

**SERVICE PASS 4 — Parking operational management + Billing integration**, inside the unified Dịch vụ & Tiện ích workspace. Do not start it as part of this pass.
