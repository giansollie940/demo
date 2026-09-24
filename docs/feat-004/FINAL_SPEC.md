# FEAT-004 — Admin Báo bài: Multi-class Oversight & Subject Catalog

## Task

**Task ID:** `FEAT-004`  
**Title:** Admin Báo bài — Multi-class Oversight, Class Analytics & Grade Subject Catalog  
**Status:** `FINAL`  
**Spec Owner:** GPT-5.6 Sol High  
**Implementation Model:** GPT-6 Astra  
**ASTRA_EFFORT:** `HIGH`
**Grade-source resolution:** `FINAL` — Admin chọn grade explicit; không suy từ code/name; danh sách V1 = 6–12; existing 7A9 → grade 7.

---

## Objective

Mở rộng subsystem Báo bài từ phạm vi một lớp hoạt động sang mô hình nhiều khối/lớp ở cấp quản trị và Teacher assignment, đồng thời giữ nguyên nguyên tắc phân quyền:

- Admin giám sát nhiều khối/lớp nhưng không vận hành Báo bài hằng ngày thay Teacher;
- Teacher chỉ thao tác các lớp được phân công;
- Student/Monitor chỉ thuộc và thấy đúng lớp của mình;
- Admin xem tổng quan, tuyên dương, lịch sử, audit và thùng rác theo lớp;
- Admin quản lý danh mục môn chuẩn theo khối;
- Teacher cấu hình môn của lớp từ danh mục môn đã được Admin cho phép ở khối đó.

Task này supersede mô hình một lớp của `DEC-001` cho toàn bộ phạm vi dữ liệu/quyền liên quan đến lớp.

---

## Source of Truth

Thứ tự ưu tiên:

1. DECISIONS, gồm decision update của FEAT-004;
2. FINAL SPEC FEAT-004;
3. PROJECT_CONTEXT;
4. code/database hiện tại;
5. nội dung chat.

Các decision FEAT-002 vẫn giữ hiệu lực nếu không bị FEAT-004 supersede rõ ràng, đặc biệt:

- Teacher là operator nghiệp vụ Báo bài;
- Admin là oversight actor;
- Teacher sở hữu AI operational settings;
- Admin hard delete theo rule/tombstone FEAT-002.

---

## Current Behavior

Nguồn quyết định hiện hành `DEC-001` khóa hệ thống ở mô hình một lớp hoạt động. FEAT-002 hiện quy định Admin xem thống kê/audit của lớp hoạt động hiện tại và Teacher quản lý môn/English group của lớp đó. fileciteturn8file0 fileciteturn7file0

Astra phải khảo sát code/database hiện tại trước khi sửa vì codebase có thể đã có một phần hạ tầng multi-class/teacher assignment từ các phiên bản trước. Không được giả định chỉ từ tên bảng hoặc UI.

Nếu implementation hiện tại mâu thuẫn căn bản với FINAL SPEC hoặc cần thay business rule, trả `STATUS: BLOCKED`.

---

## Required Behavior

### RB-401 — Multi-class scope

Hệ thống chính thức hỗ trợ nhiều lớp và nhiều khối.

Mỗi lớp phải thuộc đúng một khối/grade scope hiện hành của hệ thống. Grade là dữ liệu explicit của lớp, không được suy ra từ `code` hoặc `name`.

Admin có thể chọn khối rồi chọn lớp để xem dữ liệu Báo bài.

Không yêu cầu Student/Monitor có khả năng chuyển lớp trong UI Báo bài.

### RB-402 — Actor scope

#### Admin

Admin được:

- xem tổng quan Báo bài theo toàn hệ thống, theo khối hoặc theo lớp;
- xem tuyên dương của từng lớp;
- tra cứu lịch sử hoạt động theo lớp/học sinh/thời gian/trạng thái;
- xem nhật ký quản trị/audit;
- quản lý danh mục môn chuẩn theo khối;
- hard delete từng notice đã soft-delete theo FEAT-002.

Admin không được:

- create/edit/remind/soft-delete/restore notice;
- quyết định duplicate;
- sửa AI operational settings;
- quản lý English group nghiệp vụ của lớp;
- vận hành notice thay Teacher.

#### Teacher

Teacher:

- chỉ xem/vận hành các lớp được phân công;
- có thể được phân công nhiều lớp;
- chọn lớp đang thao tác trong Báo bài khi có nhiều hơn một lớp;
- quản lý AI operational settings, môn lớp và English group trong lớp được phân công theo FEAT-002/003;
- không được xem hoặc mutate lớp không được phân công, kể cả direct API.

#### Monitor / Student

- chỉ xem dữ liệu lớp mình thuộc;
- không được đổi `class_id` để đọc/mutate lớp khác;
- giữ toàn bộ quyền Báo bài hiện hành trong phạm vi lớp mình.

### RB-403 — Admin Tổng quan

Khu `Tổng quan` của Admin có selector:

- `Khối`;
- `Lớp`.

Cho phép các phạm vi:

- toàn bộ khối/lớp;
- một khối;
- một lớp cụ thể.

Hiển thị số liệu tối thiểu:

- số notice được publish;
- số notice tuần hiện tại;
- số notice đang pending duplicate review;
- số notice đã soft-delete;
- số reaction/tim hợp lệ;
- số HS có đóng góp hợp lệ.

Số liệu phải lấy từ dữ liệu Báo bài nguồn hiện hành, không lưu một “điểm tổng” mới.

### RB-404 — Tuyên dương theo lớp

Admin có thể chọn lớp và xem:

- 🐦 Chim sẻ đưa tin;
- ⭐ Ngôi sao dẫn đường;
- 🌱 Mầm xanh đóng góp;
- số liệu đóng góp của học sinh lớp đó.

Phải giữ nguyên cách tính, điều kiện hợp lệ, đồng hạng và phạm vi thời gian của FEAT-001/002.

Không tạo leaderboard gộp nhiều lớp trong FEAT-004.

### RB-405 — Lịch sử hoạt động

Admin có trang tra cứu lịch sử Báo bài với filter tối thiểu:

- khối;
- lớp;
- học sinh/người đăng;
- khoảng thời gian;
- trạng thái notice.

Kết quả chỉ phục vụ oversight/audit.

Nếu notice đã hard-delete:

- chỉ hiển thị tombstone/redacted data đúng FEAT-002;
- không phục hồi title/content/deadline/AI raw data.

### RB-406 — Nhật ký quản trị

Admin xem audit log với filter tối thiểu:

- lớp;
- actor/người thực hiện;
- loại action;
- khoảng thời gian.

Audit phải phân biệt tối thiểu:

- create/edit notice;
- soft delete/restore;
- hard delete;
- duplicate decision;
- reminder;
- AI setting change;
- subject/class-subject change;
- English group change.

Không được mở thêm quyền mutation chỉ vì Admin xem audit.

### RB-407 — Danh mục môn chuẩn theo khối

Admin quản lý một `grade subject catalog`.

Mỗi catalog item thuộc một khối và có tối thiểu:

- tên môn;
- tên ngắn;
- icon;
- thứ tự mặc định;
- trạng thái active;
- cờ xác định môn Tiếng Anh.

Một môn có thể tồn tại ở nhiều khối dưới các catalog item riêng.

Admin được:

- thêm môn vào danh mục khối;
- sửa metadata chuẩn;
- active/inactive catalog item.

Admin không trực tiếp kích hoạt môn cho từng lớp trong flow nghiệp vụ Báo bài.

### RB-408 — Quan hệ Catalog môn → môn của lớp

Teacher quản lý `class_subjects` của lớp được phân công, nhưng chỉ từ catalog active của đúng khối của lớp.

Teacher được:

- kích hoạt một catalog subject cho lớp;
- tắt môn khỏi lớp nếu rule dữ liệu hiện hành cho phép;
- chỉnh metadata lớp được phép: `sort_order` và trạng thái active của lớp.

Teacher không được:

- tạo môn hoàn toàn mới ngoài catalog của khối;
- đổi môn lớp thành catalog item của khối khác;
- sửa tên chuẩn/tên ngắn/icon/is_english của catalog.

Nếu cần môn mới hoặc sửa metadata chuẩn, Admin phải sửa catalog khối.

### RB-409 — Mapping và lịch sử

Mỗi `class_subject` phải có quan hệ xác định với catalog subject tương ứng.

Migration phải bảo toàn các `class_subjects` hiện có:

- không xóa môn cũ;
- map sang catalog phù hợp khi có thể xác định an toàn;
- nếu không thể map deterministically, migration phải dừng hoặc tạo cơ chế review rõ ràng; không tự ghép theo suy đoán nguy hiểm.

Notice cũ phải tiếp tục tham chiếu môn hợp lệ sau migration.

### RB-410 — English subject

Catalog item có `is_english=true` tiếp tục kích hoạt rule English group hiện hành.

Teacher vẫn quản lý English group/membership trong các lớp được phân công.

Admin không quản lý English group trong FEAT-004.

### RB-411 — Admin Thùng rác

Admin có thể filter thùng rác theo khối/lớp.

Hard delete giữ nguyên FEAT-002:

- chỉ notice đã soft-delete;
- từng notice;
- irreversible;
- confirmation + reason;
- tombstone bắt buộc;
- không bulk/auto purge.

Multi-class không thay đổi dữ liệu được giữ/xóa trong tombstone.

### RB-412 — Class isolation

Mọi API/RPC/query liên quan FEAT-004 phải enforce class scope backend-side.

Không được dựa vào selector frontend.

Teacher không được đọc/mutate lớp ngoài assignment.

Student/Monitor không được đọc/mutate lớp khác.

Admin được read oversight toàn hệ thống và hard delete theo FEAT-002.

### RB-413 — Teacher class selector

Teacher được phân công một lớp:

- UI có thể tự chọn lớp đó, không bắt buộc hiển thị selector.

Teacher được phân công nhiều lớp:

- phải có class selector rõ ràng;
- đổi lớp phải reload context Báo bài theo class mới;
- không giữ hidden selection/form state từ lớp cũ nếu có thể gây mutation nhầm lớp.

### RB-414 — Admin class selector state

Khi Admin đổi khối/lớp:

- dashboard, leaderboard, history, audit và trash phải cập nhật đúng scope;
- không được giữ cached data của lớp trước như dữ liệu hiện tại;
- filter không hợp lệ phải được reset/disable rõ ràng.

### RB-415 — Canonical grade source

Grade/khối của lớp là giá trị **explicit** được Admin chọn khi tạo lớp.

FEAT-004 V1 sử dụng danh sách grade canonical cố định:

- 6
- 7
- 8
- 9
- 10
- 11
- 12

Không suy grade từ class code/name, kể cả khi tên lớp có dạng như `7A9`.

Create-class flow phải yêu cầu chọn grade từ danh sách canonical trên. Không được tạo lớp mới thiếu grade.

Trong FEAT-004, grade của lớp không được đổi qua ordinary class edit flow. Sửa/chuyển grade của một lớp đã tồn tại là **out of scope** vì có thể kéo theo remap subject catalog; cần task riêng.

### RB-416 — Existing class grade migration

Các lớp tồn tại trước FEAT-004 phải có mapping grade explicit được FINAL SPEC xác nhận trước migration.

Mapping ban đầu được chốt cho inventory hiện biết:

- class `4e0b25e4-ec47-4745-8b2b-ba91c1504254` / `7A9` → grade `7`.

Migration không được suy grade từ code/name. Mapping trên là quyết định Product cho lớp hiện hữu cụ thể, không phải derivation rule.

Trước khi mutate dữ liệu, migration/preflight phải kiểm toàn bộ class hiện có:

- nếu tất cả class có mapping explicit → được tiếp tục;
- nếu có bất kỳ class nào chưa có mapping xác nhận → migration phải abort/fail trước thay đổi dữ liệu FEAT-004 và báo `class_id`, `code`, `name` cần Product mapping.

Không cho phép partial grade migration.

---

## Actors

- `admin`
- `teacher`
- `monitor`
- `student`

---

## Permissions

| Chức năng | Admin | Teacher | Monitor | Student |
|---|:---:|:---:|:---:|:---:|
| Xem nhiều khối/lớp | ✅ oversight | Chỉ lớp assigned | ❌ | ❌ |
| Tổng quan theo khối/lớp | ✅ | Lớp assigned nếu UI có | ❌ | ❌ |
| Tuyên dương theo lớp | ✅ | Lớp assigned | ✅ lớp mình | ✅ lớp mình |
| Lịch sử toàn lớp | ✅ oversight | Lớp assigned | Theo FEAT hiện hành | Cá nhân |
| Audit | ✅ | Lớp assigned theo FEAT-002 | ❌ | ❌ |
| Quản lý catalog môn theo khối | ✅ | ❌ | ❌ | ❌ |
| Kích hoạt môn cho lớp | ❌ | ✅ lớp assigned, từ catalog | ❌ | ❌ |
| Quản lý English group | ❌ | ✅ lớp assigned | ❌ | ❌ |
| AI operational settings | ❌ sửa | ✅ lớp assigned | ❌ | ❌ |
| Hard delete | ✅ | ❌ | ❌ | ❌ |
| Duplicate decision | ❌ | ✅ lớp assigned | ❌ | ❌ |

---

## Business Rules

`BR-401` — Hệ thống hỗ trợ nhiều lớp/khối; `DEC-001` được supersede.

`BR-402` — Admin là multi-class oversight actor, không trở thành Teacher dự phòng.

`BR-403` — Teacher chỉ vận hành các lớp được phân công; assignment có thể nhiều lớp.

`BR-404` — Student/Monitor chỉ thuộc và thấy đúng lớp của mình trong Báo bài.

`BR-405` — Admin quản lý danh mục môn chuẩn theo khối.

`BR-406` — Teacher chỉ kích hoạt/configure môn lớp từ catalog active của đúng khối.

`BR-407` — Teacher không được tạo subject ngoài catalog hoặc sửa metadata chuẩn của catalog.

`BR-408` — Leaderboard/tuyên dương giữ nguyên công thức và chỉ hiển thị theo từng lớp; FEAT-004 không tạo xếp hạng liên lớp.

`BR-409` — Hard delete giữ nguyên toàn bộ rule/tombstone FEAT-002.

`BR-410` — Multi-class permission phải enforce backend/RLS/RPC/direct API, không chỉ frontend.

`BR-411` — Migration catalog/class-subject phải bảo toàn notice và subject hiện có; không map mơ hồ bằng phỏng đoán.

`BR-412` — English-group semantics không thay đổi; Teacher quản lý theo lớp assigned.

`BR-413` — Grade là explicit class attribute do Admin chọn; không infer từ class code/name. Grade V1 chỉ nhận một trong `6,7,8,9,10,11,12`.

`BR-414` — Migration existing classes chỉ dùng Product-approved explicit mapping; thiếu mapping của bất kỳ class nào thì abort trước mutation, không partial migrate.

---

## Edge Cases

`EC-401` — Teacher không có class assignment → không được vận hành Báo bài; UI hiển thị empty/permission state.

`EC-402` — Teacher có nhiều class → đổi class phải clear form/selection state có nguy cơ mutate lớp cũ.

`EC-403` — Teacher gọi API với class_id không assigned → reject.

`EC-404` — Student/Monitor sửa class_id request sang lớp khác → reject.

`EC-405` — Admin filter khối A rồi chọn class thuộc khối B bằng request giả → backend/query phải resolve scope đúng, không tin client pairing.

`EC-406` — Catalog subject inactive nhưng đang được lớp sử dụng → không được làm hỏng notice/history cũ; không cho lớp mới kích hoạt item inactive.

`EC-407` — Teacher tắt class subject đang có notice lịch sử → history vẫn đọc được; behavior tạo notice mới phải tuân rule active hiện hành.

`EC-408` — Existing class subject không map an toàn sang catalog → migration không được tự đoán.

`EC-409` — Class chuyển khối (nếu hệ thống cho phép ở nơi khác) → FEAT-004 không tự remap subject; cần flow riêng hoặc BLOCKED nếu implementation buộc xử lý.

`EC-410` — Hard-deleted notice trong history/audit multi-class → chỉ tombstone/redacted data.

`EC-411` — Admin đổi filter liên tục → không hiển thị stale result của request cũ như kết quả filter mới.

`EC-412` — Teacher assigned class bị deactivate/unassign trong lúc đang mở → mutation tiếp theo phải backend-reject và UI refresh quyền.

`EC-413` — Admin tạo class code có vẻ thuộc một grade nhưng chọn grade khác → hệ thống dùng grade explicit đã chọn; không tự sửa theo code. Naming convention không phải validation source.

`EC-414` — Preflight phát hiện class cũ ngoài mapping đã chốt → migration abort trước mutation và báo danh sách class cần Product mapping.

---

## Data Impact

Expected schema/data changes:

- grade/khối scope là explicit class attribute; nguồn canonical V1 là danh sách cố định `6–12`;
- subject catalog theo khối;
- relation từ `class_subjects` sang catalog item;
- reuse class/teacher assignment hiện có nếu phù hợp;
- index cần thiết cho multi-class dashboard/history/audit filters.

Astra quyết định schema cụ thể sau khi khảo sát code/database.

Migration phải:

- bảo toàn toàn bộ class, profile, class_subject, homework notice, reaction, history, audit hiện có;
- không reset dữ liệu;
- không xóa môn cũ;
- dùng explicit class→grade mapping, không infer từ code/name;
- áp mapping đã chốt `7A9` (`4e0b25e4-ec47-4745-8b2b-ba91c1504254`) → grade `7`;
- preflight toàn bộ classes và abort trước mutation nếu còn class chưa có mapping explicit;
- có verification cho mapping grade và mapping subject.

---

## Security Impact

Bắt buộc kiểm:

- authentication;
- Teacher-class assignment authorization;
- Student/Monitor class ownership;
- Admin oversight;
- RLS/direct API/RPC;
- privilege escalation qua forged `class_id`;
- hard-delete authorization;
- catalog mutation authorization;
- cross-class information leakage;
- cache/state leakage frontend.

Mọi `SECURITY DEFINER`/privileged RPC mới hoặc sửa phải có explicit role/class checks và grant/revoke đúng.

---

## Must Not Break

- Authentication.
- Root admin uniqueness.
- FEAT-001 duplicate/reaction/reminder/leaderboard logic.
- FEAT-002 Admin oversight/hard delete/tombstones.
- FEAT-002 Teacher AI settings.
- FEAT-003 UI behavior nếu đã triển khai.
- English-group visibility.
- Student history.
- Existing notice/history/audit.
- Registration/AI review subsystem ngoài Báo bài.
- Existing class membership/teacher assignment.

---

## Acceptance Criteria

`AC-401` — Admin có thể chọn khối/lớp và xem đúng dashboard scope.

`AC-402` — Admin xem tuyên dương từng lớp với kết quả giữ nguyên công thức hiện hành.

`AC-403` — Admin lọc history theo lớp, student, time và status.

`AC-404` — Admin lọc audit theo lớp, actor, action và time.

`AC-405` — Admin tạo/sửa/active-inactive catalog subject theo khối.

`AC-406` — Teacher chỉ thấy catalog active của đúng khối lớp assigned khi cấu hình môn lớp.

`AC-407` — Teacher có thể kích hoạt catalog subject cho lớp assigned nhưng không tạo subject ngoài catalog.

`AC-408` — Teacher không thể mutate class_subject của lớp không assigned bằng direct API.

`AC-409` — Student/Monitor không thể đọc/mutate Báo bài lớp khác bằng direct API.

`AC-410` — Admin không có action create/edit/remind/restore/duplicate-decision dù đang xem lớp cụ thể.

`AC-411` — Teacher có nhiều class có thể chuyển context và dữ liệu không leak giữa các class.

`AC-412` — Existing class_subjects được migrate/map mà không mất notice/history.

`AC-413` — Mapping mơ hồ không được tự suy đoán; migration/report phải đánh dấu cần xử lý.

`AC-414` — Inactive catalog item không thể được kích hoạt mới cho lớp, nhưng dữ liệu lịch sử cũ vẫn đọc được.

`AC-415` — English subject từ catalog vẫn enforce English-group visibility/duplicate scope.

`AC-416` — Admin trash filter theo class và hard delete vẫn đúng FEAT-002, tombstone không thay đổi.

`AC-417` — Cross-class RLS/RPC/API bypass tests PASS cho Teacher/Monitor/Student.

`AC-418` — Dashboard/history/audit queries không trả dữ liệu ngoài scope filter/class permission.

`AC-419` — Regression FEAT-001/002/BUG-001/FEAT-003 (nếu đã implemented) PASS.

`AC-420` — Migration verification chứng minh không mất class/user/notice/history/audit hiện có.

`AC-421` — Given Admin tạo class mới, when submit, then grade là trường bắt buộc và chỉ nhận một trong `6–12`; class code/name không tự sinh grade.

`AC-422` — Given class hiện hữu `7A9` ID `4e0b25e4-ec47-4745-8b2b-ba91c1504254`, when FEAT-004 migration chạy, then class được gán grade `7` từ explicit approved mapping, không từ parser của code/name.

`AC-423` — Given tồn tại class cũ chưa có explicit grade mapping, when migration preflight chạy, then migration abort trước FEAT-004 data mutation và report class cần mapping; không partial migrate.

`AC-424` — Given lớp đã có grade, when Admin dùng ordinary class edit flow, then không thể đổi grade trong FEAT-004; yêu cầu đổi grade cần flow/task riêng và không tự remap subjects.

---

## Out of Scope

- Leaderboard toàn trường/liên lớp.
- Student chuyển lớp tự phục vụ.
- Admin vận hành notice hằng ngày.
- Admin sửa AI operational settings.
- Admin quản lý English group.
- Teacher tạo catalog subject mới.
- Đồng bộ danh mục môn từ SIS/Canvas/Google Classroom.
- Auto-remap khi lớp chuyển khối.
- Admin tự thêm/xóa grade ngoài danh sách canonical `6–12` trong FEAT-004.
- Đổi grade của lớp đã tồn tại qua ordinary edit flow.
- Thay đổi công thức thi đua.
- Bulk hard delete.

---

## Effort Recommendation

`ASTRA_EFFORT: HIGH`

**Exception approved by Product Owner for FEAT-004.**

FEAT-004 được nâng từ mức MEDIUM lên HIGH vì đây là thay đổi kiến trúc và dữ liệu có rủi ro cao, gồm:

- supersede kiến trúc one-class sang multi-class;
- database schema/migration;
- mapping và bảo toàn dữ liệu cũ;
- Teacher-class authorization;
- RLS/RPC/direct API isolation;
- nguy cơ cross-class data leakage;
- multi-class query/filter;
- subject catalog migration;
- regression risk cao trên nhiều module hiện có.

Quyết định này chỉ áp dụng cho FEAT-004 và không thay đổi mức effort mặc định của WORKFLOW cho các task khác.

---

## Final Status

`STATUS: FINAL`
