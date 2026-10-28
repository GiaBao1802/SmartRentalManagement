# Owner 6 shared demo data expansion — 2026-10-28

Status: **APPLIED to Neon shared-dev `production` for synthetic UI and billing tests only.** No schema, API, or local database changes.

## Scope and recovery point

The user requested more varied rooms, services, amenities, and invoices for the Owner account shown in the invoice screenshot. The target was verified as Neon project `goctro-shared-dev` (`patient-scene-93926977`), branch `production` (`br-spring-frog-a1rqjhvq`), database `neondb`, Owner 6 / Admin account 6. Other Owners and the original 100 Rooms and 10 Invoices were left unchanged.

Before writes, created snapshot branch `goctro-owner6-demo-backup-20261028` (`br-divine-rice-a1c70kmo`) from production; it is `ready` and expires 2026-11-04. Its public catalog has 47 tables and its pre-write counts were 10 Properties, 100 Rooms and 10 Invoices, including Owner 6's 20 Rooms and 2 Invoices.

## Data added

- Added Property `DEMO-OWNER6-202610`, named **Khu thử nghiệm đa dạng phòng**, with 10 private test Rooms: 3 effectively occupied through active Contracts/Occupancies, 5 available, and 2 inactive. Room amenities vary among the 12 supported Marketplace codes. Descriptions and the Property address identify the rows as simulated; none is public.
- Added 3 synthetic Resident profiles without login accounts or real contact/national-ID data, plus 3 active test Contracts and Occupancies.
- Added 4 Property facilities, 3 Fixed Services and 1 Flexible BOOKING service. Added test-only price versions, an illustrative progressive electricity tariff, and an illustrative flat water tariff. All sources/reasons identify these prices as simulated and not for collection.
- Added and finalized 3 itemized invoices with rent, utility meter snapshots, and fixed-service lines: 1 unpaid with a past due date (overdue is derived), 1 paid through the development-only `demo` payment flow, and 1 unpaid with a future due date. The demo transaction does not transfer real money. The 2 existing Owner 6 draft invoices remain unchanged.

## Verification

- Exact schema remains V1.16 / 47 public tables; no migration or `db push` ran.
- Shared database totals: 11 Properties, 110 Rooms and 13 Invoices. Owner 6 has 3 active fixture Contracts and matching Occupancies, 4 Facilities, 4 Service catalog items, and 2 utility tariffs in the new Property.
- New invoice totals are 2,895,000 VND (overdue unpaid), 3,395,000 VND (paid), and 3,895,000 VND (not-yet-due unpaid). Each has 6 item lines and 4 meter snapshots. The paid invoice has exactly one successful demo payment; no payment was created for the unpaid invoices.
- Backend typecheck passed. Live database queries confirmed the 47-table catalog, fixture counts, the past/future due-date split and itemized rows. No authenticated UI/browser check was performed; the user previously asked not to use computer control.

The scoped seed and completion scripts are in `backend/scripts/seed-owner6-demo-expansion.ts` and `backend/scripts/complete-owner6-demo-expansion.ts`. They target only the verified shared-dev endpoint and Owner 6; the seed script refuses to create a duplicate fixture.

## Next task

Review the new synthetic Property, room-state labels, Service list and Invoice statuses in the Owner 6 Admin UI. Replace or remove the demo-only prices/data before using this shared database for real collection or public listings.
