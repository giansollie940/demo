# Sổ Tự Học

Ứng dụng web cho lớp học: học sinh đăng ký buổi tự học, giáo viên (hoặc AI) duyệt, cùng báo bài, điểm danh trễ và quản lý lớp. Giao diện Vue 3, dữ liệu trên Supabase.

## Cài cho trường của bạn

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fgiansollie940%2Fdemo&project-name=so-tu-hoc&repository-name=so-tu-hoc&env=SUPABASE_URL%2CSUPABASE_PUBLISHABLE_KEY%2CSETUP_PASSWORD&envDescription=SUPABASE_URL%20v%C3%A0%20SUPABASE_PUBLISHABLE_KEY%3A%20l%E1%BA%A5y%20%E1%BB%9F%20project%20Supabase%20tr%E1%BB%91ng%20%28n%C3%BAt%20Connect%29.%20SETUP_PASSWORD%3A%20t%E1%BB%B1%20%C4%91%E1%BA%B7t%2C%20%C3%ADt%20nh%E1%BA%A5t%208%20k%C3%BD%20t%E1%BB%B1%2C%20d%C3%B9ng%20%C4%91%E1%BB%83%20m%E1%BB%9F%20trang%20%2Fsetup.&envLink=https%3A%2F%2Fgithub.com%2Fgiansollie940%2Fdemo%2Fblob%2Fmain%2Fdocs%2Fcai-dat%2FHUONG-DAN.md)

Tạo một project Supabase trống, bấm nút trên, rồi mở `/setup` trên trang vừa deploy. Hướng dẫn từng bước: [docs/cai-dat/HUONG-DAN.md](docs/cai-dat/HUONG-DAN.md).

## Phát triển

```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # test tĩnh và test bộ cài
npm run test:unit
```
