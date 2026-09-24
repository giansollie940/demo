# FEAT-010 — DEVICE USE LOCK POLICY — Implementation Report

**STATUS: RC8 — đã sửa theo Sol RC7, chưa triển khai production**
Spec: `FEAT-010_FINAL_SPEC_DEVICE_USE_LOCK_POLICY.md` (FINAL)
Decisions: DEC-102 → DEC-113 (FINAL); DEC-114 **RATIFIED**, DEC-115 **RATIFIED**
(Sol RC7 §10), DEC-116 **ACCEPTED IN CONCEPT** (xem `FEAT-010_DECISIONS_UPDATE.md`).

Không có business rule nào bị thay đổi, nên không có `STATUS: BLOCKED`.

**Sol RC1 = `REQUEST_CHANGES`: ba lỗi chặn (P1, P2, P3), một lỗi phạm vi quyền
(§8), một lỗi UI mức trung bình (§9), một quan sát UX (§10) và một lỗi đóng gói
(§2). Sol RC2 = `REQUEST_CHANGES`: hai bản vá §8 và §9 của RC2 triệt tiêu nhau.
Sol RC3 = `REQUEST_CHANGES`: mô hình quyền **người dùng thấy được** còn thiếu
(R-001), và ACL của wrapper không khớp default privileges thật của production
(R-002). Sol RC4 = `REQUEST_CHANGES`: FEAT-010 ghi xuyên qua lệnh đóng băng năm
học của FEAT-007 (R-003). Sol RC5 = `REQUEST_CHANGES`: chốt chặn năm học của RC5
chỉ khoá cửa trước — `service_role` ghi thẳng vào bảng đi vòng qua nó (R-004),
và nó đọc `archive_state` mà không khoá dòng nên không nguyên tử với lúc
FEAT-007 đóng băng (R-005). Sol RC6 = `REQUEST_CHANGES`: một override có **hai**
đường sở hữu và không gì buộc chúng trùng nhau, nên chốt chặn đọc một đường còn
phần đánh giá policy đi theo đường kia (R-006); và `service_role` vẫn giữ DML
thẳng trên bảng policy, một API ghi thứ hai không có recompute/tín hiệu/audit
(R-007). Sol RC7 = `REQUEST_CHANGES`: JSON `state` của người quản lý tra ngoại lệ
theo lớp+tuần+ô trong khi bộ đánh giá tra theo khoảng khoá, nên sau vòng đời
`Lock A → ALLOW → Unlock A → Lock B → ALLOW` — vốn hợp lệ — trang của giáo viên
và quản trị gãy (R-008). Tất cả đều đúng, tất cả đã sửa, mỗi lỗi đều được tái
hiện bằng test đỏ trước khi sửa. Đọc `docs/feat-010/RC8_FIX_REPORT.md` trước,
rồi RC7, RC6, RC5, RC4, RC3, RC2.**

Một việc RC2 tự tìm ra và không ai yêu cầu: bộ mutation đã **im lặng đổi mục
tiêu** sau các sửa đổi của RC2 — ba mutation vẫn báo "đã áp dụng" nhưng không
còn kiểm tra quy tắc mang tên chúng. Nguyên nhân sâu là bản vá P1 tạo ra bản sao
thứ hai của biên BR-010-005. Cả hai đã được sửa; chi tiết ở RC2_FIX_REPORT.

---

## 1. Source files đã khảo sát

Khảo sát bắt đầu từ câu hỏi "đăng ký được ghi bằng đường nào", vì câu trả lời
quyết định chỗ đặt cưỡng chế.

| Nguồn | Điều học được |
|---|---|
| `src/features/registrations/registration-mutations.ts` | mọi thay đổi đi qua `service.syncState`, không qua RPC |
| `public/supabase-service.js` (`syncInternal`, `dbReg`, `mapReg`) | **frontend ghi thẳng vào bảng `registrations` qua PostgREST** (`sb.from("registrations").insert/update`); `weekday = dow + 1` |
| `pg_trigger` trên `registrations` (production) | chuỗi BEFORE có sẵn: `trg_00_set_registration_class` → `trg_01_validate_registration_class_week` → `trg_05_guard_student_registration_update` → `trg_apply_smart_approval`, và hai AFTER `UPDATE OF <cột>` |
| `pg_policies` trên `registrations` | bốn policy; policy sửa của học sinh đã dùng `study_session_start(...)` để biết buổi đã bắt đầu chưa |
| `public.study_session_start(class,week,weekday,period)` | **đã là** resolver chuẩn: timetable version → `school_year_periods` → `periods`, múi giờ `Asia/Ho_Chi_Minh`, trả NULL khi không giải được |
| `public.resolved_timetable_periods(class,date)` | hệ thống timetable thực tế là `class_timetable_assignments` + `timetable_version_periods`, không phải tên spec đoán |
| `public.apply_smart_approval()` | coi `uses_electronic_device` thay đổi là lý do review lại — chính là cái bẫy §2.3 cảnh báo |
| `database/upgrade/12-FEAT-007-ARCHIVE-PURGE.sql` | 13 bước purge, không bước nào chạm `classes`/`weeks`/`registrations` |
| `src/features/{dashboard,tracking}`, `src/components/{approvals,registrations,tracking}` | 8 chỗ đọc `usesElectronicDevice` để hiển thị hoặc đếm |

**Phát hiện quan trọng nhất, và nó đổi thiết kế:** hệ thống đăng ký **không có
RPC dispatcher**. FEAT-001…008 đi qua `public.homework_api(action,payload)`;
`registrations` thì không — client ghi thẳng vào bảng. Vì vậy biên duy nhất mà
mọi đường ghi đều phải đi qua là **trigger trên bảng**, và §13 ("không được chỉ
ẩn nút ở frontend") chỉ có một cách thoả đúng.

---

## 2. Schema / migration

`database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql`, 933 dòng, một transaction,
chạy sau migration 12.

| Đối tượng | Vai trò |
|---|---|
| `public.device_use_lock_intervals` | khoảng khoá theo `class_id + weekday + period_number`, `locked_at/unlocked_at` (DEC-102, DEC-104) |
| `public.device_use_session_overrides` | ngoại lệ ALLOW, **gắn vào đúng khoảng khoá** nó là ngoại lệ — DEC-105 + Sol RC1 P1. Từ RC7 ràng buộc là một **FK hợp thành** `(interval_id, class_id, weekday, period_number)`, nên override không thể thuộc một lớp hoặc một buổi khác với khoảng khoá của nó (Sol RC6 R-006) |
| `registrations.effective_uses_electronic_device` | cột mới; cột cũ giữ nguyên nghĩa "học sinh xin gì" (DEC-106, DEC-114) |
| `device_use_lock_intervals_one_open` | unique riêng phần `where unlocked_at is null` — EC-010-001 ở mức dữ liệu |
| `device_use_session_overrides_one_live` | unique riêng phần `where revoked_at is null` |
| `device_use_locking_interval()` | **nơi duy nhất** viết biên BR-010-005: khoảng nào đang khoá buổi này |
| `device_use_live_override()` | **nơi duy nhất** trả lời "ngoại lệ nào đang có hiệu lực cho buổi này" — bộ đánh giá và JSON của người quản lý cùng gọi nó (Sol RC7 R-008) |
| `device_use_week_slots()` | tuần đang xem có những buổi nào, theo đúng thứ tự ưu tiên hệ thống đang dùng (Sol RC1 P2) |
| `public.device_use_policy_signals` + `device_use_bump_signal()` | tín hiệu "policy lớp vừa đổi" mà học sinh đọc được — chỉ lớp + thời điểm, không có dữ liệu tác nhân (Sol RC2 §8) |
| ACL | mọi hàm FEAT-010 thu hồi khỏi `public, anon, authenticated` rồi cấp lại đúng một quyền cho wrapper; `anon` phải nêu tên vì production cấp EXECUTE tường minh cho nó (Sol RC3 R-002) |
| `device_use_policy_state()` | trả `open | locked | allow_override`, hoặc raise |
| `device_use_effective()` | nơi duy nhất định nghĩa `requested AND policy_allows` |
| `apply_device_use_policy()` + `trg_06_…` | BEFORE INSERT OR UPDATE trên `registrations` |
| `device_use_recompute()` | tính lại một slot sau khi policy đổi |
| `device_use_assert_year_writable()` | khoá dòng `school_years` (FOR SHARE) rồi đòi `archive_state='active'` — chốt chặn RB-711, nguyên tử với `archive_begin` (Sol RC4 R-003, Sol RC5 R-005) |
| `device_use_guard_year_freeze()` + `trg_00_…` trên hai bảng policy | cùng chốt chặn đó ở mức bảng, nên một câu ghi có đặc quyền cũng không đi vòng được (Sol RC5 R-004) |
| `device_use_lock_intervals_owner_key` + `device_use_session_overrides_interval_owner_fkey` | một override chỉ có **một** chủ sở hữu; trạng thái lệch không biểu diễn được (Sol RC6 R-006) |
| `device_use_guard_override_week()` + `trg_01_…` | tuần của override phải thuộc năm học của lớp — đúng quy tắc `validate_registration_class_week()` đã cưỡng chế cho `registrations` (Sol RC6 R-006) |
| `device_use_policy(action,payload)` | RPC cho Teacher |
| `device_use_slot_key()` | khoá tư vấn theo slot |

`weekday` dùng 1–5 cho khớp `registrations.weekday` (check 1–5) và
`study_schedule`, không dùng `dow` 0-based của frontend; chuyển đổi nằm ở một
chỗ duy nhất trong `src/features/registrations/device-policy.ts`.

**Backfill:** `update registrations set effective_uses_electronic_device =
uses_electronic_device`. Không dòng nào bị reset và `updated_at` không bị chạm.
Ở thời điểm chạy chưa tồn tại khoảng khoá nào, nên đó cũng chính là kết quả
đúng của công thức, không phải một giá trị mặc định đoán bừa (AC-010-022).

---

## 3. Canonical session-time resolver

**`public.study_session_start(p_class_id, p_week_id, p_weekday, p_period_number)`
— có sẵn từ V8.8.0, FEAT-010 dùng lại, không viết hàm thứ hai.**

Nó đã đúng thứ tự ưu tiên §3.2 (timetable version hiệu lực → `school_year_periods`
→ `periods`), đã ở `Asia/Ho_Chi_Minh`, đã trả NULL thay vì đoán, và RLS của
`registrations` đã tin nó để quyết định "buổi đã bắt đầu chưa". Viết một resolver
riêng cho FEAT-010 sẽ tạo ra hai định nghĩa của cùng một thời điểm, và ngày chúng
bất đồng là ngày một buổi học vừa bị khoá vừa không.

---

## 4. Policy evaluation

BR-010-005 được chép nguyên vào SQL:

```
locked  ⇔  session_start >  locked_at
           AND (unlocked_at IS NULL OR session_start <= unlocked_at)
```

Override được đọc **đối xứng** với khoảng khoá:

```
allow   ⇔  locked
           AND session_start >  override.created_at
           AND (override.revoked_at IS NULL OR session_start <= override.revoked_at)
```

Từ RC8 (Sol RC7 R-008) phép đọc override đó nằm ở đúng **một** hàm,
`device_use_live_override(interval, week, weekday, period, session_start)`, và cả
`device_use_policy_state()` lẫn JSON `state` của người quản lý đều gọi nó. Trước
đó JSON tự tra lấy theo lớp+tuần+ô — một câu hỏi khác, cho câu trả lời khác, và
gãy hẳn khi một buổi có ngoại lệ ở hai chu kỳ khoá.

Hai vế `created_at`/`revoked_at` không có trong spec dưới dạng công thức; spec
nói DEC-113 "chỉ tạo/hủy khi session chưa bắt đầu" và để RPC cưỡng chế. RPC **có**
cưỡng chế (mục 7), nhưng viết thêm vế đó vào công thức khiến "không hồi tố" trở
thành một tính chất của phép tính chứ không phải một điều RPC phải nhớ. Nếu một
ngày nào đó có đường ghi thứ hai — restore, sửa tay, một RPC mới — lịch sử vẫn
không bị viết lại. Mutation M7 và M8 chứng minh cả hai vế đều có tác dụng thật.

Hệ quả đáng nói: **công thức tự mang lịch sử**. Không cần "đóng băng" một buổi
đã qua, vì khoảng khoá không bao giờ bị xoá nên câu trả lời cho buổi đó không
bao giờ đổi. Điều đó cũng làm `device_use_recompute()` trở nên idempotent và an
toàn khi quét cả những tuần đã học xong.

**Đường nhanh.** `device_use_policy_state` trả `'open'` ngay nếu slot không có
khoảng khoá nào, trước khi giải giờ bắt đầu. Với một lớp chưa bao giờ khoá gì —
tức là mọi lớp, hôm nay — chi phí FEAT-010 trên mỗi lần ghi đăng ký là một lần
probe index cộng một lần lấy khoá tư vấn.

---

## 5. Requested vs effective

`uses_electronic_device` giữ nguyên nghĩa và nguyên dữ liệu: **học sinh xin gì**.
`effective_uses_electronic_device` là **điều được phép**. Trigger ghi đè cột thứ
hai trên mọi lần ghi; nó không kiểm tra rồi báo lỗi, và nó không đụng cột thứ
nhất.

Đó là điều làm BR-010-008 → BR-010-011 thành một chuỗi nhất quán: khoá thì thiết
bị biến mất khỏi hiệu lực, mở khoá trước giờ học thì lựa chọn cũ tự quay lại mà
không ai phải nhập lại, và tuần đã học xong không bị đụng tới. Mutation M18
(khoá ghi đè luôn lựa chọn gốc) làm hỏng 8 test.

**Vì sao là cột lưu chứ không phải view/RPC projection (DEC-114).** §9.3 cho
chọn. Frontend đọc `registrations` bằng một câu select thẳng vào bảng, và
realtime cũng subscribe bảng đó, nên một view sẽ phải kéo theo việc đổi cả đường
đọc lẫn RLS lẫn realtime. Một cột thì chỉ thêm một tên vào danh sách cột.

Cái giá của lựa chọn đó là **cột lưu có thể lệch khỏi quy tắc sinh ra nó**, nên
suite có một invariant chạy ở cuối mọi kịch bản: với mọi dòng trong bảng, giá trị
lưu phải bằng đúng `device_use_effective(...)` tính lại tại chỗ. Một đường ghi
nào đó đặt cột mà không đi qua công thức sẽ làm hỏng chính test đang chạy.

---

## 6. AI integration

Không sửa gì trong đường AI. AI vẫn đọc nội dung, vẫn ghi
`device_detection_source`/`device_detection_confidence`, vẫn đặt
`uses_electronic_device` khi phát hiện thiết bị trong nội dung. Nó chạy bằng
`service_role`, và trigger là trigger bảng nên không có vai trò nào đi vòng được:
kết quả là metadata phát hiện được lưu đầy đủ còn quyền hiệu lực vẫn `false`
(EC-010-013, DEC-108).

Cùng cơ chế đó lo luôn đăng ký bổ sung, vốn được tạo phía máy chủ qua Edge
Function `emergency-register` (BR-010-015).

**Một điểm nói rõ để không ai ngạc nhiên:** nếu học sinh gọi thẳng REST và đổi
`uses_electronic_device` trong lúc buổi đang khoá, `apply_smart_approval` vẫn coi
đó là học sinh sửa đăng ký và vẫn đưa vào hàng chờ review. Đó là hành vi cũ, đúng
với DEC-107 (chỉ **thay đổi do policy** mới được miễn review), và quyền hiệu lực
vẫn là `false`.

---

## 7. RLS / authorization

| Đường | Ai được |
|---|---|
| `device_use_policy('lock'|'unlock'|'allow_session'|'revoke_allow')` | **chỉ** `teacher_has_class(class_id)`, **và** năm học của lớp còn `active` (`device_use_assert_year_writable`) |
| `device_use_policy('state'|'history')` | `can_manage_class(class_id)` hoặc học sinh của lớp đó |
| `SELECT` trên hai bảng policy | như trên, qua RLS |
| `INSERT/UPDATE/DELETE` trên hai bảng policy | **không ai** — không có policy ghi, và quyền bảng bị revoke khỏi `anon`, `authenticated` **và `service_role`** (Sol RC6 R-007). Đường ghi duy nhất là RPC, vốn `security definer` nên không cần quyền bảng |
| `SELECT` cho `service_role` | có — một thành phần phía máy chủ có thể cần nhìn, nhưng không được ghi |

Hai nhóm hành động cố tình dùng hai hàm khác nhau: dùng `can_manage_class` cho
ghi là đúng một chữ, và là đúng cái DEC-109 cấm. Mutation M9 làm đúng chữ đó và
bị bắt.

**Một lỗi thật, tìm ra bằng test chứ không bằng đọc lại.** Kiểm tra quyền đọc
ban đầu viết là:

```sql
if not (public.can_manage_class(v_class) or v_class = public.current_student_class_id()) then
```

Với giáo viên **không** phụ trách lớp đó, `current_student_class_id()` trả NULL,
nên phép so sánh trả NULL, nên cả biểu thức trả NULL, nên `if not (NULL)` không
vào nhánh nào và hàm chạy tiếp như thể đã được phép. Test §17.17 bắt được ngay
lần chạy đầu. Bản hiện tại bọc `coalesce(..., false)`, và mutation M10 gỡ
`coalesce` ra để chứng minh test vẫn bắt.

Mọi hàm đều `security definer set search_path = public, pg_temp`.

**Chốt chặn thứ hai trên đường ghi (Sol RC4 R-003, Sol RC5 R-004/R-005).**
`teacher_has_class()` trả lời một câu hỏi về lớp, không phải về năm học. RB-711
đặt lệnh cấm ghi ở cấp năm học. `device_use_assert_year_writable(class_id)` là
nơi duy nhất biết quy tắc đó, và nó làm hai việc trong một câu:

```sql
select y.archive_state into v_state
  from public.school_years y join public.classes c on c.school_year_id = y.id
 where c.id = p_class_id
 for share of y;
```

`for share` là mode duy nhất khoá được: nó xung đột với FOR NO KEY UPDATE mà
`update school_years set archive_state='archiving'` của FEAT-007 lấy, còn
`for key share` chỉ xung đột với FOR UPDATE và sẽ không chặn gì. Nhờ vậy kiểm
tra và ghi nằm cùng một phía của lúc đóng băng, dù bên nào tới trước.

Hàm đó được gọi ở **hai** nơi, và cả hai đều cần:

| Nơi gọi | Bắt được gì mà nơi kia không |
|---|---|
| wrapper `device_use_policy`, ngay sau `teacher_has_class` | các nhánh **không ghi gì**: `lock` một slot đang khoá và `unlock` một slot đang mở trả về sớm (EC-010-001/002), nên trigger không bao giờ chạy — nếu chỉ có trigger, hai lệnh đó sẽ *thành công* trong năm đã đóng băng |
| `trg_00_device_use_year_freeze` BEFORE INSERT/UPDATE/DELETE trên hai bảng policy | mọi đường **không đi qua wrapper**: `service_role` có BYPASSRLS và `grant all`, nên RLS không đỡ được; trigger thì có, và tắt nó cần quyền sở hữu bảng mà `service_role` không có |

Trigger kiểm cả `old.class_id` lẫn `new.class_id` khi UPDATE đổi chủ sở hữu: chỉ
kiểm một phía thì một dòng bị mang ra khỏi (hoặc vào) một năm đã đóng băng.

Chốt chặn ở wrapper đứng **trước** khoá tư vấn và trước mọi câu ghi, nên một
thao tác bị từ chối không để lại khoảng khoá, ngoại lệ, tín hiệu realtime, dòng
audit hay đăng ký nào bị tính lại. Hai đường đọc không bị chạm: một năm đã lưu
trữ vẫn tra cứu được `state` và `history`.

`device_use_policy_signals` cố ý **không** có chốt chặn: nó là tín hiệu ba cột
không mang dữ liệu nghiệp vụ, đường ghi duy nhất của nó nằm trong wrapper đã bị
chặn, và nó là đích của `on delete cascade` từ `classes` — một chốt chặn ở đó sẽ
biến việc xoá lớp thành lỗi khó đọc trong đúng những năm mà FEAT-007 đằng nào
cũng đã cấm xoá lớp.

Tám mutation canh phần này (M37–M44), gồm cả hai cái đã **thoát** ở lần chạy đầu
và cả hai đều là test hỏng — xem RC6_FIX_REPORT.

**Và một chốt chặn chỉ đúng khi "lớp của dòng này" là một câu hỏi có đúng một
câu trả lời (Sol RC6 R-006).** Một override mang hai đường sở hữu — `interval_id`
và `class_id + weekday + period_number` — mà đến RC6 không gì buộc chúng trùng
nhau, trong khi chốt chặn năm học đọc đường thứ hai còn `device_use_policy_state()`
đi theo đường thứ nhất. Cách chữa không phải là dạy chốt chặn đi theo cả hai
đường (hai đường vẫn được phép lệch, chỉ thêm một chỗ phải nhớ) mà là làm cho
trạng thái lệch **không biểu diễn được**: một khoá unique
`(id, class_id, weekday, period_number)` trên bảng khoảng khoá và một FK hợp
thành từ override trỏ vào đúng bốn cột đó. Nửa còn lại — tuần phải thuộc năm học
của lớp — là một trigger, vì FK không diễn đạt được phép join đó; quy tắc là
đúng quy tắc `validate_registration_class_week()` đã cưỡng chế cho
`registrations` từ V8.8.0, và có test khẳng định hai đường từ chối cùng một cặp
lệch năm. M45–M48 canh phần này.

**Và đường ghi thứ hai đã bị đóng (Sol RC6 R-007).** `service_role` từng có
`grant all` trên hai bảng policy. Một câu INSERT thẳng chạy chốt chặn năm học rồi
thôi: không `device_use_recompute()`, không tín hiệu realtime, không dòng audit —
trông như một lần đổi chính sách mà không phải. RC7 thu hồi DML và chỉ để lại
`select`; RPC không cần quyền bảng vì nó `security definer`. M49 canh việc này.

---

## 8. FEAT-007 archive impact — §19 / DEC-111 / RB-711

**Kết luận: retain — không đưa vào archive, không purge.** Và điều đó an toàn vì
purge không chạm tới bất cứ thứ gì hai bảng policy tham chiếu.

Đọc thẳng từ `12-FEAT-007-ARCHIVE-PURGE.sql`: 13 bước purge xoá
`homework_notice_reactions`, `homework_notice_reminders`,
`homework_duplicate_reviews`, `homework_reports`, `homework_corrections`,
`homework_correction_rounds`, `homework_moderation_events`,
`homework_notifications`, `homework_contribution_events`,
`homework_notice_media`, `homework_media_history`, `homework_notices`,
`english_group_members`, `english_groups` và `class_subjects`. Không bước nào
xoá `classes`, `weeks`, `class_weeks` hay `registrations`; `archive_guard_class()`
thậm chí **từ chối** mọi DELETE trên `classes`.

Hai bảng của FEAT-010 chỉ tham chiếu `classes(id)`, `weeks(id)`,
`periods(period_number)` và `profiles(id)`. Không cái nào bị purge, nên tình
trạng §19 cấm — "policy rows bị purge nhưng ZIP không chứa chúng" — không thể
xảy ra, và không có FK nào lủng lẳng.

Vì vậy: `ARCHIVE_FORMAT_VERSION` **không đổi**, `ENTITY_FILES` không thêm mục,
Viewer không phải sửa, và gói RC6 đã được Sol duyệt giữ nguyên vân tay
`529f86e45ca2dce303e5f2cab0914b393fb1fc7352f43f8266cfe61586dd9b5d`.

Điều này được **khẳng định bằng test**, không phải bằng lời hứa: một test đọc
`12-FEAT-007-ARCHIVE-PURGE.sql`, rút ra tập bảng bị `delete from`, và fail nếu
tập đó chứa bất kỳ bảng nào FEAT-010 tham chiếu. Một test thứ hai chứng minh hai
hệ thống rời nhau theo cả hai chiều: migration 13 không nhắc tới đối tượng nào
của FEAT-001…008 (ngoài phần chú thích), và migration 05…12 không nhắc tới
`registrations`, `apply_smart_approval`, `study_session_start` hay `device_use_*`.

**Và một chiều thứ hai mà hai test đó không đụng tới — Sol RC4 R-003.** Cả hai
đều nói về *xoá* và về *đối tượng dùng chung*. §18 còn một chiều nữa: FEAT-007
**đóng băng ghi** theo năm học. Một bảng được giữ lại vẫn phải ngừng nhận thao
tác khi năm học của nó đã `archiving` hoặc `archived_read_only`. RC1…RC4 không
có chốt chặn đó, và cũng không có test nào hỏi tới nó — hợp đồng có hai chiều,
test chỉ có một, và kết quả một chiều đã được trình bày như kết luận cho cả hai.

RC5 thêm chốt chặn, nhưng chỉ ở wrapper RPC; Sol RC5 chỉ ra rằng **đóng băng
mềm không phải đóng băng** (R-004: `service_role` ghi thẳng vào bảng; R-005:
kiểm tra không nguyên tử với lúc FEAT-007 đặt `archiving`). Từ RC6, chốt chặn
nằm ở mục 7 dưới dạng một hàm khoá dòng `school_years` được gọi từ **cả** wrapper
**lẫn** trigger bảng, với chín test và tám mutation giữ nó.

Đó cũng là lý do bộ corpus cũ **không** được chạy lại trên nền migration 13 như
cách FEAT-007 làm với `FEAT007_UPGRADE`: hai hệ thống không dùng chung đối tượng
nào, và harness của FEAT-001…008 thậm chí không mô hình hoá `registrations`, nên
một lần chạy như vậy sẽ chứng minh được rất ít. Cái thay thế nó là test rời nhau
ở trên, vốn fail ngay khi điều kiện đó không còn đúng.

---

## 9. Harness — và vì sao nó phải được dựng riêng

Harness dùng chung (`tests/homework/fixture.mjs`) chỉ mô hình hoá sáu bảng của
hệ thống Báo bài. FEAT-010 sống ở nửa kia của ứng dụng và không có gì trong đó.
Repository cũng không dựng lại được: `database/fresh-install/01-INSTALL-…` là
một bản **nâng cấp từ baseline** và từ chối chạy nếu chưa có sẵn `profiles`,
`weeks`, `registrations`, `periods` — baseline đó không nằm trong repository.

Nên `tests/feat-010/baseline.sql` được dựng theo cách trung thực duy nhất còn
lại: mọi hình dạng cột, ràng buộc, thân hàm, trigger và RLS policy đều được đọc
ra từ database production bằng truy vấn catalog chỉ-đọc
(`information_schema.columns`, `pg_get_constraintdef`, `pg_get_functiondef`,
`pg_get_triggerdef`, `pg_policies`) rồi chép nguyên vào.

Và nó được **kiểm tra chứ không phải được tuyên bố**: cả 18 đối tượng hành vi
đều khớp `md5` với production sau khi chuẩn hoá xuống dòng — cùng kỹ thuật đã
dùng để phát hiện production đang chạy FEAT-007 RC1. Danh sách 18 vân tay nằm ở
đầu tệp. Lần đối chiếu đầu tiên bắt được một sai lệch thật: `current_app_role()`
đã bị chép từ tệp install thay vì từ production (khác nhau ở khoảng trắng quanh
dấu `=`), và nó đã được sửa cho khớp.

Đồng hồ: **không có đồng hồ giả**. Một hook kiểu
`current_setting('…clock')` mà test đặt được thì client cũng đặt được, và một
biên client dịch chuyển được thì không phải biên. Thay vào đó các tuần được đặt
quanh thứ Hai thật của tuần hiện tại, nên buổi ở tuần `past`/`prev` đã bắt đầu
thật còn buổi ở `next`/`later`/`far` thì chưa. Các trường hợp bằng nhau chính xác
của BR-010-005 được dựng bằng cách lấy đúng giá trị mà `study_session_start()`
trả về làm `locked_at`.

---

## 10. Tests đã chạy

`node scripts/verify-feat010.mjs` — **18/18 PASS, 404 tests, 0 FAIL** (RC7: 400; RC6: 396; RC5: 392; RC4: 388; RC3: 384; RC2: 381; RC1: 367; FEAT-007 RC6: 321).

| Suite | RC6 | FEAT-010 |
|---|---:|---:|
| **FEAT-010 policy SQL** | – | **61** |
| **FEAT-010 frontend** | – | **22** |
| FEAT-007 archive SQL | 54 | 54 |
| FEAT-007 archive/viewer frontend | 33 | 33 |
| FEAT-008 storage SQL | 20 | 20 |
| FEAT-008 SQL on migration 12 | 20 | 20 |
| FEAT-008 dashboard UI | 9 | 9 |
| FEAT-006 SQL | 13 | 13 |
| FEAT-006 SQL on migration 12 | 13 | 13 |
| FEAT-005 SQL on migration 12 | 13 | 13 |
| FEAT-006 frontend | 10 | 10 |
| FEAT-005 under migration 10 | 13 | 13 |
| FEAT-001/002 legacy SQL | 43 | 43 |
| FEAT-004 SQL | 6 | 6 |
| Static frontend regression | 10 | 10 |
| Existing FEAT-001–005 frontend | 64 | 64 |
| **Tổng** | **321** | **404** |

Typecheck PASS, production build PASS.

§17 đòi 30 test; bảng đối chiếu từng mục nằm ở `docs/feat-010/TEST_MATRIX.md`.

---

## 11. Mutation testing

Bộ test chạy xanh không phải là bằng chứng; bộ test đỏ lên khi thứ nó canh bị
hỏng mới là. Mỗi mutation ở `tests/feat-010/mutations.mjs` phá đúng một quy tắc,
và cả suite được chạy lại với từng cái một.

**50/50 mutation bị bắt.** Không có con số 0 nào — sau khi sửa bảy test hỏng
(M8, M15 ở RC1; M20 ở RC2; M32 ở RC3; test điều hướng R-001 ở RC4; M42 và M44 ở
RC6), sửa chính bộ mutation hai lần (helper ở RC2, runner ở RC3), sửa
**baseline** ở RC4 (harness không mô hình hoá `ALTER DEFAULT PRIVILEGES` của
production nên một test ACL đúng đã cho câu trả lời sai một cách tự tin), và ở
RC6 sửa một lỗ hổng của chính cách viết test: mọi assertion đọc mã nguồn bằng
`readFile` đều **vô hình** với bộ mutation, vì fixture cài bản đã mutate từ bộ
nhớ; và ở RC7 dạy chính runner rằng một mutation làm **toàn bộ** suite fail gần
như chắc chắn đã làm hỏng migration chứ không phải phá một quy tắc — nó không
chứng minh gì, nên giờ nó có verdict riêng và bị tính là thoát.

M20–M27 canh bản vá RC1, M28–M33 canh tín hiệu RC3, M34–M36 canh ACL thật,
**M37–M44 canh chốt chặn năm học, M45–M49 canh quyền sở hữu của override và
đường ghi thẳng, M50 canh việc JSON của người quản lý không tự viết lại luật
ngoại lệ**; bảng đầy đủ ở các `RC*_FIX_REPORT.md`.

| # | Mutation | Test fail |
|---|---|---:|
| M1 | trigger không bao giờ hạ quyền | 16 |
| M2 | BR-010-005: `>` thành `>=` (khoá hồi tố) | 1 |
| M3 | BR-010-005: `<=` thành `<` (mở khoá hồi tố) | 1 |
| M4 | DEC-104: quên `unlocked_at` — khoá vĩnh viễn | 7 |
| M5 | Lock không tính lại đăng ký đã có | 7 |
| M6 | Unlock không tính lại đăng ký đã có | 1 |
| M7 | DEC-113: override đã hủy vẫn có hiệu lực | 1 |
| M8 | override hồi tố (bỏ vế `created_at`) | 1 |
| M9 | DEC-109: Admin thay Teacher khoá/mở | 1 |
| M10 | bỏ `coalesce` ở kiểm tra quyền đọc | 1 |
| M11 | §13: mở cho `authenticated` ghi bảng policy | 2 |
| M12 | BR-010-018: bỏ khoá tư vấn | 1 |
| M13 | EC-010-010: đoán `'open'` thay vì raise | 1 |
| M14 | EC-010-001: bỏ unique "một khoảng đang mở" | 1 |
| M15 | DEC-107: recompute đụng `status` | 1 |
| M16 | DEC-106: `AND` thành `OR` | 17 |
| M17 | BR-010-007: cho hủy override sau giờ học | 1 |
| M18 | BR-010-008: khoá ghi đè lựa chọn gốc | 8 |
| M19 | đổi tên trigger để nó chạy trước trigger điền `class_id` | 1 |

**Hai mutation thoát ở lần chạy đầu, và cả hai đều là test hỏng, không phải
mutation vô hại:**

- **M8** không bị bắt vì test DEC-113 chỉ dựng override tạo **trước** buổi học,
  nên vế `created_at` không bao giờ được dùng đến. Đã thêm trường hợp ngược lại:
  một override xuất hiện sau khi buổi đã chạy không được mở ngược lịch sử.
- **M15** không bị bắt vì test §17.14 xoá sạch `teacher_notifications` trước khi
  đổi policy, nên "không tạo thông báo mới" là đúng nhưng không đủ.
  `sync_teacher_review_notification` upsert với `is_read=false`, nên điều thực sự
  cần canh là một thông báo **đã đọc** không bị dựng dậy. Đã thêm một đăng ký thứ
  hai đang chờ duyệt, thông báo của nó được đánh dấu đã đọc, và test so sánh
  nguyên dòng thông báo trước/sau.

Frontend được mutation bằng tay với bốn phép sửa, cả bốn đều bị bắt: `usesDevice`
bỏ qua policy (1 fail), `deviceDisplay` bỏ trạng thái khoá (4 fail), checkbox
không còn `disabled` khi khoá (1 fail), nút "Mở riêng" sống sót qua giờ bắt đầu
(1 fail).

---

## 12. Frontend

| Tệp | Thay đổi |
|---|---|
| `src/features/registrations/device-policy.ts` | **mới** — một chỗ duy nhất quyết định "có thiết bị hay không", đổi `weekday` 1–5 ↔ `dow` 0–4, và ba câu hiển thị của BR-010-010 |
| `src/features/registrations/device-policy-queries.ts` | **mới** — query trạng thái policy theo lớp + tuần, và invalidate sau khi đổi |
| `src/pages/DevicePolicyPage.vue` | **mới** — màn hình Teacher (§11) |
| `src/components/registrations/RegistrationDialog.vue` | checkbox bị khoá **vẫn hiện**, kèm lý do nối vào `aria-describedby` (BR-010-012) |
| `src/components/registrations/StudySessionCard.vue` | "Thiết bị điện tử đang bị khóa cho buổi này" / "được giáo viên mở riêng" |
| `src/components/approvals/ApprovalList.vue`, `ApprovalDetail.vue` | phân biệt "có thiết bị" với "đang bị khóa" |
| `src/components/tracking/StudentTrackingRow.vue` | như trên |
| `src/features/tracking/tracking-model.ts`, `src/features/dashboard/dashboard-model.ts` | đếm quyền hiệu lực |
| `src/app/router/routes.ts`, `src/features/navigation/navigation.ts` | route và mục sidebar `/device-policy`, chỉ cho giáo viên |
| `src/types/legacy.ts` | `effectiveUsesElectronicDevice`, `DeviceUsePolicyAction`, chữ ký `deviceUsePolicy` |
| `src/components/registrations/DevicePolicyHistory.vue` | **mới (RC4)** — dòng thời gian lock/unlock/override, chỉ đọc, không có nút nào |
| `src/components/admin/AdminDevicePolicy.vue`, `src/pages/AdminPage.vue` | **mới (RC4)** — tab `/admin?tab=device`, chỉ đọc; không import bất cứ thứ gì ghi được |
| `src/realtime/useRealtimeInvalidation.ts` | `device_use_policy_signals` → invalidate `device-policy` và `week-data` |
| `public/supabase-service.js` | cột mới trong `REGISTRATION_COLUMNS` và `mapReg`; `deviceUsePolicy()`; **`regSignature()`**; thông điệp cho `DEVICE_POLICY_YEAR_NOT_ACTIVE` (RC5) |

`regSignature()` đáng giải thích. `syncInternal` quyết định "dòng này có cần ghi
lại không" bằng cách so sánh JSON của cả object. `effectiveUsesElectronicDevice`
đổi mỗi khi giáo viên khoá hoặc mở, nên nếu để nó vào phép so sánh thì client sẽ
PATCH lại một dòng mà người dùng không hề sửa — và với một buổi đã học xong, RLS
từ chối đúng PATCH đó, nên đồng bộ hỏng vì một thay đổi không phải của người
dùng. Các trường do máy chủ sở hữu giờ bị loại khỏi chữ ký so sánh.

Ba chỗ đọc (`ApprovalList`, `ApprovalDetail`, `StudentTrackingRow`,
`StudySessionCard`) suy ra trạng thái khoá từ hai cột đã có trên chính dòng đăng
ký, nên chúng không phải gọi thêm gì. Chỉ hộp thoại đăng ký và màn hình Teacher
mới hỏi policy, vì chúng cần biết trạng thái của một slot **chưa** có đăng ký.

---

## 13. Regressions

Không có. 321 test cũ chạy nguyên vẹn, kể cả ba suite "on migration 12".

Hai thay đổi có khả năng gây hồi quy, và cách chúng được chặn:

1. **`trackingDeviceState` và `buildDashboardMetrics` đổi ý nghĩa.** Một dòng cũ
   chưa có cột hiệu lực (trang được phục vụ từ cache giữa lúc migration chạy và
   lần tải lại đầy đủ kế tiếp) sẽ bị đọc thành "không thiết bị" nếu viết ngây
   thơ, tức là con số trên dashboard tụt xuống 0 mà không ai báo lỗi.
   `usesDevice()` fallback về cột cũ khi cột mới `undefined`, và có test riêng.
2. **`regSignature`** như trên.

---

## 14. Known limitations

1. **Không chứng minh được tính tuần tự hoá dưới truy cập đồng thời thật.**
   pglite chạy một kết nối. Khoá tư vấn theo slot được kiểm tra là **có được lấy**,
   đúng key và đúng mode (`ShareLock` ở đường ghi đăng ký, độc quyền ở RPC), và
   mutation M12 chứng minh test đó có tác dụng. Nhưng "hai giao dịch thật xếp
   hàng đúng" vẫn là một **cổng kiểm tra khi phát hành**, phải chạy trên Postgres
   thật với hai kết nối.
2. **Chưa đo chi phí trên dữ liệu thật.** Mỗi lần ghi đăng ký thêm: một lần lấy
   khoá tư vấn, một lần probe index trên `device_use_lock_intervals`. Chỉ khi
   slot **có** khoảng khoá mới phải giải giờ bắt đầu (một lần gọi
   `resolved_timetable_periods`). Harness không thấy được khác biệt ở cỡ dữ liệu
   của nó.
3. **`device_use_recompute` quét cả slot.** Với một lớp 40 học sinh và 40 tuần,
   đó là khoảng 1.600 dòng cho mỗi lần khoá/mở. Đúng nhưng không tinh; nếu sau
   này có lớp lớn hơn nhiều thì nên giới hạn theo tuần.
4. **Nhánh fail-safe của trigger không tới được ở schema hiện tại.**
   `registrations.period_number` tham chiếu `periods` và `periods.start_time` là
   NOT NULL, nên `study_session_start` luôn giải được cho một đăng ký đã tồn tại.
   Đó là kết quả **mạnh hơn** spec đòi, nhưng nó tựa vào hai sự kiện schema chứ
   không phải vào code của FEAT-010, nên có một test khẳng định đúng hai sự kiện
   đó — nếu ai gỡ chúng đi, `raise` trong `device_use_policy_state` thôi là phòng
   thủ và bắt đầu gánh việc thật. Đường RPC thì tới được và có test.
5. **Không có override DENY**, đúng phạm vi V1 (§20).
6. **Admin không khoá/mở được** (DEC-109). Nếu Product Owner muốn khác, cần một
   decision riêng.
7. **Học sinh đổi `uses_electronic_device` trong buổi đang khoá vẫn kích hoạt
   review**, vì đó là học sinh sửa đăng ký chứ không phải thay đổi do policy.
   Quyền hiệu lực vẫn `false`. Nêu ở mục 6.

---

## 15. Deployment

Xem `docs/feat-010/DEPLOYMENT.md`. Tóm tắt:

1. FEAT-007 RC6 phải được áp trước (production hiện đang chạy RC1 — xem
   `docs/feat-007/PRODUCTION_UPGRADE_RC1_TO_RC6.md`). FEAT-010 **không** phụ
   thuộc vào nó về mặt kỹ thuật, nhưng chạy hai việc chưa xong cùng lúc thì khó
   quy trách nhiệm khi có chuyện.
2. Chạy `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` trong SQL editor của
   Supabase. Một transaction; không ghi lại dòng nào ngoài backfill một cột mới.
3. Deploy frontend. **Thứ tự: SQL trước, frontend sau** — ngược với FEAT-007.
   Frontend mới select cột `effective_uses_electronic_device`; nếu cột chưa tồn
   tại thì PostgREST trả lỗi và trang đăng ký hỏng. Frontend cũ chạy trên schema
   mới thì không sao: nó chỉ không hiển thị trạng thái khoá.
4. Kiểm tra: **Duyệt đăng ký** và **Theo dõi cả lớp** vẫn hiện, sidebar giáo viên
   có mục **Thiết bị điện tử**, và trang đó liệt kê đúng các tiết của lớp.

## 16. Rollback

Trong `DEPLOYMENT.md`. Gỡ trigger và hai bảng đưa database về đúng trạng thái
trước FEAT-010; cột `effective_uses_electronic_device` được giữ lại (vô hại, và
bỏ nó đi sẽ làm hỏng frontend mới nếu frontend chưa kịp rollback). Không có dữ
liệu đăng ký nào bị mất trong cả hai chiều.

---

## 17. RC9 — class lifecycle regression (R-009 / R-010)

RC9 không đổi business rule Device Lock. Migration `14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql` chỉ thay freeze trigger của hai bảng policy:

- child DELETE thấy parent class còn tồn tại → direct delete, vẫn gọi `device_use_assert_year_writable(OLD.class_id)`;
- child DELETE không còn thấy parent → đây là parent-driven FK cascade, cho phép cascade tiếp tục;
- INSERT/UPDATE luôn kiểm NEW owner;
- UPDATE đổi `class_id` kiểm thêm OLD owner, giữ invariant hard-freeze RC6/RC7.

Runtime regression đã được tích hợp vào `tests/feat-010/database.test.mjs`: active empty-class delete, class có interval+override+signal cascade, frozen direct child delete, frozen→active và active→frozen re-parenting, active→active control, và FEAT-007 archived parent class guard thật. Mutation M51/M52 nằm trong `tests/feat-010/mutations.mjs`.

**Verification status của lần đóng gói RC9 này:** JavaScript syntax PASS. Full PGlite/Vitest/typecheck/build RC9 chưa chạy vì gói nguồn không chứa `node_modules` và runtime đóng gói không tải được dependencies. Không có migration nào được áp lên production. Bằng chứng 404 PASS / 50/50 của RC8 chỉ là baseline trước thay đổi.

