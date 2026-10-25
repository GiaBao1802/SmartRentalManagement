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
createdb -h localhost -p 5432 -U goctro REPLACE_WITH_NEW_EMPTY_DB
```

**Cài schema và seed:** công cụ không tự đọc `.env`/`DATABASE_URL` để tránh vô tình dùng DB đang chạy. Cấp biến đích setup riêng và xác nhận đúng tên DB. Ví dụ bên dưới là placeholder; thay bằng credentials của database mới trên máy:

```powershell
$newDatabaseName = 'REPLACE_WITH_NEW_EMPTY_DB'
$env:GOCTRO_SETUP_DATABASE_URL = "postgresql://goctro:<URL_ENCODED_LOCAL_PASSWORD>@localhost:5432/${newDatabaseName}?schema=public"
npm run db:bootstrap -- --database $newDatabaseName
if ($LASTEXITCODE -ne 0) { throw 'Bootstrap failed; stop here.' }
npm run db:seed -- --database $newDatabaseName
if ($LASTEXITCODE -ne 0) { throw 'Seed failed; stop here.' }
npm run db:inspect -- --database $newDatabaseName
if ($LASTEXITCODE -ne 0) { throw 'Baseline inspection failed.' }
Remove-Item Env:GOCTRO_SETUP_DATABASE_URL
npm run db:validate
npm run db:generate
```

Seed là tùy chọn cho DB mới; bỏ bước seed nếu muốn dữ liệu nghiệp vụ trống. Schema tồn tại với 40 bảng không có row là điều kiện seed hợp lệ. Seed chứa identities giả, email `.test`, password hashes từ secrets ngẫu nhiên đã bỏ; không có mật khẩu login mặc định.
Thay `REPLACE_WITH_NEW_EMPTY_DB`, role và password placeholder bằng target mới đã kiểm tra trước khi chạy; ví dụ này không nhằm vào `Goctro_test3` populated được ghi trong các report lịch sử.

Kiểm tra artifact offline bằng `npm.cmd run db:verify-artifacts` trước setup: lệnh đối chiếu raw-byte SHA-256 của toàn bộ 9 artifact trong `PROVENANCE.json` với working tree và Git HEAD, đồng thời kiểm tra attribute `text` đã unset. Không kết nối database và không cần dependency npm. Toàn bộ cây `database/baselines/v1.8/**` dùng `-text` để giữ đúng bytes reviewed (kể cả line ending hỗn hợp); không normalize LF/CRLF hoặc regenerate hash để vượt guard. Trước khi phát hành, chạy lại lệnh trên checkout sạch của commit cần push, kể cả khi Git status ở workspace chính không báo artifact modified.

Trên Windows, `setup.bat` có menu tiếng Việt: **Cài đặt lần đầu**, **Cập nhật và khởi động**, **Thoát**. Batch đặt codepage UTF-8; helper PowerShell có BOM UTF-8 để Windows PowerShell 5.1 đọc đúng dấu. Cửa sổ được giữ khi kết thúc/lỗi. Không có guard npm-stub/test-mode bỏ qua kiểm tra thật. Không ghi đè env hiện có; env backend mới được tạo với session secret và key local ngẫu nhiên. Không dùng mật khẩu demo làm secret.

Chế độ cài lần đầu phân loại database READ ONLY. Database chưa tồn tại mới được hỏi tạo rồi gọi `createdb`; tìm PATH, Program Files PostgreSQL 18 và Windows service executable trước khi báo thiếu tooling. Database có public schema trống được hỏi bootstrap trực tiếp; V1.8 trống được hỏi seed; database có dữ liệu giữ nguyên, mặc định giữ credential. Schema drift báo nhóm/object/thuộc tính khác rồi dừng; lỗi quyền/kết nối không dẫn sang tạo/seed. Không tự cài PostgreSQL hoặc nâng cấp schema.

Chế độ cập nhật yêu cầu người dùng tự pull Git trước. Không tạo database/bootstrap/seed/migration/reset. Dấu vết dependency hash cả ba package manifests, lockfile, Node/npm/platform/arch và cài đặt npm liên quan; kết hợp kiểm tra dependency thật, không chỉ kiểm tra node_modules tồn tại. Chỉ ghi dấu thành công sau npm ci và validation. Dấu vết Prisma xét mapping/tooling và client bị thiếu. Dấu vết runtime xét code/env; restart chỉ process đã xác minh thuộc project, theo PID/thời điểm khởi động và target đã ghi nhận, không lấy health của process cũ làm bằng chứng bản mới chạy.

`npm run db:state -- --database NAME` là phép kiểm tra READ ONLY hỗ trợ helper: trả `empty_schema`, `v18_empty` hoặc `v18_populated`; schema drift trả lỗi `schema_incompatible`. `npm run db:inspect` vẫn là kiểm tra catalog nghiêm ngặt. So sánh catalog không dùng thứ tự vật lý cột; vẫn so tên, kiểu, default, nullability, identity/generated và các cấu trúc khác. Hai biến thể comment đã được xác minh của riêng `room_images_lock_parent_before_insert_fn` được đối chiếu tương đương; function logic, constraint, index, trigger hoặc thuộc tính khác thay đổi vẫn bị chặn. Không xóa comment bằng regex trên SQL/function body.

Sau seed mới, setup tự gọi công cụ provision với `INITIAL`, target chính xác và mật khẩu demo **`Goctro123456789`**. Dùng `hashPassword`/`verifyPassword` hiện hành và policy 12–1024 ký tự. Chỉ hỗ trợ Admin `admin.one@example.test` (Account 1/Owner 1) và Resident `resident.one@example.test` (Account 2/profile 1001, cùng Owner và có occupancy/hợp đồng active). Phone fixture `+84000000101` không được Auth V1 chấp nhận; giữ validation production và dùng email. Guard kiểm tra NODE_ENV development, URL local, identity server, catalog V1.8 và liên kết trước ghi. Transaction cập nhật đúng hai Account, giữ role/status/hồ sơ, không tạo Account. INITIAL chỉ cho phép hai hash khớp chính xác seed reviewed; verify được demo password cho biết đã provision, các trường hợp khác là unknown/partial và bị từ chối INITIAL.

Database populated luôn giữ credential, kể cả khi có hash seed. Không còn câu hỏi RESET trong cả hai nhánh menu. RESET là công cụ riêng, chỉ dành dev: `npm.cmd run dev:provision-credentials --workspace=@goctro/backend -- --mode RESET --database NAME --confirm-target HOST:PORT/NAME --confirm-reset "RESET HOST:PORT/NAME admin.one@example.test resident.one@example.test"`. Phải tự thay NAME/HOST/PORT bằng đúng target đã kiểm tra; không dùng lệnh này như bước cập nhật thông thường. INITIAL dùng cùng CLI với `--mode INITIAL`, không `--confirm-reset`, chỉ khi có bằng chứng hai credential seed nguyên vẹn. STATUS chỉ đọc để kiểm tra; unknown/partial phải review và xác nhận RESET riêng. Không tự provision khi chạy lại menu. Mật khẩu demo chỉ cho local/dev, không dùng cho DB/session/production; chỉ hiện khi vừa provision/reset thành công.

Startup dùng menu setup, hỗ trợ target local/dev đã xác nhận với tên/cổng khác (ví dụ `Goctro_dev_v18`); không khóa tên database và không cần override test. Kiểm tra `http://localhost:4000/api/health`, `/api/health/db`, `/api/v1/auth/csrf`, frontend `http://localhost:3000` và CORS đúng trusted origin. Không chạy thêm launcher sau setup; dùng mục cập nhật để khởi động lại.

Nếu seed thành công nhưng provision/generate/startup lỗi, phần đã hoàn thành được báo rõ; chạy lại không seed lặp. Nếu bootstrap xong nhưng seed rollback, lần sau nhận V1.8 empty và có thể seed lại sau khi khắc phục nguyên nhân. Prisma EPERM/DLL chỉ xử lý process project được xác minh, không kill toàn bộ Node/PostgreSQL. Provider và storage chưa cấu hình được ghi rõ ở thông báo cuối.

Cấu hình kiểm thử riêng: `GOCTRO_SETUP_CONFIG_DIR` trỏ tới thư mục ignored có `backend.env` và `frontend.env`. Guard bắt buộc role `v18_smoke`, loopback, cổng khác 5432 và tên `goctro_setup_test_*`; env thật không được dùng thay thế. Để rehearsal nhánh cài lần đầu mà không chiếm 5432, đặt thêm `GOCTRO_SETUP_REHEARSAL_DEFAULT=1`: chỉ sau khi guard disposable trên PASS mới ánh xạ tuple mặc định sang fixture. Flag không có config riêng hoặc giá trị khác 1 bị từ chối. Menu in rõ đây là kiểm thử, không phải bằng chứng runtime bộ mặc định 5432/postgres. Không bỏ kiểm tra schema/identity/account/dependency. Không dùng các biến kiểm thử này trên máy người dùng; dấu vết/log trong runtime của config riêng, không đưa lên Git.

### Quyết định cuối về cấu hình — 2026-10-23

Cài lần đầu cố định `localhost:5432`, role `postgres`, database `Goctro_dev_v18`; chỉ hỏi mật khẩu PostgreSQL ẩn khi thiếu, không hỏi host/cổng/user/database hoặc đổi cấu hình. Env mới có secret ngẫu nhiên. Env hiện có chỉ được bổ sung mật khẩu PostgreSQL còn thiếu khi đúng tuple; các giá trị khác giữ nguyên. Sai tuple dừng trước tạo env phụ/dependency/inspection và hướng dẫn dùng Cập nhật. Update giữ nguyên mọi target local/development được guard chấp nhận, kể cả database cũ; không tự tạo/bootstrap/seed/provision/reset và không hỏi lại password đã lưu. Database thiếu ở target khác phải xử lý cấu hình hiện tại, không chuyển mặc định. Kết nối/auth lỗi dừng, không đổi PostgreSQL. Không chạy launcher khác sau setup.

Bảng kiểm chứng bên dưới ghi lại phiên bản menu trước quyết định rút gọn (đã có wizard và RESET trong cài lần đầu). Không dùng bằng chứng đó thay thế kiểm chứng bản cuối; kết quả bản cuối được bổ sung riêng.

### Kiểm chứng bản cuối rút gọn — 2026-10-23

Đã chạy lại trên native PostgreSQL 18.6 SCRAM disposable `127.0.0.1:55448`, role `v18_smoke`, database `goctro_setup_test_*`. Không truy vấn/ghi `Goctro_test3`, không sử dụng hoặc chiếm 5432, không thay env thật hay dừng PostgreSQL khác.

| Phạm vi | Bằng chứng mới |
|---|---|
| Menu runtime | 12/12 tests PASS (11 subtests + wrapper), 13 lượt `setup.bat` qua terminal với stdin lập trình; khoảng 331 giây |
| Fresh setup | Helper tạo DB chưa tồn tại → bootstrap → seed → INITIAL đúng hai Account có sẵn → Prisma generate → API/DB/CSRF/frontend health PASS; 6 Account seed, không tạo thêm Account |
| Login/authorization | Email Admin và Resident HTTP 200 với demo password; Resident đọc rental profile 1001, gọi Admin Accounts bị 403. Đây là API login, không phải browser login |
| Populated/rerun/update | Không seed/provision/reset, không hỏi mật khẩu web; credential/timestamps và số lượng các bảng kiểm tra giữ nguyên. Credential Admin tùy chỉnh vẫn login sau update; update không đổi giữ đúng PID. Lượt fresh được chạy update tiếp, bỏ qua ci/generate |
| Cấu hình target khác | First-time không bật ánh xạ rehearsal bị từ chối trước password/install/DB; bytes env và snapshot credential/counts không đổi. Update thực tế chạy target disposable khác mặc định, không khóa tên DB |
| Database thiếu | Update target khác mặc định báo cần xử lý cấu hình hiện tại, không tạo DB/chuyển target. First-time fixture thiếu DB có xác nhận và tạo qua createdb thật |
| Auth/kết nối/drift | PostgreSQL sai password trả 28P01; cổng không có server trả ECONNREFUSED; table drift được báo cụ thể. Tất cả chặn tạo/seed/provision/generate/startup |
| Dependency/cache | Cố ý thiếu executable: npm ci thật → generate → startup PASS, giữ credential/data kiểm tra. Các lượt không đổi bỏ qua npm ci/generate; cache fingerprint tests PASS |
| RESET riêng | Không còn RESET prompt ở menu. Gọi helper riêng: sai xác nhận không ghi; đúng xác nhận chỉ đổi hai row credential, password riêng cũ bị 401/demo mới được 200 |
| SQL/provision regression | 23/23 PASS: schema trống, V1.8 empty/populated, guards, thay logic function, INITIAL rerun/unknown/partial, RESET, credential rollback, bootstrap/seed rollback và retry; CORE 78/78, FIXTURE 171/171 |
| Unit/prompt/config fixture | 18/18 PASS: bộ mặc định chính xác localhost/5432/postgres/Goctro_dev_v18, chỉ một SecureString prompt khi thiếu password, encode đúng ký tự reserved, bổ sung password không đổi giá trị khác; thiếu env; giữ target Goctro_test3 trong fixture không kết nối; không có wizard; npm ci lỗi chặn dependency; ownership PID; test seam không config hoặc target 5432 bị từ chối |
| Static checks | Backend typecheck PASS; JS syntax/PowerShell parse PASS, helper giữ UTF-8 BOM; diff whitespace PASS; integrity 9/9 working tree = Git HEAD = provenance |

**Giới hạn:** tuple production `localhost:5432/postgres/Goctro_dev_v18` được kiểm chứng bằng prompt/env fixture cô lập (mô phỏng input), không kết nối runtime tuple này. Runtime full stack dùng ánh xạ disposable có guard sang 55448/v18_smoke; đây không phải PASS trực tiếp của PostgreSQL 5432 hay role postgres. `Goctro_test3` chỉ xuất hiện trong fixture văn bản không kết nối; native update target khác được chứng minh bằng DB disposable khác tên. Các lượt menu runtime dùng terminal/stdin lập trình, không phải quan sát double-click GUI hoặc thao tác nhập ẩn của con người. Không đổi npm stub/guard production để đạt PASS. Docker, browser login, phone login và provider/storage vẫn NOT VERIFIED. Bằng chứng cũ về wizard/RESET menu không còn là hướng dẫn cho bản cuối.

Mật khẩu PostgreSQL do người dùng nhập được lưu vào backend env local; nếu sai, công cụ dừng, không tự đổi target hoặc hỏi wizard. Sửa đúng credential trong cấu hình hiện tại trước khi chạy lại. Mật khẩu web demo chỉ thiết lập sau seed mới; nếu bước provision thất bại sau seed, dùng STATUS/provision CLI riêng có guard như hướng dẫn, không seed/reset ngầm qua menu.

Sau kiểm chứng bản cuối đã dừng hai cây process app được xác minh, dừng đúng cluster disposable 55448 và xóa riêng `.local/setup-final` (data/config/password/log/prepare helper). Fixture có thể dựng lại từ baseline; không còn credential test lưu tại đó. Không stage/commit/push/deploy. `backend/.env.example` dùng tuple mặc định mới với placeholder; env thật và SQL/provenance giữ nguyên.

## Cơ chế bảo vệ

### Kiểm chứng menu Windows — 2026-10-23

Trạng thái: native PostgreSQL 18.6 disposable/API PASS, chờ review source. Chạy trên cluster SCRAM riêng `127.0.0.1:55448`, role `v18_smoke`, các database `goctro_setup_test_*` và config riêng dưới ignored `.local/`; không dùng env thật hoặc target `Goctro_test3` để rehearsal.

| Kiểm tra thực thi | Kết quả |
|---|---|
| `setup.bat` qua terminal tương tác: tạo DB chưa tồn tại → bootstrap → seed → credential demo → generate → API/DB/frontend/CSRF | PASS trên `goctro_setup_test_complete`; menu và input tiếng Việt có dấu |
| Suite menu thật `scripts/setup-menu.integration.test.mjs` | 10/10 PASS, gồm một lượt first-time hoàn chỉnh khác qua helper; không dùng bằng chứng task cũ thay thế |
| Auth V1 email Admin/Resident bằng `Goctro123456789` | HTTP 200; Resident rental đúng profile 1001; API Accounts Admin trả 403 với Resident |
| Cập nhật lặp | Bỏ qua ci/generate khi không đổi; snapshot credential/counts không đổi; cùng PID app được tái sử dụng |
| Đổi credential Admin trong fixture rồi cập nhật | Mật khẩu riêng vẫn login được, không bị áp mặc định |
| RESET sai/đúng xác nhận | Sai: giữ credential, dừng startup; đúng: đổi đúng hai row, password cũ không login được |
| Dependency thiếu executable | npm ci thật → generate → startup PASS, giữ dữ liệu/credential |
| Manifest/npm environment/mapping/client thiếu | Unit fingerprint phát hiện thay đổi; không giả lập PASS runtime cho từng biến thể |
| npm ci lỗi | Fixture npm cố ý exit nonzero: không ghi stamp thành công, chặn database/provision/startup; không có bypass trong setup thật |
| Schema drift/kết nối/auth lỗi | Menu thật dừng, không hỏi tạo DB hoặc chạy bootstrap/seed/provision/startup; báo object/thuộc tính drift |
| Provision PostgreSQL integration | 8/8 PASS: seed evidence chính xác, INITIAL rerun/unknown/partial từ chối, RESET xác nhận, account locked/linkage sai/production/target/schema sai chặn trước ghi; lỗi update thứ hai rollback cả hai credential |
| Database tooling integration | 15/15 PASS; CORE 78/78, FIXTURE 171/171; seed rollback để lại V1.8 empty và retry thành công |
| Unit/cache/ownership/menu | 17/17 PASS; có test PID/ParentProcessId tái sử dụng theo CreationDate, không nhận launcher/harness làm app |
| Env mới trong clone riêng | PASS: tạo templates, session secret và key local ngẫu nhiên 32 byte, input PostgreSQL ẩn; hủy trước inspect; chạy update rồi hủy giữ nguyên bytes cả ba env |
| Backend typecheck và strict typecheck hai file provision/tooling test | PASS |
| Baseline artifact | 9/9 raw-byte working tree = HEAD = provenance; không sửa SQL/hash |

Các lỗi tích hợp tìm thấy và đã sửa: PORT backend bị truyền sang frontend; trạng thái seed/thông báo kết quả không đúng; PID snapshot không phải số đơn; process thoát sau health; ownership workspace marker bị đổi slash; cây process đi nhầm ancestor/descendant khi PID tái sử dụng. Guard hiện kiểm tra thời điểm tạo cả hai chiều và kiểm tra lại PID trước stop. Có dry-run cây process thật và test mô phỏng. Trong các lượt thử helper cũ, có phiên bị ngắt trước khi ghi đầy đủ log stop; không có đủ bằng chứng để khẳng định trạng thái của mọi process ngoài task trong các phiên đó. Không dùng việc suite cuối PASS để suy ra các phiên lỗi trước không có ảnh hưởng.

Next/npm hiện có cảnh báo lỗ hổng dependency; có lượt Next dừng sau cảnh báo. Launcher kiểm tra frontend ổn định qua ba probe và thử lại tối đa một lần, không báo PASS từ HTTP 200 thoáng qua. Không nâng cấp dependency hoặc chạy audit fix trong task này. Docker, double-click GUI, browser login, phone fixture login và giao nhận provider/storage ngoài DB: NOT VERIFIED. Lỗi DLL lock riêng trên process không thuộc project: NOT RUN (giữ nguyên process, không ép kill).

Chạy lại suite menu bằng cấu hình disposable đã chuẩn bị và seed/provision:

```powershell
$env:GOCTRO_SETUP_CONFIG_DIR = 'D:\path-to-ignored-disposable-config'
$env:GOCTRO_SETUP_MENU_RUNTIME = '1'
node --import tsx --test scripts/setup-menu.integration.test.mjs
# URL admin disposable cho các suite SQL/provision: role v18_smoke, loopback, cổng khác 5432.
# Đặt GOCTRO_V18_TEST_ADMIN_URL cục bộ, không đưa credential vào report/log.
node --import tsx --test backend/scripts/provision-dev-admin.integration.test.ts
```

Suite menu cố ý thay credential/schema chỉ trong fixture disposable, cài dependency theo lockfile và khởi động/dừng app đã xác minh. Không chạy suite này với env/DB thật. Không có browser credential handoff hoặc browser-login PASS được tuyên bố.

Sau rehearsal đã dừng app theo PID/target được ghi và dừng cluster 55448 bằng `pg_ctl` trên đúng data directory. Đã xóa riêng thư mục disposable gồm data/config/password test và clone tạm; dữ liệu test có thể dựng lại từ baseline. Các file env thật giữ nguyên thời điểm sửa trước task; source UI/audit ngoài phạm vi được giữ nguyên. Không stage/commit/push/deploy trong task này.

Các file thuộc bản sửa để review:

- Entry/orchestration: `setup.bat`, `scripts/setup-interactive.ps1`, `scripts/setup-cache.mjs`, `scripts/dev-all.ps1`, `scripts/dev-stop.ps1`, `package.json`.
- Provision/catalog/integrity: `backend/scripts/provision-dev-admin.ts`, `scripts/database-v18.mjs`, `scripts/verify-baseline-integrity.mjs`.
- Tests: `scripts/database-v18.test.mjs`, `scripts/database-v18.integration.test.mjs`, `scripts/setup-cache.test.mjs`, `scripts/process-ownership.test.ps1`, `scripts/setup-menu.integration.test.mjs`, `backend/scripts/provision-dev-admin.integration.test.ts`.
- Tài liệu: `README.md`, tài liệu này, `LOCAL_DEV_STARTUP_REPORT.md`, `../00_CURRENT_STATE.md`, `../DOCUMENT_CATALOG.md`.
- Gỡ hai wrapper cũ ở root; có thể phục hồi từ Git HEAD nếu review yêu cầu. Artifact SQL/baseline/migration/seed và PROVENANCE không thay đổi.

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
