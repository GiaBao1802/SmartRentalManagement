# V1.14 — Room equipment requests

PROMOTED_LOCAL 2026-10-28 on Goctro_dev_v18 localhost:5433, exact predecessor V1.13. Adds complaint_room_requests (typed extension of Complaint, occupancy and retry key) and room_equipment (one confirmed presence per room/code, decision source/account). Scope triggers and composite foreign keys reject mismatched room/equipment sources. Existing 44 tables are unchanged; total 46 tables.

Verified backup/restore and V1.13→V1.14 rehearsal preceded atomic live promotion. Backup has 520 entries, SHA-256 d27e2c77df7d62bd4b96334af74e1369ae31708fee3ef404b124de05ce19c382. Old-row fingerprints unchanged. CORE 89/89 and booking 17/17 validators pass with rollback. No seed/reset on target.

Migration is guarded by exact predecessor/post-catalog in scripts/promote-room-requests.mjs and protected-target session authorization V1.14. Immutable after promotion. Regression test backend/src/resident-assistant/room-request.postgres.test.ts creates and removes its own disposable database. No existing room description is converted into an equipment inventory.
