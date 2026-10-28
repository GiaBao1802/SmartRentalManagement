# Ảnh minh họa cho phòng công khai — 2026-10-29

Status: **CURRENT DEMO FIXTURE on Neon shared-dev `production`; user-approved temporary illustrative assets.** No schema/database-version change; public API has the additive `is_illustrative` field.

## Scope

Before writing, verified the target as Neon `goctro-shared-dev`, branch `production` (`br-spring-frog-a1rqjhvq`), database `neondb`. All 85 eligible public rooms (`is_public=true`, active Room, `available`, active Property) had no `RoomImage` cover. Added one cover association for each room, including all 45 currently matching the user's filtered-list screenshot. Other Room/Property fields and account data were unchanged.

The new associations reuse six validated JPEG objects that had already been downloaded into private backend-local storage for the Owner 6 demo rooms. The six interiors rotate in Room ID order, so adjacent room cards use different images; room image URLs remain per-association and the existing public image endpoint rechecks Room visibility on every read. PostgreSQL stores only opaque storage keys, not source URLs. These are illustrative interiors, not verified photos of the listed rooms. Source pages: [Andrea Davis](https://unsplash.com/photos/a-room-with-a-bed-and-a-table-in-it-IDTlAapR3m4), [Christian Lue](https://unsplash.com/photos/empty-room-with-wooden-floor-and-large-window-4YhNRgL59Fc/), [Aleksandra Dementeva](https://unsplash.com/photos/a-modern-bedroom-with-a-neatly-made-bed-gooFl1sx3ow), [Anisha Deb](https://unsplash.com/photos/a-modern-bedroom-with-a-large-window-and-bed-mfFyocD9ttI), [Christian Ventura](https://unsplash.com/photos/modern-bedroom-with-a-bed-and-armchair--3PiIk77r6s), and [Sidath Vimukthi](https://unsplash.com/photos/a-comfortable-bedroom-with-bed-and-lamp-EbnBI09AegA).

## Verification and limits

- 85/85 eligible public Rooms now have a cover association; all six referenced local image objects exist, and all keys pass the RoomImage storage-key format.
- The shared database still has 11 Properties, 115 Rooms and 13 Invoices. No schema migration, public Room-field update or Owner/profile update was made; the public image-source marker is derived from a code allowlist.
- The images are stored under ignored local backend storage. This computer can serve them; another machine needs its own copy of these image files before the same shared database can deliver them. Production file storage is not configured.
- No browser/Computer Use review was performed. The user can refresh the public list and confirm the cards render.

## Correction procedure

The guarded reversal is recorded in `backend/scripts/remove-public-room-demo-photos.ts`; it targets only the verified shared-dev branch, checks the exact 85-room scope and six known fixture keys, and preserves the local image objects and private Owner 6 associations. The current fixture uses `backend/scripts/add-public-illustrative-room-photos.ts`; it verifies the target branch, source files, exact room scope and empty public image state before attaching.

## Correction after screenshot review — 2026-10-29

The screenshot showed each image constrained to about 140px while its card was much wider. The first CSS correction reset the link width but missed its parent `.room-listing-cover`, which still inherited `width: 140px` from the map-card layout. The follow-up now sets the expanded-map cover wrapper itself to full width and gives it the same responsive fixed-height frame as the image; the narrow-screen expanded layout uses a 154px frame. The dedicated full-list rule already sets the wrapper and image to full width.

The six Unsplash interiors are not photos of the public listings. At the user's direction, Requirement §3 now permits explicitly requested demo stock only when clearly marked “Ảnh minh họa”; it must not be presented as an actual room photo. The public API serializes an additive `is_illustrative` boolean from an internal six-key allowlist and never exposes `storageKey`. The card and detail gallery display the label whenever the API marks an image illustrative. After the temporary cleanup, the guarded add script restored one cover on each of the 85 public rooms; its post-check verified 85 public covers and 85 illustrative covers. All 15 private Owner 6 room-image associations and all six local storage objects remain.

The one-cover-per-public-Room count above is a historical checkpoint and was superseded on 2026-10-29 by [the all-room gallery follow-up](ALL_ROOM_GALLERIES_TWO_IMAGES_20261029.md): all 115 shared demo Rooms now have at least two images, and the public API returns a labeled gallery of at least two images for all 85 public Rooms.

Backend/frontend typecheck, public marketplace route tests (8/8), and frontend `next build` pass. The live public API returned all 85 rooms: 85 covers, 85 marked illustrative, 0 missing covers/labels. Image URL 101 returned HTTP 200 with `image/jpeg`. No Computer Use or visual browser verification was performed. Image bytes remain local to this computer; production object storage is not configured.

## Follow-up: shared gallery on Marketplace cards — 2026-10-29

Public list and province Explorer endpoints now return the same ordered `RoomImage` metadata gallery as room detail, while keeping the existing cover and per-image public visibility check. Map and full-list cards now start at the room cover and let guests switch through that Room's photos; demo assets keep the “Ảnh minh họa” label. Resident and Marketplace galleries use the same ordered associations and cover selection. No database/schema changes or image associations were added. Public route tests 8/8, Resident tests 49/49, frontend API tests 77/77, and backend typecheck pass; live read-only checks returned gallery metadata and Marketplace HTTP 200. The latest full frontend typecheck reports unrelated existing errors in `frontend/src/lib/owner-advisor-live.ts`. The existing 85 public demo rooms still have one image each, so their card controls stay hidden until more images are attached. A production build attempt was blocked because a separate Next process holds the shared `.next` directory. Guest visual review remains pending.

After the screenshot regression report, the actual expanded-map cover wrapper was corrected to fill the card width instead of retaining the map's 140px thumbnail width. The edited Explorer stylesheet parses successfully with the project's PostCSS parser. No browser automation was used; visual confirmation after the user refreshes `/tim-phong` remains pending. No data/API/schema change.
