# FEAT-003 — Báo bài: AI Settings UX + English Group Assignment UX

**Task ID:** FEAT-003  
**Title:** Cải thiện giao diện Cài đặt AI và quản lý nhóm Tiếng Anh  
**Status:** FINAL  
**ASTRA_EFFORT:** LOW

---

## Objective

Cải thiện trải nghiệm của Teacher khi:

1. cấu hình AI duplicate trong Báo bài;
2. xem và quản lý các nhóm Tiếng Anh;
3. tìm, sắp xếp, chọn nhiều học sinh và gán sang nhóm;
4. thao tác thuận tiện trên desktop lẫn mobile;
5. cải thiện bố cục, card, nút và trạng thái tương tác để giao diện rõ ràng, đẹp và nhất quán hơn.

Task này là UI/UX refinement. Không thay đổi business rule, permission matrix, RLS, AI threshold semantics, duplicate behavior hoặc dữ liệu lịch sử của English group.

---

## Current Behavior

FEAT-002 đã chốt:

- Teacher là actor vận hành Báo bài;
- Teacher được sửa `semantic_duplicate_enabled`, `duplicate_review_threshold`, `duplicate_auto_threshold`;
- Student/Monitor/Admin không được sửa AI operational settings;
- Teacher quản lý English group và gán học sinh;
- FEAT-001/002 đã có backend/data model cho `english_groups` và `english_group_members`.

Chi tiết layout hiện tại của UI phải được Astra khảo sát trước khi sửa.

Nếu backend hiện tại không hỗ trợ thao tác gán nhóm theo semantics hiện hành mà UI này cần, Astra phải reuse API hiện có hoặc báo `BLOCKED` nếu bắt buộc thay business rule.

---

## Required Behavior

### RB-301 — AI Settings layout

Teacher thấy một panel Cài đặt AI rõ ràng gồm:

1. công tắc `Bật AI phát hiện trùng theo ngữ nghĩa`;
2. hai ô ngưỡng đặt cạnh nhau trên desktop:
   - `Chờ GV từ (%)`
   - `Xác định trùng từ (%)`
3. trên mobile hai ô được phép xếp dọc;
4. thanh trực quan 0–100 thể hiện ba vùng:
   - từ 0 đến dưới ngưỡng dưới: `Đăng bình thường`;
   - từ ngưỡng dưới đến dưới ngưỡng trên: `Chờ GV`;
   - từ ngưỡng trên đến 100: `Xác định trùng`;
5. thanh màu cập nhật ngay khi Teacher thay đổi giá trị hợp lệ trong form;
6. nút `Lưu cài đặt`;
7. trạng thái lưu dễ nhận biết:
   - `Chưa lưu thay đổi`;
   - `Đang lưu…`;
   - `Đã lưu`;
   - lỗi lưu có thông báo rõ ràng.

Không thay đổi semantic của threshold hiện hành.

### RB-302 — Validation AI Settings

UI phải phản ánh đúng backend constraints hiện hành:

- integer;
- `0 <= lower < upper <= 100`.

Nếu input không hợp lệ:

- không gửi save request;
- hiển thị lỗi cạnh vùng input;
- không hiển thị trạng thái `Đã lưu`.

Tắt semantic AI không thay đổi exact/normalized duplicate detection.

### RB-303 — English group cards

Teacher thấy các nhóm Tiếng Anh dưới dạng card/chip rõ ràng.

Mỗi group card hiển thị tối thiểu:

- tên nhóm, ví dụ `E1`, `E3`;
- số thành viên đang thuộc nhóm theo dữ liệu active membership hiện hành.

Click/tap một card:

- chọn group;
- hiển thị danh sách thành viên tương ứng;
- trạng thái card đang chọn phải rõ.

Không thay đổi dữ liệu chỉ vì chọn card.

### RB-304 — Student assignment table

Khu vực quản lý thành viên hiển thị bảng/list với tối thiểu ba cột:

- `Mã đăng nhập`;
- `Họ tên`;
- `Nhóm hiện tại`.

Mỗi student row có checkbox.

Teacher có thể:

- chọn một HS;
- chọn nhiều HS;
- chọn tất cả các HS đang hiển thị sau filter/search.

UI phải hoạt động tốt trên mobile; có thể chuyển bảng thành stacked rows/cards nhưng vẫn giữ đủ ba trường dữ liệu.

### RB-305 — Batch assignment

Khi Teacher đã chọn ít nhất một HS:

- hiển thị control `Chuyển vào nhóm`;
- Teacher chọn một group đích;
- thực hiện gán bằng semantics backend hiện hành;
- UI refresh membership sau khi hoàn tất;
- thành công/thất bại phải có feedback.

Task này không tạo business rule mới về membership. Implementation phải giữ nguyên lịch sử `joined_at/left_at` và semantics hiện có của FEAT-001/002.

Nếu một số HS thành công và một số thất bại khi frontend phải thực hiện nhiều request, UI phải báo rõ kết quả từng phần hoặc tổng hợp số thành công/thất bại; không được báo toàn bộ thành công khi có request fail.

### RB-306 — Search

Teacher có ô tìm kiếm.

Search phải match:

- mã đăng nhập;
- họ tên.

Search:

- case-insensitive;
- trim khoảng trắng đầu/cuối;
- không làm thay đổi dữ liệu.

### RB-307 — Sort

Mặc định danh sách HS sắp xếp:

`Mã đăng nhập — tăng dần`.

Teacher có thể đổi sort:

1. Mã đăng nhập;
2. Họ tên;
3. Nhóm hiện tại.

Khi sort theo tên hoặc nhóm, hướng mặc định tăng dần.

Astra được quyết định UI control phù hợp: dropdown hoặc header sortable.

### RB-308 — Filter chưa có nhóm

Có filter:

`Chưa có nhóm`.

Khi bật:

- chỉ hiển thị HS mà backend/view-model hiện hành xác định chưa có active English group;
- search và sort vẫn áp dụng trên tập kết quả đã filter.

### RB-309 — Selection behavior

Selection phải có hành vi predictable:

- search/sort không được âm thầm gán/xóa membership;
- khi một selected student bị ẩn vì filter/search, student đó không được tự động bị gán nếu UI không còn thể hiện rõ rằng họ vẫn đang được chọn;
- implementation ưu tiên clear selection khi filter/search làm thay đổi tập visible, hoặc cung cấp selected-state rõ ràng nếu giữ selection.

Astra chọn một trong hai pattern, nhưng không được tạo hidden selection gây batch assignment ngoài ý muốn.

### RB-310 — Drag and drop

Drag-and-drop là **progressive enhancement**, không phải cách duy nhất.

Desktop có thể hỗ trợ kéo HS vào group card nếu:

- reuse cùng permission/action với click/batch assignment;
- có visual feedback;
- thất bại được báo rõ.

Mobile và accessibility không phụ thuộc drag/drop.

Click/checkbox + chọn group đích là flow bắt buộc và luôn khả dụng.


### RB-311 — UI polish và visual hierarchy

Giao diện FEAT-003 phải có bố cục trực quan, đẹp và nhất quán với V9 hiện tại.

Các khu vực chính phải được tách thành card/khung rõ ràng:

1. `Cài đặt AI`;
2. `Nhóm Tiếng Anh`;
3. `Danh sách học sinh`;
4. `Thanh thao tác gán nhóm`.

Mỗi card/khung phải có:

- tiêu đề rõ;
- mô tả ngắn khi cần;
- khoảng trắng thoáng;
- bo góc đồng nhất;
- viền hoặc đổ bóng nhẹ để tạo phân tầng;
- không để nhiều khung cạnh tranh thị giác ngang nhau.

### RB-312 — Button hierarchy

Nút thao tác phải có phân cấp thị giác:

- **Primary**: hành động chính như `Lưu cài đặt`, `Chuyển vào nhóm`;
- **Secondary**: hành động phụ như `Bỏ chọn`, `Làm mới`;
- **Tertiary/Ghost**: hành động nhẹ như `Xem chi tiết`, `Hủy`.

Nút phải:

- đủ lớn để thao tác trên mobile;
- có icon nếu giúp tăng khả năng nhận biết;
- có trạng thái `hover / active / disabled / loading / success` phù hợp;
- không để quá nhiều nút cùng có mức nhấn mạnh như nhau trên một hàng.

### RB-313 — AI Settings visual layout

Khung `Cài đặt AI` nên có bố cục:

1. dòng đầu: tiêu đề + toggle bật/tắt AI semantic duplicate;
2. dòng hai: hai ô threshold đặt cạnh nhau trên desktop;
3. dòng ba: thanh minh họa ba vùng;
4. dòng cuối: save-state + nút `Lưu cài đặt`.

Hai ô threshold cần:

- nhãn ngắn, dễ đọc;
- helper text hoặc mô tả ngắn khi cần;
- khoảng cách rõ ràng;
- không gây hiểu nhầm về ý nghĩa hai mốc.

Thanh minh họa phải:

- có nhãn cho cả ba vùng;
- có marker hoặc ranh giới tại threshold;
- cập nhật theo input;
- phân biệt ba vùng rõ nhưng không dùng màu gây rối hoặc giảm khả năng đọc.

### RB-314 — English group card design

Các nhóm E1, E2, E3... phải được hiển thị thành thẻ chọn rõ ràng:

- bo góc;
- hiển thị tên group;
- hiển thị số thành viên;
- group đang chọn có visual state nổi bật;
- group không chọn có mức nhấn nhẹ hơn;
- danh sách nhiều group phải wrap hợp lý và không phá layout.

### RB-315 — Student list visual layout

Phía trên danh sách học sinh phải có toolbar gồm:

- search;
- sort;
- filter `Chưa có nhóm`.

Danh sách HS phải:

- dễ quét bằng mắt;
- phân biệt rõ `Mã đăng nhập · Họ tên · Nhóm hiện tại`;
- row/card đang chọn có highlight;
- checkbox có vùng bấm đủ lớn;
- có sticky header khi phù hợp trên desktop;
- trên mobile có thể chuyển sang stacked row/card nhưng vẫn giữ đủ ba trường chính.

### RB-316 — Batch action bar

Khi có ít nhất một HS được chọn, UI phải hiển thị một action bar rõ ràng nhưng gọn, gồm:

- số HS đã chọn;
- control chọn group đích;
- nút `Chuyển vào nhóm`;
- nút `Bỏ chọn`.

Action bar không được bị chìm trong bảng hoặc đặt quá xa vùng selection.

### RB-317 — Empty, loading và feedback states

UI phải có trạng thái rõ cho:

- đang tải;
- không có kết quả search;
- group chưa có thành viên;
- không có HS chưa gán group;
- chưa chọn HS;
- save thành công;
- đang save;
- save lỗi;
- batch assignment thành công một phần.

Không được dùng trạng thái trống khó phân biệt với lỗi tải dữ liệu.

### RB-318 — Responsive layout

Desktop:

- ưu tiên bố cục rộng rãi;
- có thể sử dụng 2 cột khi hợp lý;
- controls liên quan được nhóm gần nhau.

Tablet/mobile:

- tự xếp dọc;
- không overflow ngang ở controls chính;
- nút quan trọng không bị sát mép hoặc quá nhỏ;
- flow search → select → assign phải hoàn thành được bằng touch;
- không phụ thuộc drag/drop.

### RB-319 — Visual consistency

FEAT-003 phải tái sử dụng visual language của ứng dụng hiện tại:

- card radius;
- spacing scale;
- input height;
- button height;
- icon size;
- badge/status style;
- typography.

Không tạo một phong cách riêng tách biệt khỏi Báo bài/V9 chỉ để làm màn hình này “đẹp hơn”.


---

## Actors

### Teacher

Được sử dụng toàn bộ UI trong task này theo quyền FEAT-002.

### Admin

Không được sửa AI settings hoặc quản lý English group trong FEAT-003. Giữ quyền oversight theo FEAT-002.

### Monitor

Không được truy cập AI settings hoặc group-management controls.

### Student

Không được truy cập AI settings hoặc group-management controls.

---

## Business Rules

`BR-301` — FEAT-003 không thay đổi permission matrix FEAT-002.

`BR-302` — AI threshold semantics và constraint giữ nguyên FEAT-002: integer, `0 <= lower < upper <= 100`.

`BR-303` — Thanh minh họa AI chỉ là visualization của hai threshold hiện hành, không tạo threshold thứ ba hay rule mới.

`BR-304` — English group assignment chỉ dùng business semantics hiện hành; FEAT-003 không thay schema/membership-history rule.

`BR-305` — Batch assignment không được gây hidden selection ngoài ý muốn.

`BR-306` — Drag/drop chỉ là enhancement; checkbox/click assignment là flow bắt buộc.

`BR-307` — Mặc định sort HS theo mã đăng nhập tăng dần.


`BR-308` — UI polish không được làm thay đổi semantics của action, permission hoặc backend source-of-truth.

`BR-309` — Visual hierarchy phải phân biệt rõ hành động chính, phụ và trạng thái; không dùng styling khiến hành động nguy hiểm/phụ trông như hành động chính.

`BR-310` — Responsive/mobile usability là yêu cầu bắt buộc; drag/drop không được là dependency cho bất kỳ action chính nào.

---

## Edge Cases

`EC-301` — lower = upper → validation error, không save.

`EC-302` — lower/upper ngoài 0–100 hoặc không phải integer → validation error, không save.

`EC-303` — Teacher thay đổi threshold rồi chuyển tab trước khi save → UI không được hiển thị giả `Đã lưu`.

`EC-304` — Search không có kết quả → empty state, không lỗi.

`EC-305` — Không có HS chưa gán group → filter `Chưa có nhóm` hiển thị empty state.

`EC-306` — Batch chọn 0 HS → action assignment disabled.

`EC-307` — Group đích không còn active/không hợp lệ tại thời điểm submit → backend error phải được hiển thị, không optimistic-success giả.

`EC-308` — Một phần batch fail → không báo toàn bộ thành công; refresh từ server/source-of-truth sau thao tác.

`EC-309` — Danh sách dài → search/sort/filter vẫn responsive; không yêu cầu virtualized list trừ khi codebase hiện có.

`EC-310` — Touch device → mọi chức năng phải dùng được mà không cần drag/drop.


`EC-311` — Nhiều group card → phải wrap/scroll hợp lý, không làm vỡ layout hoặc che action khác.

`EC-312` — Tên HS, mã đăng nhập hoặc tên group dài → phải truncate/wrap an toàn, không làm bảng/card tràn ngang.

`EC-313` — Loading/save/batch operation đang chạy → action tương ứng phải disable hoặc có loading state để tránh double-submit.

---

## Data Impact

Không yêu cầu schema change.

Reuse:

- `homework_settings`;
- `english_groups`;
- `english_group_members`;
- user/profile data hiện có;
- RPC/API FEAT-002 hiện có nếu đủ.

Nếu code hiện tại cần database change chỉ để đáp ứng UI này, Astra phải giải thích và trả `BLOCKED` nếu change đó làm thay business rule hoặc data model.

---

## Security Impact

Không thay đổi security model.

Phải giữ:

- Teacher-only mutation cho AI operational settings;
- Teacher-only management English groups;
- Student/Monitor/Admin không thể bypass UI để gọi mutation ngoài quyền;
- frontend validation không thay backend validation.

Không expose AI secret/provider credentials.

---

## Must Not Break

- Authentication.
- FEAT-001 duplicate flow.
- FEAT-002 permission matrix.
- AI retry/recovery.
- Exact duplicate detection.
- Student/Monitor/Admin access restrictions.
- English-group notice visibility.
- English-group membership history.
- Existing homework board/history/queue.
- Admin oversight/hard-delete flow.

---

## Acceptance Criteria

`AC-301` — Given Teacher mở Cài đặt AI, when panel render, then thấy toggle, hai threshold, visualization ba vùng, Save button và save-state.

`AC-302` — Given threshold hợp lệ thay đổi, when input thay đổi, then visualization cập nhật ngay nhưng backend chưa thay đổi cho tới khi Save.

`AC-303` — Given threshold invalid, when Teacher bấm Save, then request không được gửi và validation error xuất hiện.

`AC-304` — Given save thành công, then UI hiển thị `Đã lưu` và giá trị reload khớp backend.

`AC-305` — Given save thất bại, then UI hiển thị lỗi và không báo `Đã lưu`.

`AC-306` — Given Teacher mở English groups, then mỗi card hiển thị tên + member count và click card hiển thị members của group.

`AC-307` — Given student list load, then mặc định sort theo mã đăng nhập tăng dần.

`AC-308` — Given Teacher search bằng mã hoặc tên, then danh sách lọc đúng, case-insensitive.

`AC-309` — Given Teacher chọn sort Họ tên hoặc Nhóm hiện tại, then danh sách được sắp xếp đúng.

`AC-310` — Given filter Chưa có nhóm bật, then chỉ HS không có active group hiện ra.

`AC-311` — Given Teacher chọn nhiều HS và group đích, when submit, then membership được cập nhật theo backend semantics và UI refresh đúng.

`AC-312` — Given batch có partial failure, then UI không báo full success và hiển thị failure feedback.

`AC-313` — Given search/filter thay đổi sau selection, then không xảy ra hidden selection assignment ngoài ý muốn.

`AC-314` — Given mobile viewport, then Teacher vẫn có thể search, select, sort/filter và assign mà không cần drag/drop.

`AC-315` — Given non-Teacher actor, then AI settings/group-management mutation controls không xuất hiện và direct mutation vẫn bị backend reject theo FEAT-002.

`AC-316` — Existing FEAT-001/002 regression tests remain PASS.


`AC-317` — Given Teacher mở FEAT-003 trên desktop, when giao diện render, then các khung chức năng và button hierarchy có phân cấp thị giác rõ, không có các action chính/phụ cạnh tranh ngang nhau.

`AC-318` — Given desktop hoặc mobile viewport, when Teacher thao tác AI settings và group assignment, then không có control quan trọng bị overflow, che khuất, quá nhỏ hoặc khó nhận biết; flow chính hoàn thành được bằng click/touch không cần drag/drop.

`AC-319` — Given có selected students, when action bar xuất hiện, then số lượng đã chọn, group đích, `Chuyển vào nhóm` và `Bỏ chọn` hiển thị rõ ràng trong cùng vùng thao tác.

`AC-320` — Given loading, empty, success, error hoặc partial-failure state, when state thay đổi, then UI thể hiện đúng trạng thái và không gây hiểu nhầm là dữ liệu trống hay thao tác đã thành công.

`AC-321` — Given tên/mã/group dài hoặc số group nhiều, when UI render, then layout không vỡ và vẫn usable trên desktop/mobile.

`AC-322` — Visual styles của FEAT-003 reuse pattern/component/token hiện có của V9 khi khả thi; không tạo hệ styling riêng nếu không cần thiết.

---

## Out of Scope

- Thay đổi AI provider/model/secret.
- Thay đổi AI thresholds mặc định 70/90.
- Thay đổi duplicate business rules.
- Thay đổi English-group visibility rules.
- Thay đổi schema membership/history.
- Cho Admin/Monitor/Student quyền quản lý group hoặc AI settings.
- Bắt buộc drag/drop trên mobile.
- Multi-class expansion.

---

## Effort Recommendation

`ASTRA_EFFORT: LOW`

Lý do: task chủ yếu frontend/UI state và reuse backend đã có. Nếu Astra khảo sát thấy cần migration/RLS/RPC mới hoặc phát hiện backend hiện tại không hỗ trợ semantics batch assignment an toàn, phải báo:

`RECOMMEND_EFFORT: MEDIUM`

hoặc `STATUS: BLOCKED` nếu cần thay business rule.

---

## Final Status

`STATUS: FINAL`
