# Owner 6 phòng, tài khoản cư dân và ảnh demo — 2026-10-29

Status: **APPLIED to Neon shared-dev `production`; demo-only.** No schema migration or database-version change.

## Scope and safety

Target verified before the write as Neon project `goctro-shared-dev`, branch `production` (`br-spring-frog-a1rqjhvq`), database `neondb`, Owner 6 / Admin 6. The existing Property `DEMO-OWNER6-202610` (ID 12) was required to contain exactly the original T01–T10 rooms with no photos, and its three synthetic T01–T03 residents were checked by reserved `example.test` emails. Other Owner data and the public marketplace were not changed. All new rooms remain private (`is_public=false`).

The additions are fictional UI fixtures. Five new synthetic Residents and active test Accounts were added for T11–T15 using `example.test` addresses and random scrypt-hashed demo credentials; no phone, national ID, real contact details, or plaintext password was written to PostgreSQL. Do not use these accounts for real tenancy or payments. The random demo password is provided only in the task result for local testing and is not recorded here.

## Data and image handling

- Added rooms T11–T15 with varied area, rent, capacity and structured amenities; each has a synthetic active Contract and Occupancy. Existing T01–T10 were preserved.
- Added one cover image to each of the 15 rooms and a demo portrait to the 8 synthetic T01–T03/T11–T15 Resident profiles. No real Owner 6 Resident profile received an avatar.
- Room images were downloaded from Unsplash and demo portraits from RandomUser. The URLs are not stored as public database URLs: validated JPEG bytes are saved in the backend's private local storage and PostgreSQL stores only opaque keys. The local image files are ignored by Git and must be re-created/provisioned if another machine is to serve this same database. The room images are sample interiors, not claims about the rooms.
- Room-photo references: [Andrea Davis](https://unsplash.com/photos/a-room-with-a-bed-and-a-table-in-it-IDTlAapR3m4), [Christian Lue](https://unsplash.com/photos/empty-room-with-wooden-floor-and-large-window-4YhNRgL59Fc/), [Aleksandra Dementeva](https://unsplash.com/photos/a-modern-bedroom-with-a-neatly-made-bed-gooFl1sx3ow), [Anisha Deb](https://unsplash.com/photos/a-modern-bedroom-with-a-large-window-and-bed-mfFyocD9ttI), [Christian Ventura](https://unsplash.com/photos/modern-bedroom-with-a-bed-and-armchair--3PiIk77r6s), and [Sidath Vimukthi](https://unsplash.com/photos/a-comfortable-bedroom-with-bed-and-lamp-EbnBI09AegA). Each source page identifies its image as available under the Unsplash License.

## Verification

- Neon target still reports database `neondb` and branch `br-spring-frog-a1rqjhvq`.
- The demo Property now has 15 rooms, 15 RoomImage cover associations, zero public rooms, and 5 additional synthetic resident accounts. All 8 synthetic avatar keys and all 15 room-image keys resolve to files in the local backend storage.
- Resident avatar route tests pass (2/2); backend and frontend TypeScript checks pass. No database schema/version change, no change to other Owner fixtures, and no public marketplace exposure.
- The pre-write snapshot branch `goctro-owner6-demo-backup-20261028` remains the recovery point described in the earlier Owner 6 fixture report.

## Next task

The user can sign in locally with any new `demo-owner6-t11@example.test` through `demo-owner6-t15@example.test` account and the shared generated demo password given in the task response. Check the Admin Resident detail page and the local backend image routes. Keep this synthetic property private unless the user explicitly wants selected demo rooms exposed in the public marketplace.
