# Quy tắc tài liệu

## Chọn nơi lưu

1. Xác định phạm vi nghiệp vụ trước (ví dụ Resident/Occupancy, Contract, Invoice/Zalo, Property/Room). Nếu tài liệu chủ yếu nói về một module, đặt trong `07_modules/<module>/`, kể cả khi loại tài liệu là audit, integration hoặc hardening. **Module-first được ưu tiên hơn loại kỹ thuật.**
2. Với tài liệu thật sự liên miền/toàn dự án, chọn nhóm theo loại: audit ở `08_audits/`, test ở `09_testing/`, vận hành ở `10_operations/`, báo cáo tổng hợp ở `11_project-reports/`, quyết định ở `12_decisions/`.
3. Phân nhóm theo `DOCUMENT_CATALOG.md`. Không tạo thư mục mới nếu đã có nhóm phù hợp.
4. Không đặt task report ở root `docs/`. Root chỉ dành cho `README.md`, `DOCUMENT_CATALOG.md`, `DOCUMENTATION_RULES.md` và canonical document nếu chủ dự án quyết định lưu canonical tại đây.
5. Canonical Requirement/API/database authority được quản lý trong repository này tại `docs/01_REQUIREMENTS.md`, `docs/04_API_SPEC.md`, `docs/DATABASE_CHANGELOG.md` và `database/baselines/v1.10/`. V1.9 và nguồn sibling cũ được giữ như provenance/lịch sử, không phải authority hiện hành.

## Tạo và cập nhật report

Trước khi tạo report mới:

- xác định module/domain và trạng thái tài liệu;
- tìm report cùng loại/chủ đề để nối tiếp hoặc cập nhật nếu phù hợp;
- đặt tên mô tả domain + version/task, không dùng tên chung như `report-final.md`;
- ghi ngày, phạm vi, nguồn đã kiểm tra, trạng thái/kết quả và phần chưa kiểm tra;
- phân biệt rõ `CURRENT`, `REFERENCE`, `HISTORICAL`, `SUPERSEDED`; không nâng trạng thái chỉ dựa trên tuổi của file.

Khi di chuyển/đổi tên tài liệu, tìm toàn repository (Markdown, README, script/config nếu có) và cập nhật mọi link hoặc đường dẫn phụ thuộc. Kiểm tra link nội bộ sau thay đổi. Giữ nguyên lịch sử và nội dung nghiệp vụ; chỉ sửa nội dung khi task cho phép rõ ràng.

## Lịch sử và archive

Tài liệu lịch sử vẫn ở thư mục theo chủ đề và được đánh dấu trong catalog nếu còn hữu ích để hiểu quyết định. Chỉ chuyển vào `99_archive/` khi tài liệu đã được xác định là không còn dùng thường xuyên nhưng cần lưu giữ; không archive chỉ vì có version mới. Không xóa tài liệu trong một lượt sắp xếp nếu không được yêu cầu rõ.

## Phạm vi và authority

Tài liệu trong SmartRentalManagement mô tả source/report của project này. Requirement, API Spec và Database canonical hiện được quản lý trong repository này; report kỹ thuật không tự trở thành source of truth nghiệp vụ.

Hướng dẫn agent áp dụng toàn repository được đặt tại [`../AGENTS.md`](../AGENTS.md). Nếu làm việc trong `frontend/`, đọc thêm [`../frontend/AGENTS.md`](../frontend/AGENTS.md); hướng dẫn frontend chỉ bổ sung quy tắc riêng, không thay Source of Truth.

## SOURCE OF TRUTH + CURRENT STATE WORKFLOW

### Thứ tự thẩm quyền

1. `01_REQUIREMENTS.md` — quy tắc nghiệp vụ.
2. `04_API_SPEC.md` — hợp đồng API.
3. `DATABASE_CHANGELOG.md` và artifacts database hiện hành — sự thật về database vật lý.
4. `00_CURRENT_STATE.md` — checkpoint trạng thái dự án, không phải authority nghiệp vụ.
5. `DOCUMENT_CATALOG.md` — chỉ mục và trạng thái tài liệu.
6. Reports — bằng chứng/lịch sử; kiểm tra ngày và phạm vi trước khi dùng.
7. Agent memory/chat — tiện tham khảo, không có quyền ghi đè repository source of truth.

Khi chat/memory khác repository source of truth, repository source of truth thắng.

### Trước task implementation có ý nghĩa

1. Đọc `DOCUMENTATION_RULES.md`.
2. Đọc `00_CURRENT_STATE.md`.
3. Đọc `DOCUMENT_CATALOG.md`.
4. Đọc canonical docs liên quan đến task.
5. Kiểm tra implementation hiện tại trong source.
6. Đối chiếu source với canonical requirements/contracts/schema và bằng chứng mới nhất.
7. Chỉ sau đó mới sửa file.

Không code trực tiếp từ memory/chat.

### Kết thúc task có ý nghĩa

Đánh giá và chỉ cập nhật tài liệu cần thiết:

- Quy tắc nghiệp vụ đổi → cập nhật `01_REQUIREMENTS.md`.
- API contract đổi → cập nhật `04_API_SPEC.md`.
- Database vật lý/version đổi → cập nhật `DATABASE_CHANGELOG.md` cùng artifacts được cho phép.
- Tạo/thay thế report → cập nhật `DOCUMENT_CATALOG.md`.
- Trạng thái module, blocker, milestone, DB baseline, frozen/deferred hoặc next task đổi → cập nhật `00_CURRENT_STATE.md`.

Không sửa tài liệu nếu không có thay đổi trạng thái/ý nghĩa cần ghi nhận.

### Khi có mâu thuẫn

- Code cũ so với source of truth → sửa code theo source of truth trong phạm vi được giao.
- Tài liệu cũ → chỉ sửa khi có bằng chứng mới đã được chấp thuận.
- Chưa rõ bên nào đúng → dừng phần phụ thuộc, nêu rõ xung đột và bằng chứng; không đoán hoặc âm thầm đổi tài liệu.
