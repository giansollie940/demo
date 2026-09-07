# Deadline mặc định trước từng buổi tự học

Bản này giữ nguyên `tu-hoc-main.zip` và chỉ chuẩn hóa logic deadline mặc định.

## Quy tắc
- Tất cả tuần mặc định dùng `per_session_20`.
- Deadline của từng buổi là **ngày liền trước ngày có buổi tự học**.
- Giờ lấy từ `class_settings.per_session_deadline_time` (mặc định `20:00`).
- `registration_deadline` cấp tuần chỉ dùng khi GV chủ động chọn `specific` sau này.

## Cần triển khai
1. Deploy frontend từ source này.
2. Chạy `3-DEADLINE-MAC-DINH-TRUOC-BUOI.sql` trong Supabase SQL Editor một lần.
3. Kiểm tra query cuối script phải trả `overall_deadline_default = true`.

Lưu ý: script reset các `specific deadline` hiện có về mặc định theo từng buổi. Sau đó GV vẫn có thể tạo ngoại lệ bằng `Hạn cụ thể` trên trang Quản lý tuần.
