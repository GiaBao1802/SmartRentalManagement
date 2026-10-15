# Góc Trọ — Public Sales Funnel Responsive + UX Audit & Fix Report

- Date: 2026-10-12
- Status: **FIXED — AVAILABLE HOST-BROWSER CHECKS PASS; FULL VIEWPORT MATRIX PENDING**
- Scope: public homepage, room listing/detail, image gallery, and contact panel layout.
- Excluded: backend/API contract, database, business logic, Admin redesign, and new features.

## 1. Root cause

`frontend/src/app/globals.css` set `.public-contact-panel` to `position: sticky; top: 96px`. The detail page renders the panel beside `.public-detail-main`, whose height includes the gallery and all room details. The panel consequently followed the page scroll for most of the long grid row and appeared to float beside unrelated content. At tablet widths the layout also kept a 310px contact column until the 650px mobile breakpoint, leaving too little width for room details at 768px.

## 2. Sticky, fixed, overflow, height, and viewport audit

- **Contact panel:** sticky positioning and its mobile-only static override were removed. The panel now follows normal document flow at every width.
- **Public header:** remains sticky at the top as intentional site navigation. Secondary links are hidden at tablet widths (900px and below) and on mobile; logo and primary actions remain visible.
- **Gallery thumbnails:** retain a horizontally scrollable thumbnail strip; this is local to the gallery and does not require page-level horizontal scrolling.
- **Gallery image:** uses a responsive aspect ratio, bounded height, and `object-fit: cover`; mobile changes the ratio to 4:3. Empty/broken image state no longer reserves the old fixed 410px height.
- **Room listing cards and loading placeholders:** use a 16:10 image ratio to avoid fixed-height image distortion.
- **Listing page height:** replaced the viewport-relative minimum on `.public-list-main` with a flex page layout and `min-height: 0`, so short result sets do not add a large artificial blank region.
- **Page shell:** `.public-site` retains its 100vh minimum so short pages can fill the viewport. This is a shell-level minimum, not a fixed content panel.
- No fixed public contact overlay or page-level fixed positioning was found.

## 3. Files changed

- `frontend/src/app/globals.css`
- `docs/07_modules/public-marketplace/PUBLIC_SALES_FUNNEL_RESPONSIVE_UX_AUDIT_FIX_REPORT.md`
- `docs/DOCUMENT_CATALOG.md`

Backend modified: **NO**. Database/Prisma modified: **NO**.

## 4. Room detail fix

The contact form is a normal-flow card after the room content on narrow screens. The detail layout changes to one column at 959px and below. At wider sizes it keeps a main content column and a 300–350px contact column. This removes the cramped tablet column and the long-scroll sticky behavior while preserving the existing contact action and API flow.

## 5. Homepage responsive findings

At the available browser width (approximately 360px), the logo/header actions, headline, search fields, and CTA fit the page without visible horizontal overflow. The search form stacks its address and CTA across the full width. At widths up to 1100px, CSS uses a compact two-column hero/search arrangement; under 650px it becomes one column. At 900px and below, header secondary links are hidden to preserve room for the logo and primary actions.

## 6. Room list responsive findings

At approximately 360px, the filter disclosure and a real room card render within the viewport without visible horizontal overflow. Cards use one column under 650px and two columns up to 1100px. Toolbar content wraps. The list showed 5 matching rooms from the running local app during this observation.

## 7. Gallery responsive findings

The room detail loaded its image and displayed the gallery within the mobile content width. The thumbnail strip remains independently horizontally scrollable. CSS makes the main image 16:10 by default and 4:3 under 650px. The loaded development image depicts unrelated chef photography; the UI is rendering the image URL supplied by the local data source and this pass did not alter that data.

## 8–10. Browser viewport results

The available in-app browser control does not expose a viewport-resize/emulation API. The host browser was observed at approximately 360px; it cannot establish results at the requested exact widths. No pass is claimed for unobserved viewports.

| Viewport | Result | Evidence |
|---|---|---|
| 1440px | Not verified | No viewport resize API in available browser control |
| 1200px | Not verified | No viewport resize API in available browser control |
| 1024px | Not verified | No viewport resize API in available browser control |
| 768px | Not verified | No viewport resize API in available browser control |
| 430px | Not verified | No viewport resize API in available browser control |
| 390px | Not verified | No viewport resize API in available browser control |
| ~360px | Visual smoke passed | Homepage, `/rooms`, and `/rooms/248` rendered; no visible page-level horizontal overflow; contact panel follows room content |

## 11. Accessibility review

- Existing form controls and links remain native interactive elements.
- Existing `:focus-visible` outlines remain for public search, filter, and contact controls.
- Detail and gallery image alternative text are present in the rendered page markup.
- Keyboard-only and screen-reader interaction were not separately exercised in this pass.

## 12. Validation

- Frontend typecheck: **PASS** — `npm run typecheck --workspace=@goctro/frontend`.
- Frontend tests: **PASS** — `npm run test:api --workspace=@goctro/frontend`, 19 passed, 0 failed.
- Frontend production build: **PASS** — `npm run build --workspace=@goctro/frontend`.
- The first sandbox build attempt failed because Windows SWC could not canonicalize the workspace path (`Access is denied`). Re-running the same build with workspace access succeeded; this was an environment permission issue, not a compile error.
- Browser smoke: **PASS at available ~360px only** — homepage, `/rooms` (5 results), `/rooms/248` (image/details/form order).
- Backend/Database regression checks: not run; no backend/database files were changed.

## 13. Limitations

Exact-width checks at 390, 430, 768, 1024, 1200, and 1440px remain pending in a browser with viewport control. The current dev dataset also supplies an unrelated image for Room 248; image content was outside this UI-only scope.

## 14. Manual host-browser checklist

Use Chrome DevTools responsive mode at each width: **390, 430, 768, 1024, 1200, and 1440px**. On `/`, `/rooms`, and `/rooms/248`, verify:

1. No page-level horizontal scrollbar; header, fields, card actions, and pagination fit.
2. Homepage hero/search and room-card columns follow the responsive breakpoints without clipping.
3. Room list filter, result count, cards, and paging remain readable.
4. Detail gallery fits its column; only the thumbnail strip scrolls horizontally.
5. Scroll the detail page down and up: the contact card remains in document flow and appears after room content; it does not stick or cover other content.
6. Tab through search, filters, gallery controls, and contact form; focus remains visible.

## 15. Final status

Responsive CSS fixes and available host-browser smoke checks are complete. The exact six-width viewport matrix is **PARTIAL** until checked in a browser that supports viewport resizing.
