# Triển khai SỔ TỰ HỌC V8.7.1 FULL

## 0. Trước khi thay đổi

1. Sao lưu database Supabase hiện tại.
2. Giữ lại ZIP/source frontend đang chạy để rollback.
3. Không xóa `config.js` của site đang chạy trước khi bản mới build thành công.

## Thứ tự bắt buộc cho bản có Quản lý Năm học

Bản frontend/Edge Function này phụ thuộc vào RPC quản lý năm học, patch vận hành tuần (`class_weeks.manual_status` + `class_week_effective_status`) và bảng khung giờ theo năm học `school_year_periods`. Với database đang chạy, triển khai theo đúng thứ tự:

```text
Backup database
→ chạy database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql
→ chạy database/verify/VERIFY-V8.7.1.sql và yêu cầu overall = true
→ deploy Edge Functions (ít nhất admin-manage-classes; khuyến nghị đủ 10 ZIP cùng release)
→ deploy frontend GitHub Pages
```

Không deploy frontend/`admin-manage-classes` mới trước khi database upgrade hoàn tất. Bản này cần RPC năm học, action sửa lịch tuần chuẩn và cột `class_weeks.manual_status`; nếu thiếu, quản lý năm học hoặc Mở/Đóng thủ công của GV sẽ không hoạt động đúng.

## 1. Database — chọn đúng một nhánh

### A. Database hiện tại đã có V8.4.x / cấu trúc multiclass

Chạy duy nhất:

```text
database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql
```

Preflight sẽ dừng nếu thiếu các bảng/RPC cốt lõi. Generic upgrade không chứa repair lớp 10A1/7A9.

### B. Database Sổ Tự Học cũ có core tables tương thích nhưng chưa lên V8.4.x

Chạy duy nhất:

```text
database/fresh-install/01-INSTALL-V8.7.1-FROM-COMPATIBLE-BASELINE.sql
```

File này yêu cầu sẵn các bảng lõi `profiles`, `weeks`, `registrations`, `periods`. Không dùng cho Supabase hoàn toàn trống.

### Không được làm

Không chạy A rồi chạy B, hoặc B rồi chạy A. Hai đường là lựa chọn thay thế nhau.

## 2. Root admin

Nếu hệ thống đã có đúng một root admin, không chạy bootstrap lại.

Nếu thiết lập lần đầu trên database tương thích, chỉnh email trong:

```text
database/maintenance/BOOTSTRAP-ROOT-ADMIN-BY-EMAIL.sql
```

Khi cần chuyển root admin sau này, dùng:

```text
database/maintenance/TRANSFER-ROOT-ADMIN-BY-EMAIL.sql
```

Cả hai là thao tác quản trị database, không phải tính năng frontend.

## 3. Verify database

Chạy:

```text
database/verify/VERIFY-V8.7.1.sql
```

Yêu cầu `overall = true`. Verifier bản này còn phải báo PASS cho `class_week_manual_status_column`, `class_week_effective_status_manual_override`, `school_year_periods_table`, `school_year_periods_seeded`, `study_session_start_year_periods` và `school_year_period_replace_rpc`.

Khi kiểm tra riêng routing AI đã completed, chạy thêm:

```text
database/verify/VERIFY-AI-COMPLETED-ROUTING-V8.7.1.sql
```

Hai file verify là read-only.

## 4. Edge Function secrets

Thiết lập trong Supabase Edge Function secrets, không đưa vào GitHub frontend:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEYS` hoặc `SUPABASE_SERVICE_ROLE_KEY`
- `ALLOWED_ORIGINS` (có thể giữ `ALLOWED_ORIGIN` để tương thích cấu hình cũ)
- `LOGIN_DOMAIN`
- `GROQ_API_KEY`
- `GROQ_REVIEW_MODEL` nếu muốn override model mặc định

`ALLOWED_ORIGINS` phải chứa **origin**, ví dụ `https://giansollie940.github.io`, không thêm `/tu-hoc/` vào cuối origin.

## 5. Deploy Edge Functions

`deploy/edge-functions/` có 10 ZIP Supabase Dashboard-ready:

1. `admin-list-users.zip`
2. `admin-create-user.zip`
3. `admin-update-user.zip`
4. `admin-delete-user.zip`
5. `admin-reset-password.zip`
6. `admin-manage-classes.zip`
7. `ai-review-registration.zip`
8. `emergency-register.zip`
9. `audit-log.zip`
10. `quote-feed.zip`

Mỗi ZIP chứa `source/index.ts` và thư mục `_shared/*` **ở cấp ZIP root** để các import `../_shared/...` từ `source/index.ts` resolve đúng trong Supabase bundler. Không đặt `_shared` bên trong `source/`. `ai-review-registration.zip` còn chứa `source/review-logic.js`.

## 6. GitHub Pages frontend

Workflow `.github/workflows/deploy-pages.yml` dùng Node 24, chạy `npm ci`, typecheck, static tests, unit tests và build trước khi deploy.

Trong GitHub repository, thiết lập:

**Repository secrets**
- `SUPABASE_PROJECT_URL`
- `SUPABASE_PUBLISHABLE_KEY`

**Repository variable**
- `LOGIN_DOMAIN`

Workflow tự tạo `public/config.js` khi build. Chỉ public project URL/publishable key đi vào browser config; không đưa server credential hay Groq key vào frontend.

## 7. Smoke test sau deploy

Kiểm tra tối thiểu theo vai trò:

1. **Admin** đăng nhập phải được đưa về `/admin`; sidebar chỉ có **Quản trị hệ thống** và topbar không có bộ chọn Lớp/Tuần.
2. Admin tab **Năm học** thấy `2026–2027` đang hoạt động; KPI số năm học không được bằng 0 khi context đã có năm active.
3. Admin tạo/kích hoạt một năm học thử; kiểm tra chỉ một năm có `is_active = true`.
4. Admin sửa ngày bắt đầu/kết thúc một **tuần chuẩn** trong tab Năm học; reload lại và xác nhận ngày được giữ.
5. Admin sửa **Khung giờ tiết học** của năm đang chọn, lưu/reload và xác nhận giờ được giữ; kiểm tra một năm học khác vẫn giữ giờ riêng.
6. Admin tạo/sửa lớp, phân công GV, quản lý GV/phân quyền; không có các màn Duyệt đăng ký, Quản lý tuần, TKB, Thống kê lớp của GV.
7. **GV** đăng nhập thấy Năm học + Lớp + Tuần; không thể mở trang Admin và không có action sửa tên lớp/năm học hoặc ngày chuẩn của tuần.
8. GV `Quản lý tuần`: thử `Tự động → Mở thủ công → Đóng thủ công → Tự động`, lưu/reload và xác nhận `manual_status` lần lượt `null/open/locked/null`.
9. Ở chế độ **Tự động**, xác nhận thời điểm hiển thị “Tự động đóng sau buổi tự học cuối” khớp buổi cuối của TKB tuần; sau boundary, tuần cũ khóa và lifecycle chuyển sang tuần kế tiếp.
10. GV thay deadline/tuần nghỉ/ghi chú/TKB tuần và xác nhận chỉ ảnh hưởng lớp đang chọn.
11. GV duyệt/yêu cầu sửa đăng ký; Wise Owl hết chấm đỏ sau khi xử lý xong nếu không còn registration thực sự cần GV.
12. **Cán sự** chỉ có chức năng cá nhân + Theo dõi lớp giới hạn; không có Duyệt, Quản lý tuần, TKB hay cấu hình AI.
13. **HS** chỉ có chức năng cá nhân; yêu cầu sửa không hoàn tất trước giờ bắt đầu chuyển sang **Báo cáo lỗi**.
14. Statistics của GV ở tuần cũ phải tải đúng dữ liệu tuần đã chọn; HS/Cán sự chỉ thấy thống kê cá nhân.
15. Đổi light/dark mode: nền warm pattern chuyển mượt; dark mode không bị ảnh nền làm bạc/chớp.
16. Sidebar macOS Dock: mục hover nổi/phóng, hai mục lân cận phóng nhẹ, vòng gradient chỉ xoay một lần; reduced-motion không magnify/rotate.
17. Realtime không tạo subscription trùng khi đổi trang/lớp/tuần.

## 8. Rollback

Frontend: redeploy artifact frontend trước đó.

Database/backend: rollback phải dựa trên backup đã tạo ở bước 0; không chạy ngược các SQL bằng suy đoán.
