# IMPLEMENTATION REPORT — FEAT-004

- **Task ID:** FEAT-004
- **Status:** READY_FOR_REVIEW — local implementation and verification complete; Sol independent review pending.
- **Astra Effort:** HIGH, theo ngoại lệ Product Owner đã chốt trong FINAL SPEC.
- **Spec:** FINAL_SPEC.md, bản HIGH_GRADE_RESOLVED; DECISIONS_UPDATE.md gồm DEC-038–046.
- **Production deploy:** NONE. Không apply migration hoặc deploy Edge/frontend lên project Supabase thật.

## Implementation Summary

Admin có màn hình giám sát riêng: chọn khối/lớp, tổng quan, tuyên dương từng lớp, lịch sử, nhật ký, thùng rác và catalog môn theo khối. Không còn tab Bảng Báo bài hoặc các thao tác vận hành notice của Admin. Cấu hình tuyên dương/cảnh báo quản trị hiện hành được giữ lại.

Teacher lấy danh sách lớp được phân công từ backend, chọn lớp và cấu hình môn từ catalog active đúng khối. Khi đổi lớp, form, selection, modal và dữ liệu cũ được xóa; kết quả request cũ không được ghi đè scope mới. Inbox dùng scope Báo bài hiện tại. Các selector context toàn ứng dụng được ẩn trên trang Báo bài để không có hai bộ chọn lớp/tuần cạnh tranh. Các trang khác giữ flow context cũ.

Môn lớp giữ ID, metadata chuẩn được lấy từ catalog, Teacher chỉ gửi catalog reference, sort_order và is_active. API tạo môn tự do cũ được chuyển vào schema private và thu hồi quyền execute của client. Mọi đường public đi qua role/class checks trước khi gọi implementation cũ.

Grade là thuộc tính explicit 6–12. Create-class Edge/UI bắt buộc grade; ordinary edit bị chặn cả ở Edge và database khi đổi grade. Mapping duy nhất cho lớp cũ là UUID `4e0b25e4-ec47-4745-8b2b-ba91c1504254` → 7. Không parse code/name.

## Files Changed

Danh sách đầy đủ: **FILES_CHANGED.md** (23 source/test/package files, cộng tài liệu FEAT-004 và dist được build lại).

Các file chính:

- `database/upgrade/08-FEAT-004-MULTI-CLASS-CATALOG.sql`
- `src/components/homework/HomeworkAdminOversight.vue`
- `src/pages/HomeworkPage.vue`, `src/features/homework/api.ts`, `src/features/homework/view-context.ts`
- `src/components/homework/HomeworkInbox.vue`, `src/components/layout/TopBar.vue`
- `src/pages/AdminPage.vue`, `src/features/admin/admin-directory.ts`, `src/components/admin/AdminClassDialog.vue`
- `supabase/functions/admin-manage-classes/index.ts`, `supabase/functions/_shared/class-grade.ts`
- `tests/feat-004/*` và fixture/regression tests FEAT-001/002/003/BUG-001.
- `deploy/edge-functions/admin-manage-classes.zip`: đóng gói lại từ source hiện tại, chưa deploy.

Không xóa source hoặc dữ liệu người dùng. Các nhánh giao diện Admin cũ trong HomeworkPage được gỡ sau khi chuyển sang component giám sát riêng. Patch cho review: **SOURCE_CHANGES.patch**. Hash từng source thay đổi: **evidence/source-hashes.json**.

## Database Changes

Migration 08 chạy sau 05 → 06 → 07, trong một transaction:

1. Lock classes/class_subjects; preflight toàn bộ lớp và metadata môn trước FEAT-004 DDL/DML. Unknown class báo class_id/code/name rồi abort. Mapping môn có cùng nhãn chuẩn hóa nhưng metadata khác nhau báo subject IDs rồi abort.
2. Thêm `classes.grade`: NOT NULL, CHECK 6–12, không default; backfill bằng UUID đã duyệt; trigger cấm thay grade đã có.
3. Thêm `grade_subject_catalog`; map exact metadata theo grade; giữ mọi class_subject ID và notice reference. Local sort/active không bị ghi đè khi migrate. Thêm FK `class_subjects.catalog_subject_id` NOT NULL.
4. Trigger kiểm đúng grade/catalog, giữ canonical metadata và ngăn activation mới từ catalog inactive. Catalog metadata change cập nhật môn lớp liên quan. Guard loại Tiếng Anh đã có lịch sử được giữ để không làm thay đổi English-group semantics của notice/tombstone cũ.
5. Thêm catalog audit events, index cho grade/catalog/history/audit. Không thêm bảng điểm tổng.
6. Catalog/audit mới có RLS enabled và không cấp direct table access cho anon/authenticated. RPC mới SECURITY DEFINER, explicit actor/class checks, fixed search_path, revoke PUBLIC/anon; chỉ authenticated gọi public API. Legacy dispatcher và helpers không callable bởi client.
7. Khóa hàng class/assignment trong transaction thao tác để unassign/deactivate không vượt qua authorization check giữa chừng. Teacher cần lớp active; Admin đọc oversight của lớp hiện hữu kể cả đã khóa.
8. Admin history/audit/trash enforce grade/class pairing. Hard-delete audit được chiếu từ tombstone hiện hữu; không thay schema tombstone, quy tắc purge hoặc helper hard_delete của FEAT-002.
9. Leaderboard được reuse từ dispatcher FEAT-002 theo **một lớp** và window năm học/tuần hiện hành. Teacher history đọc dữ liệu trong lớp assigned; Student history vẫn cá nhân.

Không sửa migration 05/06/07; không đổi duplicate/AI thresholds/reminder/badges/English membership history.

## Acceptance Criteria Verification

**PASS dưới đây là bằng chứng local**: PostgreSQL chạy trong PGlite với `SET ROLE authenticated/service_role` và fixture `auth.uid()`, cùng real Vue SFC trên in-memory renderer. Không tương đương kiểm thử JWT/PostgREST/Edge/browser trên staging.

| AC | Kết quả | Evidence thực tế |
|---|---|---|
| AC-401 | PASS | DB test multi-class: aggregate toàn hệ thống và grade 7; Vue Admin filter/reset/stale response test. |
| AC-402 | PASS | So sánh nguyên mảng leaderboard Admin với Teacher cùng lớp; UI không load awards khi chưa chọn lớp. |
| AC-403 | PASS | DB history class/author/from/status filters và tombstone; Vue gửi filter đúng scope. |
| AC-404 | PASS | DB audit theo class/actor/action; time predicates; Vue filter controls. Hard-delete event lấy từ tombstone. |
| AC-405 | PASS | Admin create/update/deactivate catalog qua RPC; Vue save payload/error feedback. |
| AC-406 | PASS | Teacher load trả catalog active đúng grade, catalog inactive bị loại khỏi lựa chọn. |
| AC-407 | PASS | Teacher activate bằng catalog ID; payload tên/metadata chuẩn bị từ chối; Vue chỉ gửi metadata cấp lớp. |
| AC-408 | PASS | Teacher subject/group/submit RPC sang lớp chưa assigned bị từ chối; direct table/dispatcher cũ bị từ chối. |
| AC-409 | PASS | Student/Monitor không load hoặc mutate lớp khác; context chỉ trả lớp sở hữu. |
| AC-410 | PASS | Database từ chối mọi Admin notice operation; Vue không có tab board/AI/queue/English operations. |
| AC-411 | PASS | Backend trả nhiều assignments; Vue đổi lớp đóng editor, clear dữ liệu/inbox, bỏ stale response. |
| AC-412 | PASS | Snapshot ID/metadata môn trước/sau mapping và fixture có notices/reactions/audit/membership vẫn đọc được. |
| AC-413 | PASS | Metadata môn mơ hồ làm transaction abort; không tạo catalog hoặc mất môn cũ. |
| AC-414 | PASS | Deactivated catalog không thể re-activate môn lớp; notice/history cũ tiếp tục đọc. |
| AC-415 | PASS | English catalog giữ group isolation E1/E2 và loại môn; regression duplicate/notification scope PASS. |
| AC-416 | PASS | Trash filter riêng lớp; purge chỉ sau soft-delete; test tombstone không title/content/deadline; FEAT-002 hard-delete suite PASS. |
| AC-417 | PASS | Local role-based RPC/direct-table/private-helper rejection tests cho Teacher/Monitor/Student. Real JWT/PostgREST: NOT RUN. |
| AC-418 | PASS | Scope predicates và forged grade/class rejection; tests class isolation cho metrics/history/audit/trash. |
| AC-419 | PASS | 30 FEAT-001/002 DB tests trên migration 08, 22 FEAT-003, 23 BUG-001, 13 AI/recovery/static và 3 warning tests. |
| AC-420 | PASS | So sánh snapshot classes/profiles/assignments/notices/reactions/contribution_events/English groups/membership; subject IDs giữ nguyên. |
| AC-421 | PASS | DB từ chối grade null/ngoài 6–12; shared Edge validator test từ chối thiếu/string/fraction; UI bắt buộc select, không parse code/name. Full Edge HTTP: NOT RUN. |
| AC-422 | PASS | Approved UUID vẫn thành grade 7 khi fixture code/name được đổi thành chuỗi không chứa grade. |
| AC-423 | PASS | Fixture có cả lớp approved và lớp unknown: abort trước thêm grade/catalog; cả hai lớp còn nguyên. |
| AC-424 | PASS | DB immutable-grade trigger và Edge validator chặn grade edit; dialog chỉ hiển thị grade, không cung cấp ô sửa. |

## Verification Results

| Verification | Result | Evidence |
|---|---|---|
| FEAT-004 database scenarios | 6/6 PASS | evidence/database.log |
| FEAT-004 Vue interactions + Edge grade validator | 9/9 PASS | evidence/ui.log |
| FEAT-001/002 behavior trên migration 08 | 30/30 PASS | evidence/regression-database.log |
| FEAT-003 UI regression | 22/22 PASS | evidence/regression-feat003.log |
| BUG-001 routes/Owl/permissions UI | 23/23 PASS | evidence/regression-bug001.log |
| AI/recovery/historical migration/static checks | 13/13 PASS | evidence/regression-other.log |
| Duplicate warning component | 3/3 PASS | evidence/regression-warning.log |
| **Tổng** | **106/106 PASS** | Không tính assert thành test riêng; không tính NOT RUN. |
| Frontend typecheck | PASS | vue-tsc -b exit 0; evidence/typecheck.log trống nghĩa là không diagnostic. |
| Frontend build | PASS | evidence/build.log; 1876 modules transformed. |
| Changed Edge package consistency | PASS | evidence/edge-package.log |
| Browser desktop/mobile/UAT | NOT RUN | evidence/browser.log — Cloud Chrome ERR_BLOCKED_BY_CLIENT khi mở local preview. |
| Full Supabase Auth/JWT/PostgREST, deployed Edge, real Groq | NOT RUN | Không có staging được provision trong task này; không dùng production để test. |
| Multi-session concurrency/load tests | NOT RUN | PGlite fixture một connection; lock ordering được self-review, chưa có bằng chứng concurrent PostgreSQL sessions. |
| Registration/AI review ngoài Báo bài end-to-end | NOT RUN | Không thay implementation subsystem đó; static/route checks không thay thế staging regression. |
| Lint | NOT RUN | Package không có lint script; typecheck/build được chạy riêng. |

Build còn cảnh báo có sẵn về classic script config.js/supabase-service.js và bundle trên 500 kB; không phải build error. Các test Vue là real SFC + mock network, không phải screenshot hoặc browser UAT.

## Self Review → Fix → Re-test

- Sửa alias SQL trùng biến PL/pgSQL được test phát hiện; re-test database PASS.
- Bổ sung hard-delete event trong audit từ tombstone, vì FEAT-002 đã purge contribution events của notice; giữ nguyên redaction/purge semantics. Re-test tombstone và hard-delete suite PASS.
- Bỏ dispatcher cũ khỏi public schema và thu hồi execute; kiểm direct API/helper/table bypass.
- Đồng bộ Inbox với scope Báo bài; bỏ selector global trên trang để tránh hiển thị context lớp khác.
- Sau child management operation, refresh assignment để phản ánh unassign/deactivate; khi đổi scope bỏ form/selection và kết quả cũ.
- Gỡ code UI Admin cũ không còn reachable, giữ implementation notice dùng cho Teacher/learner.
- Kiểm dữ liệu cũ, canonical mapping, English scope, non-Teacher AI ownership và regression. Không thay permission matrix/BR/tombstone/AI semantics.

**Self Review Result: PASS cho source và các kiểm thử local đã chạy.** Các mục NOT RUN vẫn cần verification staging trước release.

## Deviations From Spec

NONE về business rules, permission matrix, approved grade mapping, tombstone và phạm vi chức năng. Không thêm grade ngoài 6–12; không cho ordinary class grade edit; không leaderboard liên lớp; không bulk delete.

## Known Risks / Remaining Verification

- PGlite fixture không tái tạo toàn bộ Supabase deployment/Auth service. Sol cần xem migration/privileged RPC; staging cần kiểm JWT các role, RLS/PostgREST, Edge create_class và toàn bộ regression liên quan.
- Chưa có browser evidence về mobile/layout/focus hoặc console thực tế. Component tests không chứng minh visual UAT.
- Snapshot bảo toàn dữ liệu là fixture local; không phải backup/restore verification của database đang vận hành. Khi chuẩn bị staging phải dùng baseline hiện tại và để preflight tự kiểm toàn bộ class inventory.
- Query performance và lock contention trên nhiều lớp/dữ liệu lớn chưa được load test.
- Migration 08 là one-time transactional upgrade, không phải script chạy lặp lại. Thêm lớp cũ chưa có mapping phải quay lại Product/Sol; không sửa mapping bằng suy đoán.

## Handoff

Gửi gói này cho Sol independent review. Chưa có approval release và chưa deploy production. Hướng dẫn tái lập local/staging có trong REVIEW_FEAT004.md. Các báo cáo task cũ trong ZIP là lịch sử; báo cáo FEAT-004 này là kết quả hiện hành.
