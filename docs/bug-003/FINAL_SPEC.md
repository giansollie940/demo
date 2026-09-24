# BUG-003 — Owl Admin Role Isolation

## Task

**Task ID:** `BUG-003`
**Title:** Không hiển thị lưu ý/vận hành dành cho Giáo viên ở giao diện Admin
**Status:** `FINAL`
**ASTRA_EFFORT:** `LOW`

---

## Objective

Tách hoàn toàn ngữ cảnh Cú Thông Thái giữa vai trò Admin và Teacher.

Admin chỉ được thấy thông điệp/phản hồi đúng phạm vi quản trị của Admin. Admin không được nhận lời nhắc vận hành dành cho Giáo viên như hàng chờ duyệt đăng ký, yêu cầu xử lý đăng ký, theo dõi học sinh hoặc các lời nhắc Teacher-only khác.

---

## Current Behavior

Source hiện tại tại `src/features/owl/owl-model.ts` gộp Teacher và Admin vào cùng nhánh:

`const manager = ['teacher','admin'].includes(user.role)`

Ngay khi vào nhánh này, hàm tính các đăng ký còn cần Giáo viên xử lý và có thể thêm thông điệp urgent:

`Tuần ... còn ... đăng ký cần giáo viên xử lý.`

Việc thêm thông điệp này xảy ra trước khi code phân nhánh riêng cho route Admin. Vì vậy Admin vẫn có thể nhận cảnh báo/lưu ý nghiệp vụ của Giáo viên, dù sau đó còn nhận thêm thông điệp riêng của Admin.

`WiseOwl.vue` dùng trực tiếp kết quả `buildOwlContextMessages(...)`; nếu có message `urgent`, Cú còn hiển thị trạng thái cảnh báo.

Behavior này mâu thuẫn với DEC-003/DEC-004: Teacher và Admin có trách nhiệm tách biệt; Admin không bị gánh việc Teacher khi không có business rule rõ ràng.

---

## Required Behavior

### RB-001 — Admin không nhận Teacher operational reminders

Với `user.role === 'admin'`, Cú không được tạo thông điệp dựa trên:

- số đăng ký đang chờ Giáo viên duyệt/xử lý;
- `pendingForTeacher(...)`;
- lời nhắc Review/Tracking/Teacher queue;
- các nội dung hướng dẫn thao tác chỉ thuộc Teacher;
- teacher-specific registration workload.

### RB-002 — Không có red-dot do Teacher queue ở Admin

Nếu Admin đang ở giao diện Admin và tồn tại đăng ký cần Teacher xử lý, trạng thái `urgent` của Cú không được bật chỉ vì các đăng ký đó.

### RB-003 — Admin context vẫn hoạt động

Admin vẫn được nhận các thông điệp hiện có đúng phạm vi Admin, gồm tối thiểu:

- ngữ cảnh Admin chung;
- ngữ cảnh xem Thiết bị điện tử ở chế độ Admin/read-only;
- ngữ cảnh Báo bài Admin đã được role-isolate hiện tại.

Không thêm business rule hoặc notification Admin mới trong task này.

### RB-004 — Teacher behavior giữ nguyên

Teacher vẫn phải nhận:

- số đăng ký còn cần xử lý;
- urgent state tương ứng;
- hướng dẫn Review/Tracking/Schedule/Device Policy hiện có.

### RB-005 — Student/Monitor giữ nguyên

Không thay đổi lời nhắc Student/Monitor, deadline, needs_revision, báo cáo lỗi hoặc hỗ trợ cán sự.

### RB-006 — Role isolation phải nằm ở model

Không được chỉ ẩn text ở `WiseOwl.vue`. Nguồn tạo context phải bảo đảm Admin không nhận Teacher-only message để mọi consumer của `buildOwlContextMessages()` đều đúng quyền.

---

## Permissions

Không thay đổi authentication, route authorization hoặc quyền dữ liệu.

- Student: không đổi.
- Monitor: không đổi.
- Teacher: không đổi.
- Admin: chỉ thay phạm vi thông điệp UI của Cú; không mất quyền Admin hiện có.

---

## Business Rules

`BR-003-001` — Admin và Teacher là hai actor riêng; Teacher workload không được biến thành Admin workload.

`BR-003-002` — Cú chỉ hiển thị lời nhắc mà actor hiện tại thực sự có trách nhiệm/quyền thao tác.

`BR-003-003` — Không dùng số lượng pending Teacher để tạo red-dot cho Admin.

`BR-003-004` — Không thay đổi business state, registration status, notification table hoặc dữ liệu backend.

`BR-003-005` — Không mở thêm route/quyền cho Admin để xử lý các mục Teacher-only.

---

## Edge Cases

`EC-003-001` — Admin mở `/admin` khi tuần có nhiều đăng ký `submitted`/cần Teacher xử lý: không có Teacher alert.

`EC-003-002` — Admin mở tab Thiết bị điện tử: chỉ có hướng dẫn Admin read-only; Teacher queue không chen vào.

`EC-003-003` — Nếu route state bị stale hoặc route lạ trong lúc role là Admin, model vẫn không được phát Teacher-only reminder.

`EC-003-004` — Teacher mở cùng dữ liệu: Teacher alert vẫn xuất hiện và vẫn urgent.

`EC-003-005` — Admin mở `/homework`: giữ nguyên early-return role-specific hiện tại của Báo bài.

`EC-003-006` — Chuyển role/context trong runtime không để lại message Teacher cũ trong speech bubble sau khi đã thành Admin.

---

## Data / Database / Security Impact

`NONE`.

Không migration, không RPC, không RLS, không Edge Function, không data mutation.

Đây là frontend role-context isolation.

---

## Acceptance Criteria

`AC-001` — Given Admin và có ít nhất một registration cần Teacher xử lý, when gọi `buildOwlContextMessages()` cho `/admin`, then không message nào chứa Teacher workload và không message nào `urgent` vì Teacher queue.

`AC-002` — Given cùng state ở AC-001 nhưng user là Teacher, when gọi model ở Teacher route hợp lệ, then Teacher vẫn nhận message pending và `urgent=true` như behavior hiện tại.

`AC-003` — Given Admin ở Admin Device Policy context, then message đầu/ngữ cảnh chỉ mô tả quyền xem của Admin và không kèm Teacher queue reminder.

`AC-004` — Given Admin ở route state bất thường hoặc stale, then không được phát message Review/Tracking/Teacher action.

`AC-005` — Given Admin ở Báo bài, then role-specific Homework Owl behavior hiện tại không regression.

`AC-006` — Given Student/Monitor/Teacher existing owl regression suite, then toàn bộ test cũ PASS.

`AC-007` — Regression test mới phải thất bại trên baseline hiện tại và PASS sau fix.

`AC-008` — Test phải kiểm cả nội dung message và `urgent` state, không chỉ kiểm việc bubble đang đóng.

`AC-009` — Typecheck/build và các suite liên quan `bug-001`, owl unit, navigation/role UI phải PASS.

`AC-010` — Không có thay đổi database/auth/RLS/API.

---

## Implementation Constraints for Astra

- Khảo sát `owl-model.ts`, `WiseOwl.vue`, router role guards và regression tests trước khi sửa.
- Tạo failing regression test trước.
- Ưu tiên tách role logic ở `buildOwlContextMessages()`; không vá bằng CSS/visibility.
- Không thay business rule ngoài FINAL SPEC.
- Nếu phát hiện Admin thực sự được yêu cầu xử lý Teacher queue theo nguồn ưu tiên cao hơn, báo `BLOCKED` về Sol thay vì tự giữ behavior cũ.

---

## Verification Evidence Required

1. Failing test trên baseline chứng minh Admin nhận Teacher-only message.
2. Diff implementation.
3. Test mới PASS sau fix.
4. Existing Owl/BUG-001/role tests PASS.
5. Typecheck PASS.
6. Production build PASS.
7. Astra Implementation Report + self-review.

---

## Final Status

`STATUS: FINAL`
