# Sổ Tự Học V8.5.0 CP1 — Vue foundation

> [!WARNING]
> **CP1 CHỈ LÀ BẢN XEM TRƯỚC (PREVIEW ONLY).** Chỉ đưa CP1 lên một repository/site xem trước riêng. Không bao giờ ghi đè, chép đè, đổi tên hoặc thay thế thư mục legacy `frontend/` bằng `frontend-vue/` hay `dist/`. CP1 chưa có tương đương Auth, Supabase, dữ liệu thật, phân quyền, realtime hoặc các workflow nghiệp vụ của V8.4.5. CP11 mới là Release Candidate; chỉ CP12 mới được phép cutover sang production sau khi kiểm thử tương đương và có phương án rollback.

Thư mục này là nền tảng Vue 3 + TypeScript + Vite của CP1. Nó chạy độc lập bên cạnh ứng dụng V8.4.5 và chỉ hiển thị dữ liệu tĩnh/minh họa. Hướng dẫn đưa bản xem trước lên GitHub Pages nằm tại `HUONG-DAN-DUA-LEN-MANG-V8.5.0-CP1.md` ở thư mục gốc của gói checkpoint.

## Nội dung và giới hạn của gói ZIP

ZIP CP1 là gói đã lọc để review, kiểm thử và dựng bản xem trước. Gói chứa toàn bộ mã nguồn/cấu hình `frontend-vue/`, lockfile, đủ 15 file unit/component/E2E trong `frontend-vue/tests/`, thư mục build `frontend-vue/dist/`, tài liệu CP1, hướng dẫn GitHub Pages và script quét nội dung công khai.

Gói cố ý không chứa:

- `node_modules/`, cache npm, cache trình duyệt Playwright, kết quả/report kiểm thử và ledger SDD;
- ứng dụng legacy `frontend/` và `frontend-update-only/`;
- bộ kiểm thử legacy ở thư mục gốc.

Vì không có `node_modules/`, chạy `npm ci` cần kết nối mạng tới npm registry. Không có cách cài offline được cam kết trong CP1. Muốn kiểm tra đầy đủ việc legacy V8.4.5 không đổi, cần dùng lại ZIP gốc V8.4.5 có SHA-256:

`A4DC5FE887F92A3E132F685ABE1BC8BB8BF0DC4EB2D67204F88E93A6B99964DA`

## Runtime được hỗ trợ

- Khuyến nghị Node.js 24.15.0 trở lên trong nhánh Node 24, hoặc Node 26+.
- Dùng npm đi kèm bản Node đã chọn.

`jsdom@30.0.1` yêu cầu Node `^22.22.2 || ^24.15.0 || >=26.0.0`. Môi trường kiểm tra Node 25.9.0 vẫn chạy được nhưng nằm ngoài dải hỗ trợ và phát cảnh báo `EBADENGINE`.

## Cài dependency và build

Chạy từ `frontend-vue/`:

```powershell
npm ci
npm run build
```

`npm ci` dùng đúng dependency tree trong `package-lock.json` và là lệnh tái tạo checkpoint được chấp thuận. Bản build production được ghi vào `dist/`; Vite sao chép `public/.nojekyll` thành `dist/.nojekyll`.

Để chạy local trong workspace phát triển đầy đủ:

```powershell
npm run dev
```

Ứng dụng dùng hash routing. Các URL chính:

- `/#/dashboard`
- `/#/weeks`
- `/#/tracking`
- `/#/students`
- `/#/admin/classes`
- `/#/admin/teachers`
- `/#/admin/permissions`

## Chạy bộ kiểm thử Vue có trong ZIP

Sau `npm ci`, toàn bộ unit/component tests có thể chạy trực tiếp từ gói ZIP:

```powershell
npm run test:unit
npm run typecheck
npm run build
```

E2E cần tải Chromium của Playwright một lần qua mạng. Dùng cùng một cache trình duyệt khi cài và chạy:

```powershell
$projectRoot = (Get-Location).Path
$browserCache = Join-Path (Split-Path $projectRoot -Parent) 'pw-browsers'
$env:PLAYWRIGHT_BROWSERS_PATH = $browserCache
npx playwright install chromium
npm run test:e2e -- --reporter=line
```

Các test Vue trong ZIP không thay thế kiểm tra legacy. Muốn chạy 28 test legacy và xác minh đủ 49 hash gốc, cần khôi phục ZIP V8.4.5 có SHA-256 đã ghi ở trên.

## Ranh giới CP1

- Vue Router dùng hash history để tương thích static hosting.
- Pinia chỉ lưu preference UI/client.
- TanStack Vue Query mới được khởi tạo cho checkpoint sau; CP1 không có business query.
- Số liệu dashboard và selector đều là demo/preview, không phải dữ liệu thật.
- Không có Supabase client, Supabase Auth, session restoration, RLS integration, Edge Functions, realtime, secret hoặc workflow production.
- Không tạo hay đưa `config.js` lên GitHub Pages; CP1 không cần secret hoặc cấu hình production.
