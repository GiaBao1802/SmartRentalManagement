# Góc Trọ — Public Sales Funnel V1 Frontend Implementation Report

- Date: 2026-10-11
- Status: **IMPLEMENTED — LOCAL/DEV END-TO-END PARTIAL**
- Scope: public homepage, search/list/detail/gallery, guest contact, and Admin Contact Request inbox frontend.
- Excluded: booking/viewing/deposit/payment, backend and Database/Prisma V1.4 changes.

## 1. Executive summary

Implemented the public search funnel and Owner-facing contact inbox using the V1 API DTOs. The local browser rendered five real Rooms, verified filtering, sorting, pagination, detail, a real image, no-image placeholder, unavailable-room state, and a successful guest contact submission. Typecheck, 19 frontend tests, production build and the four requested backend regression suites passed.

The image endpoint returns `Cross-Origin-Resource-Policy: same-origin`; direct browser embedding from the frontend on port 3000 to the backend on port 4000 was blocked. Added a narrow same-origin Next.js image proxy, which fixed card and gallery image rendering without backend changes.

The contact record was saved in `Goctro_test3` as ID `9203`, status `new`, Room `248`, Property `25`, Owner `1`. The browser had no Admin session and redirected the inbox to login, so Admin list/detail/status E2E and Owner-visible verification remain incomplete. Room availability transition checks and 768/1440 viewport checks also remain unverified. The module is therefore **not E2E complete**.

## 2. Existing frontend audit

The public pages previously lacked the complete V1 funnel. Reused the current App Router, API client, brand tokens/assets and Admin shell. Backend and canonical Requirement/API contracts were read before implementation.

## 3. Files changed

- `frontend/src/app/home-page.tsx`
- `frontend/src/app/public-room-card.tsx`
- `frontend/src/app/rooms/page.tsx`
- `frontend/src/app/rooms/room-listing.tsx`
- `frontend/src/app/rooms/[roomId]/page.tsx`
- `frontend/src/app/rooms/[roomId]/public-room-detail.tsx`
- `frontend/src/app/rooms/[roomId]/public-room-gallery.tsx`
- `frontend/src/app/rooms/[roomId]/public-contact-form.tsx`
- `frontend/src/app/api/public/room-images/[imageId]/route.ts`
- `frontend/src/app/admin/contact-requests/page.tsx`
- `frontend/src/app/admin/contact-requests/contact-request-inbox.tsx`
- `frontend/src/app/components/admin-shell.tsx`
- `frontend/src/app/globals.css`
- `frontend/src/lib/api/publicRoomApi.ts`
- `frontend/src/lib/api/apiClient.test.ts`
- `frontend/src/lib/publicContact.ts`
- `frontend/src/lib/singleFlight.ts`
- `docs/DOCUMENT_CATALOG.md`
- This report.

No backend, database, Prisma, migration, seed, or canonical Requirement/API Spec file was modified. The contact smoke test intentionally created one synthetic local DEV record (ID `9203`); it was not deleted.

## 4. Public design direction

Used the existing Góc Trọ brand assets and green/orange/warm-neutral palette. The public pages use a lighter hierarchy than Admin, without fabricated testimonials, ratings, amenities, promotions, or listings.

## 5. Homepage

The homepage has the logo, public navigation, secondary Admin login, search hero, real API Room preview, value section and footer. Browser smoke displayed five actual backend listings, including real cover photos where present.

## 6. Room list

`/rooms` fetches the V1 public list and displays backend results, loading/error/empty states and retry behavior. No client-side filtering of a full inventory is used.

## 7. Search, filters, sort and pagination

Only canonical query fields are serialized: province, address, rent/area limits, capacity, supported sort, page and page size. Search navigation and clear filters were exercised in browser. Province/address search produced backend results; sort `price_asc` ordered the three matching results by rent. With page size 2, the browser showed 5 total Rooms across 3 pages and moved from page 1 to page 2 while retaining page size and sort. Filter state is reflected in the URL.

## 8. Room cards

Cards use the public allowlist: Property/Room labels, province/address, rent, area, capacity and availability context. They show real cover photos or a branded placeholder; no private fields or storage keys are rendered.

## 9. Room detail

`/rooms/[roomId]` loads the public detail API, renders Room/Property facts and the public description, and offers a contact form. A very large string Room ID was covered by frontend unit tests without numeric coercion.

## 10. Gallery

Detail uses API-ordered `images[]`, selected cover, thumbnails, and branded no-image/broken-image states. Browser initially exposed that the API image response has `Cross-Origin-Resource-Policy: same-origin`, which blocked cross-port embedding. The frontend now proxies only numeric public image IDs through `/api/public/room-images/[imageId]`, validates upstream image content type, and returns only safe image headers. The proxy returned HTTP 200 with `image/png`; browser then rendered the Room image. No backend change was made.

## 11. Guest contact form

The form sends only `room_id`, requester name, phone, and optional email/message. It does not send Owner, Property, account, status, booking or appointment fields. It works without an account and blocks duplicate submissions while a request is pending.

## 12. Guest CSRF

Reused the existing API client's anonymous CSRF bootstrap, cookie credentials and `X-CSRF-Token`. Unit tests verify the CSRF request and canonical guest POST; the local browser POST also succeeded without login.

## 13. Contact success and error UX

Added concise success confirmation, required-field validation, generic server failure, rate-limit and unavailable-Room messages. A synthetic local submission showed success; SQL read-only verification found ID `9203`, status `new`, linked to Room `248`, Property `25`, Owner `1`.

## 14. Admin lead inbox frontend

Added the minimal Admin navigation entry “Khách quan tâm”, plus list/detail/status UI using the supported list/detail/PATCH helpers and status labels “Mới”, “Đã liên hệ”, “Đã đóng”. Browser smoke could not enter the inbox because the session was logged out and was redirected to `/login`; UI runtime behavior behind Admin authentication is not verified.

## 15. Responsive behavior

Responsive CSS rules cover public card/list/detail layouts and stack the detail/contact content at the mobile breakpoint. Browser screenshot verification was available at approximately 360 CSS pixels and showed a single-column detail, usable contact form and no obvious horizontal overflow. The current browser control surface does not expose viewport overrides, so the requested 390, 768 and 1440 widths were not all independently set and checked.

## 16. Accessibility

Used semantic headings, labelled form fields, named buttons/links, image alt text, status/error announcements and visible focus styling. Browser accessibility trees exposed named form controls and image alternatives. Keyboard-only end-to-end interaction was not separately audited.

## 17. Frontend tests, typecheck and build

- `npm run typecheck --workspace=@goctro/frontend`: PASS.
- `npm run test:api --workspace=@goctro/frontend`: PASS, 19/19.
- `npm run build --workspace=@goctro/frontend`: PASS; includes `/rooms`, `/rooms/[roomId]`, `/admin/contact-requests`, and `/api/public/room-images/[imageId]`.
- An initial sandbox build was blocked by Windows workspace path canonicalization (`EACCES`); the same build completed successfully with the permitted workspace access.

## 18. Backend regression suites

All requested suites passed in this pass; loopback test-server creation required running the commands outside the restricted sandbox:

- Public Marketplace: 7/7.
- Room Images: 21/21.
- Property/Room: 44/44.
- Auth: 20/20.
- Total: 92/92.

Backend source was not changed.

## 19. Browser E2E

- Homepage rendered five API Rooms; search CTA navigated with canonical query fields.
- List rendered real results; filter clear restored all five, and pagination moved to page 2 of 3.
- Detail Room `248` displayed the API fields and, after the same-origin proxy fix, a real image.
- Invalid Room ID rendered the generic unavailable state.
- No-image Rooms rendered the branded placeholder.
- Guest Contact Request succeeded without login.
- Admin inbox redirected to login because no Admin session was present.

## 20. Visibility checks

The public list returned five available public Rooms. An unknown detail ID returned the generic unavailable UI. E2E transitions of a safe Room from public to private and occupied, then restoration through the normal lifecycle, were not run because an authenticated Admin workflow/session was unavailable. Backend regression coverage passed but does not substitute for these browser state transitions.

## 21. Contact E2E

Guest submission and local persistence passed. The resulting record is scoped to Owner `1` through Property `25`. Admin inbox visibility, detail, PATCH to `contacted`, refresh persistence and cross-Owner non-visibility were **not verified** because the browser had no authenticated Admin session. No password was reset or guessed.

## 22. Bugs found and fixed

The backend's same-origin resource policy blocked public photos embedded from the separate frontend origin. Added an ID-allowlisted frontend image proxy. After the change, the proxy returned the real PNG and both the detail gallery and homepage cards exposed loaded images in the browser. No API contract or backend behavior changed.

## 23. Known limitations

- Admin login session unavailable for inbox E2E.
- Private/occupied Room visibility transition and safe restoration not exercised.
- Independent browser checks at 390/768/1440 were unavailable; only the current approximately 360px viewport was visually inspected.
- The local synthetic contact record `9203` remains in Goctro_test3 with status `new` for follow-up inbox verification.

## 24. Definition of Done

- [x] Homepage, search, `/rooms`, `/rooms/[roomId]`, gallery and guest contact UI implemented.
- [x] Backend-driven canonical filters, supported sort and paginated URL state.
- [x] Real public images, same-origin proxy and no-image/broken-image placeholders.
- [x] Guest CSRF, success/error states and duplicate-submit protection.
- [x] Admin inbox route/navigation/list/detail/status UI implemented.
- [x] Frontend typecheck, tests and production build pass.
- [x] Requested backend regressions pass 92/92.
- [x] Browser public funnel and guest contact smoke pass; record persistence is confirmed.
- [ ] Admin inbox Contact E2E and Owner visibility/PATCH persistence.
- [ ] Public/private/occupied lifecycle visibility transitions and safe restoration.
- [ ] Independent responsive browser verification at 390, 768 and 1440.

## 25. Final module status

**PUBLIC SALES FUNNEL V1 — IMPLEMENTED, LOCAL/DEV E2E PARTIAL.** Do not mark end-to-end complete until the three unchecked runtime/browser gates above are verified.

## 26. Recommended next task

Complete the remaining Public Sales Funnel V1 local browser closure: sign in as the correct Admin, verify Owner-scoped lead list/detail/status persistence and non-visibility, run safe public/private/occupied Room transitions with restoration, and capture 390/768/1440 layouts. Do not start Contract until these required gates are closed.
