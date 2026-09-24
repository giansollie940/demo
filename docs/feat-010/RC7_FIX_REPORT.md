# FEAT-010 RC6 → RC7 — fix report

**Sol RC6 result:** `REQUEST_CHANGES` — hai phát hiện, cả hai HIGH:

- **R-006** — một override có **hai** đường sở hữu (`interval_id`, và
  `class_id + weekday + period_number`) mà không gì buộc chúng trùng nhau. Chốt
  chặn năm học đọc đường thứ hai; `device_use_policy_state()` đi theo đường thứ
  nhất. Một câu ghi có đặc quyền có thể chìa cho chốt chặn một lớp còn mở trong
  khi trỏ phần đánh giá policy vào khoảng khoá của một lớp đã đóng băng.
- **R-007** — `service_role` vẫn giữ DML thẳng trên hai bảng policy. Một câu
  INSERT thẳng chạy đúng chốt chặn năm học rồi thôi: không
  `device_use_recompute()`, không tín hiệu realtime, không dòng audit. Đó là một
  API ghi thứ hai với bất biến yếu hơn, không phải một tính năng.

Sol xác nhận R-004 **PARTIALLY RESOLVED** (phần đơn giản đã đóng), R-005
**RESOLVED IN DESIGN** (còn cổng kiểm tra hai kết nối thật), và gói RC6 sạch
(647 mục, 646/646 khớp).

Cả hai phát hiện đúng. Cả hai đã sửa. Không business rule nào đổi.

---

## R-006 — hai chủ sở hữu là một chủ sở hữu quá nhiều

### Vì sao RC6 không thấy

Chốt chặn của RC6 đúng với câu hỏi nó đặt ra: *"lớp của dòng này có thuộc một năm
còn ghi được không?"*. Nó không hỏi câu đứng trước: *"lớp của dòng này là lớp
nào?"* — và với `device_use_session_overrides` thì câu đó có hai câu trả lời.

```
device_use_session_overrides
  interval_id  → device_use_lock_intervals(id)     ← device_use_policy_state() tin cái này
  class_id     → classes(id)                       ← chốt chặn năm học tin cái này
  weekday, period_number                           ← không ai đối chiếu với khoảng khoá
```

RC6 đã tự mô tả cách chữa R-004 là "làm cho việc đi vòng không biểu diễn được",
nhưng chỉ làm vậy với *đường ghi*. Dữ liệu vẫn biểu diễn được một trạng thái vô
nghĩa, và một chốt chặn đọc trạng thái vô nghĩa thì đọc gì cũng không đúng.

Cũng cần nói thẳng: RC1 P1 đã thêm `interval_id NOT NULL` chính là để override
không sống sót sang chu kỳ khoá sau, và báo cáo lúc đó viết rằng điều này khiến
sai lệch "không biểu diễn được". Nó đúng với **một** chiều (không có khoá thì
không có override) và được trình bày như đúng với mọi chiều. Cùng một kiểu suy
rộng đã tạo ra R-003.

### Bản vá — Option A của Sol

Không dạy chốt chặn đi theo cả hai đường. Nếu làm vậy, hai đường vẫn được phép
lệch nhau và mỗi đoạn mã mới lại phải nhớ kiểm cả hai. Thay vào đó, bỏ hẳn khả
năng lệch:

```sql
alter table public.device_use_lock_intervals
  add constraint device_use_lock_intervals_owner_key
  unique (id, class_id, weekday, period_number);

alter table public.device_use_session_overrides
  add constraint device_use_session_overrides_interval_owner_fkey
  foreign key (interval_id, class_id, weekday, period_number)
  references public.device_use_lock_intervals(id, class_id, weekday, period_number)
  on delete cascade;
```

`id` đã là khoá chính nên khoá unique kia không ràng buộc thêm gì — nó tồn tại
chỉ để được tham chiếu. FK một cột `interval_id` sinh ra từ `create table` bị bỏ;
FK hợp thành thay thế hoàn toàn nó.

Sau khi có nó, `override.class_id` **là** `interval.class_id` theo định nghĩa.
Chốt chặn năm học đọc `class_id` là đủ, và `device_use_policy_state()` đi theo
`interval_id` cũng là đủ — hai đoạn mã đọc hai cột khác nhau nhưng không còn hai
câu trả lời khác nhau để đọc. Không thêm vị từ `o.class_id = p_class_id` vào
`device_use_policy_state()`: nó sẽ là một câu luôn đúng, và một câu luôn đúng
không mutation nào bắt được.

### Nửa còn lại: tuần

FK không diễn đạt được "lớp và tuần phải cùng một năm học", nên đó là một
trigger. Quy tắc thì không viết lại — `validate_registration_class_week()` đã
cưỡng chế đúng nó cho `registrations` từ V8.8.0:

```sql
exists(select 1 from public.classes c
         join public.weeks w on w.id = new.week_id
        where c.id = new.class_id and c.school_year_id = w.school_year_id)
```

Sol cho chọn `class_weeks` hoặc "canonical existing class/week validator". Chọn
cái thứ hai, vì `class_weeks` là *lịch tuần của lớp* chứ không phải *định nghĩa
tuần nào thuộc lớp nào*, và trên production nó không chắc có đủ dòng cho mọi cặp.

Hai nơi cùng biết một quy tắc là một món nợ, nên nó được ghi thành test: cùng một
cặp (lớp, tuần) lệch năm, đường override và đường `registrations` phải cùng từ
chối. Ngày hai đường bất đồng, test đỏ.

---

## R-007 — một câu INSERT không phải một lần đổi chính sách

RC6 giữ `grant all … to service_role` và có hẳn một test khẳng định đường đó
vẫn chạy trong năm học còn mở. Sol chỉ ra điều mà test đó không hỏi: một câu
INSERT thẳng **thành công** nhưng để lại hệ thống sai —

```
device_use_recompute()      không chạy → registrations giữ nguyên giá trị cũ
device_use_bump_signal()    không chạy → học sinh không nhận tín hiệu
audit_logs                  không có dòng nào
```

Có hai cách chữa. Thêm AFTER trigger để câu ghi thẳng cũng recompute, bump và
audit — tức là xây lại RPC ở tầng bảng, hai bản của cùng một nghiệp vụ. Hoặc bỏ
cái quyền cho phép câu ghi đó. Sol thích cách thứ hai, và cách thứ hai đúng: từ
đầu feature này đã nói đường ghi hợp lệ là RPC, `security definer`, không cần
quyền bảng nào cả.

```sql
revoke all on public.device_use_lock_intervals, public.device_use_session_overrides,
  public.device_use_policy_signals from service_role;
grant select on public.device_use_lock_intervals, public.device_use_session_overrides,
  public.device_use_policy_signals to service_role;
```

Đọc thì vẫn mở: một thành phần phía máy chủ có thể cần nhìn.

Không có thành phần production nào hiện ghi thẳng ba bảng này — chúng ra đời ở
FEAT-010 và đường ghi duy nhất từng được thiết kế là RPC. `grant all` ban đầu là
thói quen, không phải yêu cầu.

### Hệ quả trong bộ test, và nó làm rõ một điều

Mười một chỗ trong suite dựng dữ liệu policy bằng `asService()` — khoảng khoá
lịch sử, override tạo muộn, các ca biên mà RPC cố ý không tạo ra được. Chúng
chuyển sang một helper mới, `asOwner()`: vai **chủ sở hữu database**, thứ mà một
người có được trong SQL editor của Supabase và không quyền ứng dụng nào chi phối.

Điều đó làm các test R-004 mạnh hơn chứ không yếu đi. Trước, chúng chứng minh
"`service_role` bị chặn". Giờ chúng chứng minh "**ngay cả chủ sở hữu database
cũng bị chặn**" — tức là chốt chặn năm học là một lệnh đóng băng, không phải một
quyền. Đó đúng là điều RB-711 đòi.

---

## Tái hiện trước, sửa sau

Bốn test viết trước khi migration bị chạm. Trên mã RC6:

```
not ok 1 - RC6-R-006 override không thể trỏ tới khoảng khoá của một lớp khác
not ok 2 - RC6-R-006 override phải cùng buổi với khoảng khoá nó là ngoại lệ
not ok 3 - RC6-R-006 override phải thuộc một tuần của chính năm học đó
not ok 4 - RC6-R-007 service_role không còn ghi thẳng vào bảng policy, kể cả năm học còn active
# pass 0  # fail 4
```

Test 1 dựng đúng kịch bản Sol mô tả: khoảng khoá của lớp đã đóng băng, `class_id`
của lớp còn mở — và cả chiều ngược lại, đổi **riêng** `interval_id` của một
override hợp lệ sang khoảng khoá của lớp khác, nơi cả `old.class_id` lẫn
`new.class_id` đều là lớp đang mở nên chốt chặn của RC6 không có gì để phản đối.

---

## Một mutation "bị bắt" mà không chứng minh gì

`M46` hẹp FK từ bốn cột xuống hai (`id, class_id`) để kiểm rằng phần thứ/tiết của
quyền sở hữu có tác dụng. Lần chạy đầu nó báo **54 test đỏ** và runner đọc đó là
một cú bắt dứt khoát.

Nó không phải. FK hai cột cần một khoá unique hai cột, mà migration chỉ có khoá
bốn cột — nên migration **không cài được**, và 54 test đỏ chỉ có nghĩa là không
test nào chạy. Một mutation phải để lại một hệ thống **chạy được** và sai đúng
một chỗ.

Đã sửa hai thứ:

- `M46` giờ đổi cả khoá unique lẫn FK, nên schema hợp lệ và chỉ test "override
  lệch buổi" đỏ — đúng một test;
- **runner** biết thêm một verdict: nếu số test fail bằng đúng tổng số test thì
  gần như chắc chắn mutation đã làm hỏng migration, và nó được tính là **thoát**
  chứ không phải bắt được. Cùng nguyên tắc với verdict "mutation không áp dụng
  được" thêm ở RC3: một verdict không phân biệt được "chốt chặn có tác dụng" với
  "không có gì chạy cả" thì không phải một verdict.

Đây là lần thứ **năm** bộ máy mutation của feature này tự nói dối, và lần thứ ba
nó được sửa ở chính bộ máy chứ không ở một mutation.

---

## Mười test Sol RC6 §8 đòi

| # | Yêu cầu | Ở đâu |
|---:|---|---|
| 1 | interval của lớp đã đóng băng + `class_id` lớp còn mở → từ chối | `RC6-R-006 override không thể trỏ tới khoảng khoá của một lớp khác` |
| 2 | đổi riêng `interval_id` sang interval của lớp khác → từ chối | như trên, nửa sau |
| 3 | `class_id` của override phải khớp interval | FK hợp thành; test 1 |
| 4 | thứ/tiết của override phải khớp interval | `RC6-R-006 override phải cùng buổi…` — ba tổ hợp lệch |
| 5 | `(class_id, week_id)` không hợp lệ → từ chối | `RC6-R-006 override phải thuộc một tuần của chính năm học đó` |
| 6 | ALLOW qua RPC vẫn chạy | test 1 (nửa sau dùng chính RPC để tạo override), và toàn bộ §17.7–9 |
| 7 | Lock/Unlock/ALLOW/revoke không hồi quy | 57 test SQL, 0 fail |
| 8 | mutation khôi phục quyền sở hữu lẫn lộn bị bắt | M45 (2 test), M46 (1), M47 (1), M48 (1) |
| 9 | nếu thu hồi DML của `service_role` → xác nhận bị từ chối cả trong năm còn mở | `RC6-R-007 …` — tám câu DML trên ba bảng, tất cả 42501 |
| 10 | nếu giữ lại DML → chứng minh nó recompute + signal + audit | không áp dụng: đã thu hồi (mục R-007 ở trên) |

---

## Verification

`node scripts/verify-feat010.mjs` — **18/18 PASS, 400 tests, 0 FAIL** (RC6: 396).

| Suite | RC6 | RC7 |
|---|---:|---:|
| FEAT-010 policy SQL | 53 | **57** |
| FEAT-010 frontend | 22 | 22 |
| mọi thứ còn lại | 321 | 321 |
| **Tổng** | **396** | **400** |

Typecheck PASS, production build PASS.

### Mutation testing

**49/49 bị bắt.** Năm cái mới:

| # | Mutation | Test fail |
|---|---|---:|
| M45 | FK một cột thay vì FK hợp thành — quyền sở hữu lẫn lộn trở lại | 2 |
| M46 | FK hợp thành bỏ thứ và tiết (kèm khoá unique tương ứng) | 1 |
| M47 | bỏ trigger kiểm tuần | 1 |
| M48 | kiểm tuần chỉ cần tuần tồn tại, không cần cùng năm học | 1 |
| M49 | trả lại `grant all` cho `service_role` | 1 |

---

## Tệp đã đổi, RC6 → RC7

| Tệp | Thay đổi |
|---|---|
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | khoá unique + FK hợp thành cho quyền sở hữu override; `device_use_guard_override_week()` + `trg_01_…`; `service_role` mất DML trên ba bảng, còn `select`; ACL thêm hàm mới |
| `tests/feat-010/fixture.mjs` | `asOwner()` — vai chủ sở hữu database, tách khỏi `asService()` |
| `tests/feat-010/database.test.mjs` | 4 test R-006/R-007; 11 chỗ dựng dữ liệu policy chuyển sang `asOwner()`; test R-004 giờ chứng minh chốt chặn chặn cả chủ sở hữu; danh sách hàm ACL |
| `tests/feat-010/mutations.mjs` | M45–M49 |
| `scripts/mutate-feat010.mjs` | verdict mới cho mutation làm fail toàn bộ suite |
| `docs/feat-010/DEPLOYMENT.md` | danh sách 12 hàm; tiền kiểm FK hợp thành, trigger tuần, ACL `service_role`; rollback |
| `docs/feat-010/IMPLEMENTATION_REPORT.md` | mục 2, 7, số test, số mutation |
| `docs/feat-010/TEST_MATRIX.md` | bốn dòng mới và ghi chú về verdict mới của runner |
| `docs/feat-010/FEAT-010_DECISIONS_UPDATE.md` | DEC-115 |
| `START-HERE-FEAT-010.md`, `RELEASE.json` | RC7 |

Frontend **không đổi** ở vòng này, cũng như ở RC6.

---

## Không đổi

DEC-114 RATIFIED, DEC-116 ACCEPTED IN CONCEPT. Cổng phát hành còn nợ: hai kết nối
thật cho Lock vs ghi đăng ký (cổng 1) và cho policy vs `archive_begin` (cổng 5),
realtime hai trình duyệt, thêm `device_use_policy_signals` vào publication
`supabase_realtime`, và **FEAT-007 RC6 phải áp lên production trước khi phát hành
FEAT-010** — production vẫn đang chạy FEAT-007 RC1.

---

## Gói RC7

| Hiện vật | Mục | SHA-256 |
|---|---:|---|
| `SO-TU-HOC-FEAT-010-RC7-FULL.zip` | 648 (647 dòng manifest) | đi kèm bản giao |
| `SO-TU-HOC-FEAT-010-RC7-FRONTEND.zip` | 166 | đi kèm bản giao |
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | – | ghi ở bản giao |

Hash của hai tệp ZIP không nằm trong tài liệu này (tài liệu này ở trong gói, nên
gói không tự chứa hash của mình; và bước đóng gói chép tệp nên dấu thời gian
trong ZIP đổi mỗi lần chạy).
