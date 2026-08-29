# Triển khai SỔ TỰ HỌC V8.8.0

V8.8.0 là bản nâng cấp UX quản trị + Theo dõi lớp + Quản lý tuần + hệ thống Mẫu TKB phiên bản hóa. Database V8.7.1 final là baseline bắt buộc.

### UX3 hotfix (bản đóng gói này)
Nếu database hiện tại đã chạy V8.8.0 và `database/verify/VERIFY-V8.8.0.sql` trả `overall=true`, **không cần chạy lại SQL upgrade** chỉ để nhận UX3. Hotfix này thay đổi frontend và validation/config của Edge `admin-manage-classes`; nên deploy lại Edge này, hoặc an toàn nhất deploy lại đủ 10 Edge Function trong gói để tránh lệch phiên bản.

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

Ở builder UX3, Admin nhập quy luật cơ sở thay vì liệt kê từng khoảng nghỉ:

- giờ bắt đầu/kết thúc buổi sáng và buổi chiều;
- thời lượng tiết chuẩn;
- thời lượng nghỉ giữa các tiết;
- thời lượng nghỉ dài;
- mỗi buổi chọn độc lập `Chỉ nghỉ ngắn` hoặc `Có nghỉ dài`; nếu có, chọn nghỉ dài sau tiết nào;
- app tự tính giờ bắt đầu/kết thúc và số tiết tối đa;
- chỉ các trường hợp hiếm mới dùng `Ngoại lệ nâng cao` (duration riêng, không nghỉ, nghỉ tùy chỉnh, long/short override).


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
- Selector buổi, KPI có thể bấm và kết quả nằm trong cùng một workspace; không còn card thống kê rời rồi nhảy xuống một vùng chi tiết khác.
- `Chưa đăng ký / Có thiết bị / Không thiết bị / Chưa xác định thiết bị` hiển thị báo cáo ngắn ngay dưới KPI tương ứng.
- Các mutation duyệt/sửa/xóa hiển thị trạng thái đang xử lý.
- TKB: GV chỉ chọn tiết Tự học trong các tiết được mẫu sinh ra.
- Quản lý tuần: cột tuần 310–370px trên laptop/desktop, có cuộn dọc thật; deadline cụ thể mở overlay/popover không đẩy bố cục.
- Popover deadline có `Hủy / Áp dụng hạn`; sau áp dụng field chính phải hiện `dd/mm/yyyy · HH:mm`, và nút `Lưu thay đổi` của tuần mới ghi DB.

### Cán sự
- Xem Quick Report theo buổi và TKB ở chế độ read-only.

### Nhật ký hệ thống
- Tải được dữ liệu hoặc báo lỗi backend/schema rõ ràng, không giả thành danh sách rỗng.
- Có action tạo/lưu/gán TKB và reset password nhưng không có giá trị mật khẩu.
## Verifier V8.8.0 final

Bản release này đã tích hợp verifier cuối cùng, không dùng bản verifier cũ có thể báo false-positive ở hai mục `delete_registration_class_specific` và `student_update_policy_class_specific`.

Nếu `VERIFY-V8.8.0.sql` vẫn báo lỗi hai guard này, chạy file read-only `database/verify/DIAG-V8.8.0-REGISTRATION-GUARDS.sql` trước khi dùng repair. Chỉ khi diagnostic xác nhận guard thật sự còn cũ mới chạy `database/maintenance/REPAIR-V8.8.0-REGISTRATION-GUARDS.sql`, sau đó chạy lại verifier đầy đủ.


## CI portability hotfix

Hotfix này chỉ thay đổi test/workflow và **không thay đổi database, Edge Function hay runtime app**. Nếu V8.8.0 UX3 đã được deploy và database verifier đang `overall=true`, không cần chạy SQL hoặc deploy lại Edge chỉ để nhận hotfix CI này.

Khi cập nhật GitHub source, phải upload cả file `.nvmrc` ở root repository. Workflow final đọc Node major từ file này thay vì hard-code một đường dẫn/version Node cụ thể.

Pipeline mong đợi:

```text
Verify root files (có .nvmrc)
→ setup-node đọc .nvmrc
→ npm ci
→ npm test          # pure Node, không phụ thuộc node_modules
→ npm run test:unit # Vitest xử lý TypeScript
→ npm run typecheck
→ npm run build
```

## UX3 CI quality-gate hotfix

This hotfix changes frontend/test/workflow files only. If the V8.8.0 database verifier already returns `overall=true`, do **not** rerun SQL migrations. Edge Functions do **not** need redeployment for this hotfix.

After replacing the GitHub repository source, the workflow runs one canonical quality gate:

```text
npm run verify:quality
  ├─ npm test
  ├─ npm run test:unit
  └─ npm run typecheck
```

The runner attempts all three checks and reports a combined PASS/FAIL summary. Production build still runs only after that quality gate passes and the browser Supabase config has been generated.

## Audit contract hotfix deployment

If the database verifier already returns `overall = true` but Admin shows an invalid Audit backend response, do **not** rerun SQL first. This symptom commonly means the deployed `audit-log` Edge Function is older than the frontend.

1. Deploy `deploy/edge-functions/audit-log.zip` from the same release as the frontend.
2. Deploy/upload the matching frontend ROOT-FLAT source.
3. Hard refresh the app and reopen Admin → Nhật ký hệ thống.
4. If the UI reports `AUDIT_SCHEMA_NOT_READY`, only then run the SQL upgrade/VERIFY that belongs to the current release.

The current audit list contract is `audit-list` version `2`. A pre-list Edge deployment that returns `{ok:true,count:0}` is explicitly classified as `AUDIT_EDGE_OUTDATED`.

## Canonical Audit source-sync rule

Do not merge the older Audit HOTFIX package that used `frontend-patch/` and `release-guard/` wrapper directories. For a full source refresh, replace the repository with the current canonical ROOT-FLAT package. For an Audit-only source repair, use `deploy/hotfix/AUDIT-CONTRACT-SOURCE-SYNC-HOTFIX.zip`; its entries already use exact repository-relative paths and may be overlaid directly onto the repository root.

Before release, run `npm run verify:release`. The verifier rebuilds all Edge ZIPs from repository source and fails if the Audit source embedded in `audit-log.zip` differs from `supabase/functions/audit-log/index.ts`.
## Week management save-state hotfix

Hotfix này chỉ thay đổi frontend/tests. Không cần chạy lại SQL hoặc deploy Edge Functions nếu database V8.8.0 đã `overall=true`. Sau khi bấm **Lưu thay đổi** ở Quản lý tuần, ứng dụng lấy canonical state trả về từ backend làm baseline và xóa dirty-state ngay; chuyển sang chức năng khác không được hiện cảnh báo chưa lưu nếu không có thay đổi mới.

