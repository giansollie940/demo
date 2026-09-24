# FEAT-001 — Hướng dẫn bàn giao và triển khai

Chưa deploy; chưa truy cập hoặc sửa dữ liệu production. Sol cần re-review độc lập và Product Owner duyệt phát hành theo WORKFLOW. Bốn ngưỡng R-001 đã được Product Owner chốt và ghi trong FINAL_SPEC.md/DECISIONS.txt bản R3; vẫn chờ Sol re-review và human release.

## Kiểm tra local

Tại thư mục gốc đã giải nén:

```sh
npm ci
npm run test:homework
npm run test:homework:ui
npm test
npm run build
```

`test:homework` chạy PostgreSQL nhúng PGlite, roles và schema fixture tối thiểu. Không kết nối Supabase thật. Không thay thế test staging với JWT thật hoặc concurrency nhiều kết nối.

Có fixture giao diện tùy chọn: `node tests/homework/ui-server.mjs`, rồi mở `http://127.0.0.1:4174/tests/homework/preview.html?role=student`. Thay role bằng monitor/teacher/admin. Fixture mount component thật và gọi RPC vào database nhúng; đường submit chỉ lưu pending, không giả lập chất lượng semantic AI. Chỉ dùng local, không publish fixture server. Browser smoke chưa chạy thành công trong môi trường bàn giao.

## Thứ tự staging sau khi được duyệt

1. Dùng database staging tương thích bản FULL đã cung cấp; hoàn tất upgrade V8.8.0 và `database/upgrade/03-ADMIN-RECYCLE-BIN.sql` theo README gốc. Kiểm tra schema thực tế: profiles có active/deleted_at/class_id/role; class_teachers có active; classes có school_year_id/active; weeks có start_date/end_date/school_year_id.
2. Database chưa có FEAT-001: chạy một lần `database/upgrade/05-FEAT-001-BAO-BAI.sql` của R3. Database đã áp migration 05 bản R2: chạy `database/upgrade/06-FEAT-001-AI-RECOVERY.sql`, không chạy lại 05. Đây là migration cộng thêm trong transaction, không phải script reset, không chạy lại khi đã thành công. Không sửa dữ liệu các bảng hiện có. Nếu lỗi trong transaction, rollback và giải quyết lỗi trước khi thử lại.
3. Deploy Edge Function `homework-review` cùng thư mục `_shared` hiện có bằng quy trình Edge của project. Giữ xác thực JWT; function còn tự kiểm tra token qua Auth và quyền bằng RPC. Không thay các Edge Function cũ.
4. Server dùng các biến config chung hiện có (`_shared/config.ts`) và `GROQ_API_KEY`; có thể đặt `GROQ_HOMEWORK_MODEL`. Không đưa service key/Groq key vào frontend. Model fallback theo pattern hiện có; cần kiểm tra model được tài khoản provider hỗ trợ trên staging.
5. Migration tự tạo cron `homework-backlog-feat001` mỗi 10 phút nếu schema `cron` đã tồn tại. Nếu chưa có cron, operator cần cấu hình scheduler được cấp quyền gọi `public.homework_maintenance()` mỗi 10 phút. RPC này chỉ dành service role; không cấp cho authenticated/anon. Khi không có scheduler, backlog chỉ được đánh giá lúc người dùng truy cập/thao tác, chưa bảo đảm cảnh báo khi không ai mở app.
6. Publish frontend đã build; `dist/` trong gói là build mới. Kiểm tra `config.js` theo hướng dẫn project gốc. Trong Báo bài, GV/Admin tạo môn và English groups, gán học sinh; không seed danh sách môn cố định.
7. Chạy staging UAT với bốn role, nhóm Anh khác nhau, duplicate <70/70/90, thao tác concurrent, mất kết nối AI, reminder và cron. Không dùng service role để thay JWT người dùng khi kiểm tra bypass.

## Triển khai quay lui

Nếu frontend gặp lỗi, quay về build frontend trước và ngừng job/Edge mới. Giữ các bảng mới để không mất dữ liệu Báo bài. Gói này không cung cấp DROP migration có thể làm mất dữ liệu. Không xóa bảng hay dữ liệu ngoài phạm vi duyệt.

## Lưu ý gói R3

Migration 05 dành cài mới. Migration 06 dành nâng từ R2, chỉ CREATE OR REPLACE các function và giữ ACL; không DROP bảng hay xóa bản ghi. Test đã áp SQL R2 thật, tạo notice lỗi, áp 06 hai lần, so sánh notice trước/sau và retry đúng revision cũ thành công. Điều này chưa thay thế chạy trên bản sao Supabase đầy đủ.

Sau nâng database, deploy lại Edge homework-review rồi frontend R3. “Thử kiểm tra AI lại” chỉ xuất hiện với notice pending chưa có kết quả cuối cho người có quyền quản lý bài đó. Retry không sửa nội dung, revision, pending_since và không trực tiếp publish. Error attempt được giữ trong audit; thành công vẫn theo ngưỡng duplicate hiện hành. Không có publish_after_error.

Không dùng SQL fixture `tests/homework/fixtures/r2-homework.sql` để deploy: đây là bản R2 lịch sử phục vụ regression test. Chỉ dùng các file trong database/upgrade theo trường hợp trên.
