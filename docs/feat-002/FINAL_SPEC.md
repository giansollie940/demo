# FEAT-002 — Báo bài: Thu hẹp quyền Admin, Teacher AI Settings, Deleted Duplicate Lifecycle & Hard Delete

## Task

**Task ID:** `FEAT-002`  
**Title:** Báo bài — Permission Refinement + Teacher AI Settings + Deleted Duplicate Lifecycle + Admin Hard Delete  
**Status:** `FINAL`  
**Spec Owner:** GPT-5.6 Sol High  
**Implementation Model:** GPT-6 Astra  
**ASTRA_EFFORT:** `MEDIUM`

---

## Objective

Điều chỉnh subsystem Báo bài sau FEAT-001/BUG-001 theo ba yêu cầu sản phẩm mới:

1. Admin không còn là actor vận hành Báo bài hằng ngày; Admin chủ yếu giám sát nhật ký/thống kê và có quyền hard delete.
2. Teacher được quyền sử dụng cài đặt AI nghiệp vụ Báo bài; Student/Monitor không được quyền này.
3. Notice duplicate đã soft-delete không còn xuất hiện như việc Teacher phải xử lý; phải tách rõ actionable queue với history/audit.

Task đồng thời khóa chính xác phạm vi hard delete và dữ liệu audit/history bắt buộc phải giữ lại trước khi Astra triển khai.

---

## Current Behavior

Theo FEAT-001 hiện hành và phản ánh người dùng:

- Admin còn nhiều quyền vận hành Báo bài hơn nhu cầu mới, gồm một số thao tác quản lý/override.
- Cấu hình AI nghiệp vụ hiện chỉ Admin có thể thay đổi; Teacher chưa có quyền.
- Một số notice duplicate đã xóa vẫn có thể tiếp tục xuất hiện như item cần Teacher xử lý hoặc ảnh hưởng queue/backlog.
- FEAT-001 chỉ định soft delete; chưa có business rule canonical cho hard delete.

Astra phải khảo sát code/database hiện tại trước khi sửa. Nếu hiện trạng khác căn bản hoặc cần thay đổi business rule ngoài SPEC này, trả `STATUS: BLOCKED`.

---

## Required Behavior

### RB-001 — Admin chuyển sang oversight, không vận hành Báo bài hằng ngày

Admin được:

- xem Báo bài ở chế độ giám sát;
- xem nhật ký/audit phù hợp;
- xem thống kê của lớp hoạt động hiện tại;
- thực hiện hard delete theo rule của task này;
- giữ các quyền hệ thống khác của FEAT-001 không trực tiếp vận hành notice, trừ các quyền bị SPEC này thay đổi rõ.

Admin không được thực hiện các action nghiệp vụ notice hằng ngày:

- tạo/đăng Báo bài;
- sửa notice;
- gửi Reminder;
- soft delete/restore notice;
- quyết định duplicate (`keep_existing`, `replace_existing`, `keep_both`);
- quản lý môn hoặc English group;
- thay đổi AI operational settings của Báo bài.

Teacher là actor vận hành các chức năng trên theo permission hiện hành và các rule mới bên dưới.

### RB-002 — Teacher quản lý AI operational settings

Teacher được sử dụng phần **Cài đặt AI** của Báo bài cho lớp hoạt động hiện tại.

Teacher được chỉnh đúng các setting sau:

1. `semantic_duplicate_enabled` — bật/tắt lớp AI semantic duplicate.
2. `duplicate_review_threshold` — ngưỡng dưới, mặc định `70`.
3. `duplicate_auto_threshold` — ngưỡng trên, mặc định `90`.

Constraint:

- các ngưỡng là số nguyên từ `0` đến `100`;
- `duplicate_review_threshold < duplicate_auto_threshold`;
- thay đổi phải được audit;
- khi semantic AI bị tắt, exact/normalized duplicate check vẫn hoạt động; chỉ lớp semantic AI bị bỏ qua; notice không exact-duplicate được xử lý theo flow publish bình thường.

Teacher không được xem/sửa:

- `GROQ_API_KEY` hoặc bất kỳ secret nào;
- service-role credential;
- provider credential;
- raw prompt/system prompt kỹ thuật;
- model/provider infrastructure configuration;
- candidate window `24h`;
- reminder limits;
- backlog limits;
- các business rule cố định khác của FEAT-001.

Student và Monitor không được xem hoặc thay đổi AI operational settings. Admin có thể xem trạng thái/health nếu UI giám sát cần, nhưng không được sửa ba setting nghiệp vụ nêu trên.

### RB-003 — Actionable duplicate queue tách khỏi history/audit

Một notice chỉ là **việc Teacher cần xử lý** khi đồng thời:

- `status = pending_duplicate_review`;
- chưa soft-delete (`deleted_at IS NULL` hoặc điều kiện tương đương theo schema thực tế);
- chưa được resolve bởi duplicate decision.

Notice duplicate đã soft-delete:

- không xuất hiện trong Teacher actionable queue;
- không tính vào pending count;
- không tạo backlog/escalation Admin;
- không tạo reminder “cần xử lý” cho Teacher;
- vẫn tồn tại trong Student History và Teacher/Admin audit/history theo quyền, cho tới khi hard delete.

Nếu notice pending đã soft-delete sau đó được Teacher restore, và duplicate case vẫn unresolved, notice trở lại actionable queue.

### RB-004 — Phạm vi hard delete

Hard delete là hành động **Admin-only** và không thể hoàn tác.

Một notice chỉ đủ điều kiện hard delete khi:

1. notice đã được soft-delete trước đó;
2. tại thời điểm transaction hard delete, notice vẫn đang ở trạng thái soft-deleted;
3. Admin xác nhận hành động irreversible;
4. Admin nhập `hard_delete_reason` sau khi trim, không rỗng, tối đa 500 ký tự.

Áp dụng cho mọi notice đã soft-delete, bất kể trạng thái trước khi xóa là:

- `published`;
- `pending_duplicate_review`;
- `duplicate_rejected`;
- `replaced`;
- hoặc trạng thái nghiệp vụ hợp lệ khác của FEAT-001.

Không được hard delete trực tiếp notice đang active/published/pending mà chưa qua soft delete.

V1 chỉ hỗ trợ **hard delete từng notice**, không bulk purge và không auto-purge theo thời gian.

Không có waiting period bắt buộc giữa soft delete và hard delete trong V1; safety được thực thi bằng hai bước soft delete → hard delete, xác nhận rõ và audit bắt buộc.

### RB-005 — Dữ liệu bị purge khi hard delete

Sau hard delete, nội dung nghiệp vụ của notice phải bị loại khỏi nguồn dữ liệu vận hành. Không được giữ raw content ở bảng notice hoặc child tables chỉ để tiện debug.

Phải purge hoặc redaction không thể khôi phục đối với:

- `title`;
- `content`;
- `due_at`;
- reaction rows của notice;
- reminder rows của notice;
- AI similarity score/reason/prompt/raw response liên quan notice;
- duplicate-review payload chi tiết không còn cần cho audit tối thiểu;
- các operational child rows chỉ tồn tại để vận hành notice.

Hard delete không được xóa hoặc cascade sang:

- user/profile;
- class;
- subject master data;
- English group master data;
- notice khác;
- registration/self-study data;
- audit của các subsystem khác.

Leaderboard/achievement không được tính hard-deleted notice hoặc reaction của notice đó. Việc hard delete không được làm notice sống lại trong thống kê do mất row invalidation.

### RB-006 — Audit tombstone bắt buộc giữ lại

Trước khi purge notice, hệ thống phải ghi thành công một **immutable hard-delete tombstone/audit record**. Nếu không ghi được tombstone thì hard delete phải fail và không được purge notice.

Tombstone phải giữ tối thiểu:

- `notice_id` gốc;
- `class_id`;
- `author_id`;
- `subject_id` nếu có;
- `english_group_id` nếu có;
- `original_created_at`;
- `original_published_at` nếu có;
- trạng thái nghiệp vụ cuối cùng trước soft delete/hard delete;
- `soft_deleted_at`;
- `soft_deleted_by`;
- `soft_delete_reason` nếu có;
- `hard_deleted_at`;
- `hard_deleted_by`;
- `hard_delete_reason`;
- cờ cho biết notice từng thuộc duplicate flow hay không;
- duplicate decision cuối cùng nếu đã từng resolve (`keep_existing`, `replace_existing`, `keep_both`) cùng `decided_at/decided_by` nếu có.

Tombstone **không được giữ**:

- title;
- content;
- deadline;
- AI exact score;
- AI reason;
- raw prompt/response;
- reaction identities;
- reminder recipients/details.

Tombstone chỉ dùng cho audit/history, không dùng làm nguồn publish, duplicate candidate, leaderboard, reminder hoặc actionable queue.

### RB-007 — History sau hard delete

Sau hard delete:

- Admin audit được xem metadata tombstone đầy đủ theo RB-006.
- Teacher audit/history của lớp có thể hiển thị một event redacted “Admin đã xóa vĩnh viễn notice”, nhưng không được khôi phục raw content đã purge.
- Tác giả gốc (Student/Monitor/Teacher nếu có) trong personal history chỉ thấy marker redacted `[Đã xóa vĩnh viễn]` với thời điểm tạo gốc và thời điểm hard delete; không thấy title/content/deadline/AI data.
- Người dùng khác không được truy cập tombstone chỉ vì từng thấy notice trước đó.

Rule này duy trì nguyên tắc lịch sử có dấu vết hành động mà không làm hard delete trở thành soft delete trá hình.

### RB-008 — Referential integrity khi hard delete

Nếu notice bị tham chiếu bởi duplicate review/audit của notice khác, hard delete không được cascade xóa notice khác hoặc làm hỏng history.

Implementation phải bảo toàn referential integrity bằng một cơ chế an toàn như tombstone reference, snapshot/redaction hoặc cơ chế tương đương. Astra được quyết định HOW, nhưng không được giải quyết bằng cách giữ nguyên raw notice content.

---

## Actors

- `student`
- `monitor`
- `teacher`
- `admin`

---

## Permissions

| Chức năng | Admin | Teacher | Monitor | Student |
|---|:---:|:---:|:---:|:---:|
| Xem board | ✅ read-only oversight | ✅ | ✅ | ✅ |
| Đăng notice | ❌ | ✅ | Theo FEAT-001 | ✅ |
| Sửa notice nghiệp vụ | ❌ | ✅ theo quyền | Theo FEAT-001 | Bài mình |
| Reminder | ❌ | ✅ | ✅ | ❌ |
| Soft delete/restore | ❌ | ✅ | Theo FEAT-001 | Theo FEAT-001 |
| Duplicate decision | ❌ | ✅ | ❌ | ❌ |
| Quản lý môn | ❌ | ✅ | ❌ | ❌ |
| Quản lý English group | ❌ | ✅ | ❌ | ❌ |
| AI operational settings | ❌ sửa / ✅ health view | ✅ | ❌ | ❌ |
| Xem audit | ✅ | ✅ trong lớp | ❌ | lịch sử cá nhân |
| Thống kê lớp | ✅ | ✅ | Theo FEAT-001 | Theo FEAT-001 |
| Hard delete | ✅ | ❌ | ❌ | ❌ |

Các quyền hệ thống khác của Admin ngoài subsystem notice giữ nguyên nếu không mâu thuẫn với bảng này.

---

## Business Rules

`BR-201` — Teacher là operator nghiệp vụ Báo bài; Admin là oversight actor, không phải Teacher dự phòng.

`BR-202` — Admin không được create/edit/remind/soft-delete/restore/duplicate-decision/manage-subject/manage-English-group trong Báo bài.

`BR-203` — Teacher được chỉnh `semantic_duplicate_enabled`, ngưỡng `70/90` theo constraint; Student/Monitor/Admin không được sửa.

`BR-204` — Tắt semantic AI không tắt exact/normalized duplicate detection.

`BR-205` — Actionable duplicate queue chỉ chứa unresolved `pending_duplicate_review` chưa soft-delete.

`BR-206` — Soft-deleted duplicate vẫn là history/audit nhưng không còn là work item, pending count hoặc backlog.

`BR-207` — Restore một pending duplicate chưa resolve làm nó trở lại actionable queue.

`BR-208` — Hard delete chỉ Admin, chỉ notice đã soft-delete, từng item, có confirmation và reason, không auto/bulk purge V1.

`BR-209` — Hard delete phải purge raw notice content và operational child data, nhưng không được phá dữ liệu user/class/subsystem khác.

`BR-210` — Audit tombstone phải được ghi thành công trước purge và phải chứa đúng metadata tối thiểu RB-006; không giữ raw content/AI payload.

`BR-211` — Personal history sau hard delete chỉ hiển thị redacted marker cho tác giả gốc; không khôi phục content.

`BR-212` — Hard delete phải bảo toàn referential integrity và không cascade xóa notice khác.

---

## Edge Cases

`EC-201` — Admin gọi hard delete trên notice chưa soft-delete → reject.

`EC-202` — Notice được restore đồng thời trước khi hard-delete transaction khóa row → hard delete phải re-check trạng thái và reject nếu không còn soft-deleted.

`EC-203` — Pending duplicate bị soft-delete → biến khỏi queue/backlog ngay; review history vẫn còn.

`EC-204` — Pending duplicate soft-deleted rồi restore → trở lại queue nếu chưa resolve.

`EC-205` — Hard delete notice có reactions/reminders → child data bị purge; leaderboard không tính notice/reactions đó.

`EC-206` — Hard delete notice là duplicate target/reference của notice khác → không cascade xóa notice khác; trace tối thiểu vẫn đọc được qua tombstone/redaction.

`EC-207` — Ghi tombstone fail → toàn bộ hard delete rollback/fail.

`EC-208` — Gọi hard delete lần hai cùng notice → không tạo purge/audit duplicate; trả trạng thái already deleted/not found theo implementation nhất quán.

`EC-209` — Teacher nhập ngưỡng AI `90/70`, bằng nhau, ngoài 0–100 hoặc không phải integer → reject server-side.

`EC-210` — Monitor/Student/Admin gọi trực tiếp API đổi AI setting → reject backend.

---

## Data Impact

Task có khả năng cần:

- migration/RLS/RPC để thay permission;
- thay đổi cấu hình AI ownership;
- query/view/function tách actionable queue khỏi history;
- cơ chế hard-delete tombstone/audit;
- FK/constraint hoặc cơ chế redaction để bảo toàn referential integrity;
- cập nhật UI tabs/actions theo role.

Không được reset bảng FEAT-001 hoặc xóa dữ liệu hiện có hàng loạt.

Hard delete là destructive operation được phép **chỉ theo rule của SPEC này và chỉ do Admin chủ động thực hiện từng notice**.

---

## Security Impact

Bắt buộc kiểm:

- auth session là nguồn actor identity;
- server-side authorization cho hard delete và AI settings;
- Admin không thể bypass để vận hành notice ngoài quyền mới;
- Student/Monitor không thể tự cấp quyền AI settings;
- Teacher không thể xem/sửa secrets;
- hard-delete request không được nhận `actor_id` từ client làm nguồn sự thật;
- RLS/RPC không cho direct table/API bypass;
- hard delete transaction không tạo orphan/cascade ngoài scope;
- tombstone không làm lộ raw content đã purge.

---

## Must Not Break

- Authentication.
- Existing FEAT-001 publish flow.
- Duplicate thresholds `70/90` và candidate window hiện hành, trừ ownership setting được thay đổi rõ.
- AI error → retry cùng revision.
- Student/Monitor English-group isolation.
- Reactions và leaderboard hiện hành.
- Reminder rate limits.
- Student History cho notice chưa hard-delete.
- Teacher duplicate review flow.
- Existing Registration/self-study subsystem.
- BUG-001 Admin route/Owl fixes.

---

## Acceptance Criteria

`AC-201` — Given Admin ở Báo bài, when xem board/audit/stats, then đọc được dữ liệu oversight nhưng không có action create/edit/remind/soft-delete/restore/duplicate decision/subject-English config/AI setting.

`AC-202` — Given Admin gọi trực tiếp API cho action nghiệp vụ bị cấm, then backend reject.

`AC-203` — Given Teacher mở AI settings, when lưu enable + thresholds hợp lệ, then lưu thành công và audit actor/time/old/new values.

`AC-204` — Given Student/Monitor/Admin gọi API đổi AI settings, then backend reject.

`AC-205` — Given semantic AI disabled, when notice không exact/normalized duplicate, then không gọi semantic AI và flow tiếp tục theo rule publish hiện hành.

`AC-206` — Given notice `pending_duplicate_review` bị soft-delete, then biến khỏi actionable queue/pending count/backlog nhưng còn history/audit.

`AC-207` — Given notice ở AC-206 được restore và duplicate chưa resolve, then nó trở lại actionable queue.

`AC-208` — Given notice chưa soft-delete, when Admin yêu cầu hard delete, then reject và dữ liệu không thay đổi.

`AC-209` — Given notice đã soft-delete, when Admin xác nhận + reason hợp lệ và hard delete, then raw notice content/operational child data bị purge và không thể restore.

`AC-210` — Hard delete chỉ commit khi immutable tombstone đã được ghi; failure ghi tombstone phải rollback purge.

`AC-211` — Tombstone giữ đúng metadata RB-006 và không chứa title/content/deadline/exact AI score/reason/raw prompt-response/reaction identities/reminder details.

`AC-212` — Tác giả gốc sau hard delete chỉ thấy marker `[Đã xóa vĩnh viễn]` + created/hard-deleted timestamps; không thấy raw content.

`AC-213` — Hard delete notice được tham chiếu bởi duplicate history không cascade xóa notice khác và không làm query history lỗi FK/orphan.

`AC-214` — Hard-deleted notice/reactions không xuất hiện board, queue, reminder target, leaderboard hoặc achievement.

`AC-215` — Automated tests phải bao phủ ít nhất permission matrix, AI setting validation, deleted-pending queue exclusion/restore, hard-delete eligibility, tombstone rollback, child purge, referential integrity, API bypass và regression FEAT-001/BUG-001.

---

## Out of Scope

- Bulk hard delete.
- Auto-purge/retention schedule.
- Hard delete user/profile/class/subject/English group.
- Xóa audit của subsystem khác.
- Cho Teacher hard delete.
- Cho Admin sửa AI operational settings.
- Cho Teacher xem/sửa Groq/API secrets hoặc provider/model infrastructure.
- Mở rộng multi-class ngoài `DEC-001`.
- Thay đổi reminder quotas, duplicate candidate 24h, leaderboard formula hoặc gamification ngoài tác động tất yếu của deleted notice.

---

## Effort Recommendation

`ASTRA_EFFORT: MEDIUM`

Lý do: task chạm permissions, RLS/RPC, migration, destructive data operation, audit retention, FK/data integrity và AI configuration authorization.

---

## Final Status

`STATUS: FINAL`

Astra được bắt đầu implementation sau khi nhận FINAL SPEC này, DECISIONS cập nhật, source hiện tại và PROJECT_CONTEXT. Nếu implementation buộc phải giữ raw content sau hard delete, thay hard-delete scope, thay permission hoặc thay business rule, Astra phải trả `STATUS: BLOCKED`.
