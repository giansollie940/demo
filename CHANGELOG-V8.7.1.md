## 2026-08-27 · Role boundary + year/week lifecycle + macOS Dock

- Tách quyền cuối theo nghiệp vụ: **Admin chỉ quản trị hệ thống**, **GV vận hành lớp**, **Cán sự hỗ trợ lớp**, **HS quản lý cá nhân**. Admin route/sidebar không còn Dashboard/Duyệt/Tracking/Weeks/TKB/Học sinh/Thống kê/Cài đặt của GV.
- Admin topbar chỉ giữ **Năm học + theme + profile**; GV giữ **Năm học + Lớp + Tuần**. HS/Cán sự tiếp tục theo context lớp của tài khoản.
- Sửa KPI `Năm học = 0`: Admin overview hợp nhất directory Edge với `context.schoolYears`, nên năm học active đã tải trong legacy state không bị biến thành 0 khi directory cache/response thiếu.
- Tab **Năm học** của Admin hiển thị lịch tuần chuẩn và cho root admin sửa `start_date/end_date` từng tuần qua action `update_school_year_week`; GV không được sửa lịch chuẩn toàn trường.
- GV vẫn có **Quản lý tuần** ở tầng lớp: deadline, tuần nghỉ, ghi chú, TKB tuần và `Tự động / Mở thủ công / Đóng thủ công`. Lớp mới có `class_weeks.manual_status`; `null` nghĩa là quay lại tự động.
- `class_week_effective_status` ưu tiên manual override, sau đó tự tính lifecycle dựa trên **buổi tự học cuối cùng** của từng tuần (week override → default study schedule → period end time); qua boundary thì tuần trước khóa và tuần vận hành kế tiếp tự mở như phiên bản cũ.
- Cài đặt GV hiển thị **Lớp/Năm học** dưới dạng metadata chỉ đọc thay vì input, tránh ngộ nhận GV có thể sửa cấu trúc hệ thống.
- Sidebar giữ floating panel + vòng gradient xoay một lần khi hover, đồng thời thêm **macOS Dock magnification**: mục hover phóng/nổi rõ, hai mục lân cận phóng nhẹ, collapsed icon rail có hiệu ứng mạnh hơn; `prefers-reduced-motion` đưa scale về 1.


## Admin consolidated navigation + floating iPad sidebar

- Gộp các mục Admin `Năm học`, `Lớp học`, `Giáo viên`, `Phân quyền` thành một mục sidebar duy nhất: `Quản trị hệ thống`.
- Giữ đầy đủ các khu vực trên dưới dạng tab nội bộ của `AdminPage`.
- Chuyển sidebar desktop thành floating panel kiểu iPad: tách khỏi mép màn hình 12px, bo tròn 26px, blur/saturation và shadow nhiều lớp.
- Giữ compact bubble navigation, icon rail khi thu gọn và vòng gradient xoay ngắn khi hover.
- Mobile drawer vẫn dùng cùng panel nổi nhưng trượt từ cạnh trái.

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

## 2026-08-26 · Warm flat sidebar + independent pattern layer

- Removed the visual navigation-group treatment introduced in the prior role-aware UI pass. Navigation remains role-aware but is now one compact flat list when expanded, matching the requested combination of compact sidebar + collapsed icon rail only.
- Preserved the 70px collapsed icon rail with hover/focus tooltips and the desktop edge-chevron control; mobile continues to use the hamburger drawer trigger.
- Rebalanced the light palette away from cool blue dominance toward vanilla-inspired warm cream, peach, coral, amber and violet while retaining mint/blue only where they provide useful semantic contrast.
- Updated the primary gradient from violet/blue to violet/lilac/coral and warmed the topbar, sidebar header, profile surfaces and page-header washes.
- Reimplemented `school-pattern-bg.png` as an independent `main::before` pattern layer. The light theme uses a visible 14% pattern opacity over a warm base with multiply blending, so card/content surfaces can no longer hide the image.
- Dark mode now uses a warm charcoal-plum palette (`#17151c` / `#211e29`) and reduces the pattern to 2.5% with a darker filter so the texture remains subtle and cannot wash out dark surfaces.
- Added a shared 260ms theme transition for body/shell/sidebar/main/topbar surfaces and pattern opacity/filter, producing a smoother light ↔ dark switch without a bright pattern flash.
- Preserved modern hover micro-interactions for navigation, profile, icon buttons and content actions, including reduced-motion safeguards.

## 2026-08-27 · Soft floating topbar bubbles

- Replaced the full-width topbar divider treatment with separate floating bubble surfaces for class/year identity, class selector, week selector, theme action and signed-in profile.
- Removed the hard topbar bottom rule plus sidebar right/header divider rules; subtle elevation now separates navigation/header from the warm patterned canvas.
- Refined context selectors into pill controls with warm translucent surfaces, rounded 999px geometry and hover lift instead of boxed toolbar segments.
- Restyled the profile dropdown as a softer rounded popover card with warm peach/violet surfaces and no internal divider lines.
- Removed duplicated **Cài đặt** from teacher/admin profile dropdowns. Teacher/admin continue to use the sidebar Settings entry; student/monitor retain **Tùy chọn cá nhân** in their profile menu.
- Added regression coverage for floating bubble composition, soft hover elevation, role-aware profile settings visibility and removal of hard shell divider lines.

## 2026-08-27 · School-year context + Admin year management + bubble navigation

- Replaced the duplicated class/year identity bubble at the left of the topbar with a dedicated **Năm học** context bubble. The class selector remains only in the right context controls, so `7A9` is no longer repeated.
- Added role-aware year context: Admin can browse every school year; teachers see years represented by classes they are allowed to access; students/monitors remain fixed to the school year of their own class.
- Selecting a year now reloads the dependent **Lớp → Tuần → Dashboard/Tracking/Statistics** context instead of changing display text only. Selected-year context is preserved across manager reloads.
- Added Admin tab **Năm học** with create and activate actions. New years are created through the root-admin Edge Function and PostgreSQL RPC, automatically generating base week rows. Exactly one year can be activated atomically; no delete-year action is exposed.
- Added `admin_create_school_year(uuid,text,date,date,boolean)` and `admin_set_active_school_year(uuid,uuid)` SECURITY DEFINER RPCs with explicit active root-admin validation. Both fresh-install and current-upgrade SQL include the reusable year-management block, and the database verifier checks both RPCs.
- Class creation now uses the **selected** school year rather than silently using the globally active year. Week rebasing also receives the selected school-year id, preventing historical-year views from editing the wrong year's weeks.
- Reworked the flat sidebar into warm **bubble navigation** without reintroducing visual group headings. Expanded mode uses compact soft pills; collapsed mode is an icon-bubble rail with tooltips.
- Hovering a navigation icon runs one short warm violet/coral/amber `conic-gradient` ring rotation; the active item does not spin continuously, and `prefers-reduced-motion` disables the animation.
- Added regression coverage for school-year state/selector behavior, Admin create/activate contracts, selected-year week rebasing, duplicate-class removal, bubble navigation and hover-ring motion.


## 2026-08-27 · Period theo năm học + Week master-detail + macOS Dock displacement

- School-year bubble no longer appends `· Đang hoạt động`; a small green status dot indicates the active year.
- Teacher `Quản lý tuần` now uses a master–detail layout: searchable/filterable week list on the left, one editable week on the right.
- Added `school_year_periods` so Admin can define period start/end times per school year without rewriting historical years. Existing years are seeded from the legacy global `periods` table.
- Added root-admin action `update_school_year_periods` backed by SECURITY DEFINER RPC `admin_replace_school_year_periods`; overlap and invalid time ranges are rejected.
- `study_session_start()` and automatic class-week lifecycle now resolve period times from the week's school year first, with the global period table as compatibility fallback.
- Sidebar Dock now combines magnification with neighbor displacement/shrink and a fixed navigation safe zone below the brand, preventing enlarged icons from colliding with each other or the app logo. The one-shot rotating warm gradient ring remains.
