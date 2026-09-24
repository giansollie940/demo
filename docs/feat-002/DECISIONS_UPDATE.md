# DECISIONS UPDATE — FEAT-002

## DEC-033 — Teacher vận hành Báo bài; Admin chuyển sang oversight

**STATUS:** ACTIVE  
**SUPERSEDES:** DEC-025

Teacher là actor vận hành Báo bài hằng ngày.

Admin chỉ giám sát board/audit/thống kê và thực hiện hard delete theo FINAL SPEC FEAT-002; Admin không còn create/edit/remind/soft-delete/restore/duplicate-decision/manage-subject/manage-English-group hoặc sửa AI operational settings.

Các quyền hệ thống khác không trực tiếp vận hành notice giữ nguyên nếu không mâu thuẫn FEAT-002.

---

## DEC-034 — Teacher sở hữu AI operational settings của Báo bài

**STATUS:** ACTIVE

Teacher được cấu hình:

- semantic duplicate enabled/disabled;
- duplicate review threshold mặc định 70;
- duplicate auto threshold mặc định 90;

với constraint `0 <= lower < upper <= 100` và giá trị integer.

Student, Monitor và Admin không được sửa các setting này.

Secret/provider/model infrastructure không thuộc operational settings và không được expose cho Teacher.

---

## DEC-035 — Deleted duplicate không còn là actionable work item

**STATUS:** ACTIVE

Notice duplicate/pending đã soft-delete không xuất hiện trong Teacher actionable queue, không tính pending/backlog và không tạo cảnh báo cần xử lý.

Notice vẫn thuộc history/audit cho tới khi hard delete.

Nếu notice được restore và duplicate case chưa resolve, notice trở lại actionable queue.

---

## DEC-036 — Admin hard delete chỉ áp dụng sau soft delete và phải giữ audit tombstone

**STATUS:** ACTIVE

Hard delete:

- chỉ Admin;
- chỉ notice đã soft-delete;
- từng notice trong V1;
- irreversible;
- bắt buộc confirmation + reason;
- không auto/bulk purge.

Trước purge phải ghi immutable audit tombstone. Tombstone giữ ID/class/author/subject-English scope/timestamps/soft-delete metadata/hard-delete metadata/prior status/duplicate decision summary, nhưng không giữ title/content/deadline/exact AI data/reaction identities/reminder details.

Hard delete phải bảo toàn referential integrity và không cascade xóa notice/user/class/subsystem khác.

Tác giả gốc chỉ còn thấy redacted history marker sau hard delete.

---

## DEC-037 — Cấu hình môn và English group của Báo bài thuộc Teacher

**STATUS:** ACTIVE  
**SUPERSEDES:** DEC-017, DEC-018

Danh sách môn vẫn lấy động và English group vẫn là cơ chế scope bắt buộc cho môn Tiếng Anh, nhưng quyền cấu hình/gán trong Báo bài thuộc Teacher, không thuộc Admin.

Visibility, duplicate scoping và mô hình một lớp của các quyết định cũ vẫn giữ nguyên.
