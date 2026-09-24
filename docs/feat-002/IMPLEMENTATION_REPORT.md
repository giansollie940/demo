# IMPLEMENTATION REPORT — FEAT-002

Task ID: **FEAT-002**  
Status: **READY_FOR_REVIEW**  
Astra Effort: **MEDIUM**  
Ngày verification: **2026-09-10**  
Production deployment: **NOT DEPLOYED**

## Source of truth

Đã đọc PROJECT_CONTEXT, WORKFLOW, DECISIONS hiện hành DEC-001–032, FINAL SPEC FEAT-002 và DECISIONS UPDATE DEC-033–037. Hai file được gửi lại cuối lượt có nội dung giống hoàn toàn bản đang triển khai. Các bản nguyên văn nằm trong thư mục này; DECISIONS.txt hợp nhất có đánh dấu superseded.

Baseline: `BUG-001-BAO-BAI-FRONTEND-REVIEW.zip`, SHA256 `d24521960db386302c766b33b421b0ff4cb71b3147ba3365589f8af9d33b6660`. Dựng bản sao riêng từ gói này, kế thừa FEAT-001 R3. Không sửa baseline, không triển khai lại FEAT-001. Source SQL/RPC/Edge/UI đã được khảo sát trước khi sửa. Đối chiếu read-only database hiện có xác nhận subsystem homework và constraint `homework_settings_check` tương thích; không chạy DDL hay thử xóa dữ liệu trên môi trường đó.

## Files Changed

| File | Thay đổi |
|---|---|
| `database/upgrade/07-FEAT-002-PERMISSIONS-LIFECYCLE.sql` | Migration additive: quyền RPC, Teacher AI settings, actionable queue/notifications/backlog, immutable tombstone, purge và FK references. |
| `supabase/functions/homework-review/logic.js` | Khi semantic tắt, bỏ cả edit classifier và semantic comparison; vẫn chạy normalized exact check. |
| `src/features/homework/api.ts` | Types cho AI settings, history markers, tombstones và review history. |
| `src/features/homework/view-context.ts` | Tab permissions FEAT-002 và tín hiệu refresh inbox sau mutation. |
| `src/pages/HomeworkPage.vue` | Admin oversight; Teacher AI; hard-delete dialog; redacted history; tách rejected review history khỏi actionable queue. |
| `src/components/homework/HomeworkCard.vue` | Admin không có notice mutation hoặc thả tim. |
| `src/components/homework/HomeworkInbox.vue` | Refresh khi page mutation hoàn tất. |
| `src/features/owl/owl-model.ts` | Hướng dẫn theo tab/role mới, Admin không được hướng dẫn đăng/restore. |
| `tests/feat-002/{database,ai,upgrade}.test.mjs` | Permission, settings, migration preservation, purge/rollback/FK, history, lifecycle, retry và sequential hard delete. |
| `tests/homework/{database,recovery,review}.test.mjs` | Có chế độ chạy regression trên migration 07; điều chỉnh actor quota/retry theo permission mới. |
| `tests/bug-001/{regression.test.ts,renderer.ts}` | Giữ route/Owl regression, cập nhật tab matrix và thêm UI FEAT-002; hỗ trợ directive v-model trong renderer. |
| `package.json` | Thêm `test:feat-002`. Không thêm dependency, lockfile giữ nguyên. |
| `README-FEAT-002.md`, `docs/feat-002/` | Hướng dẫn, SPEC/decisions, patch, báo cáo và evidence. |
| `dist/` | Build frontend mới. |

Danh sách chính xác: `FILES_CHANGED.json`. Diff source/tests: `CHANGES.patch`. Không sửa Auth, Registration, provider credentials hoặc các Edge Function khác. Migration 05/06 được giữ nguyên làm lịch sử.

## Implementation Summary / BR mapping

| Business Rule | Implementation |
|---|---|
| BR-201, BR-202 | Admin RPC có allow-list oversight/system settings/hard_delete. Reject notice mutations trước khi xử lý payload. UI/Owl dùng cùng tab resolver; Teacher giữ operation trong scope hiện hành. |
| BR-203 | Chỉ Teacher trong lớp được lưu đúng ba setting. Backend kiểm JSON type, integer, khoảng 0–100, lower < upper và chặn field khác. Audit old/new/actor/time. Student/Monitor không nhận AI settings. |
| BR-204 | Exact check giữ nguyên; semantic disabled trả kết quả nonexact bình thường mà không gọi provider. Fingerprint gồm cấu hình AI để không finalize kết quả dựa trên cấu hình đã thay đổi. |
| BR-205–207 | Dùng chung predicate actionable cho pending chưa xóa/chưa quyết định. Queue, pending count, backlog và cảnh báo pending cùng áp dụng. Restore pending chưa resolve trở lại queue; comparison revision cũ không cho phép publish sau AI error. Rejected cases nằm ở lịch sử kiểm tra trong Nhật ký Teacher, không tính là pending. |
| BR-208 | Hard delete từng notice, Admin-only, row lock + class transaction lock, kiểm lại soft-deleted, confirmation boolean thật và reason text trim 1–500 ký tự. Gọi lại hợp lệ trả `already_deleted` và không thêm tombstone. |
| BR-209 | Purge notice, reaction, reminder, notifications, review và audit payload của notice. Redact payload so sánh liên quan ở notice khác. Không cascade master/Registration/other-subsystem audit. |
| BR-210 | Insert tombstone trước purge; trigger cấm UPDATE/DELETE/TRUNCATE; RLS default-deny và revoke direct access. Bất kỳ lỗi insert/FK sau đó đều rollback toàn transaction. |
| BR-211 | Tác giả nhận marker, ID dùng làm key và hai timestamp. Admin nhận metadata đầy đủ; Teacher nhận event redacted trong lớp. Người khác không có tombstone feed. |
| BR-212 | Chuyển incoming duplicate references sang tombstone FK, không xóa notice còn lại. Khi purge review thuộc notice bị xóa, lưu decision metadata tối thiểu cho target còn sống để lần hard delete tiếp theo vẫn có dấu vết đúng. |

## Database Changes

- Thêm `homework_settings.semantic_duplicate_enabled`, mặc định true. Cột threshold nội bộ hiện có được giữ để giảm thay đổi schema; RPC dùng tên canonical `duplicate_review_threshold` / `duplicate_auto_threshold`.
- Thay constraint threshold để cho phép lower = 0 đúng SPEC; defaults vẫn 70/90. Trường hợp không có candidate hợp lệ tiếp tục publish, kể cả lower = 0.
- Thêm `homework_tombstones` với đúng 18 field metadata RB-006, không chứa title/content/deadline/score/AI reason/prompt/reaction identities/reminder details.
- Thêm `homework_notices.duplicate_tombstone_id` và `homework_duplicate_reviews.candidate_tombstone_id`, FK không cascade.
- Cập nhật RPC/helpers; không cấp table access mới cho client. `homework_ai` vẫn chỉ service role. Actor của hard delete lấy từ session, không từ payload.
- Migration không purge/backfill hàng loạt dữ liệu cũ. Hard delete chỉ xảy ra khi Admin chủ động gọi action hợp lệ.
- Giữ scheduler hiện hành, sử dụng helper backlog đã sửa; không tạo lịch chạy thứ hai.

## Acceptance Criteria

PASS dưới đây là kết quả local automated verification, không phải chứng nhận staging/production.

| AC | Kết quả | Evidence thực tế |
|---|---|---|
| AC-201 | PASS | Vue: Admin board không composer/mutation; không queue/AI/subject/English tabs; audit/stats còn đọc được. |
| AC-202 | PASS | PostgreSQL RPC reject Admin submit/edit path, retry, heart, remind, delete, restore, review, subject/group operations. |
| AC-203 | PASS | Teacher lưu settings hợp lệ; audit trước/sau/actor/time; validation integer và boundary 0/100. |
| AC-204 | PASS | Student/Monitor/Admin RPC ai_settings bị reject; direct table access bị revoke. |
| AC-205 | PASS | Logic tests với callback ném lỗi nếu semantic được gọi: nonexact/edited notice khi tắt vẫn xử lý; normalized exact vẫn score 100. |
| AC-206 | PASS | Xóa pending: queue/inbox/notifications/pending count loại notice; history/audit còn; backlog resolve khi xuống ngưỡng. |
| AC-207 | PASS | Restore pending trở lại queue; retry revision hiện hành hoạt động. |
| AC-208 | PASS | Hard delete active bị reject, row trước/sau bằng nhau; restore thắng trước thì hard delete reject. |
| AC-209 | PASS | Purge child rows và notice; restore không còn target; reason/confirmation và bốn prior states được kiểm. |
| AC-210 | PASS | Inject tombstone insertion failure và downstream FK failure: rollback; trigger immutable chặn sửa/xóa/truncate. |
| AC-211 | PASS | Assert chính xác 18 keys và giá trị metadata; không field raw bị cấm. Sequential delete vẫn giữ decision summary đúng. |
| AC-212 | PASS | Assert chính xác keys marker/timestamps/ID; role khác không nhận personal marker; Vue hiển thị redacted marker. |
| AC-213 | PASS | Incoming references chuyển sang tombstone, notice khác vẫn published; outgoing decision trace còn; history query chạy được. |
| AC-214 | PASS | Notice/reactions biến khỏi nguồn tính; board/candidates/queue không lấy tombstone; remind/restore target bị reject. |
| AC-215 | PASS | Suite FEAT-002 + FEAT-001 trên schema upgraded; BUG-001 route/Owl/UI; regression tĩnh và warning component. |

## Verification Results

| Kiểm tra | Kết quả | Log |
|---|---|---|
| `npm run test:feat-002` | **43/43 PASS** | `evidence/feat-002.log` |
| `npm run test:bug-001` | **23/23 PASS** | `evidence/ui.log` |
| `npm run test:homework:ui` | **3/3 PASS** | `evidence/warning-ui.log` |
| `npm test` | **3/3 PASS** | `evidence/static-regression.log` |
| `npm run build` (gồm vue-tsc) | **PASS**, 1868 modules | `evidence/build.log` |
| Populated database upgrade | **PASS**, old notice/child/master values không đổi | Nằm trong suite 43 tests |
| Lint | **NOT RUN**: project không có lint script/config gate tương ứng | Không ghi PASS |
| Browser/UAT thật | **NOT RUN**: lần này dùng Vue virtual renderer; không có authenticated browser staging session | Không ghi PASS |
| Auth/JWT/PostgREST/Groq/Edge deployment thật | **NOT RUN**: không triển khai môi trường thật trong task này | Local roles/session claims và callback AI là mô phỏng |
| Hai transaction đồng thời qua hai connection thật | **NOT RUN**: PGlite harness một connection; đã kiểm thứ tự restore trước hard delete, stale snapshot và rollback, kèm review lock implementation | Cần concurrency staging test |
| Migration/scheduler trên staging | **NOT RUN**: chỉ local migration và helper backlog tests | Không chạy production DDL |

Runtime: Node v24.19.0, PGlite 0.3.14, Vitest 3.2.7, Vite 7.3.6. Không cài thêm dependency. Các tests R2→R3 lịch sử vẫn kiểm migration 06 riêng; main FEAT-001 behavior suites dùng migration 07 khi chạy `test:feat-002`.

Build có cảnh báo về hai legacy script không phải module và bundle trên 500 kB; không có type/build error. Các log `*-before.log` là bằng chứng failing test trước fix, không phải kết quả bàn giao cuối.

## Self Review Result

**SELF REVIEW → FIX → RE-TEST: PASS trong phạm vi local.**

- Đã map đủ BR/AC và kiểm quyền qua RPC, không chỉ ẩn nút.
- Đã sửa kiểm soát comparison hiện hành: restore rồi AI failure không được dùng comparison revision cũ để Teacher publish.
- Đã thêm settings vào fingerprint, chặn finalize in-flight theo cấu hình cũ.
- Đã phát hiện và sửa mất duplicate summary khi hai notice bị hard delete lần lượt. Test thất bại trước fix nằm ở `evidence/self-review-sequential-before.log`; test này PASS trong suite cuối.
- Đã sửa lỗi tên biến SQL bị ambiguous trong quá trình TDD. Harness test cũng được sửa đóng database đúng cuối suite và hỗ trợ v-model directive; kết quả cuối không còn lỗi harness/unhandled error.
- Kiểm tra rollback trước và sau khi bắt đầu purge; không thêm ON DELETE CASCADE.
- Giữ nguyên các rule candidate 24h, edit 24h, reminder 6h/2/10, backlog 5/24h; regression đã chạy.
- Không thêm duplicate/dead application code; không sửa source ngoài feature được liệt kê. Không thay provider/model/secret ownership. Lockfile và các migration cũ không đổi.

## Deviations From Spec

**NONE về business rules, permission matrix, hard-delete scope, tombstone payload và AI-setting ownership.** Việc giữ tên cột threshold nội bộ và thêm FK/event metadata redacted là quyết định HOW. Review history của rejected notices vẫn giữ Teacher review flow FEAT-001, tách khỏi actionable pending queue.

## Known Risks / Handoff

- Cần Sol independent review; chưa có Sol approval cho FEAT-002.
- Kết quả local không chứng minh Auth/JWT gateway, provider Groq, browser, scheduler hay multi-connection concurrency trên staging. Các phần đó được ghi NOT RUN, không suy diễn PASS.
- Migration 07 và Edge `logic.js` mới phải được phát hành cùng phiên bản. Không chạy lại migration 05/06 sau 07. Hướng dẫn nằm ở README-FEAT-002.md.
- FK ngoài subsystem không có trong baseline, nếu tồn tại, sẽ làm hard delete rollback thay vì cascade; cần khảo sát thêm trước triển khai một schema đã được tùy biến ngoài source này.

Bàn giao: **READY_FOR_REVIEW**. Không có production deployment hoặc release recommendation dựa riêng trên mô phỏng.
