# Góc Trọ — Pre-Git Cleanup Step 3: Tracked Deletion Review

**Ngày:** 2026-10-15  
**Phạm vi:** Review-only cho ba tracked deletions; không stage, restore, xóa, refactor hoặc audit legacy retirement.  
**Nguồn:** `git status --short`, `git diff --name-status`, Git `HEAD`, các replacement trong docs tree, `DOCS_REORGANIZATION_REPORT.md`, `docs/DOCUMENT_CATALOG.md`, repository-wide path/reference search.

## 1. Git deletion state

`git status --short` và `git diff --name-status` xác nhận cả ba file dưới đây là tracked deletions (`D`) trong working tree:

```text
D docs/DOMAIN_MODEL.md
D docs/Tom_tat_chinh_sua_Goc_tro.md
D docs/design/wireframes/wireframe-quan-ly-khach-thue-v2.html
```

Deletion đã có trước Step 3. Các replacement đều đang hiện là untracked; Git chưa ghi nhận đây là rename cho tới khi người dùng stage sau này.

## 2. DOMAIN_MODEL.md

- **Replacement:** `docs/02_architecture/DOMAIN_MODEL.md`.
- **Intent:** Move/reorganize có chủ ý. `docs/11_project-reports/DOCS_REORGANIZATION_REPORT.md` ngày 2026-10-09 liệt kê rõ mapping `DOMAIN_MODEL.md → 02_architecture/DOMAIN_MODEL.md` và nói đã chuyển đủ tài liệu mà không xóa nội dung.
- **Content comparison:** Mostly identical. So sánh bản `HEAD` với replacement cho thấy 4 dòng nội dung khác nhau: tiêu đề/mô tả phạm vi và ba đường dẫn tương đối được cập nhật cho vị trí mới. Không tìm thấy chủ đề hay quy tắc domain duy nhất chỉ có ở bản cũ.
- **Catalog:** Đã trỏ tới replacement `02_architecture/DOMAIN_MODEL.md`, trạng thái `HISTORICAL`; mô tả rõ tài liệu này nói về legacy/demo model, không phải authority schema/API V1 hiện tại.
- **References:** Các link hiện hành trong README, docs README, MIGRATION_GAP_REPORT và chính replacement đều trỏ vị trí mới. Literal old path còn trong audit plan/Step 2 chỉ mô tả deletion hoặc làm checklist; không phải link runtime/documentation đang được dùng.
- **Decision:** **KEEP DELETION**.

## 3. Tom_tat_chinh_sua_Goc_tro.md

- **Replacement:** `docs/11_project-reports/Tom_tat_chinh_sua_Goc_tro.md`.
- **Intent:** Move/reorganize có chủ ý, được ghi trong `DOCS_REORGANIZATION_REPORT.md` ngày 2026-10-09.
- **Content comparison:** Identical sau chuẩn hóa line endings; cùng 42 dòng và không có nội dung bị mất.
- **Catalog:** Đã trỏ replacement trong `11_project-reports/`, trạng thái `HISTORICAL`.
- **References:** Backlink từ `docs/02_architecture/DOMAIN_MODEL.md` trỏ tới replacement. Old-path literal chỉ xuất hiện trong audit/checklist lịch sử; không có link hiện hành bị hỏng.
- **Decision:** **KEEP DELETION**.

## 4. Resident wireframe

- **Replacement:** `docs/06_frontend/design/wireframes/wireframe-quan-ly-khach-thue-v2.html`.
- **Intent:** Move/reorganize có chủ ý, được ghi trong `DOCS_REORGANIZATION_REPORT.md` ngày 2026-10-09.
- **Content comparison:** Git blob của replacement khớp chính xác blob `HEAD` của file cũ (`a4db133aa2bd665001efc5e1bf31e57b56d03946`). Nội dung byte-for-byte giống nhau.
- **Catalog:** Đã trỏ replacement ở `06_frontend/design/wireframes/`, trạng thái `REFERENCE`; đây là design source, không phải API contract.
- **References:** Không tìm thấy link hiện hành tới old path. Catalog và Step 1 allowlist trỏ vị trí mới; old-path literal trong audit/Step 2 chỉ là ghi nhận deletion hoặc đầu vào review.
- **Decision:** **KEEP DELETION**.

## 5. Content comparison summary

| Old path | Replacement | Comparison | Unique old content | Content preserved? |
|---|---|---|---|---|
| `docs/DOMAIN_MODEL.md` | `docs/02_architecture/DOMAIN_MODEL.md` | Mostly identical; tiêu đề/phạm vi và relative links được cập nhật | Không thấy nội dung domain riêng ở bản cũ | Có, replacement giữ nội dung và cập nhật đường dẫn |
| `docs/Tom_tat_chinh_sua_Goc_tro.md` | `docs/11_project-reports/Tom_tat_chinh_sua_Goc_tro.md` | Identical | Không | Có, giống hệt |
| `docs/design/wireframes/wireframe-quan-ly-khach-thue-v2.html` | `docs/06_frontend/design/wireframes/wireframe-quan-ly-khach-thue-v2.html` | Byte-identical Git blob | Không | Có, giống hệt |

## 6. Old-path reference audit

Search toàn repository (bỏ qua dependency/build output) cho exact old paths và basename. Tại thời điểm tìm kiếm, trước khi tạo report này:

| Old path | Exact old-path mentions | Files mentioning old path | Broken active reference? |
|---|---:|---|---|
| `docs/DOMAIN_MODEL.md` | 2 | `docs/08_audits/PRE_GIT_REPOSITORY_AUDIT_AND_CLEANUP_PLAN.md`; `docs/08_audits/PRE_GIT_STEP_2_STAGING_ALLOWLIST.md` | Không. Đây là audit/checklist, không phải link sử dụng. |
| `docs/Tom_tat_chinh_sua_Goc_tro.md` | 2 | Cùng hai audit/checklist trên | Không. Link trong DOMAIN_MODEL replacement dùng đường dẫn mới. |
| `docs/design/wireframes/wireframe-quan-ly-khach-thue-v2.html` | 2 | Cùng hai audit/checklist trên | Không. Catalog dùng đường dẫn mới. |

Các nội dung `DOMAIN_MODEL.md` hoặc basename trong DOCS_REORGANIZATION_REPORT là bảng lịch sử ánh xạ nguồn → đích, không phải path dependency bị hỏng. Không cần sửa references trong Step 3. Không tìm thấy link hiện hành nào trỏ vào ba old paths.

## 7. Decision table

| Old Path | Replacement | Deletion Intentional? | Content Preserved? | References Clean? | Decision | Reason |
|---|---|---|---|---|---|---|
| `docs/DOMAIN_MODEL.md` | `docs/02_architecture/DOMAIN_MODEL.md` | Có, move được ghi trong report tổ chức docs | Có; nội dung được giữ, các relative paths cập nhật | Có; Catalog và links hiện hành dùng path mới | **KEEP DELETION** | Replacement hợp lệ, được Catalog ghi là HISTORICAL và không có nội dung domain độc nhất ở bản cũ. |
| `docs/Tom_tat_chinh_sua_Goc_tro.md` | `docs/11_project-reports/Tom_tat_chinh_sua_Goc_tro.md` | Có, move được ghi trong report tổ chức docs | Có; nội dung giống hệt | Có; Catalog/backlink dùng path mới | **KEEP DELETION** | Chỉ thay vị trí lưu; bản mới giữ đầy đủ lịch sử. |
| `docs/design/wireframes/wireframe-quan-ly-khach-thue-v2.html` | `docs/06_frontend/design/wireframes/wireframe-quan-ly-khach-thue-v2.html` | Có, move được ghi trong report tổ chức docs | Có; Git blob giống hệt | Có; Catalog dùng path mới | **KEEP DELETION** | Replacement ở đúng nhóm frontend design/wireframes; không mất asset thiết kế. |

## 8. Exact action

Với cả ba file: **giữ deletion**, không restore và không merge. Khi staging được ủy quyền ở bước sau, add replacement paths tương ứng cùng deletion cũ để Git có thể nhận diện move; task này chưa stage gì.

## 9. Step 4 input — Legacy Retirement Audit

Step 4 sẽ audit riêng các nhóm legacy sau, không thuộc phạm vi Step 3:

- `legacy/`.
- Các backend route unversioned cũ trong `backend/src/app.ts`.
- `/admin/amenities` và `/admin/bookings`.
- Backend endpoints của complaint/viewing workflow cũ.
- Mock/demo/localStorage code cũ.
- Retired handlers còn phía sau middleware trả 410.
- Assets cũ.
- Compatibility-only code.

Step 4 chưa được thực hiện.

## 10. Completion / limits

- Ba deletions đều có replacement được báo cáo tổ chức tài liệu ghi nhận; Catalog đã dùng path mới.
- Không phát hiện mất nội dung hoặc broken active old-path reference.
- Chỉ tạo review này. Không stage, restore, xóa, sửa Catalog, refactor hay thực hiện Legacy Retirement Audit.
