# FEAT-003 — UAT còn cần chạy

Chạy trên bản local hoặc staging có FEAT-002 và tài khoản test; không dùng production để thử dữ liệu. Ghi ảnh/video, viewport, browser, role và kết quả thực tế.

1. Cài dependency theo lockfile; `npm run build`, `npm run dev`. Kết nối cấu hình môi trường test hợp lệ. Không sửa schema cho FEAT-003.
2. Teacher mở Cài đặt AI ở 1440×900, 768×1024, 390×844 và 320×740: toggle, hai mốc, ba vùng, labels/markers và save-state rõ. Không có control bị che/tràn. So sánh card/button/type với V9.
3. Thử 65/90, 0/100; visualization đổi trước khi Save. Thử rỗng, 90/90, 70.5/90, −1/90, 70/101: lỗi ngay, không request. Đổi tab khi chưa lưu: draft vẫn chưa lưu. Save/reload phải khớp backend.
4. Mô phỏng lỗi save và lỗi load sau save: không hiển thị Đã lưu. Bấm lại khi request đang chạy không gửi trùng.
5. English groups: click card chỉ đổi tập members, count đúng current memberships. Tạo/sửa tên/active trong editor; group inactive không là destination.
6. Search mã/tên có khoảng trắng đầu cuối và đổi hoa/thường. Sort mặc định code tăng dần; sort tên/nhóm; filter chưa có nhóm. Selection không ghi DB; search/filter không giữ lựa chọn ẩn.
7. Checkbox chọn một/nhiều/all-visible; action bar đủ count/target/Chuyển vào nhóm/Bỏ chọn. Hoàn tất bằng touch và bàn phím, không kéo thả.
8. Batch success/partial failure: số lượng chính xác, lỗi rõ, bảng reload từ server; membership history joined_at/left_at giữ semantics FEAT-002. Nếu refresh fail, không cho chuyển tiếp tới khi làm mới được.
9. Thử tên/mã/group dài không có khoảng trắng, 20 group, 500–1000 HS. Quan sát wrap, horizontal overflow, vùng bấm và tốc độ search/sort.
10. Student/Monitor/Admin không có management controls. Dùng JWT staging riêng từng role gọi trực tiếp ai_settings/group_save/group_assign: phải bị từ chối theo FEAT-002. Không lấy UI hiding làm bằng chứng authorization.
11. Ghi console errors và chạy nhanh board/history/duplicate queue, AI retry, English visibility, Admin oversight/hard-delete trên fixture được phép.

AC-314/317/318/321 hiện FAIL vì NOT RUN, cần evidence browser trước khi nâng PASS. Không đổi status chỉ dựa trên source/CSS hay test in-memory.
