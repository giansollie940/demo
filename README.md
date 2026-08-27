# SỔ TỰ HỌC V8.7.1 — Full Stack Source

Bản này hợp nhất **frontend Vue 3/TypeScript V8.7.1** và **backend Supabase** vào một source tree duy nhất để dễ kiểm tra, lưu trữ và triển khai.

## Thành phần

- Frontend: Vue 3, TypeScript, Vite, Pinia, Vue Router, TanStack Vue Query, realtime bridge và giao diện Wise Owl.
- Database: schema/RLS/RPC theo nền V8.4.x cùng các patch vận hành đến V8.4.2c; V8.7.1 giữ contract database tương thích hiện tại.
- Edge Functions: 10 function đầy đủ, dùng chung `_shared/` auth/CORS/permission/rate-limit/audit/validation.
- AI review: `ai-review-registration` V8.7.1, với routing cuối cùng `auto_approve → approved`, `request_revision → needs_revision`, `manual_review → submitted`.
- Deployment: 10 ZIP độc lập trong `deploy/edge-functions/` và workflow GitHub Pages ở `.github/workflows/deploy-pages.yml`.


## Quyền và vận hành tuần ở bản hiện tại

- **Admin:** chỉ quản trị hệ thống (`Năm học / Lớp học / Giáo viên / Phân quyền`). Admin quản lý lịch chuẩn của năm học và có thể sửa ngày bắt đầu/kết thúc từng tuần.
- **Giáo viên:** vận hành lớp (`Duyệt / Theo dõi / Quản lý tuần / TKB / Học sinh / Thống kê / Cài đặt`). GV không sửa tên lớp, năm học hoặc ngày chuẩn của tuần.
- **Cán sự:** chức năng cá nhân + hỗ trợ theo dõi lớp trong phạm vi cho phép.
- **Học sinh:** chức năng cá nhân.
- `class_weeks.manual_status = null` giữ lifecycle tự động; `open/locked` là override của GV. Tự động vẫn dựa trên buổi tự học cuối cùng của tuần.

## Database: chỉ chọn MỘT đường

### Hệ thống hiện tại đã ở V8.4.x trở lên

Chạy:

`database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql`

File này có preflight và **không chứa repair 10A1 → 7A9**.

### Dựng trên database Sổ Tự Học có các bảng lõi tương thích

Chạy:

`database/fresh-install/01-INSTALL-V8.7.1-FROM-COMPATIBLE-BASELINE.sql`

Đây **không phải** bootstrap cho Supabase hoàn toàn trống. Nguồn migration lịch sử đáng tin cậy hiện có yêu cầu sẵn các bảng lõi `profiles`, `weeks`, `registrations`, `periods`; vì vậy bản phát hành không giả tạo một empty-database schema chưa được kiểm chứng.

**Không chạy fresh-install và upgrade trên cùng database.**

Sau đó chạy `database/verify/VERIFY-V8.7.1.sql`. File verify chỉ đọc dữ liệu/schema.

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

Xem `DEPLOYMENT-V8.7.1.md` để triển khai theo đúng thứ tự.
