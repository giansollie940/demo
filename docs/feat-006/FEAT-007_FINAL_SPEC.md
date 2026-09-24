# FEAT-007 — School Year Archive & Purge

## Task

**Task ID:** `FEAT-007`
**Title:** Đóng gói dữ liệu cuối năm học, Archive Viewer và giải phóng dung lượng
**Status:** `FINAL`
**Spec Owner:** GPT-5.6 Sol High
**Implementation Model:** GPT-6 Astra
**ASTRA_EFFORT:** `HIGH`

---

## Objective

Cho phép Admin đóng gói toàn bộ dữ liệu của một năm học thành một archive độc lập có thể tải về máy, kiểm tra integrity bằng checksum, mở lại trực tiếp trong app ở chế độ chỉ đọc và sau đó chủ động purge dữ liệu cloud để giải phóng dung lượng.

Mục tiêu:

- giảm áp lực quota Supabase Free / Cloudflare R2;
- không mất dữ liệu lịch sử khi kết thúc năm học;
- không cần restore database chỉ để xem lại dữ liệu cũ;
- không purge nếu archive chưa được xác minh;
- chỉ giữ archive index nhẹ trên server sau purge.

---

## Source of Truth

1. DECISIONS, gồm decision update FEAT-007;
2. FINAL SPEC FEAT-007;
3. FINAL SPEC FEAT-006 nếu attachment/media đã triển khai;
4. FEAT-005/004/002/001 còn hiệu lực nếu không bị supersede;
5. PROJECT_CONTEXT;
6. code/database hiện tại;
7. nội dung chat.

Nếu implementation buộc phải thay business rule, Astra phải trả `BLOCKED`.

---

## Required Behavior

### RB-701 — Admin-only archive workflow

Chỉ Admin được tạo archive, tải archive, verify, chuyển năm học sang archived read-only và purge.

Teacher/Monitor/Student không có action archive/purge.

### RB-702 — Preflight trước archive

Admin phải thấy tối thiểu:

- năm học;
- số lớp;
- số học sinh/profiles liên quan;
- số notice;
- reactions/hearts;
- reports;
- corrections/revisions;
- audit events;
- subjects/class-subjects;
- English groups/memberships;
- media/attachments;
- dung lượng media ước tính;
- tổng archive ước tính;
- inconsistency/dependency nếu có.

Nếu không thể archive an toàn, phải chặn và báo rõ.

### RB-703 — Archive package

ZIP tối thiểu:

```text
TU-HOC-<school-year>.zip
├── manifest.json
├── classes.json
├── students.json
├── subjects.json
├── class_subjects.json
├── english_groups.json
├── english_group_memberships.json
├── homework_notices.json
├── homework_reactions.json
├── homework_reports.json
├── homework_corrections.json
├── homework_revisions.json
├── audit.json
├── archive_index.json
├── media/
└── checksums.txt
```

Có thể chia file theo lớp/entity để tối ưu performance, nhưng manifest phải mô tả rõ cấu trúc.

### RB-704 — Manifest

`manifest.json` phải có:

- archive format version;
- app version;
- archive_id;
- school_year_id/name;
- created_at/created_by;
- record counts theo entity;
- media count;
- total media bytes;
- checksum algorithm;
- schema/version metadata.

Không chứa secret, service role key, API key hoặc signed URL.

### RB-705 — Media từ Cloudflare R2

Nếu FEAT-006 đã dùng R2:

- archive phải tải toàn bộ media thuộc năm học;
- media đưa vào `/media/`;
- dữ liệu tham chiếu bằng `archive_path`;
- không lưu R2 signed URL trong archive;
- sau purge R2 vẫn xem được ảnh từ ZIP local.

### RB-706 — Media integrity

Mỗi media phải được kiểm:

- object tồn tại;
- tải đủ bytes;
- checksum hợp lệ;
- ghi vào ZIP thành công.

Chỉ thiếu một media bắt buộc cũng khiến archive `INCOMPLETE/FAILED`, không được VERIFIED và không được purge.

### RB-707 — Checksums

Dùng SHA-256 tối thiểu.

`checksums.txt` phải bao phủ data files quan trọng và toàn bộ media.

Archive chỉ `VERIFIED` khi integrity check PASS.

### RB-708 — Download-before-purge gate

Purge chỉ mở khi tất cả điều kiện đều đúng:

1. archive generation thành công;
2. checksum PASS;
3. Admin đã tải ZIP xuống;
4. Admin xác nhận đã lưu archive an toàn;
5. Admin xác nhận hiểu purge là irreversible trên cloud.

### RB-709 — Second backup policy

Giữ ít nhất 2 bản sao là **khuyến nghị mạnh**, không phải hard requirement.

UI phải nhắc rõ trước purge nhưng hệ thống không bắt buộc xác minh bản sao thứ hai.

### RB-710 — Archive index nhẹ trên server

Sau archive/purge, server chỉ giữ metadata tối thiểu:

- archive_id;
- school_year_id/name;
- class_count;
- student_count;
- notice_count;
- media_count;
- archive_size_bytes;
- checksum/fingerprint;
- archived_at/by;
- verified_at;
- purge_status;
- purged_at/by;
- archive_format_version.

Không giữ detail đã purge.

### RB-711 — ARCHIVED_READ_ONLY

Sau khi VERIFIED, Admin có thể chuyển năm học sang `ARCHIVED_READ_ONLY`.

Khi đó không được:

- tạo/sửa/xóa nghiệp vụ thường ngày;
- thêm notice/reaction/report/correction;
- thay đổi dữ liệu năm học đó ngoài archive/purge controls.

### RB-712 — Purge

Purge:

- Admin-only;
- action riêng;
- confirmation rõ ràng;
- non-empty reason;
- audit;
- scoped đúng school year;
- không ảnh hưởng năm học khác;
- phải retry/resume an toàn nếu gián đoạn.

### RB-713 — Purge ordering

Không được:

- xóa media trước VERIFIED;
- xóa dữ liệu làm mất khả năng truy vết phần còn lại;
- đánh dấu purge hoàn tất khi job chỉ chạy một phần.

Phải có progress/checkpoint phù hợp.

### RB-714 — Phạm vi purge

Có thể purge dữ liệu chi tiết chỉ thuộc năm học:

- notices;
- reactions;
- reports;
- corrections/revisions;
- subsystem audit;
- media;
- English group data;
- class-specific subject/config data;
- dữ liệu phụ trợ xác định rõ ownership.

Không purge:

- root admin;
- năm học khác;
- archive index;
- system-wide config;
- shared catalog/reference data còn được năm khác dùng;
- dữ liệu không xác định ownership an toàn.

### RB-715 — Archive Viewer

Admin có `Kho lưu trữ` → `Mở bản lưu`.

Viewer phải:

- đọc ZIP cục bộ trong browser;
- validate manifest;
- validate archive format version;
- verify checksum;
- không upload ZIP về Supabase/R2;
- hiển thị banner `DỮ LIỆU LƯU TRỮ — CHỈ XEM`.

### RB-716 — Viewer read-only

Cho phép:

- xem;
- tìm kiếm;
- lọc;
- xem ảnh;
- xem audit;
- xuất CSV nếu cần.

Không cho:

- sửa;
- xóa;
- reaction;
- report;
- correction;
- reminder;
- upload;
- restore server.

### RB-717 — Load ảnh từ ZIP

Viewer:

- đọc `archive_path`;
- lấy file media trong ZIP;
- tạo Blob/Object URL tạm;
- hiển thị ảnh;
- không gọi R2/Supabase Storage;
- revoke Blob/Object URL khi không dùng nữa.

### RB-718 — Archive versioning

Mỗi archive phải có `archive_format_version`.

Viewer phải từ chối rõ ràng version không tương thích, không silently reinterpret schema.

### RB-719 — Archive confidentiality

Archive chứa dữ liệu học sinh và audit.

UI phải cảnh báo:

- archive là dữ liệu nhạy cảm;
- không chia sẻ công khai;
- nên lưu ở vị trí được phép;
- mất archive sau purge có thể làm mất dữ liệu chi tiết.

V1 chưa bắt buộc encrypted ZIP.

### RB-720 — Không restore server trong V1

FEAT-007 V1 không có `Khôi phục lên server`.

Xem lại dữ liệu cũ dùng Archive Viewer local.

Restore cloud là task riêng trong tương lai.

---

## Business Rules

`BR-701` — Archive/purge chỉ Admin.

`BR-702` — Archive phải VERIFIED trước purge.

`BR-703` — Media R2 phải được đóng vào ZIP trước purge.

`BR-704` — Archive không phụ thuộc URL cloud để xem lại.

`BR-705` — Purge là action riêng, không tự chạy sau archive.

`BR-706` — Thiếu data/media bắt buộc hoặc checksum FAIL → không purge.

`BR-707` — Một bản VERIFIED đã tải xuống + Admin confirmation là hard gate; bản sao thứ hai chỉ là best practice.

`BR-708` — Sau purge chỉ giữ archive index nhẹ.

`BR-709` — Archive Viewer local/read-only; không restore server trong V1.

`BR-710` — Purge scoped theo school year và không phá shared data.

`BR-711` — Không lưu credential/secret/signed URL trong archive.

`BR-712` — Archive format phải versioned.

---

## Edge Cases

`EC-701` — Có media metadata nhưng object R2 mất → archive FAIL.

`EC-702` — 1.248/1.249 media thành công → archive incomplete, không purge.

`EC-703` — Download ZIP bị gián đoạn → purge vẫn khóa.

`EC-704` — Admin tạo nhiều archive run → phải phân biệt rõ run/version.

`EC-705` — Purge job dừng giữa chừng → retry/resume an toàn.

`EC-706` — Shared subject/catalog còn được năm khác dùng → không purge shared record.

`EC-707` — ZIP bị sửa → checksum FAIL.

`EC-708` — Archive version mới hơn viewer → reject rõ.

`EC-709` — Path traversal như `../` trong ZIP → reject/sanitize.

`EC-710` — ZIP rất lớn → không load toàn bộ media vào RAM cùng lúc.

`EC-711` — Offline → viewer vẫn đọc local nếu app assets đã sẵn có.

`EC-712` — Năm học đang active → không được purge.

`EC-713` — Tombstone/hard-deleted record → giữ đúng redaction FEAT-002.

`EC-714` — Pending/orphan attachment → không archive như active media nếu chưa có ownership hợp lệ.

`EC-715` — Archive index còn nhưng file local đã mất → server không thể phục hồi file; UI phải nói rõ.

---

## Data Impact

Expected additions:

- archive index/status;
- archive job state/checkpoint;
- verification metadata;
- purge progress/state.

Migration:

- không purge tự động;
- không reset dữ liệu;
- không xóa tombstone;
- không thay đổi FEAT-001→005 permissions.

---

## Storage Impact

### Supabase

Sau purge:

- giảm dữ liệu chi tiết năm học cũ;
- chỉ giữ archive index nhẹ;
- giữ shared data cần thiết.

### Cloudflare R2

Nếu FEAT-006 dùng R2:

- archive đọc media từ R2;
- media được đóng vào ZIP local;
- purge chỉ xóa R2 objects sau VERIFIED + Admin confirmation;
- không lưu thêm bản ZIP thứ hai trên R2 trong V1.

---

## Security Impact

Bắt buộc kiểm:

- Admin-only;
- school-year scope;
- no cross-year purge;
- no secret in archive;
- ZIP path traversal;
- malicious archive parsing;
- resource exhaustion;
- purge authorization;
- audit;
- signed URL không được persist.

---

## Performance Requirements

Archive generation có thể là long-running job.

Phải có:

- progress;
- retry/checkpoint;
- streaming/chunking khi phù hợp;
- không block UI;
- không giữ toàn bộ media lớn trong RAM nếu tránh được.

Archive Viewer:

- lazy-load media;
- không inflate toàn bộ ZIP media đồng thời;
- revoke Blob URLs.

---

## Must Not Break

- Auth;
- FEAT-001 duplicate/reaction/reminder;
- FEAT-002 hard-delete/tombstone;
- FEAT-004 multi-class;
- FEAT-005 ownership/report/correction;
- FEAT-006 attachment lifecycle nếu có;
- active school year;
- shared subject catalog;
- root admin uniqueness.

---

## Acceptance Criteria

`AC-701` — Admin thấy preflight đúng counts/dung lượng.

`AC-702` — Non-Admin không thể gọi archive/purge API.

`AC-703` — ZIP có manifest, data, checksums và media cần thiết.

`AC-704` — Media dùng `archive_path`, không signed URL.

`AC-705` — Mọi media bắt buộc checksum PASS trước VERIFIED.

`AC-706` — Thiếu 1 media bắt buộc → không VERIFIED.

`AC-707` — Chưa VERIFIED → purge bị khóa.

`AC-708` — Chưa xác nhận đã tải/lưu archive → purge bị khóa.

`AC-709` — Nhắc 2 bản sao nhưng không hard gate.

`AC-710` — Purge chỉ tác động school year đã chọn.

`AC-711` — Năm khác/shared data không bị purge.

`AC-712` — Sau purge archive index vẫn tồn tại.

`AC-713` — Archive index không chứa detail đã purge.

`AC-714` — Viewer mở ZIP local mà không upload server.

`AC-715` — Viewer verify checksum trước khi xem đầy đủ.

`AC-716` — Viewer hiển thị media từ ZIP sau khi object R2 đã bị purge.

`AC-717` — Banner `DỮ LIỆU LƯU TRỮ — CHỈ XEM`.

`AC-718` — Viewer không có mutation action.

`AC-719` — Version không tương thích → reject rõ.

`AC-720` — Tampered archive → checksum FAIL.

`AC-721` — Purge lưu actor/time/reason/audit.

`AC-722` — Interrupted purge có thể retry/resume.

`AC-723` — Active school year không thể purge.

`AC-724` — Không tạo bản ZIP duplicate trên R2 V1.

`AC-725` — Không có server restore trong V1.

`AC-726` — Regression FEAT-001→006 PASS.

`AC-727` — Viewer không load toàn bộ media vào RAM đồng thời.

`AC-728` — Blob URLs được revoke.

`AC-729` — Archive không chứa secret/API key/signed URL.

`AC-730` — Archive/purge job có progress/error state rõ.

---

## Out of Scope

- Restore archive lên server.
- Auto-purge ngay sau archive.
- Bắt buộc 2 bản sao.
- Lưu ZIP archive thứ hai trên R2.
- Public sharing.
- Teacher/Student Archive Viewer.
- Encryption ZIP bắt buộc V1.
- Cross-school import/export.

---

## Effort Recommendation

`ASTRA_EFFORT: HIGH`

Lý do:

- export nhiều entity;
- media streaming;
- checksum/integrity;
- purge irreversible;
- archive viewer;
- large-file handling;
- cross-year safety;
- retry/checkpoint;
- data integrity/regression risk cao.

---

## Final Status

`STATUS: FINAL`
