# Public Sales 3D prototype

Date: 2026-10-15. Status: CURRENT — scene-based explorer is now the active public listing at `/rooms`; `/public-sales` remains available as the preview route. Earlier iteration evidence is retained below as history.

## Public listing route integration — 2026-10-15

User authorized replacing the existing `/rooms` public listing with the reviewed map interface. `frontend/src/app/rooms/page.tsx` now renders the shared Explorer and imports its scoped stylesheet; the old `room-listing.tsx` source is retained but no longer called by that route. `/` continues to render `home-page.tsx`; `/rooms/[roomId]`, gallery, public contact form, image delivery, backend and database contracts are unchanged. Existing public navigation already points at `/rooms`, so no duplicate navigation layer or redirect is required.

Incoming `/rooms?...` links retain the page's existing parameter parsing, page size and sort allowlist. Explorer receives these initial filters and uses the existing `/public/rooms` API for that incoming search, preserving partial/old province strings and nationwide searches without guessing a geographic code. It immediately opens the matching results drawer and allows editing the same filters; native URL replacement keeps this incoming search's filter/pagination state reloadable. Selecting a mapped province exits incoming-search mode, clears the old query and uses the existing stable-code explorer API. No arbitrary province is highlighted for a nationwide or partially matched search. Price and area sorting are both represented; demo area sorting was aligned with the exposed options.

Route integration verification: direct `/rooms` renders the map; select Đà Nẵng → Apply returns its public room and detail navigation reaches `/rooms/202`. The actual homepage search form for Đồng Nai navigates to `/rooms?...province=Đồng+Nai` with page size 12 and returns the public B101 record; a subsequent 1,000,000 VND maximum produces zero **filtered** results and updates the URL. Camera tests were rerun **3/3 PASS**; earlier API regression evidence remains applicable because backend contracts are unchanged. A transient development hot-reload hydration mismatch during the component signature change was corrected by reloading the updated bundle; a fresh browser tab then loaded the query URL with **no console errors**. Optimized frontend build and its TypeScript check **PASS**; Windows sandbox initially denied an output directory for `/login`, and the permitted host-filesystem retry succeeded (`.local/public-sales-rooms-route-build-final.log`). [Active route screenshot](screenshots/public-sales-rooms-route.jpg). No schema/migration or backend change was made in this route-integration pass.

## Scene interface revision — WareTrack references

This continuation changes only the isolated prototype frontend and this scoped documentation. It preserves the working tree's existing backend additions, public DTO, province aliases, pagination/filter contract, PostgreSQL schema, geographic source/license and other public/contact routes. No backend change, migration or fixture seed was needed in this revision.

The large introduction and two-column card workspace are replaced by a fixed `100dvh` shell: compact header, full-scene R3F canvas, upper-left inventory cards, dismissible upper-right guide/province inspector, independent left filter/list panel, edge camera controls and a collapsible horizontal result drawer. Desktop page scroll height was measured as 900px at a 900px viewport. Long panel content scrolls internally. Mobile at 390×844 uses bottom sheets; filters retain a visible scene above them, and information/counts appear in the result sheet's heading. Camera controls remain reachable with the drawer open. Body text and filter controls are larger; blue interactions, pale blue-gray ground, white panels and soft shadows follow the reference organization without adding warehouse objects or fabricated property markers.

### Camera and interaction changes

- Geometry remains on XY with extrusion along Z. The orthographic camera is explicitly Z-up; controls synchronize that up-vector and restrict polar angle, azimuth, zoom and target pan to a geographic bounding box.
- `scene-math.ts` calculates province bounding boxes from the largest polygon **by area**, not mean vertices or vertex count. The default fit prioritizes the main polygon; the extent button includes every original island component. All geography remains rendered and unchanged.
- `ResizeObserver` measures actual DOM overlays and supplies safe-area insets for the fitted camera. World target offsets place the selected region in this visible rectangle. New commands stop and replace the current transition. Deselecting on blank canvas stops movement without returning to the overview; only the explicit overview action resets state/view.
- Tooltips use the actual ray-hit point; they no longer assume a vertex average is inside the province. Missing statistics are displayed as unknown, not zero. Hover uses a lighter shade/cursor/tooltip; selection uses blue extrusion and a small lift.
- A six-pixel accumulated pointer-motion threshold rejects drag releases, including a drag that returns to its start. Panels are DOM siblings outside the canvas event surface; statistic cards also absorb pointer input. Clicking a result highlights that card and refocuses the province, with an explicit province-only location label.
- `prefers-reduced-motion` disables CSS animation/transitions and Three.js lift/camera transitions. Focus uses the existing `useDialogFocus` helper; Escape closes the active filter/list/drawer, retaining the selected province when the filter closes. Native modal preview retains its focus behavior.

### Data and user language

API adapters, demonstration records, public image delivery, existing room cards and detail links are retained. Manual demo mode is still separate and opt-in. The UI now says “Tin đang đăng” / “Dữ liệu minh họa”; database, ORM and endpoint terminology stay in developer documentation. Unknown adoption/type/coordinate metrics are not converted to zero. Whole-province public totals and filtered result counts remain separately labeled. A public province with zero eligible rooms is not described as having zero participating properties.

### Verification performed in this revision

- Frontend `npm run typecheck --workspace=@goctro/frontend`: PASS. Final optimized `npm run build --workspace=@goctro/frontend`: PASS, including `/public-sales`. Build log: `.local/public-sales-scene-build-final.log`.
- New camera tests: **3/3 PASS** via `npx tsx --test frontend/src/app/public-sales/scene-math.test.ts`. They project all 34 selected main-polygon bounds through an actual Z-up Three.js orthographic camera and verify containment within desktop/mobile safe rectangles; they also check remote-island extent separation and returned-to-start drag rejection.
- Read-only live PostgreSQL/API tests: **2/2 PASS**; all 34 province room totals match the unfiltered listing, and DTO/filter/pagination validation remains intact. Existing Public Marketplace HTTP regression: **7/7 PASS**. These tests do not seed the populated database.
- Backend typecheck was rerun: **174 existing diagnostics**, none in `explorer`/`public-marketplace`; it is not a clean whole-backend build.
- Desktop **1440×900**: overview renders; dragging over a province does not select; a real click on Đà Nẵng opens the inspector/filter; the selected region is visible between panels. Close/reopen filter retains province. Restrictive price returns zero filtered results while the province total remains one; reset restores the room. Result selection highlights the card/refocuses its province; sort changes; live detail opens `/rooms/202`. Blank-canvas click clears selection/panels while visibly retaining the zoomed geographic view. Clicking the statistic card does not select underlying geometry. Overview and full-extent actions were exercised.
- Mobile **390×844**: search/Enter selects Hồ Chí Minh; filter receives focus; Escape closes it while retaining province. Demo results sort by descending rent, page size 1 produces two pages, next page changes M102 (4.5m) to M101 (3.2m), and preview opens/closes. Hà Nội live zero-inventory state displays the correct public-data limitation.
- **API outage was injected and recovered**: only the verified local backend/watcher started during this session was temporarily stopped; PostgreSQL/frontend remained running. Reload, province selection and Apply showed unknown counts/“Chưa tải được kết quả”, without false zero inventory or automatic demo activation. Standard `npm run dev:all` restored the backend and reused the healthy frontend/database; Retry restored the real data. Expected refused-network messages belong to this intentional outage test.
- Console inspection during the normal live flow showed no application/map exceptions. Existing R3F/Three.js `THREE.Clock` deprecation warning remains; the Node test runner additionally reports Three's CommonJS deprecation.

### Evidence and remaining limits

Current screenshots (explicit viewport capture, rather than the narrower app panel):

- [Overview, 1440×900](screenshots/public-sales-scene-overview.jpg)
- [Selected province and filter, 1440×900](screenshots/public-sales-scene-selected.jpg)
- [Expanded results, 1440×900](screenshots/public-sales-scene-results.jpg)
- [Mobile filter, 390×844](screenshots/public-sales-scene-mobile.jpg)
- [Mobile results/pagination](screenshots/public-sales-scene-mobile-results.jpg)
- [Intentional API outage](screenshots/public-sales-scene-api-error.jpg)

Forced hardware/WebGL-context loss was **not** injected: the available browser capabilities expose viewport/visibility, not GPU failure control. The error boundary, context-loss listener, list/search/filter UI independence and fallback messaging are implemented, but this is not a claim of a forced-GPU browser PASS. Hover logic and reduced-motion branches are implemented; stationary mouse-hover capture and an OS reduced-motion toggle were not separately exercised by the available controller. Low-end-device profiling, independent geographic accuracy/upstream-rights certification and public adoption/type/coordinate contracts remain outside this revision. No new geographic accuracy claim is made.

Exact next scoped task: review the scene composition and panel behavior in `/public-sales`, then decide any follow-up camera/performance or additional public-data scope. The repository's primary Parking/Billing task remains unchanged.

## Run and entry point

From `D:\codexapp\SmartRentalManagement`, run `npm run dev` with the existing backend `.env`/PostgreSQL configuration. Open http://localhost:3000/rooms for the active public listing, or http://localhost:3000/public-sales for the retained preview. Homepage `/`, `/rooms/[roomId]` and contact workflow are preserved. No migration, seed or parallel schema was introduced.

Primary files:

- `frontend/src/app/public-sales/page.tsx`, `explorer.tsx`, `explorer.css`: route, HTML overlays, React state, responsive bottom panel.
- `frontend/src/app/public-sales/vietnam-map.tsx`: R3F extruded geographic polygons, Drei camera, hover tooltip, selection, zoom/reset, WebGL error boundary.
- `frontend/src/app/public-sales/explorer-data.ts`: API client and explicitly separate optional demo adapter.
- `backend/src/public-marketplace/explorer.routes.ts`: read-only Express/Prisma API.
- `backend/src/public-marketplace/explorer-provinces.ts`: stable two-character codes, current names, explicit old-name aliases; unknown values remain unmapped.
- `backend/src/public-marketplace/explorer.test.ts`: mapping and opt-in read-only live API tests.

## Source inspection and scope

Reviewed repository/root frontend AGENTS, documentation rules/current state/catalog, canonical Requirement §4, API §5.3, Database changelog/V1.8 schema, public marketplace repository/router/validation, room availability predicate, public API client, homepage, card and detail routes. The existing public sales funnel targets guests finding available public Rooms and sending persisted contact requests. Current application is Next.js 16/React 19 + Express + Prisma/PostgreSQL. Existing brand/logos and PublicRoomCard/public image proxy/detail links are reused. Added Three.js, React Three Fiber and Drei in the existing frontend workspace.

New API contract is documented additively in canonical API §5.3. It returns only public inventory aggregates and existing public Room DTOs. Existing repository gained an internal exact province-name list for merged aliases; existing route behavior is unchanged. Public Room serializer is reused. No owner/account/resident/contract/manager fields are exposed.

## Geography and provenance

The static FeatureCollection combines 34 **post-merger source province files**, not a 63-province map with renamed labels. Source: https://github.com/thanglequoc/vietnamese-provinces-database at commit `8b78ba5118715e1fa81769286724db79346abf52`, retrieved 2026-10-15. `frontend/public/maps/source.json` lists every original file; `LICENSE.txt` preserves the repository MIT license. The source README identifies its GIS origin as the Vietnam Administrative Units Reference Map at https://sapnhap.bando.com.vn/ by the Vietnam Natural Resources, Environment and Cartography Publishing House. The community repository distributes the dataset under MIT, as-is. This is not an independent legal/cartographic certification of upstream rights or boundaries.

All 34 distinct codes were checked against the API catalog; the input has 92,875 coordinate positions, WGS84 longitude/latitude bounds approximately 102.14–117.83 / 7.18–23.39. Original polygon rings, holes and island components are retained without inventing boundaries, moving islands into insets, or substituting random shapes. Rendering uses a simple longitude cosine correction around Vietnam; it is a visual prototype, not a survey projection. Source accuracy/topology and completeness of each island/archipelago have not been independently audited. The UI discloses this limitation.

Geography and business data are separate. Known historical merged province names are normalized through explicit aliases; unknown names are excluded from mapped totals and counted in `unmapped_rooms`. No fake property coordinates or precise markers exist. Cards can refocus the selected province only; this is labeled as an aggregate province view.

## Live and demonstration data

Default mode: React → Express `/api/v1/public/explorer` + `/rooms` → existing Prisma PostgreSQL connection. Database health and full read flow passed. Snapshot during final smoke: three eligible Rooms in three Properties across Đồng Nai, Hồ Chí Minh and Đà Nẵng; zero unmapped Rooms. Existing local development rows themselves contain synthetic/sample content; connection is real, not evidence of production business inventory. Counts may change as the local database changes.

Manual “Xem minh họa” selects five explicitly fictional Room DTOs in four provinces, with null images and preview modal. It never masks API errors or writes to PostgreSQL. Live cards use real public image associations when present, otherwise the existing honest no-image placeholder; no fabricated photographs.

Only supported filters exist: address substring, integer VND range, area range, capacity minimum, sort and pagination. Header searches the 34 province names; address search is in the filter. Property/room-name global search is not implemented because the current public API explicitly disallows Property-name search. There is no supported ward hierarchy, property type, amenities or coordinates. Availability is always server-enforced; there is no switch that exposes private/occupied rooms.

Total platform adoption, boarding/apartment breakdown and the difference between no participating property versus participating properties without vacancies cannot be inferred from authorized public data. UI marks these unknown, while distinguishing whole-province public totals from filtered Room results. Zero-public-inventory and filter-empty are separate states; no unsupported system-adoption claim is made.

## First iteration verification (historical evidence)

- Frontend typecheck and optimized Next.js production build PASS, including `/public-sales`.
- Existing public marketplace HTTP regression: 7/7 PASS (required local socket access outside sandbox).
- New mapping + opt-in live PostgreSQL/API tests: 2/2 PASS. All 34 province totals equal unfiltered API counts; public DTO allowlist, price filtering, page size and invalid-code/range/query rejection verified. Command: PowerShell `$env:EXPLORER_LIVE_TEST='1'; npx tsx --test backend/src/public-marketplace/explorer.test.ts`.
- Backend full typecheck still has 174 pre-existing legacy diagnostics; none in explorer/public-marketplace files. Do not claim whole-backend build is clean.
- Browser: real canvas click on Đà Nẵng selects/highlights polygon and opens province statistics/filter; province search selects Đồng Nai; restrictive price produces zero results while province total stays one; reset restores one result; closing/reopening filter retains selection; live detail link opens `/rooms/202`.
- Responsive desktop 1440×1000 and mobile 390×844 verified with browser viewport capability; screenshots are in `screenshots/`. Native WebGL fallback list/error boundary implemented; forced hardware/context failure and API outage were not injected into the live server.
- Browser console had no application errors during the scoped smoke; Three.js emits a dependency deprecation warning for `THREE.Clock` used by R3F. It does not stop rendering.

## Remaining scope / exact next task

Review the prototype's desktop/mobile interactions and decide whether to authorize a public Property-type/adoption contract before extending these metrics. Production map accuracy/licensing review, performance profiling on low-end devices and full failure injection remain separate follow-ups. This scoped prototype does not change the project's primary Parking/Billing next task.
