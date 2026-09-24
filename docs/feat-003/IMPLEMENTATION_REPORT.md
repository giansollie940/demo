# Implementation Report — FEAT-003

**Task ID:** FEAT-003  
**SPEC:** `FINAL_SPEC.md` — FINAL, bản UPDATED người dùng cung cấp.  
**Astra Effort:** LOW theo FINAL SPEC. **RECOMMEND_EFFORT: MEDIUM** đã báo khi self-review tái hiện race condition giữa page reload và save AI. Sửa cục bộ frontend, không mở rộng scope.  
**Handoff:** IMPLEMENTED — VERIFICATION PARTIAL; gửi Sol independent review.  
**Ngày kiểm tra:** 2026-09-13. **Production deploy:** Không thực hiện.

## Baseline và source of truth

Khảo sát trực tiếp source FEAT-002, migration 05/06/07, RPC load/group_save/group_assign/ai_settings, Teacher directory API, HomeworkPage và visual tokens V9 trước khi sửa. Đã đọc PROJECT_CONTEXT, WORKFLOW và DECISIONS hiện hành tới DEC-037; bản sao nguyên văn kèm theo. Không thêm/sửa business decision.

Baseline: `FEAT-002-BAO-BAI-REVIEW.zip`, SHA-256 `43ebd85baddcdcc944555c5cb526334509559429327f27177e2cb84dd3abc7b0`. So sánh byte xác nhận 47 file database/Edge Function giữ nguyên; xem `evidence/baseline-comparison.json`.

## Files Changed

| File | Thay đổi |
| --- | --- |
| `src/components/homework/HomeworkAiSettings.vue` | Panel AI, validation, visualization, draft/save/error state, xác nhận lại từ RPC load. |
| `src/components/homework/HomeworkGroupManager.vue` | Group cards, directory join, roster, search/sort/filter, checkbox selection, batch assignment, partial-failure feedback và group editor. |
| `src/features/homework/management.css` | Styles dùng tokens V9, AppCard/AppButton; layout desktop/mobile, trạng thái tương tác. |
| `src/pages/HomeworkPage.vue` | Reuse hai component; giữ draft AI khi đổi tab; bỏ form/state cũ; chặn stale reload ghi đè kết quả đã xác nhận. |
| `tests/feat-003/ui.test.ts`, `tests/feat-003/vitest.config.ts` | 22 test chạy real Vue SFC bằng in-memory renderer, mock tại network boundary. |
| `tests/bug-001/regression.test.ts` | Cập nhật fixture FEAT-002 và thao tác save theo form mới; vẫn giữ 23 regression assertions/tests. |
| `package.json` | Thêm script `test:feat-003`; không thêm dependency. |
| `dist/` | Bản build frontend hiện hành. |
| `docs/feat-003/`, `REVIEW_FEAT003.md` | SPEC/context/decisions, báo cáo, evidence, patch/manifest và hướng dẫn UAT. |

Danh sách đầy đủ và hash có trong `FILES_CHANGED.json`, `SHA256SUMS.json`; source diff trong `CHANGES.patch`.

## Implementation Summary

- AI: Teacher thấy toggle semantic, hai threshold, thanh ba vùng cập nhật với input hợp lệ. Integer `0 <= lower < upper <= 100`; input sai không gửi request. Lưu chỉ gửi ba operational keys, sau đó đọc lại giá trị. Không đổi threshold mặc định, exact detection hay AI ownership.
- Giữ draft khi chuyển tab. Sau save lỗi hoặc lỗi tải lại, sửa input về giá trị cũ cũng không tự biến trạng thái thành “Đã lưu”. So sánh settings theo giá trị, không phụ thuộc thứ tự key JSON.
- Group card chọn để xem; việc chọn không ghi dữ liệu. Count dùng `members` hiện hành của RPC load (active membership theo backend). Group tạm ngưng vẫn hiện membership, không coi là “chưa có nhóm”. Chỉnh sửa/tạo group dùng group_save cũ.
- Roster lấy danh sách HS từ homework load và ghép mã từ Teacher directory API có sẵn, theo ID và đúng lớp/role/active. Không tạo API directory mới. Nếu thiếu mã, hiển thị rõ; tải lỗi không bị trình bày như danh sách rỗng.
- Mặc định sort mã tăng dần, dùng Vietnamese collator có numeric comparison và tie-break ổn định. Có sort tên/nhóm, search mã/tên trim và case-insensitive, filter chưa có nhóm.
- Chọn tất cả chỉ lấy HS đang hiển thị. Search/filter thay đổi sẽ xóa selection; sort giữ ID đã chọn. Action bar hiện số lượng, nhóm đích, chuyển nhóm và bỏ chọn.
- Batch chạy tuần tự từng RPC group_assign hiện có. Mỗi request giữ semantics joined_at/left_at của backend. Báo số thành công/thất bại, chi tiết lỗi; luôn tải lại server sau batch. Khi tải lại thất bại, khóa assignment tới khi refresh được. Không suy đoán rằng request lỗi mạng chắc chắn chưa ghi dữ liệu.
- Chặn double submit; dừng các request chưa gửi khi component unmount/role đổi. Một request đã gửi vẫn do backend authorize. Không triển khai drag/drop vì SPEC xác định là optional; checkbox/click luôn là flow chính.

## Database Changes

Không có migration, schema, constraint, RLS/RPC hoặc Edge Function change. Không thay đổi membership history, permission matrix, hard-delete/tombstone, duplicate flow hoặc AI retry/recovery. Lockfile giữ nguyên. Không thao tác database production.

## Acceptance Criteria

PASS dưới đây có phạm vi local component + local backend regression, không phải live staging UAT. `FAIL (NOT RUN)` nghĩa là chưa đủ evidence nghiệm thu, không khẳng định đã tìm thấy lỗi behavior.

| AC | Kết quả | Evidence / giới hạn |
| --- | --- | --- |
| AC-301 | PASS | Render real SFC có toggle, threshold, ba vùng, save và state; UI tests. |
| AC-302 | PASS | Input 65 cập nhật visualization; chưa có mutation trước submit. |
| AC-303 | PASS | Empty, bằng nhau, đảo mốc, số lẻ, ngoài giới hạn bị chặn; 0/100 hợp lệ. |
| AC-304 | PASS | Save đúng payload và reload response cập nhật form; network boundary mô phỏng. Backend AI-setting tests chạy PGlite riêng. |
| AC-305 | PASS | Save/reload error hiển thị lỗi; không false saved khi sửa về baseline. |
| AC-306 | PASS | Card name/count, click lọc members và không phát sinh mutation. |
| AC-307 | PASS | Mặc định code tăng dần với input chưa sắp xếp. |
| AC-308 | PASS | Search mã, tên, trim, chữ hoa/thường. |
| AC-309 | PASS | Đổi sort tên/nhóm cho thứ tự đúng. |
| AC-310 | PASS | Chỉ người không có current membership; group inactive không làm mất membership. |
| AC-311 | PASS | UI gửi đúng tập ID, target và reload; backend hiện hành đã chạy regression membership riêng. Không kiểm end-to-end staging. |
| AC-312 | PASS | Partial failure báo đúng số lượng/chi tiết, không full success; lỗi reload khóa thao tác tiếp. |
| AC-313 | PASS | Search/filter clear selection; sort giữ ID; select-all chỉ visible. |
| AC-314 | FAIL (NOT RUN) | Có CSS mobile và flow không dùng drag/drop; browser touch/mobile chưa chạy do localhost bị chặn. |
| AC-315 | PASS | Student/Monitor/Admin không có controls hoặc directory call. Backend role enforcement giữ nguyên và 43 database/AI regression tests đạt, gồm FEAT-002 direct mutation restrictions. Live JWT/PostgREST NOT RUN. |
| AC-316 | PASS | 43 FEAT-001/002 backend/AI + 23 BUG-001/UI + 3 warning + 3 static regression tests đạt. |
| AC-317 | FAIL (NOT RUN) | Có card và button hierarchy trong source; chưa quan sát render desktop bằng browser. |
| AC-318 | FAIL (NOT RUN) | Chưa kiểm bounds/overflow, touch target và toàn flow bằng browser. |
| AC-319 | PASS | Action bar render chung vùng số selected, target, primary chuyển nhóm, secondary bỏ chọn. |
| AC-320 | PASS | Component tests cho loading, empty search/group/unassigned, zero selection, saving, error, success, partial failure. |
| AC-321 | FAIL (NOT RUN) | Có wrapping/min-width và responsive CSS; chưa có evidence browser cho chuỗi dài/nhiều nhóm. |
| AC-322 | PASS | Self-review source: reuse AppCard/AppButton và tokens V9; không thêm hệ styling/dependency. |

## Verification Results

| Kiểm tra | Kết quả | Evidence |
| --- | --- | --- |
| FEAT-003 UI/state | **22/22 PASS** | `evidence/ui-test.log` |
| FEAT-001/002 database/AI regression | **43/43 PASS** | `evidence/backend-regression.log` |
| BUG-001/FEAT-002 UI regression | **23/23 PASS** | `evidence/regression-ui.log` |
| Duplicate warning component | **3/3 PASS** | `evidence/warning-ui.log` |
| Existing static tests | **3/3 PASS** | `evidence/static-tests.log` |
| `npm run build` gồm vue-tsc | **PASS** | `evidence/build.log`, 1873 modules |
| Database/Edge byte comparison | **PASS** | 47 files unchanged, `evidence/baseline-comparison.json` |
| Browser, mobile/touch, visual/console | **NOT RUN** | `evidence/browser-status.txt`; `ERR_BLOCKED_BY_CLIENT` khi mở local Vite |
| Live Auth/RLS/JWT/PostgREST/Groq/scheduler | **NOT RUN** | Không có staging verification session trong task này; không thay các implementation tương ứng. |
| Lint | **NOT RUN** | Project không có lint script/configured gate. Typecheck/build đã chạy. |

Tổng **94/94 tests thực chạy đạt**. Tests Vue dùng renderer in-memory, không phải DOM browser. PGlite thực thi SQL/role fixtures cục bộ, không thay cho Supabase staging với JWT thật. Vite vẫn cảnh báo classic scripts config/supabase-service và bundle >500 kB; build exit 0, không có type error.

## Deviations From Spec

Không thay BR/permission/data model. Không làm drag/drop (optional theo RB-310). Còn thiếu verification browser cho AC-314/317/318/321 do môi trường chặn local URL; không báo các AC này PASS.

## Known Risks

- Visual/mobile usability và chuỗi dài/nhiều nhóm cần UAT theo `MANUAL_UAT.md` trước khi duyệt đầy đủ.
- Batch gồm các giao dịch riêng, có thể thành công một phần; UI phản ánh đúng và refresh source of truth. Đây là phương án SPEC cho phép.
- Khi rời màn hình/đổi role giữa batch, request đang chạy có thể hoàn tất; các request tiếp theo dừng. Mở lại màn hình sẽ tải trạng thái server.
- Cần existing Teacher directory Edge API hoạt động để hiển thị mã đăng nhập; lỗi được hiển thị và có Thử lại.

## Self Review Result

**SELF REVIEW → FIX → RE-TEST đã thực hiện.** Không phát hiện thiếu BR, permission change, dead duplicate form/state mới, secret exposure, data-history change hoặc thay đổi ngoài scope trong phần code đã sửa.

Đã sửa: so sánh baseline theo giá trị thay vì thứ tự key JSON; không false saved sau lỗi readback; tránh full-success feedback trước refresh; không khẳng định network failure đồng nghĩa chưa ghi DB; stale page reload không ghi đè settings vừa xác nhận.

Race condition cuối được test tái hiện (19 pass/1 fail, ngưỡng bị trả từ 60 về 70) trong `evidence/self-review-before.log`, sau fix đạt trong bộ 22/22. Test-first trước implementation: 10 fail/1 pass tại `evidence/tdd-before.log`.

**Kết luận bàn giao:** Source/build/test evidence sẵn sàng để Sol independent review. Chưa đủ evidence để kết luận toàn bộ AC PASS hoặc READY_FOR_RELEASE.
