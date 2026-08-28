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
- Cột master tuần thu còn khoảng 210–225px.
- Hạn cụ thể mở bằng popover/bottom sheet, không làm layout nhảy.

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

