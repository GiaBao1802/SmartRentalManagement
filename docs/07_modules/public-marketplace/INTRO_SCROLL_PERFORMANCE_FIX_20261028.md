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

## Startup canvas sequencing follow-up — 2026-10-28

The hero particle canvas previously started its continuous `requestAnimationFrame` loop while the full-screen loader was still drawing its own canvas. The two effects could compete for rendering time on slower devices during the initial transition. The hero loop now waits until the loader hides, then resumes; direct entry without an active loader still starts the hero animation normally. The change is mirrored in `frontend/public/intro/` and `goctro-potadot-preview/`.

Both JavaScript copies pass `node --check`, their hashes match, and `git diff --check` passes. Startup smoothness was not measured in a browser and no FPS/frame-time trace was captured; the change reduces overlapping canvas work but is not a quantified performance guarantee. No content, business/API/database behavior changed.

## Navigation and pointer follow-up — 2026-10-28

The user reported that the green active-menu dot stayed on Home while the hover pill moved elsewhere, and requested removal of the large “Đổi dạng” cursor. The old implementation cached the initial active link and never updated `aria-current` from clicks or scrolling.

- Added mirrored `intro-interactions.js` modules. One selected section now controls the desktop pill, green dot, and mobile `aria-current="location"`. Scroll tracking uses cached section positions with requestAnimationFrame batching; resize/font/layout changes refresh the positions.
- Clicks select the destination immediately while anchor scrolling completes. Wheel/touch/scroll-key input releases that temporary destination lock. Hover/focus no longer moves the selected pill away from its dot.
- The header stays visible while its controls have keyboard focus. Mobile anchors resume Lenis before requesting a scroll, then close the menu.
- Removed creation of the large cursor/label and colored trailing dots. Only one 8px green pointer dot remains; the hero no longer advertises a “Đổi dạng” cursor label. Hero particle interaction is retained.
- A reload at an existing middle-of-page scroll position exposed a ScrollTrigger initialization error caused by removing once-only triggers during construction. Reveal effects now use an `is-revealed` guard and clip timelines retain explicit no-reverse toggle actions without deleting those triggers. The first-appearance-only behavior is preserved. Navigation/pointer initialize before decorative effects.

Verification: desktop clicks for Home/Gallery/Features/Projects/Contact, Enter-key navigation, manual-scroll selection, 390×844 mobile menu closure/section navigation, and direct `#features` page load passed. A fresh direct-link tab recorded zero JavaScript errors, exactly one pill and one pointer dot, and no large cursor or trails. Initial masks/reveals remain visible after upward scrolling. Temporary viewport override was reset. Screenshots are ignored local evidence under `.local/intro-nav-fix/`.

Both static copies pass JavaScript/CSS parsing and mirror checks; third-party bundled code is unchanged. Seven unrelated Admin/Resident files remain byte-identical to the pre-handoff backup. No backend/API/database/environment or primary Exact Next Task change. Browser evidence above records local validation before the authorized Git synchronization.

## Navigation/startup synchronization — 2026-10-28

The user authorized publishing the navigation/pointer changes and pulling the latest project. Upstream `c54b744` startup canvas sequencing and PowerShell port checks are retained. The loader completion listener is attached to `window`, matching the upstream event dispatch target, so the hero loop can resume after loading. No business/API/database migration or environment change is part of this synchronization.

Combined-source verification: frontend typecheck, JavaScript/CSS parsing, four-file mirror checks, and syntax parsing of both upstream PowerShell files pass. The PowerShell scripts were not executed. A fresh browser load completed with one selected-menu pill, one small pointer dot and no large cursor/trails; clicking Features selected the correct item and settled its section at approximately 90px below the viewport top. No JavaScript errors were recorded. Canvas frame-time/FPS was not measured; an additional screenshot attempt was unavailable, so no visual frame-comparison claim is made. Seven excluded Admin/Resident files were restored byte for byte from the verified backup before publication.
