# BUG-002 — Restore Banner Backgrounds

## Task

**Task ID:** `BUG-002`  
**Title:** Khôi phục nền banner và chuẩn hóa banner pattern ở các trang bị regression  
**Status:** `FINAL`

---

## Objective

Khôi phục giao diện banner/header bị mất nền màu hoặc nền trang trí tại:

1. Admin → `Quản trị Báo bài`;
2. Teacher → `Thời khóa biểu`;
3. `Cài đặt cá nhân` (`personal-header`).

Đồng thời audit toàn bộ pattern banner/page-header hiện hành để tránh các page mới hoặc page đã có tiếp tục bị sót background/padding/border/shadow khi dùng `PageArtwork`, `PageBannerArt` hoặc shared page-header styling.

Mục tiêu là đưa các khu vực này trở lại đúng visual language của ứng dụng hiện tại, đồng thời không làm thay đổi nghiệp vụ, quyền, dữ liệu hoặc bố cục chức năng đang hoạt động.

---

## Current Behavior

Quan sát giao diện hiện tại cho thấy:

- banner/header của trang Admin `Quản trị Báo bài` bị mất nền màu hoặc lớp nền trang trí;
- banner/header của trang `Thời khóa biểu` dành cho Teacher cũng bị mất nền;
- `personal-header` ở Cài đặt cá nhân có `PageBannerArt` nhưng không nhận đầy đủ shared banner treatment như padding/border/background/shadow;
- nội dung chữ và các control vẫn hiển thị nhưng phần đầu trang trở nên phẳng, thiếu phân tầng thị giác và không đồng nhất với các page khác;
- lỗi xuất hiện ở nhiều khu vực và source hiện tại cho thấy banner styling đang được áp dụng theo danh sách selector thủ công, làm tăng nguy cơ page bị sót khi có header/banner mới.

Astra phải khảo sát implementation hiện tại để xác định nguyên nhân thật trước khi sửa.

---

## Required Behavior

### RB-001 — Admin Homework banner

Trang Admin `Quản trị Báo bài` phải:

- hiển thị lại nền banner đúng visual design hiện hành;
- giữ nguyên title/subtitle;
- giữ nguyên filter khối/lớp;
- giữ nguyên tab và thống kê phía dưới;
- không làm text giảm độ tương phản.

### RB-002 — Teacher Timetable banner

Trang `Thời khóa biểu` của Teacher phải:

- hiển thị lại nền banner đúng visual design hiện hành;
- giữ nguyên title/subtitle/control liên quan;
- không ảnh hưởng timetable content;
- không ảnh hưởng responsive behavior.

### RB-003 — Personal Settings banner

Trang `Cài đặt cá nhân` phải:

- hiển thị đầy đủ nền banner theo visual design hiện hành;
- giữ nguyên `PageBannerArt`, `PageArtwork`, title/subtitle và các control;
- có padding/border/background/shadow nhất quán với shared banner pattern;
- không làm thay đổi nội dung hồ sơ, giao diện hoặc Cú Thông Thái.

### RB-004 — Admin Homework leading artwork

Banner Admin `Quản trị Báo bài` phải có biểu tượng/illustration đầu trang theo cùng visual language với các page banner hiện hành.

Yêu cầu:

- có `PageArtwork` hoặc shared equivalent ở phía trước khối title/subtitle;
- ưu tiên reuse artwork `homework` đang dùng cho trang Báo bài Student/Teacher, trừ khi codebase có artwork Admin-specific đã được chuẩn hóa;
- artwork phải nằm trong shared lead layout (`page-head-lead` hoặc pattern tương đương);
- kích thước, khoảng cách và alignment phải nhất quán với các banner khác;
- không được dùng emoji/text icon tạm thay cho shared artwork nếu component hiện có đã hỗ trợ;
- artwork không được che title/subtitle hoặc control khi responsive.

### RB-005 — Banner pattern audit

Astra phải rà các page/header hiện có liên quan tới:

- `PageBannerArt`;
- `PageArtwork`;
- `.page-header`;
- các class header/banner riêng.

Mỗi page header thuộc visual banner family phải rơi vào một trong hai trường hợp:

1. dùng shared banner pattern/component/style;
2. có explicit local banner style có chủ đích và được regression-test.

Không được để page vô tình không có background chỉ vì thiếu một selector trong `base.css`.

### RB-006 — Shared-source fix

Nếu hai lỗi cùng xuất phát từ:

- shared component;
- shared page shell;
- shared CSS class;
- shared token/theme variable;

thì fix phải được thực hiện ở nguồn chung hoặc pattern chung phù hợp.

Không được vá hai page bằng hai cách khác nhau nếu nguyên nhân thực tế là cùng một shared styling regression.

### RB-007 — Visual consistency

Banner sau fix phải:

- đồng nhất với visual language V9;
- dùng spacing, border radius, typography, artwork/background treatment phù hợp với các page banner hiện hành;
- không tạo style mới tách biệt khỏi design system hiện tại.

### RB-008 — Responsive

Trên desktop/tablet/mobile:

- banner không overflow;
- text không bị che;
- artwork/background không đè lên nội dung;
- padding và chiều cao không làm layout mất cân đối.

---

## Actors

### Admin

Liên quan trực tiếp tới banner của `Quản trị Báo bài`.

### Teacher

Liên quan trực tiếp tới banner của `Thời khóa biểu`.

Không thay đổi permission của actor nào trong task này.

---

## Business Rules

`BR-001` — BUG-002 chỉ sửa visual regression, không thay đổi business logic.

`BR-002` — Không thay đổi permission hoặc route authorization.

`BR-003` — Không thay đổi dữ liệu, API, RPC, RLS, migration hoặc Edge Function.

`BR-004` — Nếu nguyên nhân nằm ở shared banner/page-shell style, ưu tiên sửa tại shared source để tránh duplicate patch.

`BR-005` — Không được làm mất style đúng của các page khác đang dùng cùng component/class/token.

`BR-006` — Mọi page header thuộc banner family phải dùng shared banner pattern hoặc explicit local banner style có chủ đích; không được phụ thuộc vào việc nhớ thêm selector thủ công mà không có test.

`BR-007` — Banner Admin Quản trị Báo bài phải reuse shared artwork/component pattern; không tạo icon đầu trang bằng markup riêng nếu `PageArtwork` phù hợp đã tồn tại.

---

## Permissions

Không thay đổi.

### Admin
Giữ nguyên quyền hiện hành.

### Teacher
Giữ nguyên quyền hiện hành.

### Monitor / Student
Không bị ảnh hưởng.

---

## Edge Cases

`EC-001` — Shared banner component đang được nhiều page sử dụng → fix phải kiểm regression trên các page khác.

`EC-002` — Banner có artwork tuyệt đối/overlay → phải kiểm z-index và contrast để không che text/control.

`EC-003` — Dark/light theme hoặc theme token hiện hành → fix không được hard-code màu gây lệch theme nếu codebase đang dùng token/shared variable.

`EC-004` — Mobile viewport nhỏ → background artwork không làm banner quá cao hoặc tạo horizontal scroll.

`EC-005` — Page có subtitle dài → text phải wrap an toàn và vẫn đọc được.

`EC-006` — Một page dùng `PageBannerArt/PageArtwork` nhưng không thuộc shared selector list → audit phải phát hiện và yêu cầu explicit shared/local banner treatment.

`EC-007` — Page có local header style cố ý khác shared banner → không được ép vào shared pattern nếu làm hỏng layout; phải giữ explicit local style và có regression verification.

`EC-008` — Admin banner có actions/filter ở gần header → artwork phải co giãn/ẩn trang trí phụ hợp lý ở mobile nhưng biểu tượng nhận diện chính không được làm vỡ bố cục.

---

## Data Impact

`NONE`

Không có:

- schema change;
- migration;
- data mutation;
- backfill;
- history impact.

---

## Security Impact

`NONE`

Không thay đổi:

- authentication;
- authorization;
- RLS;
- RPC;
- direct API access;
- role handling.

Astra không được chỉnh permission chỉ để sửa visual bug.

---

## Must Not Break

- Admin `Quản trị Báo bài`;
- Teacher `Thời khóa biểu`;
- `Cài đặt cá nhân`;
- sidebar/layout chung;
- page navigation;
- FEAT-004 multi-class UI nếu đang dùng chung shell;
- FEAT-003 visual styles nếu dùng cùng token/component;
- responsive desktop/mobile;
- typography/iconography;
- các page khác dùng cùng banner/page shell.

---

## Acceptance Criteria

`AC-001` — Given Admin mở `Quản trị Báo bài`, when page render, then banner hiển thị lại nền màu/trang trí đúng visual language hiện tại.

`AC-002` — Given Teacher mở `Thời khóa biểu`, when page render, then banner hiển thị lại nền màu/trang trí đúng visual language hiện tại.

`AC-003` — Given user mở `Cài đặt cá nhân`, when page render, then `personal-header` có đầy đủ background/padding/border/shadow theo banner pattern phù hợp.

`AC-004` — Given banner đã có nền, when xem title/subtitle/control, then text vẫn đủ tương phản và không bị artwork che khuất.

`AC-005` — Given desktop, tablet hoặc mobile viewport, when page render, then banner không overflow và không phá bố cục.

`AC-006` — Given các page khác dùng cùng banner/shared style, when fix được áp dụng, then các page đó không bị mất nền, lệch spacing hoặc hỏng typography.

`AC-007` — Given Admin Homework tabs/filter và Teacher timetable controls, when visual fix được áp dụng, then toàn bộ chức năng cũ vẫn hoạt động như trước.

`AC-008` — Browser/visual verification phải bao gồm tối thiểu:
- Admin → Quản trị Báo bài;
- Teacher → Thời khóa biểu;
- Cài đặt cá nhân;
- ít nhất một page khác dùng chung banner/shared component nếu có.

`AC-009` — Build/typecheck/regression frontend phù hợp phải PASS trước khi bàn giao review.

`AC-010` — Given audit toàn bộ page headers, when Astra rà các page dùng `PageBannerArt`, `PageArtwork`, `.page-header` hoặc header/banner class riêng, then không còn page thuộc banner family bị thiếu background treatment do selector omission.

`AC-011` — Regression coverage phải có ít nhất một test/static assertion bảo vệ banner pattern khỏi việc thêm page/header mới nhưng quên shared/local banner styling.

`AC-012` — Given Admin mở `Quản trị Báo bài`, when banner render, then có shared leading artwork/icon ở đầu khối title, cùng pattern với các page banner hiện hành.

`AC-013` — Given desktop/mobile viewport, when Admin banner render, then artwork không che nội dung, không lệch alignment và không làm overflow header.

`AC-014` — Given source implementation, when kiểm tra Admin Homework header, then artwork được reuse từ shared component/pattern hiện có thay vì icon tạm/hard-code riêng.


---

## Out of Scope

- Thiết kế lại toàn bộ Admin Homework page.
- Thiết kế lại toàn bộ Teacher Timetable.
- Thay đổi artwork chung của ứng dụng.
- Thay đổi route/menu.
- Thay đổi role/permission.
- FEAT-004 business logic.
- Database/backend changes.
- Refactor lớn CSS/layout ngoài phần trực tiếp gây regression.
- Thiết kế lại nội dung hoặc business behavior của Cài đặt cá nhân.

---

## Effort Recommendation

`ASTRA_EFFORT: MEDIUM`

Lý do:

- frontend-only visual regression;
- không có database/RLS/auth change;
- scope nhỏ và xác định rõ.

Nếu Astra phát hiện nguyên nhân nằm ở shared layout phức tạp ảnh hưởng nhiều page hoặc cần refactor rộng hơn dự kiến, Astra phải báo:

`RECOMMEND_EFFORT: MEDIUM`

trước khi mở rộng phạm vi.

---

## Final Status

`STATUS: FINAL`
