# FEAT-LATE-001 — Ghi nhận đăng ký trễ (đăng ký bù bằng miệng) và cải thiện ý thức

Ngày: 2026-10-27.

## Yêu cầu (lời người dùng)

> Ở theo dõi cả lớp cho cán sự và giáo viên: khi HS đăng kí bù bằng miệng do đã vào tiết rồi thì
> cán sự và GV click vào đó để ghi nhận 1 lần trễ hạn; mỗi khi ghi nhận tới 3 lần trễ (có thể tùy
> chỉnh bởi GV) sẽ có 1 ghi nhận là một lần phải cải thiện ý thức (có xử phạt trên lớp); sau khi HS
> chịu xử phạt thì cán sự/GV có thể xóa lần phải cải thiện ý thức.

## Quyết định đã chốt với người dùng

| Câu hỏi | Lựa chọn |
|---|---|
| Đếm thế nào | Dồn cả năm học: cứ đủ N lần trễ thành 1 lần cải thiện ý thức, bộ đếm về 0; năm học mới đếm lại. |
| Bấm ở đâu | Học sinh **Chưa đăng ký** của buổi **đã vào tiết**; tối đa 1 lần trễ mỗi buổi; ghi nhầm thì hủy được. |
| Sau xử phạt | **Đánh dấu đã chấp hành** (giữ lịch sử), không xóa hẳn. |

Mặc định do agent chọn: cán sự không tự ghi / hủy / chấp hành cho chính mình; lần trễ đã tính vào
một lần cải thiện ý thức thì không hủy được; chỉ GV phụ trách (và admin) đổi được ngưỡng (1–20).

## Thay đổi

- Database (`supabase/migrations/20261027090000_late_registration_tracking.sql`, bản giống hệt ở
  `database/upgrade/20-FEAT-LATE-001-LATE-REGISTRATION.sql`):
  - `class_settings.late_conduct_threshold` (mặc định 3, 1–20).
  - Bảng `late_registrations` (một lần trễ còn hiệu lực cho mỗi học sinh/buổi; `revoked_at` khi hủy;
    `conduct_case_id` khi đã tính) và `conduct_cases` (`resolved_at` khi đã chấp hành).
  - RLS chỉ cho SELECT: GV phụ trách/admin, cán sự cùng lớp, chính học sinh.
  - RPC `record_late_registration`, `revoke_late_registration`, `resolve_conduct_case`
    (SECURITY DEFINER): kiểm tra vai trò, buổi đã bắt đầu (`study_session_start`), học sinh chưa có
    đăng ký (bản nháp không tính), tuần thuộc năm học của lớp; khóa theo học sinh để tạo lần cải thiện
    ý thức một cách nguyên tử; ghi `audit_logs`.
- `public/supabase-service.js`: `loadLateTracking`, `recordLateRegistration`,
  `revokeLateRegistration`, `resolveConductCase`, `setLateConductThreshold`. Khi database chưa có
  migration, `loadLateTracking` trả `available:false` và giao diện ẩn hoàn toàn tính năng.
- Trang Theo dõi cả lớp: nút **Ghi trễ · đăng ký miệng** (thẻ học sinh và bảng "Chưa đăng ký"),
  nhãn "Trễ n/N" và "Cải thiện ý thức · n", khung tổng hợp (Cần xử phạt, Đang tích lũy, Đã chấp hành,
  ô ngưỡng cho GV).
- Sửa lỗi có sẵn: `ConfirmDialog` gọi `.focus()` trên ref của component `AppButton` nên mọi hộp thoại
  xác nhận báo `confirmButton.value?.focus is not a function`; nay focus phần tử gốc của nút.

## Kiểm chứng

- `node --test tests/late-registration-db.test.mjs`: 7/7 — migration chạy trên PGlite với schema
  rút gọn mô phỏng `auth.uid()`, `can_manage_class`, `study_session_start`… (ngưỡng, nguyên tử, quyền,
  RLS, hủy, chấp hành).
- `node --test tests/late-registration-service.test.mjs`: 4/4 — lớp dịch vụ với Supabase client giả.
- `tests/unit/late-model.test.ts`: 7/7.
- Toàn bộ `npm run typecheck`, `npm run test:unit` (72/72), `npm test` (47/47), `npm run build:pages`,
  `npm run verify:release`: PASS.
- Trình duyệt (Vite dev + SupabaseService giả, vai GV 1440px và cán sự 390px): ghi trễ, đủ 3 lần tạo
  lần cải thiện ý thức, hủy ghi nhầm, đã chấp hành, đổi ngưỡng, không có nút khi buổi chưa bắt đầu,
  cán sự không tự ghi cho mình, ẩn tính năng khi chưa có migration; không lỗi JavaScript.

## Chưa làm / cần người dùng

- **Migration chưa được áp dụng lên Supabase production** (dự án `tu-hoc`). Áp dụng
  `database/upgrade/20-FEAT-LATE-001-LATE-REGISTRATION.sql` trước khi deploy giao diện (giao diện vẫn
  an toàn nếu deploy trước: tính năng tự ẩn).
- Chưa kiểm thử với phiên đăng nhập thật và realtime: danh sách ghi trễ cập nhật khi tải lại trang
  hoặc sau thao tác của chính người dùng, chưa đẩy realtime sang máy khác.
