# SPEC — TÍNH NĂNG “BÁO BÀI”

# 0. TASK CONTROL — FINAL SPEC

## Task

**Task ID:** `FEAT-001`  
**Title:** Tính năng Báo bài V1  
**Status:** `FINAL`  
**Spec Owner:** GPT-5.6 Sol High — Product Architect / Spec Writer  
**Implementation Model:** GPT-6 Astra  
**ASTRA_EFFORT:** `MEDIUM`  
**Ngày khóa SPEC:** 09/09/2026  
**Bổ sung quyền (Sol):** 09/09/2026 — khóa rõ `BR-023`, `BR-024`, `AC-037`, `AC-038`; không thay đổi code/database.  
**Permission Resolution (Sol):** 09/09/2026 — giải quyết hai blocker còn lại tại `BR-025`, `BR-026`, `AC-039`–`AC-042`; bản `FINAL_PERMISSION_CLARIFIED` trước đó được thay thế bởi bản này.  

### Lý do ASTRA_EFFORT: MEDIUM

Task tác động đồng thời đến:

- database schema và migration;
- Supabase RLS;
- authentication/authorization theo `student` / `monitor` / `teacher` / `admin`;
- data integrity và audit;
- Edge Function / AI duplicate detection;
- notification/reminder;
- dữ liệu thống kê, leaderboard và lịch sử.

Theo WORKFLOW, đây là nhóm thay đổi phải dùng Astra Medium.

---

## Source of Truth áp dụng

Thứ tự ưu tiên:

1. `DECISIONS`;
2. FINAL SPEC `FEAT-001`;
3. `PROJECT_CONTEXT`;
4. code/database hiện tại;
5. nội dung trao đổi trong chat.

Các quyết định ACTIVE liên quan trực tiếp gồm:

- `DEC-001`: mô hình một lớp hoạt động;
- `DEC-002`: một admin gốc;
- `DEC-003`: Teacher và Admin là hai trách nhiệm khác nhau;
- `DEC-004`: không làm phiền Admin bằng tác vụ Teacher thông thường;
- `DEC-005`: implementation không tự thay business rule;
- `DEC-006`: FINAL SPEC là hợp đồng triển khai;
- `DEC-011`: không phá dữ liệu cũ;
- `DEC-012`: database change phải có migration/đường triển khai rõ ràng;
- `DEC-013`: security không chỉ nằm ở frontend;
- `DEC-014`: bài đăng trùng không xuất hiện lại trong thông báo chung;
- `DEC-015`: bài trùng vẫn được giữ trong lịch sử học sinh;
- `DEC-016`: không tự suy ra quy tắc thi đua từ trạng thái duplicate.

Các quyết định Báo bài được đăng ký trong DECISIONS là `DEC-017` đến `DEC-032`. DEC-027–028 là quyền đã khóa; DEC-029–032 ghi nhận nguyên giá trị Product Owner xác nhận “chốt” ngày 09/09/2026.

---

## Bổ sung FINAL R3 — Product Owner đã chốt R-001

Nguồn phê duyệt: người dùng xác nhận **“chốt”** sau bảng xác nhận cả bốn quy tắc R-001 trong hội thoại ngày 09/09/2026. Đây là bản ghi quyết định của Product Owner, không phải đề xuất mới của Astra. Các mục tương ứng bên dưới áp dụng định lượng sau:

- **BR-027 / mục 21 / DEC-029:** candidate cùng class + subject + English group đúng scope + chưa xóa, `abs(new_due_at - candidate_due_at) ≤ 24 giờ`; cố định V1, không cấu hình.
- **BR-028 / mục 56 / DEC-030:** `abs(new_due_at - old_due_at) ≥ 24 giờ` bắt buộc re-check. Thay subject, English group, nhiệm vụ chính hoặc nội dung thay đổi bản chất luôn re-check.
- **BR-029 / mục 30 / DEC-031:** notice tối đa 2 reminder/rolling 24h, cách nhau tối thiểu 6h bất kể actor; actor tối đa 10 reminder/rolling 24h toàn Báo bài. Lượt bị chặn không tạo event.
- **BR-030 / mục 33–34 / DEC-032:** ≥5 pending đã chờ ≥24h; chỉ Admin opt-in backlog/all; tối đa 1 cảnh báo/24h khi còn điều kiện; dưới ngưỡng thì resolved và re-arm cho lần vượt sau.

Acceptance Criteria bổ sung (ghi lại trường hợp biên trực tiếp của các quy tắc đã duyệt):

- **AC-043:** candidate tại chênh đúng 24h đủ điều kiện deadline; lớn hơn 24h bị loại; phải đúng scope.
- **AC-044:** sửa deadline đúng 24h phải re-check; thay môn/nhóm/bản chất nhiệm vụ không được bỏ qua re-check.
- **AC-045:** backend chặn vượt từng hạn mức notice/actor/spacing; không tạo reminder event khi bị chặn.
- **AC-046:** backlog chỉ tới Admin opt-in, đúng số lượng/tuổi chờ, throttle 24h và reset/re-arm khi điều kiện thay đổi.

Yêu cầu sửa **R-005** do Sol giao ở re-review R2 vẫn giữ nguyên: error attempt không làm revision được coi là đã finalize; phải retry/reprocess được sau lỗi AI, không khôi phục publication bypass. Retry không phải quyết định duplicate mới. Mọi kết quả vẫn đi qua auth, validation và các ngưỡng duplicate đã FINAL. Bản ghi lỗi/audit không được mất.

---

## Current Behavior

Khảo sát nhanh code snapshot do người dùng bàn giao cho thấy:

- role `monitor` đã tồn tại cùng `student`, `teacher`, `admin`;
- chưa tìm thấy route/module/table/Edge Function mang nghiệp vụ Báo bài (`homework_notice*`, `class_subjects`, `english_groups`) trong các vùng `src`, `database`, `supabase`;
- vì vậy Báo bài được xem là subsystem mới, phải tích hợp nhưng không gắn nghiệp vụ trực tiếp vào module đăng ký tự học.

Astra vẫn phải khảo sát implementation và database thực tế đầy đủ trước khi sửa. Nếu phát hiện hiện trạng khác căn bản hoặc mâu thuẫn với FINAL SPEC/DECISIONS, phải trả `STATUS: BLOCKED`.

---

## Required Behavior

Required Behavior là toàn bộ nội dung từ mục 1 đến mục 64 của SPEC này, cùng các Business Rules và Acceptance Criteria được khóa bên dưới. Không được tự mở rộng V1 sang multi-class hoặc các chức năng thuộc V2.

---

## Actors

- `student` — Học sinh
- `monitor` — Cán sự
- `teacher` — Giáo viên
- `admin` — Quản trị viên

Permissions chi tiết theo mục 4 và các mục giao diện theo actor.

---

## Business Rules — Canonical IDs

`BR-001` — Mọi Báo bài phải có deadline hợp lệ; danh sách còn hạn sắp theo `due_at ASC`, bài quá hạn tách khỏi danh sách cần làm.

`BR-002` — Danh sách môn lấy động từ cấu hình của lớp hoạt động hiện tại; không hard-code trong frontend.

`BR-003` — Tiếng Anh được scope theo English group; duplicate và quyền xem phải tôn trọng đúng group áp dụng.

`BR-004` — Các actor được đăng/sửa/xóa/quản lý theo bảng phân quyền; frontend không được là lớp bảo vệ quyền duy nhất.

`BR-005` — Mỗi user tối đa một tim trên một notice; không được tự tim; reaction table là nguồn sự thật.

`BR-006` — Chỉ notice được công bố chính thức và còn hợp lệ mới được tính đóng góp.

`BR-007` — Không tạo một điểm tổng hợp chung giữa số notice và số tim.

`BR-008` — Notice bị xác định duplicate không xuất hiện trên bảng chung nhưng vẫn được giữ trong lịch sử người đăng và lịch sử quản lý.

`BR-009` — Khi duplicate với notice đã tồn tại, mặc định ưu tiên notice được công bố trước; notice mới không tự thay thế notice cũ.

`BR-010` — Candidate duplicate phải được lọc theo class, subject, English group nếu có, deadline gần/tương đương và trạng thái chưa xóa trước khi semantic AI chạy.

`BR-011` — Ngưỡng duplicate mặc định: `<70%` publish; `70–89%` pending Teacher review; `>=90%` không publish lên bảng chung và lưu lịch sử/cho phép Teacher override. Ngưỡng phải cấu hình được.

`BR-012` — Teacher là người quyết định nghiệp vụ chính đối với queue duplicate; lựa chọn `keep_both` bắt buộc có lý do. Admin có quyền hỗ trợ/override nhưng không là operator hằng ngày.

`BR-013` — Khi Teacher quyết định `keep_both`, cả hai notice được publish và đều được tính đóng góp/nhận tim theo rule bình thường.

`BR-014` — Notice pending, duplicate rejected, deleted hoặc notice không còn là bản được giữ chính thức không được tính leaderboard và không được nhận thêm reaction.

`BR-015` — Reminder gắn với notice gốc, không tạo notice mới; phải audit và rate-limit.

`BR-016` — Xóa notice dùng soft delete; lưu actor, thời điểm và lý do; restore chỉ theo quyền.

`BR-017` — Sửa nội dung làm thay đổi bản chất notice phải chạy duplicate check lại và luôn audit.

`BR-018` — Leaderboard học sinh chỉ tính `student` và `monitor`; Teacher/Admin không xuất hiện; cho phép đồng hạng.

`BR-019` — Admin mặc định chỉ nhận lỗi hệ thống của Báo bài; không nhận công việc Teacher hằng ngày trừ khi cấu hình/escalation yêu cầu.

`BR-020` — Báo bài là subsystem riêng, không nhúng trực tiếp nghiệp vụ vào module đăng ký tự học; chỉ reuse hạ tầng dùng chung khi phù hợp.

`BR-021` — AI/API key không được gọi hoặc lộ trực tiếp từ frontend; quyết định server-side phải bảo vệ bằng auth/RLS/validation phù hợp.

`BR-022` — V1 tuân thủ `DEC-001`: chỉ vận hành trên một lớp hoạt động chính; không mở rộng multi-class trong task này.

`BR-023` — Quyền **Quản lý bài của HS khác** được khóa như sau: `admin` ✅, `teacher` ✅, `monitor` ✅, `student` ❌. Quyền này phải được thực thi ở backend/RLS/authorization phù hợp, không chỉ bằng việc ẩn/hiện nút trên frontend.

`BR-024` — Quyền **Nhắc lại một thông báo** được khóa như sau: `admin` ✅, `teacher` ✅, `monitor` ✅, `student` ❌. Quyền này phải được thực thi ở backend/RLS/authorization phù hợp, không chỉ bằng việc ẩn/hiện nút trên frontend.

`BR-025` — Quyền **Xem danh sách AI nghi trùng** của `monitor` (Cán sự) trong V1 là quyền **read-only có giới hạn**:

- chỉ xem các notice đang ở trạng thái `pending_duplicate_review` thuộc **lớp hoạt động mà monitor được cấp quyền**;
- được xem các thông tin nghiệp vụ cần để nhận biết cặp bài: môn, English group nếu có, tiêu đề, nội dung, deadline, tên hiển thị/role người đăng, thời gian đăng và trạng thái `pending_duplicate_review` của bài mới; đồng thời được xem cùng nhóm thông tin cơ bản của notice đang được so sánh;
- **không được xem** exact AI similarity score, AI reason/prompt/raw response, lịch sử AI kỹ thuật, review/audit nội bộ ngoài thông tin nghiệp vụ nêu trên;
- **không được** quyết định `keep_existing`, `replace_existing`, `keep_both`, thay đổi duplicate status, override AI, hoặc thay đổi cấu hình/ngưỡng AI;
- các case đã resolve/rejected và AI history của người khác không thuộc limited queue của monitor. Lịch sử bài do chính monitor đăng vẫn tuân theo quyền Lịch sử đăng cá nhân bình thường.

`BR-026` — Quyền **Thay đổi cấu hình thi đua** trong Báo bài V1 được khóa như sau: `admin` ✅, `teacher` ❌, `monitor` ❌, `student` ❌. **V1 không có cơ chế Admin cấp/thu hồi quyền cấu hình thi đua cho Teacher.** Teacher được xem thống kê và bảng tuyên dương nhưng không được sửa cấu hình. Trong V1, Admin chỉ được thay đổi **ngưỡng đạt `🌱 Mầm xanh đóng góp`** (mặc định `3` thông báo hợp lệ, giá trị phải là số nguyên dương). Các business rules thi đua còn lại là cố định theo FINAL SPEC và không phải cấu hình runtime: điều kiện notice hợp lệ, tách số notice và số tim, không có điểm tổng, không tự tim, quy tắc duplicate/deleted/pending, đối tượng leaderboard, đồng hạng và tên ba danh hiệu.

---

## Edge Cases

`EC-001` — Notice Tiếng Anh chỉ được so duplicate trong cùng English group.

`EC-002` — Notice quá hạn không chen vào danh sách còn việc nhưng phải còn trong lịch sử theo rule.

`EC-003` — Hai học sinh/actor thả tim đồng thời không được tạo hơn một reaction cho cùng cặp `notice_id + user_id`.

`EC-004` — User không được tự tim notice của mình dù gọi API trực tiếp.

`EC-005` — Notice đang pending duplicate review không được hiển thị/bình chọn/tính thành tích trước quyết định.

`EC-006` — Khi giữ notice mới thay notice cũ, lịch sử/audit của cả hai phải được bảo toàn.

`EC-007` — Khi giữ cả hai, lý do là bắt buộc và cả hai trở thành notice hợp lệ độc lập.

`EC-008` — Notice bị soft delete không nhận reaction mới và không tiếp tục tính thành tích; restore phải khôi phục đúng trạng thái hợp lệ theo decision/audit.

`EC-009` — Hai học sinh có cùng số liệu leaderboard được đồng hạng.

`EC-010` — AI/API lỗi không được làm mất notice người dùng vừa gửi; hệ thống phải lưu trạng thái/audit phù hợp và không tự publish khi chưa qua rule cần thiết.

`EC-011` — Nếu lớp không còn Teacher phụ trách hoặc Teacher inactive, Admin chỉ được escalate theo rule hệ thống, không biến thành operator mặc định.

`EC-012` — Nếu Astra phát hiện một business behavior chưa được SPEC quyết định và không thể chọn bằng kỹ thuật thuần túy, phải `BLOCKED` thay vì tự đặt rule.

---

## Data Impact

Feature dự kiến bổ sung các dữ liệu nghiệp vụ riêng như mô tả tại mục 37–43, bao gồm subject, English group, notice, reaction, duplicate review, reminder và contribution/audit data.

Yêu cầu bắt buộc:

- bảo toàn toàn bộ dữ liệu hiện có;
- schema change triển khai bằng migration có thể kiểm tra/truy vết;
- không reset/xóa dữ liệu production;
- không dùng aggregate `total_points` làm nguồn sự thật;
- các quan hệ, unique constraints và state transitions phải bảo vệ data integrity;
- thống kê phải có thể truy ngược về dữ liệu/event nguồn.

---

## Security Impact

Astra phải kiểm tra và test tối thiểu:

- authenticated actor lấy từ session, không tin `author_id` từ client;
- ownership và class scope;
- English-group visibility;
- Teacher/Admin/Monitor authorization;
- RLS cho read/write/update/delete/restore/reaction/review;
- direct API bypass;
- privilege escalation;
- unique reaction constraint và race condition;
- server-side validation của status, duplicate score/decision và contribution eligibility;
- AI secret chỉ server-side.

---

## Must Not Break

1. Authentication.
2. Student registration.
3. AI review/approval của module đăng ký tự học hiện có.
4. Teacher review hiện có.
5. Existing notifications.
6. Student history hiện có.
7. Class membership.
8. Role/permission handling.
9. Existing stored registrations.
10. Existing production data.
11. Admin recycle-bin/audit flow nếu được reuse.

---

## Out of Scope

Out of Scope được khóa theo mục 62: chat dưới notice, upload file lớn, chấm/nộp bài, reward đổi quà, external push notification, phụ huynh, Canvas/Google Classroom sync và mọi mở rộng multi-class.

---

## Effort Recommendation

`ASTRA_EFFORT: MEDIUM`

---

## Final Status

Hai blocker permission còn lại đã được Sol giải quyết tại `BR-025`, `BR-026`, `AC-039`–`AC-042`.

`STATUS: FINAL`

Astra được phép bắt đầu implementation sau khi nhận bản SPEC này, `PROJECT_CONTEXT`, `DECISIONS` và code/database snapshot. Astra quyết định HOW nhưng không được thay WHAT.

---

**Dự án:** Ứng dụng Quản lý Tự học  
**Phiên bản tính năng:** Báo bài V1  
**Đối tượng:** Admin – Giáo viên – Cán sự – Học sinh  
**Múi giờ:** Asia/Ho_Chi_Minh  
**Phạm vi:** Frontend + Supabase Database + RLS/RPC + Edge Function AI

---

# 1. Mục tiêu

Tính năng **Báo bài** tạo một không gian chung để học sinh, cán sự và giáo viên:

- đăng bài tập cần hoàn thành;
- đăng lời nhắc học tập;
- theo dõi deadline;
- tìm thông báo theo môn;
- nhắc lại những bài sắp đến hạn;
- thả tim cho thông báo hữu ích;
- ghi nhận học sinh tích cực đóng góp;
- dùng AI phát hiện thông báo trùng;
- hạn chế việc cùng một bài tập được đăng nhiều lần.

Tính năng phải tạo cảm giác:

- sinh động;
- dễ sử dụng đối với học sinh THCS;
- có yếu tố game hóa nhẹ;
- không biến thành cuộc thi spam thông báo;
- không làm Admin hoặc GV bị quá tải thông báo.

---

# 2. Nguyên tắc thiết kế chính

1. **Thông báo gần deadline nhất được ưu tiên hiển thị trước.**
2. **Thông báo trùng không xuất hiện trên bảng chung.**
3. AI hỗ trợ phát hiện trùng nhưng những trường hợp chưa chắc chắn được GV quyết định.
4. Thông báo đăng trước được ưu tiên giữ.
5. Chỉ thông báo được công bố chính thức mới được tính đóng góp.
6. Không dùng một điểm tổng hợp chung giữa số bài đăng và số tim.
7. GV là người quản lý nội dung Báo bài chính.
8. Admin quản lý hệ thống, không phải người xử lý Báo bài hằng ngày.
9. Cán sự có quyền hỗ trợ quản lý nhưng không được thay đổi cấu hình hệ thống.
10. Môn Tiếng Anh được xử lý riêng theo nhóm/lớp trình độ.

---

# 3. Vai trò

Hệ thống tiếp tục sử dụng các role hiện tại:

- `admin`
- `teacher`
- `monitor`
- `student`

Không tạo hệ role mới chỉ dành cho Báo bài.

---

# 4. Phân quyền

| Chức năng | Admin | GV | Cán sự | HS |
|---|:---:|:---:|:---:|:---:|
| Xem Báo bài | ✅ | ✅ | ✅ | ✅ |
| Đăng Báo bài | ✅ | ✅ | ✅ | ✅ |
| Sửa bài của mình | ✅ | ✅ | ✅ | ✅ |
| Xóa bài của mình | ✅ | ✅ | ✅ | ✅ |
| Quản lý bài của HS khác | ✅ | ✅ | ✅ | ❌ |
| Nhắc lại một thông báo | ✅ | ✅ | ✅ | ❌ |
| Xem danh sách AI nghi trùng | ✅ | ✅ | ✅ Read-only `pending_duplicate_review` trong lớp; không score/reason/quyết định | ❌ |
| Quyết định cuối cùng bài trùng | ✅ | ✅ | ❌ | ❌ |
| Quản lý môn học | ✅ | ✅ | ❌ | ❌ |
| Quản lý nhóm Tiếng Anh | ✅ | ✅ | ❌ | ❌ |
| Gán HS vào nhóm Tiếng Anh | ✅ | ✅ | ❌ | ❌ |
| Xem bảng tuyên dương | ✅ | ✅ | ✅ | ✅ |
| Thay đổi cấu hình thi đua | ✅ Chỉ ngưỡng 🌱 Mầm xanh trong V1 | ❌ | ❌ | ❌ |
| Audit / khôi phục dữ liệu | ✅ | Trong phạm vi lớp | ❌ | ❌ |

## 4.1. Admin

Admin có toàn quyền kỹ thuật nhưng **không tham gia vận hành Báo bài hằng ngày**.

Admin chủ yếu:

- quản lý cấu hình;
- kiểm tra lỗi hệ thống;
- xem audit;
- khôi phục dữ liệu;
- hỗ trợ khi GV không thể xử lý;
- xử lý trường hợp vượt quyền của GV.

Admin không được đưa vào bảng thi đua học sinh.

## 4.2. Giáo viên

GV là người chịu trách nhiệm chính:

- quản lý môn;
- quản lý nhóm Tiếng Anh;
- kiểm tra bài nghi trùng;
- xóa nội dung sai;
- khôi phục;
- gửi nhắc;
- quyết định giữ/xóa bài trùng.


Trong V1, GV **không có quyền thay đổi cấu hình thi đua** và không có cơ chế được Admin cấp tạm quyền này. GV vẫn được xem thống kê/bảng tuyên dương.

## 4.3. Cán sự

Cán sự:

- đăng Báo bài;
- sửa/xóa bài phù hợp với phạm vi lớp;
- hỗ trợ nhắc bài;
- hỗ trợ duy trì bảng thông báo.

Các thao tác quản lý của cán sự phải được audit.

Đối với AI duplicate queue, Cán sự chỉ có quyền **xem read-only** các case `pending_duplicate_review` của lớp mình theo `BR-025`; không có quyền quyết định hoặc xem dữ liệu AI kỹ thuật/điểm số/lý do AI.

## 4.4. Học sinh

HS:

- xem Báo bài;
- đăng Báo bài;
- sửa/xóa bài của chính mình;
- thả tim;
- xem lịch sử đăng;
- xem thành tích cá nhân;
- xem bảng tuyên dương.

---

# 5. Danh sách môn học

Không viết cứng danh sách môn trong frontend.

GV/Admin cấu hình danh sách môn của lớp hoạt động hiện tại. V1 không mở rộng vận hành sang mô hình nhiều lớp; dữ liệu vẫn gắn `class_id` theo kiến trúc hiện có.

Ví dụ:

- Toán
- Ngữ văn
- Tiếng Anh
- KHTN
- Lịch sử & Địa lí
- Công nghệ
- Tin học
- GDCD
- ...

Mỗi môn có:

- tên;
- tên ngắn;
- icon;
- thứ tự hiển thị;
- trạng thái hoạt động;
- cờ xác định có phải môn Tiếng Anh hay không.

---

# 6. Xử lý riêng môn Tiếng Anh

## 6.1. Mô hình được chọn

Sử dụng phương án:

> **GV cấu hình nhóm/lớp Tiếng Anh và gán HS vào nhóm.**

Ví dụ:

- E1
- E2
- E3

hoặc:

- English 7A
- English 7B
- English Advanced

## 6.2. Khi đăng bài

Nếu chọn môn bình thường:

> Không xuất hiện trường nhóm Tiếng Anh.

Nếu chọn **Tiếng Anh**:

> Xuất hiện trường bắt buộc: **Lớp Tiếng Anh áp dụng**

Ví dụ:

**Môn:** Tiếng Anh  
**Lớp Tiếng Anh:** E2

## 6.3. Quyền xem

HS E2:

> chỉ thấy thông báo Tiếng Anh E2.

HS E1:

> không thấy thông báo E2.

GV:

> xem toàn bộ các nhóm.

Cán sự:

> có thể xem toàn bộ để hỗ trợ quản lý.

## 6.4. AI chống trùng

Thông báo:

> Tiếng Anh – E1

không được so là trùng trực tiếp với:

> Tiếng Anh – E2

Trùng chỉ được xét trong đúng phạm vi áp dụng.

---

# 7. Giao diện chính Báo bài

Menu mới:

**Báo bài**

Xuất hiện cho:

- GV;
- Cán sự;
- HS.

Admin có giao diện quản trị riêng.

---

# 8. Tabs môn học

Phía trên bảng Báo bài:

**Tất cả | Toán | Ngữ văn | Tiếng Anh | KHTN | Công nghệ | ...**

Danh sách tab lấy động từ `class_subjects`.

Không hard-code.

Khi HS thuộc nhóm Tiếng Anh E2, tab Tiếng Anh chỉ hiển thị bài E2.

---

# 9. Thứ tự hiển thị

Thông báo đang còn hạn:

> **Deadline gần nhất → deadline xa nhất**

Ví dụ:

1. Hạn hôm nay
2. Hạn ngày mai
3. Hạn sau 2 ngày
4. ...
5. hạn xa nhất

Thông báo quá hạn không chen vào danh sách đang cần làm.

Có thể đưa xuống phần:

**Đã quá hạn**

hoặc lịch sử.

---

# 10. Card thông báo

Một thông báo hiển thị:

- môn học;
- nhóm Tiếng Anh nếu có;
- tiêu đề;
- nội dung;
- deadline;
- thời gian còn lại;
- người đăng;
- role người đăng;
- thời gian đăng;
- số tim;
- trạng thái;
- nút thao tác theo quyền.

Ví dụ:

> **KHTN · Còn 1 ngày**  
> Hoàn thành Phiếu học tập Bài 14  
> Hạn: 20:00 · 10/09/2026  
> Nguyễn Minh Anh · Cán sự  
> ❤️ 12  
>
> 🔔 Nhắc · ...

---

# 11. Bong bóng nhập Báo bài

Sử dụng composer dạng **bong bóng / card nổi** thay vì form hành chính dài.

Trường bắt buộc:

### Môn học
Dropdown.

### Tiêu đề
Ngắn gọn.

### Nội dung
Mô tả bài tập hoặc lời nhắc.

### Hạn hoàn thành
Bắt buộc.

### Nhóm Tiếng Anh
Chỉ xuất hiện nếu môn = Tiếng Anh.

Nút:

**Đăng Báo bài**

---

# 12. Deadline

Mọi Báo bài đều phải có deadline.

Lưu dưới dạng timestamp.

UI hiển thị thêm trạng thái:

- Hôm nay
- Còn 1 ngày
- Còn 2 ngày
- Còn X ngày
- Đã quá hạn

Sắp xếp chính:

`deadline ASC`

---

# 13. Thả tim ❤️

Mỗi người dùng:

> tối đa **1 tim / 1 thông báo**.

Unique constraint:

`notice_id + user_id`

Không được:

> tự thả tim bài của chính mình.

Có thể bỏ tim sau khi đã thả.

Tổng tim không lưu thủ công trong một cột độc lập làm nguồn sự thật.

Nguồn sự thật là bảng reactions.

---

# 14. Thống kê đóng góp

Hệ thống phải thống kê được theo:

- tuần;
- từng học sinh;
- học kỳ nếu cần;
- toàn năm học.

Không reset dữ liệu khi sang tuần.

---

# 15. Danh hiệu 1 — 🐦 Chim sẻ đưa tin

Mục đích:

> tuyên dương HS tích cực đăng thông tin học tập cho lớp.

Chỉ tính **thông báo hợp lệ**.

Một bài được tính khi:

- đã công bố;
- không bị xác định là trùng;
- không bị xóa vì sai;
- có deadline hợp lệ;
- thực sự xuất hiện trên bảng chung.

Không tính:

- bài trùng;
- bài đang chờ duyệt;
- bài bị xóa;
- bài bị AI chặn;
- bài chưa được công bố.

## Bảng tuần

Ví dụ:

### 🐦 CHIM SẺ ĐƯA TIN — TUẦN 8

🥇 Minh Anh — 12 thông báo  
🥈 Gia Hân — 9 thông báo  
🥉 Hoàng Nam — 7 thông báo

---

# 16. Danh hiệu 2 — ⭐ Ngôi sao dẫn đường

Mục đích:

> tuyên dương HS có thông báo được cộng đồng đánh giá hữu ích.

Tiêu chí:

> tổng số ❤️ hợp lệ nhận được.

Ví dụ:

### ⭐ NGÔI SAO DẪN ĐƯỜNG — TUẦN 8

🥇 Gia Hân — ❤️ 32  
🥈 Minh Anh — ❤️ 27  
🥉 Khánh Linh — ❤️ 21

Không cộng điểm giả hoặc bonus.

Chỉ đếm reaction thực.

---

# 17. Danh hiệu 3 — 🌱 Mầm xanh đóng góp

Mục đích:

> khuyến khích HS mới bắt đầu tham gia.

Ngưỡng mặc định đạt khi:

> có **3 thông báo hợp lệ đầu tiên**.

Trong V1, chỉ Admin được thay đổi ngưỡng này sang một số nguyên dương khác. Teacher/Monitor/Student không được thay đổi.

Đây không phải bảng xếp hạng.

Hiển thị dạng achievement/badge.

---

# 18. Hồ sơ thành tích học sinh

Trang cá nhân có thể hiện:

> **Nguyễn Minh Anh**  
>
> 🐦 42 thông báo hợp lệ  
> ❤️ 116 tim nhận được  
>
> 🏆 Chim sẻ đưa tin  
> Top 1: 3 tuần  
> Top 3: 8 tuần  
>
> ⭐ Ngôi sao dẫn đường  
> Top 1: 2 tuần  
>
> 🌱 Mầm xanh đóng góp  
> Đạt ngày 18/09/2026

Không tạo một “điểm đóng góp tổng” giữa số bài và số tim.

---

# 19. Bảng tuyên dương

Một trang hoặc widget:

## 🌟 GÓC TUYÊN DƯƠNG

### 🐦 Chim sẻ đưa tin
Top người đăng nhiều bài hợp lệ.

### ⭐ Ngôi sao dẫn đường
Top người nhận nhiều tim.

### 🌱 Mầm xanh đóng góp
Các thành viên mới đạt mốc đóng góp.

Có bộ lọc:

- Tuần hiện tại
- Tuần khác
- Toàn năm học

---

# 20. AI chống thông báo trùng

Đây là một thành phần quan trọng của Báo bài.

Mục tiêu:

- giảm spam;
- tránh nhiều HS cùng đăng một bài;
- bảo vệ tính công bằng của bảng thi đua.

---

# 21. Phạm vi AI tìm bài trùng

Trước khi dùng AI, hệ thống lọc candidate theo:

1. cùng lớp;
2. cùng môn;
3. cùng nhóm Tiếng Anh nếu có;
4. deadline tương đương hoặc gần nhau;
5. thông báo chưa bị xóa.

Sau đó mới gửi các candidate phù hợp cho AI.

Không gửi toàn bộ lịch sử lớp vào AI.

---

# 22. Hai lớp phát hiện trùng

## Lớp 1 — Kiểm tra xác định

Hệ thống có thể phát hiện:

- tiêu đề giống hệt;
- nội dung normalized giống hệt;
- cùng môn;
- cùng deadline.

Trường hợp rõ ràng không cần tiêu tốn AI.

## Lớp 2 — AI semantic

Dùng AI để phát hiện:

> khác câu chữ nhưng cùng một nhiệm vụ.

Ví dụ:

Bài A:

> Hoàn thành PHT Bài 14.

Bài B:

> Làm xong phiếu học tập của bài số 14.

AI có thể xác định hai bài cùng ý nghĩa.

---

# 23. Ngưỡng AI

Mặc định:

### < 70%
Không coi là trùng.

→ Đăng bình thường.

### 70–89%
Có khả năng trùng.

→ Không xuất hiện trên bảng chung.

→ trạng thái:

**Chờ GV xử lý**

### ≥ 90%
Khả năng trùng rất cao.

→ không công bố lên bảng chung.

→ ưu tiên giữ bài đã đăng trước.

→ bài mới được lưu vào lịch sử người gửi.

→ GV vẫn có thể xem và override nếu cần.

Ngưỡng phải được cấu hình để có thể điều chỉnh sau này.

---

# 24. Ưu tiên thông báo có trước

Nếu AI xác định:

> bài mới trùng với bài đã tồn tại,

hệ thống mặc định:

> **giữ thông báo được công bố trước**.

Thông báo sau không thay thế tự động bài cũ.

---

# 25. Cảnh báo cho HS trước khi đăng

Khi phát hiện khả năng trùng:

> ⚠️ Có vẻ nội dung này đã được báo trước đó.

Hiển thị:

- môn;
- tiêu đề bài cũ;
- deadline;
- người đăng;
- thời gian đăng.

Nút:

**Xem thông báo đã có**

**Sửa nội dung**

Không khuyến khích tiếp tục tạo bản sao.

---

# 26. Bài trùng xuất hiện ở đâu?

Bài xác định là trùng:

### KHÔNG xuất hiện ở:

- bảng Báo bài chung;
- tab môn;
- danh sách deadline;
- bảng tuyên dương.

### CHỈ xuất hiện trong:

**Lịch sử đăng của HS**

và:

**Danh sách AI / lịch sử quản lý của GV.**

Ví dụ:

> KHTN — Hoàn thành PHT Bài 14  
> ⚠️ Trùng nội dung  
> Không được đăng  
>
> Đã có thông báo tương tự lúc 08:15.  
> Hệ thống giữ thông báo được đăng trước.

---

# 27. GV xử lý bài nghi trùng

GV có màn hình:

## BÁO BÀI CẦN XỬ LÝ

Hiển thị:

- bài mới;
- bài cũ;
- mức giống;
- lý do AI;
- người đăng;
- deadline.

GV có 3 lựa chọn:

### 1. Giữ bài cũ

Bài mới:

- không công bố;
- không tính thi đua;
- không nhận tim.

### 2. Giữ bài mới thay bài cũ

Bài mới:

- được công bố;
- được tính thi đua;
- được nhận tim.

Bài cũ chuyển trạng thái phù hợp và lưu lịch sử.

### 3. Giữ cả hai

Cả hai:

- cùng được công bố;
- cùng được tính thi đua;
- cùng nhận tim bình thường.

GV phải nhập lý do ngắn khi chọn:

> **Giữ cả hai**

Ví dụ:

- khác yêu cầu chi tiết;
- khác phần bài tập;
- khác đối tượng;
- AI nhận nhầm.

---

# 28. Quy tắc thi đua đối với bài AI

| Trạng thái | Hiện bảng chung | 🐦 Chim sẻ | ❤️ |
|---|:---:|:---:|:---:|
| Published | ✅ | ✅ | ✅ |
| Pending duplicate review | ❌ | ❌ | ❌ |
| Duplicate rejected | ❌ | ❌ | ❌ |
| Giữ bài cũ | ❌ bài mới | ❌ bài mới | ❌ |
| Giữ bài mới | ✅ bài mới | ✅ | ✅ |
| Giữ cả hai | ✅ cả hai | ✅ cả hai | ✅ |

Nguyên tắc:

> **Được công bố chính thức = được tính đóng góp.**

---

# 29. Lịch sử đăng của học sinh

Mỗi HS có:

**Lịch sử đăng**

Các trạng thái:

- ✅ Đã đăng
- 🟡 Chờ GV xử lý
- ⚠️ Trùng nội dung
- 🗑️ Đã xóa
- 🔄 Được thay thế

Bài trùng vẫn được lưu để:

- HS hiểu tại sao không được đăng;
- tránh nhập đi nhập lại;
- phục vụ audit;
- AI có thêm lịch sử tham chiếu khi cần.

---

# 30. Tính năng Nhắc 🔔

GV và Cán sự có thể nhấn:

**🔔 Nhắc**

trên thông báo.

Nhắc không tạo một Báo bài mới.

Nó tạo một sự kiện reminder gắn với bài gốc.

HS nhận nhắc trong hệ thống.

Ví dụ:

> 🔔 Nhắc bạn: Bài KHTN này còn 1 ngày đến hạn.

Mọi lần nhắc phải được ghi lịch sử.

Cần rate-limit để tránh spam.

---

# 31. Xóa thông báo

Không xóa vật lý ngay.

Sử dụng:

> **soft delete**

Lưu:

- ai xóa;
- thời gian;
- lý do.

Bài bị xóa:

- không còn hiển thị;
- không tiếp tục tính thi đua;
- không nhận thêm tim.

Admin/GV có thể khôi phục tùy quyền.

Có thể tích hợp với **Thùng rác Admin** hiện tại.

---

# 32. Admin và thông báo hệ thống

Admin **không bị bắt buộc xử lý** các Báo bài thông thường.

Admin không nhận:

- HS vừa đăng bài;
- bài sắp hết hạn;
- AI vừa phát hiện một bài nghi trùng;
- bài đang chờ GV vài giờ.

GV là người nhận các thông tin này.

---

# 33. Khi nào Admin được cảnh báo?

Admin chỉ được cảnh báo khi:

### Lỗi hệ thống

Ví dụ:

- AI API lỗi;
- database lỗi;
- Edge Function lỗi;
- quyền/RLS lỗi;
- xử lý Báo bài thất bại.

### Vấn đề tồn đọng bất thường

Ví dụ:

> một số lượng lớn bài chờ GV xử lý quá lâu.

### Không còn người chịu trách nhiệm

Ví dụ:

- lớp không có GV phụ trách;
- teacher account inactive;
- cấu hình lớp lỗi.

---

# 34. Cấu hình nhắc Admin

Có 3 mức:

### 1. Chỉ lỗi hệ thống
**Mặc định.**

### 2. Lỗi hệ thống + tồn đọng

### 3. Tất cả cảnh báo

Admin chủ động lựa chọn nếu muốn theo dõi sâu.

Nguyên tắc:

> **Admin quan sát hệ thống, không vận hành Báo bài hằng ngày.**

---

# 35. Dashboard Admin

Có thể bổ sung:

## BÁO BÀI — TÌNH TRẠNG

Ví dụ:

- 1 lớp đang hoạt động
- 126 thông báo trong năm
- 14 thông báo tuần này
- 2 bài đang chờ GV
- 0 vấn đề cần Admin can thiệp

Admin chỉ nhìn nhanh trạng thái.

---

# 36. Trang quản trị Báo bài của Admin

Tabs:

- Tổng quan
- Môn học
- Tiếng Anh
- AI trùng
- Danh hiệu
- Nhật ký

Admin không cần vào đây để duyệt bài mỗi ngày.

---

# 37. Database đề xuất

## `class_subjects`

Quản lý môn của lớp.

Các field chính:

- `id`
- `class_id`
- `name`
- `short_name`
- `icon`
- `sort_order`
- `is_english`
- `is_active`
- timestamps

---

## `english_groups`

Nhóm Tiếng Anh.

- `id`
- `class_id`
- `name`
- `school_year_id`
- `is_active`
- timestamps

---

## `english_group_members`

Gán HS vào nhóm.

- `id`
- `english_group_id`
- `student_id`
- `school_year_id`
- `joined_at`
- `left_at`

Cho phép lưu lịch sử khi HS chuyển level.

---

## `homework_notices`

Bảng chính.

Field đề xuất:

- `id`
- `class_id`
- `subject_id`
- `english_group_id`
- `author_id`
- `title`
- `content`
- `due_at`
- `status`
- `duplicate_of`
- `published_at`
- `created_at`
- `updated_at`
- `deleted_at`
- `deleted_by`
- `delete_reason`

---

# 38. Trạng thái `homework_notices`

Đề xuất:

- `published`
- `pending_duplicate_review`
- `duplicate_rejected`
- `replaced`
- `deleted`

“Quá hạn” không cần là status database.

Nó được tính từ:

`due_at < now()`

---

# 39. `homework_notice_reactions`

- `notice_id`
- `user_id`
- `created_at`

Unique:

`notice_id + user_id`

---

# 40. `homework_duplicate_reviews`

Lưu:

- bài mới;
- bài được so;
- AI score;
- AI reason;
- quyết định;
- người quyết định;
- lý do;
- thời điểm.

Decision:

- `keep_existing`
- `replace_existing`
- `keep_both`

---

# 41. `homework_notice_reminders`

Lưu:

- `notice_id`
- `sent_by`
- `sent_at`
- loại reminder;
- đối tượng.

---

# 42. `homework_contribution_events`

Ledger phục vụ audit và thống kê.

Ví dụ event:

- valid_notice_published
- notice_invalidated
- heart_received
- heart_removed
- duplicate_confirmed
- notice_restored

Không lưu một biến:

`total_points`

làm nguồn sự thật.

Thống kê được tính từ dữ liệu/event hợp lệ.

---

# 43. Thống kê theo tuần

## 🐦 Chim sẻ đưa tin

Tính:

> số thông báo hợp lệ được publish trong tuần.

## ⭐ Ngôi sao dẫn đường

Tính:

> số reaction hợp lệ mà người đăng nhận được trong tuần.

## Năm học

Tổng hợp cùng dữ liệu trong phạm vi:

`school_year_id`

---

# 44. Bình hạng khi bằng nhau

Nếu hai HS có cùng kết quả:

> cho phép đồng hạng.

Không cần tạo thuật toán phụ để ép một HS cao hơn chỉ vì thời gian.

---

# 45. Kiến trúc AI đề xuất

Không gọi AI trực tiếp từ frontend.

Luồng:

```text
Frontend
   ↓
Supabase RPC / Edge Function
   ↓
Candidate Filter
   ↓
Exact / normalized duplicate check
   ↓
AI semantic check
   ↓
Decision Engine
   ↓
Database
   ↓
Frontend result
```

API key AI không xuất hiện ở client.

---

# 46. Luồng đăng đầy đủ

```text
HS nhập Báo bài
        ↓
Validate
        ↓
Kiểm tra môn / English group / deadline
        ↓
Tìm candidate
        ↓
Exact duplicate check
        ↓
AI semantic review
        ↓
┌─────────────┬───────────────┬──────────────┐
│ <70%        │ 70–89%        │ ≥90%         │
│             │               │              │
│ Publish     │ Pending GV    │ Duplicate    │
└─────────────┴───────────────┴──────────────┘
        ↓
Cập nhật lịch sử HS
        ↓
Nếu publish → đủ điều kiện thi đua
```

---

# 47. RLS / bảo mật

HS không được tự truyền:

- `author_id` của người khác;
- `published` giả;
- `duplicate score`;
- kết quả review;
- số tim.

Backend lấy người dùng từ authenticated session.

Student chỉ thao tác trong lớp của mình.

Teacher chỉ quản lý lớp mình phụ trách.

Monitor chỉ quản lý phạm vi lớp được cấp.

Admin có quyền toàn hệ thống.

---

# 48. Audit

Các thao tác quan trọng phải lưu audit:

- đăng bài;
- sửa;
- xóa;
- restore;
- AI đánh dấu trùng;
- GV giữ/xóa;
- giữ cả hai;
- nhắc;
- thay đổi môn;
- thay đổi nhóm Tiếng Anh;
- thay đổi cấu hình AI.

---

# 49. Không tính GV/Admin vào thi đua

GV/Admin có thể đăng Báo bài.

Bài vẫn:

- hiển thị;
- nhận tim nếu hệ thống cho phép;
- có deadline bình thường.

Nhưng:

> GV/Admin **không xuất hiện trong leaderboard học sinh**.

Leaderboard chỉ dành cho:

- `student`
- `monitor`

---

# 50. Thiết kế UI

Phong cách phải đồng nhất với giao diện hiện tại trong codebase được bàn giao:

- banner;
- icon;
- artwork;
- card bo tròn;
- màu môn học;
- badge trạng thái;
- responsive mobile.

Báo bài nên có visual riêng trong hệ:

`PageArtwork + PageBannerArt`

---

# 51. Giao diện HS

Có:

- banner Báo bài;
- tab môn;
- bong bóng đăng;
- danh sách deadline;
- ❤️;
- lịch sử đăng;
- thành tích;
- góc tuyên dương.

Không hiện queue AI của người khác.

---

# 52. Giao diện Cán sự

Như HS, cộng thêm:

- quản lý;
- xóa;
- nhắc;
- hỗ trợ xem toàn bộ nhóm Tiếng Anh.

Không có quyền cấu hình hệ thống.

---

# 53. Giao diện GV

Có:

- tất cả thông báo;
- tab môn;
- nhóm Tiếng Anh;
- đăng;
- xóa;
- nhắc;
- queue AI;
- quản lý môn;
- quản lý nhóm Tiếng Anh;
- thống kê;
- bảng tuyên dương.

---

# 54. Giao diện Admin

Không đưa Báo bài thành một hàng công việc cần duyệt.

Admin thấy:

- health/status;
- cấu hình;
- audit;
- AI system health;
- các vấn đề escalate.

---

# 55. Các nguyên tắc chống game hóa sai

Không cho phép:

- tự tim bài mình;
- đăng lại bài trùng để tăng số lượng;
- bài bị xóa vẫn tính thành tích;
- bài pending được tính;
- bài AI rejected được tính;
- sửa nội dung sau khi publish thành một bài hoàn toàn khác mà không audit.

---

# 56. Quy tắc sửa bài sau khi công bố

Nếu sửa nhỏ:

- typo;
- diễn đạt;
- bổ sung chi tiết không thay đổi bản chất;

→ giữ bài.

Nếu sửa:

- môn;
- nhiệm vụ chính;
- nhóm Tiếng Anh;
- deadline thay đổi lớn;
- nội dung thay đổi bản chất;

→ nên chạy kiểm tra duplicate lại.

Lưu `updated_at` và audit.

---

# 57. Tiêu chí nghiệm thu — Core

Tính năng đạt yêu cầu khi:

AC-001: HS có thể đăng Báo bài.
AC-002: Deadline bắt buộc.
AC-003: Thông báo sắp theo deadline gần → xa.
AC-004: Có tab môn động.
AC-005: GV quản lý môn.
AC-006: Tiếng Anh có group riêng.
AC-007: HS chỉ thấy đúng English group của mình.
AC-008: Có ❤️ một người/một bài.
AC-009: Không tự tim bài mình.
AC-010: Có lịch sử đăng.

---

# 58. Tiêu chí nghiệm thu — AI

AC-011: Hệ thống kiểm tra trùng trước khi publish.
AC-012: Bài nghi trùng không xuất hiện bảng chung.
AC-013: Bài trùng xuất hiện trong lịch sử người đăng.
AC-014: Bài đăng trước được ưu tiên.
AC-015: GV xem được bài nghi trùng.
AC-016: GV có `Giữ bài cũ`.
AC-017: GV có `Giữ bài mới`.
AC-018: GV có `Giữ cả hai`.
AC-019: Giữ cả hai bắt buộc ghi lý do.
AC-020: Bài được giữ cả hai đều được tính thi đua.

---

# 59. Tiêu chí nghiệm thu — Gamification

AC-021: Có 🐦 Chim sẻ đưa tin.
AC-022: Có ⭐ Ngôi sao dẫn đường.
AC-023: Có 🌱 Mầm xanh đóng góp.
AC-024: Bảng tuần hoạt động.
AC-025: Xem được dữ liệu năm học.
AC-026: Bài trùng không tính đóng góp.
AC-027: Bài bị xóa không tính.
AC-028: GV/Admin không nằm trong leaderboard.
AC-029: Tim được tính từ reaction thật.
AC-030: Không có điểm tổng giả tạo.

---

# 60. Tiêu chí nghiệm thu — Admin

AC-031: Admin không nhận thông báo Báo bài hằng ngày mặc định.
AC-032: Admin mặc định chỉ nhận lỗi hệ thống.
AC-033: Có lựa chọn mức cảnh báo.
AC-034: Admin xem được trạng thái hệ thống.
AC-035: Có audit.
AC-036: Có khả năng restore phù hợp với hệ thống Thùng rác hiện tại.

# 60A. Tiêu chí nghiệm thu — Hai quyền được khóa bổ sung

AC-037: Với quyền **Quản lý bài của HS khác**: Admin, GV và Cán sự thực hiện được trong phạm vi quyền/lớp hợp lệ; HS không thực hiện được, kể cả qua gọi API trực tiếp.

AC-038: Với quyền **Nhắc lại một thông báo**: Admin, GV và Cán sự thực hiện được trong phạm vi quyền/lớp hợp lệ; HS không thực hiện được, kể cả qua gọi API trực tiếp.


AC-039: Given một user role `monitor` thuộc lớp hoạt động, When mở danh sách AI nghi trùng, Then chỉ nhận/xem các case `pending_duplicate_review` thuộc lớp đó với đúng nhóm trường nghiệp vụ được nêu tại `BR-025`; không nhận exact AI score, AI reason/raw AI data hoặc AI/audit history ngoài phạm vi.

AC-040: Given user role `monitor`, When cố gọi trực tiếp API/RPC để quyết định duplicate, đổi duplicate status, override AI hoặc sửa cấu hình/ngưỡng AI, Then backend từ chối thao tác; việc ẩn nút frontend không được xem là đủ.

AC-041: Given user role `teacher`, When truy cập Báo bài V1, Then Teacher xem được thống kê/bảng tuyên dương nhưng không thể thay đổi cấu hình thi đua và không tồn tại cơ chế cấp/thu hồi quyền này cho Teacher trong V1; direct API attempt phải bị backend từ chối.

AC-042: Given user role `admin`, When thay đổi cấu hình thi đua V1, Then chỉ ngưỡng `🌱 Mầm xanh đóng góp` được phép thay đổi, giá trị phải là số nguyên dương; các business rules thi đua cố định khác trong FINAL SPEC không thể bị sửa qua cấu hình runtime.

---

# 61. Quyết định đã chốt

### Danh sách môn
**Phương án A:** GV cấu hình.

### Tiếng Anh
Có group riêng và gán HS vào group.

### AI
Phát hiện trùng trước khi công bố.

### Bài trùng
Không hiện bảng chung.

### Bài trùng của HS
Vẫn hiện trong Lịch sử đăng cá nhân.

### Ưu tiên
Giữ bài được đăng trước.

### Giữ cả hai
Được tính thi đua bình thường.

### Tim
Một người/một bài, không tự tim.

### Thi đua
Tách số bài và số tim.

### Danh hiệu
🐦 **Chim sẻ đưa tin**  
⭐ **Ngôi sao dẫn đường**  
🌱 **Mầm xanh đóng góp**

### Admin
Không phải người xử lý Báo bài hằng ngày.

### GV
Là người chịu trách nhiệm xử lý chính.

---

# 62. Phạm vi V1

V1 tập trung vào:

- Báo bài;
- deadline;
- môn;
- English groups;
- tim;
- leaderboard;
- achievement;
- reminder;
- AI duplicate;
- lịch sử;
- quản lý GV;
- system oversight Admin.

Chưa cần mở rộng ngay sang:

- chat dưới mỗi bài;
- upload file lớn;
- chấm điểm bài tập;
- nộp bài trực tiếp;
- điểm thưởng đổi quà;
- push notification bên ngoài app;
- phụ huynh;
- đồng bộ Canvas/Google Classroom.

Các phần này có thể là V2 sau khi Báo bài V1 ổn định.

---

# 63. Kiến trúc chức năng tổng thể

```text
                    BÁO BÀI
                       │
        ┌──────────────┼───────────────┐
        │              │               │
      Nội dung       Cộng đồng        Quản lý
        │              │               │
   Môn học           ❤️ Tim           GV
   Deadline          🐦 Chim sẻ        Cán sự
   English group     ⭐ Ngôi sao       Admin
   Reminder          🌱 Mầm xanh      Audit
        │              │               │
        └──────────────┼───────────────┘
                       │
                  AI CHỐNG TRÙNG
                       │
             ┌─────────┼─────────┐
             │         │         │
           <70%     70–89%      ≥90%
             │         │         │
          Publish     GV       Không đăng
                       │
              ┌────────┼─────────┐
              │        │         │
          Giữ cũ    Giữ mới   Giữ cả hai
```

---

# 64. Kết luận kiến trúc

“Báo bài” phải là một subsystem riêng nhưng tích hợp với:

- `classes`;
- `profiles`;
- `school_years`;
- role hiện tại;
- audit log;
- notification system;
- Admin recycle bin;
- AI infrastructure hiện có.

Không gắn logic Báo bài trực tiếp vào module đăng ký tự học.

Hai chức năng có thể dùng chung:

- user;
- class;
- school year;
- AI infrastructure;
- notification framework;

nhưng dữ liệu nghiệp vụ phải tách riêng để tránh làm module đăng ký tự học ngày càng phức tạp.