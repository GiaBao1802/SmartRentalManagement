# Mỗi phòng có tối thiểu hai ảnh minh họa — 2026-10-29

Status: **APPLIED to Neon shared-dev `production`; demo-only.** No schema/API or database-version change.

## Scope and safety

At the user's request, every Room in the shared demo now has at least two gallery images. Before writing, verified Neon project `patient-scene-93926977`, branch `production` (`br-spring-frog-a1rqjhvq`), database `neondb`, V1.16/47 public tables, the complete expected 115-Room inventory across Owners 6–10, valid gallery ordering/covers, and all six approved local illustrative JPEG objects. A ready, no-compute snapshot branch `goctro-all-room-galleries-backup-20261029` (`br-bitter-pond-a1ku9kc0`) was created from production before the transaction and expires 2026-11-05. Neon refused another read-only compute endpoint because the project's endpoint limit was reached; the branch snapshot itself reached `ready` and records its production parent and LSN.

The guarded script never alters or removes existing image associations, image covers, Room/Property fields, contracts, residents, or other demo data. It adds only allowlisted illustrative image associations until each gallery contains two images. Existing Room galleries remain capped at five.

## Result and verification

- Before: 115 Rooms; one already had at least two images; 114 needed additions. 129 image associations were added. Existing covers and image order were preserved.
- After: all 115 Rooms have 2–5 images (233 associations total); each Room has exactly one cover. 224 associations use the approved illustrative allowlist. All 129 newly added associations are marked `is_illustrative` by the existing API allowlist, so the UI labels them “Ảnh minh họa”.
- The 85 public Marketplace rooms return at least two images each, all labeled illustrative. Three sampled image URLs returned HTTP 200 `image/jpeg`; A05 remains at five images.
- The guarded script's post-apply dry-run reports 115/115 complete and zero remaining additions. Backend TypeScript typecheck passes.

The app stores opaque local-storage keys rather than external image URLs. The six image files remain in ignored backend-local storage; other computers need those image objects provisioned before their API can serve the shared database associations. Photos are illustrative sample interiors, not verified pictures of the Rooms. Source credits are in [public demo photo report](PUBLIC_ROOM_DEMO_PHOTOS_20261029.md).

Rerun/audit: `backend/scripts/ensure-all-room-galleries-two-demo-images.ts` (dry-run by default; writes only with `--apply`). No migrations, schema changes, or local `Goctro_dev_v18` changes.
