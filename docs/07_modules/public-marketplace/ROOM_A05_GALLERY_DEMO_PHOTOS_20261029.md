# Room A05 gallery expansion with illustrative photos — 2026-10-29

**Status:** Applied to the user's shared Neon demo and verified through the local public API. Temporary stock images remain explicitly labeled “Ảnh minh họa”.

## Scope and source

The screenshot showed public Room A05 (`room_id=6`) at An Bình Biên Hòa with one image. The API confirmed there was one RoomImage association and the UI already supports a gallery when multiple images are present. At the user's request, four more of the existing approved, downloaded Unsplash demo interiors were attached to this Room. The cover remains first; the Room now has five ordered images, the V1.4 per-Room maximum.

The six approved image sources and photographer pages are recorded in [the original public-room demo image report](PUBLIC_ROOM_DEMO_PHOTOS_20261029.md). These are illustrative stock interiors, not photos of Room A05. The UI labels every one “Ảnh minh họa”. To follow the approved storage/security contract, PostgreSQL stores opaque storage keys and the app serves them through `/api/v1/public/room-images/{image_id}`; external image URLs are not stored or exposed directly. The binaries remain in ignored local backend storage, so another machine needs those files to serve the shared associations.

## Target and recovery point

Verified Neon shared-dev `production`, database `neondb`, V1.16/47 tables and Room A05 identity/status before writing. Read-only snapshot `goctro-room6-gallery-backup-20261029` (`br-wandering-sea-a18rael8`) was created from production and confirmed ready with 47 tables and the original one-image state; it expires 2026-11-05.

Only Room A05's `room_images` received four additional associations. The previous cover and all other Room, Property, Resident and financial records were left unchanged. No migration/schema change was required.

## Verification

- The guarded script's dry-run passed before applying; a single serializable transaction added four associations.
- Live `GET /api/v1/public/rooms/6` returned five ordered images, retained cover ID `103`, and marked all five illustrative.
- All five returned image URLs responded `200 image/jpeg` through the public API.
- Script: [`backend/scripts/add-room6-gallery-demo-photos.ts`](../../../backend/scripts/add-room6-gallery-demo-photos.ts). It defaults to rollback/dry-run, checks the exact Neon branch/database/catalog/Room and allowlisted files, and is idempotent.

This does not add real Room photographs. The Owner can replace or supplement these demo images through the existing Room image gallery.
