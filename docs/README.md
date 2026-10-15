# SmartRentalManagement documentation

Tài liệu được phân nhóm theo nguồn và phạm vi để dễ tìm, đồng thời giữ nguyên lịch sử của các quyết định và lần triển khai. Hãy bắt đầu từ catalog để biết tài liệu nào đang hiện hành, tham khảo hay đã được thay thế.

## Bắt đầu

- [Document catalog](DOCUMENT_CATALOG.md) — danh mục, module và trạng thái từng tài liệu.
- [Documentation rules](DOCUMENTATION_RULES.md) — quy tắc tạo, cập nhật và lưu report.
- [Architecture: legacy domain model](02_architecture/DOMAIN_MODEL.md) — tài liệu tham khảo về ứng dụng cũ, không phải schema/API authority hiện hành.
- [Database Prisma mapping](03_database/prisma/) — các report mapping theo phiên bản; xem catalog để phân biệt baseline hiện hành và lịch sử.
- [Module documentation](07_modules/) — tài liệu theo từng domain; module-first được ưu tiên.
- [Operations](10_operations/) — khởi động local và vận hành workspace.
- [Project reports](11_project-reports/) — báo cáo tổng hợp dự án.
- [Decisions](12_decisions/) — decision records.

## Cấu trúc

```text
docs/
├── 00_overview/                    Tổng quan dự án
├── 01_requirements/                Requirement mirror/notes (không thay canonical source)
├── 02_architecture/                Kiến trúc và domain model
├── 03_database/
│   ├── prisma/                     Prisma mapping và report
│   └── migrations/                 Kế hoạch/ghi nhận migration dữ liệu
├── 04_api/                         API notes (không thay canonical API Spec)
├── 05_backend/{auth,hardening}/     Backend foundation, auth và hardening
├── 06_frontend/{integrations,design/} Tích hợp FE và thiết kế/wireframe
├── 07_modules/                     Tài liệu theo domain nghiệp vụ
├── 08_audits/                      Audit liên miền/toàn repository
├── 09_testing/                     Kế hoạch và kết quả kiểm thử
├── 10_operations/                  Local development và vận hành
├── 11_project-reports/             Báo cáo tổng hợp
├── 12_decisions/                   Quyết định nghiệp vụ/kiến trúc
└── 99_archive/                     Chỉ dùng cho tài liệu đã được xác định là archive
```

## Canonical product documents

Requirement và API Spec canonical của workspace hiện nằm trong project tài liệu liền kề, không được di chuyển hoặc sao chép vào đây:

- [01_REQUIREMENTS.md](../../GocTro-SmartBuilding/docs/01_REQUIREMENTS.md)
- [04_API_SPEC.md](../../GocTro-SmartBuilding/docs/04_API_SPEC.md)

Physical database authority và baseline hiện hành được ghi trong project tài liệu đó cùng database version artifacts. Prisma mapping của ứng dụng nằm tại [`database/schema.prisma`](../database/schema.prisma).

Thư mục `99_archive/` hiện được giữ làm đích quy ước; không có tài liệu nào bị đưa vào archive chỉ vì đã cũ. Tài liệu lịch sử và tài liệu bị supersede vẫn được giữ tại nhóm chủ đề thích hợp, với trạng thái rõ trong catalog.