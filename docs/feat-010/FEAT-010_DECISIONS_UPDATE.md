# FEAT-010 — DECISIONS UPDATE (triển khai)

DEC-102 → DEC-113 giữ nguyên như bản FINAL; phần dưới ghi chúng đã được hiện
thực hoá bằng gì, rồi thêm ba quyết định mà việc triển khai buộc phải đưa ra.

Ba quyết định mới đã qua cổng review RC1: **DEC-114 RATIFIED**; **DEC-115
RATIFIED**, với phần tích hợp write-freeze mà Sol RC4 §10, RC5 §9 và RC6 §10 đòi
đã hoàn thành ở RC7 (giữ lại lịch sử vẫn đúng, nhưng một năm đã đóng băng thì
không nhận thao tác policy nữa — từ bất kỳ đường nào, và không có đường nào cho
một dòng trưng ra hai chủ sở hữu khác nhau); và **DEC-116 ACCEPTED IN CONCEPT**.
Hai cổng kiểm tra hai kết nối thật vẫn còn nợ.

---

## Bản FINAL — hiện thực hoá ở đâu

| DEC | Hiện thực |
|---|---|
| DEC-102 interval lịch sử | `public.device_use_lock_intervals`; unique riêng phần cho khoảng đang mở |
| DEC-103 không hồi tố buổi đã bắt đầu | vế `session_start > locked_at`, viết đúng một lần trong `device_use_locking_interval()` |
| DEC-104 Unlock đóng, không xoá | `unlock` chỉ `set unlocked_at`; không có đường xoá nào cho `authenticated` |
| DEC-105 ALLOW override | `public.device_use_session_overrides`, `mode` check chỉ nhận `'allow'`, và **FK hợp thành** `(interval_id, class_id, weekday, period_number)` gắn nó vào đúng khoảng khoá nó là ngoại lệ — một override không thể tồn tại khi không có khoá, không thể sống sót sang chu kỳ khoá sau (Sol RC1 P1), và không thể thuộc một lớp hay một buổi khác với khoảng khoá của nó (Sol RC6 R-006). Hệ quả cố ý: một buổi có thể có ngoại lệ ở **nhiều** chu kỳ, nên mọi chỗ đọc override phải đi qua `device_use_live_override()` (Sol RC7 R-008) |
| DEC-106 tách requested/effective | `registrations.effective_uses_electronic_device`; phép AND nằm ở đúng một hàm, `device_use_effective()` |
| DEC-107 policy không kích hoạt review | danh sách cột trong câu UPDATE của `device_use_recompute()` không nhắc `status`, `approval_source`, `ai_review_status`, `ai_decision`, `is_deleted`, `revision_overdue_at`, nên hai trigger AFTER `UPDATE OF` không chạy |
| DEC-108 policy trên AI | trigger là trigger bảng, `service_role` không đi vòng được |
| DEC-109 Teacher là chủ policy | ghi dùng `teacher_has_class`, đọc dùng `can_manage_class` |
| DEC-110 server session time | dùng lại `public.study_session_start(class,week,weekday,period)` có sẵn |
| DEC-111 tương thích FEAT-007 | xem DEC-115 |
| DEC-112 scope class + slot | khoá theo `class_id + weekday + period_number`, không theo môn |
| DEC-113 override không hồi tố | RPC từ chối thao tác sau giờ bắt đầu **và** công thức bỏ qua override tạo/hủy muộn |

---

## DEC-114 — Quyền hiệu lực là một cột lưu trên `registrations`

**STATUS:** RATIFIED (Sol RC1 §11)

§9.3 cho chọn giữa thêm cột, view/computed field, RPC projection hay pattern
tương đương. Chọn **thêm cột**.

**Vì sao.** Frontend đọc `registrations` bằng một câu select thẳng vào bảng
(`sb.from("registrations").select(...)`), và Realtime cũng subscribe đúng bảng
đó. Một view sẽ kéo theo việc đổi đường đọc, RLS và cấu hình realtime cùng lúc;
một cột chỉ thêm một tên vào danh sách cột.

**Cái giá, nói thẳng.** Một cột lưu có thể lệch khỏi quy tắc sinh ra nó. Việc
này được bù bằng hai thứ: công thức chỉ được viết ở đúng một chỗ
(`device_use_effective()`), và suite có một invariant chạy ở cuối **mọi** kịch
bản — với mọi dòng trong bảng, giá trị lưu phải bằng đúng công thức tính lại tại
chỗ. Một đường ghi đặt cột mà không qua công thức sẽ làm hỏng chính test đang
chạy.

**Cột cũ không đổi nghĩa và không đổi dữ liệu.** Đó là điều giữ
`apply_smart_approval()` hoạt động y như trước và làm DEC-107 thành hệ quả tự
nhiên chứ không phải một ngoại lệ phải gài thêm.

---

## DEC-115 — Policy history được **retain**: không archive, không purge

**STATUS:** RATIFIED (Sol RC7 §10 — phần tích hợp write-freeze mà RC4/RC5/RC6 đòi đã xong; còn cổng kiểm tra hai kết nối thật)
**Thay lời giải cho:** DEC-111, §19

§19 cho hai lựa chọn: đưa vào archive, hoặc retain và ghi rõ. Chọn **retain**,
vì lựa chọn kia giải một vấn đề không tồn tại.

**Bằng chứng.** Purge của FEAT-007 xoá 15 bảng, tất cả thuộc hệ thống Báo bài
(`homework_*`, `english_group*`, `class_subjects`). Không bước nào xoá `classes`,
`weeks`, `class_weeks` hay `registrations`; `archive_guard_class()` còn từ chối
mọi DELETE trên `classes`. Hai bảng của FEAT-010 chỉ tham chiếu `classes(id)`,
`weeks(id)`, `periods(period_number)`, `profiles(id)` — không cái nào bị purge.

Nên tình trạng §19 cấm — "policy rows bị purge nhưng ZIP không chứa chúng" —
không thể xảy ra, và không có FK nào lủng lẳng.

**Hệ quả.** `ARCHIVE_FORMAT_VERSION` giữ `'1.0'`, `ENTITY_FILES` không thêm mục,
Viewer không sửa, và gói FEAT-007 RC6 đã được duyệt giữ nguyên vân tay
`529f86e4…`. Một quyết định "archive" sẽ đổi cả bốn thứ đó để lưu trữ dữ liệu mà
không ai xoá.

**Điều gì làm quyết định này hết đúng.** Ngày FEAT-007 bắt đầu purge `classes`,
`weeks` hoặc `registrations`. Có một test đọc thẳng
`12-FEAT-007-ARCHIVE-PURGE.sql`, rút ra tập bảng bị `delete from`, và fail nếu
tập đó chứa bất kỳ bảng nào FEAT-010 tham chiếu — nên hôm đó sẽ có người biết.

**Giữ lại không có nghĩa là còn ghi được (Sol RC4 R-003).** Hai câu đó nghe gần
nhau đến mức RC1…RC4 đã coi câu thứ nhất là đủ. Không phải: §18 và RB-711 đòi
một năm đã `archived_read_only` thì dữ liệu nghiệp vụ thường ngày ngừng thay
đổi, và một bảng được *giữ lại* vẫn phải *đóng băng* cùng năm học của nó. Đọc
(`state`, `history`) không đổi: một năm đã lưu trữ vẫn tra cứu được.

Cái test nói ở đoạn trên là lý do lỗ hổng này sống được lâu như vậy. Nó trả lời
đúng câu hỏi nó đặt ra — "purge có xoá bảng nào FEAT-010 tham chiếu không" — và
câu trả lời đó được trình bày như thể là "FEAT-010 tương thích FEAT-007". Một
hợp đồng có hai chiều (xoá, và ghi); test chỉ có một.

**Và đóng băng mềm không phải đóng băng (Sol RC5 R-004/R-005).** RC5 đặt chốt
chặn trong wrapper RPC, tức là ở cửa mà giáo viên đi qua — không phải ở cửa duy
nhất. `service_role` có BYPASSRLS và `grant all` nên ghi thẳng vào bảng không
gặp nó, và chốt chặn đọc `archive_state` mà không khoá dòng nên
`archive_begin` của FEAT-007 chen được vào giữa kiểm tra và ghi. Từ RC6, quy tắc
sống trong `device_use_assert_year_writable()` — khoá dòng `school_years` bằng
`for share` rồi mới kiểm — và được gọi từ cả wrapper lẫn một trigger bảng trên
hai bảng policy. Chi tiết ở `RC6_FIX_REPORT.md`.

**Và một chốt chặn chỉ đúng khi "lớp của dòng này" có đúng một câu trả lời (Sol
RC6 R-006/R-007).** Override mang hai đường sở hữu (`interval_id` và
`class_id + weekday + period_number`) mà không gì buộc chúng trùng nhau, nên
chốt chặn đọc một đường còn `device_use_policy_state()` đi theo đường kia — một
năm đã đóng băng mở được qua cửa sau. RC7 làm trạng thái lệch **không biểu diễn
được** bằng một FK hợp thành, thêm quy tắc lớp↔tuần (đúng quy tắc
`validate_registration_class_week()` của `registrations`), và thu hồi DML thẳng
của `service_role` trên ba bảng — một câu INSERT thẳng không recompute, không
phát tín hiệu, không ghi audit, nên nó không phải một lần đổi chính sách. Chi
tiết ở `RC7_FIX_REPORT.md`.

---

## DEC-116 — Biên của cuộc đua là một khoá tư vấn theo slot

**STATUS:** ACCEPTED IN CONCEPT (Sol RC1 §11) — cổng kiểm tra hai kết nối thật vẫn còn nợ

BR-010-018 đòi kết quả tất định khi Lock và submit xảy ra gần như đồng thời, và
cấm để `device=true` lọt qua một buổi đang khoá. Không có gì trong schema tự cho
điều đó: một đăng ký đang ghi chưa commit thì hàm tính lại của Teacher không
nhìn thấy, còn khoảng khoá chưa commit thì trigger của đăng ký không nhìn thấy —
không bên nào sai, nhưng kết quả là một buổi bị khoá vẫn có thiết bị.

**Quyết định.** Mọi lần ghi `registrations` lấy `pg_advisory_xact_lock_shared`
trên khoá của slot; mọi lần đổi policy lấy `pg_advisory_xact_lock` (độc quyền)
trên cùng khoá. Các đăng ký đồng thời không chặn nhau; đổi policy phải đợi chúng
commit. Khoá hết hiệu lực khi giao dịch kết thúc.

**Vì sao là advisory lock chứ không phải khoá dòng `classes`.** Khoá dòng
`classes` cũng chặn được, nhưng nó sẽ đụng cả những thao tác quản trị không liên
quan tới thiết bị, và nó thô hơn một bậc (cả lớp thay vì một tiết).

**Chưa chứng minh được.** pglite một kết nối, nên test chỉ khẳng định khoá **có**
được lấy, đúng key và đúng mode. Tính tuần tự hoá thật là một cổng kiểm tra khi
phát hành.

---

## RC9 lifecycle clarification — no new product decision

R-009/R-010 không tạo business rule mới. RC9 chỉ làm cho ba ownership boundary hiện có cùng đúng:

1. FEAT-004 quyết định active-year class có được xóa hay không; FEAT-010 history không tự trở thành class blocker.
2. FEAT-007 chặn parent class delete khi năm học frozen/archived.
3. FEAT-010 chặn direct child writes trong frozen year và kiểm cả OLD+NEW owner khi re-parenting.

Vì vậy DEC-114/115/116 không đổi trạng thái.

