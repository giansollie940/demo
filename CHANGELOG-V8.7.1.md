# Changelog — SỔ TỰ HỌC V8.7.1 Full Stack

## Hợp nhất source

- Đưa frontend Vue V8.7.1, database, Supabase Edge Functions, deployment ZIPs và verification scripts vào một repository.
- Không đưa `public/config.js`, service-role/server secret hoặc Groq secret thật vào release.

## Backend

- Khôi phục đủ 10 Edge Functions từ backend V8.4.0 đã được kiểm chứng.
- Giữ shared auth, permission, CORS, rate limit, audit và validation helpers.
- Hoàn thiện `admin-manage-classes`: thống kê usage, blocker xóa lớp, đồng bộ `profiles.class_name` khi đổi mã lớp, chuyển HS đồng bộ `class_id + class_name`.
- Thay `ai-review-registration` bằng source V8.7.1 và kèm `review-logic.js`.

## Database

- Tách rõ hai đường thay thế nhau:
  - `fresh-install/01-INSTALL-V8.7.1-FROM-COMPATIBLE-BASELINE.sql`
  - `upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql`
- Generic upgrade không nhúng repair dữ liệu riêng 10A1 → 7A9.
- Gộp các patch reusable: daily quote, request-revision RPC, revision-overdue notification fix và audit actor FK `ON DELETE SET NULL`.
- Root-admin bootstrap/transfer nằm riêng trong `maintenance/`.
- Có verifier tổng và verifier riêng cho AI completed routing.

## Frontend

- Giữ V8.7.1 Vue source làm frontend authoritative; không quay lại vanilla frontend cũ.
- Giữ GitHub Pages workflow tạo browser config từ public repository settings khi build.

## Frontend parity fix — 2026-08-26

- Sửa Wise Owl/chấm đỏ: cảnh báo khẩn chỉ phản ánh registration thực sự còn cần xử lý; notification chưa đọc cũ không còn giữ chấm đỏ sau khi GV đã duyệt.
- Luồng duyệt GV ghi nhận notification liên quan trước khi reload canonical state, tránh mất ID cần mark-read.
- Wise Owl và trạng thái đăng ký dùng đồng hồ reactive 30 giây để cập nhật khi tới giờ bắt đầu tiết mà không cần chờ Realtime event mới.
- Khôi phục các chi tiết giao diện hữu ích từ vanilla: nền `school-pattern-bg.png` rất nhẹ, profile chip người đăng nhập và thẻ động lực ở sidebar.
- Thêm trang `/issues` — **Báo cáo lỗi**. `needs_revision` chưa sửa khi buổi học bắt đầu được hiển thị riêng là `revision_overdue`; học sinh chỉ thấy lỗi của mình, GV/Admin/Cán sự xem theo phạm vi lớp được phép.
- Dashboard tách **Cần chỉnh sửa** khỏi **Báo cáo lỗi**, tránh tính trùng.

## Release engineering

- Thêm `scripts/package-edge-functions.mjs` để tái tạo 10 ZIP Edge Function.
- Thêm `scripts/verify-release.mjs` để chạy regression tests, kiểm tra secret, ZIP integrity/layout, upgrade isolation và sinh `SHA256SUMS.txt`.
## Workflow hotfix — 2026-08-26

- GitHub Pages source verification now removes `public/config.js` before tests.
- `npm test`, `npm run test:unit`, and `npm run typecheck` run before runtime browser config is generated.
- `public/config.js` is generated from GitHub Secrets only after source verification and immediately before the production build.
- Added regression coverage to prevent runtime config from being generated before source security checks.


## 2026-08-26 · UI + historical statistics refinement

- Moved **Đăng xuất** into the signed-in profile dropdown in the top bar; removed the redundant sidebar logout button.
- Replaced the desktop hamburger collapse affordance with a circular edge-mounted `ChevronsLeft/ChevronsRight` control; mobile continues to use the hamburger menu where that icon is semantically correct.
- Increased the visibility of the vanilla `school-pattern-bg.png` main-surface background (84% overlay instead of 93%) while retaining the same 1100px repeated academic pattern composition.
- Added modern hover micro-interactions for sidebar items, the edge toggle, icon buttons and the signed-in profile chip, with reduced-motion support preserved.
- Promoted the selected **TUẦN** number and date range to the primary Dashboard heading.
- Fixed Statistics for old weeks: the selected week and 12-week trend now load canonical week data with Vue Query before calculating rates or exporting CSV.
- Added regression coverage for profile logout ownership, desktop edge-chevron/mobile hamburger navigation, visible vanilla background layering, hover micro-interactions, week-heading prominence, and historical week statistics.

## 2026-08-26 · Role-aware UI system + mandatory learner reminders

- Reworked navigation into a shared role-aware design system: compact grouped sidebar when expanded and a 70px icon rail with tooltips when collapsed.
- Student navigation is simplified to learning + personal areas; monitor adds **Hỗ trợ lớp**; teacher keeps learning/management/analysis/system groups; admin adds direct **Quản trị** entries for classes, teachers and permissions.
- Student/monitor **Cài đặt** moved out of the sidebar into the signed-in profile dropdown. Their personal settings contain appearance, font size, Owl visibility/motion and account/password controls; teacher/admin retain operational settings in the sidebar.
- Student/monitor statistics are personal-scoped; teacher/admin statistics remain class-scoped. Monitor Dashboard combines **Cá nhân của tôi** with **Tình hình lớp** without exposing teacher/admin administration actions.
- Mandatory learner reminders are real Owl context rules, not optional toggles: missing future registration, revision request, and pre-session reminder. Student/monitor urgent reminders auto-open while Owl is visible even if an older optional auto-open preference was stored locally.
- Monitor receives additional class-support reminders: learners still missing future registrations, learners needing revision, and an urgent warning when a self-study session is within 60 minutes and class registrations are still incomplete.
- Fixed the school-pattern surface to use the actual theme token `--bg` (the previous `--background` token did not exist) and retained translucent content/card surfaces so `school-pattern-bg.png` can remain visible behind the UI.
- Added global modern hover/micro-interactions for content actions and interactive cards while preserving `prefers-reduced-motion` and avoiding motion on passive KPI cards.
