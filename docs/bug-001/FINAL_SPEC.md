# BUG-001 — Fix Báo bài navigation + Owl context + composer wording

**Task ID:** `BUG-001`
**Title:** Fix Admin access, Wise Owl context, and Báo bài composer wording
**Status:** `FINAL`
**ASTRA\_EFFORT:** `MEDIUM`

---

## Objective

Khắc phục ba lỗi frontend của FEAT-001 R3:

1. Admin có menu và route Báo bài nhưng bị router guard đẩy về `/admin`.
2. Cú Thông Thái không nhận diện `/homework` như một context riêng và không biết tab con đang mở, dẫn tới lời nhắc/fallback thuộc Dashboard hoặc Đăng ký tự học trong khi người dùng đang ở Báo bài.
3. Composer tạo Báo bài mới hiển thị nhãn “Gửi lời nhắc cho lớp”, gây nhầm giữa hành động **Đăng Báo bài** và **🔔 Nhắc** một notice đã công bố.

Task này chỉ sửa hành vi frontend/routing/context. Không thay đổi business rule FEAT-001, database schema, RLS, RPC hoặc Edge Function.

---

## Current Behavior

### CB-001 — Admin route bị chặn

`src/app/router/routes.ts` khai báo `/homework` cho `student`, `monitor`, `teacher`, `admin`.
`src/features/navigation/navigation.ts` cũng hiển thị mục **Quản trị Báo bài** trỏ tới `/homework` cho Admin.
Nhưng `src/app/router/index.ts` hiện redirect mọi Admin route ngoài `/admin` và `/settings` về `/admin`. Vì vậy Admin không thể vào `/homework` dù route metadata cho phép.

### CB-002 — Cú không có handler cho `homework`

`src/components/owl/WiseOwl.vue` chỉ truyền `route.path` vào `buildOwlContextMessages()`.
`src/features/owl/owl-model.ts` chuyển `/homework` thành route `homework`, nhưng không có nhánh xử lý `route === 'homework'`. Teacher/Admin rơi vào fallback Dashboard.
Với Student/Monitor, các message từ schedule/registration và monitor class support được thêm trước khi route-specific logic chạy, nên trên `/homework` vẫn có thể xuất hiện lời nhắc thuộc module Đăng ký tự học.

### CB-003 — Cú không biết tab con Báo bài

`src/pages/HomeworkPage.vue` giữ tab hiện tại bằng state nội bộ `tab` với các giá trị:

- `overview`
- `board`
- `history`
- `awards`
- `queue`
- `subjects`
- `english`
- `trash`
- `audit`
- `settings`

State này hiện không được cung cấp cho Wise Owl/context provider.

### CB-004 — Nhãn composer sai nghĩa

Composer tạo notice mới hiện ghi **“✏️ Gửi lời nhắc cho lớp”**, trong khi submit thực tế là tạo/đăng Báo bài.
Hành động reminder thật nằm riêng trên notice đã `published` với nút **🔔 Nhắc**.

---

## Required Behavior

### RB-001 — Admin được vào Báo bài

Admin phải truy cập được `/homework` bằng menu và direct URL khi đã authenticated.
Router guard vẫn phải chặn Admin khỏi các route không được phép. Không được sửa theo hướng “Admin được vào mọi route”.

### RB-002 — `/homework` là context riêng của Cú

Khi route hiện tại là `/homework`, Cú phải nhận diện đây là **Báo bài**, không được fallback thành Dashboard, Đăng ký tự học, Review hoặc Tracking.

### RB-003 — Cú phải nhận biết tab con Báo bài

Context provider của Cú phải nhận được tab Báo bài hiện tại để message page-context phù hợp với tab đang mở.
Các tab cần phân biệt trong V1:

- `overview`
- `board`
- `history`
- `awards`
- `queue`
- `subjects`
- `english`
- `trash`
- `audit`
- `settings`

Nếu một actor không có quyền thấy một tab thì Cú cũng không được tạo context như thể actor đang ở tab đó.

### RB-004 — Không trộn reminder của module khác trong context Báo bài

Trong `/homework`, Cú không được tạo `page` hoặc `urgent` message lấy từ Registration/Review/Tracking/Schedule state như thể đó là nội dung của Báo bài.
Nếu chưa có dữ liệu Báo bài phù hợp để tạo lời nhắc chi tiết, Cú phải dùng message trung tính thuộc ngữ cảnh Báo bài hoặc tip/quote hiện có, thay vì fallback sang Dashboard/Đăng ký tự học.
Ngoài `/homework`, hành vi Cú hiện có của Registration/Review/Tracking/Schedule phải được giữ nguyên.

### RB-005 — Phân biệt Publish và Reminder

Khi tạo notice mới, tiêu đề composer phải là **“Đăng Báo bài”** hoặc wording tương đương có nghĩa rõ là tạo Báo bài, không dùng từ “Nhắc”.
Khi sửa notice, tiêu đề tiếp tục là **“Sửa Báo bài”**.
Nút **🔔 Nhắc** trên notice đã công bố vẫn là hành động reminder riêng, không thay đổi business rule, permission hoặc RPC behavior của FEAT-001.

---

## Actors

- Student
- Monitor
- Teacher
- Admin

---

## Business Rules

`BR-B001`: Admin được truy cập `/homework` vì FEAT-001 đã cấp quyền Báo bài cho Admin; việc này không đồng nghĩa Admin được truy cập mọi route Teacher/Student.
`BR-B002`: Khi người dùng đang ở `/homework`, Cú phải dùng context Báo bài, không fallback sang Dashboard hoặc context Đăng ký tự học.
`BR-B003`: Context Báo bài của Cú phải phản ánh tab con hiện đang được chọn và không được giả định tab actor không có quyền truy cập.
`BR-B004`: Trong `/homework`, message của Cú không được lấy từ flow Registration/Review/Tracking/Schedule như một lời nhắc thuộc Báo bài.
`BR-B005`: **Đăng Báo bài** và **🔔 Nhắc** là hai hành động nghiệp vụ khác nhau; UI không được dùng wording khiến hai hành động bị hiểu là một.
`BR-B006`: Task không thay đổi permission, rate limit, duplicate logic, leaderboard, RLS, RPC hoặc dữ liệu của FEAT-001.

---

## Permissions

### Student

- Được vào `/homework` như hiện tại.
- Chỉ nhận context Cú cho các tab Báo bài Student được phép thấy.
- Không được có thêm quyền Reminder hoặc management.

### Monitor

- Được vào `/homework` như hiện tại.
- Chỉ nhận context Cú cho các tab Monitor được phép thấy.
- Reminder permission giữ nguyên FEAT-001.

### Teacher

- Được vào `/homework` như hiện tại.
- Nhận context Cú phù hợp các tab Teacher được phép thấy.

### Admin

- Phải vào được `/homework`.
- Vẫn bị chặn khỏi route ngoài danh sách quyền của Admin.
- Việc sửa router không được biến Admin thành actor mặc định của các workflow Teacher.

---

## Edge Cases

`EC-B001`: Admin nhập trực tiếp URL/hash `/homework` sau khi login → phải ở lại `/homework`, không redirect `/admin`.
`EC-B002`: Admin vào `/dashboard` hoặc route Student/Teacher không được cấp → vẫn redirect theo guard hiện hành.
`EC-B003`: User chuyển nhanh giữa `/homework` và route khác → Cú phải reset context đúng route mới, không giữ message page-context cũ.
`EC-B004`: User đổi tab Báo bài mà route path không đổi → Cú vẫn phải nhận biết tab mới và reset page-context.
`EC-B005`: Tab hiện tại không hợp lệ sau khi role/context đổi → không phát message cho tab không còn được phép; UI phải rơi về tab hợp lệ theo behavior hiện có hoặc implementation an toàn tương đương.
`EC-B006`: Không có dữ liệu Báo bài hoặc load đang lỗi → Cú không fallback sang Dashboard/Registration; dùng message Báo bài trung tính/tip/quote.
`EC-B007`: Composer tạo mới và composer sửa dùng đúng wording; nút Reminder trên card không bị đổi tên thành Publish.

---

## Data Impact

`NONE`.
Không migration. Không schema change. Không cập nhật dữ liệu hiện có.

---

## Security Impact

- Router guard phải tiếp tục enforce navigation theo role metadata/allow-list phù hợp.
- Không được sửa bằng cách bỏ toàn bộ Admin restriction.
- Backend/RLS FEAT-001 không thay đổi và vẫn là nguồn enforce permission dữ liệu.
- Owl context không được làm lộ tab/context mà actor không có quyền sử dụng.

---

## Must Not Break

- Authentication/bootstrap.
- Student/Monitor/Teacher access hiện có.
- Admin access `/admin` và `/settings`.
- Admin restriction đối với route không được cấp.
- FEAT-001 Homework API/RPC/RLS.
- Reminder action và rate limit.
- Registration/AI review Owl behavior khi người dùng ở các route tương ứng ngoài `/homework`.
- Existing navigation ordering.
- Homework tab permissions.

---

## Acceptance Criteria

`AC-B001`
**Given** user role = Admin và đã authenticated
**When** mở `/homework` từ sidebar hoặc direct URL
**Then** router render `HomeworkPage` và không redirect về `/admin`.
`AC-B002`
**Given** user role = Admin
**When** mở một route không có Admin trong role metadata/allow-list
**Then** route vẫn bị từ chối/redirect; fix không cấp quyền route rộng hơn.
`AC-B003`
**Given** bất kỳ actor hợp lệ đang ở `/homework`
**When** Cú tạo context message
**Then** không có fallback message dạng Dashboard/Registration/Review/Tracking/Schedule cho page-context Báo bài.
`AC-B004`
**Given** Student hoặc Monitor đang ở `/homework`
**When** legacy registration state có missing registration, needs-revision hoặc session sắp bắt đầu
**Then** các message đó không được chèn như message của context Báo bài.
`AC-B005`
**Given** Teacher/Admin đang ở `/homework` và có registration đang chờ xử lý
**When** Cú tạo context
**Then** context Báo bài không fallback thành Dashboard hoặc Review registration.
`AC-B006`
**Given** người dùng đang ở `/homework`
**When** đổi giữa các tab Báo bài
**Then** Cú nhận được tab mới và page-context được reset/cập nhật dù `route.path` không đổi.
`AC-B007`
**Given** actor không có quyền vào một tab Báo bài
**When** Cú xây context
**Then** không tạo message như thể actor đang ở tab bị cấm.
`AC-B008`
**Given** người dùng mở composer tạo notice mới
**Then** tiêu đề thể hiện rõ **Đăng Báo bài**, không dùng wording **Gửi lời nhắc**.
`AC-B009`
**Given** người dùng sửa notice
**Then** tiêu đề composer là **Sửa Báo bài**.
`AC-B010`
**Given** notice đã `published` và actor có quyền reminder
**When** bấm **🔔 Nhắc**
**Then** action reminder hiện có vẫn được dùng; không chuyển thành create/publish notice.
`AC-B011`
Automated regression test phải bao phủ ít nhất:

1. Admin `/homework` allowed.
2. Admin route không được cấp vẫn blocked.
3. Owl `/homework` không fallback Dashboard/Registration.
4. Owl reset khi đổi homework sub-tab.
5. Composer create wording khác Reminder wording.

`AC-B012`
Existing FEAT-001 tests, regression tests, typecheck và build phải PASS sau fix.

---

## Out of Scope

- Thay đổi database/RLS/RPC/Edge Function.
- Thay đổi logic duplicate/AI.
- Thay đổi reminder rate-limit.
- Viết lại toàn bộ Wise Owl architecture.
- Thêm notification mới cho Báo bài.
- Thay đổi nội dung leaderboard/achievement.
- Cho Admin truy cập thêm các route ngoài `/homework`.
- Refactor navigation/router ngoài phần cần thiết để sửa bug.

---

## Effort Recommendation

`ASTRA_EFFORT: MEDIUM`
Lý do: code change chủ yếu frontend nhưng chạm role-based navigation/authorization behavior và shared global Owl context; cần regression kỹ để không nới quyền Admin hoặc làm hỏng context các route khác.

---

## Final Status

`STATUS: FINAL`
Astra được phép bắt đầu implementation theo workflow sau khi nhận:

- `BUG-001_FINAL_SPEC.md`
- PROJECT\_CONTEXT
- DECISIONS hiện hành
- source R3 hiện tại

Astra không được thay business rule FEAT-001 hoặc sửa database trong task này.