# Góc Trọ / SmartRentalManagement

Monorepo Next.js/React frontend, Express/TypeScript API, Prisma 6.12 và PostgreSQL. Node.js 24.11+, npm 11.6+. Database **V1.8** là current locked local/dev baseline: PostgreSQL **18.6**, **40 public tables**. Trạng thái module và các phần chưa hoàn tất nằm trong [Current State](docs/00_CURRENT_STATE.md).

## Source và database authority

- `frontend/`: ứng dụng Next App Router hiện hành; `backend/src/server.ts`: API entrypoint, V1 endpoints dưới `/api/v1`.
- `database/schema.prisma`: mapping ORM hiện hành. SQL vẫn enforce CHECKs/triggers/partial indexes Prisma không thể biểu diễn đầy đủ.
- `database/baselines/v1.8/`: baseline SQL/seed/ERD/validators/migration chính thức, với nguồn và hashes trong `PROVENANCE.json`. Source of Truth hiện hành là `database/baselines/v1.8/` cùng `docs/DATABASE_CHANGELOG.md`; Requirement/API là `docs/01_REQUIREMENTS.md` và `docs/04_API_SPEC.md`. Nguồn sibling cũ chỉ còn là provenance lịch sử.
- `database/migrations/`, các `schema.*.prisma` snapshot và `database/seeds/seed.ts`: lịch sử legacy/demo, **không tương đương V1.8**. Giữ nguyên để tra cứu; không chạy lên V1.8. `db:migrate` đã bị chặn ở root và backend.
- `legacy/`: chỉ còn wireframe, artwork/tham chiếu và JSON demo lịch sử; không còn ứng dụng hoặc launcher demo. Không dùng JSON này làm dữ liệu ứng dụng.
- [Documentation](docs/README.md), [Database setup chi tiết](docs/10_operations/DATABASE_V1_8_SETUP.md).

## Baseline sản phẩm hiện hành — 2026-10-19

Giữ Public Explorer → chi tiết phòng → liên hệ; Auth/Accounts/invitation/quên-reset mật khẩu; các mục sidebar Admin và bốn tab Service (Điện & nước, Fixed, Flexible, Parking); Resident portal cùng chi tiết hợp đồng/tài liệu và entry kỹ thuật liên quan. Provider/storage chưa cấu hình không làm các luồng này trở thành source thừa.

Đã gỡ landing/listing cũ, Amenities/Bookings demo, trang nhập charge chuyển tiếp, hai route deferred ngoài navigation và backend demo/auth cũ. Các URL API đã retire vẫn trả 410; Billing tiếp tục đọc charge/snapshot hiện có. Không triển khai luồng thay thế hoặc đổi database. Chi tiết và kiểm chứng: [migration plan §10](docs/08_audits/LEGACY_TO_CURRENT_MIGRATION_PLAN.md#10-current-product-flow-baseline-and-source-cleanup--2026-10-19).

## A. Máy mới / database mới

1. `npm ci` (hoặc `setup.bat` trên Windows để tạo env templates khi thiếu, cài dependency, setup/inspect database V1.8, provision credential DEV và khởi động app).
2. Copy root `.env.example` → `.env`, `backend/.env.example` → `backend/.env`, `frontend/.env.example` → `frontend/.env.local` **chỉ khi file chưa tồn tại**. Đặt password local riêng và secrets cần thiết; đồng bộ backend URL với instance. Không commit env thật.
3. Nếu dùng Docker: `npm run db:up`. Service `postgres18` dùng image `postgres:18.6`, volume mới `goctro_pg18_v18_data`, mount `/var/lib/postgresql`; không tái dùng PG17 volume. Nếu đã có PostgreSQL native, dùng đúng instance và tạo database trống riêng thay vì chạy thêm container trùng cổng.
4. Cấp URL setup riêng rồi bootstrap/seed theo thứ tự:

```powershell
$env:GOCTRO_SETUP_DATABASE_URL = 'postgresql://goctro:<URL_ENCODED_LOCAL_PASSWORD>@localhost:5432/Goctro_test3?schema=public'
npm run db:bootstrap -- --database Goctro_test3
# Chỉ tiếp tục khi bước trước exit 0.
npm run db:seed -- --database Goctro_test3
npm run db:inspect -- --database Goctro_test3
Remove-Item Env:GOCTRO_SETUP_DATABASE_URL
npm run db:validate
npm run db:generate
npm run dev:all
```

Bootstrap áp dụng đúng SQL V1.8, chỉ vào database đã tồn tại có schema trống. Seed là tùy chọn, chỉ chấp nhận schema V1.8 chính xác với cả 40 bảng chưa có dữ liệu. Chạy lại bootstrap/seed sẽ bị từ chối, không ghi đè. Công cụ setup không tự đọc `DATABASE_URL`/`.env` thật, không DROP/reset hoặc tự áp migration cũ. Seed có dữ liệu synthetic và không có password login mặc định; provision DEV credential riêng theo tài liệu.

`setup.bat` không tự tạo database/apply schema/seed. `db:down` chỉ stop service PG18 và giữ volume. Launcher mặc định yêu cầu `localhost:5432/Goctro_test3`, FE `http://localhost:3000`, BE `http://localhost:4000`, login `/login`. Kiểm tra `/api/health`, `/api/health/db`, `/api/v1/auth/csrf`. Database port/tên khác cần backend local config và `npm run dev`; xem hướng dẫn chi tiết.

## B. Database đã có dữ liệu

Xác định instance/version/schema, sao lưu và đánh giá khác biệt trước. `db:inspect -- --database NAME` với URL setup riêng chỉ đọc/so catalog V1.8. Không chạy bootstrap/seed/migration legacy trên dữ liệu hiện có, không dùng `migrate resolve` khi chưa chứng minh equivalence. Artifact upgrade V1.7→V1.8 được giữ để review; task này không cung cấp lệnh nâng cấp tự động cho DB populated/legacy. Không dùng SQL clean-install làm migration và không gắn PG17 volume vào PG18.

## Kiểm chứng tooling

`npm run test:db-setup` kiểm tra guards/config; `npm run test:db-setup:runtime` yêu cầu cluster PostgreSQL disposable riêng qua `GOCTRO_V18_TEST_ADMIN_URL` (role `v18_smoke`, local, port khác 5432). Chi tiết kết quả và giới hạn Docker/Windows DLL lock trong [DATABASE_V1_8_SETUP.md](docs/10_operations/DATABASE_V1_8_SETUP.md). Không coi schema hoặc UI tồn tại là bằng chứng mọi module đã hoàn tất.
