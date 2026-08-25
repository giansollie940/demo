# Upload SỔ TỰ HỌC Vue lên GitHub Pages — không cần npm trên máy

Gói này được chuẩn bị để **upload nguyên nội dung vào root của một repository GitHub riêng**. GitHub Actions sẽ tự cài Node/npm, kiểm tra, build Vite và deploy `dist/` lên GitHub Pages.

## 1. Upload toàn bộ nội dung gói vào root repository

Sau khi upload, ở root repo phải thấy trực tiếp các mục sau (không bọc thêm một thư mục `frontend-vue/`):

```text
.github/workflows/deploy-pages.yml
public/
src/
tests/
index.html
package.json
package-lock.json
vite.config.ts
```

Không upload `node_modules/`, `dist/` hoặc `public/config.js` chứa key thật.

## 2. Tạo 2 GitHub Repository Secrets

Vào:

**Repository → Settings → Secrets and variables → Actions → New repository secret**

Tạo đúng hai secret:

### `SUPABASE_PROJECT_URL`

Giá trị dạng:

```text
https://YOUR-PROJECT.supabase.co
```

### `SUPABASE_PUBLISHABLE_KEY`

Dán **public/publishable key** của Supabase. Nếu dự án cũ vẫn dùng `anon` public key thì có thể đặt chính public anon key đó vào secret này.

**Không dùng `service_role` key.** `service_role` không bao giờ được đưa vào frontend hoặc GitHub Pages.

### Tùy chọn: LOGIN_DOMAIN

Nếu login domain khác `users.example.com`, vào:

**Settings → Secrets and variables → Actions → Variables → New repository variable**

Tạo biến `LOGIN_DOMAIN`. Nếu không tạo, workflow tự dùng `users.example.com`.

## 3. Bật GitHub Pages bằng Actions

Vào:

**Repository → Settings → Pages → Build and deployment → Source → GitHub Actions**

Không chọn “Deploy from a branch” cho source Vue/Vite.

## 4. Chạy build/deploy

Mỗi lần push/upload commit vào nhánh `main`, workflow sẽ tự chạy:

```text
npm ci
npm run typecheck
npm test
npm run test:unit
npm run build
Deploy dist/ → GitHub Pages
```

Theo dõi tại:

**Repository → Actions → Build and Deploy Sổ Tự Học Vue**

- Dấu ✓ xanh: build và deploy thành công.
- Dấu ✗ đỏ: mở job lỗi và xem dòng báo lỗi.

## 5. Vì sao gói chạy được với mọi tên repository?

`vite.config.ts` dùng:

```ts
base: './'
```

và ứng dụng dùng hash router. Vì vậy asset được tham chiếu tương đối và không cần sửa `base` theo tên repo GitHub Pages.

## 6. Cấu hình Supabase được tạo lúc build

Source không chứa `public/config.js` thật. Workflow tạo file này từ hai GitHub Secrets trước `npm run build`:

```js
window.APP_CONFIG = {
  mode: 'supabase',
  projectUrl: '...',
  publishableKey: '...',
  loginDomain: 'users.example.com',
  fallbackRefreshSeconds: 180,
}
```

Chỉ cấu hình browser/public được đưa vào bản build. Đây là dữ liệu mà frontend phải nhận để kết nối Supabase; RLS vẫn là lớp bảo vệ dữ liệu phía server.

## 7. Nếu trang trắng

Kiểm tra theo thứ tự:

1. `Actions` có ✓ xanh hay không.
2. `Settings → Pages` đang dùng `GitHub Actions`.
3. Hai secret có đúng tên chính xác.
4. Mở DevTools → Console và Network, xem `config.js`, `supabase-service.js` và file `assets/*.js` có trả HTTP 200 hay không.
5. Không upload trực tiếp source `src/*.vue` để chạy bằng Pages; Pages phải nhận `dist/` do workflow build.

LƯU Ý BẮT BUỘC VỀ ROOT REPO
-----------------------------
Sau khi upload, trang Code của repo phải hiển thị trực tiếp các file:
- package.json
- package-lock.json
- tsconfig.json
- tsconfig.app.json
- tsconfig.node.json
- vite.config.ts
- index.html
Nếu các file này nằm trong một folder con, hoặc thiếu tsconfig.json, GitHub Actions sẽ dừng trước Typecheck.

