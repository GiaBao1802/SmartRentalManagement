# Góc Trọ — Global Admin SaaS UI/UX Redesign Report

**Date:** 2026-10-15  
**Status:** IMPLEMENTED — automated checks PASS; manual browser review not run  
**Scope:** Frontend Admin shell, active Admin visual foundation/navigation, login brand, and deferred-screen presentation.

## 1. Design direction

Applied a calm SaaS dashboard foundation using Góc Trọ's existing green, orange, cream and neutral palette. Shared shell, page headings, forms, cards, tables, badges, focus states, alerts, and dialogs now follow the same spacing and surface treatment. Existing page-specific layouts remain in place where they carry module workflow context.

## 2. Logo asset used

Used the supplied `goc_tro_logo_new_style.svg`. The copy at `frontend/public/assets/goc-tro-logo-newstyle.svg` narrows the SVG viewBox to the horizontal primary logo artwork; its vector artwork and brand colors are retained. It is used in the Admin sidebar and login brand panel. The original repository asset remains unchanged.

## 3. Global shell changes

- Refined sidebar spacing, logo container, navigation group rhythm, active/hover/focus states, and footer status treatment.
- Refined sticky header height, text hierarchy, avatar spacing and logout control.
- Unified content width behavior and page-heading spacing across shared Admin pages.
- Kept existing mobile menu, scrim, route-based close behavior, authentication checks, and Owner context unchanged.
- Removed Lịch tiện ích and Khiếu nại from the primary Admin sidebar because they are deferred. Their direct routes still render lock screens.
- Preserved one sidebar entry for Dịch vụ & Tiện ích and the four Service workspace tabs. `/admin/services` still redirects to Điện & nước.

## 4. Typography and spacing

Kept the existing Be Vietnam Pro font. Added a shared 4/8/12/16/24/32px spacing scale and aligned Admin title, description, body, table, badge, input and helper-text sizing through shared selectors. Existing brand color values remain unchanged.

## 5. Shared components

Extended shared CSS for `.admin-main`, `.page-heading`, `.admin-card`, `.filter-form`, `.table-wrap`, `.button`, `.chip`, `.notice`, `.edit-modal`, and login controls. Added consistent keyboard focus, disabled, hover, and small-screen behavior. No frontend architecture rewrite or new component dependency was introduced.

## 6. Pages redesigned

The shared styles apply to active Admin screens using the common shell: Khu vực, Phòng, Cư dân, Hợp đồng, Vận hành hóa đơn, Hóa đơn list/detail, Khách quan tâm, Service utilities/fixed/flexible/Parking, Tài khoản, and Login. Property/Room, Contract, Invoice, Billing and Service module-specific actions and data rendering remain in their existing components.

## 7. Deferred pages

Lịch tiện ích (`/admin/viewings`) and Khiếu nại (`/admin/complaints`) retain their existing deferred-feature lock screens. They are no longer sidebar destinations. Their preserved legacy workflow files are not called by the lock-screen routes.

## 8. Modal/drawer workflows

No new modal or drawer workflow was introduced in this global visual pass. Existing quick modals remain for Property create/edit, Room create/edit, Resident creation, Contract draft creation, and Contact Request detail/status. Contract detail and Invoice detail remain full pages; Service price history remains an inline detail section.

## 9. Click reductions

No workflow was moved into a modal/drawer, so there is no measured old/new click-count reduction to claim. Hiding two deferred destinations reduces irrelevant sidebar choices but does not change task click counts. Existing one-screen creation/detail interactions were preserved. Browser-based timing/click measurement was outside this task's requested no-smoke boundary.

## 10. Responsive strategy

Kept the existing collapsible sidebar and mobile scrim. Shared layouts now stack page headers, filters, modal fields, and actions at narrow widths; tables retain horizontal scrolling; modal height follows the available dynamic viewport. Module-specific responsive rules remain. No exact viewport browser matrix was run.

## 11. Business logic impact

None. Billing, Service, tariff, Parking, Contract, authentication, Owner-scope, and data-validation behavior were not changed.

## 12. API impact

None. Request paths, DTOs, payloads, response mapping, CSRF/session handling, and API helpers were not changed.

## 13. Database impact

None. No schema, Prisma, migration, seed, or database command was changed or run.

## 14. Tests

- Frontend API/UI/navigation suite: **64/64 PASS**.
- Frontend typecheck: **PASS**.
- Production build: **PASS**. Initial sandbox attempt hit a Windows SWC `Access is denied` while canonicalizing the frontend path; rerun outside the sandbox completed successfully.
- Added Admin navigation assertions for one Service entry, hidden deferred destinations, and no Service overview route. Updated the prior deferred-nav expectation to match the approved lock-screen navigation behavior.
- Browser smoke was not run, as requested.

## 15. Known limitations

- No manual visual review was performed in a browser.
- Narrow-width rules were validated by build/typecheck, not by viewport screenshots.
- No new modal/drawer workflow or click reduction was added; this pass focuses on global visual consistency and navigation clarity.
- Legacy `/admin/amenities` and `/admin/bookings` routes exist outside the current sidebar navigation and were not treated as active workflows.

## 16. Remaining visual cleanup

The user should manually review Admin pages at desktop and narrow widths. Any page-specific spacing that does not inherit shared selectors, and any overflow unique to its own component, can be addressed in a focused follow-up without changing its API or business flow.

## Files changed in this pass

- `frontend/public/assets/goc-tro-logo-newstyle.svg`
- `frontend/src/app/components/admin-shell.tsx`
- `frontend/src/app/components/admin-navigation.ts`
- `frontend/src/app/components/admin-navigation.test.ts`
- `frontend/src/app/admin/services/service-workspace.test.ts`
- `frontend/src/app/login/login-form.tsx`
- `frontend/src/app/globals.css`
- `frontend/package.json`
- `docs/00_CURRENT_STATE.md`
- `docs/DOCUMENT_CATALOG.md`
- `docs/11_project-reports/ADMIN_SAAS_UI_UX_REDESIGN_REPORT.md`

**Backend modified:** NO  
**Database/Prisma modified:** NO
