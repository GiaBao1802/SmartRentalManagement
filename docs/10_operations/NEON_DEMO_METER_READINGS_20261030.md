# Neon synthetic meter readings — 2026-10-30

Status: **APPLIED AND VERIFIED — DEMO DATA ONLY**

## Scope

The target was the existing shared Neon project `goctro-shared-dev`, branch `production`, database `neondb`, on the `main` source checkout. The guarded read-only Neon connection check returned the exact V1.18 catalog (58 tables) before the write.

All active Resident tenancies in this fixture are explicitly fictional demo contracts. The operation filled only the two missing ending-reading fields on 10 existing, overdue, non-finalized demo invoice drafts (`DEMO-RENT-2026-*`). Opening readings were already present and were left unchanged. Every value below is synthetic and must not be represented as an observed meter reading.

| Invoice | Room code | Electricity opening → ending (kWh) | Water opening → ending (m³) |
|---|---|---:|---:|
| `INV-23-20260911` | A01 | 270.400 → 342.800 | 26.500 → 30.750 |
| `INV-24-20260903` | A01 | 156.800 → 242.400 | 15.500 → 21.000 |
| `INV-25-20260913` | A02 | 298.800 → 363.000 | 29.250 → 33.000 |
| `INV-26-20260905` | A01 | 185.200 → 277.000 | 18.250 → 24.250 |
| `INV-27-20260915` | A01 | 327.200 → 385.600 | 32.000 → 36.500 |
| `INV-28-20260907` | A02 | 213.600 → 290.900 | 21.000 → 26.250 |
| `INV-29-20260917` | A01 | 355.600 → 459.200 | 34.750 → 38.250 |
| `INV-30-20260909` | A01 | 242.000 → 310.900 | 23.750 → 30.500 |
| `INV-31-20260919` | A02 | 384.000 → 472.100 | 37.500 → 42.300 |
| `INV-22-20260901` | A02 | 128.400 → 203.100 | 12.750 → 18.650 |

The 10 invoices remain `draft` / `NOT_FINALIZED`; no electricity/water charges, invoice totals, payment status, meter-reading history rows, or snapshots were created. The app's normal finalization flow remains responsible for producing authoritative billing snapshots and meter-reading history. The five newer active demo tenancies that began on 2026-10-28/29 already have contract opening readings; their first billing periods have not ended, so no ending readings or invoices were added for them. Vacant rooms were not assigned readings.

## Verification and recovery

- `node --env-file=.env.neon scripts/verify-neon-connection.mjs` — PASS before and after: `database=neondb; catalog=V1.18 exact; branch=production`.
- `node scripts/demo-data/fill-demo-meter-readings.mjs` — dry-run listed exactly the 10 guarded drafts and made no writes.
- `node scripts/demo-data/fill-demo-meter-readings.mjs --verify` — PASS, read-only: all 10 expected electricity/water endings present; all remained drafts; 0 invoices finalized.
- No schema, migration, seed/reset, local PostgreSQL, or account data was changed.

Before the transaction, the 10 affected invoice rows were saved locally at `.local/setup-backups/neon-before-meter-demo-1793294540864.json`; SHA-256: `23380ef097c8105f9825d75ab44f01089ea8a2974f6c4e4a3b792ec5de3dea4a`. The snapshot contains no connection credential. The operation implementation and target guard are in [`scripts/demo-data/fill-demo-meter-readings.mjs`](../../scripts/demo-data/fill-demo-meter-readings.mjs).
