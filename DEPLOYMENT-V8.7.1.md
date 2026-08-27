# Triển khai SỔ TỰ HỌC V8.7.1 FULL

## 0. Trước khi thay đổi

1. Sao lưu database Supabase hiện tại.
2. Giữ lại ZIP/source frontend đang chạy để rollback.
3. Không xóa `config.js` của site đang chạy trước khi bản mới build thành công.

## Thứ tự bắt buộc cho bản có Quản lý Năm học

Bản frontend/Edge Function này phụ thuộc vào hai RPC mới `admin_create_school_year` và `admin_set_active_school_year`. Với database đang chạy, triển khai theo đúng thứ tự:

```text
Backup database
→ chạy database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql
→ chạy database/verify/VERIFY-V8.7.1.sql và yêu cầu overall = true
→ deploy Edge Functions (ít nhất admin-manage-classes; khuyến nghị đủ 10 ZIP cùng release)
→ deploy frontend GitHub Pages
```

Không deploy frontend/`admin-manage-classes` mới trước khi database upgrade hoàn tất, nếu không thao tác tạo/kích hoạt năm học sẽ lỗi vì RPC chưa tồn tại.

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

Yêu cầu `overall = true`.

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

Mỗi ZIP chứa `source/index.ts` và `source/_shared/*`. `ai-review-registration.zip` còn chứa `source/review-logic.js`.

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

Kiểm tra tối thiểu:

1. Student đăng nhập, đăng ký và sửa đăng ký.
2. AI trả đúng ba nhánh: duyệt, yêu cầu sửa, chuyển GV.
3. Teacher duyệt/yêu cầu sửa trước giờ bắt đầu buổi học.
4. Theo dõi lớp hiển thị đúng registered/missing/attention và device filter.
5. Root admin xem lớp, học sinh, giáo viên, phân quyền; đổi mã lớp đồng bộ `class_name`; chuyển HS đồng bộ `class_id + class_name`; lớp có lịch sử không xóa cứng được.
6. Soft-delete/restore tài khoản không làm mất lịch sử.
7. Realtime không tạo subscription trùng khi đổi trang/lớp/tuần.
8. Sau khi GV duyệt registration, Wise Owl không còn chấm đỏ/cảnh báo "cần xử lý" nếu không còn registration cần xử lý thật sự.
9. Nếu registration đang `needs_revision` mà HS không sửa trước giờ bắt đầu tiết, `/issues` hiển thị **Báo cáo lỗi** và Dashboard không còn tính nó trong **Cần chỉnh sửa**.
10. Dark/light mode, mobile, school-pattern background, profile chip và Wise Owl hoạt động bình thường.
11. Admin mở tab **Năm học**, tạo một năm học thử với ngày bắt đầu/kết thúc hợp lệ; kiểm tra các tuần cơ sở được tạo và năm mới xuất hiện trong selector.
12. Kích hoạt năm học mới; kiểm tra chỉ một năm có `is_active = true`.
13. Admin/GV đổi bong bóng **Năm học**; danh sách Lớp và Tuần phải đổi theo năm đó, Dashboard/Tracking/Statistics không dùng dữ liệu của năm trước.
14. HS/Cán sự không được tự do chuyển sang năm học khác lớp của mình.
15. Sidebar bubble chỉ xoay vòng gradient khi hover/focus; active không quay liên tục và reduced-motion không chạy animation.

## 8. Rollback

Frontend: redeploy artifact frontend trước đó.

Database/backend: rollback phải dựa trên backup đã tạo ở bước 0; không chạy ngược các SQL bằng suy đoán.
