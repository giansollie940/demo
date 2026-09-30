# AUTH-BAG-001 — Báo cáo spike GATE-AUTH

- Project thử: `qxbsrijouikdqaeobwty` (tu-hoc-bag-spike, free). **Không đụng production.**
- Ngày chạy: 2026-09-30. Kết quả: **26/26 bài test pass** (bảng `spike_test.results`).
- Cách chạy: gọi HTTP thật tới Auth / PostgREST / Edge Functions từ trong DB bằng extension `http`
  (sandbox chặn `*.supabase.co`), timeout 25 s.

## Kiến trúc đã chứng minh

1. Chuỗi dụng cụ là **credential thứ hai, độc lập**. Mật khẩu Supabase không bị đọc, đổi hay suy ra từ chuỗi.
2. Lưu trữ: bcrypt (cost 10) trên input gọn `[version, code…]` (≤ 21 byte, không dính giới hạn 72 byte),
   trong schema riêng `auth_bag`. Schema này không lộ qua REST; hàm SECURITY DEFINER chỉ cấp cho service_role.
3. `bag-enroll` (cần JWT): chỉ Student/Monitor. Đổi hoặc tắt cần đăng nhập mật khẩu trong vòng 5 phút (`amr`).
4. `bag-login` (không cần JWT): verify, rồi kiểm tra lại `still_valid`, rồi `generateLink(magiclink)` trả `token_hash` dùng một lần.
   Client đổi token này bằng `verifyOtp` để lấy **session Supabase thật**, nên refresh, logout và RLS giữ nguyên.
5. Giới hạn fail-closed: tài khoản 5 lần sai / 15 phút thì khóa 15 phút; IP 30 lần / 15 phút. Lỗi hạ tầng trả 503, không có đường vòng.

## Bằng chứng

| # | Kiểm tra | Kết quả |
|---|---|---|
| T01 | Enrol cần session | 401 NO_SESSION |
| T02 | Trạng thái trước khi enrol | enabled=false |
| T03 | Server chặn chuỗi yếu | 400 WEAK_SEQUENCE |
| T04 | Enrol hợp lệ | credential_version=1 |
| T05/T05b | `auth_bag` không gọi được qua REST (user/anon) | 406 PGRST106 |
| T06 | Sai thứ tự | 401 thông báo chung |
| T07 | Tài khoản không tồn tại | **y hệt** T06 |
| T08a/b | Đúng chuỗi → token_hash → verifyOtp → session hs-01 | 200, có refresh token |
| T09 | Dùng lại token_hash | 403 |
| T10a/b | Session từ cặp: RLS ghi/đọc đúng dòng của mình | 201 / 200 |
| T11 | Session từ cặp không tự đổi chuỗi được | 403 REAUTH_REQUIRED |
| T12a/b/c | Refresh, logout, refresh sau logout | 200 / 204 / 400 |
| T13 | Giáo viên không enrol được | 403 NOT_ELIGIBLE |
| T14 | 5 lần sai → khóa; cả chuỗi đúng cũng bị từ chối | 401, locked=true |
| T15a/b | Tắt → đăng nhập bằng cặp bị từ chối | 200 / 401 |
| T16 | Hash mật khẩu không đổi, đăng nhập mật khẩu vẫn chạy | 200 |
| T17 | Audit không chứa món, độ dài hay tiền tố | chỉ `event:reason` |
| T18 | Enrol lại tăng credential_version | 5 → 6 |
| T19 | Đang bị khóa cặp, mật khẩu vẫn đăng nhập được | 200 |
| T20 | EC-005: verify đã khớp nhưng disable chen ngang | still_valid: true → false |

## Giới hạn / việc cần quyết trước FINAL SPEC

1. **Chưa có challenge/nonce theo từng lượt.** Chuỗi được gửi thẳng qua HTTPS, không có chống replay ở tầng ứng dụng.
   Chấp nhận được với TLS; nếu muốn chặt hơn thì thêm nonce ngắn hạn.
2. **`x-forwarded-for`**: IP lấy từ header đầu tiên, có thể bị client tác động.
   Giới hạn theo tài khoản mới là lớp bảo vệ chính; giới hạn theo IP chỉ là trần phụ.
3. **Hạn token magic-link** là cài đặt chung của cả project (Auth › Email OTP expiry).
   Token chỉ dùng một lần và được đổi ngay, nhưng nên đặt hạn ngắn.
4. **service_role** chỉ dùng trong Edge Function để tạo token một lần và đọc hoặc ghi `auth_bag`. Key không bao giờ tới client.
5. Không gian khóa: 36 món, dài 10–20, nên tối thiểu 36^10 ≈ 3.7·10^15. Kết hợp khóa 5 lần sai, brute-force online không khả thi.
   Rủi ro thực tế là **nhìn trộm qua vai**; UI xáo vị trí món mỗi lần giúp giảm rủi ro này.
6. Trong spike, phản hồi 401 dùng chung cho mọi lỗi. Thời gian phản hồi được cân bằng bằng một vòng bcrypt giả, nhưng chưa đo thống kê.

## Vòng 2: phiên bản chính thức (34/34)

Sau khi spike đạt, migration 18 và hai Edge Function chính thức (dùng `_shared/*` của repo, gọi `public.bag_auth_*` qua RPC
thay vì kết nối Postgres trực tiếp) được cài lại lên project thử và chạy lại toàn bộ.

Kết quả: **34/34 pass**. Bộ test gồm các mục của vòng 1, cộng thêm:

- payload hỏng → 400 INVALID_SEQUENCE;
- `bag_auth_*` bị từ chối với cả token người dùng (403) lẫn anon (401);
- session từ cặp không tự tắt được (REAUTH_REQUIRED);
- mã đăng nhập viết hoa hoặc có khoảng trắng vẫn khớp;
- tài khoản bị khoá (`active=false`) nhận thông báo chung, mở lại thì đăng nhập được.

Ghi chú môi trường thử: bảng `profiles` giả lập chỉ có `id, role, active, deleted_at`, nên bản `auth.ts` deploy lên project
thử chỉ select các cột đó. Logic kiểm tra không đổi.

## Bước tiếp theo (vòng 1)

- Viết migration chính thức (đã review) cho production (migration 18). (Đã làm.)
- Settings: bật, đổi, tắt, xác thực lại bằng mật khẩu, chỉ Student/Monitor.
- Trang đăng nhập: thêm tuỳ chọn phụ "Đăng nhập bằng chiếc cặp" sau feature flag.
- Đưa vào **PR riêng**, tách khỏi PR #25. (Đã làm — xem `IMPLEMENTATION.md`.)
