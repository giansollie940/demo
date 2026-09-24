# FEAT-001 — Astra Fix Report R3

Task ID: FEAT-001  
STATUS: READY_FOR_REVIEW  
Astra Effort: MEDIUM — recovery, auth/RPC, migration, late results và data integrity.  
Baseline: FEAT-001-BAO-BAI-V1-R2-REVIEW.zip.  
Gói bàn giao: FEAT-001-BAO-BAI-V1-R3-REVIEW.zip.  
Chưa deploy; chưa sửa database production; Sol giữ quyền independent re-review.

## Findings

| Finding | Kết quả vòng R3 | Bằng chứng |
|---|---|---|
| R-001 | Đã ghi nhận quyết định Product Owner, chờ Sol xác nhận bản ghi khi re-review | Người dùng trả lời “chốt” bảng cả bốn quy tắc. FINAL_SPEC.md ghi định lượng và DECISIONS.txt đăng ký DEC-029–032. Code giữ nguyên giá trị. |
| R-005 | FIXED, chờ re-review | Retry cùng revision; error không phải finalized; kết quả thành công vẫn đi qua duplicate validation. Không publish_after_error. |
| R-006 | FIXED, chờ re-review | Hai file Decision Log trong gói đều có DEC-001–032, gồm DEC-027/028 hiện hành về Monitor/Teacher. Không còn bản chỉ đến DEC-026 được trình bày là hiện hành. |
| R-002/R-003/R-004 | Giữ các fix đã được Sol xác nhận | Regression tests và build vẫn PASS. |

## Files Changed

Created:
- database/upgrade/06-FEAT-001-AI-RECOVERY.sql
- tests/homework/recovery.test.mjs
- tests/homework/fixtures/r2-homework.sql (snapshot R2 nguyên bản, chỉ phục vụ upgrade test)
- docs/feat-001/FIX_REPORT_R3.md, FILES_CHANGED_R3.txt, verification/homework-tests-r3.txt

Modified:
- database/upgrade/05-FEAT-001-BAO-BAI.sql
- supabase/functions/homework-review/index.ts
- src/features/homework/api.ts
- src/pages/HomeworkPage.vue
- docs/feat-001/FINAL_SPEC.md, DECISIONS.txt, DECISIONS_WITH_BAO_BAI_V1.txt, SOL_SUPPLEMENT.md
- docs/feat-001/IMPLEMENTATION_REPORT.md, DEPLOYMENT.md, FILES_CHANGED.txt
- FIX_REPORT_R2.md được đánh dấu tài liệu lịch sử.
- dist/ được build lại.

Deleted: NONE. Không đổi package/dependency trong R3.

## Implementation Summary

1. Phân biệt lỗi thử xử lý với kết quả cuối: review chỉ finalized khi có score hoặc decision. Bản ghi error với hai giá trị null không chặn kết quả retry nữa.
2. Snapshot trả done kèm status cho kết quả cuối; không gọi provider lại để thay một kết quả duplicate đã hoàn tất. Finalizer dưới khóa transaction giữ nguyên kết quả đã ghi, kể cả error/kết quả khác đến muộn.
3. Error attempt được upsert vào review hiện hành để hiển thị trạng thái; từng lỗi vẫn có audit riêng. Khi AI hồi phục, chỉ update kết quả review tương ứng, không xóa lịch sử lỗi.
4. Thêm action retry qua cùng Edge Function. RPC xác thực người dùng theo quyền quản lý bài hiện có: tác giả; hoặc Teacher/Admin quản lý bài learner trong lớp hợp lệ. Monitor không được retry pending của người khác. Retry không chấp nhận status/score/content do client gửi làm dữ liệu cập nhật.
5. Nút “Thử kiểm tra AI lại” nằm trong history của tác giả và queue Teacher/Admin khi can_retry. Backend trả can_retry theo trạng thái và quyền; monitor limited queue không nhận field mới.
6. Retry dùng cùng ID, revision và nội dung, không làm mới pending_since để né backlog. Kết quả AI cũ sau một lần sửa nội dung vẫn bị stale guard từ chối. Retry chưa có kết quả cuối vẫn giữ pending; không có quyết định publication mới.

Đây là cách thực hiện yêu cầu retry/reprocess của Sol tại R-005, không thay các rule duplicate hoặc quyền quyết định nghiệp vụ.

## Database Changes và nâng cấp

05: bản cài mới đã có fix. 06: CREATE OR REPLACE card/homework_api/homework_ai và áp lại ACL; dành database đã chạy 05 bản R2. Không thêm/xóa bảng, không DROP/TRUNCATE/DELETE hay sửa stored notices khi migration chạy. Có thể chạy 06 lại an toàn.

Test dùng SQL 05 nguyên bản lấy từ ZIP R2, tạo notice và lỗi AI như R2, áp 06 hai lần. Notice trước/sau migration bằng nhau; error audit còn; authenticated vẫn không gọi AI service RPC; retry revision cũ finalize thành công. Không cần reset database hoặc tăng revision bằng thao tác giả.

## Acceptance Criteria

Bảng đầy đủ AC-001–046 nằm trong IMPLEMENTATION_REPORT.md; phạm vi PASS theo từng bằng chứng vẫn giữ nguyên, UI/browser chưa được nâng thành PASS.

| Nhóm liên quan vòng fix | Kết quả | Bằng chứng |
|---|---|---|
| R-005 recovery cùng revision | PASS | Lỗi hai lần, retry, thành công; revision/content/pending_since không đổi; audit lỗi còn |
| R-005 không bypass | PASS | Client giả status/score/content không publish; publish_after_error bị từ chối; score 80 vẫn pending để Teacher quyết định |
| R-005 late result/idempotency | PASS trong fixture tuần tự | Error và kết quả khác đến sau không thay kết quả cuối; chỉ một ai_published audit |
| AC-011–020 duplicate + decisions | PASS tại backend | Các test cũ và recovery comparison thành công |
| AC-037/039/040 permission | PASS tại backend | Student khác/monitor không retry pending của người khác; monitor exact field projection vẫn đúng |
| AC-043–046 bốn ngưỡng đã chốt | PASS tại backend | Boundary candidate/edit, reminder quotas, backlog opt-in/throttle/reset |
| Migration R2 → R3 bảo toàn dữ liệu | PASS trên PGlite | Chạy 06 hai lần, so sánh dữ liệu và ACL, recovery trên error row R2 |

## Verification Results

- npm run test:homework: PASS — 26/26, 0 fail, 0 skip; log mới ở verification/homework-tests-r3.txt.
- npm run test:homework:ui: PASS — 3/3 Vue SSR warning regression; không phải browser/click test nút retry.
- npm test: PASS — 3/3 regression có sẵn.
- npm run build: PASS — vue-tsc -b + Vite, 1.867 modules. Cảnh báo legacy config.js và supabase-service.js như trước.
- Lint: NOT RUN — không có cấu hình lint.
- Browser/UAT nút retry: NOT RUN — chưa có môi trường browser truy cập được ứng dụng local; không dùng SSR làm bằng chứng click/end-to-end.
- Live Supabase Auth/PostgREST/RLS, Deno Edge/Groq, cron: NOT RUN — không có môi trường tích hợp dự án được cấu hình trong task.
- Concurrency nhiều kết nối thật: NOT RUN. Các test xác thực stale/late-result và single-commit theo thứ tự trên PGlite; không giả gọi đó là stress test concurrent.

## Self Review → Fix → Re-test

Đã tái hiện R-005 trên R2: API chưa có retry và error review khóa việc finalize. Khi thêm guard mới, test phát hiện tên cột score trùng biến PL/pgSQL; đã qualify bằng alias rv và re-test. Test timestamp đổi sang so sánh giá trị Date thay vì object identity. Test legacy recovery tự tạo bài gốc để không lệ thuộc test trước.

Kiểm tra: không thêm quyền publication; chỉ ba decision cũ; client score không được dùng; current class/actor/visibility được xác thực; không tăng revision hay reset tuổi backlog; audit lỗi cũ được giữ; private queue không mở rộng; RPC service-only giữ ACL; không sửa code registration/auth baseline. Toàn bộ 26 tests PASS sau fix.

Self Review Result: PASS cho các fix trong phạm vi đã kiểm chứng; còn các NOT RUN nêu trên. Không tự APPROVED hay DEPLOYED.

## Deviations From Spec

NONE trong phạm vi R3: bốn giá trị được ghi đúng quyết định Product Owner; recovery chỉ chạy lại duplicate pipeline, không thêm publication bypass. Bản ghi tài liệu được Astra cập nhật theo phê duyệt cụ thể, không tự thay WHAT; Sol cần kiểm tra việc ghi nhận trong re-review.

## Known Risks

- Các yêu cầu retry đồng thời có thể gọi provider hơn một lần; commit kết quả đã được khóa và kiểm tra trạng thái. Không cam kết exactly-once provider, chưa đo concurrency thực tế.
- Lỗi hạ tầng kéo dài vẫn giữ pending; có đường thử lại, không bảo đảm AI luôn khả dụng.
- Trường hợp môi trường đang dùng bản R1 thay vì R2 không thuộc migration test 06; hướng dẫn nâng cấp ở đây dành R2 hoặc cài mới R3.
- Giới hạn staging/browser/Edge live và chưa có automation sắp hạn đã nêu ở báo cáo trước vẫn giữ nguyên, ngoài phạm vi các finding R3.
