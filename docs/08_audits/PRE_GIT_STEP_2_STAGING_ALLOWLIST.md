# Góc Trọ — Pre-Git Cleanup Step 2: Proposed Staging Allowlist

**Ngày:** 2026-10-15  
**Phạm vi:** Step 2 only; đề xuất staging cho đúng snapshot 307 untracked paths trong Step 1.  
**Nguồn:** `docs/08_audits/PRE_GIT_STEP_1_UNTRACKED_FILE_REVIEW.md`, repository audit, `AGENTS.md`, `frontend/AGENTS.md`, `docs/DOCUMENTATION_RULES.md`, `docs/00_CURRENT_STATE.md`, `docs/DOCUMENT_CATALOG.md`.

## 1. Input summary

- Snapshot Step 1 có 307 untracked paths; danh sách đường dẫn và phân loại đã được đối chiếu với report Step 1.
- 27 modified tracked paths và 3 deleted tracked paths nằm ngoài phạm vi; không xử lý trong lượt này.
- Report Step 2 này được tạo sau snapshot, không thuộc 307 paths và không tự được thêm vào allowlist.
- Không chạy `git add`, xóa file, commit hoặc push. Không cập nhật Catalog.

## 2. Proposed allowlist

Đề xuất stage **293 paths**. Danh sách bên dưới là exact-path allowlist, không cho phép suy rộng sang thư mục cha.

### A. Backend source — 64 paths

```text
backend/src/auth/account-repository.ts
backend/src/auth/auth.routes.ts
backend/src/auth/auth.types.ts
backend/src/auth/password.ts
backend/src/auth/session-store.ts
backend/src/auth/v1.router.ts
backend/src/config/env.ts
backend/src/contract-documents/contract-document.service.ts
backend/src/contract-documents/object-storage.ts
backend/src/contracts/contract-idempotency.ts
backend/src/contracts/contract.date.ts
backend/src/contracts/contract.repository.ts
backend/src/contracts/contract.routes.ts
backend/src/contracts/contract.validation.ts
backend/src/invoices/billing-scheduler.repository.ts
backend/src/invoices/billing-scheduler.ts
backend/src/invoices/billing-workspace.repository.ts
backend/src/invoices/fixed-service-price.repository.ts
backend/src/invoices/fixed-service-price.resolver.ts
backend/src/invoices/flexible-service-charge.repository.ts
backend/src/invoices/flexible-service-charge.resolver.ts
backend/src/invoices/invoice-itemized.calculator.ts
backend/src/invoices/invoice-itemized.pricing.ts
backend/src/invoices/invoice.billing.ts
backend/src/invoices/invoice.pricing.ts
backend/src/invoices/invoice.repository.ts
backend/src/invoices/invoice.routes.ts
backend/src/invoices/invoice.validation.ts
backend/src/invoices/meter-continuity.repository.ts
backend/src/invoices/meter-continuity.resolver.ts
backend/src/invoices/parking-billing.repository.ts
backend/src/invoices/parking-billing.resolver.ts
backend/src/invoices/utility-tariff.repository.ts
backend/src/invoices/utility-tariff.resolver.ts
backend/src/middleware/api-error.ts
backend/src/middleware/auth.ts
backend/src/middleware/csrf.ts
backend/src/middleware/error-handler.ts
backend/src/middleware/request-id.ts
backend/src/properties/property-room.repository.ts
backend/src/properties/property-room.routes.ts
backend/src/properties/property-room.validation.ts
backend/src/properties/room-status.ts
backend/src/public-marketplace/public-marketplace.repository.ts
backend/src/public-marketplace/public-marketplace.routes.ts
backend/src/public-marketplace/public-marketplace.validation.ts
backend/src/residents/resident.repository.ts
backend/src/residents/resident.routes.ts
backend/src/residents/resident.validation.ts
backend/src/room-images/room-image.repository.ts
backend/src/room-images/room-image.routes.ts
backend/src/room-images/room-image.service.ts
backend/src/room-images/storage.ts
backend/src/room-images/validation.ts
backend/src/services/parking-management.repository.ts
backend/src/services/parking-management.routes.ts
backend/src/services/property-service.repository.ts
backend/src/services/property-service.routes.ts
backend/src/services/utility-tariff-management.repository.ts
backend/src/services/utility-tariff.routes.ts
backend/src/types/express.d.ts
backend/src/utils/ids.ts
backend/src/zalo/invoice-zalo.service.ts
backend/src/zalo/zalo-provider.ts
```

### B. Backend tests — 40 paths

```text
backend/src/auth/auth.test.ts
backend/src/contract-documents/contract-document.service.test.ts
backend/src/contracts/contract-idempotency.integration.test.ts
backend/src/contracts/contract-idempotency.test.ts
backend/src/contracts/contract.repository.test.ts
backend/src/contracts/contract.routes.test.ts
backend/src/contracts/contract.validation.test.ts
backend/src/invoices/billing-scheduler.postgres.integration.test.ts
backend/src/invoices/billing-scheduler.test.ts
backend/src/invoices/billing-workspace.postgres.integration.test.ts
backend/src/invoices/billing-workspace.repository.test.ts
backend/src/invoices/fixed-service-price.repository.test.ts
backend/src/invoices/fixed-service-price.resolver.test.ts
backend/src/invoices/flexible-service-charge.repository.test.ts
backend/src/invoices/flexible-service-charge.resolver.test.ts
backend/src/invoices/invoice-itemized.calculator.test.ts
backend/src/invoices/invoice-itemized.postgres.integration.test.ts
backend/src/invoices/invoice.billing.test.ts
backend/src/invoices/invoice.repository.test.ts
backend/src/invoices/invoice.routes.test.ts
backend/src/invoices/invoice.validation.test.ts
backend/src/invoices/meter-continuity.repository.test.ts
backend/src/invoices/meter-continuity.resolver.test.ts
backend/src/invoices/parking-billing.repository.test.ts
backend/src/invoices/parking-billing.resolver.test.ts
backend/src/invoices/utility-tariff.repository.test.ts
backend/src/invoices/utility-tariff.resolver.test.ts
backend/src/properties/property-room.test.ts
backend/src/public-marketplace/public-marketplace.routes.test.ts
backend/src/residents/resident.test.ts
backend/src/room-images/room-image.repository.test.ts
backend/src/room-images/room-image.routes.test.ts
backend/src/room-images/room-image.test.ts
backend/src/services/parking-management.postgres.integration.test.ts
backend/src/services/parking-management.routes.test.ts
backend/src/services/property-service.postgres.integration.test.ts
backend/src/services/property-service.routes.test.ts
backend/src/services/utility-tariff-management.repository.test.ts
backend/src/services/utility-tariff.routes.test.ts
backend/src/zalo/invoice-zalo.service.test.ts
```

### C. Frontend source — 64 paths

```text
frontend/src/app/admin/billing/page.tsx
frontend/src/app/admin/billing/workspace.tsx
frontend/src/app/admin/contact-requests/contact-request-inbox.tsx
frontend/src/app/admin/contact-requests/page.tsx
frontend/src/app/admin/contracts/[contractId]/contract-detail.tsx
frontend/src/app/admin/contracts/[contractId]/page.tsx
frontend/src/app/admin/contracts/contract-management.tsx
frontend/src/app/admin/invoices/[invoiceId]/invoice-breakdown.tsx
frontend/src/app/admin/invoices/[invoiceId]/invoice-detail.logic.ts
frontend/src/app/admin/invoices/[invoiceId]/invoice-detail.tsx
frontend/src/app/admin/invoices/[invoiceId]/page.tsx
frontend/src/app/admin/invoices/business-combobox.tsx
frontend/src/app/admin/invoices/invoice-list-content.tsx
frontend/src/app/admin/invoices/invoice-list.logic.ts
frontend/src/app/admin/invoices/invoice-list.tsx
frontend/src/app/admin/properties/[propertyId]/rooms/resident-room-panel.tsx
frontend/src/app/admin/properties/[propertyId]/rooms/room-image-gallery.tsx
frontend/src/app/admin/properties/[propertyId]/rooms/room-image-picker.tsx
frontend/src/app/admin/services/charges/page.tsx
frontend/src/app/admin/services/fixed/page.tsx
frontend/src/app/admin/services/flexible/page.tsx
frontend/src/app/admin/services/page.tsx
frontend/src/app/admin/services/parking/page.tsx
frontend/src/app/admin/services/parking/parking-management.tsx
frontend/src/app/admin/services/service-catalog.tsx
frontend/src/app/admin/services/service-charges.tsx
frontend/src/app/admin/services/service-workspace-nav.tsx
frontend/src/app/admin/services/service-workspace.ts
frontend/src/app/admin/services/utilities/page.tsx
frontend/src/app/admin/services/utilities/utility-management.tsx
frontend/src/app/admin/tenants/[residentId]/page.tsx
frontend/src/app/admin/tenants/[residentId]/resident-detail.tsx
frontend/src/app/admin/tenants/resident-management.tsx
frontend/src/app/api/public/room-images/[imageId]/route.ts
frontend/src/app/components/admin-navigation.ts
frontend/src/app/components/auth-provider.tsx
frontend/src/app/components/deferred-feature-screen.tsx
frontend/src/app/public-room-card.tsx
frontend/src/app/rooms/[roomId]/page.tsx
frontend/src/app/rooms/[roomId]/public-contact-form.tsx
frontend/src/app/rooms/[roomId]/public-room-detail.tsx
frontend/src/app/rooms/[roomId]/public-room-gallery.tsx
frontend/src/app/rooms/page.tsx
frontend/src/app/rooms/room-listing.tsx
frontend/src/lib/api/apiClient.ts
frontend/src/lib/api/authApi.ts
frontend/src/lib/api/contractApi.ts
frontend/src/lib/api/contractView.ts
frontend/src/lib/api/errors.ts
frontend/src/lib/api/invoiceApi.ts
frontend/src/lib/api/occupancyApi.ts
frontend/src/lib/api/parkingApi.ts
frontend/src/lib/api/propertyApi.ts
frontend/src/lib/api/propertyServiceApi.ts
frontend/src/lib/api/publicRoomApi.ts
frontend/src/lib/api/residentApi.ts
frontend/src/lib/api/roomApi.ts
frontend/src/lib/api/roomImageApi.ts
frontend/src/lib/api/roomImageWorkflow.ts
frontend/src/lib/api/utilityTariffApi.ts
frontend/src/lib/publicContact.ts
frontend/src/lib/singleFlight.ts
frontend/src/lib/ui/admin-presentation.ts
frontend/src/lib/ui/dialog-accessibility.ts
```

### D. Frontend tests — 15 paths

```text
frontend/src/app/admin/billing/workspace.test.tsx
frontend/src/app/admin/invoices/invoice-detail.test.tsx
frontend/src/app/admin/invoices/invoice-list-content.test.tsx
frontend/src/app/admin/invoices/invoice-list.logic.test.tsx
frontend/src/app/admin/services/service-workspace.test.ts
frontend/src/app/components/admin-navigation.test.ts
frontend/src/lib/api/apiClient.test.ts
frontend/src/lib/api/contractApi.test.ts
frontend/src/lib/api/contractView.test.ts
frontend/src/lib/api/invoiceApi.test.ts
frontend/src/lib/api/propertyServiceApi.test.ts
frontend/src/lib/api/roomImagePicker.test.tsx
frontend/src/lib/api/roomImageWorkflow.test.ts
frontend/src/lib/api/utilityTariffApi.test.ts
frontend/src/lib/ui/admin-presentation.test.ts
```

### E. Docs — 103 paths

```text
AGENTS.md
docs/00_CURRENT_STATE.md
docs/02_architecture/DOMAIN_MODEL.md
docs/03_database/DATABASE_V1_6_RESIDENT_AVATAR_ACCOUNT_PHONE_MIGRATION_REPORT.md
docs/03_database/migrations/V1_1_DATA_MIGRATION_PLAN.md
docs/03_database/prisma/PRISMA_V1_1_REMAP_REPORT.md
docs/03_database/prisma/PRISMA_V1_2_REMAP_REPORT.md
docs/03_database/prisma/PRISMA_V1_3_CONTRACT_AUDIT_REMAP_REPORT.md
docs/05_backend/auth/BACKEND_FOUNDATION_AUTH_V1_2_REPORT.md
docs/06_frontend/design/CORE_MODULES_SAAS_REDESIGN_REPORT.md
docs/06_frontend/design/wireframes/wireframe-quan-ly-khach-thue-v2.html
docs/06_frontend/integrations/FRONTEND_INTEGRATION_PASS_1_AUTH_PROPERTY_ROOM_REPORT.md
docs/07_modules/auth/AUTHENTICATED_ADMIN_BROWSER_SMOKE_SETUP_REPORT.md
docs/07_modules/auth/AUTH_END_TO_END_COMPLETION_REPORT.md
docs/07_modules/contract/CONTRACT_API_V1_2_MIGRATION_REPORT.md
docs/07_modules/contract/CONTRACT_API_V1_3_MIGRATION_REPORT.md
docs/07_modules/contract/CONTRACT_API_V1_3_RESIDENT_SUCCESSOR_PRIVACY_FIX_REPORT.md
docs/07_modules/contract/CONTRACT_AUTHENTICATED_ADMIN_RESIDENT_E2E_CLOSURE_REPORT.md
docs/07_modules/contract/CONTRACT_BUSINESS_REQUIREMENT_AUDIT.md
docs/07_modules/contract/CONTRACT_BUSINESS_RULE_ALIGNMENT_P1_FIX_REPORT.md
docs/07_modules/contract/CONTRACT_DURABLE_IDEMPOTENCY_RUNTIME_IMPLEMENTATION_REPORT.md
docs/07_modules/contract/CONTRACT_FRONTEND_MIGRATION_E2E_REPORT.md
docs/07_modules/contract/CONTRACT_P1_6_ACCOUNT_MODEL_RECONCILIATION_REPORT.md
docs/07_modules/contract/DATABASE_V1_4_TO_V1_5_MIGRATION_FINAL_REPORT.md
docs/07_modules/contract/DATABASE_V1_4_TO_V1_5_MIGRATION_REPORT.md
docs/07_modules/contract/DATABASE_V1_5_CONTRACT_IDEMPOTENCY_DESIGN.md
docs/07_modules/invoice-zalo/ADMIN_BILLING_V1_BACKEND_CONNECTIVITY_AND_FINAL_BROWSER_CLOSURE_REPORT.md
docs/07_modules/invoice-zalo/ADMIN_BILLING_V1_FINAL_OPERATIONAL_CLOSURE_REPORT.md
docs/07_modules/invoice-zalo/ADMIN_INVOICE_V1_BROWSER_VERIFICATION_CLOSURE_REPORT.md
docs/07_modules/invoice-zalo/ADMIN_INVOICE_V1_BROWSER_VERIFICATION_REPORT.md
docs/07_modules/invoice-zalo/ADMIN_INVOICE_V1_FINAL_BROWSER_CLOSURE_REPORT.md
docs/07_modules/invoice-zalo/ADMIN_INVOICE_V1_READ_LIST_INTEGRATION_REPORT.md
docs/07_modules/invoice-zalo/API_SPEC_INVOICE_ZALO_HARDENING_REPORT.md
docs/07_modules/invoice-zalo/BILLING_DEMO_INVOICE_MISSING_PRICING_DIAGNOSIS_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_7_API_DATABASE_DESIGN_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_7_BACKEND_IMPLEMENTATION_GAP_REVIEW_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_7_FIXED_SERVICE_PRICE_RESOLVER_IMPLEMENTATION_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_7_FLEXIBLE_SERVICE_CHARGE_RESOLVER_IMPLEMENTATION_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_7_ITEMIZED_INVOICE_CALCULATOR_ATOMIC_FINALIZATION_IMPLEMENTATION_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_7_METER_CONTINUITY_RULE_ALIGNMENT_IMPLEMENTATION_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_7_PARKING_PRICE_ENTITLEMENT_RESOLVER_IMPLEMENTATION_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_7_UTILITY_TARIFF_RESOLVER_IMPLEMENTATION_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_7_UX_REQUIREMENT_DATA_READINESS_AUDIT_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_8_INVOICE_FINALIZE_ROUTE_POSTGRESQL_INTEGRATION_CLOSURE_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_8_PRODUCTION_INVOICE_FINALIZATION_WIRING_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_END_TO_END_BUSINESS_FLOW_GAP_AUDIT.md
docs/07_modules/invoice-zalo/BILLING_V1_PERIOD_END_REMINDER_AND_DRAFT_SCHEDULER_IMPLEMENTATION_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_PERIOD_WORKSPACE_READINESS_QUEUE_IMPLEMENTATION_REPORT.md
docs/07_modules/invoice-zalo/BILLING_V1_WORKSPACE_AUTHENTICATED_BROWSER_SMOKE_CLOSURE_REPORT.md
docs/07_modules/invoice-zalo/DATABASE_CHANGE_REQUEST_RECURRING_PARKING_BILLING.md
docs/07_modules/invoice-zalo/DATABASE_V1_7_DESIGN_REVIEW_APPROVAL_REPORT.md
docs/07_modules/invoice-zalo/DATABASE_V1_7_LOCKED_DB_APPLY_POST_MIGRATION_VALIDATION_REPORT.md
docs/07_modules/invoice-zalo/DATABASE_V1_7_LOCKED_DB_PROMOTION_REVIEW.md
docs/07_modules/invoice-zalo/DATABASE_V1_7_LOCKED_DB_PROMOTION_REVIEW_RERUN.md
docs/07_modules/invoice-zalo/DATABASE_V1_7_MIGRATION_IMPLEMENTATION_VALIDATION_REPORT.md
docs/07_modules/invoice-zalo/DATABASE_V1_7_POPULATED_TARGET_VALIDATOR_COMPATIBILITY_REPORT.md
docs/07_modules/invoice-zalo/DATABASE_V1_7_PROTECTED_TARGET_GUARD_RECONCILIATION_REPORT.md
docs/07_modules/invoice-zalo/DATABASE_V1_8_RECURRING_PARKING_MIGRATION_IMPLEMENTATION_REPORT.md
docs/07_modules/invoice-zalo/INVOICE_ZALO_API_MIGRATION_REPORT.md
docs/07_modules/property-room/DATABASE_V1_4_RUNTIME_VALIDATOR_POPULATED_DB_COMPATIBILITY_REPORT.md
docs/07_modules/property-room/LOCAL_GOCTRO_TEST3_V1_3_TO_V1_4_MIGRATION_REPORT.md
docs/07_modules/property-room/PROPERTY_ROOM_API_V1_2_MIGRATION_REPORT.md
docs/07_modules/property-room/PROPERTY_ROOM_END_TO_END_COMPLETION_REPORT.md
docs/07_modules/property-room/PROPERTY_ROOM_ROOM_IMAGES_FINAL_HOST_BROWSER_CLOSURE_REPORT.md
docs/07_modules/property-room/PROPERTY_ROOM_ROOM_IMAGES_FRONTEND_INTEGRATION_REPORT.md
docs/07_modules/property-room/PROPERTY_ROOM_ROOM_IMAGES_HOST_BROWSER_SMOKE_REPORT.md
docs/07_modules/public-marketplace/DATABASE_V1_4_ROOM_IMAGES_MIGRATION_REPORT.md
docs/07_modules/public-marketplace/PUBLIC_SALES_FUNNEL_RESPONSIVE_UX_AUDIT_FIX_REPORT.md
docs/07_modules/public-marketplace/PUBLIC_SALES_FUNNEL_V1_AUDIT.md
docs/07_modules/public-marketplace/PUBLIC_SALES_FUNNEL_V1_BACKEND_IMPLEMENTATION_REPORT.md
docs/07_modules/public-marketplace/PUBLIC_SALES_FUNNEL_V1_FRONTEND_IMPLEMENTATION_REPORT.md
docs/07_modules/public-marketplace/ROOM_IMAGES_V1_BACKEND_IMPLEMENTATION_REPORT.md
docs/07_modules/public-marketplace/ROOM_IMAGES_V1_RUNTIME_VERIFICATION_REPORT.md
docs/07_modules/public-marketplace/ROOM_IMAGES_V1_SCHEMA_MIGRATION_DESIGN.md
docs/07_modules/resident-occupancy/FRONTEND_INTEGRATION_PASS_2_RESIDENT_OCCUPANCY_REPORT.md
docs/07_modules/resident-occupancy/RESIDENT_ACCOUNT_PROVISIONING_SELF_SERVICE_FOUNDATION_REPORT.md
docs/07_modules/resident-occupancy/RESIDENT_ACCOUNT_PROVISIONING_SELF_SERVICE_IMPLEMENTATION_REPORT.md
docs/07_modules/resident-occupancy/RESIDENT_OCCUPANCY_API_V1_2_MIGRATION_REPORT.md
docs/07_modules/resident-occupancy/RESIDENT_OCCUPANCY_BUSINESS_AUDIT.md
docs/07_modules/resident-occupancy/RESIDENT_OCCUPANCY_FINAL_BUSINESS_GAP_RECHECK_E2E_CLOSURE_REPORT.md
docs/07_modules/service/SERVICE_MODULE_CURRENT_STATE_AUDIT.md
docs/07_modules/service/SERVICE_MODULE_INFORMATION_ARCHITECTURE_PRODUCT_FLOW_REALIGNMENT_REPORT.md
docs/07_modules/service/SERVICE_PASS_2_UTILITY_TARIFF_METER_SOURCE_CLOSURE_REPORT.md
docs/07_modules/service/SERVICE_PASS_2_UTILITY_TARIFF_METER_SOURCE_IMPLEMENTATION_REPORT.md
docs/07_modules/service/SERVICE_PASS_3_FIXED_FLEXIBLE_SERVICE_IMPLEMENTATION_REPORT.md
docs/08_audits/MIGRATION_GAP_REPORT.md
docs/08_audits/PRE_GIT_REPOSITORY_AUDIT_AND_CLEANUP_PLAN.md
docs/08_audits/PRE_GIT_STEP_1_UNTRACKED_FILE_REVIEW.md
docs/10_operations/LOCAL_DEV_STARTUP_REPORT.md
docs/10_operations/REPOSITORY_CLEANUP_REPORT.md
docs/11_project-reports/ADMIN_SAAS_UI_UX_REDESIGN_REPORT.md
docs/11_project-reports/ADMIN_SAAS_UI_UX_VISUAL_QA_AND_CLEANUP_REPORT.md
docs/11_project-reports/AGENTS_MD_PROJECT_WORKFLOW_SETUP_REPORT.md
docs/11_project-reports/BAO_CAO_TIEN_DO_DU_AN_GOC_TRO.md
docs/11_project-reports/DOCS_REORGANIZATION_REPORT.md
docs/11_project-reports/PROJECT_CURRENT_STATE_AUDIT_2026_10_12.md
docs/11_project-reports/REQUIREMENT_IMPLEMENTATION_COVERAGE_AUDIT_2026_10_13.md
docs/11_project-reports/SOURCE_OF_TRUTH_CURRENT_STATE_GOVERNANCE_FINALIZATION_REPORT.md
docs/11_project-reports/Tom_tat_chinh_sua_Goc_tro.md
docs/12_decisions/V1_1_MIGRATION_DECISIONS.md
docs/DOCUMENTATION_RULES.md
docs/DOCUMENT_CATALOG.md
docs/README.md
```

### F. Assets — 3 paths

```text
frontend/public/assets/goc-tro-logo-newstyle.svg
frontend/public/assets/logo-goc-tro-mark.png
goc_tro_logo_new_style.svg
```

### G. Scripts/config — 4 paths

```text
frontend/.env.example
scripts/dev-all.ps1
scripts/dev-stop.ps1
scripts/run-contract-idempotency-runtime.mjs
```

## 3. Safe future staging plan

Khi bắt đầu bước staging, chỉ tạo `git add -- <exact paths>` từ các nhóm allowlist ở §2. Có thể chia lệnh thành các batch theo nhóm A–G; với `docs/`, `frontend/src/app/admin/services/`, `frontend/src/app/admin/viewings/` và `frontend/src/app/admin/complaints/`, chỉ truyền đúng từng path được liệt kê. Không dùng `git add .`, `git add -A` hoặc wildcard thư mục. Lệnh chưa được chạy trong Step 2.

## 4. Exact exclude list

### Historical Prisma snapshots — EXCLUDE / decision pending (3)

```text
database/schema.legacy.prisma
database/schema.v1_1.prisma
database/schema.v1_2.prisma
```

### Orphan source candidates — EXCLUDE / DELETE AFTER CONFIRMATION (3)

```text
frontend/src/app/admin/services/service-overview.tsx
frontend/src/app/admin/viewings/legacy-viewing-requests-workflow.tsx
frontend/src/app/admin/complaints/legacy-complaints-workflow.tsx
```

## 5. Eight uncataloged reports — REVIEW (8)

Không tìm thấy entry cho các path này trong `docs/DOCUMENT_CATALOG.md`. Không sửa Catalog ở Step 2. Các khuyến nghị dưới đây là đề xuất phân loại, chưa thay status trong Catalog.

### `docs/07_modules/invoice-zalo/ADMIN_BILLING_V1_BUSINESS_WORKFLOW_AND_SEARCH_UX_CLOSURE_REPORT.md`

- **Chủ đề:** Billing Admin: business workflow và bộ lọc/tìm kiếm hóa đơn; dated 2026-10-14, trạng thái PARTIAL.
- **Report thay thế/mới hơn:** Có report mới hơn về authenticated workspace/core workflow và scoped Invoice UI closure; chưa thấy report mới hơn thay riêng nội dung business filter.
- **Đánh giá:** PARTIAL / historical-scope candidate; browser filter evidence còn hữu ích, phần closure runtime được report mới cập nhật.
- **Khuyến nghị:** KEEP + CATALOG, ghi rõ PARTIAL và liên kết các closure report mới hơn.

### `docs/07_modules/invoice-zalo/ADMIN_INVOICE_V1_DETAIL_METER_FINALIZE_ITEMIZED_UX_REPORT.md`

- **Chủ đề:** Invoice detail, meter edit, finalize và itemized/tier UX.
- **Report thay thế/mới hơn:** Có báo cáo vận hành/finalize và V1.8 route integration mới hơn; các blocker item/tier cũ không còn là current status.
- **Đánh giá:** Historical / superseded candidate cho trạng thái hiện tại; giữ lại bằng chứng UX ban đầu.
- **Khuyến nghị:** KEEP + CATALOG với trạng thái HISTORICAL và link closure mới.

### `docs/07_modules/invoice-zalo/BILLING_V1_7_CANONICAL_REQUIREMENT_SYNC_REPORT.md`

- **Chủ đề:** Bản ghi đồng bộ Requirement/API Billing V1.7 ngày 2026-10-13.
- **Report thay thế/mới hơn:** Có `BILLING_V1_7_PRODUCT_DECISION_CLOSURE_REPORT.md` ghi rõ một số quyết định trước đó đã superseded; Requirement/API và các implementation reports mới hơn là nguồn hiện hành.
- **Đánh giá:** HISTORICAL; nội dung quyết định cũ bị supersede một phần.
- **Khuyến nghị:** KEEP + CATALOG như lịch sử, không dùng làm authority hiện tại.

### `docs/07_modules/invoice-zalo/BILLING_V1_7_PRODUCT_DECISION_CLOSURE_REPORT.md`

- **Chủ đề:** Đóng các quyết định sản phẩm Billing V1.7, gồm tariff, service pricing và invoice snapshots; dated 2026-10-13.
- **Report thay thế/mới hơn:** Requirement/API và các report implementation/runtime mới hơn; `docs/00_CURRENT_STATE.md` vẫn tham chiếu closure này.
- **Đánh giá:** REFERENCE — approved decision history; không phải physical DB hoặc implementation proof.
- **Khuyến nghị:** KEEP + CATALOG ở trạng thái REFERENCE, làm rõ canonical Requirement/API mới là authority.

### `docs/07_modules/invoice-zalo/BILLING_V1_PRICING_SNAPSHOT_SCHEMA_GAP_AUDIT.md`

- **Chủ đề:** Audit khoảng trống pricing/snapshot ngày 2026-10-12.
- **Report thay thế/mới hơn:** Có Product Decision Closure, canonical Requirement sync và nhiều resolver/finalization reports sau đó.
- **Đánh giá:** HISTORICAL / pre-implementation audit; các finding cũ cần đọc cùng kết quả mới hơn.
- **Khuyến nghị:** KEEP + CATALOG như historical audit và link quyết định/implementation mới.

### `docs/07_modules/property-room/PROPERTY_ROOM_E2E_CLOSURE_REPORT.md`

- **Chủ đề:** Property/Room E2E closure dated 2026-10-10, gồm pagination/search/current Contract summary.
- **Report thay thế/mới hơn:** Có `PROPERTY_ROOM_END_TO_END_COMPLETION_REPORT.md` và Room Images final host-browser closure mới hơn.
- **Đánh giá:** HISTORICAL / earlier closure snapshot; không dùng làm trạng thái tổng thể mới nhất.
- **Khuyến nghị:** KEEP + CATALOG lịch sử, link report E2E/host-browser mới hơn.

### `docs/07_modules/resident-occupancy/RESIDENT_OCCUPANCY_END_TO_END_COMPLETION_REPORT.md`

- **Chủ đề:** Resident/Occupancy end-to-end closure dated 2026-10-11, gồm Admin API/browser và regression evidence.
- **Report thay thế/mới hơn:** Có `RESIDENT_OCCUPANCY_FINAL_BUSINESS_GAP_RECHECK_E2E_CLOSURE_REPORT.md` mới hơn, ghi các gap còn mở và module chưa LOCK.
- **Đánh giá:** HISTORICAL / superseded candidate cho current status; evidence test cụ thể vẫn hữu ích.
- **Khuyến nghị:** KEEP + CATALOG như historical evidence và link gap recheck mới.

### `docs/07_modules/ui/ADMIN_UI_BUSINESS_PRESENTATION_AUDIT_REPORT.md`

- **Chủ đề:** Audit presentation/formatting các trang Admin; dated 2026-10-12.
- **Report thay thế/mới hơn:** Có `ADMIN_SAAS_UI_UX_REDESIGN_REPORT.md` và `ADMIN_SAAS_UI_UX_VISUAL_QA_AND_CLEANUP_REPORT.md` mới hơn.
- **Đánh giá:** HISTORICAL / superseded visual baseline; chi tiết finding có thể hữu ích để truy vết.
- **Khuyến nghị:** KEEP + CATALOG historical, link UI redesign/visual QA hiện hành.

## 6. Prisma snapshot review

- `backend/package.json` chọn `../database/schema.prisma` cho `prisma generate` và `prisma migrate`; kiểm tra source/package không cho thấy runtime chọn ba snapshot legacy. `database/schema.prisma` là mapping file được chọn hiện tại.
- Tuy nhiên đầu `database/schema.prisma` ghi “Database V1.7 mapping”, trong khi `docs/00_CURRENT_STATE.md` ghi V1.8 là physical baseline hiện tại. Vì vậy xác nhận được **đường dẫn authority theo cấu hình runtime**, nhưng chưa xác nhận được mapping file khớp hoàn toàn V1.8 chỉ từ nhãn trong file. Ghi nhận mismatch này để kiểm tra ở task riêng; không sửa Prisma trong Step 2.
- Ba snapshot không stage. Chúng là references lịch sử được các Prisma remap reports trích dẫn. Có thể giữ ngoài Git, lưu trữ như history hoặc stage như history sau khi chủ dự án quyết định; Step 2 không quyết định thay.

## 7. Delete-candidate review

| Path | Kết quả rà soát | Kết luận |
|---|---|---|
| `frontend/src/app/admin/services/service-overview.tsx` | Không có import/route/test tham chiếu thực thi; `/admin/services` route chuyển sang Utilities. Có CSS selector cũ trong tracked `globals.css`; không có tài liệu yêu cầu source component phải hiện diện. | **DELETE AFTER CONFIRMATION**; CSS là dấu vết cần tính tới trong bước cleanup riêng. |
| `frontend/src/app/admin/viewings/legacy-viewing-requests-workflow.tsx` | Không có import/route/test tham chiếu thực thi; route hiện hành là deferred screen. Tài liệu audit chỉ ghi nhận component, không yêu cầu runtime presence. Legacy backend route còn tồn tại nhưng không import component. | **DELETE AFTER CONFIRMATION**; giữ nếu cần làm reference khi mở lại feature. |
| `frontend/src/app/admin/complaints/legacy-complaints-workflow.tsx` | Không có import/route/test tham chiếu thực thi; route hiện hành là deferred screen. Audit/test nói về deferred flow nhưng không import file này hoặc yêu cầu file tồn tại. | **DELETE AFTER CONFIRMATION**; giữ nếu cần làm reference khi mở lại feature. |

Không xóa các file trên ở Step 2.

## 8. Secret / generated / local scan

- Scan đúng 293 allowlist candidate paths, sau khi bỏ 8 report REVIEW. Không có private key, cloud/API token thật, credential database production hoặc nội dung `.env` thật phát hiện được.
- Heuristic scanner báo 19 file do nhận nhầm tên biến/kiểu dữ liệu bảo mật, `process.env`, fake password/token cho unit tests và URL PostgreSQL cục bộ với cặp credential generic cho database `test`. Các match được kiểm tra theo path/context; không phải secret dùng được. Giá trị không được in vào report/output.
- `frontend/.env.example` chỉ là template với API base localhost; không chứa credential. Không thấy file generated/temp/local runtime trong snapshot 307 theo Step 1.
- Không thêm path nào vào REVIEW vì scan; giữ nguyên nhóm 293 allowlist sau phân loại false positive.

## 9. Count reconciliation

| Disjoint disposition | Count | Nội dung |
|---|---:|---|
| Proposed ALLOWLIST | 293 | A SOURCE + B TEST + C DOCS + D ASSET, trừ 8 uncataloged reports đang review. |
| EXCLUDED | 6 | 3 historical Prisma snapshots + 3 delete candidates. |
| REVIEW | 8 | 8 uncataloged reports; chưa đưa vào allowlist cho tới khi catalog/status được quyết định ở task sau. |
| **Input total** | **307** | **293 + 6 + 8 = 307; không overlap, không thiếu path.** |

Danh sách Step 1 được phân loại theo đúng một disposition mỗi path. Report Step 2 này nằm ngoài snapshot 307.

## 10. Exact Step 3 input

Step 3 chỉ review ba tracked deleted files, xác nhận từng deletion có chủ ý hay không và có replacement phù hợp chưa:

```text
docs/DOMAIN_MODEL.md
docs/Tom_tat_chinh_sua_Goc_tro.md
docs/design/wireframes/wireframe-quan-ly-khach-thue-v2.html
```

Step 3 chưa được thực hiện trong tài liệu này.

## 11. Completion / limits

- Đã tạo exact-path allowlist proposal, exclude/review lists, report disposition, snapshot review, orphan review, secret scan summary và Step 3 input.
- Chưa stage, xóa, sửa Catalog, sửa source, hoặc xử lý tracked changes.
- **Unresolved observation:** runtime chọn `database/schema.prisma`, nhưng comment trong file ghi V1.7 còn Current State ghi V1.8. Cần audit parity riêng trước khi coi snapshot hiện hành đã đồng bộ nhãn version.
