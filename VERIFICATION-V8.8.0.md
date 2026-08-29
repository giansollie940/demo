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
- Quản lý tuần: cột trái 360–400px, danh sách có scroll; deadline popover có Hủy/Áp dụng và field chính hiển thị ngày giờ đã chọn.
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

## UX3 CI quality-gate verification

- `npm test`: 195/195 PASS on the source tree used to create this hotfix.
- `npm run verify:release`: PASS; 231 files hashed; 10/10 Edge ZIPs valid.
- Changed `weeks-components.spec.ts` and the `<script setup>` section of `WeekEditorCard.vue` parse with TypeScript 5.8.3 with zero syntax diagnostics.
- `npm ci` could not complete in the packaging sandbox within the available network timeout, so local Vitest/vue-tsc/build are not claimed as PASS. GitHub Actions is the authoritative dependency-backed quality gate.

## Audit contract verification

The release verifier now checks the contents of `deploy/edge-functions/audit-log.zip` and requires `AUDIT_LIST_CONTRACT_VERSION = 2`. This prevents shipping an old Audit ZIP next to a newer frontend.

Expected browser behavior:
- old/pre-list Edge → `AUDIT_EDGE_OUTDATED` with Edge-only deployment guidance;
- missing Audit schema → `AUDIT_SCHEMA_NOT_READY` with current-release SQL upgrade/VERIFY guidance;
- valid empty audit table → normal empty state, not an error;
- malformed response → `AUDIT_INVALID_RESPONSE` and a frontend/Edge release mismatch warning.

## Audit source/package synchronization

The canonical release verifies all of the following:

- static Audit contract v2 tests pass;
- schema guidance is version-agnostic;
- `audit-log.zip` contains `AUDIT_LIST_CONTRACT_VERSION = 2`;
- the repository `supabase/functions/audit-log/index.ts` exactly matches `source/index.ts` inside the deployable Audit ZIP;
- the generated Audit hotfix overlay uses repository-relative paths and contains the matching deployable Audit ZIP.
## Week save dirty-state check

- Danh sách tuần desktop/laptop dùng `clamp(360px,30vw,400px)` và vẫn có `overflow-y:auto`.
- Save tuần phải dùng canonical result của `saveWeekSettingsMutation`, lập lại `drafts/initialDrafts`, và `markClean()` trước khi hiển thị thành công.
- Dirty watcher của trang tuần chạy `flush: 'sync'`; auth/realtime reload bị bỏ qua khi `status === 'saving'`.
- Regression: `tests/v880-week-save-dirty-hardening.test.mjs`.



## Week save-action UX hotfix check (2026-08-29)

- Header `Quản lý tuần` chỉ giữ thao tác `Tuần hiện hành`; không còn nút lưu tách khỏi vùng chỉnh sửa.
- `WeekEditorCard` nhận `dirty/saveState/saveMessage`, phát sự kiện `save`, và hiển thị `Có thay đổi chưa lưu` ngay khi draft khác baseline.
- Nút `Lưu thay đổi` nằm trong thẻ tuần; khi lưu thành công hiển thị `Đã lưu` khoảng 1.8 giây.
- Nếu chưa lưu mà chuyển sang chức năng khác, dirty registry và router guard vẫn cảnh báo như trước.
- Regression static: `tests/v880-week-save-dirty-hardening.test.mjs`; contract cột tuần liên quan đã cập nhật trong UX3/timetable tests.
