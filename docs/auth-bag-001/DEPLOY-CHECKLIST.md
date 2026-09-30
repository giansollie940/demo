# "Hành trang tự học" (AUTH-BAG-001): checklist triển khai production

Làm theo thứ tự, đánh dấu từng ô. Mỗi bước có cách kiểm tra; **dừng lại nếu kết quả khác mong đợi**.

Trong tài liệu này:
- `<LOGIN_DOMAIN>` là tên miền đăng nhập (biến repo `LOGIN_DOMAIN`, ví dụ `users.example.com`);
- `<PROJECT_REF>` là mã project Supabase production.

Tính năng là **cách vào lớp phụ**: mật khẩu không đổi và luôn dùng được. Nếu có sự cố thì tắt cờ (mục 9) là đủ.

---

## 0. Chuẩn bị

- [ ] PR #25 và #26 đã merge; lần chạy **Build and Deploy** sau cùng trên `main` xanh.
- [ ] Chọn giờ ít người dùng (buổi tối, cuối tuần).
- [ ] Supabase → **Database → Backups**: có bản backup trong 24 giờ gần nhất (hoặc PITR đang bật).
- [ ] Có sẵn **một tài khoản học sinh thử** (vai trò `student`, đang hoạt động) và biết mật khẩu của nó.
- [ ] Đã cài Supabase CLI và đã `supabase login`, `supabase link --project-ref <PROJECT_REF>`. Hoặc dùng Dashboard ở mục 3.

## 1. Kiểm tra trước khi cài (chỉ đọc)

Chạy trong **SQL Editor**:

```sql
select
  (select count(*) from pg_available_extensions where name = 'pgcrypto')              as pgcrypto_available,  -- mong đợi 1
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'profiles'
       and column_name in ('id', 'role', 'active', 'deleted_at'))                      as profile_columns,     -- mong đợi 4
  to_regnamespace('auth_bag') is null                                                  as schema_is_new,       -- mong đợi true
  (select count(*) from pg_proc where proname like 'bag_auth_%')                       as existing_functions;  -- mong đợi 0
```

- [ ] Kết quả đúng như chú thích. Nếu `schema_is_new = false` hoặc `existing_functions > 0` thì đã có bản cài trước: dừng lại và hỏi trước khi chạy tiếp.

## 2. Cài database (upgrade 18)

- [ ] Mở `database/upgrade/18-AUTH-BAG-001-SCHOOL-BAG-LOGIN.sql`, dán **toàn bộ** vào SQL Editor rồi chạy. File tự bọc trong `begin … commit`, lỗi ở đâu thì không có gì được ghi.
- [ ] Kiểm tra sau khi cài:

```sql
select
  (select count(*) from information_schema.tables where table_schema = 'auth_bag')                        as tables,         -- 3
  (select bool_and(relrowsecurity) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'auth_bag' and c.relkind = 'r')                                                  as rls_on,         -- true
  (select count(*) from pg_proc where proname like 'bag_auth_%')                                        as api_functions,  -- 5
  (select bool_or(has_function_privilege(r, p.oid, 'execute'))
     from pg_proc p, unnest(array['anon', 'authenticated']) r where p.proname like 'bag_auth_%')        as api_open_to_users,   -- false
  (select bool_and(has_function_privilege('service_role', p.oid, 'execute'))
     from pg_proc p where p.proname like 'bag_auth_%')                                                  as service_role_ok,     -- true
  has_schema_privilege('authenticated', 'auth_bag', 'usage')                                            as schema_open_to_users; -- false
```

- [ ] Supabase → **Advisors → Security**: được phép có 3 dòng INFO "RLS Enabled No Policy" cho `auth_bag.*`. Đây là cố ý: không vai trò nào được đọc hay ghi trực tiếp. Không được có cảnh báo mới nào khác liên quan `bag_auth_*`.

## 3. Deploy Edge Functions

```bash
supabase functions deploy bag-enroll
supabase functions deploy bag-login --no-verify-jwt
```

- [ ] Cả hai hiện trong **Edge Functions**:
  - `bag-enroll`: "Verify JWT" **bật**;
  - `bag-login`: "Verify JWT" **tắt** (người dùng chưa có phiên khi gọi).
- [ ] **Edge Functions → Secrets** có `LOGIN_DOMAIN` giống hệt biến repo `LOGIN_DOMAIN`, và `ALLOWED_ORIGINS` có địa chỉ trang GitHub Pages. Các function hiện có đang dùng hai giá trị này, nên thường đã có sẵn.

Kiểm tra nhanh bằng terminal (thay `<ANON_KEY>` bằng publishable/anon key):

```bash
# Sai / tài khoản không có → 401 với thông báo chung
curl -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/bag-login" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" \
  -d '{"code":"khong-ton-tai","version":1,"items":["pen_red","ruler_red","ruler_red","scissors_blue","eraser_yellow","notebook_green","crayon_yellow","pencil_blue","sharpener_green","pencilcase_red"]}'
# Mong đợi: {"ok":false,"code":"BAG_LOGIN_FAILED",...}

# Không có phiên → 401
curl -s -X POST "https://<PROJECT_REF>.supabase.co/functions/v1/bag-enroll" \
  -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>" -H "Content-Type: application/json" -d '{"action":"status"}'
# Mong đợi: {"ok":false,"code":"INVALID_SESSION",...}
```

- [ ] Hai lệnh trả đúng như mong đợi. Nếu thấy `UNAVAILABLE` (503) thì xem **Edge Functions → bag-login → Logs**.
- [ ] Xoá bộ đếm do lần thử trên để lại:
  ```sql
  delete from auth_bag.attempts;
  ```

## 4. Bật cờ trên web

- [ ] GitHub repo → **Settings → Secrets and variables → Actions → Variables** → thêm `AUTH_BAG_ENABLED` = `true`.
- [ ] **Actions → Build and Deploy Sổ Tự Học Vue → Run workflow** (nhánh `main`), chờ xanh.
- [ ] Mở `https://<trang-pages>/config.js`: có dòng `"authBag": true`.
- [ ] Trang đăng nhập có nút **"Hành trang tự học"** dưới nút Đăng nhập (có thể cần tải lại mạnh: Ctrl+Shift+R).

## 5. Thử với tài khoản học sinh thử

Làm trên **máy tính** trước, rồi lặp lại các bước có dấu 📱 trên **điện thoại** và **iPad**.

- [ ] Đăng nhập bằng mật khẩu → **Cài đặt** → thẻ **"Hành trang tự học"** hiện "Chưa bật".
- [ ] **Thiết lập** → nhập sai mật khẩu → báo "Mật khẩu hiện tại không đúng".
- [ ] Nhập đúng mật khẩu → chọn 10 món giống nhau → **Tiếp tục** → bị chặn vì chuỗi quá dễ.
- [ ] Chọn 10–12 món khác nhau (nhớ thứ tự) → Tiếp tục → xếp lại sai một món → bị đưa về bước 1.
- [ ] Làm lại, xếp lại đúng → **Lưu cách xếp** → "Đang bật".
- [ ] Đăng xuất → trang đăng nhập → gõ mã → **Hành trang tự học** (mã được mang sang) 📱
- [ ] Xếp **sai** một món → **Bắt đầu tự học** → thông báo chung, cặp trống lại 📱
- [ ] Xếp **đúng** → hiện "Hành trang đã sẵn sàng. Cùng học thôi!" rồi vào Tổng quan 📱
- [ ] 📱 Trên điện thoại:
  - bấm 4 nút màu → ổ xoay đổi chủ đề và đổi màu dụng cụ;
  - vuốt ngang trên ổ xoay (hoặc bấm ◀ ▶) → ổ xoay quay, không thêm món;
  - chạm vào món ở giữa → thêm 1 món; chạm món bên cạnh → nó quay ra giữa, không thêm;
  - **giữ món ở giữa ~0,3 giây rồi kéo** vào cặp → thêm 1 món;
  - vuốt dọc → trang cuộn bình thường;
  - cặp dính ở đầu màn hình khi cuộn.
- [ ] Đăng xuất → xếp sai **5 lần** → lần 6 xếp đúng vẫn bị từ chối (đang khoá 15 phút).
- [ ] Trong lúc bị khoá, **đăng nhập bằng mật khẩu vẫn được**.
- [ ] Mở khoá cho tài khoản thử (xem mục 8), rồi vào Cài đặt → **Tắt** → nhập mật khẩu → "Chưa bật".
- [ ] Sau khi tắt, xếp đúng cặp cũ → bị từ chối.
- [ ] Mật khẩu của tài khoản thử vẫn như cũ.
- [ ] Nhật ký chỉ có sự kiện và kết quả, không có món nào:
  ```sql
  select at, event, reason from auth_bag.audit order by at desc limit 20;
  ```

## 6. Dùng thử với một lớp (1–2 tuần)

- [ ] Báo cho giáo viên chủ nhiệm và học sinh lớp thí điểm (mẫu thông báo ở cuối file).
- [ ] Mỗi vài ngày chạy các truy vấn ở mục 7; ghi lại phản hồi (khó nhớ, khó kéo, bị khoá oan…).
- [ ] Sau thí điểm, chốt:
  - số món và độ dài chuỗi (**đổi sau khi đã có người dùng thì mọi người phải thiết lập lại**);
  - ngưỡng khoá;
  - có mở cho giáo viên hay không.

## 7. Theo dõi

```sql
-- Hoạt động theo ngày
select date_trunc('day', at) as ngay, event, reason, count(*)
from auth_bag.audit group by 1, 2, 3 order by 1 desc, 2, 3;

-- Số học sinh đang bật
select count(*) filter (where enabled) as dang_bat, count(*) as tung_thiet_lap from auth_bag.credentials;

-- Đang bị khoá (account:<uuid> = tài khoản, account:code:<mã> = mã không tồn tại, ip:<địa chỉ> = mạng)
select scope, locked_until from auth_bag.attempts where locked_until > now() order by locked_until desc;
```

Dấu hiệu cần chú ý:
- nhiều `mismatch` dồn vào một tài khoản: có người đang đoán;
- `ip:` của mạng trường bị khoá thường xuyên: ngưỡng 30 lần/IP có thể thấp so với số học sinh.

## 8. Mở khoá thủ công

Học sinh bị khoá oan (vd. quên cách xếp), sau khi đã xác minh đúng người:

```sql
delete from auth_bag.attempts
where scope = 'account:' || (select id from auth.users where email = '<ma-hoc-sinh>@<LOGIN_DOMAIN>')::text;
```

Quên hẳn cách xếp: học sinh tự đăng nhập bằng mật khẩu và **Đổi cách xếp** trong Cài đặt. Không cần can thiệp database.

## 9. Rút lui

| Mức | Làm gì | Tác dụng |
|---|---|---|
| Tạm tắt (khuyên dùng) | Đặt `AUTH_BAG_ENABLED` khác `true` (hoặc xoá) → chạy lại workflow Pages | Nút và thẻ Cài đặt biến mất, `/login/bag` chuyển về `/login`. Dữ liệu giữ nguyên để bật lại |
| Chặn ở server | `supabase functions delete bag-login` | Không ai vào lớp bằng cặp được, kể cả gọi thẳng API |
| Gỡ hẳn | Chạy SQL dưới đây | Xoá toàn bộ dữ liệu "Hành trang tự học"; không ảnh hưởng mật khẩu hay dữ liệu khác |

```sql
begin;
drop function if exists public.bag_auth_status(uuid);
drop function if exists public.bag_auth_enroll(uuid, text, smallint, int);
drop function if exists public.bag_auth_disable(uuid);
drop function if exists public.bag_auth_attempt(text, text, text, text, smallint, int, int, int, int, int, int, int);
drop function if exists public.bag_auth_still_valid(uuid, integer);
drop schema if exists auth_bag cascade;
commit;
```

---

## Mẫu thông báo cho học sinh

> 🎒 **Mới: "Hành trang tự học"**. Một cách vào lớp vui hơn, không cần gõ mật khẩu.
>
> 1. Đăng nhập như bình thường → **Cài đặt** → **Hành trang tự học** → **Thiết lập**.
> 2. Chọn 10–20 dụng cụ học tập và thứ tự xếp vào cặp *của riêng em* (một món có thể chọn nhiều lần), rồi xếp lại một lần nữa để xác nhận.
> 3. Lần sau, ở trang đăng nhập bấm **Hành trang tự học**, gõ mã đăng nhập, xếp đúng cặp và **Bắt đầu tự học**.
>
> Lưu ý:
> - Đừng xếp khi có bạn đang nhìn.
> - Sai 5 lần thì cách này tạm khoá 15 phút, nhưng mật khẩu vẫn dùng được.
> - Quên cách xếp thì cứ đăng nhập bằng mật khẩu rồi đổi cách xếp mới trong Cài đặt.
