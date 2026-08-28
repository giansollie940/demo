# SỔ TỰ HỌC V8.8.0 — Full Stack Source

Bản này hợp nhất **frontend Vue 3/TypeScript V8.8.0** và **backend Supabase** vào một source tree duy nhất để dễ kiểm tra, lưu trữ và triển khai.

## Thành phần

- Frontend: Vue 3, TypeScript, Vite, Pinia, Vue Router, TanStack Vue Query, realtime bridge và giao diện Wise Owl.
- Database: schema/RLS/RPC theo nền V8.4.x cùng các patch vận hành đến V8.4.2c; V8.7.1 giữ contract database tương thích hiện tại.
- Edge Functions: 10 function đầy đủ, dùng chung `_shared/` auth/CORS/permission/rate-limit/audit/validation.
- AI review: `ai-review-registration` V8.7.1, với routing cuối cùng `auto_approve → approved`, `request_revision → needs_revision`, `manual_review → submitted`.
- Deployment: 10 ZIP độc lập trong `deploy/edge-functions/` và workflow GitHub Pages ở `.github/workflows/deploy-pages.yml`.


## Quyền và vận hành ở V8.8.0

- **Admin:** 7 chức năng hệ thống trực tiếp (`Tổng quan / Năm học / Lớp học / Học sinh / Giáo viên / Phân quyền / Nhật ký hệ thống`), quản lý toàn bộ HS/GV, reset mật khẩu và Mẫu TKB; Tùy chọn cá nhân chứa Cú/Theme.
- **Giáo viên:** vận hành lớp (`Duyệt / Theo dõi / Quản lý tuần / TKB / Học sinh / Thống kê / Cài đặt`), chỉ chọn tiết Tự học từ Mẫu TKB được Admin gán.
- **Cán sự:** chức năng cá nhân + Quick Report/Theo dõi lớp và TKB read-only trong phạm vi lớp.
- **Học sinh:** chức năng cá nhân.
- `class_weeks.manual_status = null` giữ lifecycle tự động; `open/locked` là override của GV. Lifecycle tự động dùng giờ TKB hiệu lực của đúng lớp/ngày.

## Database: đường nâng cấp hiện tại

V8.8.0 **không phải bootstrap từ Supabase trống**. Database phải ở V8.7.1 final trước.

Chạy theo thứ tự:

1. `database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql`
2. `database/verify/VERIFY-V8.8.0.sql` và yêu cầu `overall = true`

`database/fresh-install/02-INSTALL-V8.8.0-TIMETABLE-TEMPLATES.sql` chỉ là chỉ dẫn second-stage cho một baseline V8.7.1 tương thích; không được mô tả là empty-database install.

## Root admin

Các thao tác đặc biệt được tách khỏi migration thường:

- `database/maintenance/BOOTSTRAP-ROOT-ADMIN-BY-EMAIL.sql`
- `database/maintenance/TRANSFER-ROOT-ADMIN-BY-EMAIL.sql`

Không tạo/nâng root admin từ frontend.

## Kiểm tra source

```bash
npm test
npm run verify:release
```

Nếu dependency đã được cài đầy đủ:

```bash
npm run typecheck
npm run test:unit
npm run build
```

`public/config.js` thật không được lưu trong source. Workflow GitHub Pages tạo file này từ cấu hình public khi build.

Xem `DEPLOYMENT-V8.8.0.md` để triển khai V8.8.0 theo đúng thứ tự.
