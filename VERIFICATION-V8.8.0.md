# VERIFICATION — SỔ TỰ HỌC V8.8.0

## Database

Sau upgrade chạy `database/verify/VERIFY-V8.8.0.sql` và yêu cầu dòng cuối:

`overall = true`

Verifier kiểm tra tối thiểu:

- 4 bảng template/version/period snapshot/assignment;
- resolver TKB theo `class + date`;
- `study_session_start(class_id, ...)`;
- toàn bộ registration guard dùng thời gian TKB theo lớp;
- assignment không overlap;
- assignment nằm trong biên năm học;
- RPC assignment tự kiểm tra biên năm học;
- lớp active có assignment;
- mẫu mặc định tồn tại theo từng năm;
- migration marker tồn tại.

## Source/CI

Các lệnh cần PASS trong GitHub Actions:

```text
npm ci
npm test
npm run test:unit
npm run typecheck
npm run build
```

Trước đóng gói chạy thêm:

```text
npm run verify:release
```

`verify:release` phải xác nhận 10 Edge ZIP hợp lệ và không có browser config/secret production trong source.

## Runtime

Smoke-test 4 vai trò, đặc biệt:

- Admin account dialogs + reset password + loading;
- Admin Owl settings;
- Quick Report đúng buổi;
- template preview và day override;
- 40-period ceiling;
- assignment date bounds;
- GV schedule generated periods;
- Cán sự read-only;
- week deadline popover;
- Audit không chứa password.
## Lưu ý verifier final

Verifier cuối dùng `[[:space:]]+` để chuẩn hóa `pg_get_functiondef()` và `pg_get_expr(...)` để đọc policy trực tiếp từ catalog PostgreSQL. Hai check class-specific không còn phụ thuộc cách PostgreSQL xuống dòng/format biểu thức.

Khi cần chẩn đoán riêng, dùng `database/verify/DIAG-V8.8.0-REGISTRATION-GUARDS.sql`; file này chỉ đọc.

