# Báo cáo tổ chức lại tài liệu SmartRentalManagement

**Ngày:** 2026-10-09  
**Phạm vi:** Chỉ tổ chức cây `SmartRentalManagement/docs/`, thêm tài liệu điều hướng/quy tắc/catalog/report và cập nhật tham chiếu đường dẫn. Không chỉnh code hoặc nội dung nghiệp vụ.

## Kết quả

- Đã phân loại và chuyển đủ **22 tài liệu nguồn** vào cấu trúc theo nhóm. Không xóa nội dung tài liệu.
- Đã tạo `docs/README.md`, `docs/DOCUMENT_CATALOG.md`, `docs/DOCUMENTATION_RULES.md` và báo cáo này.
- Đã cập nhật tham chiếu trong README và tài liệu ở cả hai project trong workspace để dùng vị trí mới.
- Không có tài liệu nào được chuyển vào `99_archive/`: các tài liệu cũ vẫn cần thiết làm lịch sử/tham khảo và được gắn trạng thái trong catalog.
- Các Requirement/API canonical vẫn ở project liền kề `GocTro-SmartBuilding`; không di chuyển, sao chép hoặc thay đổi chúng.

## Cây thư mục

```text
docs/
├── README.md
├── DOCUMENT_CATALOG.md
├── DOCUMENTATION_RULES.md
├── 00_overview/
├── 01_requirements/
├── 02_architecture/                 DOMAIN_MODEL.md
├── 03_database/
│   ├── prisma/                      3 Prisma remap reports
│   └── migrations/                  V1_1_DATA_MIGRATION_PLAN.md
├── 04_api/
├── 05_backend/
│   ├── auth/                        BACKEND_FOUNDATION_AUTH_V1_2_REPORT.md
│   └── hardening/
├── 06_frontend/
│   ├── integrations/                Frontend Pass 1
│   └── design/wireframes/           Resident wireframe
├── 07_modules/
│   ├── property-room/               1 report
│   ├── resident-occupancy/          3 reports (including FE integration)
│   ├── contract/                    3 reports
│   ├── invoice-zalo/                2 reports
│   ├── payment/
│   ├── parking/
│   ├── complaint/
│   └── ct01/
├── 08_audits/                       MIGRATION_GAP_REPORT.md
├── 09_testing/
├── 10_operations/                   2 reports
├── 11_project-reports/              Summary + this report
├── 12_decisions/                    V1_1_MIGRATION_DECISIONS.md
└── 99_archive/                      reserved; currently empty
```

## Tài liệu đã di chuyển

```text
DOMAIN_MODEL.md → 02_architecture/DOMAIN_MODEL.md
PRISMA_V1_1_REMAP_REPORT.md → 03_database/prisma/PRISMA_V1_1_REMAP_REPORT.md
PRISMA_V1_2_REMAP_REPORT.md → 03_database/prisma/PRISMA_V1_2_REMAP_REPORT.md
PRISMA_V1_3_CONTRACT_AUDIT_REMAP_REPORT.md → 03_database/prisma/PRISMA_V1_3_CONTRACT_AUDIT_REMAP_REPORT.md
V1_1_DATA_MIGRATION_PLAN.md → 03_database/migrations/V1_1_DATA_MIGRATION_PLAN.md
V1_1_MIGRATION_DECISIONS.md → 12_decisions/V1_1_MIGRATION_DECISIONS.md
BACKEND_FOUNDATION_AUTH_V1_2_REPORT.md → 05_backend/auth/BACKEND_FOUNDATION_AUTH_V1_2_REPORT.md
FRONTEND_INTEGRATION_PASS_1_AUTH_PROPERTY_ROOM_REPORT.md → 06_frontend/integrations/FRONTEND_INTEGRATION_PASS_1_AUTH_PROPERTY_ROOM_REPORT.md
FRONTEND_INTEGRATION_PASS_2_RESIDENT_OCCUPANCY_REPORT.md → 07_modules/resident-occupancy/FRONTEND_INTEGRATION_PASS_2_RESIDENT_OCCUPANCY_REPORT.md
RESIDENT_OCCUPANCY_API_V1_2_MIGRATION_REPORT.md → 07_modules/resident-occupancy/RESIDENT_OCCUPANCY_API_V1_2_MIGRATION_REPORT.md
RESIDENT_OCCUPANCY_BUSINESS_AUDIT.md → 07_modules/resident-occupancy/RESIDENT_OCCUPANCY_BUSINESS_AUDIT.md
API_SPEC_INVOICE_ZALO_HARDENING_REPORT.md → 07_modules/invoice-zalo/API_SPEC_INVOICE_ZALO_HARDENING_REPORT.md
INVOICE_ZALO_API_MIGRATION_REPORT.md → 07_modules/invoice-zalo/INVOICE_ZALO_API_MIGRATION_REPORT.md
PROPERTY_ROOM_API_V1_2_MIGRATION_REPORT.md → 07_modules/property-room/PROPERTY_ROOM_API_V1_2_MIGRATION_REPORT.md
CONTRACT_API_V1_2_MIGRATION_REPORT.md → 07_modules/contract/CONTRACT_API_V1_2_MIGRATION_REPORT.md
CONTRACT_API_V1_3_MIGRATION_REPORT.md → 07_modules/contract/CONTRACT_API_V1_3_MIGRATION_REPORT.md
CONTRACT_API_V1_3_RESIDENT_SUCCESSOR_PRIVACY_FIX_REPORT.md → 07_modules/contract/CONTRACT_API_V1_3_RESIDENT_SUCCESSOR_PRIVACY_FIX_REPORT.md
LOCAL_DEV_STARTUP_REPORT.md → 10_operations/LOCAL_DEV_STARTUP_REPORT.md
REPOSITORY_CLEANUP_REPORT.md → 10_operations/REPOSITORY_CLEANUP_REPORT.md
MIGRATION_GAP_REPORT.md → 08_audits/MIGRATION_GAP_REPORT.md
Tom_tat_chinh_sua_Goc_tro.md → 11_project-reports/Tom_tat_chinh_sua_Goc_tro.md
design/wireframes/wireframe-quan-ly-khach-thue-v2.html → 06_frontend/design/wireframes/wireframe-quan-ly-khach-thue-v2.html
```

## Kiểm tra

- Nguồn: 22 file; đích: đủ 22 file đã phân loại; thêm 4 file governance/navigation/report mới.
- Task report không còn nằm trực tiếp tại `docs/` root; root chỉ có README, catalog và quy tắc.
- Tài liệu Resident/Occupancy được xếp theo module trước loại kỹ thuật.
- Các thư mục nhóm trong cây chuẩn đã được tạo; `99_archive/` để trống vì không có tài liệu nào được xác định cần archive.
- `docs/HARDENING/` vốn rỗng đã được bỏ sau khi kiểm tra; không chứa file bị xóa.
- Tham chiếu canonical Requirements/API được giữ ngoài repo và dẫn tới project liền kề.
- Kiểm tra link Markdown: quét 26 file Markdown trong SmartRentalManagement (bao gồm root README) — 0 link hỏng.

## Giới hạn và xác nhận phạm vi

Không sửa Requirement, API contract, schema, Prisma, migrations, seed, backend/frontend business logic. Không đổi quyết định nghiệp vụ hay trạng thái approval/LOCK trong nội dung nguồn. Không commit/push.