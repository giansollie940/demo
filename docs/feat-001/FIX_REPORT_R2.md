> TÀI LIỆU LỊCH SỬ R2 — trạng thái hiện hành xem FIX_REPORT_R3.md và IMPLEMENTATION_REPORT.md.

# FEAT-001 — Astra Fix Report R2

Task ID: FEAT-001  
Astra Effort: MEDIUM — SQL authorization, AI publication và kiểm tra rò rỉ dữ liệu.  
STATUS: BLOCKED — còn R-001 về tài liệu chuẩn.  
Artifact baseline: FEAT-001-BAO-BAI-V1-REVIEW.zip.  
Artifact mới: FEAT-001-BAO-BAI-V1-R2-REVIEW.zip.

## Kết quả từng finding

| Finding | Trạng thái | Kết quả |
|---|---|---|
| R-001 | BLOCKED / chờ Sol | Không tự sửa FINAL SPEC/DECISIONS. Bốn giá trị đã có trong tin nhắn Product Owner nhưng nguồn chuẩn chưa đăng ký. Đã đọc thêm DECISIONS_WITH_BAO_BAI_V1_PERMISSION_RESOLVED.txt được Sol dùng: kết thúc DEC-028, chưa có bốn rule định lượng. |
| R-002 | FIXED, chờ re-review | Bỏ publish_after_error khỏi CHECK/schema, RPC và nút UI. Chỉ chấp nhận ba decision đã định nghĩa và phải có bài gốc published hợp lệ. AI lỗi giữ pending; decision null/không hợp lệ bị chặn. |
| R-003 | FIXED, chờ re-review | Cảnh báo rõ “Có vẻ nội dung này đã được báo trước đó”, kèm môn, tiêu đề, deadline, người đăng, thời gian đăng và nút Xem/Sửa. Chỉ lấy bài từ public feed được backend lọc, kiểm tra lại status/scope. |
| R-004 | FIXED, chờ re-review | queue_card là allow-list độc lập; không lấy full card rồi trừ key. Kiểm thử đúng tập key cho bài mới và candidate. |

## R-001 — việc cần Sol/Product Owner hoàn tất

Căn cứ đã có: bảng người dùng gửi trước yêu cầu “tiếp đi bạn”, chứa đúng các giá trị trong SOL_SUPPLEMENT.md:

1. Candidate cùng class/subject/English group/chưa xóa, chênh deadline tuyệt đối ≤24h, cố định V1.
2. Đổi deadline tuyệt đối ≥24h thì re-check; thay môn/nhóm/nhiệm vụ chính/bản chất nội dung luôn re-check.
3. Notice tối đa 2 reminder/rolling 24h, cách nhau tối thiểu 6h; actor tối đa 10/rolling 24h toàn Báo bài; lần bị chặn không sinh event.
4. Admin backlog/all: ≥5 pending đã chờ ≥24h; tối đa một cảnh báo/24h khi điều kiện còn; reset dưới ngưỡng và re-arm lần vượt tiếp.

Sol cần đăng ký các giá trị này vào FINAL SPEC/DECISIONS theo quyền Product và xác nhận nguồn FINAL dùng cho re-review. Astra không tự cấp ID quyết định mới hay đổi STATUS thành ACTIVE/FINAL. Code định lượng được giữ nguyên trong vòng fix, không thêm rule thay thế.

Ảnh hưởng: chưa đủ điều kiện đóng toàn bộ FEAT-001 APPROVED/release. Không cần sửa lại SQL nếu giá trị được canonical hóa giữ nguyên.

## Files Changed trong vòng sửa

Created:
- src/components/homework/HomeworkDuplicateWarning.vue
- tests/homework/review.test.mjs
- tests/homework/warning.test.ts
- docs/feat-001/FIX_REPORT_R2.md, SOL_INDEPENDENT_REVIEW.md, verification/homework-tests.txt và manifest diff R2.

Modified:
- database/upgrade/05-FEAT-001-BAO-BAI.sql
- src/pages/HomeworkPage.vue
- tests/homework/database.test.mjs
- package.json (chỉ thêm script test:homework:ui, không thêm dependency)
- docs/feat-001/IMPLEMENTATION_REPORT.md, DEPLOYMENT.md, FILES_CHANGED.txt
- dist/ tạo lại bằng build.

Deleted: NONE. Không đổi code auth/registration hay dữ liệu baseline.

## Database Changes

Bản migration 05 chưa phát hành được sửa: bỏ giá trị decision ngoài SPEC; validation đầu vào review fail-closed; thêm private helper trả allow-list và thay projection queue monitor. Không đổi schema bảng nghiệp vụ cũ, không thay permission role, không chỉnh dữ liệu production. Helper vẫn nằm trong private schema bị revoke toàn bộ quyền client.

Nếu đã áp migration 05 bản review cũ vào database riêng, không chạy lại script này hoặc DROP dữ liệu. Cần migration chuyển tiếp bảo toàn dữ liệu; gói hiện tại dành baseline chưa cài FEAT-001.

## Verification Results

- RED: hai test R-002/R-004 đã thất bại trên code trước fix: Missing expected rejection và thừa icon/published_at.
- GREEN: npm run test:homework — 22/22 PASS (20 cũ + 2 regression mới), 0 fail/skip. Log nằm trong verification/homework-tests.txt.
- npm run test:homework:ui — 3/3 PASS, Vue SSR: đủ trường/nút; private hoặc ngoài scope không hiển thị; published/deleted/replaced không cảnh báo.
- npm test — 3/3 regression sẵn có PASS.
- npm run build — PASS, bao gồm vue-tsc -b và Vite; 1.867 modules. Cảnh báo legacy config.js/supabase-service.js vẫn có như baseline.
- Browser click/visual: NOT RUN. Render SSR không thay browser UAT; môi trường trước đó chặn localhost với ERR_BLOCKED_BY_CLIENT.
- Live Supabase Auth/PostgREST/RLS, Deno Edge/Groq, scheduler, multi-session concurrency: NOT RUN. Chỉ xác thực quyền SQL trên fixture PGlite, không giả nhận staging PASS.
- Lint: NOT RUN — project không cấu hình lint script.

Tất cả 42 AC được theo dõi trong IMPLEMENTATION_REPORT.md; không nâng những AC chưa đủ bằng chứng thành PASS chỉ vì build thành công.

## Self Review → Fix → Re-test

Đã kiểm tra API bypass bằng teacher/admin với publish_after_error, quyết định null và ba quyết định hợp lệ nhưng thiếu comparison. Tất cả bị từ chối, bài giữ pending, không có audit review thành công. Trường hợp candidate hợp lệ vẫn bị chặn nếu decision null/không hợp lệ.

Đã cập nhật test stale-snapshot cũ vốn dựa vào đường publish_after_error để thiết lập dữ liệu: giờ dùng AI snapshot hiện hành để finalize. Khi loại bypass, test cũ FAIL cùng test reminder phụ thuộc; sau thay fixture flow hợp lệ, toàn suite PASS. Không nới backend để cứu test.

Warning chỉ đọc visibleNotices, không đọc notice.candidate hoặc AI history của người khác. Monitor projection kiểm tra exact key set, gồm ID làm khóa định danh và đúng trường nghiệp vụ; không lộ icon, published_at, AI score/reason/raw/audit. Không phát sinh file baseline bị xóa.

Self Review Result: các fix R-002/R-003/R-004 đạt kiểm tra cục bộ; R-001 chưa giải quyết. Không tự đóng APPROVED và không deploy.

## Deviations / Known Risks

Đã loại deviation publish_after_error. Đường xử lý bổ sung khi AI lỗi vẫn thuộc quyết định Sol/Product Owner; hiện giữ pending theo safe behavior trong review. Chưa implement thông báo sắp hạn tự động như đã ghi ở báo cáo trước. Giới hạn live/browser/concurrency vẫn còn; cần re-review + staging UAT trước khi phát hành.
