# STAGING VERIFICATION REPORT — VERIFY-001

**Mode: SIMULATION ONLY — theo yêu cầu người dùng.**  
Astra Effort: MEDIUM.  
Kết luận đối với baseline R3: **FAIL** do lỗi frontend đã tái hiện, được xử lý riêng theo FINAL SPEC **BUG-001**.  
Staging verification: **NOT COMPLETED**.  
Production Release Recommendation: **NOT_READY_FOR_RELEASE**.

## Environment

Local Node/Vitest/Vue và PGlite; dữ liệu hư cấu; không truy cập/ghi production trong lượt kiểm thử này. R3 ZIP nguyên vẹn, SHA256 `84248cba82b8e871381a27c88bc6edaec22933f8af10c84c3338ef55b4247f4e`.

Pre-fix BUG-001 tests chạy trên bản giải nén nguyên R3: 9 FAIL, 3 PASS. Sau khi người dùng gửi BUG-001 FINAL, thay đổi frontend được thực hiện trong working copy riêng theo task đó, không ghi thành implementation của VERIFY-001. Bộ backend/AI/migration R3 không đổi byte được chạy mới cùng bộ regression của candidate BUG-001.

Báo cáo này bổ sung kết quả mô phỏng; không thay thế hoặc biến preflight staging trước đó thành PASS.

## Migration

PASS mô phỏng: migration 05 trên schema fixture tương thích; nâng actual R2 SQL lên 06 hai lần, bảo toàn notice/error audit và retry cùng revision thành công. **NOT RUN**: nâng staging từ toàn bộ V9 hiện có và kiểm checksum dữ liệu staging thực tế. Fixture chỉ có các bảng/cột nền mà FEAT-001 cần, không phải bản sao đầy đủ V9.

## Browser/UAT

**NOT RUN trên trình duyệt.** BUG-001 dùng component Vue thật với custom renderer trong bộ nhớ, click handlers và watcher thật. Kết quả 19/19 không chứng minh layout/CSS, native DOM event, hash navigation, console hay hành vi trên thiết bị.

## Auth

**NOT RUN login thật.** Auth store/claims được mô phỏng. Router guard/metadata thật kiểm navigation theo bốn role; PGlite mô phỏng `auth.uid()` và PostgreSQL roles. Không chứng minh JWT signature/session/refresh trên Supabase.

## RLS

PASS trong phạm vi SQL fixture: table RLS enabled, ACL, quyền RPC, actor inactive/cross-class, student publish/AI finalizer bị từ chối. **NOT RUN** kiểm policies trên staging Supabase với JWT thật.

## API bypass

PASS mô phỏng các RPC/role SQL trực tiếp đã có trong tests; client không gọi được service-only AI finalizer, không publish sau AI error bằng review decision hoặc spoofed payload. **NOT RUN** HTTP/PostgREST/Edge bypass bằng JWT thật.

## Groq

**NOT RUN provider thật.** Semantic outputs và provider error dùng fixture; logic validate output/candidate và SQL state transitions chạy thật.

## Edge Function

Chỉ `logic.js` và SQL được thực thi trong suite. **NOT RUN Edge Function deployed**, token verification/network/CORS. Không deploy Edge.

## Scheduler

Backlog behavior được gọi qua RPC và dịch thời gian của dữ liệu fixture. **NOT RUN scheduler/pg_cron thật** hoặc chứng minh tác vụ tự chạy khi không ai mở ứng dụng.

## Regression

26/26 FEAT-001 tests, 3/3 warning render, 3/3 existing static regression, build/typecheck PASS. BUG-001 frontend: 19/19 PASS. Registration/AI review/notifications/history/auth/class membership end-to-end hiện có: **NOT RUN**. Các test Owl riêng xác nhận context Registration/Schedule/Review còn hoạt động ngoài Homework.

## 36 checks bắt buộc — phạm vi thực sự đã kiểm

`PASS (mô phỏng)` chỉ nói test fixture đạt; không đồng nghĩa staging PASS. `PARTIAL` là có evidence một phần nhưng chưa kiểm đủ mục đó.

| # | Check | Result / evidence thực tế |
|---|---|---|
| 1 | Migration từ V9 staging | NOT RUN; chỉ migration fixture và actual R2 → R3. |
| 2 | Bảo toàn toàn bộ dữ liệu cũ | PARTIAL; notice/error audit R2 fixture giữ nguyên, toàn bộ V9 NOT RUN. |
| 3 | Login 4 role | NOT RUN; role/auth fixture không phải login. |
| 4 | Student đăng Báo bài | PASS (mô phỏng SQL submit). |
| 5 | Deadline bắt buộc + sorting | PARTIAL; deadline null bị từ chối; chưa có assert sorting độc lập. |
| 6 | Dynamic subject | PASS (mô phỏng SQL subject_save và sử dụng subject). |
| 7 | English isolation | PASS (mô phỏng feed/post/candidate/notification). |
| 8 | Reaction duy nhất | PASS (mô phỏng; gửi lặp còn một row). |
| 9 | Không tự tim | PASS (mô phỏng SQL từ chối). |
| 10 | Exact duplicate | PASS (logic thật, normalized match score 100, không gọi semantic provider). |
| 11 | Semantic <70% | PARTIAL; SQL score 0 publish được kiểm, Groq semantic thật NOT RUN. |
| 12 | Semantic 70–89% | PASS (mô phỏng score 70/80 pending, logic output 89.9 hợp lệ); provider thật NOT RUN. |
| 13 | Semantic ≥90% | PASS (mô phỏng score 90 reject); provider thật NOT RUN. |
| 14 | keep_existing | PASS (mô phỏng SQL). |
| 15 | replace_existing | PASS (mô phỏng SQL). |
| 16 | keep_both + reason | PASS (mô phỏng SQL, reason rỗng bị từ chối). |
| 17 | Duplicate private/history | PASS (mô phỏng load/history). |
| 18 | Monitor queue allow-list | PASS (mô phỏng exact allow-list test R-004). |
| 19 | Monitor không quyết định | PASS (mô phỏng SQL từ chối). |
| 20 | Teacher không cấu hình thi đua | PASS (mô phỏng SQL từ chối). |
| 21 | Admin cấu hình đúng phạm vi | PASS (mô phỏng integer threshold, invalid/extra fields bị từ chối). |
| 22 | Candidate ≤24h | PASS (mô phỏng boundary 24h và 24h+1s). |
| 23 | Deadline edit ≥24h re-check | PASS (SQL + logic fixture; stale result bị từ chối). |
| 24 | Reminder 6h/2/10 | PASS (mô phỏng timestamps/actor quotas; reject không thêm event). |
| 25 | Soft delete + restore | PASS (mô phỏng SQL; feed/reaction eligibility). |
| 26 | Leaderboard + badges | PASS (mô phỏng current validity, week counts, seed, dense rank). |
| 27 | Backlog ≥5, ≥24h | PASS (mô phỏng opt-in/throttle/reset/re-arm qua RPC); scheduler thật NOT RUN. |
| 28 | Admin default không bị nghiệp vụ làm phiền | PARTIAL trên R3: backend alert opt-in đạt; Owl fallback lỗi được xác nhận trong BUG-001 rồi sửa ở candidate. |
| 29 | AI error → same revision retry → success | PASS (SQL thật trong PGlite; provider failure mô phỏng, audit được giữ). |
| 30 | Retry không publication bypass | PASS (SQL: spoof/review bypass denied, finalized/stale guards). |
| 31 | Direct HTTP API/RPC JWT các role | NOT RUN HTTP/JWT; có test SQL role/ACL mô phỏng. |
| 32 | Existing Registration flow | NOT RUN E2E; chỉ legacy static regression và Owl context. |
| 33 | Existing AI review flow | NOT RUN E2E; chỉ Owl Review context. |
| 34 | Existing notifications/history/auth/membership | NOT RUN E2E toàn app; FEAT-001 own notification/history/scope có test fixture. |
| 35 | Browser console không critical | NOT RUN. |
| 36 | Groq thật + Edge thật | NOT RUN. |

## Acceptance Criteria — staging gate

Các AC yêu cầu staging chưa được kiểm chứng đầy đủ được ghi FAIL gate kèm NOT RUN, không kết luận có lỗi implementation nếu chưa có evidence lỗi.

| AC | Gate | Evidence / reason |
|---|---|---|
| AC-V001 | FAIL | NOT RUN full V9 staging migration/data preservation. |
| AC-V002 | FAIL | SQL permissions mô phỏng PASS; real backend JWT/Auth integration NOT RUN. |
| AC-V003 | FAIL | English isolation fixture PASS; staging leak checks NOT RUN. |
| AC-V004 | FAIL | SQL duplicate branches PASS; full real Edge/Groq/UI flow NOT RUN. |
| AC-V005 | FAIL | Same-revision recovery fixture PASS; real provider outage/recovery NOT RUN. |
| AC-V006 | FAIL | Bypass fixture PASS; direct staging client/API verification NOT RUN. |
| AC-V007 | FAIL | Rate limits fixture PASS; staging verification NOT RUN. |
| AC-V008 | FAIL | Backlog fixture PASS; staging scheduler/inbox verification NOT RUN. |
| AC-V009 | FAIL | Existing E2E regression flows NOT RUN. |
| AC-V010 | FAIL | R3 frontend bugs reproduced; browser UAT NOT RUN; BUG-001 fix chờ Sol review. |
| AC-V011 | PASS | Chỉ công nhận các commands thực sự chạy; mô phỏng, partial và NOT RUN được tách rõ. |

## Issues Found

1. Admin R3 `/homework` redirect về `/admin` trước metadata check. Pre-fix test nhận `/admin` thay `/homework`.
2. Owl R3 không có context Báo bài, nhận Dashboard/registration và không cập nhật theo tab. Pre-fix test in ra Dashboard hoặc yêu cầu chỉnh sửa đăng ký.
3. Composer R3 dùng “Gửi lời nhắc cho lớp”. Pre-fix render test không có heading “Đăng Báo bài”.

Ba lỗi này có task riêng **BUG-001 FINAL** và đã được sửa trong candidate, với 19 tests đạt. Không coi BUG-001 là đã được Sol APPROVED. Không có thêm bug backend được xác nhận bởi bộ test đã chạy; điều đó không chứng minh hệ thống không còn bug.

## Evidence

- `../bug-001/evidence/red.txt`: reproduction trên R3 trước sửa.
- `../bug-001/evidence/green.txt`: candidate BUG-001, 19/19.
- `../bug-001/evidence/homework.txt`: 26/26 backend/AI/migration mới chạy.
- `../bug-001/evidence/warning-ui.txt`: 3/3 render.
- `../bug-001/evidence/legacy.txt`: 3/3 static regression.
- `../bug-001/evidence/build.txt`: build/typecheck exit 0.
- `../bug-001/evidence/scope-integrity.json`: source R3 SHA256 và các file backend/API được giữ nguyên byte.
- Test source đầy đủ trong `tests/homework/` và `tests/bug-001/` để Sol tái lập.

## Production Release Recommendation

**NOT_READY_FOR_RELEASE** theo gate VERIFY-001 hiện hành. Candidate BUG-001 đủ evidence mô phỏng để gửi Sol review; staging/browser/Groq thật và các mục NOT RUN vẫn cần kiểm trước khi kết luận READY theo FINAL SPEC VERIFY-001.
