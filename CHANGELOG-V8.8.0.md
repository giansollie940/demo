# Changelog — SỔ TỰ HỌC V8.8.0

## UX quản trị
- HS/GV dùng dialog tạo/sửa; bỏ `window.prompt()` khỏi luồng chỉnh sửa tài khoản Admin.
- Admin reset mật khẩu HS/Cán sự/GV bằng dialog có tạo ngẫu nhiên, copy, show/hide, validation và loading.
- Optimistic cache cho thay đổi an toàn; hard-delete chỉ biến mất sau server confirm.
- Admin có Tùy chọn cá nhân và Cú Thông Thái.
- Loading/`Đang xử lý` được bổ sung cho mutation tài khoản, lớp, timetable và các thao tác quản lý đăng ký.

## Theo dõi lớp & tuần
- `Chưa đăng ký / Có thiết bị / Không thiết bị / Chưa rõ thiết bị` là Quick Report theo **đúng buổi đang chọn**.
- Không suy diễn HS chưa đăng ký thành `Không thiết bị`.
- Theo dõi lớp dùng một workspace liền mạch: selector buổi + KPI có thể bấm + báo cáo/danh sách của đúng buổi đang chọn trong cùng một khối.
- Cột master tuần trên laptop/desktop dùng `clamp(280px,25vw,330px)` và có cuộn dọc thật với scrollbar ổn định.
- Hạn cụ thể mở bằng popover/bottom sheet có `Hủy / Áp dụng hạn`; sau khi áp dụng, field chính hiển thị ngay ngày giờ thực tế thay vì chữ chung chung “Hạn cụ thể”.

## UX3 — Builder TKB tự động hơn
- Cấu hình cơ sở không còn bắt Admin liệt kê nghỉ ngắn sau từng tiết.
- App tự chèn `Nghỉ giữa các tiết` giữa các tiết có thể sinh được.
- Buổi sáng và buổi chiều chọn độc lập `Chỉ nghỉ ngắn / Có nghỉ dài`; khi bật nghỉ dài chỉ cần chọn vị trí `Sau tiết`.
- Nghỉ dài tự thay thế nghỉ ngắn tại đúng vị trí đã chọn.
- Các trường hợp hiếm như không nghỉ, nghỉ tùy chỉnh hoặc duration riêng từng tiết được gom vào `Ngoại lệ nâng cao`.
- Biến thể theo ngày vẫn kế thừa cấu hình cơ sở và có thể override kiểu nghỉ theo buổi.

## Mẫu TKB V8.8
- Nhiều template mỗi năm học; version immutable và assignment có khoảng hiệu lực.
- App tự tính số tiết và giờ bắt đầu/kết thúc từ khung buổi, duration và break rules.
- Ngoại lệ duration từng tiết; nghỉ `none/short/long/custom`.
- Nghỉ ngắn/dài cho phép `0 phút`; Edge và frontend dùng cùng validation.
- Day override kế thừa cấu hình cơ sở.
- Một ngày tối đa 40 tiết, đồng bộ với snapshot DB.
- Assignment bị chặn nếu vượt ngày bắt đầu/kết thúc năm học, ở cả UI, Edge và RPC SQL.
- Migration mặc định tự tách sáng/chiều theo khoảng nghỉ lớn nhất >=30 phút và giữ exact period snapshots.
- GV chỉ chọn study slots; Cán sự read-only.
- Lifecycle, revision overdue, emergency cancel và student update guard dùng giờ TKB hiệu lực của đúng lớp/ngày.

## Audit & bảo mật
- Audit target-aware khi reset password; không ghi password.
- Audit create/save/assign timetable.
- Nhật ký phân biệt backend/schema error với empty result.
## Verifier final
- Sửa false-positive của `VERIFY-V8.8.0.sql`: chuẩn hóa whitespace PostgreSQL bằng `[[:space:]]+` và đọc policy bằng `pg_get_expr(...)`.
- Bổ sung `DIAG-V8.8.0-REGISTRATION-GUARDS.sql` (read-only) để chẩn đoán hai guard đăng ký.
- Bổ sung `REPAIR-V8.8.0-REGISTRATION-GUARDS.sql` trong `database/maintenance/` cho trường hợp database nâng cấp dở dang.


## CI portability hotfix — không phụ thuộc đường dẫn Node toàn cục
- Loại bỏ hoàn toàn việc `npm test` tự nạp TypeScript từ đường dẫn NVM/global như `/opt/nvm/.../typescript.js`.
- Hai kiểm thử hành vi engine TKB được chuyển về đúng `tests/unit/timetable-engine.spec.ts` để Vitest xử lý TypeScript sau `npm ci`.
- Static suite `npm test` giờ chỉ dùng Node built-ins/relative imports và có thể chạy ngay cả khi chưa có `node_modules`.
- Bổ sung `tests/ci-portability.test.mjs`: CI tự fail nếu test sau này hard-code global Node/TypeScript path hoặc đưa dependency ngoài vào static suite.
- Bổ sung `.nvmrc` làm nguồn Node major duy nhất; GitHub Actions dùng `node-version-file: '.nvmrc'` thay vì hard-code version trong workflow.
- Workflow preflight bắt buộc `.nvmrc` tồn tại trước khi setup Node.

## UX3 CI quality-gate hardening (2026-08-28)

- Fixed stale `WeekEditorCard` Vitest expectations after the deadline editor moved to an on-demand popover.
- Unit tests now verify the applied deadline summary while the popover is closed, instead of requiring a hidden `datetime-local` input to exist in SSR output.
- Invalid saved `specific` deadline state is now surfaced on the visible deadline selector with `aria-invalid`, `aria-describedby`, and the actionable message `Hãy chọn ngày và giờ hết hạn.`.
- Added `npm run verify:quality`, backed by `scripts/run-quality-gate.mjs`, as the single CI quality gate for static tests, Vitest unit tests, and Vue/TypeScript typecheck.
- The quality gate runs every check and prints a combined summary before failing, so one CI run can expose all failing quality gates instead of revealing them one by one across repeated pushes.
- GitHub Pages workflow now calls the aggregate quality gate before runtime browser config generation.
- Added regression guards to prevent unit tests from reverting to the obsolete always-visible deadline input contract.
