# Auth — Browser và UI verification

**Ngày:** 2026-10-18 → 2026-10-19 (Asia/Ho_Chi_Minh).  
**Trạng thái:** CURRENT — core invitation/accept/login/reset được thực thi trên browser; một số negative/intermediate browser cases chưa được quan sát đầy đủ. Phase 2 vẫn **PARTIAL**, không phải production closure.

## 1. Phạm vi và nguồn

- Repository `SmartRentalManagement`; branch `main`, HEAD `37cc8bd23e73b60c7b8313896d767802af5153a2`. Workspace đã dirty trước task; không stage/commit/push.
- Đã đọc AGENTS, frontend AGENTS, Documentation Rules, Current State/Catalog và canonical Requirement §5/API §5.1–5.2 trong project liền kề `GocTro-SmartBuilding`.
- FE: `/admin/accounts`, `/accept-invitation`, `/login`, `/forgot-password`, `/reset-password`; dùng `/tenant` để kiểm tra quyền/dữ liệu sau đăng nhập. Không redesign dashboard/homepage/module khác.
- Backend hiện hành: Auth V1, Account management, EnrollmentService/PrismaEnrollmentRepository; scrypt password verifier, CSRF, Owner scope và session store hiện có.
- Database V1.8/Prisma/schema/migrations, `.env` thật và `Goctro_test3` không bị chỉnh hoặc dùng để ghi test.

## 2. Môi trường thử nghiệm

| Thành phần | Giá trị đã kiểm tra |
|---|---|
| PostgreSQL | Native PostgreSQL 18.6, cluster disposable riêng |
| Target | `127.0.0.1:55450/goctro_enrollment_20261018`, role `v18_smoke` |
| Baseline | `database/baselines/v1.8/`; bootstrap qua guard hiện hành; 40 public tables; không seed |
| Backend | `http://localhost:4002`; NODE_ENV=test; harness kiểm tra live database/port/role/table count trước fixture writes |
| Frontend | `http://localhost:3002`; `NEXT_PUBLIC_API_BASE_URL=http://localhost:4002/api/v1` |
| Browser | Codex in-app browser, thao tác DOM/Playwright và screenshot thực tế |
| Delivery | Harness DEV/test, binding synthetic, link lấy qua terminal riêng; không email/Zalo thật, không API công khai trả token |

Frontend dùng source copy dưới `.local/auth-browser-ui-20261018/frontend` để tách Next dev cache khỏi instance source chính. Build dùng một copy riêng `frontend-build`; các file source thay đổi được đồng bộ trước kiểm chứng. Không copy `.env` thật.

Fixture chính: synthetic Owner 5, Resident 23, Account 15; Owner 6/Resident 25 dùng thêm cho responsive và controlled restart. Tất cả tên, email/phone hiển thị trong ảnh là dữ liệu tổng hợp. Không dùng tài khoản thật. Cổng và live identity được kiểm tra trước thao tác database. Cụm này đã bị dừng ngoài phiên công cụ qua đêm; sau đó được khôi phục từ cùng pgdata, không bootstrap/seed lại.

## 3. Lỗi phát hiện và sửa

1. **Form chưa đồng nhất:** layout/typography/spacing khác nhau, thiếu password visibility và liên kết lỗi với field. Dùng chung AuthLayout, PasswordField, CSS module; giữ font Be Vietnam Pro hiện hành, input 16px, loading/disabled/focus/error/success và autocomplete đúng mục đích. Logo sáng được đặt trên nền xanh thay vì nền trắng khó đọc. Invitation panel có padding riêng, không sửa toàn bộ Admin shell.
2. **Không kiểm tra link trước khi cho nhập:** bổ sung `POST /auth/credential-link/inspect` và đồng bộ canonical API trước implementation. Endpoint Public + CSRF, rate limit, no-store/no-referrer, token chỉ ở body; chỉ trả `valid/expires_at`, không identity. Không consume, phát hành hoặc kéo dài link. Accept/reset vẫn revalidate theo lock hiện hành.
3. **Same-document fragment navigation bị bỏ qua:** effect khởi tạo một lần khiến mở fragment mới trên cùng route còn giữ trạng thái thiếu token. Đã xử lý `hashchange`, xóa fragment khỏi URL, reset form khi đổi link và bỏ kết quả inspect cũ theo request version. Browser đã kiểm tra missing → unknown token ngay trong cùng document. Strict Mode không gửi initial inspection lặp.
4. **Thông báo invalid lặp hai lần:** chỉ giữ một thông báo dễ hiểu, gắn focus cho trạng thái thiếu/invalid; lỗi dài wrap trong card.
5. **Redirect đăng nhập:** dùng helper kiểm tra cùng origin/role, chặn `//` và biến thể backslash đi ra origin khác. Resident không dùng `next` để vào Admin.
6. **Harness có thể báo READY sai khi cổng trùng:** dùng Node HTTP server và error handler rõ ràng; dừng riêng process harness đã xác minh, không kill toàn bộ Node. Mount thêm Contract read dependencies hiện hành để portal cư dân tải dữ liệu thật, không trả dữ liệu giả. Resume chỉ cho fixture synthetic trong target được guard, không ghi đè password hay khôi phục RAM state.

Trong handoff đầu, Fast Refresh đã làm mất token đang chỉ giữ trong memory sau khi URL được làm sạch; chưa có accept request nào tới backend. Đã mở link mới sau khi ổn định source, không coi lần đó là thành công. Không lưu token vào localStorage để né tình huống này: reload cần mở lại link gốc.

## 4. Kết quả luồng và test cases

PASS chỉ dùng khi đã thực thi/quan sát. API/unit và browser là các mức bằng chứng riêng.

| Case | Kết quả | Bằng chứng / giới hạn |
|---|---|---|
| Admin đăng nhập, scope đúng, gửi invitation qua UI | PASS — browser | Chọn Resident synthetic; UI báo link chỉ có trong DEV harness; không giả lập delivery thật |
| Mở link khi đã logout, kiểm tra expiry, không consume | PASS — browser + DB | Form ready; trước accept: pending, accepted_at null, chưa có Account, accept counter 0 |
| Accept bằng mật khẩu do người dùng tự nhập/gửi | PASS — browser + DB | Đã quan sát `Tài khoản đã được thiết lập`; DB accepted với accepted_at; một active Resident account; counters acceptRequests=1/acceptSuccess=1 |
| Resident login bằng password vừa tạo | PASS — browser | Vào `/tenant`, tên/hồ sơ synthetic và empty rental/contracts hợp lệ được tải từ backend; ảnh resident portal |
| Resident mở `/admin/accounts` | PASS — browser | Bị chuyển về `/tenant`; không render quyền Admin |
| Forgot cho tài khoản vừa tạo và mở reset link | PASS — browser | Submit thật, neutral success; CLI lấy link, inspect ready; không public token |
| Reset mật khẩu | PASS — browser + DB | Lần đầu người dùng xác nhận, sau gián đoạn đã kiểm chứng hash qua verifier và login. Lần sau quan sát trực tiếp success UI; resetRequests=1/resetSuccess=1, ảnh success |
| Password cũ bị từ chối, password mới login được | PASS — browser + verifier | Đã kiểm tra cả hai vòng; old verifier=false/new=true; lỗi login chung, password mới vào `/tenant`; không xuất hash |
| Session trước reset bị thu hồi | PASS — HTTP bổ trợ | Session riêng giữ trong RAM từ trước reset; sau reset `/auth/me` trả 401 trong cùng tiến trình, không restart giữa hai bước. Không gọi đây là browser đa-profile test |
| Link thiếu token | PASS — browser | Không cho nhập mật khẩu, báo mở lại link |
| Token sai/unknown | PASS — browser | Một thông báo generic, không form password, fragment được xóa |
| Missing → fragment mới trên cùng route | PASS — browser | Sau fix hashchange, unknown fragment được inspect và chuyển invalid |
| Invitation hết hạn / reset hết hạn | PASS — browser | Link negative tạo bằng clock test trong harness; đều invalid, không tạo/chỉnh account |
| Mở lại invitation đã accepted | PASS — browser (sau restart) | Invalid; accepted DB history còn nguyên. Browser case này không phân biệt nguyên nhân used với mất RAM; used-token enforcement riêng đã PASS ở PostgreSQL/HTTP |
| Mở lại reset vừa dùng | PASS — browser | Invalid trong cùng tiến trình, có ảnh used-reset |
| Password trống/không đủ yêu cầu | PASS — browser + unit/API | Empty submit hiện lỗi 12–1024 ký tự; aria-invalid/describedby; unit kiểm tra password ngắn và boundaries. Nhập chuỗi ngắn cụ thể trên browser chưa quan sát |
| Password confirmation không khớp | PASS — helper unit; NOT RUN — quan sát browser | Người dùng báo đã thử, nhưng lúc đọc lại UI đã là reset success; không đủ bằng chứng intermediate error để ghi PASS browser |
| Pending/chống gửi lặp | PASS — login pending UI; unit/HTTP concurrency | Đã thấy disabled/loading khi login; accept concurrent chỉ một success trong PostgreSQL test. Browser double-click ở bước nhập password chưa được quan sát; NOT RUN cho case kết hợp đó |
| Unknown email forgot không enumerate | PASS — browser + HTTP | Neutral message không xác nhận account tồn tại hay tin đã gửi; ảnh forgot-generic |
| Backend inspect trả 503, retry sau phục hồi | PASS — browser | Hidden password fields, lỗi rõ và retry; tắt fault rồi click retry → ready; không đổi token/expiry |
| Mất kết nối mạng thực trong lúc submit | NOT RUN — browser | 503 recovery đã thực thi; không gọi nó là network disconnect test |
| Password visibility và keyboard | PASS — browser | Toggle bằng click, hide bằng Enter, type đổi text/password; nhãn truy cập rõ, focus thấy trong ảnh validation |
| 1440 / 768 / 390px | PASS — browser | Login, forgot, accept ready, reset validation và Admin invitation; đo innerWidth/scrollWidth thực, input >=16px, label/autocomplete; không page overflow |
| Restart với invitation pending chưa hết hạn | PASS — browser + DB | Owner 6 trước/sau: vẫn pending, accepted_at null, Account null, không accept request; mở lại link original bị từ chối do mất material RAM, không tự consume/reissue |
| Provider production / restart durable replay | NOT RUN / NOT IMPLEMENTED | Không cấu hình provider thật; RAM lifecycle chưa phải production durable solution |

Account sau reset vẫn `resident`, `active`, Resident Owner đúng (Owner 5). Không đổi khóa tài khoản để làm test PASS. Account/tenant ownership và CSRF negative cases còn được kiểm tra trong suite HTTP/PostgreSQL.

## 5. UI và ảnh

- Giữ màu xanh/cam/kem và assets hiện hành, không thêm dependency/font mới.
- Form chung tối đa 960px; hai cột desktop, một cột tablet/mobile, label rõ, input 48px/16px, helper 14px, text wrap, nút có trạng thái pending/disabled.
- File ảnh nằm tại [`screenshots/`](screenshots/). Screenshot chỉ chụp sau khi fragment đã bị xóa và không có password đã nhập. Admin/portal chứa identifiers synthetic, không PII thật.

| Màn hình | Desktop | Tablet | Mobile |
|---|---|---|---|
| Login | [1440](screenshots/login-1440.png) | [768](screenshots/login-768.png) | [390](screenshots/login-390.png) |
| Forgot | [1440](screenshots/forgot-1440.png) | [768](screenshots/forgot-768.png) | [390](screenshots/forgot-390.png) |
| Accept | [1440](screenshots/accept-ready-1440.png) | [768](screenshots/accept-ready-768.png) | [390](screenshots/accept-ready-390.png) |
| Reset/validation | [1440](screenshots/reset-validation-1440.png) | [768](screenshots/reset-validation-768.png) | [390](screenshots/reset-validation-390.png) |
| Admin invitation | [1440](screenshots/admin-invitation-1440.png) | [768](screenshots/admin-invitation-768.png) | [390](screenshots/admin-invitation-390.png) |

Thêm bằng chứng: [reset success](screenshots/reset-success-390.png), [used reset](screenshots/used-reset-390.png), [503/retry](screenshots/backend-error-retry-390.png), [invalid link](screenshots/invalid-link-390.png), [generic forgot](screenshots/forgot-generic-390.png), [pending link sau restart](screenshots/pending-link-after-restart-390.png), [Resident portal](screenshots/resident-portal-1440.png). Một số ảnh desktop Admin chụp phần đang cuộn; không thay bằng mockup.

## 6. Lệnh đã chạy và kết quả

Từ repo root:

| Lệnh | Kết quả |
|---|---|
| `npm run test:enrollment --workspace=@goctro/backend` | PASS 12/12 |
| `npm run test:enrollment:runtime --workspace=@goctro/backend` với explicit guarded disposable URL | PASS 16/16 (15 subtests + parent), PostgreSQL thật, không SKIP |
| `npm run test:auth --workspace=@goctro/backend` | PASS 20/20 |
| `npm run test:accounts --workspace=@goctro/backend` | PASS 19/19 trên host |
| `npm run test:legacy-retirement --workspace=@goctro/backend` | PASS 13/13 trên host |
| `npm run test:api --workspace=@goctro/frontend` | PASS 77/77 |
| `npm run typecheck --workspace=@goctro/frontend` | PASS |
| `npm run typecheck --workspace=@goctro/backend` | FAIL — 115 diagnostics đã có; toàn bộ diagnostic lines trước/sau giống nhau: 114 ở app.ts legacy, 1 ở resident.test.ts; không gọi BE build PASS |
| `.\node_modules\.bin\next.cmd build .local/auth-browser-ui-20261018/frontend-build` với FE test API env | PASS production compile, TypeScript và 24/24 generated pages; source copy cuối, cache riêng; 127 source/assets files compared, 0 hash mismatches |
| `node --check frontend/e2e/auth-browser-checks.mjs` | PASS |
| Lint | NOT RUN — frontend không có lint script và workspace không có ESLint executable; không tự cài tool/đổi config |

Accounts/retirement sandbox run không tạo được HTTP socket; đã giữ log thất bại và chạy lại đúng suite trên host, PASS. Không lấy mock results để khẳng định SQL chạy hoàn chỉnh.

E2E DOM checks mới ở [`frontend/e2e/auth-browser-checks.mjs`](../../../frontend/e2e/auth-browser-checks.mjs); hướng dẫn tại [`frontend/e2e/README.md`](../../../frontend/e2e/README.md). Đây là browser-supported/human-assisted checks, **không phải unattended CI test**. Có ready/missing/invalid/unavailable, fragment removal, password validation/visibility, success, unknown forgot và layout assertions; đã gọi trên browser thật. Việc nhập/gửi password mới do người dùng thực hiện theo quy tắc công cụ, không bypass qua automation khác.

## 7. File thay đổi

| File/nhóm | Mục đích |
|---|---|
| frontend/src/app/components/auth-layout.tsx (mới) | Layout/branding chung |
| frontend/src/app/components/auth-flow.module.css (mới) | Scope CSS form và invitation panel |
| frontend/src/app/components/password-field.tsx (mới) | Field/toggle/accessibility/autocomplete |
| frontend/src/app/components/credential-form.tsx | Inspect/fragment lifecycle, error/retry/validation/success UI |
| frontend/src/app/login/login-form.tsx | Layout chung, pending và safe redirect |
| frontend/src/app/admin/accounts/page.tsx, accounts-content.tsx | Scope CSS invitation panel, giữ mutation/keys hiện có |
| frontend/src/lib/api/credentialView.ts (mới) | Password/redirect/error helpers |
| frontend/src/lib/api/credentialApi.ts, credentialApi.test.ts | Inspect API và helper regression |
| frontend/e2e/auth-browser-checks.mjs, README.md (mới) | Checks DOM thật + cách replay có human handoff |
| backend/src/accounts/enrollment.routes.ts, enrollment.service.ts, enrollment.repository.ts | Read-only inspection, giữ final validation/locks |
| backend/src/accounts/enrollment.test.ts, enrollment.postgres.integration.test.ts | Inspection không consume, privacy, CSRF, lifecycle |
| backend/src/accounts/credential-infrastructure.ts | Explicit expired-link retrieval chỉ trong guarded DEV/test adapter |
| backend/scripts/enrollment-dev-harness.ts | Fault/expired fixtures, safe counters, read dependencies, listen error, synthetic resume |
| ../GocTro-SmartBuilding/docs/04_API_SPEC.md | Inspect contract + endpoint matrix 114; không đổi nghiệp vụ account/DB |
| docs/00_CURRENT_STATE.md, DOCUMENT_CATALOG.md | Checkpoint/index mới; giữ báo cáo cũ |
| Report này và screenshots | Bằng chứng không chứa token/password/cookie |

Package manifests không đổi trong lượt này. Source before-task snapshots/hash ở `.local/auth-browser-ui-20261018/before` dùng để phân biệt dirty changes đã có; không gộp toàn bộ git diff thành thay đổi task. Không sửa báo cáo lịch sử để che khác biệt.

## 8. Giới hạn, cleanup và bước tiếp theo

- Production delivery/verified recipient binding chưa cấu hình. EnrollmentService hiện fail-closed trong production; DEV provider không được dùng để tuyên bố đã gửi thật.
- Invitation DB chỉ giữ hash/audit; delivery/replay material và reset lifecycle/session store hiện ở RAM. Restart làm mất state; pending invitation vẫn được giữ, không âm thầm tạo token/account mới. Không mở rộng storage redesign trong task này.
- Main flows đã chạy thành công. Các browser negative/intermediate cases chưa quan sát đầy đủ được đánh NOT RUN rõ trong bảng, không suy từ code/unit/API thành PASS browser.
- Cleanup PASS: stopped only verified rehearsal FE/BE processes; dropped exactly goctro_enrollment_20261018 after checking postgres/55450/v18_smoke identity; stopped the task PostgreSQL cluster. Ports 3002/4002/55450 have no listeners. Real DB/env/source stack were not changed; normal stack was already stopped after the overnight tool interruption and was not started as part of this task. Temporary credential helpers and generated rehearsal directories were removed; before-task evidence/log summaries were retained locally.
- Primary next task: hoàn tất trực tiếp browser mismatch và repeated-click tại credential handoff, sau đó review các blocker production delivery/durable lifecycle trước khi kết luận Phase 2; chưa bắt đầu Phase 3.
