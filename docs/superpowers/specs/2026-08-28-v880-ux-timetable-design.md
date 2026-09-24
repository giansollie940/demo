# Sổ Tự Học V8.8.0 — UX, Timetable Templates, Quick Reports and Mutation Feedback

## Goal
Nâng cấp V8.7.1 thành V8.8.0 với trải nghiệm quản trị trực quan, phản hồi mutation nhất quán, báo cáo nhanh theo đúng buổi đang chọn, và kiến trúc nhiều mẫu thời khóa biểu theo năm học/lớp/thời gian hiệu lực mà không phá dữ liệu lịch sử.

## Role boundaries
- Admin quản trị hệ thống: năm học, mẫu TKB, gán TKB cho lớp, HS/Cán sự toàn trường, GV, phân quyền, Audit; được reset mật khẩu và hard-delete HS/Cán sự/GV theo guard hiện có.
- Teacher vận hành lớp: HS lớp mình, tuần, tiết tự học, duyệt/theo dõi; không chỉnh cấu trúc giờ chuẩn.
- Monitor xem quick report/theo dõi lớp và TKB lớp nhưng không chỉnh mẫu TKB/tuần/duyệt.
- Student chỉ dữ liệu cá nhân.

## Admin account UX
- Bỏ `window.prompt()` cho sửa HS/GV.
- Dùng dialog có form đầy đủ, validation, loading, success/error inline.
- Reset password là dialog riêng cho HS/Cán sự/GV; password không ghi audit.
- Mutation cập nhật query cache ngay khi an toàn; hard-delete chỉ xóa khỏi cache sau server confirm.
- Mọi mutation có button/row/page loading tương ứng và khóa double-submit.

## Personal settings
- Admin có `Tùy chọn cá nhân` từ profile giống learner: theme, font scale, Owl enabled/follow pointer/head tilt/quotes.
- Mandatory system alerts không phụ thuộc Owl preference.

## Tracking quick report
- Context bắt buộc là `week + selected session`.
- `missing`, `device`, `no-device` dùng bảng Quick Report ngắn; không render `StudentTrackingRow` đầy đủ.
- Counts và rows chỉ tính cho session đang chọn.
- `device` và `no-device` chỉ tính các HS đã có registration; giá trị null/undefined thuộc `unknown-device` để không suy đoán.
- `all`, `registered`, `attention` giữ chế độ chi tiết.
- Monitor được xem report, không có manager actions.

## Week management UX
- Master column 210–230px; detail chiếm phần còn lại.
- Deadline `specific` dùng popover/overlay, không thêm grid row làm layout nhảy.
- Loading khi lưu tuần/TKB.

## Timetable architecture
Một năm học có nhiều `timetable_templates`. Mỗi template có nhiều immutable `timetable_template_versions`. Class assignment tham chiếu version và có `effective_from/effective_to`, không overlap.

### Template base rules
- morningStart/morningEnd
- afternoonStart/afternoonEnd (có thể null nếu không học chiều)
- defaultPeriodMinutes
- shortBreakMinutes
- longBreakMinutes
- period duration overrides
- break rules after period: none/short/long/custom(minutes)
- app tự sinh số tiết tối đa; Admin không nhập số tiết.

### Day overrides
- Base applies to weekdays.
- Override per weekday only stores differences; missing fields inherit base.
- Overrides can change session boundaries, period duration overrides, break rules.

### Calculation
Pure TypeScript `calculateTimetable(config, weekday)` produces generated periods `{number,start,end,session}` and break metadata. It stops before a period would exceed the session end. Validation rejects invalid/overlapping sessions and non-positive duration/breaks.

### Assignment
`class_timetable_assignments(class_id, school_year_id, template_version_id, effective_from, effective_to)` with DB overlap protection. Assignment changes never rewrite historical assignments.

### Legacy compatibility
- Migration creates a default template/version per existing school year from `school_year_periods` (fallback `periods`).
- Active classes receive assignments covering the school year when no assignment exists.
- Existing `study_schedule` and `week_schedule_overrides` remain as selected self-study slot coordinates `(weekday, period_number)`.
- `LegacyState.periods` becomes the generated period set for the selected class/week/day-compatible template; current UI remains compatible during transition.

## Teacher schedule UX
- Teacher sees generated timetable matrix for selected class/week and only toggles self-study slots.
- Teacher cannot edit times.
- Monitor sees read-only schedule.
- Week overrides still select self-study slots only.

## Lifecycle
`study_session_start()` and `class_week_effective_status()` resolve class + date → assignment → template version → weekday override → generated period. Fallback to `school_year_periods`, then legacy `periods` only when no migrated assignment exists.

## Audit
- List contract is stable: `{ok:true,logs,limit}` or structured error.
- Admin account, timetable template/version/assignment, week/year/class/permission mutations write audit.
- Password value is never logged; only action marker.

## Version and release
- Version becomes 8.8.0.
- Add `database/upgrade/01-UPGRADE-CURRENT-TO-V8.8.0.sql` and `database/verify/VERIFY-V8.8.0.sql`.
- Keep V8.7.1 files for historical reference but V8.8.0 docs point to the new files.
- Package ROOT-FLAT + DEPLOY-ONLY + 10 Edge ZIPs.
