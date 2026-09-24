# FEAT-010 — §17 required tests → thực tế

30 mục §17 đòi, ánh xạ sang test đã chạy. Một số test phủ nhiều mục vì chúng là
cùng một kịch bản nhìn từ hai phía; chỗ nào như vậy thì tên test mang cả hai số.

| §17 | Yêu cầu | Test |
|---:|---|---|
| 1 | Lock future session | `1/3 khoá một buổi chưa bắt đầu, và tuần sau vẫn khoá` |
| 2 | Lock after session already started | `2 buổi đã bắt đầu trước lúc khoá thì không bị sửa` |
| 3 | Recurring lock next week | `1/3 …` (khẳng định `later` cũng khoá) |
| 4 | Unlock future session | `4/5 mở khoá chỉ mở buổi bắt đầu sau đó…` |
| 5 | Historical week remains locked | `4/5 …` + `5/16 BR-010-005: hai biên bằng nhau…` |
| 6 | Unlock mid-week | `6 EC-010-005: khoá thứ Hai, mở thứ Năm, thì thứ Sáu cùng tuần mở` |
| 7 | Weekly ALLOW | `7/8 EC-010-006: mở riêng đúng một buổi…` |
| 8 | Weekly ALLOW does not propagate | `7/8 …` (tuần `later` vẫn khoá) |
| 9 | Revoke ALLOW before session | `9 hủy mở riêng trước giờ học…` |
| 10 | Student direct API bypass | `10 học sinh gửi thẳng device=true vào REST…` |
| 11 | Monitor bypass | `11 lớp trưởng gửi thẳng device=true vào REST…` |
| 12 | Emergency registration | `12 AC-010-010: đăng ký bổ sung không phải quyền vượt khoá` |
| 13 | AI detected device while locked | `13 EC-010-013: AI ghi được phát hiện thiết bị nhưng không bật được quyền` |
| 14 | Approved registration status preservation | `14/26 EC-010-011: khoá không đưa một đăng ký đã duyệt trở lại hàng chờ` |
| 15 | Device request preserved through Lock → Unlock | `15 AC-010-013: khoá rồi mở trước giờ học trả lại đúng lựa chọn cũ…` |
| 16 | Historical locked session stays false | `16 một buổi lịch sử nằm trong khoảng khoá vẫn false…` + `5/16 …` |
| 17 | Teacher wrong-class authorization | `17 AC-010-017: giáo viên không thao tác được lớp ngoài phân công` |
| 18 | Admin read-only policy behaviour | `18 DEC-109: Admin xem được nhưng không thay giáo viên khoá/mở` |
| 19 | concurrent Lock + submit | `19/20 AC-010-020: …xếp hàng trên cùng một khoá slot` ¹ |
| 20 | concurrent Unlock + submit | `19/20 …` ¹ |
| 21 | timetable-version boundary | `21 EC-010-008: biên dùng thời khoá biểu có hiệu lực cho buổi đó…` |
| 22 | no-resolvable-session-time fail-safe | `22 EC-010-010: …báo lỗi rõ, và không sửa dữ liệu` + `22b vì sao nhánh fail-safe của trigger không tới được…` |
| 23 | migration/backfill preserves device values | `23 AC-010-022: backfill giữ nguyên lựa chọn thiết bị đang có` |
| 24 | Regression: Registration | `24/25 hồi quy: đăng ký, sửa, và vòng AI vẫn chạy y như cũ…` |
| 25 | Regression: AI review | `24/25 …` |
| 26 | Regression: Teacher review | `14/26 …` (thông báo đã đọc không bị dựng dậy) |
| 27 | Regression: Tracking | `27/28 hồi quy: cột hiệu lực đọc được cùng lúc với phần còn lại…` + frontend `AC-010-014: thống kê và theo dõi đếm quyền hiệu lực` |
| 28 | Regression: Dashboard/statistics | như trên |
| 29 | Regression: week lifecycle/timetable | `29 hồi quy: vòng đời tuần và thời khoá biểu không bị FEAT-010 chạm vào` |
| 30 | RLS/direct REST checks | `30 §13: học sinh và lớp trưởng không ghi thẳng được vào bảng policy` + `giáo viên được phân công không ghi thẳng vào bảng policy — chỉ qua RPC` |

¹ **Đọc kỹ mục 19/20.** pglite chạy một kết nối nên test này không chứng minh
được tính tuần tự hoá dưới truy cập đồng thời thật. Nó chứng minh: đường ghi
đăng ký **có** giữ `ShareLock` tư vấn đúng key của slot, và RPC **có** lấy khoá
độc quyền cùng key. Việc hai giao dịch thật xếp hàng đúng vẫn là một cổng kiểm
tra khi phát hành. Nêu lại ở mục 14 của Implementation Report.

## Ngoài §17

Những test không nằm trong danh sách bắt buộc nhưng canh những chỗ đã từng hoặc
có thể sai:

| Test | Canh cái gì |
|---|---|
| `assertNoDrift` (chạy cuối mọi kịch bản) | cột lưu luôn bằng công thức sinh ra nó — cái giá của DEC-114 |
| `DEC-113 hủy mở riêng sau khi buổi đã bắt đầu…` | không hồi tố theo **cả hai** chiều: hủy muộn, và tạo muộn |
| `EC-010-007 mở khoá toàn cục trước buổi học làm override thành thừa` | override dư không thành xung đột |
| `EC-010-001/EC-010-002 …` | Lock/Unlock idempotent, và unique index là lưới thứ hai |
| `§19/DEC-111: purge của FEAT-007 không chạm bảng nào mà policy tham chiếu` | chiều **xoá** của §18: đọc thẳng migration 12 thay vì tin một lời hứa |
| `RC4-R-003 năm học archiving / archived_read_only: cả bốn thao tác ghi bị từ chối` ² | chiều **ghi** của §18 — RB-711. Bốn thao tác, hai trạng thái đóng băng, và ảnh chụp toàn bộ dấu chân của FEAT-010 trước/sau để một lần từ chối không để lại gì |
| `RC4-R-003 năm học active thì giáo viên vẫn khoá được — chốt chặn không chặn nhầm` | đối chứng dương: một chốt chặn từ chối tất cả cũng qua được mọi test ở trên |
| `RC4-R-003 đọc vẫn mở sau khi năm học đã lưu trữ` | `state` cho cả bốn vai, `history` cho Teacher/Admin, và học sinh vẫn **không** xem được `history` |
| `RC5-R-004 không ai ghi thẳng được vào bảng policy khi năm học đã đóng băng — kể cả chủ sở hữu database` ³ | chốt chặn phải ở **bảng**, không phải là một quyền: từ RC7 `service_role` không còn DML, nên test này ghi bằng vai **chủ sở hữu database** — người mà không quyền nào chặn được. Sáu câu ghi thẳng, hai trạng thái đóng băng |
| `RC5-R-004 đổi chủ sở hữu bị kiểm ở cả lớp cũ lẫn lớp mới` | UPDATE đổi `class_id`: chỉ kiểm `new` thì dòng đi ra khỏi năm đóng băng, chỉ kiểm `old` thì đi vào |
| `RC5-R-004 năm học còn active thì đường ghi thẳng vẫn chạy, và chốt chặn không tắt được` | đối chứng dương: chốt chặn không biến một năm còn mở thành ngõ cụt; và `alter table … disable trigger` cần quyền sở hữu mà `service_role` không có |
| `RC5-R-005 thao tác policy phải khoá dòng năm học, không chỉ đọc nó` ³ | `RowShareLock` trên `school_years` có thật trong `pg_locks`, và mode viết trong mã là `for share` chứ không phải `for key share` |
| `RC6-R-006 override không thể trỏ tới khoảng khoá của một lớp khác` | hai đường sở hữu của override phải là một: chốt chặn đọc `class_id`, đánh giá policy đi theo `interval_id` — lệch nhau là một năm đã đóng băng bị mở qua cửa sau |
| `RC6-R-006 override phải cùng buổi với khoảng khoá nó là ngoại lệ` | nửa còn lại của quyền sở hữu: thứ và tiết |
| `RC6-R-006 override phải thuộc một tuần của chính năm học đó` | quy tắc lớp↔tuần, **và** khẳng định đường override với đường `registrations` từ chối cùng một cặp lệch năm |
| `RC6-R-007 service_role không còn ghi thẳng vào bảng policy, kể cả năm học còn active` | tám câu DML trên ba bảng đều 42501; `select` vẫn được; RPC vẫn chạy |
| `RC7-R-008 sau Lock A → ALLOW → Unlock A → Lock B, state của người quản lý vẫn đọc được` | `override_id` phải là null: ngoại lệ chưa hủy kia thuộc chu kỳ đã đóng. Trước RC8 nó trả về đúng dòng sai |
| `RC7-R-008 và sau khi ALLOW lại dưới Lock B, state trả đúng ngoại lệ của chu kỳ đang chạy` | hai dòng unrevoked cho cùng một buổi là hợp lệ; câu hỏi sai làm cả RPC gãy với "more than one row" |
| `RC7-R-008 state của học sinh không đổi, và vẫn không mang override_id` | bản cho học sinh đúng bốn khoá — §8 không bị mở lại nhân tiện một bản vá |
| `RC7-R-008 mở riêng → hủy → mở riêng lại trong cùng một chu kỳ vẫn trả đúng một ngoại lệ` | cách thứ hai để có hai dòng cho một buổi; phép tra mới phải đơn trị ở đây nữa |
| `FEAT-010 và FEAT-001…008 không dùng chung một đối tượng nào` | hai hệ thống rời nhau, theo cả hai chiều |
| frontend `một dòng cũ chưa có cột hiệu lực…` | trang từ cache không làm dashboard tụt về 0 |
| `trigger của FEAT-010 chạy sau trigger điền class_id…` | thứ tự trigger — một lần đổi tên sẽ làm policy đánh giá trên `class_id` NULL và trả `'open'` cho mọi dòng mới |
| frontend `mục "Thiết bị điện tử" có trong sidebar…` | `orders` trong navigation.ts vừa sắp thứ tự vừa là danh sách trắng — đúng lỗi đã xảy ra với "Thùng rác" |

² **Vì sao dòng này tồn tại.** §18 ("Must Not Break FEAT-007") là một hợp đồng
hai chiều: FEAT-007 không được xoá mất dữ liệu của FEAT-010, và FEAT-010 không
được ghi vào một năm học FEAT-007 đã đóng băng. RC1…RC4 chỉ test chiều thứ nhất
và trình bày kết quả như thể nó là cả hợp đồng. Sol RC4 R-003 chỉ ra chiều thứ
hai chưa từng được hỏi tới, và nó sai. Hai dòng đứng cạnh nhau ở bảng trên là để
lần sau nhìn thấy ngay là có hai chiều.

³ **Hai test này chứng minh tới đâu.** R-004 là hành vi thật, chạy thật: câu ghi
bị từ chối hay không, không có gì phải suy luận. R-005 thì không: pglite một kết
nối nên nó **không** chứng minh được thứ tự giữa hai giao dịch. Nó chứng minh hai
điều nhỏ hơn và kiểm được — khoá dòng **có** được lấy, và mode được viết đúng là
`for share` (mode duy nhất xung đột với FOR NO KEY UPDATE mà `archive_begin`
lấy). Việc hai giao dịch thật xếp hàng đúng là cổng kiểm tra số 5 trong
`DEPLOYMENT.md`, và nó là một cổng riêng, khác với cổng số 1.

Và một ghi chú về chính cách viết test: assertion nào đọc mã nguồn thì phải đọc
qua `migrationSql()` của fixture, **không** phải `readFile`. Fixture cài bản đã
áp mutation từ bộ nhớ; một assertion đọc thẳng tệp trên đĩa sẽ luôn thấy bản gốc,
nên bộ mutation không với tới nó. Đúng lỗi đó đã để M42 thoát ở lần chạy đầu của
RC6, và nó cũng đã âm thầm làm hai assertion của test 19/20 thành vô hình từ RC1.

Và một ghi chú thứ hai về bộ mutation, từ RC7: một mutation làm **toàn bộ** suite
fail thường là mutation làm hỏng migration, không phải mutation bị bắt. M46 bản
đầu thu hẹp FK mà quên khoá unique tương ứng; migration không cài được, 54 test
đỏ, và runner đọc đó là một cú bắt dứt khoát. Runner giờ có verdict riêng cho
trường hợp đó và tính nó là thoát — cùng nguyên tắc với verdict "mutation không
áp dụng được" thêm ở RC3.

---

## RC9 — R-009 / R-010 regression matrix

| Test | Contract |
|---|---|
| `RC9-R-009 active-year empty class vẫn xóa như trước FEAT-010` | FEAT-004 lifecycle không đổi |
| `RC9-R-009 active-year class có interval + override + signal vẫn parent-delete cascade sạch` | parent `DELETE classes` thật + cleanup 3 bảng |
| `RC9-R-009 direct child DELETE trong frozen year vẫn bị chặn` | child hard-freeze vẫn giữ |
| `RC9-R-010 frozen OLD → active NEW UPDATE bị chặn bởi OLD-side guard` | không mang dữ liệu ra khỏi frozen owner |
| `RC9-R-010 active OLD → frozen NEW UPDATE bị chặn bởi NEW-side guard` | không mang dữ liệu vào frozen owner |
| `RC9-R-010 active OLD → active NEW UPDATE vẫn hợp lệ ở maintenance path` | positive control |
| `RC9-R-009 archived-year parent class DELETE vẫn do FEAT-007 chặn trước child cascade` | FEAT-007 vẫn là parent lifecycle owner |

Mutations mới:
- **M51:** bỏ parent-missing DELETE bypass; test parent cascade phải fail.
- **M52:** bỏ OLD-side UPDATE check; test frozen→active phải fail.

Các test này đã được **tích hợp vào source**, nhưng full runtime run RC9 còn PENDING trong môi trường đóng gói hiện tại.

