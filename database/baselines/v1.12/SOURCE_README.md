# Góc Trọ / SmartRentalManagement

Monorepo Next.js/React frontend, Express/TypeScript API, Prisma 6.12 và PostgreSQL. Node.js 24.11+, npm 11.6+. Database **V1.11** là baseline Resident đặt lịch tiện ích trên `Goctro_dev_v18`: PostgreSQL **18.6**, **43 public tables**. V1.11 giữ phiên đăng nhập bền vững V1.10 và thêm yêu cầu đặt lịch tiện ích. `Goctro_test3` là target riêng đang giữ V1.10. AWS chưa triển khai. Trạng thái module và phần còn lại nằm trong [Current State](docs/00_CURRENT_STATE.md).

## Clone và điểm bắt đầu bàn giao

```powershell
git clone https://github.com/GiaBao1802/SmartRentalManagement.git
cd SmartRentalManagement
git status --short --branch
```

Đọc [AGENTS.md](AGENTS.md), [Current State](docs/00_CURRENT_STATE.md), [Document Catalog](docs/DOCUMENT_CATALOG.md) và [GitHub handoff readiness](docs/10_operations/GITHUB_HANDOFF_READINESS_2026_10_26.md) trước khi chạy setup hoặc triển khai. Bản GitHub chỉ chứa những file đã được chủ dự án duyệt và commit; thay đổi local chưa commit, file `.env` và dữ liệu PostgreSQL không đi theo lệnh clone. Dùng `setup.bat` trên Windows cho một database local/development mới sau khi đã xác nhận target; nhánh cài lần đầu có thể tạo database, bootstrap, seed và provision tài khoản demo. Không chạy nó như một phép kiểm tra chỉ đọc.

## Source và database authority

- `frontend/`: ứng dụng Next App Router hiện hành; `backend/src/server.ts`: API entrypoint, V1 endpoints dưới `/api/v1`.
- `database/schema.prisma`: mapping ORM hiện hành. SQL vẫn enforce CHECKs/triggers/partial indexes Prisma không thể biểu diễn đầy đủ.
- `database/baselines/v1.11/`: khung dựng mới 43 bảng, migration V1.10→V1.11, validator và catalog hiện hành. V1.10 và V1.9 được giữ nguyên làm predecessor. Source of Truth vật lý local hiện hành là V1.11 cùng `docs/DATABASE_CHANGELOG.md`; Requirement/API là `docs/01_REQUIREMENTS.md` và `docs/04_API_SPEC.md`.
- `database/migrations/`, các `schema.*.prisma` snapshot và `database/seeds/seed.ts`: lịch sử legacy/demo, **không tương đương V1.11**. Giữ nguyên để tra cứu; không chạy các migration legacy. Lệnh `db:migrate` nâng V1.10→V1.11; setup còn nâng tuần tự V1.8→V1.9→V1.10→V1.11.
- `legacy/`: chỉ còn wireframe, artwork/tham chiếu và JSON demo lịch sử; không còn ứng dụng hoặc launcher demo. Không dùng JSON này làm dữ liệu ứng dụng.
- [Documentation](docs/README.md), [Database V1.11 setup chi tiết](docs/10_operations/DATABASE_V1_11_SETUP.md).

### Nguồn triển khai AWS

GitHub `main` là nguồn **mã và khung database**, không chứa bản ghi, mật khẩu hoặc backup từ máy local. Trên AWS, tạo database **mới, trống** bằng [`database/baselines/v1.11/schema.sql`](database/baselines/v1.11/schema.sql), chạy [`runtime_validator.sql`](database/baselines/v1.11/runtime_validator.sql) và chỉ sau đó khởi động backend. Không chạy `setup.bat` để tạo database AWS. Xem [kế hoạch Lightsail](docs/10_operations/AWS_DATABASE_V1_10_PREPARATION.md); kế hoạch đó hiện mô tả snapshot V1.10 và cần cập nhật trước triển khai V1.11.

## Baseline sản phẩm hiện hành — 2026-10-19

Giữ Public Explorer → chi tiết phòng → liên hệ; Auth/Accounts/invitation/quên-reset mật khẩu; các mục sidebar Admin và bốn tab Service (Điện & nước, Fixed, Flexible, Parking); Resident portal cùng chi tiết hợp đồng/tài liệu và entry kỹ thuật liên quan. Provider/storage chưa cấu hình không làm các luồng này trở thành source thừa.

Đã gỡ landing/listing **cũ**, Amenities/Bookings demo, trang nhập charge chuyển tiếp, hai route deferred ngoài navigation và backend demo/auth cũ. Trang giới thiệu **mới** ở `/landing`; `/` và `/rooms` dùng Public Explorer. Các URL API đã retire vẫn trả 410; Billing tiếp tục đọc charge/snapshot hiện có. Cloudy 2D ở frontend có bong bóng gợi ý và chat mô phỏng chỉ trong development; production chưa có chat AI/backend và khóa gửi. Chi tiết và kiểm chứng: [migration plan §10](docs/08_audits/LEGACY_TO_CURRENT_MIGRATION_PLAN.md#10-current-product-flow-baseline-and-source-cleanup--2026-10-19), [Cloudy chat handoff](docs/07_modules/public-marketplace/CLOUDY_CHAT_FRONTEND_HANDOFF.md).

## A. Máy mới / database mới

Trên Windows, mở **`setup.bat`** làm entry duy nhất (menu tiếng Việt):

1. **Cài đặt lần đầu**: cố định **localhost:5432**, user **postgres**, database **Goctro_dev_v18**; chỉ nhập **mật khẩu PostgreSQL** bằng input ẩn nếu chưa có. Không hỏi/đổi host, cổng, user hoặc database. Kiểm tra Node 24.11+/npm 11.6+, cài project theo lockfile khi cần, tạo env còn thiếu và secret local ngẫu nhiên. PostgreSQL 18.6+ phải được cài/chạy sẵn. Xác nhận đúng target trước tạo DB/bootstrap/seed; kết nối sai thì dừng, không tự đổi cấu hình/dịch vụ.
2. **Cập nhật và khởi động**: sau khi tự `git pull`, giữ database/env/credential. Setup nhận V1.8–V1.10, yêu cầu xác nhận đã có backup khôi phục được rồi chạy các migration additive theo thứ tự đến V1.11; nhánh booking local cũ chỉ được phục hồi trên đúng `Goctro_dev_v18`. Không seed/reset dữ liệu hiện có. Dependency không đổi và đã kiểm tra đầy đủ thì bỏ qua `npm ci`; Prisma chỉ generate khi mapping/tooling đổi hoặc client thiếu. Process được xác minh thuộc project sẽ restart khi code/env đổi; process khác giữ nguyên.
3. **Thoát**.

Database cũ chỉ được nâng sau khi xác nhận đúng target và backup; migration giữ dữ liệu, không gán loại cho tiện ích legacy. Schema không tương thích hoặc lỗi kết nối/quyền sẽ dừng. Bootstrap không phải upgrade. Nếu `.env` đã trỏ target khác bộ mặc định, cài lần đầu dừng và hướng dẫn chọn **Cập nhật và khởi động**; không ghi đè file hoặc mở wizard. `Goctro_test3` bị chặn khỏi các migration của module này. Thiếu env/database thì báo chưa hoàn tất cài đặt; target khác bị thiếu phải xử lý cấu hình hiện tại, không tự chuyển target.

Sau seed mới thành công, công cụ tự thiết lập đúng hai Account mẫu đã tồn tại:

| Vai trò | Email | Mật khẩu demo local/dev |
|---|---|---|
| Admin | `admin.one@example.test` | `Goctro123456789` |
| Resident | `resident.one@example.test` | `Goctro123456789` |

Mật khẩu này được chủ động công khai chỉ cho demo local/dev; không dùng làm password PostgreSQL, session secret hoặc credential production. Resident dùng email; phone fixture chưa hợp lệ với Auth V1. Database populated luôn **Sử dụng mật khẩu hiện có**, không tự provision/reset và không hỏi mật khẩu web khi chạy setup. RESET chỉ còn ở công cụ CLI riêng với xác nhận đúng target và hai email (xem hướng dẫn chi tiết). INITIAL chỉ chấp nhận hai hash seed chính xác đã review; credential khác/partial không bị suy đoán hoặc ghi đè.

Setup thành công tự khởi động app và kiểm tra API/DB/frontend, mở `http://localhost:3000/login` để đăng nhập. Lần sau dùng mục **Cập nhật và khởi động**; hai launcher cũ đã gỡ. Provider invitation/reset/Zalo và storage ngoài PostgreSQL cần cấu hình riêng.

Nếu lỗi, đọc bước đã hoàn thành và log `.local/setup`/`.local/dev-all`; lỗi sau seed/provision không yêu cầu seed/reset lại. Lỗi EPERM/DLL: dừng đúng process project đang giữ file; không kill mọi Node hoặc PostgreSQL. Integrity: chạy `npm.cmd run db:verify-artifacts`, giữ nguyên bytes và hash reviewed. PowerShell chặn npm.ps1: dùng `npm.cmd`.

### Lệnh thủ công dành cho developer (không cần chạy thêm sau setup)

1. `npm ci` (hoặc `setup.bat` trên Windows để tạo env templates khi thiếu, cài dependency, setup/inspect database V1.11, provision credential DEV và khởi động app).
2. Copy root `.env.example` → `.env`, `backend/.env.example` → `backend/.env`, `frontend/.env.example` → `frontend/.env.local` **chỉ khi file chưa tồn tại**. Đặt password local riêng và secrets cần thiết; đồng bộ backend URL với instance. Không commit env thật.
3. Nếu dùng Docker: `npm run db:up`. Service `postgres18` dùng image `postgres:18.6`, volume mới `goctro_pg18_v18_data`, mount `/var/lib/postgresql`; không tái dùng PG17 volume. Nếu đã có PostgreSQL native, dùng đúng instance và tạo database trống riêng thay vì chạy thêm container trùng cổng.
4. Cấp URL setup riêng rồi bootstrap/seed theo thứ tự:

```powershell
$newDatabaseName = 'REPLACE_WITH_NEW_EMPTY_DB'
$env:GOCTRO_SETUP_DATABASE_URL = "postgresql://goctro:<URL_ENCODED_LOCAL_PASSWORD>@localhost:5432/${newDatabaseName}?schema=public"
npm run db:bootstrap -- --database $newDatabaseName
# Chỉ tiếp tục khi bước trước exit 0.
npm run db:seed -- --database $newDatabaseName
npm run db:inspect -- --database $newDatabaseName
Remove-Item Env:GOCTRO_SETUP_DATABASE_URL
npm run db:validate
npm run db:generate
.\setup.bat
```

Thay `REPLACE_WITH_NEW_EMPTY_DB`, role `goctro` và `<URL_ENCODED_LOCAL_PASSWORD>` theo database mới đã kiểm tra và do bạn kiểm soát; không sao chép tên database populated trong các report lịch sử. Bootstrap áp dụng đúng SQL V1.11, chỉ vào database đã tồn tại có schema trống. Seed là tùy chọn, chỉ chấp nhận schema V1.11 chính xác với cả 43 bảng chưa có dữ liệu. Chạy lại bootstrap/seed sẽ bị từ chối, không ghi đè. Công cụ setup không tự đọc `DATABASE_URL`/`.env` thật, không DROP/reset. Seed có dữ liệu synthetic và không có password login mặc định; provision DEV credential riêng theo tài liệu.

`db:down` chỉ stop service PG18 và giữ volume. Dùng menu setup cho startup có guard; FE `http://localhost:3000`, BE `http://localhost:4000`, login `/login`. Kiểm tra `/api/health`, `/api/health/db`, `/api/v1/auth/csrf`.

## B. Database đã có dữ liệu

Xác định instance/version/schema, sao lưu và xác minh `pg_restore --list` trước. `db:state -- --database NAME` chỉ đọc và nhận biết V1.8–V1.11; `npm run db:migrate -- --database NAME` nâng V1.10→V1.11 khi catalog khớp chính xác. Setup menu tự áp các bước phiên bản còn thiếu theo thứ tự. Các lệnh không seed/reset dữ liệu hiện có, migration chạy transaction và `Goctro_test3` bị chặn khỏi nâng V1.11. Không dùng SQL clean-install làm migration và không gắn PG17 volume vào PG18. Hướng dẫn cụ thể tại [Database V1.11 setup](docs/10_operations/DATABASE_V1_11_SETUP.md).

## Kiểm chứng tooling

Các suite `test:db-setup`/`test:db-setup:runtime` giữ kiểm chứng regression cho setup. Rehearsal V1.9 và validator 85/85 được ghi trong [Database V1.9 setup](docs/10_operations/DATABASE_V1_9_SETUP.md); V1.11 booking và kiểm tra nâng cấp được ghi trong [Database V1.11 setup](docs/10_operations/DATABASE_V1_11_SETUP.md). Không coi schema hoặc UI tồn tại là bằng chứng mọi module đã hoàn tất.
