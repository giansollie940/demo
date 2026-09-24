# DECISIONS UPDATE — FEAT-005

## DEC-047 — Notice thuộc quyền chỉnh sửa của tác giả

**STATUS:** ACTIVE

Chỉ `author_id` của notice được sửa nội dung notice.

Teacher, Monitor, Student khác và Admin không được sửa notice của người khác.

Quyết định này supersede mọi permission cũ cho phép Teacher/Monitor sửa trực tiếp notice của người khác.

---

## DEC-048 — Monitor chỉ báo sai, không quản lý notice người khác

**STATUS:** ACTIVE

Monitor có action `Báo sai thông tin` đối với notice của người khác.

Monitor không được sửa, soft-delete, restore, remind hoặc gửi correction request cho notice người khác.

Student thường không có action `Báo sai thông tin`.

---

## DEC-049 — Reporter identity là dữ liệu nội bộ của Teacher

**STATUS:** ACTIVE

Danh tính Monitor gửi `Báo sai thông tin` chỉ Teacher được phân công lớp đó được xem trong daily workflow.

Không hiển thị reporter identity cho:

- tác giả notice;
- Student;
- Monitor khác;
- board;
- notification cho tác giả.

Backend/audit vẫn lưu reporter identity để truy trách nhiệm.

---

## DEC-050 — Teacher xử lý report, không sửa bài thay tác giả

**STATUS:** ACTIVE

Teacher có thể phân loại report:

- hợp lệ;
- không hợp lệ;
- có dấu hiệu lạm dụng.

Teacher không sửa trực tiếp notice của Student/Monitor.

Nếu cần chỉnh, Teacher gửi `Yêu cầu chỉnh sửa Báo bài`.

---

## DEC-051 — Không auto-punish Monitor vì report sai/lạm dụng

**STATUS:** ACTIVE

Hệ thống được thống kê số report hợp lệ/không hợp lệ/lạm dụng theo Monitor và cảnh báo Teacher.

Hệ thống không tự:

- khóa nút báo sai;
- hạ role;
- phạt;
- thay đổi quyền Monitor.

Quyết định xử lý thuộc Teacher/human.

---

## DEC-052 — Correction request tối đa 2 rounds

**STATUS:** ACTIVE

Correction workflow có tối đa 2 rounds.

Mỗi round cho tác giả 72 giờ để sửa và gửi lại.

Round 2 là vòng cuối.

Không có Round 3.

---

## DEC-053 — Resubmit đúng hạn dừng timer

**STATUS:** ACTIVE

Khi tác giả bấm `Gửi lại GV` trước hạn:

- 72-hour timer dừng;
- notice chuyển sang chờ Teacher xác nhận;
- không được auto-delete chỉ vì Teacher xử lý chậm.

---

## DEC-054 — Timeout hoặc thất bại vòng cuối chỉ soft-delete

**STATUS:** ACTIVE

Notice bị soft-delete khi:

- tác giả không gửi lại trong 72 giờ ở bất kỳ round nào;
- Teacher xác nhận `Chưa đạt` ở Round 2.

Không hard-delete tự động.

History/audit vẫn được giữ theo FEAT-002.

---

## DEC-055 — Teacher có emergency remove, không có edit override

**STATUS:** ACTIVE

Teacher có action `Gỡ bài` khẩn cấp đối với notice của Student/Monitor trong lớp assigned.

`Gỡ bài`:

- là soft-delete;
- bắt buộc reason;
- ghi audit;
- gửi notification cho tác giả.

Teacher không có edit override.

---

## DEC-056 — Author đang correction không dùng delete thường

**STATUS:** ACTIVE

Nếu correction request đang mở, tác giả không được soft-delete bằng action xóa thông thường.

Tác giả có action `Xin rút bài`:

- bắt buộc reason;
- soft-delete;
- đóng correction;
- ghi audit.

---

## DEC-057 — Admin không tham gia correction/report daily workflow

**STATUS:** ACTIVE

Admin không xử lý report, correction hoặc emergency removal trong vận hành thường ngày.

Admin tiếp tục hard-delete từ Trash theo FEAT-002.

---

## DEC-058 — Revision chờ Teacher không công khai ngay

**STATUS:** ACTIVE

Revision mà tác giả gửi lại sau correction:

- chỉ tác giả và Teacher xem được trước khi duyệt;
- board tiếp tục hiển thị published revision trước đó với badge chờ xác nhận.

Teacher chọn `Đạt` mới publish revision mới.

Material revision vẫn phải chạy lại duplicate/review rule hiện hành.

---

## DEC-059 — Security phải enforce backend

**STATUS:** ACTIVE

Ownership, report visibility, reporter confidentiality, correction transitions và emergency removal phải enforce ở backend/RLS/RPC/direct API.

Không dựa vào việc ẩn nút frontend để bảo vệ permission.

---

## DEC-060 — Automated soft-delete uses explicit System actor

**STATUS:** ACTIVE  
**REFINES:** FEAT-002 soft-delete/tombstone attribution contract

Soft-delete attribution has two canonical actor types:

- `user`;
- `system`.

Human-triggered/manual soft-delete retains the real user UUID/profile.

Automated soft-delete caused by FEAT-005 timeout or terminal System transition is attributed to `System`.

The implementation must not:

- borrow a Teacher/Admin/Author UUID;
- falsely attribute automated deletion to a human;
- create a login-capable synthetic System account/profile solely to satisfy an FK/NOT NULL constraint.

If a Teacher decision triggers a terminal System deletion, the Teacher remains the decision actor in audit/correction history while the deletion actor is `System`.

---

## DEC-061 — System-soft-deleted notice remains eligible for Admin hard-delete

**STATUS:** ACTIVE  
**REFINES:** FEAT-002 hard-delete eligibility

A notice soft-deleted by `System` is a valid soft-deleted notice.

Admin must be able to hard-delete it under the existing FEAT-002 rules for:

- Admin-only authorization;
- irreversible confirmation;
- non-empty reason;
- tombstone-before-purge transactionality;
- retained/purged field contract.

Hard-delete eligibility must not require a human `soft_deleted_by` UUID when canonical deletion attribution is `system`.

Tombstone must preserve enough metadata to distinguish:

- user soft-delete with the real user UUID;
- System soft-delete with actor `System`.

Existing tombstones and existing user deletion attribution must be preserved.

