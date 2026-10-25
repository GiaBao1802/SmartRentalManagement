# SmartRentalManagement — Cloudy Mascot Integration Report

## Status

HISTORICAL — The 3D Cloudy integration was removed from the current application on 2026-10-25. The implementation and verification below describe the earlier state only.

## Date and scope

- Date: 2026-10-25
- Scope: mount the existing Cloudy GLB in the shared frontend layout.
- Source asset: `frontend/public/mascot/cloudy/cloudy.glb`
- No Blender, animation, backend, API, database, setup, or deployment changes.

## Implementation

- Added `src/app/components/cloudy-mascot.tsx` as the route/auth gate and accessible floating wrapper.
- Added `src/app/components/cloudy-mascot-scene.tsx` using the existing React Three Fiber, Drei, and Three.js dependencies.
- Mounted the component once from `src/app/layout.tsx`, so navigation does not create one Canvas per page.
- Added shared mascot CSS to `src/app/globals.css`.
- Measured both clips with an isolated mixer before rendering the model, then applied the Idle pose through the runtime mixer. This prevents the bounds scan from stopping the visible Idle action and avoids an exposed rest/T-pose.
- Added mouse/touch pointer capture drag, viewport and safe-area clamping, session-only position persistence, reset control, a small velocity tilt, and a distinct click threshold. The transparent Canvas no longer captures map input outside the smaller mascot hit area.
- When Explorer results leave too little room, the default mascot moves above the panel; at 320px it becomes a small opener between the stats and results instead of covering filter controls.
- Admin and Resident mobile use the same small opener near the top of the page so the floating model does not cover forms by default. The user can open the model and drag it to a preferred position.

### Route rule

Cloudy is eligible on `/`, `/landing`, `/rooms`, `/rooms/:roomId`, `/tenant`, `/tenant/*`, `/admin`, and `/admin/*`. It is not rendered on login, forgot/reset password, invitation acceptance, dev routes, API routes, or not-found routes. Private routes also wait for an authenticated session before mounting.

### Runtime behavior

- Loads `/mascot/cloudy/cloudy.glb` client-only through `useGLTF`; the page does not wait for the asset.
- Uses `Cloud_Idle` by default and explicit click/touch/keyboard activation for `Cloud_Wave`.
- Uses the mixer `finished` event to return to Idle; repeated activation does not accumulate listeners.
- Samples skinned bounds across Idle and Wave, then fits camera to both width and height with Canvas aspect and depth margin, without orbit or zoom controls.
- Supports reduced motion, tab visibility pause through the render loop, session-only collapsed and position state, safe-area offsets, keyboard focus, and a retryable fallback on asset/WebGL failure.
- Unmounts the Canvas when collapsed or when the route is not eligible; shared GLTF cache is not disposed.

## Verification

- `npm run typecheck`: PASS on 2026-10-25 after the transparent-hit-area and mobile role placement changes.
- `npm run build`: PASS on 2026-10-25 after the transparent-hit-area and mobile role placement changes.
- `npm run test:api`: PASS, 76/76 tests.
- Asset source/destination hash verification from the previous asset handoff: PASS.
- Public Explorer desktop at 1310×927: one wrapper/Canvas, full Idle pose without clipping, Wave pose and return to Idle, map controls separated by about 17px, no page overflow. The unauthenticated browser console showed only `/api/v1/auth/me` 401 errors, no Cloudy exception. Mouse drag moved and stored the position; transparent Canvas corner hit testing reached the page while the central mascot hit area stayed interactive.
- Mobile 390×844: full character visible and touch drag moved/stored the position. Expanded results used a smaller mascot clear of the map controls. At 320×700 the 24px opener fit the narrow gap between stats and results; the Canvas was unmounted while compacted.
- A mouse drag on `/landing` moved the mascot from `(852, 532)` to `(772, 467)`; `/rooms` and collapse/reopen retained `(772, 467)`, with zero mascot Canvas while collapsed. Resizing from 1200×800 to 390×660 clamped the stored position inside the viewport with no horizontal overflow.
- Reduced motion browser test: two Idle screenshots matched, Wave differed, then final Idle matched the original pose. A blocked GLB request produced the fallback; `Thử lại` loaded one Canvas after the request was restored.
- A synthetic visibility-change browser check counted WebGL draw calls: 13 before the hidden interval, 13 after 650ms hidden, then 35 after showing again. This supports pause/resume behavior; a real background-tab lifecycle was not observed.
- Landing/list/detail had the shared mascot; Login and dev had none. The user signed into the in-app browser. Admin `/admin/properties` at a mobile viewport had one Cloudy Canvas with no console error. After enabling the small default opener, it had one opener and no Canvas until opened. Resident `/tenant` behaved the same; opening showed one Canvas and no console error. Navigation to `/tenant/amenities` retained one mascot/opener and no Canvas duplicate. Desktop Admin/Resident visual review and first-frame video capture remain **NOT VERIFIED**.

## Out of scope

No chat, AI/backend request, input box, fake response, layout redesign, map Canvas modification, dependency installation, database write, commit, push, or deploy was performed.
