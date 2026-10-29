# Hiển thị ảnh phòng trong cổng cư dân — 2026-10-29

Status: **IMPLEMENTED; automated checks pass.** No database or storage objects were changed.

## Finding and change

`GET /me/rental` already joins each Resident occupancy to its Room, but the Resident overview rendered only a generic pin/home icon, while the top hero always rendered a fixed SVG house. The overview now includes the room's cover image metadata and shows a responsive cover card with an “Ảnh minh họa” badge for the existing approved demo-photo keys. The hero now uses the current Room cover immediately; when no cover exists or it cannot load, it falls back to approved public demo image 101 with the same badge, then to the SVG if that image is unavailable.

Private image bytes are served through a Resident-only route. It checks that the Room is linked to the authenticated Resident's current or historical occupancy under the same Owner; unrelated images resolve to the same generic `404`. The Next.js route proxies the request with the browser session cookie. Storage keys are not returned to the client.

## Data and limitation

No image rows were added or changed. The existing demo set has 15 room-image objects on the current development machine, while PostgreSQL stores opaque storage keys. These local objects are ignored by Git; another machine or production deployment needs shared object storage or its own permitted image provisioning before these associations can return bytes. No database migration is needed for this UI/API change.

## Verification

- Frontend TypeScript check passes. Backend TypeScript check currently reports an unrelated pre-existing error at `src/services/property-service.repository.ts:534` (`booking.charge_amount` may be undefined); no errors point to the room-photo changes.
- Resident occupancy routes: 49/49 tests pass; `/me/rental` verifies the cover-image DTO and private URL.
- Room-image suite: 22/22 tests pass, including own-resident access, Admin denial, and foreign-resident concealment.
- Next.js production build passes and includes `/api/me/room-images/[imageId]`.
- Authenticated visual review against a live Resident account remains pending.

## Next task

Sign in as a Resident with an existing room cover and check `/tenant`; if the image returns unavailable, provision the ignored local image object or configure shared storage. Do not add stock photos to real occupied rooms without marking them as illustrative.

## Follow-up: compact gallery in Resident hero — 2026-10-29

The hero now reads the authenticated Resident Room's complete ordered image gallery from `/me/rental`. It retains the cover as the first image, provides accessible previous/next buttons and a count when multiple images are available, and preserves the “Ảnh minh họa” badge. The green decorative panel is narrower and shorter. Gallery entries return only image ID, order/cover flags, illustrative status and the Resident-only image URL; storage keys remain private. No database or storage-object changes.

The focused Resident route test passes 49/49 and asserts multiple image URLs plus the absence of storage keys. Backend typecheck passes. The latest full frontend typecheck reports unrelated existing errors in `frontend/src/lib/owner-advisor-live.ts`; no errors point to the touched gallery component. An HTTP request to the running `/tenant` dev server returned 200. A new production build attempt stopped because another Next.js process was already using the shared `.next` build directory; the running server was left untouched. Authenticated visual review remains pending.
