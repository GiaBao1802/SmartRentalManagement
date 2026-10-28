# Intro scroll performance correction

Date: 2026-10-28

Status: CURRENT — IMPLEMENTED; DESKTOP BROWSER CHECKS PASS; FPS NOT MEASURED

## Scope and sources

The user authorized fixing the intro page's sluggish scrolling. Reviewed repository working rules, Documentation Rules, Current State, Document Catalog, Requirement section 4, frontend working rules, the installed Next.js public-folder guide, and the actual intro HTML/CSS/JavaScript. Both `frontend/public/intro/` and `goctro-potadot-preview/` contain the same static page. Existing uncommitted logo/layout and portal changes were preserved.

## Findings and changes

- Lenis intercepted wheel input with `smoothWheel: true` and `lerp: .095`. Wheel input now uses native scrolling (`smoothWheel: false`). Lenis remains available for existing anchor/menu/back-to-top behavior and page transitions.
- Gallery cards and images had CSS `transform` transitions while GSAP also wrote `transform` for reveal/zoom animations. Hover now uses independent CSS `translate` on cards and `scale` on images, leaving `transform` to GSAP.
- Reveal batches run once and no longer hide previously revealed content when scrolling back. Image clipping timelines run once with explicit `toggleActions: "play none none none"`, overriding the bundle's global reverse default. The first appearance and hero particle effect remain.
- Disabled the oversized animated SVG-noise `body::after` layer and redundant backdrop blur on almost-opaque gallery labels. Layout, images, text, navigation and the existing end-of-page redirect are unchanged.
- Applied identical CSS/JavaScript changes to the intro and preview. Bundled third-party code before the application initializer was verified unchanged.

## Validation

- Both JavaScript files pass `node --check` and TypeScript parser syntax inspection; both stylesheets pass PostCSS parsing.
- Intro/preview HTML, CSS and JavaScript match byte for byte. `git diff --check` passes.
- The running `http://localhost:3000/intro/index.html` was loaded/reloaded in the in-app browser at its default 1280 × 720 viewport, DPR 1.25.
- Computed styles confirm no noise pseudo-element/animation, no gallery-label backdrop blur, card transitions on `translate`/shadow, and image transitions on `scale`.
- Scrolling into the gallery, then back to the top, leaves the first four revealed cards at opacity 1 and their completed masks at `inset(0% round 28px)`; effects do not reverse when leaving upward.
- The header gallery anchor navigates to the gallery using the retained in-page scrolling flow.
- Local screenshot evidence is ignored: `.local/intro-scroll-fix/desktop-gallery.png`.

## Limits and documentation impact

No FPS, frame-time or GPU trace was captured; this is not a quantified speedup or a guarantee for every device. Mobile, reduced-motion and the preview's separate runtime were not independently exercised. No production build was required for these static public assets; no backend/database/integration tests or mutations ran.

No business rule, API contract, schema, environment or database changed. The main project module and Exact Next Task remain unchanged. This closes the requested source correction and desktop behavior check; wider device/performance measurement remains separate.

## Scoped Git handoff review — 2026-10-28

The user subsequently authorized publishing the intro adjustments. The reviewed runtime scope also includes the existing header/footer logo styling, hero spacing and scroll-hint positioning/fade, and asynchronous decoding on gallery/project/lightbox images. Both static copies remain identical. No text, image source, API, permission or database behavior was changed by this handoff.

The publish set is six static files (`index.html`, `assets/css/app.css`, `assets/js/app.js` under each intro copy), this report, and its Current State/Catalog entries. Seven unrelated Admin/Resident source/test edits are excluded and preserved locally. Remote `main` was two commits ahead at `0e40970`; those Cloudy changes are retained when integrating this scoped commit. A local ignored backup captures all pre-handoff edits before Git operations. This records the reviewed scope; push completion is verified separately against the remote commit ID.
