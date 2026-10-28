# Resident Property Facility display fix — 2026-10-29

- Status: **IMPLEMENTED; automated checks pass; no database changes**
- Scope: show Owner-defined shared Property Facilities in the Resident amenities page, separately from Flexible Services that support booking.

## Finding

Read-only inspection of Neon shared-dev `production` confirmed that `Vườn Xanh Long Thành` already has five active Property Facilities and zero active bookable services. The Resident `GET /me/services` query returned only Flexible Service pricing items, and the UI treated an empty service list as proof that the Property had no amenities. No facility data needed to be inserted.

The five existing shared facilities are: covered motorbike parking, car parking, common TV room, small garden, and property Wi-Fi. These are synthetic demo entries in the shared test dataset; they describe shared amenities and do not claim online booking or availability.

## Change

- Resident `GET /me/services` now returns the active Property Facilities of each currently occupied Property in a separate `facilities` array, alongside the existing bookable `services` array.
- The Resident amenities page displays shared facilities with their saved location/description, and shows online booking services in a separate section. Empty messaging now says that no booking service exists, without hiding facilities or implying the Property has none.
- Resident Cloudy’s booking selector continues to use only actual bookable services; its empty state links residents to the page where display-only facilities are shown.
- Requirements and API Spec now distinguish shared facilities from bookable services.

## Booking classification follow-up — 2026-10-29

- Shared registerable amenities such as a pool, soccer field or tennis court use a separately Owner-configured Flexible `BOOKING` offering with an effective price of 0. Booking requests hold capacity and await Owner approval; approval now reserves the slot without creating a billable event or Invoice Item.
- Incidental services such as haircut or gardening remain separately Owner-configured booking offerings with an effective positive price. The quote is saved with the request and a charge is created only when the Owner approves it.
- Resident booking cards, confirmation messages and chat now say “Miễn phí” for zero-priced bookings instead of implying that a zero-VND fee will enter an invoice.
- No category column or migration was added: the existing Owner-scoped Flexible catalog, schedule and price version represent both cases. A Property only shows services its Owner explicitly creates; no pool, sports court or incidental service was seeded by this change.

## Validation

- Backend in-memory service/utility route and repository suite: 16 passed, 0 failed (run with a dummy DATABASE_URL only to satisfy module initialization; these tests use mocks).
- Backend and frontend TypeScript checks: PASS after the free-booking change.
- Frontend production build: PASS after the free-booking change.
- PostgreSQL booking integration test: NOT RUN; no disposable DATABASE_URL was configured. The shared Neon database was not used for verification or changed.
- Focused Resident service route tests: 7/7 PASS after adding the empty-bookable-service / populated-Facility case.
- Read-only target check: Neon shared-dev property counts show five active Facilities and zero active bookable services for `Vườn Xanh Long Thành`; all 11 shared Properties have active Facilities. No rows were written, no migration ran, and the database remains V1.16/47 tables.
- No authenticated browser visual review was performed. The free booking decision's DB integration branch still needs a disposable V1.16 database test.
