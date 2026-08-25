# V8.6.0 CP8 — Typecheck Fix v3

Lỗi GitHub Actions đã sửa:

- `CommentsPage.vue`: trạng thái `draft` không còn trả AppBadge tone `secondary`; dùng `neutral`.
- `HistoryPage.vue`: trạng thái `draft` không còn trả AppBadge tone `secondary`; dùng `neutral`.
- `AppButton` vẫn giữ variant `secondary` (hợp lệ và không liên quan lỗi này).
- Thêm regression test `history and comments use only AppBadge-supported tones`.

AppBadge contract hiện tại: `neutral | info | success | warning | danger | primary`.

Sau khi upload, GitHub Actions cần chạy lại `npm run typecheck`. Gói này không tuyên bố typecheck/build PASS trong container đóng gói vì container không có `node_modules`; GitHub Actions là build gate thực tế.
