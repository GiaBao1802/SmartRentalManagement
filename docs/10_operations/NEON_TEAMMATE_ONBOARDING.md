# Hướng dẫn cho thành viên mới: kết nối Neon dùng chung

Tài liệu này dành cho bạn chưa có tài khoản Neon. Thực hiện theo thứ tự; không cần tự tạo project/database và không cần xin hoặc gửi connection string.

## 1. Đăng ký tài khoản Neon

1. Mở [Neon Console](https://console.neon.tech/).
2. Chọn đăng ký tài khoản bằng đúng email đã được mời. Có thể đăng ký bằng email hoặc phương thức đăng nhập được Console cung cấp.
3. Nếu Neon gửi thư xác minh, mở thư và xác minh email. Nếu lời mời được gửi trước khi tạo tài khoản, hãy đăng nhập bằng đúng email nhận lời mời rồi mở lại email đó.
4. Mở thư mời Neon và chọn chấp nhận/tham gia. Nếu không thấy thư, kiểm tra Spam/Junk và xác nhận đang đăng nhập đúng tài khoản.
5. Trong Neon Console, kiểm tra tổ chức `org-cool-term-43890018` đã xuất hiện trong bộ chọn Organization. Chỉ đăng ký tài khoản chưa có nghĩa là đã tham gia tổ chức; cần chấp nhận lời mời.

## 2. Chủ project cấp quyền vào đúng project

Sau khi lời mời được chấp nhận, chủ project cần cấp quyền riêng cho project `goctro-shared-dev` (`patient-scene-93926977`):

1. Chủ project mở Neon Console và chọn project `goctro-shared-dev`.
2. Mở phần quản lý thành viên/quyền truy cập của project.
3. Tìm email vừa được mời, cấp quyền **Editor** ở cấp project cho riêng project này, rồi lưu.
4. Thành viên đăng xuất/đăng nhập lại Console nếu project chưa hiện.

Vai trò organization `Collaborator` chỉ đưa thành viên vào tổ chức, mặc định chưa cho xem project. Quyền project `Viewer` cũng không xem được connection string. CLI cần đọc connection string để setup, nên cần quyền project `Editor`. Không cần cấp quyền Admin. Neon có thể đổi tên/vị trí menu; đối chiếu hướng dẫn vai trò và quyền project hiện hành tại [Neon: per-project permissions](https://neon.com/blog/neon-now-has-per-project-permissions).

## 3. Lấy code mới nhất

Mở PowerShell tại thư mục repository. Nếu đã clone repository, chạy:

```powershell
git switch main
git pull origin main
```

Nếu lệnh `git switch` báo chưa có nhánh local, chạy lần đầu:

```powershell
git switch --track origin/main
```

Nếu chưa clone repository:

```powershell
git clone --branch main https://github.com/GiaBao1802/SmartRentalManagement.git
cd SmartRentalManagement
```

Lựa chọn Neon số 5 chỉ chạy trên nhánh `main` đúng với `origin/main` mới nhất. Setup kiểm tra điều này và dừng nếu đang ở nhánh khác hoặc code cũ; nó không tự chuyển nhánh, nên hãy lưu công việc trước rồi cập nhật `main`.

## 4. Chuẩn bị máy Windows

- Cài Git và Node.js **24.11 trở lên** (kèm npm). Đóng và mở lại PowerShell sau khi cài.
- Không bắt buộc cài Neon CLI toàn cục. `setup.bat` dùng `neon.cmd` nếu đã có; nếu chưa, nó tự chạy `npx neon@latest`.
- Nếu muốn cài CLI trước, lệnh hiện hành là:

```powershell
npm.cmd install --global neon@latest
```

Tài liệu Neon CLI hiện hành: [neon.com/cli](https://neon.com/cli). Trên PowerShell, lệnh shim `neon.ps1` có thể bị chặn bởi Execution Policy; khi cần gọi CLI trực tiếp hãy dùng `neon.cmd` hoặc `npx.cmd neon@latest`, không cần đổi chính sách bảo mật của Windows. Trong flow thường ngày, để `setup.bat` tự gọi đúng shim.

## 5. Chạy setup option 5

1. Trong thư mục gốc repository, bấm đúp `setup.bat` (hoặc chạy `./setup.bat` trong PowerShell).
2. Chọn `5. Dùng database chung Neon (cloud)`.
3. Nếu setup báo sai nhánh hoặc `main` cũ, giữ/lưu công việc đang làm, rồi chạy `git switch main` và `git pull --ff-only origin main`; sau đó mở lại setup. Không dùng option 5 từ nhánh `dev` hoặc `codex/*`.
4. Khi setup mở trình duyệt đăng nhập Neon, đăng nhập bằng đúng tài khoản đã nhận lời mời và được cấp quyền project. Chấp thuận màn hình OAuth nếu được hỏi, sau đó quay lại cửa sổ setup.
5. Khi được hỏi xác nhận dùng database cloud, gõ chính xác `DUNG`.
6. Chờ setup cài dependency nếu cần, kéo cấu hình Postgres về file cục bộ bị Git bỏ qua, rồi kiểm tra kết nối/schema. Không copy connection string vào chat, GitHub, hoặc file được commit.
7. Khi setup hỏi chạy ứng dụng, gõ `CHAY` để khởi động; nếu chưa muốn chạy, nhấn Enter. Nếu frontend/backend đã chạy ở cổng 3000/4000, dừng phiên đó trước.

Setup có thể yêu cầu đăng nhập Neon CLI lần đầu. Nếu trình duyệt mở, hoàn tất đăng nhập rồi quay lại terminal và đợi setup tiếp tục. Không nhập mật khẩu Neon vào terminal hoặc gửi cho người khác.

## 6. Những điều cần biết trước khi dùng

- Option 5 nối ứng dụng vào cùng project/branch Neon production của nhóm. Thay đổi ghi từ ứng dụng sẽ xuất hiện với thành viên khác.
- Setup chỉ kiểm tra schema bằng truy vấn đọc; nó không chạy migration, seed, reset hoặc import dữ liệu.
- Neon hiện có schema V1.15 và bộ dữ liệu demo tổng hợp dùng chung: 100 phòng ở Đồng Nai/TP. Hồ Chí Minh, tài khoản demo, xe, tiện ích và bãi xe. Đây không phải dữ liệu khách hàng thật. Thông tin đăng nhập demo được chủ project gửi riêng.
- Sau khi Neon kết nối thành công, setup gỡ riêng dòng `DATABASE_URL` cũ khỏi `backend/.env` để tránh trỏ nhầm; database PostgreSQL local và dữ liệu của máy đó không bị xóa. Các file `.env.neon` và `.neon` không được commit.
- Nếu gặp `permission denied`, xác nhận đã chấp nhận lời mời và chủ project đã cấp **Editor cho project `goctro-shared-dev`**. Đăng nhập lại CLI bằng đúng tài khoản Neon rồi chạy lại option 5.
- Nếu lỗi `DATABASE_URL` hoặc không kết nối được, không gửi URL/mật khẩu lên chat. Gửi chủ project phần thông báo lỗi đã che mọi thông tin bí mật.
- Giao diện phải ở `http://localhost:3000/login`; cổng `4000` là backend API. Nếu trình duyệt báo `ERR_CONNECTION_REFUSED` ở cổng 3000, kiểm tra cửa sổ setup đã nhập `CHAY` và còn chạy. Nếu UI mở nhưng API trả lỗi, gửi phần log backend đã che thông tin bí mật.

## Danh sách kiểm tra nhanh cho chủ project

- [ ] Thành viên đã chấp nhận lời mời organization bằng đúng email.
- [ ] Đã cấp quyền project `Editor` trên `goctro-shared-dev`.
- [ ] Thành viên đã đăng nhập đúng Neon account trên trình duyệt/CLI.
- [ ] Thành viên đang dùng nhánh Git `main` mới nhất.
- [ ] Thành viên chạy option 5 và thấy thông báo kết nối Neon/schema thành công.
