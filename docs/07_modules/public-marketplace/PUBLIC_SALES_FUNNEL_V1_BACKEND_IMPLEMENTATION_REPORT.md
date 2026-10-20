# Góc Trọ — Public Sales Funnel V1 Backend Implementation Report

- Date: 2026-10-11
- Status: **PUBLIC SALES FUNNEL V1 BACKEND — RUNTIME VERIFIED FOR LOCAL/DEV V1.4**
- Scope: public Room listing/search/detail, public gallery serialization and delivery integration, guest Contact Request creation, and Owner-scoped Admin Contact Request inbox/status update.
- Excluded: frontend, booking/viewing/deposit/payment, source attribution, Room amenities/reviews/promotions, schema/Prisma/migration/seed source edits.

## 1. Executive summary

Implemented the three canonical public routes and the Admin Contact Request list/detail/status routes. Public list, detail, contact creation and image delivery use the same server-side availability predicate. Guest contact submission requires no account; Property/Owner scope is derived from the eligible Room or selected active Property. Admin scope always comes from the authenticated session. DTOs are explicit allowlists and never return storage keys or internal Room, Resident, Contract, Owner, or account identifiers.

Automated HTTP tests passed 7/7. Required Auth, Property/Room, Resident/Occupancy, Contract and Room Images regressions passed 246/246. A disposable PostgreSQL 18 V1.4 database passed schema, seed and the locked runtime validator (87/87); backend HTTP smoke then passed 20/20 behavior checks. The combined database + HTTP run was 22/22 including the schema/seed and validator gates.

Backend typecheck/build still fail on 174 existing legacy diagnostics in `backend/src/app.ts` and `backend/src/residents/resident.test.ts`; targeted filtering found zero diagnostics in the new Public Marketplace files or shared Room status helper.

## 2. Sources and authority

- Canonical product requirements: `docs/01_REQUIREMENTS.md`
- Canonical API contract: `docs/04_API_SPEC.md`
- Database V1.4 `schema.sql`, `seed.sql`, and `runtime_validator.sql`
- Current `database/schema.prisma`
- Public Sales Funnel audit and Room Images design/implementation/runtime reports
- Property/Room repository/routes/status behavior, Room Image public delivery, Auth/CSRF/Owner middleware, pagination and shared error handling

The canonical API contract remains the business authority. Legacy/demo public routes were not used as a source for V1 behavior.

## 3. Existing state before this pass

The V1 router had no Public Room list/detail or Contact Request handlers. Public image content was already implemented for V1.4, and `contact_requests` already supported Room/Property-linked requests with `new/contacted/closed` statuses. The root application still contains older unversioned demo routes; this implementation uses the versioned V1 router and does not adapt viewing/appointment data into Contact Requests.

## 4. Files changed

- `backend/src/public-marketplace/public-marketplace.validation.ts` — strict list/contact/inbox allowlists and parsing.
- `backend/src/public-marketplace/public-marketplace.repository.ts` — Prisma V1.4 queries and transaction-backed Contact Request persistence.
- `backend/src/public-marketplace/public-marketplace.routes.ts` — public/Admin routes, serializers, CSRF integration and rate limit.
- `backend/src/public-marketplace/public-marketplace.routes.test.ts` — HTTP route/security/validation tests.
- `backend/src/properties/room-status.ts` — shared effective availability predicate and date helper.
- `backend/src/properties/property-room.repository.ts` — Property/Room listing now consumes the shared status helpers.
- `backend/src/room-images/room-image.repository.ts` — public image delivery consumes the same public eligibility predicate.
- `backend/src/auth/v1.router.ts`, `backend/src/app.ts` — mount and wire the V1 Public Marketplace repository/router.
- `backend/src/middleware/error-handler.ts` — map oversized JSON bodies to a safe HTTP 413 response.
- `backend/package.json` — `test:public-marketplace` command.
- `docs/04_API_SPEC.md` — implementation/current-baseline annotations only; no endpoint or business rule changed.
- `docs/DOCUMENT_CATALOG.md` — catalog this report and mark the prior gap snapshot historical.
- This report.

No frontend, Database V1.4 SQL, Prisma schema, migration, or canonical Requirement file was modified. The database seed was executed only in the disposable runtime database; the seed source was not changed.

## 5. Public Room eligibility

`publicAvailableRoomWhere()` is the shared predicate for public list, public detail, guest Room-targeted Contact Requests, and association-specific public image delivery. It requires:

- active Property;
- `rooms.is_active=true` and `rooms.is_public=true`;
- Room status other than `inactive`;
- no current active Contract whose date range includes UTC start of today;
- no active Room occupancy.

The current Property/Room derived-status helper and the public consumers share the same Contract/occupancy date predicates. A stored `occupied` label alone is not treated as authoritative; the server derives occupancy from live Contract/occupancy relationships. Inactive, private, occupied, or unavailable Rooms return the same generic `404` on detail/contact/image association reads.

## 6. Public list API

Implemented `GET /api/v1/public/rooms` without authentication. Query allowlist is `province,address,price_min,price_max,area_min,area_max,capacity_min,page,page_size,sort`; Property-name search and unknown filters reject with `400 VALIDATION_ERROR`. Text filters are trimmed and case-insensitive. Numeric ranges validate bounds and range order. Pagination follows the canonical 1-based envelope, defaults and 100-row maximum.

Ordering is deterministic: `newest` uses `created_at DESC, room_id ASC`; price/area sorts use the requested value followed by `room_id ASC`. Rows and total use the same Prisma where clause. The query fetches only Property display fields and the first cover association; it does not load Resident/Contract PII or perform N+1 lookups.

## 7. Public detail and image fields

Implemented `GET /api/v1/public/rooms/{room_id}` with the same shared eligibility predicate. Detail selects the safe Room fields, Property `{name, province, address}`, and ordered RoomImage associations `(sort_order ASC, room_image_id ASC)`.

List includes `cover_image` or `null`; detail always includes `images`, including `[]` when no gallery exists. URLs identify the RoomImage association at `/api/v1/public/room-images/{image_id}`. Serializers return decimal-string IDs/rent, fixed two-decimal area, derived `available` status and no storage key/path/private metadata. Public responses use `Cache-Control: no-store`.

If inconsistent gallery data has images but no row marked as cover, list returns `cover_image: null` and detail returns the ordered gallery unchanged; it does not invent a cover. The normal upload/delete service maintains a cover for non-empty galleries, so such a row would require operational repair.

The existing image-content repository now calls the same shared eligibility predicate. Runtime verified that an image on a hidden Room returns 404 even when it references the same physical object key as an eligible Room's own association.

## 8. Contact Request creation

Implemented `POST /api/v1/public/contact-requests`; it requires CSRF/origin protection but no authenticated account. The request body accepts only `room_id` or `property_id` (both are valid only when the Room belongs to the Property), `requester_name`, `phone`, optional `email`, and optional `message`. Unknown fields, account/Owner authority, date/time, and unrecognized fields reject. The server trims and validates inputs and enforces a 2,000-character message maximum.

When a Room is supplied, the repository rechecks its public eligibility inside a serializable transaction and derives the Property. Property-only requests require an active Property. The database stores status `new` and server timestamps. Success is `201` with only `{contact_request_id,status}`; requester PII is not echoed. Hidden/unavailable Room targets and Room/Property mismatches return generic 404.

## 9. Admin lead inbox

Implemented:

- `GET /api/v1/contact-requests` — paginated Owner-scoped list with canonical `property_id`, `status`, and `created_at` filters.
- `GET /api/v1/contact-requests/{contact_request_id}` — Owner-scoped detail.
- `PATCH /api/v1/contact-requests/{contact_request_id}` — only updates `status` to `new`, `contacted`, or `closed`.

Owner ID is read from the Admin session and scoped through Property; clients cannot submit scope. Foreign/missing IDs share the same 404. Requester data is immutable on PATCH. `created_at` accepts `YYYY-MM-DD` and filters that UTC calendar day because the API spec names the filter but does not prescribe timestamp granularity.

## 10. Security, privacy, validation and rate limiting

- Existing V1 `rejectClientAuthority`, CSRF, Auth and Admin guards are reused.
- Guest Contact Request is protected by CSRF and a process-local IP rate limiter using existing `AUTH_LOGIN_MAX_ATTEMPTS` / `AUTH_LOGIN_WINDOW_MINUTES` settings; 429 responses include `Retry-After`.
- JSON over the existing 1 MiB request body limit now receives safe `413 PAYLOAD_TOO_LARGE`; malformed JSON receives the shared validation envelope.
- Full requester phone/email/message values are not logged and are not returned on guest acknowledgement.
- Production debt: the limiter is in memory and resets on process restart; it is not shared across backend replicas. Use deployment-level durable/distributed throttling before production.
- Production image object storage/provider remains unconfigured. This report claims local/development storage/runtime only.

## 11. Automated tests

Public Marketplace HTTP tests: **7/7 PASS**. They cover list query parsing/allowlist and privacy, unsupported Property-name search, public detail and generic 404, anonymous contact and authority injection, Admin session Owner scope/foreign 404/resident denial, CSRF for unsafe routes, oversized JSON, and contact rate limiting.

Required regression suites: **246/246 PASS**.

| Suite | Result |
|---|---:|
| Auth | 20/20 |
| Property/Room | 44/44 |
| Resident/Occupancy | 49/49 |
| Contract + documents | 112/112 |
| Room Images | 21/21 |

Automated tests total: **253/253 PASS** across new and requested regression suites.

## 12. PostgreSQL V1.4 integration and real HTTP smoke

Used a disposable database on PostgreSQL 18.6 at local port 5432. The harness created a uniquely named database, loaded the canonical V1.4 schema and seed, and ran the locked runtime validator before adding synthetic smoke rows. It updated seeded DEV Admin password hashes only inside that disposable database to exercise real authenticated inbox requests. Guest information was synthetic (`DEV Smoke Guest`, test-only `+84999990000`, `DEV/SMOKE only`).

Backend ran as a temporary process on port 4018 pointed only at that database. Runtime checks covered:

- schema and seed load; exactly 27 public tables;
- locked V1.4 runtime validator: **87/87 PASS**;
- `/api/health` and `/api/health/db`;
- public list eligibility for seed Rooms plus private, inactive, occupied-by-occupancy, occupied-by-current-Contract, and paused-Property fixtures;
- province/address/rent/area/capacity combined filters, stable sort and pagination;
- cover image, ordered detail gallery, empty gallery/null cover;
- public image bytes and association-specific 404 for a hidden Room sharing the object key;
- anonymous Contact Request persistence and rejection of an occupied target;
- Admin A inbox/detail and Admin B list/detail isolation.

Database + HTTP smoke result: **22/22 PASS**, including schema/seed, the validator gate and 20 behavior/HTTP checks. The disposable database, temporary backend process, generated local image objects and harness were cleaned up. `Goctro_test3` was not used or changed.

## 13. Typecheck and build

`npm run typecheck --workspace=@goctro/backend` — **FAIL**, 174 existing TypeScript diagnostics. `npm run build --workspace=@goctro/backend` — **FAIL**, same 174 diagnostics. Diagnostics are concentrated in legacy demo Prisma references in `backend/src/app.ts` and a Resident test type mismatch. Targeted filtering reports **0 diagnostics** in `src/public-marketplace/*` or `src/properties/room-status.ts`.

The backend did start and serve real HTTP requests through `tsx` against the disposable V1.4 database. Project-wide build is not claimed as passing.

## 14. Documentation and scope

Updated only implementation/current-baseline status annotations in the canonical API Spec, preserving endpoint definitions, DTO allowlists, validation/business rules and examples. Updated the module catalog; the prior audit remains as a historical snapshot. No Requirement mismatch was discovered that required a Requirement edit.

No frontend was modified. No Database V1.4 schema/Prisma/migration source was modified. No booking, viewing, deposit, payment, source attribution, marketing campaign, or Room amenity behavior was added.

## 15. Definition of Done

| Requirement | Result |
|---|---|
| Public list and detail implemented with shared active/public/available predicate | PASS |
| Inactive Property/private/inactive/occupied Rooms hidden | PASS — PostgreSQL + HTTP |
| Safe cover/image DTOs and association-specific delivery | PASS — PostgreSQL + HTTP |
| Guest Contact Request without account; server derives scope | PASS — PostgreSQL + HTTP |
| Admin inbox/detail/status Owner-scoped | PASS — PostgreSQL + HTTP/tests |
| Validation, CSRF, rate limiting, payload bounds | PASS — automated tests |
| PostgreSQL 18 Database V1.4 runtime validator | PASS — 87/87 |
| Real HTTP smoke against disposable V1.4 DB | PASS — 20/20 behavior checks |
| Requested regressions | PASS — 246/246 |
| Frontend/schema/Prisma/migration changes absent | PASS |
| Project-wide typecheck/build | BLOCKED — 174 existing legacy diagnostics, none in new module |

## 16. Final status and next task

**PUBLIC SALES FUNNEL V1 BACKEND — ✅ RUNTIME VERIFIED FOR LOCAL/DEV V1.4.** This status covers local/development V1.4 runtime. Production-grade durable rate limiting and production image storage remain open deployment work. Backend typecheck/build remain blocked by pre-existing legacy diagnostics.

Recommended next task: **Public Sales Funnel V1 Frontend Implementation** — connect the homepage search, `/rooms`, `/rooms/[id]`, image gallery, contact form and responsive public UI to these APIs.
