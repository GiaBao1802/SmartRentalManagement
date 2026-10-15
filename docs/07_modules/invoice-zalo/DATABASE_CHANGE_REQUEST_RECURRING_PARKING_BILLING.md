# Database Change Request — Recurring Parking Invoice Linkage

**Date:** 2026-10-14  
**Status:** APPROVED and implemented as Database V1.8. The physical migration, validation, and Goctro_test3 promotion are recorded in [the V1.8 implementation report](DATABASE_V1_8_RECURRING_PARKING_MIGRATION_IMPLEMENTATION_REPORT.md).  
**Scope:** Database design only for recurring paid Parking Invoice Item linkage. Payment and other Billing rules are out of scope.

## 1. Problem and evidence

Database V1.7 defines `invoice_items.parking_assignment_id` as nullable `bigint`, with a foreign key to `parking_slot_assignments(assignment_id, owner_id, property_id)`. It also declares `UNIQUE(parking_assignment_id)`, which PostgreSQL names `invoice_items_parking_assignment_id_key`. The constraint permits a given assignment to be linked to at most one Invoice Item over the entire database history.

The PostgreSQL 18.6 itemized-finalization rehearsal attempted to bill seeded assignment `8404` on a later Invoice after it already appeared on Invoice `5010`. PostgreSQL rejected the second Parking item on `invoice_items_parking_assignment_id_key`. The transaction rolled back: the target draft remained `draft / NOT_FINALIZED`; no item, meter snapshot, or new meter-reading rows persisted; the Flexible Service charge remained `READY`. This is recorded in [the itemized-finalization implementation report](BILLING_V1_7_ITEMIZED_INVOICE_CALCULATOR_ATOMIC_FINALIZATION_IMPLEMENTATION_REPORT.md). The failure was in the disposable rehearsal database, not a successful write to `Goctro_test3`.

This evidence confirms a mismatch between global uniqueness (one historical use per assignment) and the approved recurring Parking rule (one eligible line in each Invoice period while the paid assignment remains active).

## 2. Canonical rule and proposed invariant

The canonical Requirement says an explicitly paid assignment/entitlement that is active and priced at Invoice `period_start` is charged for that whole period, with no proration; it can therefore recur in later eligible periods. Free and legacy-unclassified assignments do not produce a Parking line. The Invoice schema already prevents two Invoices for the same Contract and exact period with `UNIQUE(contract_id, period_start, period_end)`.

Proposed database invariant:

- One `parking_assignment_id` may be linked to Invoice Items on multiple Invoices.
- The same assignment may appear no more than once on one Invoice.
- Any number of non-Parking Invoice Items with `parking_assignment_id IS NULL` remain unaffected.
- Existing Owner, Property, Contract and Room consistency continues to be enforced by the current composite foreign keys and source-validation trigger.

The per-Invoice invariant must be database-enforced so concurrent/retried writes cannot create duplicate Parking lines.

## 3. Recommended physical change

For the next sequential database version, **Database V1.8**, remove the global unique constraint `invoice_items_parking_assignment_id_key` and replace it with:

```sql
CREATE UNIQUE INDEX invoice_items_invoice_parking_assignment_unique
  ON invoice_items (invoice_id, parking_assignment_id)
  WHERE parking_assignment_id IS NOT NULL;
```

This partial unique index is preferred over a table-level `UNIQUE(invoice_id, parking_assignment_id)` because it states the invariant only for rows that actually reference an assignment and avoids indexing all non-Parking rows. PostgreSQL unique indexes treat NULL values as distinct by default, so a non-partial composite unique constraint would also leave multiple NULL-linked rows legal; the partial form makes that intent explicit and keeps the index focused.

The predicate should be `parking_assignment_id IS NOT NULL`, not `category = 'PARKING'`. The actual category value is `PARKING`, but V1.7 has no CHECK constraint that forbids a non-PARKING row from carrying a non-NULL assignment reference. Filtering on category would leave such a linked row outside duplicate protection. Adding a new category/column consistency CHECK would be a separate invariant change and is not included here; preflight must report any existing non-PARKING references for review.

### Alternatives considered

| Design | Assessment |
|---|---|
| Keep `UNIQUE(parking_assignment_id)` | Rejects valid recurring billing across periods; not compatible. |
| `UNIQUE(invoice_id, parking_assignment_id)` table constraint | Correct per-Invoice behavior; PostgreSQL permits multiple NULLs by default. Less explicit and includes NULL-linked rows in the index. |
| Partial unique index on `(invoice_id, parking_assignment_id)` where assignment is non-NULL | Recommended; permits recurrence across Invoice IDs, blocks duplicate links within one Invoice, leaves NULL-linked rows unaffected. |
| Application-only duplicate check | Rejected; concurrent requests can race. Database uniqueness remains required. |
| Add billing period or new linkage columns | Not needed: `invoice_id` already determines the Invoice's Contract and period; extra columns would duplicate context and create consistency risk. |

## 4. Physical schema and Prisma impact

Exact V1.7 physical objects inspected:

- `invoice_items`: primary key `invoice_item_id`; required `invoice_id`, `owner_id`, `property_id`, `contract_id`; nullable `parking_assignment_id` and `parking_entitlement_id`; `category` is constrained to the existing values including `PARKING`.
- Unique constraints include `UNIQUE(invoice_id, item_key)`, `UNIQUE(invoice_item_id, invoice_id, category)`, `UNIQUE(invoice_item_id, utility_tariff_version_id)`, `UNIQUE(flexible_service_charge_id)`, and `UNIQUE(parking_assignment_id)`.
- The Parking assignment relation is protected by the composite FK `(parking_assignment_id, owner_id, property_id)` to the assignment's `(assignment_id, owner_id, property_id)`. The Parking entitlement relation has its corresponding Owner/Property composite FK. The source trigger checks explicitly paid entitlement and matching price version/assignment entitlement when `category = 'PARKING'`.
- `parking_slot_assignments` has required assignment, slot, Property, Owner, vehicle, Resident, Room, Contract, `started_at`, status and lifecycle fields; its FKs preserve tenant/context consistency.
- `parking_entitlements` carries Owner/Property, entitlement type, billability and optional Property pricing reference.
- `invoices` stores `period_start` and `period_end`; `UNIQUE(contract_id, period_start, period_end)` is the exact-period identity guard.
- The V1.7 ERD draws Invoice→Invoice Items and Entitlement→Assignment, but omits the physical Invoice Item→Parking Assignment/Entitlement source links. Keep V1.7 untouched; include those existing relations in the V1.8 ERD refresh so the diagram matches SQL.

In `database/schema.prisma`, remove `@@unique([parkingAssignmentId])` from `InvoiceItem`. Keep the nullable scalar, relation, composite Invoice ownership relations and all other mappings. The repository pins Prisma 6.12.0; that version cannot express a partial-index predicate declaratively, so the new index must be SQL-authoritative for this change. Do not replace it with Prisma `@@unique([invoiceId, parkingAssignmentId])`, which would declare a different full unique index. Prisma introduced partial-index support in 7.4 behind a preview feature; upgrading Prisma is not part of this change request. Prisma generate/validate are implementation-stage checks after approval, not part of this design task. See [Prisma partial-index documentation](https://www.prisma.io/docs/orm/v6/prisma-schema/data-model/indexes).

## 5. Legacy-data and preflight assessment

No live `Goctro_test3` query was completed in this design pass. The latest authoritative target-apply evidence says all V1.7 tables, including `invoice_items`, were empty immediately after promotion; legacy finalized V1.6 invoices remained `LEGACY_AGGREGATE` with no fabricated items. The disposable integration fixture did contain an already-linked assignment, which reproduced the blocker. Because the live target may have changed since promotion, the counts below are **not claimed as current live counts**.

Before implementation, run the read-only preflight in `Database V1.7/proposals/V1_8_recurring_parking_invoice_linkage.sql` against a verified rehearsal/target. It reports:

- duplicate `(invoice_id, parking_assignment_id)` pairs;
- non-`PARKING` items carrying an assignment link;
- assignment links that fail the Owner/Property composite match;
- linked rows on finalized (`finalized_at IS NOT NULL`) invoices;
- total linked rows and the current global unique constraint definition.

The existing validated FK should make orphan links impossible under normal operation, but the explicit query also detects constraint drift or disabled/unvalidated constraints. No row is edited or deleted by preflight. Any duplicate pair, orphan, or unexplained non-PARKING link is a stop-and-review condition before applying the migration.

At the official V1.7 promotion snapshot, finalized legacy invoice items were zero because legacy invoices were preserved aggregate-only. If preflight later finds finalized linked items, they must remain byte/value-identical through the change. The index-only change does not update financial columns or item rows.

## 6. Migration and safety plan

After explicit approval, implement a versioned V1.7→V1.8 migration using the actual names above:

1. Verify the target is the expected V1.7 database and take/verify its required backup under the project migration procedure.
2. Run and retain the read-only preflight output. Stop on duplicate `(invoice_id, parking_assignment_id)` pairs, orphan links, or unexplained invalid category links.
3. In one transaction, lock `invoice_items` against concurrent writes; drop `invoice_items_parking_assignment_id_key`; create `invoice_items_invoice_parking_assignment_unique` partial unique index; verify the new index and absence of the old constraint; commit.
4. Run V1.8 schema/runtime validation, Prisma validation/generation, and the recurring-Parking integration tests before any baseline promotion.
5. Compare legacy Invoice Item rows and finalized aggregate/item snapshots before/after using deterministic fingerprints. Do not run seed on the populated target.

The lock and transactional DDL avoid a write gap between removal of the global rule and installation of the per-Invoice rule. Building the index scans the table and can block writes during migration; plan a maintenance window appropriate to table size. No cross-Owner relation or foreign key is removed.

### Rollback risks

- **Before any assignment is billed on multiple Invoices:** rollback can restore the old global uniqueness by verifying that no `parking_assignment_id` occurs more than once, then running `ALTER TABLE invoice_items ADD CONSTRAINT invoice_items_parking_assignment_id_key UNIQUE (parking_assignment_id);` and only after success `DROP INDEX invoice_items_invoice_parking_assignment_unique;`. Perform this in one guarded transaction.
- **After recurring rows exist:** restoring global uniqueness fails while any assignment is linked from multiple Invoices. Automatic rollback is not safe. Do not delete, rewrite, or merge finalized Invoice Items to force rollback. Stop and require an explicit recovery decision; preserving the new schema/version and rolling forward is the safe default. Manual financial reconciliation would be required for any data-changing alternative.

## 7. Concurrency and finalization compatibility

The unique partial index accepts `(invoice A, assignment X)` and `(invoice B, assignment X)`, but rejects a second `(invoice A, assignment X)` even if `item_key` differs. This is enforced by PostgreSQL under concurrent insertion, not by a prior application read. The Invoice table's exact Contract/period unique constraint continues to reject a duplicate Invoice for the same exact period.

This change does not alter the atomic finalize transaction: a unique violation still aborts and rolls back all item, meter snapshot, reading, charge-consumption and Invoice status writes. Draft locking/conditional status transition continues to protect double-finalize; retries must return/reconcile existing state per the application contract. A future PostgreSQL integration run must demonstrate recurring assignment success in adjacent periods, same-Invoice duplicate rejection, and full rollback on injected transaction failure. Do not wire production finalization until that run and the approved database runtime validator pass.

## 8. Rules explicitly unchanged

No change to paid/free/unclassified Parking treatment, eligibility at `period_start`, Property price selection at `period_start`, no-proration behavior, Utilities, Fixed/Flexible Services, meter continuity, rounding, legacy financial snapshots, or Payment. This change does not enable Invoice finalization or modify backend/frontend behavior.

## 9. Approval and implementation status

**Approval:** The Database V1.8 physical change above was approved and is implemented. Database V1.8 is the current locked local/development baseline; Database V1.7 is its historical locked predecessor. Runtime evidence and target promotion are in the linked implementation report.

The next separate review is production Invoice finalization wiring. This database change does not enable finalization or start Payment; keep `UnconfiguredInvoicePricing` fail-closed until the wiring is separately reviewed and authorized.

## 10. Sources

- `GocTro-SmartBuilding/docs/01_REQUIREMENTS.md` — §10 recurring paid Parking and itemized Invoice rules.
- `GocTro-SmartBuilding/docs/04_API_SPEC.md` — §9.3 and the Billing/Invoice rules; current Invoice API details remain implementation-contract work.
- `GocTro-SmartBuilding/docs/DATABASE_CHANGELOG.md` and `GocTro-SmartBuilding/Database V1.7/{schema.sql,erd.md,README.md,migrations/V1_6_to_V1_7_billing.sql}` — current locked physical design.
- `database/schema.prisma` — current Prisma V1.7 mapping.
- `BILLING_V1_7_ITEMIZED_INVOICE_CALCULATOR_ATOMIC_FINALIZATION_IMPLEMENTATION_REPORT.md` — PostgreSQL integration failure and verified transaction rollback.
