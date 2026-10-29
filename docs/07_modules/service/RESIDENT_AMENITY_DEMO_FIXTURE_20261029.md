# Shared Resident amenity and incidental-service demo fixture — 2026-10-29

- Status: **APPLIED to Neon shared-dev `production`; synthetic test data only**
- Scope: owner-scoped facilities and scheduled Flexible booking offerings for all 11 existing shared-demo Properties.
- Schema/API: unchanged; Database V1.16 remains 47 public tables.

## Target and recovery point

The target was verified as Neon project `goctro-shared-dev`, branch `production`, database `neondb`. Before writing, created read-only snapshot branch `goctro-resident-amenities-backup-20261029` (`br-restless-dream-a1qziasc`), parent `br-spring-frog-a1rqjhvq`, expiring 2026-11-05. The snapshot was verified ready with 47 tables, 11 Properties and 54 Facilities before the transaction.

Pre-write production state was 11 active Properties, 54 active Facilities and two active Flexible Services. The script checks the exact V1.16 catalog, all Property IDs/Owners/names, exactly one active Admin per Owner, and every fixture description/price/schedule. It is transaction-scoped and idempotent; the dry run completed and rolled back before the apply.

## Added data

- Added 16 clearly marked demo Facility rows associated with the sample booking assets across the 11 Properties.
- Added 31 active Flexible `BOOKING` services: 16 pool/soccer/tennis offerings and 15 haircut/gardening offerings. All are free. Every Property received at least one free offering; the mix varies by Property, while the existing laundry and SPA services were retained.
- Each service has an explicit weekly schedule, opening window, slot length and capacity. Booking requests remain pending until the Owner approves. All demo price versions identify the values as simulated; no sample service is configured to charge a Resident.
- During a follow-up correction, the 15 haircut/gardening price histories received a new zero-price version (version 2); their prior demo versions remain in append-only history. Public descriptions now state free and Owner approval required.
- No sample Resident booking was inserted, so the new schedules start with open capacity. Existing booking rows were preserved.

## Verification

- Post-write read-only query: exact catalog 47 tables; 11 Properties; 70 active Facilities; 33 active Flexible Services/configurations; 46 demo price versions including the 15 free-price corrections.
- Every one of the 11 Properties has at least one free demo booking service; all 31 demo services are zero-priced at the current effective version.
- Idempotent dry run after the correction reported zero additions and passed all fixture checks.
- `npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext --esModuleInterop --skipLibCheck scripts/seed-shared-resident-amenities.ts` — PASS.
- No migration, room/contract/resident/invoice/payment change, or local database write. Authenticated UI review and a full booking approval integration test remain pending.

The repeatable guarded transaction is [`backend/scripts/seed-shared-resident-amenities.ts`](../../../backend/scripts/seed-shared-resident-amenities.ts). It reads the ignored `.env.neon`, refuses a non-Neon or non-`production` branch, defaults to dry-run rollback, and requires `--apply` to commit.
