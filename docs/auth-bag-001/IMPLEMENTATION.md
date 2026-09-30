# AUTH-BAG-001 — Đăng nhập bằng chiếc cặp: triển khai

Cách đăng nhập **phụ** cho Học sinh và Cán sự lớp. Mật khẩu vẫn là cách chính, không bao giờ bị đọc hay đổi.
Chuỗi dụng cụ là một credential thứ hai: server chỉ lưu bcrypt (cost 10) của input gọn `[version, code…]`
(tối đa 21 byte, không bị bcrypt cắt ở 72 byte).

## Thành phần

| Phần | File |
|---|---|
| Database | `database/upgrade/18-AUTH-BAG-001-SCHOOL-BAG-LOGIN.sql`: schema riêng `auth_bag` và các hàm `public.bag_auth_*` (SECURITY DEFINER, chỉ `service_role` được gọi) |
| Edge Function | `supabase/functions/bag-enroll`: xem trạng thái, thiết lập hoặc đổi, tắt (cần đăng nhập mật khẩu trong 5 phút gần nhất) |
| Edge Function | `supabase/functions/bag-login`: kiểm tra chuỗi, trả `token_hash` magic-link dùng một lần; trình duyệt đổi lấy phiên Supabase thật bằng `verifyOtp` |
| Danh mục server | `supabase/functions/_shared/bag-catalog.ts`, phải khớp `src/features/auth-bag/` (có test so sánh) |
| Trình duyệt | `public/supabase-service.js`: `reauthenticateOwnPassword`, `bagCredential`, `signInBag` |
| Giao diện | `BagPad.vue` (bàn dụng cụ và cặp, dùng chung), `BagSettingsCard.vue` (Cài đặt), `BagLoginPage.vue` (`/#/login/bag`), nút phụ trên trang đăng nhập |
| Cờ bật/tắt | `window.APP_CONFIG.authBag`, sinh từ biến repo `AUTH_BAG_ENABLED` trong workflow Pages. **Mặc định tắt.** |

## Luồng

- **Thiết lập, đổi:** Cài đặt → nhập mật khẩu hiện tại → tạo chuỗi 10–20 món → nhập lại → lưu.
  Nếu quá 5 phút kể từ lúc nhập mật khẩu, app hỏi lại mật khẩu rồi lưu chuỗi đã xác nhận.
- **Tắt:** Cài đặt → Tắt → nhập mật khẩu.
- **Đăng nhập:** trang đăng nhập → "Đăng nhập bằng chiếc cặp" → mã đăng nhập và chuỗi → phiên Supabase bình thường.
  Refresh, đăng xuất và RLS giữ nguyên.
- Mọi lỗi đăng nhập (sai chuỗi, tài khoản không có, chưa bật, bị khoá, không đủ quyền) trả **cùng một thông báo**.
- **Giới hạn thử:** 5 lần sai trong 15 phút thì khoá tài khoản 15 phút; mỗi IP tối đa 30 lần sai trong 15 phút.
  Khoá chỉ áp dụng cho cặp, mật khẩu vẫn dùng được.
- Mỗi lần đổi hoặc tắt đều tăng `credential_version`. Lượt đăng nhập nào đã khớp chuỗi cũ sẽ bị từ chối ngay trước khi cấp phiên.

## Triển khai lên production (theo thứ tự)

1. Chạy `database/upgrade/18-AUTH-BAG-001-SCHOOL-BAG-LOGIN.sql` trong SQL Editor (cần `pgcrypto`, đã có sẵn trên Supabase).
2. Deploy Edge Functions:
   ```bash
   supabase functions deploy bag-enroll
   supabase functions deploy bag-login --no-verify-jwt   # người gọi chưa có phiên
   ```
   Dùng chung `ALLOWED_ORIGINS`, `LOGIN_DOMAIN` và khoá server như các function khác.
3. Nên rút ngắn **Auth → Email OTP expiry**, vì token magic-link được đổi ngay trong vài giây.
4. Bật cờ: repo **Settings → Secrets and variables → Actions → Variables**, đặt `AUTH_BAG_ENABLED = true`, rồi chạy lại workflow Pages.

Tắt khẩn cấp: xoá biến hoặc đặt khác `true`, rồi deploy lại (nút và thẻ Cài đặt biến mất, `/login/bag` chuyển về `/login`).
Muốn chặn hẳn ở server thì undeploy `bag-login`.

## Kiểm thử

- `tests/unit/auth-bag-server.test.ts`: danh mục server khớp trình duyệt, payload hỏng bị chặn, policy giống nhau,
  quyền trong SQL (không cấp cho anon/authenticated, `search_path` rỗng), cờ bật/tắt.
- E2E trên project thử (không phải production): 34/34, xem `GATE-AUTH-SPIKE.md`.
- Trình duyệt Chromium (dùng `supabase-service.js` giả lập): 24/24.
  Gồm: cờ tắt thì ẩn hết; mật khẩu sai hoặc đúng; chặn chuỗi yếu; nhập lại không khớp; hỏi lại mật khẩu khi quá hạn;
  không lưu món nào vào storage; đăng nhập sai (thông báo chung, cặp được làm trống); đăng nhập đúng; tắt;
  điện thoại 390px không cuộn ngang.

## Giới hạn đã biết

- Chưa có nonce theo từng lượt; chuỗi đi qua HTTPS như mật khẩu.
- IP lấy từ `x-forwarded-for`, có thể bị giả; lớp bảo vệ chính là giới hạn theo tài khoản.
- Hạn token magic-link là cài đặt chung của project.
- Không chống được người quay lại toàn bộ thao tác nhập. Bàn được xáo mỗi lượt và có chế độ kín đáo để giảm rủi ro nhìn trộm.
