# IMPLEMENTATION REPORT — BUG-001

Task ID: **BUG-001**  
Status: **READY_FOR_REVIEW**  
Astra Effort: **MEDIUM**  
Scope: Frontend fix trên FEAT-001 R3. Chưa deploy. Không thay đổi backend.

## Source of truth và baseline

- FINAL_SPEC.md: bản FINAL người dùng đính kèm cho BUG-001, sao chép nguyên văn.
- PROJECT_CONTEXT.txt, WORKFLOW.txt và DECISIONS.txt (DEC-001…032) đi kèm.
- Baseline: FEAT-001-BAO-BAI-V1-R3-REVIEW.zip.
- SHA256: `84248cba82b8e871381a27c88bc6edaec22933f8af10c84c3338ef55b4247f4e`.
- Dựng working copy riêng từ ZIP. Bản R3 gốc không bị sửa.

## Files Changed

Modified:

- `src/app/router/index.ts`: thêm chính xác `/homework` vào ngoại lệ Admin; giữ kiểm tra role metadata và các restriction còn lại.
- `src/features/owl/owl-model.ts`: nhánh Báo bài chạy trước khi đọc Registration/Schedule; context theo tab hợp lệ; thông điệp trung tính khi chưa có dữ liệu.
- `src/components/owl/WiseOwl.vue`: truyền tab hiện tại vào context builder. Watcher `contextual` hiện có reset message/cursor khi tab thay đổi; tiếp tục xử lý route/class/week.
- `src/pages/HomeworkPage.vue`: dùng chung tab permissions với Cú, chuẩn hóa tab khi role đổi, reset khi unmount, sửa tiêu đề tạo mới thành “✏️ Đăng Báo bài”.
- `package.json`: thêm lệnh `test:bug-001`. Không thêm dependency; lockfile giữ nguyên.

Created:

- `src/features/homework/view-context.ts`: danh sách tab giữ nguyên thứ tự/quyền R3, resolver tab hợp lệ và Pinia state cho tab đang mở.
- `tests/bug-001/regression.test.ts`: 19 tests cho router, Owl, role/tab boundaries và composer/reminder.
- `tests/bug-001/renderer.ts`: Vue renderer trong bộ nhớ, dùng render functions thật của component.
- `tests/bug-001/vitest.config.ts`: cấu hình riêng để chạy render functions client trong harness mô phỏng.
- `docs/bug-001/*`: SPEC, context/decision/workflow, patch, báo cáo và raw evidence.
- `docs/verify-001/SIMULATION_REPORT.md`: kết quả verification mô phỏng và các giới hạn staging.
- `README-BUG-001.md`: hướng dẫn review/build.

Generated: `dist/` build lại; các bundle cũ được thay bằng bundle mới do Vite sinh ra.  
Deleted source: **NONE**.

## Implementation Summary và BR mapping

| Rule | Implementation |
|---|---|
| BR-B001 | Chỉ nới đường dẫn `/homework`, kiểm tra metadata tiếp tục chạy. Không cho Admin vào các route Teacher/Student khác. |
| BR-B002 | Nhánh `homework` riêng, không còn fallback Dashboard. |
| BR-B003 | UI và Owl resolve từ cùng danh sách tab; role đổi làm tab bị cấm rơi về mặc định hợp lệ. |
| BR-B004 | Return context Báo bài trước mọi phép tính từ legacy registration/schedule; logic ngoài Báo bài giữ nguyên. |
| BR-B005 | Composer mới là Đăng Báo bài; composer sửa là Sửa Báo bài; card vẫn phát sự kiện remind. |
| BR-B006 | Không đổi API/Edge/SQL/permissions nghiệp vụ/duplicate/reminder/leaderboard. Byte comparison xác nhận. |

Không thêm notification nghiệp vụ hoặc số liệu giả cho Cú. Queue context của Monitor chỉ hướng dẫn xem và nói rõ giáo viên quyết định.

## Database Changes

**NONE.** Không migration mới; không đổi schema/RLS/RPC/Edge Function; không ghi dữ liệu thật. Các file backend có sẵn trong gói được giữ nguyên byte so với R3. Xem `evidence/scope-integrity.json`.

## Acceptance Criteria

PASS dưới đây là phạm vi automated/mô phỏng đã chạy, không phải UAT trên trình duyệt hoặc staging thật.

| AC | Status | Evidence |
|---|---|---|
| AC-B001 | PASS | Router thật + route records thật; Admin đi direct path và đích từ `visibleNavigation`; matched component là HomeworkPage. History adapter trong test là memory. |
| AC-B002 | PASS | 11 route Student/Teacher bị đưa về `/admin`; `/admin` và `/settings` vẫn được phép. |
| AC-B003 | PASS | 4 roles có page-context Báo bài; không có Dashboard/registration/urgent legacy. |
| AC-B004 | PASS | Fixture needs_revision; fixture lịch có buổi chưa đăng ký và buổi sắp bắt đầu: có cảnh báo ở Register, không lọt vào Homework. |
| AC-B005 | PASS | Submitted registration cần xử lý tạo urgent ở Review, không tạo urgent/fallback trong Homework, cho Teacher và Admin. |
| AC-B006 | PASS | Mount HomeworkPage + WiseOwl thật; bấm tuần tự 10 tab Admin và các tab của 3 role còn lại; nội dung Cú đổi đúng khi path giữ `/homework`. |
| AC-B007 | PASS | Tab giả/bị cấm được normalize; Admin đang ở Cấu hình đổi Student thì UI bỏ tab và Cú về Bảng Báo bài. |
| AC-B008 | PASS | Click mở composer, render heading “✏️ Đăng Báo bài”. |
| AC-B009 | PASS | Click Sửa trên card, render heading “Sửa Báo bài”. |
| AC-B010 | PASS | Click nút card “🔔 Nhắc” gọi boundary `homeworkRpc('remind','c',{id:'n'})`, không gọi submit; backend reminder tests cũng đạt. |
| AC-B011 | PASS | 19 tests, bao phủ đủ 5 regression bắt buộc và các role/tab/load-error boundary. |
| AC-B012 | PASS | 26 FEAT-001 + 3 render + 3 legacy regression + build (bao gồm vue-tsc) đạt. |

## Verification Results

| Command / check | Result | Raw evidence |
|---|---|---|
| Pre-fix regression trên R3 | 9 FAIL / 3 PASS, không unhandled errors | `evidence/red.txt` |
| `npm run test:bug-001` | 19/19 PASS | `evidence/green.txt` |
| `npm run test:homework` | 26/26 PASS | `evidence/homework.txt` |
| `npm run test:homework:ui` | 3/3 PASS | `evidence/warning-ui.txt` |
| `npm test` | 3/3 PASS | `evidence/legacy.txt` |
| `npm run build` | PASS; gồm `vue-tsc -b` và Vite | `evidence/build.txt` |
| Backend/API/card/navigation/lockfile byte comparison | PASS | `evidence/scope-integrity.json` |
| Lint | NOT RUN — project không có lint script/config riêng | N/A |
| Browser/UAT + Supabase Auth/PostgREST JWT + Groq/Edge thật | NOT RUN — đợt này chạy mô phỏng theo yêu cầu; chưa có staging riêng được cấu hình | N/A |
| Scheduler thật / nhiều transaction đồng thời | NOT RUN — PGlite fixture không cung cấp môi trường này | N/A |

Pre-fix log là bộ 12 test ban đầu trước thay đổi production. Bảy boundary tests bổ sung sau đó được đưa vào lượt cuối 19/19. Các sửa harness ban đầu (SSR compilation/DOM adapter và fixture selector) đã xử lý trước kết luận, không tính là lỗi sản phẩm.

Cảnh báo build sẵn có: `config.js` và `supabase-service.js` không có `type=module`; npm cũng báo environment config http-proxy. Build exit 0. Không báo browser console PASS từ log build.

Test doubles: auth/current user, legacy state, context class/week, RPC/network và daily quote. Router guard, metadata, navigation builder, Owl builder, Vue reactivity/watchers, HomeworkPage, WiseOwl và HomeworkCard là code thật. RPC spy chỉ xác nhận frontend gửi đúng action; quyền backend có suite PGlite riêng. Harness không chứng minh native DOM events, CSS, hash URL trên trình duyệt, CORS hoặc token thật.

## Deviations From Spec

**NONE** về behavior/business rules/scope. Live browser/staging chưa chạy được ghi rõ NOT RUN.

## Known Risks

- Chưa xác minh triển khai thực tế: Auth token, CORS, Edge/Groq, scheduler và browser UAT.
- PGlite dùng auth.uid/role fixture; không tương đương login Supabase hoặc kiểm thử race nhiều kết nối.
- Ba regression V9 hiện có chủ yếu là kiểm tra source; không thay thế UAT Registration/AI review end-to-end.

## Self Review Result

**PASS trong phạm vi BUG-001; READY_FOR_REVIEW cho Sol.**

Đã đối chiếu BR-B001…006 và AC-B001…012. Admin chỉ được mở thêm Homework; route metadata còn được enforce. Tab labels/order/permissions giữ nguyên R3. Cú không đọc dữ liệu legacy trong nhánh Homework và không giữ context bị cấm khi role đổi. Reminder action/payload, backend ACL/RLS/AI/retry, database và dữ liệu cũ không bị sửa. Không thêm dependency, dead helper hoặc thay đổi source ngoài phạm vi. Test trước sửa tái hiện lỗi; sau sửa 19 tests đạt; các suite liên quan và build đạt.

Không tự APPROVED và không đề xuất production release từ kết quả mô phỏng. Sol review BUG-001 trước bước quyết định tiếp theo của Product Owner.
