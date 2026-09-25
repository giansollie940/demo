# BUG-005 — Cross-Week Teacher Queue Alerts

## Task

**Task ID:** BUG-005
**Title:** Teacher không được báo đăng ký cần xử lý ở tuần kế tiếp / tuần đang chọn
**STATUS:** FINAL
**ASTRA_EFFORT:** MEDIUM

## User-observed behavior

Ví dụ operational week hiện là Tuần 8 nhưng đã có đăng ký ở Tuần 9 cần Teacher xử lý:

- khi Teacher đang xem Tuần 8, không có cảnh báo về công việc ở Tuần 9;
- khi Teacher chuyển sang xem Tuần 9, Cú vẫn không báo dù đăng ký cần xử lý tồn tại.

## Confirmed root cause

loadState() cho manager chỉ bootstrap registrations bằng loadWeekData(currentWeek?.id, activeClassId).

Vì vậy auth.legacyState.registrations của Teacher ban đầu chỉ có dữ liệu operational/current week.

Trong khi đó:

- ApprovalPage.vue dùng useWeekData(classId, selectedWeekId) nên trang Duyệt có thể tải đúng tuần được chọn;
- WiseOwl.vue và OwlMascotV2.vue gọi buildOwlContextMessages() bằng auth.legacyState;
- owl-model.ts lọc weekRegistrations(state, weekId) trên mảng bootstrap đó.

Do đó đổi selector sang Tuần 9 không làm Cú có dữ liệu Tuần 9 để tính hàng chờ.

## Required behavior

### RB-005-001 — Selected week alert is authoritative

Nếu Teacher chọn Tuần 9 và Tuần 9 có N registration thật sự còn actionable theo isTeacherQueueItem(), Cú phải báo đúng Tuần 9 / N mục, dù operational week đang là Tuần 8.

### RB-005-002 — Cross-week awareness

Nếu Teacher đang xem Tuần 8 nhưng một tuần khác trong registration-open horizon có actionable Teacher work, tối thiểu tuần kế tiếp đang mở cho đăng ký, Cú phải có cảnh báo cross-week ghi rõ tuần và số lượng. Không được yêu cầu Teacher phải tình cờ chuyển tuần mới biết.

### RB-005-003 — Actionable semantics unchanged

Không dùng generic unread notification count.

Một registration chỉ tính nếu hiện tại Teacher còn thực sự xử lý được theo business rule hiện có:

- submitted actionable;
- AI không còn processing giữ hàng;
- session chưa bắt đầu;
- không deleted;
- không phải issue đã rơi sang Báo cáo lỗi.

### RB-005-004 — No stale cross-week alert

Sau khi Teacher xử lý xong, registration bị xóa, hoặc session bắt đầu khiến item rời queue, cảnh báo phải biến mất sau query/realtime refresh.

### RB-005-005 — Bounded data loading

Không tải toàn bộ chi tiết registrations của cả năm học vào global legacy state chỉ để làm badge/Cú.

Phạm vi tối thiểu cần quan sát:

- selected week;
- operational/current week;
- immediate next registration-open week.

Nếu cần mở rộng hơn, phải chứng minh business rule.

### RB-005-006 — Approval page and Owl share the same source-of-truth semantics

Không để ApprovalPage hiển thị N mục nhưng Cú báo 0 vì hai nguồn dữ liệu khác nhau.

### RB-005-007 — Teacher only

Không mở Teacher queue details cho Admin/Student/Monitor. BUG-003 Admin role isolation phải giữ nguyên.

## UI behavior

- Cú ưu tiên alert của selected week nếu selected week có actionable work.
- Nếu selected week không có nhưng một monitored other week có work, hiển thị cross-week alert ghi rõ số tuần.
- Red dot urgent bật khi tồn tại actionable Teacher work trong monitored horizon.
- Không tự đổi selected week của người dùng.

## Realtime behavior

Registration INSERT/UPDATE/DELETE ở monitored week phải làm alert cập nhật mà không reload.

Nếu existing registrations Realtime event chưa đủ để refresh non-selected cached week, implementation phải invalidate đúng week-data/summary cache.

## Security / DB impact

Ưu tiên frontend/query composition trên API hiện có.

Nếu cần lightweight summary RPC:

- chỉ authenticated Teacher được gọi;
- scope theo class được Teacher quản lý;
- không trả nội dung registration không cần thiết;
- RLS/authz phải được review.

Không đổi Student/Admin permissions.

## Acceptance Criteria

- AC-005-001: operational week 8, selected week 9, one actionable week-9 row -> Owl says week 9 has 1 action and urgent=true.
- AC-005-002: operational/selected week 8, week 9 has actionable row -> Owl still surfaces cross-week week-9 alert.
- AC-005-003: same state for Admin -> no Teacher queue alert.
- AC-005-004: same state for Student/Monitor -> no Teacher queue alert.
- AC-005-005: week-9 row becomes approved/needs_revision/deleted/non-actionable -> cross-week alert clears.
- AC-005-006: session-start boundary moves submitted row to issue -> Teacher queue alert clears.
- AC-005-007: ApprovalPage selected-week attention count and Owl selected-week count agree.
- AC-005-008: registration Realtime event updates queue alert without manual reload.
- AC-005-009: existing BUG-003 regression remains PASS.
- AC-005-010: no unbounded all-year registration-detail preload.
- AC-005-011: typecheck/build/relevant tests PASS.

## Release impact

This task changes Teacher notification/UI behavior only. No automatic production merge/deploy without Sol review and user release decision.
