# FEAT-010 RC7 → RC8 — fix report

**Sol RC7 result:** `REQUEST_CHANGES` — một phát hiện:

- **R-008 (HIGH)** — JSON `state` của người quản lý tra `override_id` theo
  lớp + tuần + ô, trong khi bộ đánh giá tra theo **khoảng khoá đang chi phối
  buổi đó**. Sau vòng đời `Lock A → ALLOW → Unlock A → Lock B → ALLOW` — vốn hợp
  lệ và do chính RC2 cho phép — có hai dòng ngoại lệ chưa hủy cho cùng một buổi,
  subquery vô hướng trả về hai dòng, và cả RPC `state` gãy. Trang Thiết bị điện
  tử của giáo viên và của quản trị ngừng tải.

Sol xác nhận R-006 và R-007 đã **RESOLVED**, phần đóng băng năm học của RC5/RC6
vẫn **PASS**, DEC-115 **RATIFIED**, và gói RC7 sạch (648 mục, 647/647 khớp).

Phát hiện đúng. Đã sửa. Không business rule nào đổi, không bảng nào đổi.

---

## R-008 — một câu hỏi, hai chỗ trả lời

### Lỗi này là hệ quả trực tiếp của một quyết định đúng

RC1 P1 thu hẹp unique index của ngoại lệ đang sống theo `interval_id`:

```
unique (interval_id, week_id, weekday, period_number) where revoked_at is null
```

Điều đó đúng và cần thiết — một ALLOW thuộc về một chu kỳ khoá, không được sống
lại dưới chu kỳ sau. Nhưng nó có một hệ quả mà RC1…RC7 không bao giờ viết ra:
**một buổi học có thể có nhiều dòng ngoại lệ chưa hủy**, mỗi chu kỳ một dòng, vì
`unlock` không hồi tố hủy ngoại lệ của chu kỳ nó đóng lại (DEC-104, §9.2).

`device_use_policy_state()` xử lý đúng chuyện đó: nó giải khoảng khoá chi phối
buổi rồi mới hỏi ngoại lệ. JSON của người quản lý thì tự viết lấy một phép tra
khác:

```sql
'override_id',(select o.id from public.device_use_session_overrides o
                where o.class_id=v_class and o.week_id=v_week
                  and o.weekday=s.weekday and o.period_number=s.period_number
                  and o.revoked_at is null)
```

Hai câu hỏi khác nhau cho cùng một thứ. Và câu thứ hai không chỉ trả lời sai — nó
**gãy**:

```
ERROR: more than one row returned by a subquery used as an expression
```

### Vì sao test cũ không thấy

Có một test cho đúng vòng đời này, thêm ở RC2 sau khi mutation M20 thoát:

```
RC1-P1 override của chu kỳ khoá cũ không sống lại ở chu kỳ khoá mới
```

Nó dựng `Lock A → ALLOW → Unlock A → Lock B` và khẳng định ngoại lệ cũ không
sống lại. Đúng, hữu ích — và dừng lại **một bước trước** chỗ hỏng: nó không tạo
ALLOW thứ hai dưới B, nên chưa bao giờ có hai dòng cùng lúc. Nó cũng chỉ đọc
`device_use_policy_state()`, không đọc JSON của người quản lý.

Đây là lần thứ **mười** trên feature này một test dừng ở hình dạng mà mã đang có
thay vì đi hết tính chất phải giữ. Lần này khác các lần trước ở một điểm đáng
ghi: test cũ không sai và không hẹp hơn quy tắc nó mang tên — nó chỉ không đi
tiếp một bước nữa vào chính kịch bản mà bản vá của nó vừa hợp thức hoá.

### Bản vá: phép tra chuyển thành hàm, và cả hai nơi gọi nó

```sql
create or replace function public.device_use_live_override(
  p_interval_id uuid, p_week_id uuid, p_weekday integer, p_period_number integer,
  p_session_start timestamptz
) returns uuid
language sql stable security definer set search_path = public, pg_temp as $$
  select o.id from public.device_use_session_overrides o
   where o.interval_id = p_interval_id and o.week_id = p_week_id
     and o.weekday = p_weekday and o.period_number = p_period_number
     and o.mode = 'allow'
     and p_session_start > o.created_at
     and (o.revoked_at is null or p_session_start <= o.revoked_at)
$$;
```

`device_use_policy_state()` không còn tự viết vị từ nữa:

```sql
return case
  when public.device_use_live_override(v_interval,p_week_id,p_weekday,p_period_number,v_start) is not null
  then 'allow_override' else 'locked' end;
```

và JSON của người quản lý gọi đúng hàm đó, với khoảng khoá và giờ bắt đầu được
giải **một lần** ở hai `lateral` thay vì gọi lại resolver ở từng khoá JSON:

```sql
from public.device_use_week_slots(v_class,v_week) s
cross join lateral (select public.study_session_start(v_class,v_week,s.weekday,s.period_number) as ss) t
cross join lateral (select public.device_use_locking_interval(
                      v_class,v_week,s.weekday,s.period_number,t.ss) as iv) u
```

Hàm nhận khoảng khoá đã giải sẵn chứ không tự giải: nếu nó tự giải, đường nóng
(`device_use_effective` → `device_use_policy_state` trên mọi lần ghi đăng ký) sẽ
phải giải hai lần cho mỗi slot đã từng bị khoá.

**Không** sửa bằng `order by created_at desc limit 1`. Sol nói rõ vì sao, và lý
do đó đúng: nó giấu lỗi nhiều-dòng chứ không trả lời đúng câu hỏi, và vẫn có thể
trả về ngoại lệ của chu kỳ sai. Cách sửa phải làm cho chỉ có một dòng **có thể**
khớp, chứ không phải chọn bừa một dòng trong nhiều dòng khớp.

### Một điều bản vá này cố ý chọn: gãy to còn hơn đoán

Phép tra mới là vô hướng, nên nếu có ngày hai dòng cùng khớp *trên cùng một
khoảng khoá* thì nó raise thay vì chọn một. Bằng đường hợp lệ không tạo được
trạng thái đó — `allow → revoke → allow` trong một chu kỳ để lại dòng cũ có
`revoked_at` trước giờ học, nên vế `p_session_start <= o.revoked_at` loại nó ra —
và có test cho đúng kịch bản đó. Nếu một ngày nào đó có dữ liệu như vậy thật thì
nó là dữ liệu hỏng, và với dữ liệu hỏng thì dừng lại ồn ào đúng hơn là đoán, y
như EC-010-010 đã chọn cho giờ bắt đầu không giải được.

---

## Sáu test Sol RC7 §8 đòi

| # | Yêu cầu | Ở đâu |
|---:|---|---|
| 1 | `Lock A → ALLOW → Unlock A → Lock B`: state chạy, `locked`, `override_id = null` | `RC7-R-008 sau Lock A → ALLOW → Unlock A → Lock B…` |
| 2 | thêm `ALLOW` dưới B: state chạy, `allow_override`, `override_id` là của B | `RC7-R-008 và sau khi ALLOW lại dưới Lock B…` |
| 3 | cả hai dòng ngoại lệ vẫn còn trong lịch sử | cả hai test — test 1 kiểm `revoked_at is null` của dòng cũ, test 2 kiểm hai dòng, hai `interval_id` |
| 4 | Admin chỉ-đọc cho cùng kết quả | cả hai test lặp cho `ids.t` và `ids.a` |
| 5 | state của học sinh không đổi, không có `override_id` | `RC7-R-008 state của học sinh không đổi…` — khẳng định **đúng bốn khoá** |
| 6 | mutation bỏ lọc theo khoảng khoá bị bắt | M50 (2 test), và M21 (3 test) canh cùng vị từ đó ở bộ đánh giá |

Test 5 kiểm tập khoá chứ không chỉ kiểm `override_id` vắng mặt: một bản vá vô ý
đưa cả object của người quản lý cho học sinh sẽ mở lại đúng thứ Sol RC1 §8 đóng,
và "không có `override_id`" là điều kiện quá yếu để bắt việc đó.

Thêm một test ngoài danh sách, cho đường thứ hai dẫn tới hai dòng:
`mở riêng → hủy → mở riêng lại` **trong cùng một chu kỳ**. Unique index chỉ ràng
buộc dòng chưa hủy nên hai dòng đó hợp lệ; phép tra mới phải đơn trị ở đây nữa.

---

## Verification

`node scripts/verify-feat010.mjs` — **18/18 PASS, 404 tests, 0 FAIL** (RC7: 400).

| Suite | RC7 | RC8 |
|---|---:|---:|
| FEAT-010 policy SQL | 57 | **61** |
| FEAT-010 frontend | 22 | 22 |
| mọi thứ còn lại | 321 | 321 |
| **Tổng** | **400** | **404** |

Typecheck PASS, production build PASS.

### Mutation testing

**50/50 bị bắt.** Một cái mới, ba cái đổi `find` theo chỗ ở mới của vị từ:

| # | Mutation | Test fail |
|---|---|---:|
| M50 | JSON của người quản lý tự tra theo lớp+tuần+ô — chính là mã RC7 đã gửi | 2 |
| M7 | (đã chuyển) ngoại lệ đã hủy vẫn có hiệu lực | 2 |
| M8 | (đã chuyển) ngoại lệ hồi tố cả buổi đã bắt đầu trước khi nó được tạo | 1 |
| M21 | (đã chuyển) đánh giá ngoại lệ theo lớp+tuần+ô thay vì theo khoảng khoá | 3 |

M7, M8 và M21 phá đúng những quy tắc cũ; chỉ có chỗ đặt vị từ là đổi, nên `find`
của chúng đổi theo. Cả ba vẫn bị bắt, và số test fail của M21 tăng từ 1 lên 3 vì
giờ nó phá cả JSON của người quản lý — bằng chứng nhỏ rằng hai nơi đã thật sự
dùng chung một phép tra.

---

## Tệp đã đổi, RC7 → RC8

| Tệp | Thay đổi |
|---|---|
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | `device_use_live_override()`; `device_use_policy_state()` gọi nó; JSON của người quản lý gọi nó và giải giờ/khoảng khoá một lần bằng hai `lateral`; ACL |
| `tests/feat-010/database.test.mjs` | 4 test R-008; danh sách hàm ACL |
| `tests/feat-010/mutations.mjs` | M50; `find` của M7, M8, M21 |
| `docs/feat-010/DEPLOYMENT.md` | danh sách 13 hàm; tiền kiểm "JSON của người quản lý gọi hàm chuẩn"; rollback |
| `docs/feat-010/IMPLEMENTATION_REPORT.md` | mục 2, 4, số test, số mutation |
| `docs/feat-010/TEST_MATRIX.md` | bốn dòng mới |
| `docs/feat-010/FEAT-010_DECISIONS_UPDATE.md` | DEC-105 (hệ quả nhiều-chu-kỳ), DEC-115 RATIFIED |
| `START-HERE-FEAT-010.md`, `RELEASE.json` | RC8 |

Frontend **không đổi** ở vòng này — cũng như RC6 và RC7. `deviceSlotRows()` đã
đọc `override_id` như một giá trị có thể null, nên việc nó thôi trả về id của
chu kỳ sai không đòi hỏi gì ở phía client.

---

## Không đổi

DEC-114 và DEC-115 RATIFIED, DEC-116 ACCEPTED IN CONCEPT. Cổng phát hành còn nợ:
hai kết nối thật cho Lock vs ghi đăng ký (cổng 1) và cho policy vs
`archive_begin` (cổng 5), realtime hai trình duyệt, thêm
`device_use_policy_signals` vào publication `supabase_realtime`, và **FEAT-007
RC6 phải áp lên production trước khi phát hành FEAT-010** — production vẫn đang
chạy FEAT-007 RC1.

---

## Gói RC8

| Hiện vật | Mục | SHA-256 |
|---|---:|---|
| `SO-TU-HOC-FEAT-010-RC8-FULL.zip` | 649 (648 dòng manifest) | đi kèm bản giao |
| `SO-TU-HOC-FEAT-010-RC8-FRONTEND.zip` | 166 | đi kèm bản giao |
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | – | ghi ở bản giao |

Hash của hai tệp ZIP không nằm trong tài liệu này (tài liệu này ở trong gói, nên
gói không tự chứa hash của mình; và bước đóng gói chép tệp nên dấu thời gian
trong ZIP đổi mỗi lần chạy).
