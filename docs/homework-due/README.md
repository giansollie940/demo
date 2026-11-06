# Báo bài: hạn không được ở quá khứ

## Luật

| Tình huống | Kết quả |
|---|---|
| Đăng bài mới, hạn bằng hoặc trước thời điểm đăng | **Từ chối**, với mọi người đăng (học sinh, cán sự, giáo viên) và cả `service_role` |
| Đăng bài mới, hạn còn dưới 1 giờ | Cho đăng; form hiện cảnh báo vàng |
| Sửa bài mà giữ nguyên hạn, kể cả khi hạn đó đã qua | Cho sửa |
| Sửa bài, đổi hạn sang một thời điểm đã qua | **Từ chối** |
| Bản sửa theo yêu cầu GV đổi hạn sang quá khứ | **Từ chối** ngay khi tác giả lưu nháp hoặc gửi lại |
| GV duyệt một bản sửa mà hạn mới đã trôi qua trong lúc chờ | **Từ chối**: GV yêu cầu sửa lại hoặc từ chối bản sửa |
| Duyệt, gỡ, thay thế, purge (chỉ đổi trạng thái) | Không bị ảnh hưởng |
| Gửi lại cùng một lần đăng do mạng chập chờn | Vẫn trả về bài đã nhận, không báo lỗi |

Câu người dùng thấy, ví dụ: *Hạn 08:30 05/11/2026 đã qua. Hạn của Báo bài phải sau thời điểm đăng (14:05 06/11/2026).*

## Ở đâu

- **Máy chủ** — `supabase/migrations/20261106090000_homework_due_not_past.sql`:
  `homework_private.assert_due_not_past` là nơi duy nhất biết luật. Trigger `homework_due_not_past`
  (`BEFORE INSERT OR UPDATE OF due_at` trên `homework_notices`) chặn mọi đường ghi, và
  `validate_revision` gọi luật để tác giả biết lỗi ngay khi gửi bản sửa. Lỗi: SQLSTATE `22023`,
  `hint = 'HOMEWORK_DUE_IN_PAST'`. Luật đứng trước bước AI so trùng trong `homework-review`: đây là
  phép so hai mốc thời gian, không phải một phán đoán.
- **Form** — `src/features/homework/deadline.ts` (cùng luật) và `HomeworkPage.vue`: chặn nút Đăng khi
  hạn đã qua, cảnh báo khi còn dưới 1 giờ. Máy chủ vẫn là nơi quyết định, vì đồng hồ máy người dùng
  có thể lệch; khi đó trang hiện nguyên câu của máy chủ.
- **`homework-review`** chuyển `hint` thành `code` trong câu trả lời để trang nhận ra lỗi này.

Migration chèn đúng một dòng vào `validate_revision` theo neo (như
`20261001090000_homework_awards_by_month.sql`): đọc định nghĩa đang chạy, neo phải xuất hiện đúng một
lần, giữ kiểu xuống dòng của thân hàm; chạy lại không làm gì. Không đổi bảng, không đụng dữ liệu cũ.

## Kiểm chứng

- `npm test` gồm `tests/homework-due/database.test.mjs` (pglite, 21 test): harness dựng từ thân hàm
  production và được đối chiếu với `installer/sql/10-baseline.sql`.
- `npm run test:homework-due:mutations`: 12/12 mutation bị bắt.
- `npm run test:homework-due:ui`: form trên `HomeworkPage` (4 test) — chạy trong CI.
- `tests/unit/homework-deadline.test.ts`: luật phía form.

## Rollback

`database/upgrade/21-HOMEWORK-DUE-NOT-PAST.rollback.sql` gỡ trigger, hai hàm mới và đúng dòng đã chèn
vào `validate_revision`.
