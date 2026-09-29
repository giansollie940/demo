# AUTH-BAG-001 — Prototype tương tác "Mật mã chiếc cặp"

**Trạng thái:** PROTOTYPE — không cấp phiên, không gọi server. Spec gốc vẫn DRAFT; D-02…D-06 và GATE-AUTH chưa đạt.

**Đường dẫn:** `/#/bag-demo` (không có liên kết từ trang đăng nhập).

## Đã có trong prototype

| Spec | Hiện thực |
|---|---|
| BR-001 | 24 biến thể (6 loại × 4 màu), `item_id` cố định, mã gọn = vị trí trong `CATALOG` (`src/features/auth-bag/catalog.ts`) |
| BR-002/003 | Chuỗi giữ nguyên thứ tự và món lặp; payload `{ version, items }`; verifier input `[version, code…]` 1 byte/món (`sequence.ts`) |
| RB-001 | Bàn bên trái, cặp bên phải, xếp dọc trên điện thoại; hình + màu + nhãn; click/tap, bàn phím, kéo thả; cặp kín, chỉ hiện tổng số món; animation giống nhau cho mọi món |
| RB-002 | Tạo 10–16 món → nhập lại trên cặp trống; tuỳ chọn tạo ngẫu nhiên, nút "Xem chuỗi để học" mặc định ẩn |
| RB-003 | Nhập mã + chuỗi, gửi một lần khi "Đóng cặp"; thông báo sai chung; xoá chuỗi sau mỗi kết quả |
| RB-004 | Undo bỏ món cuối, Reset xoá hết; một lần thả = một món; click trình duyệt tự sinh sau khi thả không bị tính thêm; chạm nhanh sau khi kéo vẫn tính; aria-live chỉ báo "Đã thêm một món"; reduced-motion |
| §6 | Xáo vị trí mỗi lần thử; món không mất khỏi bàn; chế độ kín đáo ẩn số món; đổi tab xoá chuỗi |
| §8 | Rule 10–16 món, không toàn một món, không lặp mẫu ≤3 món, không dùng chuỗi ví dụ; mô phỏng tạm ngưng sau 5 lần sai (60 giây trong bản thử, spec đề xuất 15 phút phía server) |

## Chưa có — cần GATE-AUTH và các quyết định còn mở

- Endpoint challenge/submit, verifier trên server, bộ đếm thử sai phía server (bộ `rate-limit.ts` hiện có bỏ qua khi lỗi nên không dùng lại được, xem EC-010).
- Cấp phiên Supabase thật, đăng ký gắn với tài khoản, xác thực lại trước khi bật/đổi/tắt.
- Thử nghiệm nhìn trộm và khả năng dùng (mục 12) — prototype này là công cụ cho bước đó.

## Ghi chú cho bước triển khai thật

- Băm `toVerifierInput()` (≤17 byte), không băm chuỗi id dài: bcrypt chỉ đọc 72 byte đầu.
- Mọi rule trong `checkPolicy()` phải được server áp dụng lại; bản client chỉ để báo lỗi sớm.
- Trên điện thoại, cặp nằm dưới bàn dụng cụ: cần đo trong thử nghiệm khả năng dùng xem người dùng có cần thấy số món khi đang chọn không.

## Kiểm thử

- `tests/unit/auth-bag.test.ts`: danh mục, thứ tự/biến thể/số lượng, verifier input, policy, xáo bàn, sinh ngẫu nhiên.
- Kiểm thử trình duyệt (Chromium, desktop 1366px và mobile 360px có cảm ứng): 25/25 đạt.
