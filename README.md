# Smart Rental Management System

Hệ thống quản lý cho thuê nhà/phòng phát triển theo mô hình monorepo.

## Cấu trúc dự án

```text
.
├── apps/
│   ├── web/       # Frontend web ReactJS
│   ├── mobile/    # Ứng dụng mobile (React Native/Expo hoặc Flutter)
│   └── api/       # Backend Node.js
├── packages/
│   └── shared/    # Types, validation và tiện ích dùng chung
├── database/      # Schema/ERD, migrations, seeds và truy vấn
├── infra/         # CI/CD, cấu hình môi trường và vận hành
└── docs/          # Tài liệu dự án theo các giai đoạn SDLC
```

## Tài liệu (`docs/`)

- `requirements/` — yêu cầu nghiệp vụ/chức năng, user stories và tiêu chí nghiệm thu
- `planning/` — nghiên cứu, lịch trình và quản lý rủi ro
- `design/` — Figma, wireframes, UI assets và kiến trúc
- `testing/` — test cases và báo cáo kiểm thử
- `operations/` — triển khai và giám sát hệ thống
- `project/` — biên bản họp, quyết định, release notes, bug và change requests
- `guides/` — hướng dẫn người dùng và developer
- `api/` — API specifications/contracts

## Công nghệ dự kiến

- Frontend web: ReactJS
- Mobile: React Native/Expo hoặc Flutter (chưa chốt)
- Backend: Node.js
- Database: sẽ chọn và ghi lại tại `database/` khi chốt công nghệ

## Khởi chạy

Mã nguồn ứng dụng chưa được khởi tạo. Sau khi tạo ứng dụng tại `apps/web`, `apps/mobile` và `apps/api`, bổ sung lệnh cài đặt, chạy dev, build và test tương ứng tại đây.
