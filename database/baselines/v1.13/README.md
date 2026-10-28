# Database V1.13 candidate — Resident Parking requests

**Status: applied locally; baseline promotion pending exact catalog capture and runtime validation.** The guarded V1.12→V1.13 migration was applied to populated `Goctro_dev_v18` on 2026-10-28 after a fresh verified backup. Migration post-check, read-only `state`/`inspect`, a Prisma count of the new request table, and backend DB health passed. V1.12 and earlier artifacts are unchanged.

V1.13 adds optional accepted-vehicle category and default entitlement configuration to `parking_slots`, plus `parking_slot_requests`. A pending request reserves one slot and Contract capacity for 24 hours; Admin approval creates the linked assignment. Existing Property pricing remains the only amount authority. No payment is taken when a Resident requests a slot.

The additive migration is [`migrations/V1_12_to_V1_13_resident_parking_requests.sql`](migrations/V1_12_to_V1_13_resident_parking_requests.sql). The matching clean-install SQL is `schema.sql`; it contains the V1.13 objects without the migration-only protected-target guard. `seed.sql` and V1.12 runtime validators are unchanged copies. `database-v111.mjs migrate-v113` requires the exact V1.12 predecessor and performs a structural post-migration catalog check. Protected local databases require a verified backup confirmation through the setup flow.

The exact V1.13 `expected-catalog.json` and V1.13-specific runtime validation remain pending, so this folder remains a local candidate rather than a promoted source baseline. Do not confuse the successful local apply with full baseline promotion. See `docs/DATABASE_CHANGELOG.md` for the current database status.
