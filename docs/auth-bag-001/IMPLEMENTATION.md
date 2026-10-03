# AUTH-BAG-001 — "Hành trang tự học": triển khai

Tên hiển thị cho học sinh là **"🎒 Hành trang tự học"**. Hướng dẫn: "Chọn đúng món, đủ số lượng, theo thứ tự bí mật của bạn." Nút xác nhận: "Bắt đầu tự học". Khi thành công: "Hành trang đã sẵn sàng. Cùng học thôi!".
Chọn món bằng **ổ xoay 9 loại dụng cụ theo 4 màu chủ đề**. Chỉ món ở giữa phía trước mới thêm được, bằng cách bấm vào hoặc kéo vào cặp. Mỗi lượt thử bắt đầu ở màu và vị trí ngẫu nhiên.
Trong code và database vẫn dùng tên kỹ thuật `auth-bag` / `bag_auth_*`.
Các bước triển khai từng mục có ô đánh dấu nằm trong **`DEPLOY-CHECKLIST.md`**.

Cách đăng nhập **phụ** cho Học sinh và Cán sự lớp. Mật khẩu vẫn là cách chính, không bao giờ bị đọc hay đổi.
Chuỗi dụng cụ là một credential thứ hai: server chỉ lưu bcrypt (cost 10) của input gọn `[version, code…]`
(tối đa 21 byte, không bị bcrypt cắt ở 72 byte).

## Thành phần

| Phần | File |
|---|---|
| Database | `database/upgrade/18-AUTH-BAG-001-SCHOOL-BAG-LOGIN.sql`: schema riêng `auth_bag` và các hàm `public.bag_auth_*` (SECURITY DEFINER, chỉ `service_role` được gọi) |
| Edge Function | `supabase/functions/bag-enroll`: xem trạng thái, thiết lập hoặc đổi, tắt (cần đăng nhập mật khẩu trong 5 phút gần nhất) |
| Edge Function | `supabase/functions/bag-login`: kiểm tra chuỗi, tạo token magic-link dùng một lần và **đổi ngay trên server**, kiểm tra lại rồi mới trả phiên Supabase cho trình duyệt (trình duyệt không bao giờ cầm token) |
| Danh mục server | `supabase/functions/_shared/bag-catalog.ts`, phải khớp `src/features/auth-bag/` (có test so sánh) |
| Trình duyệt | `public/supabase-service.js`: `reauthenticateOwnPassword`, `bagCredential`, `signInBag` |
| Giao diện | `BagPad.vue` (bàn dụng cụ và cặp, dùng chung), `BagSettingsCard.vue` (Cài đặt), `BagLoginPage.vue` (`/#/login/bag`), nút phụ trên trang đăng nhập |
| Cờ bật/tắt | `window.APP_CONFIG.authBag`, sinh từ biến repo `AUTH_BAG_ENABLED` trong workflow Pages. **Mặc định tắt.** |

## Luồng

- **Thiết lập, đổi:** Cài đặt → nhập mật khẩu hiện tại → tạo chuỗi 8–20 món → nhập lại → lưu.
  Nếu quá 5 phút kể từ lúc nhập mật khẩu, app hỏi lại mật khẩu rồi lưu chuỗi đã xác nhận.
- **Tắt:** Cài đặt → Tắt → nhập mật khẩu.
- **Đăng nhập:** trang đăng nhập → "Hành trang tự học" → mã đăng nhập và chuỗi → phiên Supabase bình thường.
  Refresh, đăng xuất và RLS giữ nguyên.
- Mọi lỗi đăng nhập (sai chuỗi, tài khoản không có, chưa bật, bị khoá, không đủ quyền) trả **cùng một thông báo**.
- **Giới hạn thử:** 5 lần sai trong 15 phút thì khoá tài khoản 15 phút; mỗi IP tối đa 30 lần sai trong 15 phút.
  Khoá chỉ áp dụng cho cặp, mật khẩu vẫn dùng được.
  - Mỗi lượt **giữ chỗ** một lần thử (tăng bộ đếm, khoá dòng) **trước** khi chạy bcrypt. Vì vậy request song song cũng chỉ được kiểm tra tối đa 5 lần.
  - Các lượt từ cùng một IP phải xếp hàng qua bước bcrypt (vài chục ms mỗi lượt), nên cả lớp đăng nhập cùng lúc có thể chờ thêm khoảng 1–2 giây.
- Mỗi lần đổi hoặc tắt đều tăng `credential_version`.
  - `bag-login` kiểm tra lại **sau khi** phiên đã được tạo; nếu mật mã vừa bị đổi hoặc tắt thì huỷ phiên đó và từ chối.
  - Token magic-link được dùng ngay trên server, không có token nào còn "treo" sau khi tắt mật mã.

## Triển khai lên production (theo thứ tự)

1. Chạy `database/upgrade/18-AUTH-BAG-001-SCHOOL-BAG-LOGIN.sql` trong SQL Editor (cần `pgcrypto`, đã có sẵn trên Supabase).
2. Deploy Edge Functions:
   ```bash
   supabase functions deploy bag-enroll
   supabase functions deploy bag-login --no-verify-jwt   # người gọi chưa có phiên
   ```
   Dùng chung `ALLOWED_ORIGINS`, `LOGIN_DOMAIN` và khoá server như các function khác.
3. (Tuỳ chọn) Rút ngắn **Auth → Email OTP expiry**: token được đổi ngay trên server nên không cần hạn dài.
4. Bật cờ: repo **Settings → Secrets and variables → Actions → Variables**, đặt `AUTH_BAG_ENABLED = true`, rồi chạy lại workflow Pages.

Tắt khẩn cấp: xoá biến hoặc đặt khác `true`, rồi deploy lại (nút và thẻ Cài đặt biến mất, `/login/bag` chuyển về `/login`).
Muốn chặn hẳn ở server thì undeploy `bag-login`.

## Kiểm thử

- `tests/unit/auth-bag-server.test.ts`: danh mục server khớp trình duyệt, payload hỏng bị chặn, policy giống nhau,
  quyền trong SQL (không cấp cho anon/authenticated, `search_path` rỗng), cờ bật/tắt.
- E2E trên project thử (không phải production): 34/34, cộng vòng sửa theo review (bắn song song, huỷ phiên khi bị tắt giữa chừng, 8 bài hồi quy); xem `GATE-AUTH-SPIKE.md`.
- Trình duyệt Chromium (dùng `supabase-service.js` giả lập): 24/24.
  Gồm: cờ tắt thì ẩn hết; mật khẩu sai hoặc đúng; chặn chuỗi yếu; nhập lại không khớp; hỏi lại mật khẩu khi quá hạn;
  không lưu món nào vào storage; đăng nhập sai (thông báo chung, cặp được làm trống); đăng nhập đúng; tắt;
  điện thoại 390px không cuộn ngang.

## Giới hạn đã biết

- Chưa có nonce theo từng lượt; chuỗi đi qua HTTPS như mật khẩu.
- IP lấy từ `x-forwarded-for`, có thể bị giả; lớp bảo vệ chính là giới hạn theo tài khoản.
- Không chống được người quay lại toàn bộ thao tác nhập. Bàn được xáo mỗi lượt và có chế độ kín đáo để giảm rủi ro nhìn trộm.
