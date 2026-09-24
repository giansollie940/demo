# DECISIONS UPDATE — FEAT-004

## DEC-038 — Hệ thống hỗ trợ nhiều khối/lớp

**STATUS:** ACTIVE  
**SUPERSEDES:** DEC-001

Hệ thống chính thức hỗ trợ nhiều lớp và nhiều khối.

Admin được giám sát dữ liệu Báo bài theo toàn hệ thống, theo khối hoặc theo lớp.

Teacher chỉ vận hành các lớp được phân công và có thể được phân công nhiều lớp.

Student/Monitor chỉ thuộc và thấy dữ liệu lớp của mình.

Việc mở multi-class không thay đổi nguyên tắc Teacher và Admin là hai trách nhiệm khác nhau.

---

## DEC-039 — Admin là multi-class oversight actor, không vận hành Báo bài thay Teacher

**STATUS:** ACTIVE

Admin được xem dashboard, tuyên dương theo lớp, history, audit và thùng rác theo scope khối/lớp; được hard delete theo FEAT-002.

Admin không create/edit/remind/soft-delete/restore/duplicate-decision, không quản lý English group và không sửa AI operational settings.

Quyết định này mở rộng phạm vi oversight của `DEC-033` từ một lớp sang nhiều lớp, không khôi phục các quyền vận hành đã bị FEAT-002 loại bỏ.

---

## DEC-040 — Admin quản lý danh mục môn chuẩn theo khối

**STATUS:** ACTIVE  
**PARTIALLY SUPERSEDES:** DEC-037 về nguồn cấu hình môn

Admin quản lý catalog môn chuẩn theo từng khối, gồm metadata chuẩn như tên, tên ngắn, icon, thứ tự mặc định, active và `is_english`.

Teacher không tạo catalog item và không sửa metadata chuẩn của catalog.

---

## DEC-041 — Teacher cấu hình môn lớp từ catalog của đúng khối

**STATUS:** ACTIVE  
**REFINES:** DEC-037

Teacher tiếp tục quản lý môn của các lớp được phân công nhưng chỉ được kích hoạt/configure `class_subjects` từ catalog active của đúng khối lớp đó.

Teacher không được tạo môn ngoài catalog, không dùng catalog của khối khác và không sửa metadata chuẩn.

Teacher được quản lý metadata cấp lớp mà FINAL SPEC FEAT-004 cho phép, gồm trạng thái active và thứ tự hiển thị.

Nếu cần môn mới hoặc sửa metadata chuẩn, Admin phải cập nhật catalog khối trước.

---

## DEC-042 — Tuyên dương và thống kê không gộp leaderboard liên lớp trong FEAT-004

**STATUS:** ACTIVE

Admin có thể xem số liệu và tuyên dương theo từng lớp.

Công thức thi đua giữ nguyên FEAT-001/002.

FEAT-004 không tạo leaderboard toàn khối/toàn trường và không so hạng học sinh giữa các lớp.

---

## DEC-043 — Multi-class isolation phải được enforce ở backend

**STATUS:** ACTIVE

Teacher chỉ được đọc/mutate các lớp được phân công.

Student/Monitor chỉ được đọc/mutate lớp của mình.

Admin có quyền read oversight toàn hệ thống và hard delete theo FEAT-002.

Không được dựa vào class selector hoặc ẩn nút frontend để enforce scope. RLS/RPC/direct API phải chống forged `class_id` và cross-class access.

---

## DEC-044 — Migration subject catalog phải bảo toàn dữ liệu cũ

**STATUS:** ACTIVE

Việc đưa `class_subjects` hiện có vào mô hình catalog theo khối không được xóa notice/history/subject hiện hữu.

Chỉ tự map khi mapping có thể xác định an toàn.

Trường hợp mơ hồ phải được báo/đưa vào verification thay vì tự ghép theo suy đoán.

---

## DEC-045 — Grade của lớp là dữ liệu explicit, không suy từ mã/tên lớp

**STATUS:** ACTIVE

Mỗi class phải có đúng một grade/khối canonical.

FEAT-004 V1 sử dụng danh sách grade cố định: `6, 7, 8, 9, 10, 11, 12`.

Admin phải chọn grade khi tạo class. Grade không được suy ra từ `class.code` hoặc `class.name`. Naming convention không phải nguồn sự thật.

FEAT-004 không cho đổi grade của class đã tồn tại qua ordinary class-edit flow; thay đổi grade cần task/flow riêng vì có thể ảnh hưởng subject catalog mapping.

---

## DEC-046 — Existing class migration dùng explicit Product-approved grade mapping

**STATUS:** ACTIVE

Class tồn tại trước FEAT-004 chỉ được gán grade từ mapping explicit đã được Product/Sol khóa.

Mapping hiện được chốt:

- `4e0b25e4-ec47-4745-8b2b-ba91c1504254` / `7A9` → grade `7`.

Đây là mapping riêng cho class hiện hữu, không tạo rule suy grade từ chuỗi `7A9`.

Migration/preflight phải kiểm toàn bộ classes trước mutation. Nếu có class chưa có mapping explicit, migration phải abort/fail trước thay đổi FEAT-004 và báo danh sách class cần Product mapping. Không được partial grade migration hoặc tự đoán grade.

