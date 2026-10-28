# Demo 300 phòng chỉ dùng JSON — 2026-10-28

**CURRENT — demo local tách biệt; không dùng PostgreSQL.**

`setup.bat` có mục **4. Demo AI 300 phòng JSON**. Mục này gọi `scripts/start-json-demo.ps1`, kiểm tra Node.js và `data/room-ai/v1/rooms.json`, mở backend demo `scripts/room-advisor-demo/server-dataset.mjs` trên `127.0.0.1:4330`. Nếu đúng tiến trình demo đang chạy thì dùng lại; nếu cổng bị chương trình khác chiếm, dừng và không tắt chương trình đó. Không chạy `npm ci`, Prisma, migration, seed hoặc launcher backend quản lý. Mục 1/2 vẫn theo quy trình PostgreSQL của ứng dụng quản lý.

Backend demo đọc 300 phòng từ JSON, có `GET /demo/status` cho biết `mode=json-demo`, `rooms=300`, `database=false` và `GET /demo/rooms` trả bộ 300 phòng giả lập. Trang demo dùng bộ lọc xác nhận và Ollama local khi có model; nếu model không chạy, luồng lựa chọn trả kết quả dự phòng có nhãn. Backend chỉ bind loopback và kiểm tra Host/Origin. Dữ liệu phòng không ghi hoặc sửa qua API này. Cổng 4330 được chọn để tránh các phiên demo 4318/4326 đang có.

Kiểm tra thực tế: `setup-interactive.ps1` mục 4 exit 0 ngay cả khi `DATABASE_URL` được cố ý đặt sai và `NODE_ENV=production` trong tiến trình kiểm tra; `/demo/status` trả HTTP 200, 300 phòng và `database=false`; `/demo/rooms` trả HTTP 200 với 300 bản ghi `synthetic=true`. AI demo suite 71/71 PASS, dataset suite 6/6 PASS. Không chạy/đổi PostgreSQL hoặc cấu hình `.env` trong lượt này.

Giới hạn: Đây là backend demo AI độc lập, **không thay thế** Auth/Admin/Resident/Invoice API của ứng dụng quản lý. `http://localhost:3000` vẫn cần database khi chạy bằng mục 1/2. Trường province thực không có trong bộ 300 JSON (địa chỉ giả lập), nên không map chúng vào API bản đồ 34 tỉnh hoặc tạo contact request giả. Nếu muốn chạy toàn ứng dụng quản lý không database, cần một thiết kế mock riêng cho các module có ghi dữ liệu và phân quyền.

Bước tiếp theo: mở mục 4 để thử các nhu cầu tiếng Việt trên UI demo, kiểm tra câu trả lời khi thiếu thông tin và khi Ollama chưa chạy. Không đổi Active Module/Exact Next Task chung.
