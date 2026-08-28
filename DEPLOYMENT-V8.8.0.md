# Triển khai SỔ TỰ HỌC V8.8.0

V8.8.0 là bản nâng cấp UX quản trị + Theo dõi lớp + Quản lý tuần + hệ thống Mẫu TKB phiên bản hóa. Database V8.7.1 final là baseline bắt buộc.

## Thứ tự bắt buộc

1. **Backup database**.
2. Nếu database chưa ở V8.7.1 Layer/Dock/Audit final, hoàn tất upgrade/verify V8.7.1 trước.
3. Chạy `database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql`.
4. Chạy `database/verify/VERIFY-V8.8.0.sql` và chỉ tiếp tục khi dòng `overall = true`.
5. Deploy lại **10 Edge Functions** từ `deploy/edge-functions/`. `admin-manage-classes` và `admin-reset-password` là bắt buộc cho V8.8.0; deploy cả 10 giúp tránh lệch phiên bản.
6. Upload nội dung của ZIP **GITHUB ROOT-FLAT** trực tiếp vào root repository.
7. GitHub Actions phải qua `npm ci`, `npm test`, `npm run test:unit`, `npm run typecheck`, `npm run build`, rồi deploy Pages.
8. Hard refresh (`Ctrl + Shift + R`) và smoke-test Admin → GV → Cán sự → HS.

## Migration Mẫu TKB

Upgrade tạo:

- `timetable_templates`
- `timetable_template_versions`
- `timetable_version_periods`
- `class_timetable_assignments`

Khung giờ hiện tại được chuyển thành mẫu dự trữ **`TKB mặc định V8.8.0`**. Migration:

- giữ nguyên giờ bắt đầu/kết thúc thực tế của các tiết;
- suy ra ngoại lệ thời lượng từng tiết;
- suy ra khoảng nghỉ giữa các tiết;
- nếu có khoảng nghỉ lớn **>= 30 phút**, dùng khoảng lớn nhất để tách buổi sáng và buổi chiều thay vì coi giờ nghỉ trưa là một custom break;
- gán snapshot mặc định cho lớp hiện có trong đúng biên ngày của năm học;
- chạy lại an toàn theo tên mẫu dự trữ, không ghi đè mẫu Admin tự tạo.

## Quy tắc Mẫu TKB V8.8.0

Admin có thể tạo nhiều mẫu trong một năm học. Mỗi phiên bản chứa cấu hình cơ sở và biến thể theo ngày; app tự sinh giờ tiết từ:

- giờ bắt đầu/kết thúc buổi sáng và chiều;
- thời lượng tiết chuẩn;
- ngoại lệ thời lượng từng tiết;
- nghỉ `Không / Ngắn / Dài / Tùy chỉnh`;
- override theo thứ kế thừa cấu hình cơ sở.

Nghỉ ngắn/dài có thể bằng `0 phút`; thời lượng một tiết phải >= 1 phút. Một ngày tối đa **40 tiết**, đồng bộ giữa frontend, Edge và database.

Assignment TKB của lớp:

- có `effective_from / effective_to`;
- không được overlap;
- phải nằm trọn trong ngày bắt đầu/kết thúc của năm học;
- khi gán khoảng mới, RPC tự tách phần lịch cũ bên ngoài khoảng mới để giữ lịch sử.

## Smoke test bắt buộc

### Admin
- Sửa HS/GV bằng dialog; dữ liệu cập nhật có loading/đồng bộ rõ ràng.
- Reset mật khẩu HS/Cán sự/GV; mật khẩu không xuất hiện trong Audit.
- Tùy chọn cá nhân có Cú Thông Thái.
- Năm học → Mẫu TKB: tạo mẫu, preview, ngoại lệ tiết, nghỉ tùy chỉnh, biến thể theo ngày, version mới và assignment theo khoảng hiệu lực.
- Thử nhập assignment vượt biên năm học: UI và backend phải chặn.

### GV
- Theo dõi lớp: Quick Report chỉ phản ánh **buổi đang chọn**.
- `Chưa đăng ký / Có thiết bị / Không thiết bị / Chưa xác định thiết bị` hiển thị báo cáo ngắn.
- Các mutation duyệt/sửa/xóa hiển thị trạng thái đang xử lý.
- TKB: GV chỉ chọn tiết Tự học trong các tiết được mẫu sinh ra.
- Quản lý tuần: cột tuần gọn; deadline cụ thể mở overlay/popover không đẩy bố cục.

### Cán sự
- Xem Quick Report theo buổi và TKB ở chế độ read-only.

### Nhật ký hệ thống
- Tải được dữ liệu hoặc báo lỗi backend/schema rõ ràng, không giả thành danh sách rỗng.
- Có action tạo/lưu/gán TKB và reset password nhưng không có giá trị mật khẩu.
## Verifier V8.8.0 final

Bản release này đã tích hợp verifier cuối cùng, không dùng bản verifier cũ có thể báo false-positive ở hai mục `delete_registration_class_specific` và `student_update_policy_class_specific`.

Nếu `VERIFY-V8.8.0.sql` vẫn báo lỗi hai guard này, chạy file read-only `database/verify/DIAG-V8.8.0-REGISTRATION-GUARDS.sql` trước khi dùng repair. Chỉ khi diagnostic xác nhận guard thật sự còn cũ mới chạy `database/maintenance/REPAIR-V8.8.0-REGISTRATION-GUARDS.sql`, sau đó chạy lại verifier đầy đủ.

