# Marketplace amenities — Database V1.16 implementation report

Date: 2026-10-28
Scope: owner-managed structured room amenities, public listing/search contract, and local Cloudy query integration.
Status: V1.16 applied and verified on Neon shared-dev `production`; local `Goctro_dev_v18` remains V1.15.

## Implemented

- Added `rooms.marketplace_amenities` as a non-null PostgreSQL `text[]`, defaulting to empty, constrained to the supported code list and indexed with GIN. The V1.15→V1.16 migration does not infer values from descriptions or alter existing row contents.
- Added Admin room create/edit fields for air conditioning, parking availability, Wi-Fi, elevator, washing machine, refrigerator, water heater, private kitchen/bathroom, balcony, and cat/dog policy. Backend validation enforces the same strict allowlist and derives the Owner from the authenticated session.
- Added the public `amenities` response field and the comma-separated `amenities` list filter. All requested codes are required. Public list/detail and room cards show only stored confirmed values.
- Updated local Cloudy: Qwen can propose recognized amenity codes, the guest confirms before search, and the read-only public API applies the structured filter. Unknown/general “tiện ích” wording requests clarification. Matching room cards include amenity labels and the full result link preserves amenity filters.
- Corrected failure reporting: if confirmed search cannot reach the public API/database, Cloudy now reports that dependency instead of blaming Ollama. Model inference failures still identify Ollama.

Parking means parking is available to ask about for that room/property; it does not say whether parking is free or included in rent. Existing rows remain empty until an Owner verifies and edits their room. Owner-confirmed data quality and authenticated Admin UI review remain pending.

## Validation

- Disposable PostgreSQL 18 rehearsal passed for clean-install and populated V1.15 migration paths. Predecessor fingerprints remained unchanged; pre-existing Rooms defaulted to no amenities; valid multi-code filtering returned the expected match; an unknown code was rejected by the database check.
- Neon clone rehearsal from shared-dev `production` passed exact V1.15→V1.16 catalog comparison and unchanged fingerprints across all 100 Rooms. Production backup `.local/setup-backups/neon-production-before-v116-20261028-230410.dump`: 323,587 bytes, `pg_restore --list` returned 560 entries, SHA-256 `50a2dc9d05dabf53c8b98a796d4d35e3d83be8912211e44f9e53dba31f97192c`.
- The same versioned migration was applied to Neon shared-dev `production` in one transaction. Post-migration exact V1.16 catalog matched, all 100 prior Room fingerprints were unchanged, and every existing Room has an empty amenity array.
- Restarted local Neon development app: backend health and public room list/filter both returned HTTP 200. Cloudy confirmation returned a preview with individual room links and a full-results link (90 public matches without amenity filters). A live Qwen3 1.7B proposal for “máy lạnh, bãi gửi xe, diện tích từ 20 m2” returned `air_conditioning`, `parking`, and area ≥20 m² in `awaiting_confirmation`.
- Cloudy local route and client tests **19/19 PASS** after the error-message correction; frontend typecheck PASS.
- Backend public-marketplace tests **7/7 PASS**; Property/Room tests **45/45 PASS**.
- Frontend typecheck PASS. Cloudy public DB/local route and API-focused tests **40/40 PASS**. Python Cloudy tests **20/20 PASS**.
- The frontend API aggregate is **76 PASS / 1 FAIL**: the failure is the existing Admin sidebar assertion expecting only the Service entry; current dirty tree also exposes `/admin/requests`. The failing test and sidebar source were not changed in this task.
- Prisma schema validation and backend typecheck PASS. `prisma generate` previously could not replace a locked Windows query-engine DLL; after starting a fresh Neon backend, the public Prisma query selecting `marketplace_amenities` succeeded, verifying runtime compatibility.
- Amenity search currently returns zero because the existing demo Rooms remain empty until an Owner confirms amenity values. No Room data was inferred or seeded. Local `Goctro_dev_v18` remains V1.15. The earlier frontend API aggregate remains 76 PASS / 1 unrelated existing sidebar assertion failure.
- No commit or push was performed; the working tree contains unrelated pre-existing user changes.

## Next task

Have the Owner/Admin verify and save structured amenities for intended public demo Rooms, then search Cloudy for AC, parking and area to confirm the data-backed matches. If local `Goctro_dev_v18` testing is required, restore its connection configuration and apply V1.16 separately after a verified backup.
