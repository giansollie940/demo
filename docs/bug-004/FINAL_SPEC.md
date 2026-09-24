# BUG-004 — Device Policy Realtime Self-Healing

## Task

**Task ID:** BUG-004
**Title:** Thiết bị điện tử không tự cập nhật ổn định giữa hai trình duyệt
**STATUS:** FINAL
**ASTRA_EFFORT:** MEDIUM

## User-observed behavior

Hai trình duyệt đăng nhập cùng tài khoản Teacher.

- Edge thay đổi Lock/Unlock thành công.
- Chrome đang mở cùng màn hình Thiết bị điện tử không cập nhật ngay.
- Chrome chỉ thấy trạng thái mới sau khi đổi tab / quay lại.

Điều này chứng minh server state đã đổi và refetch-on-focus có thể lấy đúng state, nhưng đường Realtime không đảm bảo cập nhật màn hình đang mở.

## Current source behavior

- device_use_policy_signals nằm trong supabase_realtime.
- RPC FEAT-010 gọi device_use_bump_signal() khi policy thật sự thay đổi.
- useRealtimeInvalidation() invalidate ['device-policy'] và ['week-data'] khi nhận signal.
- useDevicePolicy() có refetchOnWindowFocus: true.
- legacyApi.subscribeRealtime() báo status của Realtime channel nhưng useRealtimeInvalidation() hiện truyền callback status rỗng.
- Local flag subscribed=true được đặt ngay sau subscribeRealtime(), không chờ trạng thái SUBSCRIBED.
- Nếu channel bị CHANNEL_ERROR, TIMED_OUT hoặc CLOSED, frontend hiện không tự hạ flag và tạo lại subscription ở tầng app.

Đây là một lỗ hổng resilience phù hợp với triệu chứng: focus/tab-change refetch sửa được state nhưng active screen có thể không nhận invalidation.

## Required behavior

### RB-004-001 — Active screen updates without focus change

Khi Browser A thay đổi Device Policy và Browser B đang mở cùng class/week trên màn hình Device Policy, Browser B phải tự refetch và hiển thị state mới mà không reload trang, đổi route, đổi tab trình duyệt, hoặc đổi tab trong ứng dụng.

### RB-004-002 — Event-driven, no polling loop

Không thêm vòng lặp polling định kỳ chỉ để bù Realtime. Fast path vẫn là device_use_policy_signals Realtime event.

### RB-004-003 — Channel lifecycle self-healing

App phải theo dõi status callback của Realtime subscription.

- SUBSCRIBED: đánh dấu healthy.
- CHANNEL_ERROR, TIMED_OUT, CLOSED: không được giữ trạng thái local giả là đang subscribed.
- phải cleanup channel cũ và resubscribe bằng bounded backoff.
- chỉ một active realtime channel cho mỗi app session.

### RB-004-004 — Catch-up after visibility/focus recovery

Khi app quay lại foreground sau khi từng mất connection/hidden, active Device Policy query được phép refetch một lần để catch up. Đây là recovery-on-event, không phải polling.

### RB-004-005 — Scope correctness

Signal class khác không được làm sai state của class/week đang xem. Có thể invalidate prefix để cache consistency, nhưng active refetch phải dùng query key hiện tại và server source-of-truth.

### RB-004-006 — Existing mutation behavior retained

Browser thực hiện Lock/Unlock/Allow/Revoke vẫn refresh ngay sau RPC như hiện tại.

## Security / DB impact

Không cần thay business schema nếu signal table/publication hiện tại hoạt động đúng. Không mở RLS của policy tables. Không subscribe trực tiếp hai bảng manager-only cho Student.

Nếu Astra chứng minh lỗi nằm ở publication/RLS/backend signal thay vì lifecycle client, phải báo evidence trước khi đổi DB.

## Acceptance Criteria

- AC-004-001: two-browser test, B active and untouched; A Lock -> B reflects locked state automatically.
- AC-004-002: A Unlock -> B reflects open state automatically.
- AC-004-003: no tab/focus/navigation needed for AC-001/002.
- AC-004-004: simulated CHANNEL_ERROR or TIMED_OUT causes cleanup + resubscribe, not permanent stale subscribed=true.
- AC-004-005: after reconnect, next signal invalidates/refetches active Device Policy query.
- AC-004-006: no interval polling loop that repeatedly hits policy RPC while connection is healthy. Backoff timers for reconnect are allowed.
- AC-004-007: no duplicate active realtime channels after repeated reconnects.
- AC-004-008: registrations / structural / teacher_notifications realtime behavior has no regression.
- AC-004-009: typecheck/build/tests PASS.

## Verification

Astra must add deterministic tests around channel status transitions and invalidation behavior, plus browser evidence when possible.
