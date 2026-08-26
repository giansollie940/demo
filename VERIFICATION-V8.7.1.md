# Verification — SỔ TỰ HỌC V8.7.1 Full Stack

Ngày kiểm tra: 2026-08-26

## Kết quả đã xác minh trong workspace này

### 1. Static regression + full-stack contract

Lệnh:

```bash
npm test
```

Kết quả cuối sau warm flat sidebar + independent pattern refinement: **108/108 PASS, 0 fail**.

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
- HS/Cán sự truy cập tùy chọn cá nhân từ profile thay vì sidebar; HS/Cán sự có thống kê cá nhân, Cán sự có thêm khu vực Hỗ trợ lớp; GV/Admin giữ thống kê lớp và menu nghiệp vụ/quản trị;
- cài đặt HS/Cán sự hiển thị ba cảnh báo học tập bắt buộc ở trạng thái hệ thống tự bật, không cung cấp toggle tắt;
- Owl model thực thi nhắc chưa đăng ký, nhắc trước buổi tự học và nhắc yêu cầu chỉnh sửa cho learner; Cán sự có thêm cảnh báo lớp chưa đăng ký/cần sửa/gần buổi học chưa hoàn tất;
- learner urgent reminder tự mở khi Owl đang hiển thị kể cả local preference auto-open cũ từng tắt;
- school pattern dùng layer độc lập `main::before` với `--pattern-opacity`; light mode dùng nền kem/đào ấm và pattern rõ hơn, dark mode giảm pattern xuống 2.5% để không ảnh hưởng tương phản.

### 2. Release verifier

Lệnh:

```bash
npm run verify:release
```

Kết quả: **PASS**.

- 10 Edge ZIP được tái tạo từ source hiện hành;
- 10/10 ZIP qua `unzip -tqq`;
- mỗi ZIP có `source/index.ts` và `source/_shared/config.ts`;
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

Kết quả: **80 scripts checked, 0 syntax diagnostics**. `node --check public/supabase-service.js` cũng PASS.

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
