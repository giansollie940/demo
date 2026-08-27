## Period theo năm học + Week master-detail + Dock displacement — 2026-08-27

- Bubble Năm học chỉ hiển thị chấm xanh 7px khi năm đang chọn là active; bỏ chuỗi `· Đang hoạt động` khỏi selector.
- `WeeksPage.vue` chuyển sang master–detail: danh sách tuần bên trái và đúng một editor tuần bên phải, không mở đồng thời hàng chục form.
- Thêm `public.school_year_periods` để giữ khung giờ tiết riêng theo từng năm học; migration seed từ `public.periods` cho toàn bộ năm hiện có và năm mới tự nhận baseline.
- `study_session_start()` và `class_week_effective_status()` ưu tiên `school_year_periods`, fallback `periods`, nên deadline/revision/lifecycle dùng đúng giờ của năm học lịch sử.
- Admin tab Năm học có editor khung giờ từng tiết và action root-admin `update_school_year_periods` → RPC `admin_replace_school_year_periods`.
- Sidebar Dock bổ sung displacement: icon liền kề tách 5–7px, icon cách 2 tách 2–3px, các icon xa nhỏ nhẹ ở collapsed mode; có safe-zone dưới logo và reduced-motion reset.
- Static regression cuối: **136/136 PASS**; frontend syntax 81/81; Edge TS 17/17; release verifier PASS với 10/10 Edge ZIP.

## Role / year / macOS Dock verification — 2026-08-27

- Static regression hiện tại: **136/136 PASS**.
- Contract mới `tests/v871-role-year-macos-final.test.mjs`: **8/8 PASS**.
- Frontend `.ts` + Vue `<script setup>` syntax transpile bằng TypeScript 5.8.3: **81 scripts, 0 syntax errors**.
- Edge TypeScript syntax/transpile: **17 files, 0 syntax errors**.
- `npm run verify:release`: **PASS**; 10/10 Edge ZIP import-resolvable, không phát hiện secret; lần chạy trước khi đóng artifact đã hash **196 files**.
- Admin route/navigation đã tách khỏi nghiệp vụ GV; Admin chỉ có `/admin`, còn teacher giữ review/tracking/weeks/schedule/students/statistics/settings.
- Admin year count hợp nhất directory + legacy context; tab Năm học có action root-admin sửa ngày tuần chuẩn.
- `class_weeks.manual_status` và `class_week_effective_status` có contract cho manual override + automatic last-self-study-session lifecycle.
- Settings của GV hiển thị Lớp/Năm học dưới dạng metadata chỉ đọc.
- Sidebar có macOS Dock magnification theo khoảng cách, vẫn giữ vòng gradient `.62s` một lần và reduced-motion fallback.
- `node_modules` không có trong workspace nên **chưa tuyên bố** Vitest, `vue-tsc` hoặc production Vite build đã PASS cục bộ; GitHub Actions vẫn là gate semantic/build.

# Verification — SỔ TỰ HỌC V8.7.1 Full Stack

Ngày kiểm tra: 2026-08-27

## Kết quả đã xác minh trong workspace này

### 1. Static regression + full-stack contract

Lệnh:

```bash
npm test
```

Kết quả cuối của source hiện tại: **136/136 PASS, 0 fail**.

Phạm vi gồm frontend V8.7.1 hiện có và contract mới cho:

- đủ 10 Supabase Edge Functions;
- AI function mang version `8.7.1`;
- `admin-manage-classes` có counts/delete blockers, đồng bộ `class_name`, transfer và guarded delete;
- hai đường SQL fresh-install/upgrade tách biệt;
- generic upgrade không chứa repair `10A1 → 7A9`;
- verifier SQL read-only;
- không phát hiện browser config thật hoặc secret-like value;
- 10 Edge deployment ZIP có đúng layout Supabase Dashboard;
- regression riêng cho Wise Owl xác nhận notification cũ của registration đã `approved` không còn tạo `urgent=true`, trong khi registration `submitted` thật sự vẫn tạo cảnh báo;
- approval mutation chụp notification IDs trước canonical reload;
- `/issues` và `IssuesPage.vue` tồn tại, scope dữ liệu theo vai trò, hiển thị phản hồi GV/AI;
- Registration và Wise Owl dùng clock reactive 30 giây; Dashboard tách `revision_overdue` khỏi `needs_revision`;
- shell có school-pattern background, logged-in profile chip và sidebar encouragement;
- desktop sidebar dùng edge-chevron thay vì hamburger, mobile vẫn hamburger;
- main dùng nền kem/đào ấm và một layer `main::before` riêng cho `school-pattern-bg.png`; pattern opacity 14% ở light và 2.5% ở dark;
- sidebar items, edge toggle, icon buttons và profile chip có hover micro-interactions hiện đại; reduced-motion vẫn được tôn trọng.
- navigation vẫn phân quyền theo vai trò nhưng hiển thị thành một danh sách phẳng compact; khi thu gọn chuyển thành icon rail 70px có tooltip;
- HS/Cán sự truy cập tùy chọn cá nhân từ profile thay vì sidebar; HS/Cán sự có thống kê cá nhân, Cán sự có thêm khu vực Hỗ trợ lớp; GV giữ thống kê lớp và menu nghiệp vụ lớp; Admin chỉ giữ Quản trị hệ thống;
- cài đặt HS/Cán sự hiển thị ba cảnh báo học tập bắt buộc ở trạng thái hệ thống tự bật, không cung cấp toggle tắt;
- Owl model thực thi nhắc chưa đăng ký, nhắc trước buổi tự học và nhắc yêu cầu chỉnh sửa cho learner; Cán sự có thêm cảnh báo lớp chưa đăng ký/cần sửa/gần buổi học chưa hoàn tất;
- learner urgent reminder tự mở khi Owl đang hiển thị kể cả local preference auto-open cũ từng tắt;
- school pattern dùng layer độc lập `main::before` với `--pattern-opacity`; light mode dùng nền kem/đào ấm và pattern rõ hơn, dark mode giảm pattern xuống 2.5% để không ảnh hưởng tương phản.
- topbar dùng các bubble/pill nổi riêng cho class/year, class, week, theme và profile; không còn full-width bottom divider. Sidebar cũng bỏ các divider cứng và dùng shadow mềm.
- GV không còn mục `Cài đặt` trùng lặp trong profile dropdown; Admin không có Cài đặt lớp; HS/Cán sự vẫn có `Tùy chọn cá nhân` trong profile.

### 2. Release verifier

Lệnh:

```bash
npm run verify:release
```

Kết quả: **PASS**.

- 10 Edge ZIP được tái tạo từ source hiện hành;
- 10/10 ZIP qua `unzip -tqq`;
- mỗi ZIP có `source/index.ts` và `_shared/config.ts` ở ZIP root, nên import `../_shared/...` resolve đúng;
- AI source là V8.7.1;
- generic upgrade không có `10A1`, `7A9`, `REPAIR-10A1`;
- `public/config.js` không tồn tại trong release;
- không phát hiện Supabase server-secret-like hoặc Groq-secret-like value;
- sinh `SHA256SUMS.txt` cho source release.

### 3. JavaScript syntax

Các lệnh sau PASS:

```bash
node --check public/supabase-service.js
node --check scripts/package-edge-functions.mjs
node --check scripts/verify-release.mjs
node --check supabase/functions/ai-review-registration/review-logic.js
```

### 4. Edge TypeScript syntax/transpile

Dùng TypeScript compiler có sẵn trong môi trường để chạy `transpileModule` trên toàn bộ `.ts` trong `supabase/functions/`.

Kết quả: **17 files, 0 syntax diagnostics**.

Kiểm tra relative imports riêng: **0 missing relative imports**.

### 5. SQL static checks

- `fresh-install`: transaction `BEGIN`/`COMMIT` cân bằng theo các patch hợp nhất.
- `upgrade`: transaction `BEGIN`/`COMMIT` cân bằng theo các patch reusable.
- Hai verifier không chứa câu lệnh mutation DDL/DML.
- Upgrade không chứa one-time repair 10A1/7A9.

### 6. Frontend TypeScript/SFC syntax transpile

Do workspace không có `node_modules`, dùng TypeScript compiler có sẵn để `transpileModule` toàn bộ `src/**/*.ts` và `<script setup lang="ts">` trong `.vue`.

Kết quả: **81 scripts checked, 0 syntax diagnostics**. `node --check public/supabase-service.js` cũng PASS.

Lưu ý: đây là kiểm tra syntax/transpile, không thay thế semantic `vue-tsc` hoặc production Vite build.

## Gates chưa thể xác minh cục bộ

`npm ci --prefer-offline --no-audit --no-fund` bị timeout trong môi trường build hiện tại. Partial install không có `vue-tsc` và `vitest`, vì vậy:

```text
npm run typecheck -> vue-tsc: not found
npm run test:unit -> vitest: not found
```

Không tuyên bố local `typecheck`, unit-Vitest hoặc production `npm run build` đã PASS.

Workflow `.github/workflows/deploy-pages.yml` vẫn bắt buộc các gate sau trên GitHub Actions trước khi deploy Pages:

```bash
npm ci
npm run typecheck
npm test
npm run test:unit
npm run build
```

Do đó release này là **source + backend package đã static-verified**, còn production frontend build phải được GitHub Actions xác minh trước cutover.

## Database runtime limitation

Không có kết nối tới Supabase production trong workspace này nên SQL verifier chưa được chạy trên database thật. Sau khi backup và chạy đúng một đường install/upgrade, bắt buộc chạy:

```text
database/verify/VERIFY-V8.7.1.sql
```

và chỉ tiếp tục khi `overall = true`.


## UI verification bổ sung — warm flat 1+3

- Sidebar mở không còn tiêu đề nhóm; `visibleNavigation()` trả một danh sách phẳng theo đúng thứ tự của từng vai trò.
- Sidebar thu gọn vẫn là icon rail 70px có tooltip; desktop edge-chevron và mobile hamburger được giữ nguyên.
- Light palette xác nhận `--bg:#fff9f4`, `--surface:#fffdfc`, primary `#6846dc`, cùng peach/coral/amber washes.
- Dark palette xác nhận `--bg:#17151c`, `--surface:#211e29`, text ấm `#f7f2ee`; không dùng inversion.
- `school-pattern-bg.png` nằm trong `main::before`, opacity light 14%, dark 2.5%, `mix-blend-mode:multiply`, `pointer-events:none`.
- Body, shell, sidebar, main và topbar dùng `--theme-transition` 260ms để đổi theme đồng bộ.
- Regression mới `tests/v871-warm-flat-sidebar.test.mjs` khóa các yêu cầu trên.

## School-year + bubble-menu verification — 2026-08-27

- Release snapshot: **119/119 static regression/contract tests PASS**; frontend syntax/transpile **81/81**; Edge TypeScript syntax/transpile **17/17**.

- Regression contract `tests/v871-school-year-bubble-menu.test.mjs` covers year state, topbar year selector, Admin year actions, SQL RPC presence/security, selected-year week rebasing and bubble navigation motion.
- `AdminPage.vue` exposes tab **Năm học** with create/activate actions; no delete-year action is exposed.
- `admin-manage-classes` exposes `schoolYears`, `create_school_year` and `set_active_school_year`; the RPC calls pass the authenticated root-admin actor id explicitly.
- Both install/upgrade SQL contain `admin_create_school_year` and `admin_set_active_school_year`; `VERIFY-V8.7.1.sql` checks their existence and SECURITY DEFINER status.
- Manager year selection reloads year-scoped classes/weeks; student/monitor year scope remains derived from their class.
- `teacherRebaseWeeks(..., schoolYearId)` uses the selected year when supplied, avoiding accidental edits to the globally active year while browsing history.
- Topbar no longer repeats the selected class at the left; the left context bubble is **Năm học**.
- Sidebar remains a flat role-aware list, rendered as warm soft bubbles; collapsed mode uses icon bubbles and a one-shot hover ring with reduced-motion fallback.
- No live Supabase database was available in this environment, so runtime execution of the new RPCs must be verified after database upgrade using `database/verify/VERIFY-V8.7.1.sql` before Edge/frontend cutover.

