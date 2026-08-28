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



## UX3 hotfix verification

Kiểm tra thêm sau deploy:

- Admin → Mẫu TKB: cấu hình cơ sở chỉ cần giờ buổi, duration tiết, nghỉ giữa tiết, nghỉ dài và lựa chọn `Chỉ nghỉ ngắn / Có nghỉ dài` theo từng buổi; preview tự sinh giờ tiết.
- `Ngoại lệ nâng cao` chỉ dùng cho duration/break đặc biệt; rule thủ công phải override quy luật nghỉ tự động.
- Theo dõi lớp: selector buổi + KPI + báo cáo nằm trong một `tracking-workspace`; bấm KPI đổi kết quả ngay bên dưới và chỉ dùng dữ liệu của buổi đã chọn.
- Quản lý tuần: cột trái 280–330px, danh sách có scroll; deadline popover có Hủy/Áp dụng và field chính hiển thị ngày giờ đã chọn.
- Database đã `overall=true` thì UX3 không yêu cầu migration SQL mới.
- Edge `admin-manage-classes` phải được deploy lại vì config validator có các trường tự động nghỉ dài theo buổi.

## CI portability invariant

Bản final yêu cầu `npm test` là static suite **pure Node**:

- không cần `typescript`, Vitest hoặc package bên thứ ba;
- không được require/import `/opt/nvm/...`, global `node_modules`, hoặc absolute runtime dependency path;
- dependency-backed TypeScript behavior tests phải nằm trong `tests/unit/` và chạy bằng `npm run test:unit` sau `npm ci`;
- Node major được khai báo một lần trong `.nvmrc`; workflow phải dùng `actions/setup-node` với `node-version-file: '.nvmrc'`.

Regression guard: `tests/ci-portability.test.mjs`.

Điều này ngăn lỗi kiểu CI chạy Node 24 nhưng test còn trỏ vào thư mục global của Node 22.
