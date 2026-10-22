# Database V1.8 — setup database mới và kiểm tra database hiện có

Ngày: 2026-10-16. Trạng thái: implementation + PostgreSQL native rehearsal PASS; Docker engine/image pull chưa kiểm chứng trên máy này.

## Nguồn chuẩn và quan hệ với Prisma

Canonical là `database/baselines/v1.8/{schema.sql,seed.sql,erd.md,runtime_validator.sql,runtime_validator_fixture.sql}` và `docs/DATABASE_CHANGELOG.md`. Changelog ghi V1.8 LOCK local/dev, PostgreSQL 18.6, 40 public tables. V1.8 thay uniqueness Parking Invoice để assignment có thể xuất hiện trên nhiều Invoice nhưng không lặp trong cùng Invoice.

Repo ứng dụng chứa baseline tại `database/baselines/v1.8/` để người clone Git không cần project sibling. SQL/seed/migration/ERD/validators và bản `SOURCE_DATABASE_CHANGELOG.md` được copy nguyên byte, không thay schema hoặc nghiệp vụ. `PROVENANCE.json` ghi nguồn gốc lịch sử, vị trí canonical hiện tại và hashes; fingerprint trong `expected-catalog.json` được tạo từ chính SQL đó trên PostgreSQL 18.6 sạch và sắp xếp độc lập collation/locale.

`database/schema.prisma` là mapping hiện hành của 40 bảng. Prisma không thể biểu diễn đầy đủ CHECKs, partial indexes và triggers; SQL tiếp tục enforce. `database/migrations/` là lịch sử demo cũ, không tương đương V1.8 và không dùng chung bằng cách chạy nối lên baseline SQL. Root/backend `db:migrate` trả exit 1 và hướng dẫn lệnh đúng, không gọi Prisma/DB. Không dùng `db push`, reset hoặc `migrate resolve` làm shortcut.

## A. Máy mới / database mới

Yêu cầu Node.js 24.11+, npm 11.6+, PostgreSQL 18.6 (hoặc 18.x mới hơn sau kiểm tra tương thích). Docker Compose v2 nếu dùng Docker; PostgreSQL native cũng được. Bootstrap/seed chỉ nhận local host, public schema và tên database xác nhận, không nhận database `postgres`/template.

Tại repo root, PowerShell:

```powershell
npm ci
# Chỉ copy khi file đích chưa tồn tại; không ghi đè cấu hình local.
if (!(Test-Path .env)) { Copy-Item .env.example .env }
if (!(Test-Path backend/.env)) { Copy-Item backend/.env.example backend/.env }
if (!(Test-Path frontend/.env.local)) { Copy-Item frontend/.env.example frontend/.env.local }
```

Sửa các file local bằng editor: root `.env` dành cho Compose; `backend/.env` dành cho API. Đặt password riêng cho máy, không dùng placeholder; đồng bộ user/password/host/port/database giữa hai file. Password trong PostgreSQL URL phải được URL-encode. Backend còn cần `SESSION_SECRET` ngẫu nhiên ít nhất 32 bytes và Contract idempotency keys theo template/backend yêu cầu. Không commit các file này.

**Docker mới:**

```powershell
docker compose --env-file .env config --quiet
npm run db:up
```

Compose dùng service mới `postgres18`, image `postgres:18.6`, volume riêng `goctro_pg18_v18_data`, mount `/var/lib/postgresql`, PGDATA `/var/lib/postgresql/18/docker`, bind local-only. Không dùng volume PG17 `postgres_data`. `db:up` không dừng/xóa container cũ; nếu cổng 5432 đã có PostgreSQL native/PG17 thì xử lý rõ instance/port trước, không chạy thêm instance trùng cổng. `POSTGRES_DB` chỉ được image tạo khi volume hoàn toàn mới; sửa biến không đổi database trong volume đã tồn tại. `db:down` chỉ stop service PG18 và giữ data volume.

Image/tag và mount PG18 được mô tả tại [Docker Official Postgres](https://hub.docker.com/_/postgres) và [Docker PostgreSQL guide](https://docs.docker.com/guides/postgresql/networking-and-connectivity/). Máy audit không có Docker CLI nên chưa chạy `compose config`, pull image hoặc start container; native PostgreSQL 18.6 đã được kiểm thử thật. Không suy từ native PASS thành Docker runtime PASS.

**PostgreSQL native mới:** không cần `db:up`. Tạo database trống bằng pgAdmin hoặc `createdb` của đúng instance, với owner/user sẽ chạy bootstrap. Ví dụ (tên role tùy máy; sẽ được hỏi password):

```powershell
createdb -h localhost -p 5432 -U goctro Goctro_test3
```

**Cài schema và seed:** công cụ không tự đọc `.env`/`DATABASE_URL` để tránh vô tình dùng DB đang chạy. Cấp biến đích setup riêng và xác nhận đúng tên DB. Ví dụ bên dưới là placeholder; thay bằng credentials của database mới trên máy:

```powershell
$env:GOCTRO_SETUP_DATABASE_URL = 'postgresql://goctro:<URL_ENCODED_LOCAL_PASSWORD>@localhost:5432/Goctro_test3?schema=public'
npm run db:bootstrap -- --database Goctro_test3
if ($LASTEXITCODE -ne 0) { throw 'Bootstrap failed; stop here.' }
npm run db:seed -- --database Goctro_test3
if ($LASTEXITCODE -ne 0) { throw 'Seed failed; stop here.' }
npm run db:inspect -- --database Goctro_test3
if ($LASTEXITCODE -ne 0) { throw 'Baseline inspection failed.' }
Remove-Item Env:GOCTRO_SETUP_DATABASE_URL
npm run db:validate
npm run db:generate
```

Seed là tùy chọn cho DB mới; bỏ bước seed nếu muốn dữ liệu nghiệp vụ trống. Schema tồn tại với 40 bảng không có row là điều kiện seed hợp lệ. Seed chứa identities giả, email `.test`, password hashes từ secrets ngẫu nhiên đã bỏ; không có mật khẩu login mặc định.

Trên Windows, `setup.bat` gọi helper tương tác để kiểm tra target local, phân loại trạng thái database bằng truy vấn READ ONLY, bootstrap/seed khi người dùng xác nhận đúng nhánh, cho chọn provision/reset credential và khởi động qua `dev:all`. Không ghi đè env có sẵn âm thầm. Database chưa tồn tại mới được hỏi tạo rồi gọi `createdb`; database có public schema trống được hỏi bootstrap trực tiếp, không tạo lại database; schema không tương thích, lỗi auth/kết nối hoặc target identity sai đều dừng trước mọi ghi. Schema V1.8 trống được hỏi seed; database V1.8 đã có dữ liệu bỏ qua bootstrap/seed nhưng vẫn cho mở luồng credential. `INITIAL` không ghi đè credential đã provision; `RESET` là lựa chọn riêng và yêu cầu xác nhận của công cụ.

`npm run db:state -- --database NAME` là phép kiểm tra READ ONLY hỗ trợ helper: trả `empty_schema`, `v18_empty` hoặc `v18_populated`; schema drift trả lỗi `schema_incompatible`. `npm run db:inspect` vẫn là kiểm tra catalog nghiêm ngặt. So sánh catalog không dùng thứ tự vật lý cột; vẫn so tên, kiểu, default, nullability, identity/generated và các cấu trúc khác. Hai biến thể comment đã được xác minh của riêng `room_images_lock_parent_before_insert_fn` được đối chiếu tương đương; function logic, constraint, index, trigger hoặc thuộc tính khác thay đổi vẫn bị chặn. Không xóa comment bằng regex trên SQL/function body.

Sau khi bootstrap và seed V1.8 trên database local/dev PostgreSQL 18, chạy PowerShell `$env:NODE_ENV='development'; npm run dev:provision-credentials --workspace=@goctro/backend` (bí danh cũ `dev:provision-admin` vẫn dùng được). Công cụ yêu cầu `NODE_ENV=development`, loopback:5432, database không phải database hệ thống, đúng catalog V1.8 (40 bảng), rồi yêu cầu chọn rõ `INITIAL` hoặc `RESET` và nhập/xác nhận riêng hai mật khẩu ẩn, dài 12–1024 ký tự. Cặp được hỗ trợ là Admin `admin.one@example.test` và Resident `resident.one@example.test` (profile 1001); profile này có số `+84000000101` trong seed nhưng số đó không hợp lệ theo Auth V1, nên công cụ không nới validation và dùng email làm định danh Resident fallback. Resident 1001 phải có occupancy active và hợp đồng active. `INITIAL` từ chối nếu credential đã có dấu hiệu được provision; `RESET` bắt buộc gõ đúng tên database để xác nhận. Công cụ chỉ cập nhật hai Account tồn tại trong một transaction, không mở khóa, đổi role, đổi status, tạo Account hay lưu mật khẩu thuần. Không dùng trên account thật.

Sau khi cấu hình backend đúng database đã dựng, chạy `npm run dev:all` (hoặc `launch.bat`). Kiểm tra `http://localhost:4000/api/health`, `/api/health/db`, `/api/v1/auth/csrf` và frontend `http://localhost:3000`. Launcher hiện cố định DB `localhost:5432/Goctro_test3`; nếu chủ động dùng port/tên DB khác cho development, cấu hình backend tương ứng và dùng `npm run dev`, không bỏ guard launcher một cách âm thầm.

`setup.bat` hỗ trợ tạo templates khi thiếu, `npm ci`, generate Prisma; nó không chạy SQL/migration/seed tự động. Đã dùng `call npm` để batch Windows tiếp tục sau từng lệnh. Khi Prisma generate báo DLL `EPERM`, dừng đúng process của project đang giữ engine rồi chạy lại theo quy trình vận hành của bạn; không kill toàn bộ Node. Generate không kết nối DB. Lượt audit xác nhận PID 536 đang giữ DLL, nên không thay thế client tại chỗ; generation vào output thử nghiệm riêng được kiểm tra riêng.

## Cơ chế bảo vệ

- `db:bootstrap` không tạo database container/role: database phải tồn tại và public schema phải chưa có table/sequence/type/routine/index hoặc history. Custom user schemas cũng bị từ chối. `_prisma_migrations` tồn tại là blocker. Không DROP/TRUNCATE/reset/ghi đè.
- URL setup phải local, `--database NAME` khớp URL và identity server; yêu cầu PostgreSQL 18.6+ trong major 18. Không fallback sang `.env` thật. Thông báo chỉ hiện tên DB/host/port; lỗi SQL chỉ hiện mã, không in connection string, credentials hoặc detail chứa dữ liệu.
- Schema/seed/catalog hashes phải khớp provenance. Bootstrap dùng SQL V1.8, không chạy migration V1.7→V1.8 hoặc legacy Prisma migrations sau đó.
- Seed so catalog cấu trúc với V1.8 (columns/defaults, constraints/FKs/CHECKs, partial indexes, triggers/functions, types, sequences, RLS policies); không chỉ đếm 40 bảng. Ownership/OIDs/sequence-current-values được loại khỏi so sánh vì phụ thuộc môi trường. Thứ tự vật lý cột không phải thuộc tính tương thích; function chỉ có hai comment variant đã xác minh mới được chuẩn hóa, còn thay đổi logic vẫn fail.
- Mã lỗi inspect/state được phân biệt: `2` database chưa tồn tại, `3` auth/quyền, `4` lỗi kết nối, `5` schema không tương thích, `6` server identity không đúng target. Helper chỉ gọi `createdb` ở mã `2`; không suy ra database mới/trống từ mọi lỗi inspect.
- Seed khóa cả 40 bảng và kiểm tra không bảng nào có row. Nó từ chối nếu có dữ liệu, kể cả dữ liệu mẫu từ lần trước. Các `ON CONFLICT` trong SQL gốc không được dùng để hợp thức hóa seed lên DB đã có dữ liệu. Đây là one-shot seed, không tuyên bố idempotent.
- Mỗi write command giữ advisory transaction lock, chạy preflight → SQL → kiểm tra catalog → COMMIT trong một transaction; wrapper bỏ đúng BEGIN/COMMIT ngoài cùng của file canonical. Lỗi sẽ ROLLBACK và exit nonzero. PostgreSQL sequence `setval`/identity allocation có thể tiến sau lỗi dù row/DDL rollback; vì seed chỉ chạy trên bảng trống nên không ghi đè nghiệp vụ. Có thể chạy lại sau khi đã xác nhận schema đúng và tất cả bảng vẫn trống.
- Cần maintenance window khi seed: lock timeout 5 giây, statement timeout 120 giây. Không dùng wrapper làm migration online hoặc công cụ sửa schema drift. Catalog/hashes không phải cơ chế chống người sửa source có chủ ý; không tái tạo chúng để vượt guard.

## B. Database đã có dữ liệu

1. Xác định đúng host/port/database, `SELECT current_database(), inet_server_port(), version()` trong công cụ quản trị. Không dùng source template làm bằng chứng cho instance thực tế.
2. Sao lưu database và kiểm tra khả năng phục hồi. So version, tables, constraints/indexes/triggers với baseline nguồn. Có thể dùng `GOCTRO_SETUP_DATABASE_URL` và `npm run db:inspect -- --database NAME` để kiểm tra catalog read-only; lệnh trả nonzero nếu schema/version không khớp, không tự sửa.
3. Không chạy bootstrap/seed/legacy migration trên database này. Bootstrap cũng từ chối DB có schema nhưng chưa có dữ liệu; trường hợp đó chỉ seed được nếu catalog chính xác và toàn bộ bảng trống.
4. Artifact V1.7→V1.8 tồn tại và có bằng chứng rehearsal/apply lịch sử, nhưng không được npm tooling này tự động áp dụng. DB legacy hoặc version khác không có upgrade tự động được cung cấp trong task này. Phải review khác biệt, có kế hoạch migration riêng, backup, rehearsal trên bản sao và approval đúng target trước khi nâng.
5. Không mount PG17 data volume vào PG18. Nâng major PostgreSQL cần quy trình dump/restore hoặc pg_upgrade phù hợp và kiểm chứng riêng; đổi image không phải migration.

## Kiểm chứng và tái chạy tests

```powershell
npm run test:db-setup
# Trên một cluster disposable riêng, tuyệt đối không port 5432:
$env:GOCTRO_V18_TEST_ADMIN_URL = 'postgresql://v18_smoke@127.0.0.1:55448/postgres'
npm run test:db-setup:runtime
Remove-Item Env:GOCTRO_V18_TEST_ADMIN_URL
```

Integration suite bắt buộc role `v18_smoke`, host local và cổng khác 5432; nó chỉ tạo/xóa database mới có prefix `goctro_setup_test_`. Không tự lấy credentials hoặc URL của database đang chạy. Có thể tạo cluster test bằng `initdb -D <THU_MUC_TEST_MOI> -U v18_smoke -A trust --encoding=UTF8 --no-locale`, rồi `pg_ctl -D <THU_MUC_TEST_MOI> -l <LOG_TEST> -o "-h 127.0.0.1 -p 55448" -w start`; trust này chỉ dành cho cluster disposable bind loopback, phải stop/remove sau test. Không dùng data directory hiện có. Windows sandbox có thể chặn initdb/socket; cần chạy test bằng host shell có quyền tạo cluster. Runtime suite hiện kiểm tra thêm state của schema trống/V1.8 empty/populated, retry sau seed rollback và function logic drift.

Kết quả lượt 2026-10-16: unit guards/config/Windows batch/collation 10/10; runtime suite 12/12 (11 checks + parent suite); SQL V1.8 40 bảng, seed trên schema trống, Prisma reads, reject bootstrap/seed chạy lại, app objects, legacy migration history, missing V1.8 Parking index, existing data, rollback DDL/rows khi inject SQL error; canonical CORE 78/78 và FIXTURE 171/171 PASS trong transaction rollback. Windows batch được chạy trong thư mục tạm với npm stub để kiểm tra control flow/giữ env, không reinstall dependencies trên checkout. Các npm command thật root/bootstrap, backend/seed, inspect và cả hai migration-block commands cũng được smoke riêng trên DB disposable. Kiểm tra Prisma validate PASS. Default generate gặp DLL lock từ process hiện có; generate từ cùng schema (chỉ đổi output trong bản tạm) và query qua client mới PASS với Prisma 6.12. Không dừng PID 536. Docker Compose config/pull/runtime chưa chạy vì thiếu Docker CLI.

Database runtime thật, `.env` thật, migrations lịch sử và nguồn sibling lịch sử không bị thay đổi. Không có test data ghi vào Goctro_test3.

Cleanup đã xác nhận: không còn database `goctro_setup_test_*`, cluster disposable đã stop, cổng 55448 đóng, thư mục cluster/client thử nghiệm và các file tạm do lượt này tạo đã được xóa. Backend hiện có được giữ chạy.
