# Bản sửa deadline chung của lớp và ngoại lệ theo tuần

Nguồn: 2-TOAN-BO-SOURCE-DA-SUA.zip + FRONTEND-CAN-UPDATE-v9.zip + bản sửa hiện tại.
Đã giữ cập nhật v9 (gồm thùng rác admin), sửa biểu tượng admin và lỗi đọc giờ có giây.

## Trình tự cập nhật dự án đang chạy V8.8.0

1. Lưu bản sao nguồn đang triển khai. Với database, giữ bản sao cấu hình/hàm trước khi cập nhật để có thể đối chiếu khi cần.
2. Chạy database/upgrade/03-DEADLINE-INHERITANCE.sql trong SQL Editor của đúng dự án Supabase. File chạy trong transaction, có kiểm tra schema và có thể chạy lại. Không chạy lại bộ fresh-install để cập nhật.
3. Triển khai lại Edge Function admin-manage-classes từ supabase/functions/admin-manage-classes. Thay đổi này giúp các tuần của lớp tạo mới dùng chế độ kế thừa. Giữ cấu hình xác thực và secrets đang dùng.
4. Cập nhật frontend từ gói nguồn đầy đủ hoặc chép các file trong gói vá vào dự án v9. Giữ cấu hình Supabase/GitHub secrets thực tế của bạn. Build và triển khai bằng quy trình đang dùng.
5. Tải lại trang (Ctrl+F5). Vào Cài đặt GV → Chung & đăng ký → Cách chốt hạn mặc định: chọn Hôm trước từng buổi, chọn giờ chốt và bấm Lưu cài đặt.
6. Vào Quản lý tuần → chọn tuần đang bị chốt Chủ nhật → Deadline → Dùng cài đặt chung của lớp → Lưu thay đổi. Làm tương tự với các tuần cũ muốn chuyển sang kế thừa.

Tuần đã có cấu hình cũ được GIỮ như một tùy chỉnh riêng. Chỉ đổi cài đặt lớp sẽ không tự ghi đè những tuần này. Tuần mới do bản mã đã cập nhật tạo ra dùng kế thừa. Hai chế độ tự động theo tuần dùng giờ chốt của lớp; muốn đặt cả ngày và giờ khác cho một tuần, chọn Hạn cụ thể cho cả tuần.

## Cách hoạt động

- Cài đặt lớp: Hôm trước từng buổi hoặc Chủ nhật trước tuần, cùng giờ chốt theo Việt Nam.
- Mỗi tuần: Dùng cài đặt chung; chốt trước từng buổi; chốt trước tuần; hoặc ngày giờ cụ thể.
- Hạn riêng ưu tiên hơn chế độ mặc định. Chọn Dùng cài đặt chung để trở lại kế thừa.
- Ví dụ lớp đặt 19:30 theo buổi: thứ Hai chốt Chủ nhật 19:30, thứ Tư chốt thứ Ba 19:30, thứ Sáu chốt thứ Năm 19:30.
- Trạng thái đóng/mở/nghỉ của tuần và điều kiện buổi đã bắt đầu vẫn được kiểm tra riêng.
- SQL và frontend cùng dùng chế độ của tuần hoặc cài đặt lớp; không còn đổi ngầm week_before_20 thành per_session_20 ở frontend.

## Hai SQL bạn đã gửi

Bản nguyên gốc nằm trong database/user-updates. Chúng phục vụ thay đổi bỏ Không duyệt và thùng rác admin, không phải SQL sửa deadline. Nếu đã áp dụng trước đó, không cần chạy lại chỉ vì bản sửa này. Nếu chưa áp dụng, đối chiếu hướng dẫn trong chính các file với hệ thống đang dùng trước khi bật các tính năng tương ứng. Tôi chưa chạy bất kỳ SQL nào trên database thật của bạn.

## Kiểm chứng

- npm run typecheck: đạt.
- node node_modules/vite/bin/vite.js build --configLoader runner: đạt, 1846 modules.
- npm run test:unit -- --reporter=dot: 104/104 kiểm thử, 16 file đạt.
- Có kiểm thử tái hiện lỗi trước sửa: chế độ trước tuần bị đổi ngầm, kế thừa bị mất, sửa ghi chú làm đổi chế độ. Các kiểm thử này hiện đạt.
- SQL chạy trên PostgreSQL nhúng PGlite với schema thu gọn có các kiểu dữ liệu tương ứng: đã thử migration, chạy lại, giữ dữ liệu cũ, chế độ kế thừa/theo buổi/trước tuần/ngày giờ cụ thể, thiếu dòng class_weeks, mặc định dòng mới, rollback và áp dụng lại.
- Trình duyệt: dùng SettingsPage và WeekEditorCard thật, dịch vụ lưu giả trong bộ nhớ; đã chọn/lưu mặc định lớp, ghi đè theo tuần, quay lại kế thừa; không có lỗi console. Đã xem bố cục desktop và kiểm tra 390px không tràn ngang.
- Chưa kiểm thử đăng nhập GV/HS hay RLS trên database Supabase thật; chưa triển khai lên website của bạn.
- npm run test:static: 139 đạt, 120 không đạt; đối chiếu bản nền nguồn đầy đủ + v9 có đúng cùng 120 tên thất bại. Nhiều lỗi do đường dẫn file URL trên Windows thành C:\C:\..., ngoài ra có các kiểm tra nguồn cũ. Không tuyên bố toàn bộ bộ kiểm tra dự án đạt.
- npm run build mặc định gặp hạn chế esbuild đọc thư mục cha trong sandbox Windows; đã chạy TypeScript riêng và Vite với --configLoader runner thành công. Không sửa script triển khai hiện có chỉ để né hạn chế máy kiểm thử.

## Khôi phục khi cần

Khôi phục frontend và Edge Function phiên bản trước, rồi dùng database/maintenance/ROLLBACK-DEADLINE-INHERITANCE.sql nếu cần bỏ cơ chế kế thừa. Script chuyển các dòng inherit thành chế độ hiệu lực hiện tại để giữ ý nghĩa hạn, đưa default class_weeks về per_session_20; giữ cột cấu hình lớp mới để không làm mất lựa chọn đã lưu. Đây là rollback chức năng, không phải phục hồi từng byte database cũ.

## Gói nguồn

Không kèm node_modules, dữ liệu kiểm thử, config thực tế hay bản build thử. Đã bổ sung RemoteUserAvatar.vue mà v9 có import nhưng thiếu file, sử dụng bộ tải avatar và UserAvatar sẵn có. SHA256SUMS.txt được tạo lại theo các file trong gói này.
