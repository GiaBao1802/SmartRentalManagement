# Owner 6 Cloudy insight demo data — 2026-10-29

Status: **APPLIED** to Neon shared-dev project `patient-scene-93926977`, branch `production` (`br-spring-frog-a1rqjhvq`), database `neondb`. This is synthetic data for the private test property `DEMO-OWNER6-202610`; no real tenant details were copied.

## Backup and scope

Created Neon snapshot `goctro-cloudy-insights-backup-20261029` (`snap-hidden-shape-a1jdimhu`) from the production branch before writing; Neon reports it expires 2026-11-05. No local database, schema, migration, existing finalized invoice or other Owner's rows were changed.

The guarded script is [`backend/scripts/seed-owner6-cloudy-insights.ts`](../../../backend/scripts/seed-owner6-cloudy-insights.ts). It targets only the verified shared-dev endpoint/database and Owner 6's private demo Property, defaults to dry-run, and supports resume after a partial application without duplicating invoices, parking, or requests.

## Applied data

- Added synthetic residents and active contracts for Rooms T04–T06, bringing this property's occupied test rooms to six. Registration statuses vary between `not_completed` and `temporary_resident`; no login accounts or personal identification numbers were added.
- Added and finalized a September invoice for each new contract. Every invoice has six itemized charges and four opening/ending meter snapshots. Electricity use is 28, 76 and 132 kWh; water use is 3.4, 6.8 and 11.2 m³, respectively. The fixture therefore gives Owner Cloudy a clear highest-electricity/highest-water example: T06.
- Existing simulated utility tariffs remain the source of truth: progressive electricity at 2,000 VND/kWh for the first 50 kWh, 2,500 for the next 50, then 3,000 thereafter; flat water at 15,000 VND/m³. The new invoices snapshot those rates. T04 electricity/water are 56,000/51,000 VND; T05 165,000/102,000 VND; T06 321,000/168,000 VND.
- Added one clearly labeled simulated parking area, five active slots, and five active vehicle assignments across T01–T04. T01 has two vehicles, while T02, T03 and T04 each have one. All assignments use the free demo entitlement; fake plates are examples only.
- Added 12 clearly labeled mock resident requests/complaints with history rows and a mix of pending, in-progress, resolved and rejected states. T01 has four, T02 three, T03 two, and T04–T06 one each.

The three new invoices total 4,487,000 VND (T04, unpaid), 5,247,000 VND (T05, paid through the development-only simulated payment flow) and 3,269,000 VND (T06, unpaid). These are test fixtures, not charges to collect. The October billing period remains untouched because it has not ended.

## Verification

- Neon snapshot lookup returned the named snapshot and its expiry.
- Read-only live queries confirmed three active fixture contracts, three September invoices, six line items/four meter snapshots per invoice, the expected progressive-tier calculations, and the 15,000 VND/m³ water price.
- Live parking aggregation returned five active assignments with T01 highest at two vehicles. Complaint aggregation returned 12 requests with T01 highest at four. No application data outside Owner 6's private demo Property was targeted.
- Seed script dry-run passed before apply, and a second `--apply` completed without duplicate rows. Counts remained three new residents/contracts/invoices, one parking area, five slots/assignments and 12 complaints. Targeted TypeScript compilation reached an existing unrelated error at `backend/src/contracts/contract.validation.ts:44`; the seed itself executed in dry-run and apply mode successfully.
- No schema version or API contract changed; `DATABASE_CHANGELOG.md` is unchanged.

## Limit

All additions are visible to Owner 6 only through Owner-scoped application access. The demo Property is private, and each new name/content/parking-area label marks the rows as simulated. Do not use these fixtures for real billing, public listings or real resident communications.
