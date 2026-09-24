# FEAT-010 RC5 → RC6 — fix report

**Sol RC5 result:** `REQUEST_CHANGES` — hai phát hiện, cả hai HIGH, cả hai về
cùng một thứ: chốt chặn năm học của RC5 là một lời từ chối lịch sự ở cửa trước,
không phải một lệnh cấm ở mức dữ liệu.

- **R-004** — `service_role` có BYPASSRLS và `grant all` trên hai bảng policy,
  nên một câu INSERT/UPDATE/DELETE thẳng vào bảng không đi qua wrapper và không
  bao giờ gặp chốt chặn.
- **R-005** — wrapper đọc `archive_state` mà không khoá dòng `school_years`, nên
  `update school_years set archive_state='archiving'` của FEAT-007 commit được
  vào giữa lần kiểm tra và lần ghi.

Sol xác nhận R-003 **RESOLVED cho đường RPC thường**, mục runbook ở RC4 §9
**RESOLVED**, và gói RC5 sạch (760 mục, 759/759 khớp).

Cả hai phát hiện đúng. Cả hai đã sửa. Không business rule nào đổi, không bảng
nào đổi.

---

## Cái nhìn chung: RC5 sửa đúng chỗ, nhưng đặt chốt chặn sai tầng

RC5 lập luận rằng chốt chặn phải ở "biên database, không phải ở UI". Đúng, và
vẫn chưa đủ sâu. FEAT-010 đã biết điều này từ ngày đầu và viết nó ra ở mục 1 của
Implementation Report:

> Hệ thống đăng ký **không có RPC dispatcher** … Vì vậy biên duy nhất mà mọi
> đường ghi đều phải đi qua là **trigger trên bảng**.

Đó chính xác là lý do policy thiết bị được cưỡng chế bằng trigger trên
`registrations` chứ không bằng RPC. Rồi RC5 đặt chốt chặn năm học vào RPC, cho
hai bảng mà `service_role` có toàn quyền — cùng một bài học, quên ở bảng khác.
Sol không phải chỉ ra một trường hợp biên; Sol chỉ ra rằng bản vá không theo
chính nguyên tắc mà feature này đã viết ra cho mình.

---

## R-004 — chốt chặn phải nằm dưới wrapper

### Bề mặt thật

```sql
grant all on public.device_use_lock_intervals,
             public.device_use_session_overrides to service_role;
```

và trong `tests/feat-010/baseline.sql`, đọc từ production:

```sql
create role service_role bypassrls;
```

RLS không phải lá chắn cho một vai có BYPASSRLS. Bằng chứng rõ nhất nằm trong
chính bộ test: `asService()` chèn thẳng khoảng khoá vào bảng ở cả chục kịch bản
biên. Đường đó vẫn mở nguyên sau khi năm học đóng băng, và các test R-003 của
RC5 chỉ gọi RPC nên không thấy.

### Bản vá

Một trigger BEFORE INSERT OR UPDATE OR DELETE trên cả hai bảng, gọi cùng một hàm
mà wrapper gọi:

```sql
create trigger trg_00_device_use_year_freeze
  before insert or update or delete on public.device_use_lock_intervals
  for each row execute function public.device_use_guard_year_freeze();
```

Trigger kiểm **cả hai** phía khi UPDATE đổi `class_id`: chỉ kiểm `new` thì một
dòng bị mang *ra khỏi* năm đã đóng băng, chỉ kiểm `old` thì bị mang *vào*.

Tắt trigger cần quyền sở hữu bảng, mà `service_role` không có — có test khẳng
định `alter table … disable trigger` thất bại với `42501`.

### Wrapper vẫn giữ chốt chặn của nó, và đây là lý do

Có trigger rồi thì câu `if` trong wrapper trông như thừa. Không thừa:

```
lock   một slot đang khoá  → EC-010-001, trả về sớm, không chạm bảng nào
unlock một slot đang mở    → EC-010-002, trả về sớm, không chạm bảng nào
```

Hai nhánh đó không bao giờ chạy trigger. Nếu chỉ có trigger, chúng sẽ **thành
công** trong một năm đã đóng băng, và "thao tác bị từ chối" biến thành "im lặng
báo không có gì đổi" — một giáo viên bấm Khóa trên một năm đã lưu trữ sẽ thấy
thông báo bình thường. Hai test mới canh đúng hai nhánh đó, và mutation M37 (gỡ
câu `if` khỏi wrapper) fail đúng chúng.

### `device_use_policy_signals` cố ý không có chốt chặn

Bảng tín hiệu ba cột, không mang dữ liệu nghiệp vụ, không ai đọc làm nguồn sự
thật; đường ghi duy nhất của nó nằm trong wrapper vốn đã bị chặn. Đổi lại, nó là
đích của `on delete cascade` từ `classes`, nên một chốt chặn ở đó sẽ biến "xoá
một lớp" thành lỗi khó đọc trong đúng những năm mà `archive_guard_class()` của
FEAT-007 đằng nào cũng đã cấm xoá lớp. Ghi ra đây để lần sau nó là một lựa chọn
có lý do chứ không phải một chỗ quên.

---

## R-005 — kiểm tra đúng nhưng không nguyên tử

### Mode khoá là toàn bộ nội dung của bản vá này

Sol gợi ý `FOR SHARE / FOR KEY SHARE`. Hai cái đó **không** tương đương ở đây, và
chọn nhầm thì bản vá trông đúng mà không chặn gì:

| Khoá dòng | Xung đột với |
|---|---|
| `FOR KEY SHARE` | `FOR UPDATE` |
| `FOR SHARE` | `FOR UPDATE`, **`FOR NO KEY UPDATE`** |

`update school_years set archive_state=…` không đụng khoá chính, nên nó lấy
`FOR NO KEY UPDATE`. `FOR KEY SHARE` không chặn được nó. `FOR SHARE` chặn.

```sql
select y.archive_state into v_state
  from public.school_years y join public.classes c on c.school_year_id = y.id
 where c.id = p_class_id
 for share of y;
```

`of y` để chỉ khoá dòng năm học, không khoá thêm dòng `classes`.

Sau khi khoá được cấp, câu select trả về phiên bản mới nhất của dòng, nên thứ tự
nào cũng ra kết quả đúng:

```
policy khoá trước   → archive_begin đợi → policy commit → năm mới đóng băng
archive_begin trước → policy đợi → đọc ra 'archiving' → policy bị từ chối
```

Cái không bao giờ xảy ra là cả hai cùng đi qua.

### Một hàm, không phải hai

RC5 có `device_use_year_is_active(uuid)` — một vị từ chỉ đọc. RC6 **thay** nó
bằng `device_use_assert_year_writable(uuid)` thay vì thêm hàm thứ hai: hai hàm
cùng trả lời một câu hỏi thì sớm muộn sẽ có một đường ghi gọi nhầm cái không
khoá dòng. Migration có `drop function if exists public.device_use_year_is_active(uuid);`
để dọn môi trường nào đã chạy RC5 (staging), và runbook rollback cũng vậy.

Truy vấn tiền kiểm trong `DEPLOYMENT.md` không gọi hàm nữa — nó đọc thẳng
`archive_state`, kiểm hai trigger có mặt và `tgenabled='O'`, và kiểm `prosrc`
chứa `for share of y` mà không chứa `for key share`.

---

## Tái hiện trước, sửa sau

Bốn test viết trước khi migration bị chạm. Trên mã RC5:

```
not ok 1 - RC5-R-004 service_role không ghi thẳng được vào bảng policy khi năm học đã đóng băng
not ok 2 - RC5-R-004 đổi chủ sở hữu bị kiểm ở cả lớp cũ lẫn lớp mới
ok   3 - RC5-R-004 năm học còn active thì đường service_role vẫn ghi được, và chốt chặn không tắt được
not ok 4 - RC5-R-005 thao tác policy phải khoá dòng năm học, không chỉ đọc nó
# pass 1  # fail 3
```

Test 3 xanh từ đầu: nó canh thứ **không** được hỏng.

---

## Hai mutation thoát ở lần chạy đầu — cả hai là test hỏng

Đây là phần đáng đọc nhất của vòng này.

### M42 — và một lỗ hổng trong chính cách viết test

`M42` đổi `for share of y` thành `for key share of y`, tức là đúng cái bug mà
R-005 nói tới. Nó **không bị bắt**, dù có một assertion viết riêng cho nó:

```js
const source = await readFile(new URL('…/13-FEAT-010-DEVICE-USE-LOCK.sql', import.meta.url), 'utf8');
assert.doesNotMatch(source, /for key share/);
```

Lý do: `createFixture()` áp mutation lên **văn bản trong bộ nhớ** rồi cài bản đó.
Tệp trên đĩa không bao giờ đổi. Mọi assertion đọc mã nguồn bằng `readFile` vì
thế **vô hình** với bộ mutation — nó luôn đọc bản gốc và luôn xanh.

Và điều đó không chỉ đúng với M42: hai assertion về khoá tư vấn trong test 19/20
đã viết theo đúng kiểu đó **từ RC1**, nên suốt năm vòng chúng chưa từng được
chứng minh là có tác dụng.

Sửa ở gốc: fixture export `migrationSql()`, trả về đúng văn bản nó sắp cài
(kể cả mutation), và mọi assertion đọc mã nguồn dùng hàm đó. Đây là lần thứ **tư**
bộ mutation của feature này tự nói dối — helper ở RC2, runner ở RC3 (hai lần), và
bây giờ là đường đọc mã nguồn.

### M44 — và một điểm mù do cascade

`M44` bỏ `delete` khỏi trigger trên `device_use_lock_intervals`, nên xoá thẳng
một khoảng khoá trong năm đã đóng băng lẽ ra phải lọt. Nó **không bị bắt**, vì
test xoá đúng cái khoảng khoá đang có một override treo trên nó: DELETE cascade
sang bảng overrides, trigger của bảng **đó** vẫn còn `delete`, và nó raise đúng
thông điệp đang được chờ. Test xanh vì lý do sai — một lần nữa.

Sửa: `frozenYear()` dựng thêm một khoảng khoá không có override nào, và test
DELETE nhắm vào nó. Với dòng đó, M44 bị bắt.

Hai lần này cùng một họ với M8, M15, M20, M32 và test điều hướng R-001: **một
assertion được viết theo hình dạng mà mã/harness sẵn có, chứ không theo tính
chất phải đúng.** Khác biệt duy nhất là lần này cả hai đều do chính bộ mutation
chỉ ra, trong cùng một vòng.

---

## Tám test Sol RC5 §7 đòi

| # | Yêu cầu | Ở đâu |
|---:|---|---|
| 1 | service_role INSERT interval trong năm `archiving` → từ chối | `RC5-R-004 service_role không ghi thẳng…` (lặp cho cả hai trạng thái) |
| 2 | service_role UPDATE interval trong năm `archived_read_only` → từ chối | như trên |
| 3 | service_role INSERT override trong năm đã đóng băng → từ chối | như trên (và cả UPDATE, DELETE, trên cả hai bảng — sáu câu) |
| 4 | đổi chủ sở hữu kiểm cả OLD lẫn NEW | `RC5-R-004 đổi chủ sở hữu bị kiểm ở cả lớp cũ lẫn lớp mới` — hai chiều, hai năm học |
| 5 | năm còn `active` thì đường service_role vẫn chạy | `RC5-R-004 năm học còn active…`, cộng với hàng chục test cũ vẫn dùng `asService()` để dựng dữ liệu |
| 6 | mutation gỡ chốt chặn ở bảng bị bắt | M40 (2 test), M41 (1), M44 (1) |
| 7 | mutation gỡ bước khoá dòng bị bắt | M42 (1), M43 (1) |
| 8 | test RPC của RC5 vẫn xanh | cả bốn, cộng hai nhánh no-op mới |

Cổng kiểm tra Postgres thật mà §7 đòi đã được thêm vào `DEPLOYMENT.md` như **cổng
số 5**, tách khỏi cổng số 1 (Lock vs ghi đăng ký), kèm hai chiều interleaving và
câu `pg_stat_activity` để nhìn thấy bên kia đang đợi.

---

## Verification

`node scripts/verify-feat010.mjs` — **18/18 PASS, 396 tests, 0 FAIL** (RC5: 392).

| Suite | RC5 | RC6 |
|---|---:|---:|
| FEAT-010 policy SQL | 49 | **53** |
| FEAT-010 frontend | 22 | 22 |
| mọi thứ còn lại | 321 | 321 |
| **Tổng** | **392** | **396** |

Typecheck PASS, production build PASS.

### Mutation testing

**44/44 bị bắt.** Ba cái cũ được viết lại cho hình dạng mới, năm cái mới:

| # | Mutation | Test fail |
|---|---|---:|
| M37 | gỡ chốt chặn khỏi wrapper — nhánh no-op lọt qua | 2 |
| M38 | chỉ chặn `archived_read_only`, thả `archiving` | 2 |
| M39 | chốt chặn đặt trước cả nhánh đọc | 1 |
| M40 | bỏ trigger chốt chặn trên hai bảng policy | 2 |
| M41 | trigger chỉ kiểm `new` khi UPDATE đổi lớp | 1 |
| M42 | `for key share` thay `for share` | 1 |
| M43 | đọc `archive_state` mà không khoá dòng | 1 |
| M44 | trigger không bao gồm DELETE | 1 |

---

## Tệp đã đổi, RC5 → RC6

| Tệp | Thay đổi |
|---|---|
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | mục 5b mới: `device_use_assert_year_writable()` (khoá `for share`), `device_use_guard_year_freeze()` + hai trigger, `drop` hàm RC5; wrapper gọi hàm mới; ACL cập nhật |
| `tests/feat-010/fixture.mjs` | `migrationSql()` — assertion đọc mã nguồn giờ nhìn thấy mutation |
| `tests/feat-010/database.test.mjs` | 4 test R-004/R-005; hai nhánh no-op cho R-003; `frozenYear()` thêm một interval không có override; 19/20 và R-005 đọc qua `migrationSql()`; danh sách hàm ACL |
| `tests/feat-010/mutations.mjs` | M37–M39 viết lại, M40–M44 mới |
| `docs/feat-010/DEPLOYMENT.md` | danh sách 11 hàm; tiền kiểm trigger + mode khoá; cổng phát hành số 5; rollback |
| `docs/feat-010/IMPLEMENTATION_REPORT.md` | mục 2, 7, 8, số test, số mutation |
| `docs/feat-010/TEST_MATRIX.md` | bốn dòng mới và ghi chú ³ |
| `docs/feat-010/FEAT-010_DECISIONS_UPDATE.md` | DEC-115: write-freeze integration hoàn thành |
| `START-HERE-FEAT-010.md`, `RELEASE.json` | RC6 |

Frontend **không đổi** ở vòng này.

---

## Không đổi

DEC-114 RATIFIED, DEC-116 ACCEPTED IN CONCEPT. Cổng phát hành còn nợ: hai kết nối
thật cho Lock vs ghi đăng ký (cổng 1) **và** cho policy vs `archive_begin` (cổng
5, mới), realtime hai trình duyệt, thêm `device_use_policy_signals` vào
publication `supabase_realtime`, và **FEAT-007 RC6 phải áp lên production trước
khi phát hành FEAT-010** — production vẫn đang chạy FEAT-007 RC1.

Thông điệp lỗi cho `DEVICE_POLICY_YEAR_NOT_ACTIVE` ở frontend vẫn không có unit
test, đúng như Sol RC5 §8 ghi nhận; cưỡng chế nằm ở database.

---

## Gói RC6

| Hiện vật | Mục | SHA-256 |
|---|---:|---|
| `SO-TU-HOC-FEAT-010-RC6-FULL.zip` | 647 (646 dòng manifest) | đi kèm bản giao |
| `SO-TU-HOC-FEAT-010-RC6-FRONTEND.zip` | 166 | đi kèm bản giao |
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | – | `cec5bb0eb7b209564529e51af3e24277b004a788c947774b7a39bd9562430b5e` |

Hash của hai tệp ZIP không nằm trong tài liệu này (tài liệu này ở trong gói, nên
gói không tự chứa hash của mình; và bước đóng gói chép tệp nên dấu thời gian
trong ZIP đổi mỗi lần chạy). Thứ có hash ổn định là tệp SQL — đối chiếu nó trước
khi dán vào SQL editor.

**Số mục giảm so với RC5 (760).** `scripts/verify-feat010.mjs` chép log của lần
chạy trước vào `docs/feat-010/evidence/previous-<timestamp>/` mỗi lần chạy, và
qua sáu vòng đã tích lại bảy thư mục như vậy — RC5 mang theo 133 tệp log của
những lần chạy đã bị thay thế. Vòng này giữ lại đúng một bản (lần chạy ngay
trước lần cuối) và dọn phần còn lại; log của lần chạy mới nhất vẫn nằm thẳng
trong `evidence/`.

