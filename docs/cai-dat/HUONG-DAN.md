# Cài Sổ Tự Học cho trường của bạn

Bộ cài dựng một bản Sổ Tự Học **riêng**: dữ liệu nằm trong tài khoản Supabase của bạn, trang web chạy trên tài khoản Vercel của bạn. Cả ba dịch vụ (GitHub, Supabase, Vercel) đều có gói miễn phí đủ dùng cho một trường.

Bạn chỉ cần làm 3 việc: tạo một project Supabase trống, bấm nút **Deploy to Vercel**, rồi làm theo trang **/setup**. Mất khoảng 15 phút.

## Cần chuẩn bị

- Tài khoản [GitHub](https://github.com/signup), [Supabase](https://supabase.com/dashboard/sign-up) và [Vercel](https://vercel.com/signup). Vercel cho đăng nhập bằng GitHub.
- Tuỳ chọn: tài khoản [Groq](https://console.groq.com) nếu muốn AI tự duyệt đăng ký tự học. Tài khoản [Cloudflare](https://dash.cloudflare.com/sign-up) nếu muốn đính kèm ảnh trong báo bài.

## Bước 1. Tạo project Supabase trống

1. Mở [Supabase Dashboard](https://supabase.com/dashboard) → **New project**.
2. Đặt tên (ví dụ `so-tu-hoc`), đặt mật khẩu cơ sở dữ liệu (lưu lại ở nơi an toàn), chọn **Region: Southeast Asia (Singapore)**.
3. Bấm **Create new project** và chờ khoảng 2 phút cho project sẵn sàng.
4. Bấm nút **Connect** ở trên cùng (hoặc **Project Settings → API Keys**), chép hai giá trị:
   - **Project URL**, dạng `https://xxxxxxxxxxxxxxxxxxxx.supabase.co`.
   - **Publishable key**, bắt đầu bằng `sb_publishable_`.

> Dùng project **mới, trống**. Bộ cài từ chối project đã có bảng dữ liệu khác.

## Bước 2. Bấm Deploy to Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgiansollie940%2Fdemo&project-name=so-tu-hoc&repository-name=so-tu-hoc&env=SUPABASE_URL%2CSUPABASE_PUBLISHABLE_KEY%2CSETUP_PASSWORD&envDescription=SUPABASE_URL%20v%C3%A0%20SUPABASE_PUBLISHABLE_KEY%3A%20l%E1%BA%A5y%20%E1%BB%9F%20project%20Supabase%20tr%E1%BB%91ng%20%28n%C3%BAt%20Connect%29.%20SETUP_PASSWORD%3A%20t%E1%BB%B1%20%C4%91%E1%BA%B7t%2C%20%C3%ADt%20nh%E1%BA%A5t%208%20k%C3%BD%20t%E1%BB%B1%2C%20d%C3%B9ng%20%C4%91%E1%BB%83%20m%E1%BB%9F%20trang%20%2Fsetup.&envLink=https%3A%2F%2Fgithub.com%2Fgiansollie940%2Fdemo%2Fblob%2Fmain%2Fdocs%2Fcai-dat%2FHUONG-DAN.md)

1. Bấm nút trên và đăng nhập Vercel. Vercel sẽ tạo một bản sao của repo trong GitHub của bạn.
2. Vercel hỏi 3 biến môi trường:

   | Biến | Điền gì |
   |---|---|
   | `SUPABASE_URL` | Project URL ở bước 1 |
   | `SUPABASE_PUBLISHABLE_KEY` | Publishable key ở bước 1 |
   | `SETUP_PASSWORD` | Tự đặt một mật khẩu (ít nhất 8 ký tự). Chỉ ai biết mật khẩu này mới mở được trang cài đặt. |

3. Bấm **Deploy**, chờ khoảng 1–2 phút.

Có thể đặt thêm biến `LOGIN_DOMAIN` (ví dụ `truong-abc.edu.vn`) để tên đăng nhập được ghép thành email nội bộ theo tên miền của trường. Không đặt thì dùng `users.example.com`. Hãy đặt **trước khi cài** và không đổi về sau.

## Bước 3. Mở trang cài đặt

Mở `https://<tên-project>.vercel.app/setup/` (Vercel hiện địa chỉ này sau khi deploy xong) và làm lần lượt:

1. **Kiểm tra cài đặt Vercel**: trang tự đọc 3 biến ở bước 2.
2. **Mật khẩu cài đặt**: nhập `SETUP_PASSWORD`.
3. **Kết nối Supabase**: tạo một *Access Token* ở [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens) rồi dán vào. Trang có hướng dẫn chi tiết ngay cạnh ô nhập, và nút **Kiểm tra** báo đúng hay sai ngay.
4. **AI duyệt đăng ký** (tuỳ chọn): khoá Groq. Bỏ qua thì giáo viên duyệt tay.
5. **Ảnh trong báo bài** (tuỳ chọn): 4 thông tin của Cloudflare R2. Bỏ qua thì báo bài vẫn dùng được bằng chữ.
6. **Tài khoản quản trị**: họ tên, tên đăng nhập, mật khẩu.
7. **Cài đặt**: bấm một nút, bộ cài tự làm 24 bước trong 2–4 phút.

Xong là đăng nhập được ngay bằng tài khoản quản trị vừa tạo.

### Sau khi cài

- Xoá Access Token ở [Supabase → Access Tokens](https://supabase.com/dashboard/account/tokens). Bộ cài không cần nó nữa.
- Trang `/setup` tự khoá khi đã có tài khoản quản trị. Có thể xoá biến `SETUP_PASSWORD` trên Vercel.
- Đăng nhập bằng tài khoản quản trị để tạo năm học, lớp, giáo viên và học sinh.

## An toàn

- Access Token và các khoá chỉ đi từ trình duyệt của bạn tới máy chủ Vercel **của chính bạn**, rồi tới Supabase, Groq và Cloudflare. Chúng không được lưu vào file, vào trình duyệt hay vào biến môi trường.
- Bộ cài chỉ thao tác trên đúng project ghi trong `SUPABASE_URL`.
- Tự đăng ký bị tắt: chỉ quản trị viên tạo được tài khoản.

## Gặp lỗi?

| Thông báo | Cách xử lý |
|---|---|
| *Trang cài đặt chỉ chạy trên bản deploy Vercel* | Bạn đang mở trang trên GitHub Pages. Hãy mở địa chỉ `…vercel.app/setup/`. |
| *Thiếu SUPABASE_URL…* | Vào Vercel → Settings → Environment Variables, thêm biến còn thiếu, rồi **Redeploy**. |
| *Supabase từ chối Access Token* | Token sai, đã hết hạn hoặc đã bị xoá. Tạo token mới. |
| *Access Token không có quyền với project này* | Tạo token bằng đúng tài khoản Supabase sở hữu project. |
| *Project … đã có dữ liệu khác* | Tạo một project Supabase mới, sửa `SUPABASE_URL` và `SUPABASE_PUBLISHABLE_KEY` trên Vercel, Redeploy. |
| Một bước báo lỗi giữa chừng | Bấm **Thử lại**: các bước đã xong không chạy lại. |

## Dành cho người duy trì repo

- `installer/sql/10-baseline.sql` là bản chụp cấu trúc cơ sở dữ liệu (không có dữ liệu, không có khoá), sinh bởi `installer/snapshot/generate.sql`.
- Migration mới trong `supabase/migrations/` được bộ cài tự áp dụng sau bản chụp, không cần làm gì thêm.
- Muốn chụp lại (ví dụ khi đã có nhiều migration mới): chạy `SUPABASE_ACCESS_TOKEN=… SUPABASE_PROJECT_REF=… node installer/snapshot/fetch.mjs`, rồi cập nhật `baselineMigrations` và `baselineDate` trong `installer/manifest.json`.
- Test: `node --test tests/installer/`.
