# Verification — SỔ TỰ HỌC V8.7.1 Full Stack

Ngày kiểm tra: 2026-08-26

## Kết quả đã xác minh trong workspace này

### 1. Static regression + full-stack contract

Lệnh:

```bash
npm test
```

Kết quả cuối sau role-aware UI + mandatory reminder refinement: **102/102 PASS, 0 fail**.

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
- main background dùng `school-pattern-bg.png` với lớp theme `--bg` pha khoảng 78–82% để hoa văn nhìn thấy rõ hơn;
- sidebar items, edge toggle, icon buttons và profile chip có hover micro-interactions hiện đại; reduced-motion vẫn được tôn trọng.
- navigation được chia nhóm theo vai trò; sidebar mở dùng compact soft groups và khi thu gọn chuyển thành icon rail 70px có tooltip;
- HS/Cán sự truy cập tùy chọn cá nhân từ profile thay vì sidebar; HS/Cán sự có thống kê cá nhân, Cán sự có thêm khu vực Hỗ trợ lớp; GV/Admin giữ thống kê lớp và menu nghiệp vụ/quản trị;
- cài đặt HS/Cán sự hiển thị ba cảnh báo học tập bắt buộc ở trạng thái hệ thống tự bật, không cung cấp toggle tắt;
- Owl model thực thi nhắc chưa đăng ký, nhắc trước buổi tự học và nhắc yêu cầu chỉnh sửa cho learner; Cán sự có thêm cảnh báo lớp chưa đăng ký/cần sửa/gần buổi học chưa hoàn tất;
- learner urgent reminder tự mở khi Owl đang hiển thị kể cả local preference auto-open cũ từng tắt;
- school pattern dùng theme token thực `--bg` thay cho token không tồn tại `--background`, đồng thời content/card surfaces giữ độ trong để pattern có thể hiển thị.

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
