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
