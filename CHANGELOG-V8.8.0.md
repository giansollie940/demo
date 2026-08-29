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
- Cột master tuần trên laptop/desktop dùng `clamp(360px,30vw,400px)` và có cuộn dọc thật với scrollbar ổn định.
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

## Audit contract hardening hotfix

- Versioned the root-admin audit list response as `contract: "audit-list"` with `contractVersion: 2`.
- The browser bridge now distinguishes a pre-list/stale `audit-log` deployment (`{ok:true,count:...}`) from a valid empty audit list and raises `AUDIT_EDGE_OUTDATED` instead of a generic invalid-response error.
- Admin Audit UI now gives separate guidance for outdated Edge, Audit schema not ready, invalid response contract, and generic auth/network/backend failures.
- Audit schema guidance is release-version agnostic instead of pointing at a hard-coded V8.7.1 file.
- `verify:release` now opens the packaged `audit-log.zip` and fails if the current audit list contract marker is missing, preventing source/ZIP drift.

## Canonical source-sync stabilization

- Fixed the Audit contract release process so repository source, static contract tests, and the deployable `audit-log.zip` cannot drift silently.
- Added `scripts/package-audit-hotfix.mjs`; it generates an overlay ZIP using exact repository-relative paths instead of `frontend-patch/` / `release-guard/` wrapper folders.
- Added a release assertion that `supabase/functions/audit-log/index.ts` is byte-for-byte identical to `source/index.ts` inside `deploy/edge-functions/audit-log.zip`.
- Audit hotfix packaging now refuses stale source unless contract v2 and `AUDIT_EDGE_OUTDATED` bridge handling are both present.
## Week save dirty-state hardening

- Tăng cột danh sách tuần lên `clamp(360px,30vw,400px)` để cân đối hơn trên laptop/desktop, vẫn giữ chế độ một cột ở màn hình <=1050px.
- Sau khi lưu cấu hình tuần, baseline được lấy trực tiếp từ canonical state do mutation trả về thay vì chờ watcher của `auth.legacyState`.
- Dirty registry của trang tuần dùng `flush: 'sync'` để trạng thái điều hướng khớp ngay với draft hiện tại.
- Reload do realtime trong lúc save không còn chen vào quá trình lập baseline; sau save thành công `weeks` được `markClean()` ngay, tránh cảnh báo sai “Thay đổi chưa được lưu” khi chuyển chức năng.



## Week management save-action UX hotfix (2026-08-29)

- Xác nhận cảnh báo rời trang khi chưa lưu là hành vi đúng; nguyên nhân trải nghiệm là nút `Lưu thay đổi` nằm xa vùng chỉnh sửa nên dễ bị bỏ sót.
- Chuyển thao tác lưu từ header xuống ngay footer của thẻ tuần đang chỉnh, cạnh `Xem tuần / Mở TKB tuần này`.
- Khi draft thay đổi, thẻ tuần hiển thị thanh `Có thay đổi chưa lưu` cùng nút `Lưu thay đổi`; lỗi lưu được hiển thị ngay tại vùng thao tác.
- Sau khi backend trả canonical state và draft trở về clean, hiển thị `Đã lưu` ngắn khoảng 1.8 giây rồi tự thu gọn.
- Cột danh sách tuần tăng lên `clamp(360px,30vw,400px)`; breakpoint <=1050px vẫn chuyển về một cột.
- Không thay SQL, Edge Function hay dirty-navigation contract.

## Admin TKB + Week UX R4 (2026-08-29)

- Khi chọn mẫu TKB trong Admin, Builder đồng bộ lại theo `templateId + versionId` nên phiên bản vừa tải/đồng bộ không còn để form ở trạng thái trắng hoặc stale.
- Khu vực gán TKB cho lớp tự chọn phiên bản mới nhất khi danh sách version xuất hiện sau template và hiển thị tóm tắt mẫu đang chọn: khung giờ sáng, chiều và thời lượng mỗi tiết.
- Tạo/lưu TKB có feedback ngay tại khối TKB (`Đang tạo/lưu…`, thành công, lỗi); mẫu vừa tạo được tự chọn lại sau khi backend trả canonical result.
- Quản lý tuần có nút `Hủy thay đổi` ngay cạnh `Lưu thay đổi`, phục hồi tuần đang chọn về baseline đã lưu gần nhất mà không ảnh hưởng tuần khác.
- Nền Vanilla `school-pattern-bg.png` được đưa vào `src/assets` và import qua Vite thay vì ghép public runtime URL, giúp asset được resolve ổn định khi deploy GitHub Pages theo subfolder.
- Bổ sung regression tests cho tải phiên bản TKB, feedback lưu/tạo, assignment version refresh, hủy thay đổi tuần và asset nền Vanilla.
