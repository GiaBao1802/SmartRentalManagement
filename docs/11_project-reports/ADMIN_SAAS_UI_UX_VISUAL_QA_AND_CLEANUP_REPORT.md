# Góc Trọ — Admin SaaS UI Visual QA and Cleanup Report

**Date:** 2026-10-15  
**Status:** STATIC SOURCE/CSS QA COMPLETE — AUTOMATED CHECKS PASS; MANUAL BROWSER REVIEW PENDING  
**Scope:** Frontend Admin visual layout and brand rendering only.

## 1. Pages audited

Static source and stylesheet review covered 21 routes/screens:

1. Login (`/login`)
2. Khu vực (`/admin/properties`)
3. Phòng (`/admin/properties/[propertyId]/rooms`)
4. Cư dân (`/admin/tenants`)
5. Chi tiết cư dân (`/admin/tenants/[residentId]`)
6. Hợp đồng (`/admin/contracts`)
7. Chi tiết hợp đồng (`/admin/contracts/[contractId]`)
8. Vận hành hóa đơn (`/admin/billing`)
9. Danh sách hóa đơn (`/admin/invoices`)
10. Chi tiết hóa đơn (`/admin/invoices/[invoiceId]`)
11. Khách quan tâm (`/admin/contact-requests`)
12. Điện & nước (`/admin/services/utilities`)
13. Dịch vụ cố định (`/admin/services/fixed`)
14. Tiện ích phát sinh (`/admin/services/flexible`)
15. Parking (`/admin/services/parking`)
16. Ghi nhận lượt sử dụng nội bộ (`/admin/services/charges`)
17. Tài khoản (`/admin/accounts`)
18. Tiện ích legacy (`/admin/amenities`)
19. Lịch đăng ký tiện ích legacy (`/admin/bookings`)
20. Lock screen Lịch tiện ích (`/admin/viewings`)
21. Lock screen Khiếu nại (`/admin/complaints`)

`/admin/services/charges`, `/admin/amenities`, and `/admin/bookings` remain routes outside the primary sidebar workflow. They were included in static layout review; no feature work was performed. Deferred screens remain lock screens.

## 2. Findings and page-specific fixes

| Page / group | Finding | Fix or disposition |
|---|---|---|
| Login | Logo was inside a white bordered/padded box on a green brand panel. | Replaced the light logo board crop with the supplied SVG's intended dark-background artwork, on transparent background; removed the white wrapper. |
| Khu vực | Dense property list benefits from available width; shared container and action wrapping are suitable. | No additional page-specific issue found in static CSS; data table keeps horizontal scrolling where needed. |
| Phòng | Eight-column operational table and image gallery need more room than a form; table has narrow-screen overflow handling. | No additional layout change; retained table scrolling and existing mobile form/modal rules. |
| Cư dân / resident detail | Filters and record tables are data-heavy; existing narrow rules stack controls and allow table scrolling. | No additional change identified in this static pass. |
| Hợp đồng / contract detail | List filters collapse at tablet/mobile widths; lifecycle/detail context is multi-section. | Kept detail as a page and existing draft workflow; no new modal or business-flow restructuring. |
| Vận hành hóa đơn | Summary/filter/queue grids already collapse from four columns to two/one at existing breakpoints. | No additional change identified; dense queue remains full-width. |
| Hóa đơn / invoice detail | Multi-column invoice history is data-heavy; existing table wrapper scrolls horizontally and detail remains a page. | No additional change identified. |
| Khách quan tâm | Filter row collapses and quick detail/status flow keeps the list context. | No additional change identified. |
| Điện & nước | Property selector stretched across an uneven two-thirds grid; tariff sections felt broad for their content; compact tariff table inherited a generic wide minimum. | Added a dedicated label/select/helper grid, constrained page width to 1180px, reduced section padding, and sized the compact tariff table for content with horizontal overflow on mobile. |
| Dịch vụ cố định / Tiện ích phát sinh | Selector had the same unbalanced layout; catalog/configuration content was wider than needed. | Reused the aligned selector grid and constrained workspace to 1240px; retained full table scroll for catalog/history. |
| Parking / Ghi nhận lượt sử dụng nội bộ | Property selector repeated the same imbalance; operational assignment form and tables are intentionally dense. | Reused the selector grid; kept full operational context and horizontal table scrolling rather than moving multi-relationship workflows into a modal. |
| Tài khoản | Account creation form used three columns across a wide page, leaving sparse gaps between five or six fields. | Constrained the page/form, changed the form to two columns and one column at 480px, and placed the submit action on its own row. |
| Tiện ích / Lịch đăng ký tiện ích legacy | Routes use shared data-management layout and are absent from active sidebar navigation. | No visual feature work; legacy navigation/data behavior remains unchanged. |
| Lịch tiện ích / Khiếu nại | Deferred pages already render lock screens, with no workflow actions. | Preserved both lock screens and their deferred status. |

## 3. Layout, spacing, forms, tables, and responsive behavior

- Content strategy: data-heavy tables retain available workspace width; Accounts and Service configuration content use bounded widths.
- The utility selector now uses a stable label column and a capped select column, with helper text aligned below the select. It stacks at `<=768px`.
- Utility sections use tighter 18px desktop padding and 14px at `<=480px`. Compact Electricity tiers get a 420px minimum and the four-column Contract source table keeps a 660px minimum on narrow screens so its wrapper can scroll instead of compressing text.
- The Accounts create form uses two columns, max width 900px, and a single column at `<=480px`.
- The selected dark logo renders at a maximum width of 190px in the sidebar and 220px in the login panel, with smaller logo sizing on narrow screens.
- Static breakpoint inspection covered existing and updated rules around `1200`, `900`, `768`, and `480px`, plus module breakpoints. No browser viewport screenshots were taken; responsive behavior is not claimed as visually verified.

## 4. Sidebar and header

The sidebar keeps its existing width, grouped navigation, active state, scrollable navigation region, and footer. Its background is now solid brand green to match the selected logo variant. The logo's white card, border, and excess vertical padding are removed. Header height, sticky behavior, user profile, logout, mobile menu, and route context are unchanged after source review; no header defect requiring a safe scoped edit was found.

## 5. Logo audit and final selection

- **Source inspected:** repository root `goc_tro_logo_new_style.svg`, a brand presentation board containing light, dark, monochrome, icon, and vertical samples; previous public copy showed the light primary artwork on a cream rectangle.
- **Selected file:** `frontend/public/assets/goc-tro-logo-newstyle.svg`, a standalone copy derived from the source board's explicitly labeled “Nền tối” horizontal variant.
- **Why:** this supplied variant is designed for green backgrounds and uses cream/white lettering with the existing yellow and green icon details.
- **Artwork:** the existing `mW` icon paths and wordmark were extracted without changing path geometry or brand colors; no new logo was designed.
- **ViewBox:** the standalone copy uses `0 0 310 120`, matching the bounds of the source's dark-logo sample. This isolates that labeled sample; the source SVG is unchanged.
- **Background/container:** the standalone SVG has a transparent background. The CSS background, border, radius, and padding that created the sticker appearance were removed.
- **Placements:** Admin sidebar and Login brand panel. There is no separate Admin header logo.
- **Result:** no white logo card/sticker remains in either wrapper by source/CSS inspection. Browser visual confirmation is still pending.

## 6. Modal/drawer and deferred scope

No modal or drawer was added. Existing short actions and list-context dialogs remain; complex Contract, Invoice, Billing, and Parking workflows remain in their current page/context. Lịch tiện ích and Khiếu nại remain lock screens; no deferred feature was reopened.

## 7. Impact

- Business logic: **NO CHANGE**.
- API requests/contracts: **NO CHANGE**.
- Auth, CSRF, Owner scope, and data mapping: **NO CHANGE**.
- Backend: **NOT MODIFIED**.
- Database, Prisma, migration, seed: **NOT MODIFIED**.

## 8. Tests

- Frontend API/UI/navigation tests: **64/64 PASS** (`npm run test:api`).
- Frontend typecheck: **PASS** (`npm run typecheck`).
- Frontend production build: **PASS** (`npm run build`; Next.js 16.4.0 compiled and generated all pages).
- Browser smoke: **NOT RUN**, as the task states it is not required and the user will inspect manually.

## 9. Remaining manual visual-review items

Review Login, sidebar at desktop/mobile, Utilities, Fixed/Flexible, Parking, and Accounts in a browser at desktop plus narrow widths. Confirm rendered SVG text metrics/font fallback, vertical spacing, focus states, and horizontal-scroll affordance. This report records static source/CSS checks only and does not claim browser visual PASS.

## 10. Files changed

- `frontend/public/assets/goc-tro-logo-newstyle.svg`
- `frontend/src/app/globals.css`
- `frontend/src/app/admin/accounts/page.tsx`
- `frontend/src/app/admin/services/utilities/utility-management.tsx`
- `frontend/src/app/admin/services/service-catalog.tsx`
- `frontend/src/app/admin/services/service-charges.tsx`
- `frontend/src/app/admin/services/parking/parking-management.tsx`
- `docs/00_CURRENT_STATE.md`
- `docs/DOCUMENT_CATALOG.md`
- `docs/11_project-reports/ADMIN_SAAS_UI_UX_VISUAL_QA_AND_CLEANUP_REPORT.md`

**Backend modified:** NO  
**Database modified:** NO
