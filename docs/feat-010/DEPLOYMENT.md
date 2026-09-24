# FEAT-010 — triển khai

Một tệp SQL, một lần deploy frontend. Không có Edge Function nào mới, không có
secret nào mới, không có cron nào mới.

---

## 0. Trước khi bắt đầu

**Chạy trước trên SQL editor, chỉ đọc.** Nếu câu nào trả về dòng thì dừng lại và
hỏi, đừng chạy tiếp.

```sql
-- (a) Đã cài FEAT-010 chưa? Phải trả 0.
select count(*) from information_schema.columns
 where table_schema='public' and table_name='registrations'
   and column_name='effective_uses_electronic_device';

-- (b) Chuỗi trigger trên registrations phải đúng như bản đã kiểm thử.
--     Phải trả đúng 4 dòng, theo đúng thứ tự tên này.
select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
 where c.relname='registrations' and not t.tgisinternal and t.tgtype::int & 2 = 2
 order by tgname;
-- mong đợi: trg_00_set_registration_class,
--           trg_01_validate_registration_class_week,
--           trg_05_guard_student_registration_update,
--           trg_apply_smart_approval

-- (b2) Publication realtime hiện là gì? Sol RC2 §9 đã đo trên production:
--      puballtables = false, tức là publication chọn lọc, nên bảng mới KHÔNG tự
--      vào. Ghi lại kết quả trước khi chạy để bước 2b bên dưới có cái đối chiếu.
select puballtables from pg_publication where pubname='supabase_realtime';
select tablename from pg_publication_tables
 where pubname='supabase_realtime' order by tablename;

-- (c) Có tiết nào đang được dùng mà thiếu giờ bắt đầu không? Phải trả 0 dòng.
--     Nếu có, chính sách thiết bị sẽ từ chối thao tác trên tiết đó thay vì đoán
--     — đúng theo DEC-110, nhưng tốt hơn là biết trước.
select distinct r.period_number
  from public.registrations r
  left join public.periods p on p.period_number=r.period_number
 where p.start_time is null;
```

FEAT-007 RC6 nên được áp xong trước (production hiện đang chạy RC1 — xem
`docs/feat-007/PRODUCTION_UPGRADE_RC1_TO_RC6.md`). FEAT-010 không phụ thuộc vào
nó về mặt kỹ thuật, nhưng để hai việc chưa xong chồng lên nhau thì lúc có chuyện
sẽ khó biết là do việc nào.

---

## 1. SQL

```
database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql
```

Dán nguyên tệp vào SQL editor của Supabase và chạy. Một transaction.

Nó ghi lại dữ liệu đúng một lần: backfill cột mới bằng chính giá trị của cột cũ.
`updated_at` không bị chạm, nên không có dòng nào trông như vừa được sửa.

Xong thì kiểm tra:

```sql
-- Cột mới có, và bằng đúng cột cũ trên mọi dòng (chưa có policy nào).
select count(*) filter (where uses_electronic_device <> effective_uses_electronic_device) as lech,
       count(*) as tong
  from public.registrations;
-- mong đợi: lech = 0

-- Trigger mới nằm đúng chỗ trong chuỗi.
select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid
 where c.relname='registrations' and not t.tgisinternal and t.tgtype::int & 2 = 2
 order by tgname;
-- mong đợi: …trg_05_…, trg_06_apply_device_use_policy, trg_apply_smart_approval

-- Hai bảng policy chỉ cho đọc, và chỉ người quản lý lớp.
select tablename, string_agg(cmd,',' order by cmd) from pg_policies
 where schemaname='public' and tablename like 'device_use_%' group by tablename;
-- mong đợi: mỗi bảng đúng một dòng, cmd = SELECT

-- Sol RC1 P3 + Sol RC3 R-002: đúng một hàm của FEAT-010 được client gọi.
-- Trên dự án này `pg_default_acl` cấp `anon=X` **tường minh** cho mọi hàm mới,
-- nên đây là chỗ để phát hiện nếu một hàm nào đó lọt lưới thu hồi.
--
-- Sol RC4 §9: bản trước dùng `p.proname like 'device\_use%'`, và đúng cái mẫu đó
-- là thứ đã để `apply_device_use_policy` lọt ở RC3. Test tự động đã đổi sang
-- danh sách tên tường minh từ RC4; đây là cùng một danh sách, để lệnh tiền kiểm
-- trên production kiểm đúng cái bất biến mà test kiểm.
--
-- Câu (1) phải trả **13** — nếu ít hơn thì migration chưa chạy xong hoặc danh
-- sách này đã lạc hậu so với migration, và câu (2) bên dưới sẽ kiểm một tập sai.
with feat010(proname) as (values
  ('apply_device_use_policy'),('device_use_assert_year_writable'),('device_use_bump_signal'),
  ('device_use_effective'),('device_use_guard_override_week'),('device_use_guard_year_freeze'),
  ('device_use_live_override'),('device_use_locking_interval'),('device_use_policy'),
  ('device_use_policy_state'),('device_use_recompute'),('device_use_slot_key'),
  ('device_use_week_slots'))
select count(*) as so_ham_tim_thay   -- (1) mong đợi: 13
  from feat010 f join pg_proc p on p.proname=f.proname
  join pg_namespace n on n.oid=p.pronamespace and n.nspname='public';

-- (2) Phải trả đúng một dòng:  device_use_policy | authenticated
-- (grantee = 0 là PUBLIC; nó không join được với pg_roles nên phiên bản hiển
--  nhiên của truy vấn này sẽ bỏ sót một grant PUBLIC còn sót lại.)
with feat010(proname) as (values
  ('apply_device_use_policy'),('device_use_assert_year_writable'),('device_use_bump_signal'),
  ('device_use_effective'),('device_use_guard_override_week'),('device_use_guard_year_freeze'),
  ('device_use_live_override'),('device_use_locking_interval'),('device_use_policy'),
  ('device_use_policy_state'),('device_use_recompute'),('device_use_slot_key'),
  ('device_use_week_slots'))
select p.proname, coalesce(r.rolname,'PUBLIC') as grantee
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  join feat010 f on f.proname=p.proname
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
  left join pg_roles r on r.oid=a.grantee
 where n.nspname='public' and a.privilege_type='EXECUTE'
   and (a.grantee = 0 or r.rolname in ('anon','authenticated'))
 order by 1,2;

-- Sol RC4 R-003: trạng thái lưu trữ của từng năm học, để biết lớp nào còn đổi
-- được chính sách sau khi cài. Chỉ `active` mới ghi được.
select y.archive_state, count(*) as so_lop
  from public.classes c join public.school_years y on y.id=c.school_year_id
 group by 1 order by 1;

-- Sol RC5 R-004: chốt chặn phải nằm **ở bảng**, không chỉ trong RPC — nếu không
-- thì `service_role` (BYPASSRLS, `grant all`) ghi thẳng vào bảng là đi vòng qua
-- nó. Phải trả đúng hai dòng, mỗi bảng một trigger, và `tgenabled = 'O'`:
select c.relname, t.tgname, t.tgenabled
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
 where not t.tgisinternal and t.tgname='trg_00_device_use_year_freeze'
 order by 1;
-- mong đợi: device_use_lock_intervals | trg_00_device_use_year_freeze | O
--           device_use_session_overrides | trg_00_device_use_year_freeze | O

-- Sol RC5 R-005: chốt chặn phải **khoá** dòng năm học, không chỉ đọc nó. Phải
-- trả `1`. `for key share` không tính: nó không xung đột với FOR NO KEY UPDATE
-- mà `update school_years set archive_state='archiving'` lấy.
select count(*) from pg_proc
 where proname='device_use_assert_year_writable'
   and prosrc like '%for share of y%' and prosrc not like '%for key share%';

-- Sol RC6 R-006: một override chỉ có **một** chủ sở hữu. Phải trả đúng hai
-- dòng — khoá unique trên bảng khoảng khoá, và FK hợp thành trỏ vào nó — và cột
-- `cols` phải đúng bốn cột, không phải hai.
select conname, pg_get_constraintdef(oid) as dinh_nghia
  from pg_constraint
 where conname in ('device_use_lock_intervals_owner_key',
                   'device_use_session_overrides_interval_owner_fkey')
 order by 1;
-- mong đợi: UNIQUE (id, class_id, weekday, period_number)
--           FOREIGN KEY (interval_id, class_id, weekday, period_number)
--             REFERENCES device_use_lock_intervals(id, class_id, weekday, period_number) ON DELETE CASCADE

-- …và FK một cột của bản cũ phải **không** còn (nếu môi trường này từng chạy
-- RC5/RC6). Phải trả 0.
select count(*) from pg_constraint
 where conname='device_use_session_overrides_interval_id_fkey';

-- Trigger kiểm tuần cùng năm học. Phải trả một dòng, `tgenabled = 'O'`.
select tgname, tgenabled from pg_trigger
 where tgname='trg_01_device_use_override_week' and not tgisinternal;

-- Sol RC7 R-008: "ngoại lệ nào đang có hiệu lực" chỉ được viết một lần. JSON
-- của người quản lý phải gọi hàm đó, **không** tự tra theo lớp+tuần+ô — nếu tự
-- tra, một lớp đã qua hai chu kỳ Lock sẽ làm cả RPC `state` gãy. Phải trả `1`.
select count(*) from pg_proc
 where proname='device_use_policy'
   and prosrc like '%device_use_live_override(u.iv,v_week,s.weekday,s.period_number,t.ss)%';

-- Sol RC6 R-007: `service_role` chỉ còn quyền đọc trên ba bảng của FEAT-010.
-- Phải trả đúng ba dòng, tất cả `SELECT`, không có INSERT/UPDATE/DELETE nào.
select c.relname, a.privilege_type
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
  join pg_roles r on r.oid=a.grantee
 where n.nspname='public' and c.relname like 'device\_use%' and r.rolname='service_role'
 order by 1,2;

-- Sol RC2 §8: ba bảng, và chỉ bảng tín hiệu là học sinh đọc được.
-- Phải trả:  device_use_lock_intervals | 1, device_use_policy_signals | 1,
--            device_use_session_overrides | 1   (mỗi bảng đúng một policy SELECT)
select tablename, count(*) as so_policy
  from pg_policies
 where schemaname='public' and tablename like 'device\_use%'
 group by tablename order by 1;
```

---

## 2. Frontend

**Thứ tự: SQL trước, frontend sau.** Ngược với FEAT-007, và có lý do:

- frontend mới select cột `effective_uses_electronic_device`. Nếu cột chưa tồn
  tại, PostgREST trả lỗi cho cả câu select và **trang đăng ký hỏng**;
- frontend cũ chạy trên schema mới thì không sao: nó chỉ không hiển thị trạng
  thái khoá, còn cưỡng chế vẫn chạy ở database.

Nói cách khác, cửa sổ giữa hai bước là an toàn theo đúng một chiều. Đi đúng
chiều đó.

Tệp thay đổi:

```
public/supabase-service.js
src/types/legacy.ts
src/app/router/routes.ts
src/features/navigation/navigation.ts
src/features/dashboard/dashboard-model.ts
src/features/tracking/tracking-model.ts
src/features/registrations/device-policy.ts            (mới)
src/features/registrations/device-policy-queries.ts    (mới)
src/pages/DevicePolicyPage.vue                         (mới)
src/components/registrations/DevicePolicyHistory.vue   (mới, RC4)
src/components/admin/AdminDevicePolicy.vue             (mới, RC4)
src/pages/AdminPage.vue
src/realtime/useRealtimeInvalidation.ts
src/pages/RegistrationPage.vue
src/components/registrations/RegistrationDialog.vue
src/components/registrations/StudySessionCard.vue
src/components/approvals/ApprovalList.vue
src/components/approvals/ApprovalDetail.vue
src/components/tracking/StudentTrackingRow.vue
```

---

## 3. Kiểm tra sau khi deploy

1. Đăng nhập bằng tài khoản giáo viên: sidebar có mục **Thiết bị điện tử**, và
   trang đó liệt kê đúng các tiết trong thời khoá biểu của lớp, tất cả ở trạng
   thái **Đang mở**.
2. **Duyệt đăng ký** và **Theo dõi cả lớp** vẫn hiện đầy đủ như trước.
2b. **Realtime** (Sol RC1 §9, sửa lại theo Sol RC2 §8). Bảng cần bật là
   **`device_use_policy_signals`**, không phải hai bảng policy — hai bảng đó là
   manager-only nên Postgres Changes sẽ không phát cho học sinh dù có bật.

   Trên Supabase: **Database → Replication → `supabase_realtime`**, bật
   `device_use_policy_signals`. Kiểm bằng SQL, phải trả đúng một dòng:

   ```sql
   select tablename from pg_publication_tables
    where pubname='supabase_realtime' and tablename='device_use_policy_signals';
   ```

   **Nếu quên bước này thì tính năng vẫn đúng**, chỉ kém tức thời: trang vẫn
   hỏi lại máy chủ khi mở hộp thoại đăng ký và khi cửa sổ được focus lại. Đó là
   chủ ý — một màn hình đúng không nên phụ thuộc vào một cái công tắc trên
   dashboard.

   Kiểm chứng đầu-cuối: mở trang đăng ký bằng tài khoản học sinh, khóa một tiết
   từ tài khoản giáo viên ở cửa sổ khác, ô chọn phải tự khóa lại mà không cần
   tải lại trang.
3. Trên một tiết ở **tuần sau**, bấm **Khóa từ bây giờ**. Thông báo nên cho biết
   có bao nhiêu đăng ký đã có được tính lại.
4. Đăng nhập bằng tài khoản học sinh, mở đúng buổi đó: ô **Sử dụng thiết bị điện
   tử** vẫn hiện, bị khóa, và có dòng "Buổi này tạm thời không cho đăng ký sử
   dụng thiết bị điện tử."
5. Mở một buổi **tuần trước** của cùng tiết đó: không có gì thay đổi
   (AC-010-015).
6. Quay lại tài khoản giáo viên, bấm **Mở từ bây giờ**. Học sinh mở lại buổi ở
   bước 3: lựa chọn cũ của em ấy có hiệu lực trở lại, và trạng thái duyệt của
   đăng ký **không** đổi (AC-010-012, AC-010-013).

---

## 4. Cổng kiểm tra khi phát hành

Những thứ harness không kết luận được. Cần chạy ở môi trường thật trước khi coi
là xong:

1. **Đồng thời thật.** Hai kết nối: một bên bắt đầu ghi đăng ký với thiết bị và
   giữ transaction mở, bên kia gọi `device_use_policy('lock',…)`. Bên thứ hai
   phải **đợi**, và sau khi cả hai commit thì đăng ký đó phải có
   `effective_uses_electronic_device = false`.
2. **Chi phí trên dữ liệu thật.** Đo thời gian một lần ghi đăng ký trước và sau
   migration 13, trên một lớp có số đăng ký thật. Mong đợi: chênh lệch không đo
   được, vì đường nhanh chỉ là một lần probe index.
3. **Chi phí của Lock.** Đo `device_use_policy('lock',…)` trên một slot của một
   lớp đã có nhiều tuần dữ liệu — hàm tính lại quét cả slot.
4. **Múi giờ.** Xác nhận `study_session_start` trên production trả đúng giờ địa
   phương cho một buổi có thời khoá biểu riêng, không chỉ cho buổi dùng giờ mặc
   định của năm học.
5. **Đóng băng năm học, hai kết nối** (Sol RC5 §7). Khác với cổng 1: ở đây bên
   kia không phải một lần ghi đăng ký mà là chính FEAT-007.

   ```
   Kết nối A                          Kết nối B
   begin;                             begin;
   select device_use_policy('lock',…)
                                      update public.school_years
                                        set archive_state='archiving'
                                       where id=<năm của lớp>;
                                      -- PHẢI ĐỢI ở đây
   commit;
                                      -- mới chạy tiếp
   commit;
   ```

   Và chiều ngược lại: B đặt `archiving` và commit trước, A gọi `lock` sau — A
   phải bị từ chối với `DEVICE_POLICY_YEAR_NOT_ACTIVE`. Cái phải **không** bao
   giờ xảy ra là cả hai cùng đi qua: một khoảng khoá mới nằm trong một năm vừa
   đóng băng.

   Đo bằng hai `psql` song song. Trong lúc A giữ transaction, câu này ở kết nối
   thứ ba phải thấy B đang đợi:

   ```sql
   select pid, wait_event_type, wait_event, left(query,60)
     from pg_stat_activity where wait_event_type='Lock';
   ```

   Harness không kết luận được cổng này: pglite chạy một kết nối. Nó chứng minh
   khoá dòng **có** được lấy (`RowShareLock` trên `school_years` trong
   `pg_locks`) và mode được viết đúng là `for share` — phần còn lại là ở đây.

---

## 5. Rollback

Chạy khối này trong SQL editor. **Rollback frontend trước**, vì frontend mới cần
cột mà bước cuối giữ lại nhưng cũng cần RPC mà bước đầu xoá.

```sql
begin;

drop trigger if exists trg_06_apply_device_use_policy on public.registrations;
drop function if exists public.apply_device_use_policy();
drop function if exists public.device_use_policy(text,jsonb);
drop function if exists public.device_use_recompute(uuid,integer,integer);
drop function if exists public.device_use_effective(boolean,uuid,uuid,integer,integer);
drop function if exists public.device_use_policy_state(uuid,uuid,integer,integer);
drop function if exists public.device_use_locking_interval(uuid,uuid,integer,integer,timestamptz);
drop function if exists public.device_use_live_override(uuid,uuid,integer,integer,timestamptz);
drop function if exists public.device_use_week_slots(uuid,uuid);
drop function if exists public.device_use_guard_year_freeze() cascade;
drop function if exists public.device_use_guard_override_week() cascade;
drop function if exists public.device_use_assert_year_writable(uuid);
-- Chỉ tồn tại nếu môi trường này từng chạy RC5; migration RC6 cũng tự dọn nó.
drop function if exists public.device_use_year_is_active(uuid);
drop function if exists public.device_use_bump_signal(uuid);
drop function if exists public.device_use_slot_key(uuid,integer,integer);
drop table if exists public.device_use_policy_signals;
drop table if exists public.device_use_session_overrides;
drop table if exists public.device_use_lock_intervals;

-- Cột được **giữ lại**, cố ý. Nó vô hại (không trigger nào còn ghi nó) và nếu
-- frontend mới chưa kịp rollback thì bỏ cột đi sẽ làm hỏng trang đăng ký. Khi
-- muốn dọn hẳn:
--   alter table public.registrations drop column effective_uses_electronic_device;

commit;
```

Sau rollback, lịch sử khoá/mở biến mất cùng hai bảng. Dữ liệu đăng ký —
`uses_electronic_device` và mọi thứ khác — không mất gì, ở cả hai chiều, vì
FEAT-010 chưa từng ghi vào cột đó.

---

## RC9 upgrade from RC8

Nếu môi trường đã cài RC8/migration 13, chạy tiếp:

```text
database/upgrade/14-FEAT-010-RC9-CASCADE-FREEZE-FIX.sql
```

Fresh install của RC9 chạy theo thứ tự **13 → 14**. Migration 14 chỉ thay freeze trigger function/trigger binding; không thay bảng, FK, RPC hoặc frontend contract.

Trước production bắt buộc full RC9 verification PASS, gồm parent `DELETE classes` thật, frozen direct child DELETE, hai chiều OLD/NEW ownership UPDATE, M51/M52 và toàn bộ FEAT-004 + FEAT-010 + legacy regressions. Các release gate hai kết nối thật/realtime và prerequisite FEAT-007 RC6 giữ nguyên.

Rollback riêng RC9: khôi phục trigger về `public.device_use_guard_year_freeze()` của migration 13 và drop `public.device_use_year_freeze_guard_rc9()`; không rollback bảng/dữ liệu FEAT-010.

