# Service Pass 3 — Fixed + Flexible Service Management

**Status:** PARTIAL — Fixed/Flexible implementation, PostgreSQL integration, and core authenticated Admin browser flow PASS. Service remains incomplete until Parking operational management is implemented. Exact responsive viewport control was unavailable.

**Date:** 2026-10-14  
**Database baseline:** Database V1.8, PostgreSQL 18.6  
**Environment:** isolated disposable rehearsal database `goctro_service_pass3_20261014` on loopback port 55440. `Goctro_test3` was not used for Pass 3 test writes.

## 1. Scope

Implemented the Admin Fixed/Flexible paid-service management flows and connected them to the existing Billing readiness, itemized pricing, invoice finalization, and atomic charge-consumption path. Parking, Payment, production Zalo, Resident portal, booking, and calendar remain out of scope.

## 2. Previous gaps

Database V1.8 and Prisma already contained `property_pricing_items`, `property_price_versions`, `flexible_service_charges`, and itemized Invoice relations. Billing already had the Fixed price resolver, Flexible charge resolver, itemized pricing adapter, and atomic finalizer. The missing pieces were Owner-scoped Admin catalog/price/charge APIs and UI, API contract details, and a PostgreSQL-backed service lifecycle test.

No second resolver or calculator was added. Existing production itemized pricing remains the source consumed by readiness and finalize.

## 3. Fixed Service model

- Catalog items are Property-scoped and use kind `FIXED_SERVICE`.
- Admin can list, create, view price history, append a price version, and retire an item.
- Items use soft retirement; published history and finalized Invoice lines remain intact.
- No room-specific price override or proration was introduced. Billing continues to use the price effective on Invoice `period_start`, as a full-period amount for each eligible Room.

## 4. Flexible Service model

- Catalog items are Property-scoped and use kind `FLEXIBLE_SERVICE`.
- Catalog existence does not itself charge a resident.
- Admin can record an event for a selected Room, Contract, optional Resident, service, quantity, and timezone-qualified occurrence time.
- Server derives the Owner from the Admin session, validates the full Owner/Property/Room/Contract/Resident/item chain, resolves price on the occurrence’s `Asia/Ho_Chi_Minh` calendar date, and stores amount/unit-price snapshots.
- Each event requires an `Idempotency-Key`. Same key and same payload replays; same key with a different payload conflicts. Newly recorded events start `READY`.
- The Database V1.8 schema has no free-text note field for this charge, so the UI does not pretend to persist one.

## 5. API contract

The canonical API Spec §5.10 and API inventory include:

- `GET /properties/{property_id}/pricing-items`
- `POST /properties/{property_id}/pricing-items`
- `POST /properties/{property_id}/pricing-items/{pricing_item_id}/retire`
- `GET /properties/{property_id}/pricing-items/{pricing_item_id}/price-versions`
- `POST /properties/{property_id}/pricing-items/{pricing_item_id}/price-versions`
- `GET /properties/{property_id}/flexible-service-charges`
- `POST /properties/{property_id}/flexible-service-charges`

Mutations are authenticated Admin operations with CSRF protection. Client Owner authority is rejected; Owner scope comes from the session. Foreign Property/item scope returns hidden/not-found behavior. Price publication validates nonnegative VND, date uniqueness, active service and appends a new immutable version in a serializable transaction.

## 6. Backend

Added `PrismaPropertyServiceRepository` and the Property Service router. The repository performs Owner scoping, relation-chain checks, active-date checks, contract end/termination checks, HCM business-date price resolution, exact quantity/amount calculation, source-event idempotency, and soft retirement. Existing readiness and finalization consume the sources through `PrismaItemizedInvoicePricing` without manual Invoice overrides.

Billing workspace blocker actions now link to Fixed Service or Flexible catalog/charge management for the affected Property.

## 7. Admin UI

Added `/admin/services` overview, `/admin/services/fixed`, `/admin/services/flexible`, and `/admin/services/charges`. Navigation sits under “Dịch vụ & Tiện ích”; Parking is explicitly shown as a later pass. Charge creation follows Property → Room → Contract/Resident → service → quantity → time. The screens show business labels, current price, effective dates, immutable version history, READY/INVOICED status, amount, and related Invoice.

An Admin browser smoke created a Fixed Service and price versions, created a Flexible Service and price version, and recorded a 2-unit event for Room A101 / Contract DEMO-HD-001. The charge showed **60,000 VND / READY**. Billing workspace showed a ready draft. The Admin finalized Invoice `PASS3-SERVICE-ROLLBACK` (`5012`); the server-rendered breakdown showed Rent, Electricity, Water, existing Fixed Services, the new Fixed Service at **15,000 VND**, two eligible Flexible events at **200,000 VND** each, and the seeded paid Parking item. The displayed sum reconciled to **4,196,000 VND**. After reload, the eligible charges displayed as invoiced; the October event remained READY because it was outside the Invoice period.

The in-app browser rendered at approximately 337px wide during the smoke and the forms/cards remained usable; tables use horizontal overflow. The controller did not expose a viewport override, so a controlled 320–390px breakpoint matrix was not performed. Responsive status remains PARTIAL.

## 8. Price versioning

Fixed pricing selects the Property item version effective on Invoice `period_start`. Flexible pricing selects the Property item version effective on the `Asia/Ho_Chi_Minh` occurrence date and persists its version, unit price, unit, quantity, and amount on the charge. Publishing an effective-dated update appends history; duplicate dates return a conflict. Published price update/delete protections are enforced by Database V1.8.

## 9. Charge and Billing flow

The end-to-end PostgreSQL integration verified:

- Fixed Service enters the Invoice at the price selected on `period_start`.
- Flexible Service charges use the price effective at `occurred_at`; a 2 × 150,000 VND event became a 300,000 VND Invoice item.
- A charge outside one Invoice period is omitted and remains `READY` after that Invoice finalizes.
- In-period `READY` charges are consumed as `INVOICED` with the Invoice within the same transaction.
- A forced persistence failure after charge resolution leaves the Invoice draft and the charge `READY`, with no partial financial snapshot.
- Newer Fixed and Flexible price versions published after finalization do not alter the existing Invoice total or item snapshots.
- Fixed service retirement does not change the old finalized Invoice.
- Foreign Owner Property reads are hidden as 404.

Invoice items reconcile exactly to Invoice total. No manual Invoice item override was added.

## 10. PostgreSQL and automated validation

The disposable UTF8 PostgreSQL 18.6 database was created from the locked Database V1.8 source and seed. Validators ran against the clean seed before service fixtures:

- V1.8 CORE runtime validator: **78/78 PASS, 0 FAIL**.
- V1.8 fixture validator: **171/171 PASS, 0 FAIL**.
- Service utilities suite including PostgreSQL integration: **14/14 PASS, 0 FAIL**. The final rerun used a freshly recreated UTF8 V1.8 rehearsal database and included the added assertion that publishing later Fixed/Flexible price versions after finalization cannot rewrite stored Invoice item snapshots.
- Invoice regression suite: **157 PASS, 0 FAIL, 3 SKIP**.
- Auth regression: **20/20 PASS**.
- Frontend API/UI suite: **57/57 PASS**.
- Frontend typecheck: **PASS**.
- Frontend production build: **PASS** when run with Windows filesystem access. An initial sandbox-only SWC canonical-path access denial passed on permitted retry.
- Backend global typecheck remains **174 legacy diagnostics**; none were reported in the Pass 3 service implementation files. The failures are existing legacy backend/Prisma references outside this scope.

The service test emits one `request_failed` log from the deliberate database-constraint failure used to prove rollback; the test itself passes and confirms all-or-nothing behavior. The clean V1.8 runtime validators were rerun before service fixtures: CORE **78/78 PASS** and fixture **171/171 PASS**.

## 11. Database and Prisma impact

No Database V1.8 schema, ERD, seed source, migration, or Prisma mapping change was made. All runtime fixtures were isolated to the named disposable database. After verification, the disposable PostgreSQL 18.6 cluster and its database/log directory were stopped and removed. The normal backend was restarted using the unchanged local `.env` connection (`localhost:5432/Goctro_test3`); `/api/health`, `/api/health/db`, and `/api/v1/auth/csrf` returned successfully, and the frontend returned HTTP 200. `Goctro_test3` was never used as a test target and received no Pass 3 fixture or UI writes.

## 12. Remaining Service gaps

- Parking operational management and Billing integration remain unimplemented.
- Catalog reactivation/edit and hard delete are not supported; retirement and append-only pricing preserve history.
- Free-text charge notes are not supported because the locked schema has no note column.
- Exact responsive breakpoint coverage remains unverified because browser viewport control is unavailable.

## 13. Remaining Billing gaps

Service readiness/finalization integration for Fixed/Flexible is covered. Billing remains PARTIAL until Parking operations and the broader Billing closure—including remaining workspace browser filters and exact responsive viewport—are completed. Payment, production Zalo, and Resident invoice UX are separate work.

## 14. Files changed

Implementation files are limited to backend Property Service route/repository/integration coverage, frontend Property Service API/screens/navigation/styles, Billing blocker links, and the existing API Spec service contract. Documentation updated: `docs/00_CURRENT_STATE.md`, `docs/DOCUMENT_CATALOG.md`, and this report. Database V1.8 and Prisma files were not edited.

## 15. Exact next task

**SERVICE PASS 4: PARKING OPERATIONAL MANAGEMENT + BILLING INTEGRATION.** Do not start it automatically.
