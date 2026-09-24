# Implementation Report — FEAT-001

- Task ID: FEAT-001 — Báo bài V1.
- Astra Effort: MEDIUM (mặc định LOW; nâng khuyến nghị vì schema, quyền/RLS, migration, toàn vẹn dữ liệu và concurrency).
- Vai trò: Senior Implementation / Database-Backend / Test Engineer / Debugger; quyết định HOW, giữ WHAT của FINAL SPEC.
- Trạng thái: READY_FOR_REVIEW — R3 xử lý R-001/R-005/R-006; chưa phát hành. Xem FIX_REPORT_R3.md. Product Owner đã xác nhận “chốt” bốn ngưỡng; Astra ghi lại nguyên quyết định trong bản tài liệu chuẩn của gói.
- Căn cứ: FINAL_PERMISSION_RESOLVED, PROJECT_CONTEXT, DECISIONS, WORKFLOW, quyết định Báo bài bổ sung và bốn quy tắc định lượng do Product Owner cung cấp. Bản spec cũ được thay thế, không dùng làm gate.

## Implementation Summary

Subsystem `/homework` độc lập với nghiệp vụ đăng ký tự học; reuse auth, context lớp/năm/tuần, navigation, banner và Supabase client có sẵn. Bảng Báo bài có môn động, deadline theo Việt Nam, English groups, lịch sử riêng, tim, reminder, bảng tuyên dương, queue giáo viên, audit và thùng rác. Admin vào tổng quan/cấu hình; mặc định chỉ nhận lỗi hệ thống.

Database là nơi kiểm tra quyền và trạng thái. Client không thể tự gán author/status/AI score, quyết định duplicate hay vượt English group bằng gọi RPC trực tiếp. RLS default-deny kết hợp thu hồi quyền table và RPC SECURITY DEFINER có search_path cố định. Monitor chỉ nhận thông tin nghiệp vụ trong queue pending, không score/reason/audit. Teacher không sửa thi đua; Admin chỉ đổi ngưỡng Mầm xanh nguyên dương.

AI chạy server: exact trước semantic; candidate trong cửa sổ 24h, cùng scope; kiểm tra kết quả provider và candidate ID; lỗi giữ pending. Dùng request_id chống submit lặp, revision + fingerprint chống kết quả lỗi thời, khóa transaction theo lớp và actor reminder. Không dùng kết quả AI từ frontend.

Điểm thi đua không cộng thành một tổng: đếm notice hợp lệ và reaction thật riêng, dense rank đồng hạng, tuần theo Asia/Ho_Chi_Minh và năm học, loại teacher/admin, deleted/rejected/replaced/pending không tính. Restore giữ lịch sử, đánh giá lại khi board thay đổi; giữ cả hai đã được duyệt không bị tự vô hiệu sau restore.

## Files Changed

Danh sách chính xác trong `FILES_CHANGED.txt`; không tính node_modules và cache TypeScript. Nhóm thay đổi:

- `database/upgrade/05-FEAT-001-BAO-BAI.sql`: cài mới schema/RPC. `06-FEAT-001-AI-RECOVERY.sql`: nâng từ R2, bảo toàn dữ liệu và ACL.
- `supabase/functions/homework-review/index.ts`, `logic.js`: server orchestration và duplicate logic.
- `src/features/homework/api.ts`: API/types, timezone.
- `src/pages/HomeworkPage.vue`: các luồng Báo bài và quản trị.
- `src/components/homework/HomeworkCard.vue`, `HomeworkInbox.vue`: card/thao tác và notification inbox.
- `src/app/router/routes.ts`, `src/features/navigation/navigation.ts`, `src/components/layout/TopBar.vue`, `src/components/ui/page-artwork-glyphs.ts`: tích hợp navigation/layout tối thiểu.
- `package.json`, `package-lock.json`: dev dependency PGlite 0.3.14 và script test:homework.
- `tests/homework/*`: fixture database, 26 kiểm thử Node (4 AI, 22 database/recovery/migration) và 3 kiểm thử render warning, fixture UI local.
- `docs/feat-001/*`: spec/context/decisions/workflow, bổ sung định lượng, hướng dẫn và báo cáo.
- `dist/`: được tạo lại bằng build mới, không cần sửa tay.

## Database Changes

12 bảng cộng thêm: class_subjects, english_groups, english_group_members, homework_settings, homework_admin_preferences, homework_notices, homework_notice_reactions, homework_duplicate_reviews, homework_notice_reminders, homework_contribution_events, homework_notifications, homework_backlog_state.

RPC public: homework_api cho authenticated; homework_ai và homework_maintenance chỉ service_role. Các helper private bị thu hồi quyền truy cập. RLS bật trên toàn bộ 12 bảng và không mở table access cho client. FK scope lớp/môn/nhóm, unique reaction, unique request và membership hiện hành; CHECK deadline hữu hạn, nội dung và ngưỡng.

Migration transaction một lần, không đổi bản ghi cũ; chưa chạy trên Supabase. Cron tự cài nếu extension đã có; nếu chưa có cần operator cài scheduler sau khi duyệt. Không thay schema đăng ký tự học.

## Acceptance Criteria

PASS dưới đây chỉ có nghĩa đã kiểm tra trong phạm vi ghi ở cột bằng chứng. NOT RUN nghĩa chưa đủ kiểm chứng tiêu chí giao diện/end-to-end, dù code đã có. Không suy ra staging/production PASS từ PGlite hoặc build.

| AC | Nội dung | Kết quả | Bằng chứng / giới hạn |
|---|---|---|---|
| 001 | HS đăng Báo bài | PASS | RPC authenticated tạo notice đúng author; Edge/Groq live NOT RUN |
| 002 | Deadline bắt buộc | PASS | Database từ chối due_at null |
| 003 | Sắp deadline gần → xa | NOT RUN | SQL ORDER BY due_at, UI phân sắp tới/quá hạn; chưa browser |
| 004 | Tab môn động | NOT RUN | Frontend lấy subjects runtime; chưa browser |
| 005 | GV quản lý môn | PASS | RPC teacher tạo môn; student bị từ chối |
| 006 | English groups | PASS | Database tạo/gán nhóm, lọc candidate theo nhóm |
| 007 | HS chỉ thấy nhóm của mình | PASS | Test feed/submit/candidate/inbox và chuyển nhóm |
| 008 | Một tim/người/bài | PASS | Gọi heart lặp vẫn chỉ một reaction |
| 009 | Không tự tim | PASS | RPC tự tim bị từ chối |
| 010 | Lịch sử đăng | PASS | RPC history của tác giả chứa bài rejected; UI NOT RUN |
| 011 | Kiểm tra trước publish | PASS | Submit luôn pending, chỉ server finalizer/manager được quyết định; logic exact/semantic test |
| 012 | Nghi trùng không public | PASS | Score 70/80 pending không vào notices |
| 013 | Bài trùng trong lịch sử | PASS | Score 90 rejected vẫn trong history tác giả |
| 014 | Ưu tiên bài trước | PASS | Bài gốc giữ published khi bài sau pending/rejected; snapshot ưu tiên trước |
| 015 | GV thấy nghi trùng | PASS | Queue scoped manager, monitor limited; UI NOT RUN |
| 016 | Giữ bài cũ | PASS | RPC keep_existing đưa bài sau về rejected |
| 017 | Giữ bài mới | PASS | RPC replace_existing chuyển gốc replaced, mới published |
| 018 | Giữ cả hai | PASS | RPC keep_both giữ hai bài public |
| 019 | Giữ cả hai cần lý do | PASS | Lý do trống bị từ chối |
| 020 | Cả hai tính đóng góp | PASS | Cả hai published; leaderboard đối chiếu số published thực tế |
| 021 | Chim sẻ đưa tin | NOT RUN | UI và notice_rank có; chưa browser xác nhận danh hiệu |
| 022 | Ngôi sao dẫn đường | NOT RUN | UI và heart_rank có; chưa browser xác nhận danh hiệu |
| 023 | Mầm xanh đóng góp | PASS | Ngưỡng admin/seed_at được test; UI NOT RUN |
| 024 | Bảng tuần | PASS | Test week_id, mốc Việt Nam và đối chiếu counts; UI NOT RUN |
| 025 | Dữ liệu năm học | PASS | Load không week, year_notices/seed_at; UI điều hướng năm NOT RUN |
| 026 | Bài trùng không tính | PASS | Counts chỉ published, rejected không vào bảng |
| 027 | Bài xóa không tính | PASS | Delete giảm notice count và heart count |
| 028 | Không xếp GV/Admin | PASS | Leaderboard test loại hai role |
| 029 | Tim từ reaction thật | PASS | Insert qua RPC, unique, delete invalidation giảm count |
| 030 | Không điểm tổng | PASS | Response tách notices/hearts; không points |
| 031 | Admin không nhận bài thường mặc định | PASS | Backlog/default và all opt-in tests |
| 032 | Mặc định lỗi hệ thống | PASS | Default system và quyền opt-in được test; lỗi hạ tầng live NOT RUN |
| 033 | Có mức cảnh báo | PASS | RPC system/backlog/all; UI NOT RUN |
| 034 | Admin thấy trạng thái | NOT RUN | API health + UI overview có; chưa browser |
| 035 | Có audit | PASS | Mutation/audit và quyền scope được kiểm tra trong database |
| 036 | Restore | PASS | Test soft-delete/restore/keep-both và bảo toàn lịch sử |
| 037 | Quyền quản lý bài người khác | PASS | Teacher delete/decisions, student denied, monitor guard trong RPC; UI NOT RUN |
| 038 | Quyền nhắc | PASS | Student denied; teacher/monitor/admin rate-limit; không event khi chặn |
| 039 | Monitor limited queue | PASS | Pending-only, không score/reason/technical history; projection trường cơ bản |
| 040 | Monitor không override AI | PASS | Direct review/ai_settings/settings bị từ chối; service finalizer ACL |
| 041 | Teacher không cấu hình thi đua | PASS | RPC settings bị từ chối; không cơ chế cấp quyền runtime |
| 042 | Admin chỉ đổi seed nguyên dương | PASS | Chấp nhận hợp lệ; từ chối 0, 1.5, trường cố định ngoài seed |
| 043 | Candidate deadline ≤24h và đúng scope | PASS | Test boundary 24h / 24h+1s, English scope |
| 044 | Edit deadline ≥24h re-check | PASS | Test edit 24h, stale revision, semantic material edit |
| 045 | Reminder đủ ba hạn mức | PASS | Test spacing 6h, quota notice 2, actor 10; không event khi bị chặn |
| 046 | Backlog tuổi/số lượng/opt-in/throttle/reset | PASS | Test aged pending, default/opt-in và re-arm |

## Verification Results

- `npm run test:homework`: PASS — 26 tests, 0 fail, 0 skip (vòng sửa review R3). Thực thi SQL thật trên PostgreSQL nhúng PGlite; auth.uid dùng fixture claims, không Supabase Auth thật.
- `npm test`: PASS — 3 tests regression có sẵn, 0 fail.
- `npm run build`: PASS — vue-tsc -b và Vite, 1.867 modules; build CSS/JS thành công. Có cảnh báo legacy config.js/supabase-service.js không phải module, pattern có sẵn.
- Typecheck frontend: PASS trong build. Deno Edge runtime/typecheck riêng: NOT RUN — chưa có Deno runtime/cấu hình Supabase staging được cấp cho task.
- Lint: NOT RUN — project không có lint script cấu hình.
- `npm run test:homework:ui`: PASS — 3 kiểm thử Vue SSR cho cảnh báo, trường bắt buộc và không lộ candidate private. Đây không phải browser/click test.
- Browser/UI: NOT RUN — browser trả net::ERR_BLOCKED_BY_CLIENT khi truy cập localhost fixture. Không có screenshot/bằng chứng UAT.
- Migration trên database production/staging đầy đủ: NOT RUN — chỉ có source ZIP, không có kết nối database được cấu hình cho dự án này.
- Supabase Auth JWT, PostgREST/RLS live, Edge deploy/CORS, Groq thật: NOT RUN — không có môi trường tích hợp thực tế.
- Concurrency nhiều session thực: NOT RUN — PGlite trong test một connection. Đã test stale revision/fingerprint và rate-limit tuần tự; không gọi đó là concurrency stress PASS.
- Scheduler thực: NOT RUN — chỉ test thuật toán backlog, throttle và reset bằng database fixture.

## Deviations From Spec / lựa chọn HOW cần Sol xem

Không thay Business Rules, permissions, tên danh hiệu hay scope trong vòng sửa này. R-001: Product Owner đã xác nhận “chốt”; các giá trị được ghi vào FINAL_SPEC.md và DECISIONS.txt (DEC-029–032), giữ nguyên DEC-001–028. Không thay con số trong code. Thùng rác và notification Báo bài là bảng riêng, tích hợp navigation/inbox, không trộn dữ liệu đăng ký tự học.

R-002 đã sửa: loại bỏ hoàn toàn quyết định `publish_after_error` khỏi schema/RPC/UI. AI lỗi hoặc chưa có candidate hợp lệ thì giữ pending; không cho teacher/admin công bố qua đường không được SPEC định nghĩa. Candidate có thể chặn bài mới chỉ gồm published hoặc pending trước đó trong scope; bản đã bị thay thế/từ chối không được dùng làm bài gốc để chặn tiếp. Lịch sử các bản đó vẫn giữ.

Không có automation mới cho thông báo sắp đến hạn ngoài reminder thủ công và hiển thị deadline trên board. SPEC mô tả GV nhận thông tin sắp hạn nhưng chưa khóa trigger của automation này; báo cáo không coi automation sắp hạn là đã triển khai.

## Known Risks

1. Chưa có kiểm chứng giao diện và hạ tầng live; cần Sol/staging UAT trước phát hành. Các AC NOT RUN chưa được ký đạt.
2. PGlite fixture chỉ tái hiện các cột baseline được dùng, không áp toàn bộ migration lịch sử/extension/trigger Supabase; phải kiểm tra trên bản sao database thực tế.
3. Semantic AI có false positive/negative và phụ thuộc provider; queue cùng quyền override giáo viên là đường xử lý. Batch candidate không bị cắt số lượng nhưng nhiều batch có thể vượt thời gian Edge, khi đó giữ pending.
4. Cron chưa có thì tồn đọng không tự cảnh báo lúc hệ thống không có truy cập. DEPLOYMENT.md nêu gate scheduler.
5. Queue đang so sánh với một bài gốc bị thay đổi/xóa trong lúc chờ sẽ từ chối quyết định lỗi thời; cần mở sửa/gửi lại để chạy check mới. Không tự phán quyết nghiệp vụ.
6. Hiệu năng lookup leaderboard/candidate cần đo với số lượng thực tế; V1 một lớp dùng khóa lớp để ưu tiên nhất quán.

## Self Review Result

Đã đối chiếu BR, AC, quyền frontend/backend, API bypass, AI secrets, lock/revision, dữ liệu cũ, scope file, duplicate/dead code mới. Đã FIX rồi RE-TEST:

- Reminder cũ có thể lộ nội dung sau khi học sinh chuyển English group: lọc lại inbox bằng visibility hiện hành.
- Kết quả AI đến sau khi tác giả/lớp bị vô hiệu: giữ pending và audit.
- Admin opt-in all không nhận sự kiện thường: thêm đúng người nhận opt-in.
- Restore bài đã được keep_both có thể bị treo lại: giữ quyết định đã duyệt nếu nội dung không đổi.
- Monitor queue trả thừa metadata: projection chỉ còn trường nghiệp vụ.
- Candidate đã replaced/rejected có thể chặn bài mới: loại bản không còn hợp lệ làm bài gốc.
- Test actor quota bị notice quota che: dời reminder bài đích ra ngoài cửa sổ trước khi kiểm tra giới hạn actor.

Không có thay đổi hay mất dữ liệu production; không có file baseline bị xóa. Self-review các fix đã hoàn tất; bốn ngưỡng R-001 đã được ghi nhận theo phê duyệt, R-005/R-006 đã sửa; kiểm chứng phát hành chưa hoàn tất do các mục NOT RUN. Chuyển Sol review độc lập, không tự đóng task ACCEPTED/PASS toàn phần.

## Cập nhật sau Sol review R2

- R-002: test mô phỏng AI lỗi dù có candidate; mọi quyết định công bố ngoài luồng hợp lệ bị từ chối, không sinh audit review thành công.
- R-003: cảnh báo rõ dữ liệu bài đã có và hai nút Xem/Sửa; chỉ tra feed published đã được backend lọc. Không truy cập private candidate để hiển thị cho học sinh.
- R-004: helper queue_card dùng jsonb_build_object allow-list, kiểm tra exact keys ở cả bài mới và bài so sánh. ID chỉ là khóa liên kết bản ghi; không icon/published_at/metadata AI.
- Test stale deadline trước đây dùng đường publish_after_error để chuẩn bị dữ liệu đã được sửa sang snapshot AI mới hợp lệ; không khôi phục bypass để làm test xanh.

## Cập nhật R3 — AI recovery và migration

- Error attempt không được xem là finalized; snapshot/finish chỉ đánh dấu done khi đã có score hoặc decision cuối.
- Retry qua Edge kiểm tra quyền RPC hiện hành; không tin content/status/score từ client và không tăng revision hay reset pending_since. Có nút thử lại trong history và manager queue khi phù hợp.
- AI score/decision đã hoàn tất không bị retry ghi đè, kể cả kết quả/error đến muộn. Class lock bảo vệ commit.
- Migration 06 nâng từ R2 không xóa dữ liệu; test kiểm tra chạy lại an toàn và bảo toàn notice/audit lỗi cũ.
- Những trường hợp request song song vẫn có thể gọi provider nhiều lần, nhưng kết quả commit được bảo vệ; chưa tuyên bố exactly-once provider hoặc concurrency nhiều session đã PASS.
