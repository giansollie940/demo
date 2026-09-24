# FEAT-005 — Notice Ownership, Reporting & Correction Workflow

## Task

**Task ID:** `FEAT-005`  
**Title:** Báo bài — Ownership, Báo sai thông tin, Yêu cầu chỉnh sửa và Auto Soft-delete  
**Status:** `FINAL`  
**Spec Owner:** GPT-5.6 Sol High  
**Implementation Model:** GPT-6 Astra  
**ASTRA_EFFORT:** `MEDIUM`

---

## Objective

Chuẩn hóa quyền sở hữu và kiểm duyệt Báo bài theo nguyên tắc:

- người đăng chịu trách nhiệm với nội dung mình đăng;
- chỉ tác giả được sửa bài của mình;
- Cán sự không sửa/xóa bài của người khác, chỉ được báo sai thông tin;
- Teacher không sửa bài thay học sinh, mà gửi yêu cầu chỉnh sửa;
- Teacher vẫn có quyền gỡ bài khẩn cấp có lý do và audit;
- correction workflow hữu hạn, tối đa 2 vòng;
- nếu tác giả không xử lý trong 72 giờ hoặc vẫn không đạt sau vòng cuối, hệ thống soft-delete;
- danh tính người báo sai chỉ Teacher của lớp biết;
- Admin không tham gia vận hành hằng ngày, giữ hard-delete theo FEAT-002.

---

## Source of Truth

Thứ tự ưu tiên:

1. DECISIONS, gồm decision update của FEAT-005;
2. FINAL SPEC FEAT-005;
3. FINAL SPEC FEAT-004;
4. FEAT-002 / FEAT-001 còn hiệu lực nếu không bị supersede;
5. PROJECT_CONTEXT;
6. code/database hiện tại;
7. nội dung chat.

Nếu implementation hiện tại mâu thuẫn với FINAL SPEC này, Astra không được tự giữ behavior cũ chỉ vì code đang có.

---

## Current Behavior

Các phiên bản trước cho phép Teacher/Monitor có một số quyền quản lý bài của người khác.

FEAT-005 thay đổi mô hình này sang ownership + moderation workflow:

- sửa nội dung thuộc quyền tác giả;
- kiểm duyệt thuộc quyền Teacher;
- báo sai thông tin thuộc quyền Cán sự;
- hard-delete vẫn thuộc Admin theo FEAT-002.

---

## Required Behavior

### RB-501 — Notice ownership

Mỗi notice có một tác giả (`author_id`).

Chỉ tác giả được:

- sửa title/content/subject/deadline và các trường nghiệp vụ của notice mình;
- soft-delete notice mình nếu không có correction request đang mở.

Không actor nào được sửa trực tiếp nội dung notice của người khác, kể cả Teacher.

### RB-502 — Student permissions

Student:

- tạo notice;
- sửa notice mình;
- soft-delete notice mình nếu không có correction request đang mở;
- xem notice theo class scope;
- phản hồi correction request trên notice mình;
- không báo sai notice người khác;
- không sửa/xóa notice người khác.

### RB-503 — Monitor permissions

Monitor có toàn bộ quyền Student trên notice của chính mình.

Đối với notice của người khác, Monitor chỉ được:

- xem;
- thả tim theo rule hiện hành;
- bấm `Báo sai thông tin`.

Monitor không được:

- sửa;
- soft-delete;
- restore;
- remind;
- gửi correction request;
- quyết định correction;
- xem danh tính reporter khác.

### RB-504 — Report incorrect information

Monitor có action `Báo sai thông tin` trên notice của người khác.

Report bắt buộc có:

- reporter_id;
- class_id;
- notice_id;
- created_at;
- category;
- optional note;
- current status.

Category tối thiểu:

- `deadline`;
- `subject`;
- `content`;
- `duplicate`;
- `other`.

Một Monitor không được tạo report mới cho cùng một notice khi report trước của chính Monitor đó vẫn đang mở.

### RB-505 — Reporter identity visibility

Danh tính reporter là dữ liệu nội bộ.

Chỉ Teacher được phân công lớp đó được xem:

- tên Cán sự;
- mã đăng nhập/mã HS nếu có;
- lớp;
- thời điểm báo;
- category;
- note;
- history/status của report.

Không hiển thị reporter identity cho:

- tác giả notice;
- Student;
- Monitor khác;
- bảng chung;
- notification gửi cho tác giả.

Backend/audit vẫn giữ reporter identity.

Admin không cần reporter identity trong flow vận hành thường ngày.

### RB-506 — Report processing by Teacher

Teacher của lớp có thể xử lý report bằng các trạng thái tối thiểu:

- `valid`;
- `invalid`;
- `suspected_abuse`.

Mỗi lần xử lý phải lưu:

- teacher actor;
- timestamp;
- outcome;
- optional teacher note;
- audit event.

Teacher có thể dùng report hợp lệ làm căn cứ:

- gửi correction request;
- hoặc gỡ bài khẩn cấp nếu đủ điều kiện.

Report outcome không tự động sửa/xóa notice.

### RB-507 — Monitor accountability

Hệ thống phải cho Teacher xem thống kê theo từng Monitor tối thiểu:

- tổng report đã gửi;
- số report hợp lệ;
- số report không hợp lệ;
- số report bị đánh dấu `suspected_abuse`.

Nhiều report bị đánh dấu lạm dụng chỉ tạo cảnh báo/insight cho Teacher.

Hệ thống không tự động:

- khóa nút báo sai;
- hạ role;
- phạt;
- thay đổi quyền Monitor.

Quyết định xử lý thuộc Teacher/human.

### RB-508 — Correction request

Teacher không sửa notice của Student/Monitor thay tác giả.

Teacher có action `Yêu cầu chỉnh sửa Báo bài`.

Một correction request có thể chứa một hoặc nhiều issue type:

- `deadline`;
- `subject`;
- `content`;
- `other`.

Teacher bắt buộc nhập lý do/hướng dẫn chỉnh sửa.

Một notice chỉ có tối đa một correction request đang mở tại một thời điểm.

### RB-509 — Correction request visibility

Khi correction request được tạo:

- tác giả nhận notification;
- notice vẫn hiển thị trên bảng chung;
- notice có badge/trạng thái `GV yêu cầu chỉnh sửa`;
- bảng chung không hiển thị tên Monitor/report source;
- tác giả thấy nội dung yêu cầu của Teacher;
- correction request ghi rõ deadline phản hồi.

### RB-510 — 72-hour correction window

Mỗi correction round cho tác giả chính xác 72 giờ tính từ `requested_at`.

Không tính theo ngày lịch.

Nếu tác giả không gửi lại trong 72 giờ:

- System soft-delete notice;
- lưu reason chuẩn;
- tạo audit;
- gửi notification cho tác giả.

Reason chuẩn tối thiểu:

`Không chỉnh sửa Báo bài trong 72 giờ sau yêu cầu của giáo viên.`

### RB-511 — Maximum two correction rounds

Mỗi notice/correction workflow có tối đa 2 correction rounds.

#### Round 1

Teacher gửi correction request → 72 giờ.

Tác giả sửa và bấm `Gửi lại GV`.

Teacher chọn:

- `Đạt` → đóng correction;
- `Chưa đạt` → bắt buộc nhập lý do và mở Round 2.

#### Round 2

Round 2 là vòng cuối và phải hiển thị rõ cho tác giả:

`Lần chỉnh sửa cuối`.

Round 2 có 72 giờ mới.

Teacher chọn:

- `Đạt` → đóng correction;
- `Chưa đạt` → System soft-delete notice.

Không có Round 3.

### RB-512 — Resubmission stops the timer

Khi tác giả bấm `Gửi lại GV` trước hạn:

- correction timer dừng;
- trạng thái chuyển sang `Chờ GV xác nhận`;
- notice không được auto-delete chỉ vì Teacher chưa xử lý;
- trách nhiệm thời hạn của tác giả được xem là đã hoàn thành cho round đó.

### RB-513 — Pending revision visibility

Khi tác giả đang chỉnh sửa nhưng chưa gửi lại:

- bản published hiện hành vẫn là bản công khai;
- badge cho biết notice đang chờ chỉnh sửa.

Khi tác giả bấm `Gửi lại GV`:

- revision mới ở trạng thái chờ Teacher;
- revision mới chỉ tác giả và Teacher được xem;
- bảng chung tiếp tục hiển thị published revision trước đó với badge `Đang chờ GV xác nhận chỉnh sửa`.

Teacher chọn `Đạt`:

- revision mới trở thành published revision;
- chạy lại các validation/duplicate rule cần thiết theo FEAT-001/002.

Teacher chọn `Chưa đạt`:

- published revision trước đó vẫn không bị thay bằng revision chưa đạt;
- workflow chuyển Round 2 hoặc soft-delete nếu là vòng cuối.

### RB-514 — Revision re-check

Nếu revision thay đổi các trường đã được FEAT-001 xác định là material change, bao gồm tối thiểu:

- deadline thay đổi đủ ngưỡng re-check;
- subject;
- English group;
- nhiệm vụ chính;
- nội dung bản chất;

thì khi Teacher chọn `Đạt`, hệ thống vẫn phải chạy lại duplicate/review rule tương ứng.

Correction workflow không được bypass AI/duplicate rules hiện hành.

### RB-515 — Author soft-delete

Tác giả được soft-delete notice mình khi không có correction request đang mở.

Nếu notice có correction request đang mở:

- không hiển thị action xóa thông thường;
- thay bằng action `Xin rút bài`.

### RB-516 — Withdraw during correction

`Xin rút bài`:

- chỉ tác giả thực hiện;
- bắt buộc reason;
- tạo audit;
- soft-delete notice;
- đóng correction request với outcome `withdrawn_by_author`;
- Teacher thấy rõ tác giả đã rút bài và lý do.

Không dùng hard-delete.

### RB-517 — Teacher emergency removal

Teacher có quyền `Gỡ bài` của Student/Monitor trong lớp được phân công khi cần can thiệp ngay.

Teacher không dùng `Gỡ bài` thay cho correction flow đối với lỗi thông thường.

Các reason tối thiểu:

- `inappropriate_content`;
- `posted_by_mistake`;
- `seriously_incorrect_information`;
- `other`.

Teacher bắt buộc nhập reason/note.

`Gỡ bài`:

- là soft-delete;
- ghi actor/time/reason/audit;
- gửi notification cho tác giả;
- không sửa nội dung notice.

### RB-518 — Role delete matrix

#### Student
- soft-delete notice mình;
- không xóa notice người khác.

#### Monitor
- soft-delete notice mình;
- không xóa notice người khác.

#### Teacher
- không soft-delete notice người khác bằng action xóa thông thường;
- có `Gỡ bài` khẩn cấp theo RB-517;
- không hard-delete.

#### Admin
- không soft-delete notice trong daily operation;
- hard-delete từ Trash theo FEAT-002.

#### System
- soft-delete khi correction timeout;
- soft-delete khi Round 2 bị Teacher xác nhận `Chưa đạt`.

### RB-519 — Notifications

Tác giả phải nhận notification tối thiểu khi:

- Teacher tạo correction request;
- Teacher mở Round 2;
- Teacher xác nhận `Đạt`;
- Teacher xác nhận `Chưa đạt` ở Round 2 và bài bị soft-delete;
- correction timeout và bài bị soft-delete;
- Teacher `Gỡ bài`;
- tác giả `Xin rút bài` thành công.

Notification cho tác giả không được tiết lộ reporter identity.

### RB-520 — Audit and history

Hệ thống phải lưu audit đầy đủ cho:

- report created;
- report processed;
- report marked invalid/abuse;
- correction created;
- revision submitted;
- correction approved;
- correction rejected;
- Round 2 opened;
- correction timeout;
- teacher emergency removal;
- author withdrawal;
- system soft-delete.

Audit phải đủ để xác định:

- actor;
- class;
- notice;
- timestamp;
- action;
- reason/outcome;
- correction round.

### RB-521 — Existing leaderboard/reaction behavior after removal

Notice đã soft-delete:

- không còn hiển thị trên board;
- không nhận reaction mới;
- không tiếp tục được tính như notice published đang hoạt động;
- history/audit vẫn giữ theo FEAT-002.

Không thay đổi công thức leaderboard ngoài việc tuân trạng thái notice hiện hành.


### RB-522 — Canonical soft-delete actor

Mọi soft-delete phải có attribution rõ ràng theo một trong hai actor type:

- `user`;
- `system`.

#### User soft-delete

Nếu soft-delete do một người dùng thực hiện:

- attribution phải giữ đúng UUID/profile của actor thật;
- không được thay bằng actor khác;
- áp dụng cho author delete/withdraw và Teacher emergency removal theo permission tương ứng.

#### System soft-delete

Nếu soft-delete do automation/system thực hiện, bao gồm tối thiểu:

- correction timeout;
- terminal System transition sau Round 2 `Chưa đạt`;

thì retained attribution phải thể hiện rõ actor là:

`System`

và không được gán giả UUID của Teacher, Author hoặc Admin.

Không tạo login-capable synthetic System profile/account chỉ để thỏa foreign key hoặc hard-delete contract.

Nếu một System soft-delete được kích hoạt bởi quyết định của người dùng, ví dụ Teacher chọn `Chưa đạt` ở Round 2:

- deletion actor vẫn là `System`;
- Teacher decision phải được lưu riêng trong correction/audit với Teacher actor thật;
- không nhập nhằng Teacher thành người trực tiếp soft-delete.

### RB-523 — Hard-delete compatibility for System soft-delete

Notice đã được System soft-delete phải vẫn đủ điều kiện vào Trash và Admin hard-delete theo toàn bộ rule FEAT-002.

Hard-delete eligibility không được phụ thuộc duy nhất vào việc có một human `soft_deleted_by` UUID.

Một notice được xem là soft-deleted hợp lệ khi:

- trạng thái/soft-delete metadata hợp lệ;
- có deletion attribution hợp lệ là `user` hoặc `system`;
- thỏa các điều kiện hard-delete khác của FEAT-002.

FEAT-005 chỉ thay đổi cách biểu diễn attribution để hỗ trợ System actor; không nới quyền hard-delete và không thay đổi confirmation/reason/tombstone/purge rule FEAT-002.

### RB-524 — Tombstone retention for deletion attribution

Sau Admin hard-delete, tombstone phải giữ attribution tối thiểu đủ để xác định:

- soft-delete actor type: `user` hoặc `system`;
- nếu actor type = `user`: giữ UUID của người dùng thật theo FEAT-002;
- nếu actor type = `system`: hiển thị/diễn giải là `System`, không cần và không được bịa human UUID.

Existing tombstone records phải được bảo toàn.

Astra được quyết định column names, CHECK constraints, migration shape và RPC implementation miễn đáp ứng contract trên.


---

## Permissions Matrix

| Action | Admin | Teacher | Monitor | Student |
|---|:---:|:---:|:---:|:---:|
| Tạo notice | ❌ | ✅ bài mình | ✅ | ✅ |
| Sửa notice mình | ❌ | ✅ | ✅ | ✅ |
| Sửa notice người khác | ❌ | ❌ | ❌ | ❌ |
| Soft-delete notice mình | ❌ | ✅ | ✅ | ✅ |
| Soft-delete notice người khác | ❌ | Chỉ `Gỡ bài` | ❌ | ❌ |
| Báo sai thông tin | ❌ | Không cần | ✅ | ❌ |
| Xem reporter identity | ❌ daily flow | ✅ lớp assigned | ❌ | ❌ |
| Xử lý report | ❌ | ✅ | ❌ | ❌ |
| Gửi correction request | ❌ | ✅ | ❌ | ❌ |
| Chấp nhận/từ chối revision | ❌ | ✅ | ❌ | ❌ |
| Hard-delete | ✅ FEAT-002 | ❌ | ❌ | ❌ |

---

## Business Rules

`BR-501` — Chỉ author được sửa notice.

`BR-502` — Monitor không quản lý notice người khác; chỉ có `Báo sai thông tin`.

`BR-503` — Reporter identity chỉ Teacher lớp đó được xem; không công khai cho tác giả hoặc lớp.

`BR-504` — Teacher không sửa notice thay tác giả.

`BR-505` — Correction request tối đa 2 rounds, mỗi round tối đa 72 giờ phía tác giả.

`BR-506` — Tác giả gửi lại đúng hạn thì timer dừng; không được auto-delete vì Teacher xử lý chậm.

`BR-507` — Round 2 là vòng cuối; không có Round 3.

`BR-508` — Timeout bất kỳ round nào → soft-delete.

`BR-509` — Round 2 bị Teacher xác nhận `Chưa đạt` → soft-delete.

`BR-510` — Teacher có `Gỡ bài` khẩn cấp có reason + audit, không có quyền sửa thay.

`BR-511` — Author đang có correction mở không được dùng delete thường; phải `Xin rút bài`.

`BR-512` — Admin không tham gia correction/report daily workflow; hard-delete giữ nguyên FEAT-002.

`BR-513` — Report abuse chỉ cảnh báo/ghi nhận; không auto-lock Monitor.

`BR-514` — Correction revision không bypass duplicate/AI validation.

`BR-515` — Backend/RLS/RPC phải enforce toàn bộ permission; frontend visibility không phải security boundary.

`BR-516` — Automated soft-delete phải được attribution là `System`, không impersonate Teacher/Author/Admin và không tạo synthetic login-capable System account.

`BR-517` — System-soft-deleted notice vẫn phải hard-delete được bởi Admin theo FEAT-002; hard-delete không được yêu cầu human deleter UUID nếu deletion attribution hợp lệ là `system`.

`BR-518` — Nếu System deletion được trigger bởi một Teacher decision, Teacher actor được giữ riêng trong audit/correction history; deletion actor vẫn là System.


---

## Edge Cases

`EC-501` — Monitor báo cùng notice nhiều lần khi report cũ còn mở → reject.

`EC-502` — Student cố gọi report API → reject.

`EC-503` — Teacher lớp A xem reporter của lớp B → reject.

`EC-504` — Author cố sửa notice người khác bằng forged ID → reject.

`EC-505` — Teacher cố update trực tiếp notice người khác qua API → reject.

`EC-506` — Tác giả gửi revision đúng lúc timeout race → transaction/locking phải đảm bảo chỉ một kết quả hợp lệ.

`EC-507` — Teacher approve revision sau khi notice đã bị timeout soft-delete → stale action reject.

`EC-508` — Teacher mở Round 2 hai lần → reject.

`EC-509` — Attempt tạo Round 3 → reject.

`EC-510` — Author cố delete thường khi correction đang mở → reject; chỉ withdraw flow hợp lệ.

`EC-511` — Teacher emergency-remove notice đang có correction → correction đóng với terminal outcome phù hợp, không còn timer treo.

`EC-512` — Report target đã soft-delete/hard-delete trước khi Teacher xem → report vẫn giữ audit nhưng không tạo mutation trái trạng thái.

`EC-513` — Hard-deleted notice → report/correction history chỉ giữ dữ liệu theo tombstone/redaction rule FEAT-002.

`EC-514` — Revision được Teacher approve nhưng duplicate re-check đưa vào pending duplicate review → không bypass trạng thái duplicate.

`EC-515` — Reporter mất Monitor role sau khi report → audit identity vẫn giữ; không xóa lịch sử.

`EC-516` — System timeout soft-delete tạo human deleter UUID giả → prohibited.

`EC-517` — Admin hard-delete notice đã System soft-delete → phải thành công nếu notice thỏa các rule FEAT-002 khác.

`EC-518` — Teacher chọn `Chưa đạt` ở Round 2 → audit giữ Teacher là decision actor nhưng retained soft-delete actor là System.

`EC-519` — Existing user-soft-deleted notices/tombstones → migration giữ attribution người dùng thật, không chuyển sang System.

`EC-520` — Existing tombstones → migration không được làm mất hoặc rewrite attribution lịch sử nếu không cần thiết.


---

## Data Impact

Astra phải khảo sát schema hiện hành và lựa chọn implementation phù hợp.

Expected data concepts:

- notice report;
- report status/outcome;
- correction request;
- correction round;
- correction revision;
- revision status;
- correction deadline;
- reporter audit;
- notification events.

Không được phá:

- existing notices;
- reactions;
- leaderboard;
- duplicate review;
- tombstone;
- history;
- class isolation.

Migration phải bảo toàn dữ liệu hiện có.


Ngoài các concept trên, implementation phải hỗ trợ canonical soft-delete attribution `user | system` cho notice và retained tombstone metadata.

Migration phải:

- bảo toàn user deletion attribution hiện có;
- bảo toàn existing tombstones;
- cho phép System soft-delete mà không cần synthetic user/profile;
- đảm bảo System-soft-deleted notice vẫn tương thích Admin hard-delete theo FEAT-002.

---

## Scheduler / Time Impact

FEAT-005 cần cơ chế server-side để xử lý correction timeout.

Yêu cầu:

- không phụ thuộc browser đang mở;
- xử lý đúng 72 giờ;
- idempotent;
- không xóa hai lần;
- không timeout request đã được resubmit;
- không timeout request đã đóng;
- có audit event cho system action.

Astra được chọn scheduler/cron implementation phù hợp với hạ tầng hiện tại.

---

## Security Impact

Bắt buộc kiểm:

- author ownership;
- Teacher-class assignment;
- Monitor-only report permission;
- reporter confidentiality;
- forged notice/class/reporter IDs;
- correction round transition;
- direct API mutation;
- RLS/RPC;
- privileged functions;
- scheduler/service-role authorization.

Reporter identity phải được coi là restricted operational data.


System actor không phải một login-capable user/profile.

Scheduler/service-role automation không được impersonate một Teacher/Admin/Author chỉ để thỏa attribution schema.

---

## Must Not Break

- FEAT-001 duplicate detection;
- reminder rate-limit hiện hành;
- reaction/hearts;
- leaderboard/tuyên dương;
- FEAT-002 hard delete/tombstone;
- FEAT-003 Homework UI;
- FEAT-004 multi-class isolation;
- English group rules;
- Student history;
- Admin oversight;
- AI duplicate retry;
- existing Auth/RLS boundaries.

---

## Acceptance Criteria

`AC-501` — Student/Monitor/Teacher không thể sửa notice người khác bằng UI hoặc direct API.

`AC-502` — Author vẫn sửa được notice mình trong trạng thái hợp lệ.

`AC-503` — Monitor thấy `Báo sai thông tin` trên notice người khác; Student thường không thấy.

`AC-504` — Report lưu reporter/time/category/note và audit.

`AC-505` — Author và các HS khác không thể xem reporter identity.

`AC-506` — Teacher assigned class xem được reporter identity và report history.

`AC-507` — Teacher có thể mark report `valid`, `invalid`, `suspected_abuse`.

`AC-508` — Teacher thấy thống kê report theo Monitor nhưng không có auto-lock.

`AC-509` — Teacher không thể sửa notice của HS/Monitor trực tiếp.

`AC-510` — Teacher tạo correction request với một hoặc nhiều issue types và reason.

`AC-511` — Notice có correction vẫn hiển thị trên board với badge phù hợp.

`AC-512` — Round 1 timeout sau 72h nếu chưa resubmit → System soft-delete + notification + audit.

`AC-513` — Author resubmit đúng hạn → timer dừng và không auto-delete vì Teacher chưa xử lý.

`AC-514` — Teacher approve Round 1 → correction đóng; revision được publish sau validation/re-check cần thiết.

`AC-515` — Teacher reject Round 1 → mở đúng một Round 2 mới 72h và hiển thị `Lần chỉnh sửa cuối`.

`AC-516` — Round 2 timeout → soft-delete.

`AC-517` — Teacher reject Round 2 → soft-delete; không thể tạo Round 3.

`AC-518` — Revision đang chờ Teacher không được thay thế published revision trên board trước khi được approve.

`AC-519` — Material revision vẫn kích hoạt duplicate/review rules hiện hành.

`AC-520` — Author đang có correction mở không thể delete thường, nhưng có thể `Xin rút bài` với reason.

`AC-521` — Withdraw → soft-delete + audit + đóng correction.

`AC-522` — Teacher có `Gỡ bài` khẩn cấp, bắt buộc reason, chỉ soft-delete, gửi notification.

`AC-523` — Monitor/Student không thể emergency-remove notice người khác.

`AC-524` — Admin không có correction/report daily-operation mutation nhưng vẫn hard-delete theo FEAT-002.

`AC-525` — Reporter identity không xuất hiện trong board, author notification hoặc Student/Monitor payload.

`AC-526` — Scheduler timeout idempotent và không xử lý request đã resubmit/closed.

`AC-527` — Race giữa resubmit và timeout không tạo trạng thái mâu thuẫn.

`AC-528` — History/audit giữ đầy đủ các transition cần thiết.

`AC-529` — Soft-deleted notice ngừng nhận reaction mới và không còn trên board.

`AC-530` — Cross-class security tests PASS cho report/correction/emergency remove.

`AC-531` — Regression FEAT-001/002/003/004 PASS.

`AC-532` — System timeout soft-delete lưu retained attribution là `System`, không có fabricated human actor UUID.

`AC-533` — Admin hard-delete một notice đã System soft-delete thành công khi các điều kiện FEAT-002 khác được đáp ứng.

`AC-534` — Manual user soft-delete tiếp tục giữ đúng UUID/profile của người dùng thật.

`AC-535` — Teacher `Chưa đạt` ở Round 2 lưu Teacher decision actor trong audit nhưng deletion actor của terminal System soft-delete là `System`.

`AC-536` — Không tồn tại login-capable synthetic System account/profile được tạo chỉ để phục vụ soft-delete attribution.

`AC-537` — Existing tombstones và user deletion attribution được bảo toàn qua migration.


---

## Out of Scope

- Student thường báo sai thông tin.
- Admin xử lý report/correction thường ngày.
- Auto-ban/auto-demote Monitor.
- Public reporter identity.
- Round 3 trở lên.
- Teacher sửa notice thay tác giả.
- Hard-delete tự động.
- Thay đổi công thức thi đua.
- Email/SMS notification bên ngoài app.
- SLA/reminder riêng cho Teacher khi pending review.
- Synthetic login-capable `System` user/profile.

---

## Effort Recommendation

`ASTRA_EFFORT: MEDIUM`

Lý do:

- permission model thay đổi;
- RLS/RPC/direct API cần cập nhật;
- thêm report/correction workflow;
- scheduler/timeout;
- audit/history;
- notification;
- race-condition và state-machine testing.

---


## Preflight Resolution — B-001

`B-001: RESOLVED`

FEAT-005 adopts an explicit deletion actor model:

- human action → real user attribution;
- automation → `System` attribution.

FEAT-002 hard-delete/tombstone behavior remains in force, except that System-soft-deleted notices are explicitly valid soft-deleted notices and must not be rejected merely because there is no human deleter UUID.

No synthetic System account is permitted.


## Final Status

`STATUS: FINAL`
