# FEAT-010 RC4 → RC5 — fix report

**Sol RC4 result:** `REQUEST_CHANGES` — một phát hiện:

- **R-003 (HIGH)** — FEAT-010 ghi xuyên qua lệnh đóng băng năm học của FEAT-007.
  Một năm đã `archived_read_only` (hoặc đang `archiving`) vẫn nhận được Lock,
  Unlock, ALLOW và revoke, nên nó không còn chỉ-đọc trên thực tế.

Sol xác nhận RC3 R-001 và R-002 đã **RESOLVED**, thiết kế tín hiệu realtime vẫn
**PASS**, và gói RC4 sạch (721 mục, 720/720 khớp SHA-256). Phát hiện đúng. Đã
sửa. Thêm một mục không chặn ở §9 của review (truy vấn tiền kiểm trong runbook)
cũng đã sửa.

Không business rule nào đổi. Không bảng nào đổi. Migration 13 thêm một hàm bốn
dòng và một câu `if`.

---

## R-003 — "giữ lại" và "còn ghi được" là hai câu khác nhau

### Sol đúng ở chỗ nào

Kiểm tra lại trên chính tệp migration trước khi sửa gì:

```
$ grep -c "archive_state\|archiving\|archived_read_only" 13-FEAT-010-DEVICE-USE-LOCK.sql
0
```

Không có. Đường ghi của FEAT-010 hỏi đúng một câu:

```sql
if not public.teacher_has_class(v_class) then
  raise exception 'DEVICE_POLICY_FORBIDDEN' using errcode='42501';
end if;
```

`teacher_has_class()` trả lời một câu hỏi về **lớp** — lớp còn hoạt động không,
giáo viên có được phân công không. RB-711 của FEAT-007 đặt lệnh cấm ở cấp **năm
học**, và không ai hỏi câu đó. Nên với một lớp còn hoạt động thuộc một năm đã
đóng gói, giáo viên (hoặc một lệnh gọi RPC thẳng) vẫn tạo được khoảng khoá, ngoại
lệ, dòng audit, tín hiệu realtime, và qua `device_use_recompute()` là cả
`registrations.effective_uses_electronic_device`.

### Vì sao test cũ không thấy

Đây là điểm đáng đọc hơn cả bản vá.

FEAT-010 **có** một test tương thích FEAT-007, và nó chạy xanh suốt bốn vòng:

```
§19/DEC-111: purge của FEAT-007 không chạm bảng nào mà policy tham chiếu
```

Test đó đọc thẳng migration 12, rút ra tập bảng bị `delete from`, và fail nếu tập
đó chứa bảng nào FEAT-010 tham chiếu. Nó đúng, nó hữu ích, và nó trả lời **một**
câu hỏi: *purge có xoá mất dữ liệu của FEAT-010 không?*

§18 hỏi hai câu. Câu thứ hai là: *FEAT-010 có tôn trọng lệnh đóng băng ghi
không?* Không có test nào hỏi câu đó, nên câu trả lời chưa bao giờ phải đúng.

Cái sai không nằm ở test — nó nằm ở chỗ kết quả một chiều được báo cáo như kết
luận cho cả hợp đồng. Implementation Report mục 8 viết "FEAT-007 không đụng tới
dữ liệu này" và dừng ở đó; `START-HERE` chép lại y như vậy. Đó là **lần thứ sáu**
trên feature này một test được viết theo hình dạng sẵn có của code thay vì theo
tính chất phải đúng (M8, M15, M20, M32, test điều hướng R-001, và giờ là đây).
Năm lần trước là một test hẹp hơn quy tắc; lần này là một test đúng nhưng chỉ phủ
một nửa hợp đồng — và nửa kia được tính là đã phủ.

### Tái hiện trước, sửa sau

Bốn test được viết trước khi migration 13 bị chạm tới. Trên mã RC4:

```
not ok 1 - RC4-R-003 năm học archiving (đang đóng gói): cả bốn thao tác ghi bị từ chối
not ok 2 - RC4-R-003 năm học archived_read_only (đã lưu trữ, chỉ đọc): …
not ok 3 - RC4-R-003 năm học active thì giáo viên vẫn khoá được — chốt chặn không chặn nhầm
ok   4 - RC4-R-003 đọc vẫn mở sau khi năm học đã lưu trữ
# pass 1  # fail 3
```

Test thứ tư xanh ngay từ đầu, và phải như vậy: nó canh thứ **không** được đổi.

### Bản vá

Một hàm, đặt ngay trước RPC, là nơi duy nhất biết quy tắc:

```sql
create or replace function public.device_use_year_is_active(p_class_id uuid) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists(
    select 1 from public.classes c
      join public.school_years y on y.id = c.school_year_id
     where c.id = p_class_id and y.archive_state = 'active')
$$;
```

và một câu `if` ngay sau kiểm tra `teacher_has_class`, trong đúng nhánh ghi:

```sql
if not public.device_use_year_is_active(v_class) then
  raise exception 'DEVICE_POLICY_YEAR_NOT_ACTIVE' using errcode='42501',
    hint='Năm học đang được lưu trữ hoặc đã ở chế độ chỉ đọc, nên không đổi được chính sách thiết bị.';
end if;
```

Ba điều về chỗ đặt nó:

- **Trong nhánh ghi, không phải ở đầu hàm.** `state` và `history` nằm ở hai nhánh
  trên và không bị chạm. Đặt chốt chặn ở đầu hàm là bản vá rẻ hơn một dòng và nó
  sẽ lấy mất của học sinh câu giải thích vì sao ô chọn bị khoá, trong chính cái
  năm không còn ai sửa được gì. Mutation M39 làm đúng phép rẻ đó và bị bắt.
- **Trước `pg_advisory_xact_lock`, trước mọi câu ghi.** Nên một thao tác bị từ
  chối không lấy khoá, không đụng bảng, không sinh audit, không bump tín hiệu.
- **`exists(...)` chứ không phải so sánh giá trị đọc ra.** Lớp không tồn tại, hoặc
  năm học không tồn tại, cho ra `false` — từ chối. Một kiểm tra quyền không kết
  luận được thì không phải là một sự cho phép. (Đây đúng là cái bẫy NULL mà §17.17
  đã bắt được một lần ở RC1 trên nhánh đọc.)

### Cố ý không dùng lại hàm của FEAT-007

Migration 12 đã có `homework_private.archive_readonly(p_class uuid)`, trả lời
đúng câu này. Không gọi nó, và lý do nên nói ra vì nó là một đánh đổi thật:

- cả file migration 13, mục 8 của nó, và test `FEAT-010 và FEAT-001…008 không
  dùng chung một đối tượng nào` đều dựa trên việc hai nửa ứng dụng không chạm vào
  đối tượng của nhau. Gọi vào schema riêng của hệ thống Báo bài sẽ làm test đó đỏ,
  và làm điều nó khẳng định hết đúng;
- production đang chạy FEAT-007 **RC1**, nên một phụ thuộc vào tên hàm trong
  `homework_private` là một phụ thuộc vào phiên bản chưa được áp.

Cái giá: hai nơi cùng biết quy tắc "năm nào còn ghi được". Cái giữ nó không trôi
là cả hai đều đọc **cùng một cột** `school_years.archive_state`, không nơi nào
giữ bản sao trạng thái riêng. Nếu FEAT-007 đổi tập giá trị của cột đó, cả hai
cùng sai một lúc chứ không lệch nhau — và ràng buộc check trên cột sẽ chặn trước.

---

## Mười test Sol RC4 §8 đòi

| # | Yêu cầu | Ở đâu |
|---:|---|---|
| 1 | `active` → Teacher khoá được | `RC4-R-003 năm học active thì giáo viên vẫn khoá được…` |
| 2 | `archiving` → Lock bị từ chối | `RC4-R-003 năm học archiving…` (bảng `WRITES`, mục 1) |
| 3 | `archiving` → Unlock bị từ chối | như trên, mục 2 |
| 4 | `archiving` → ALLOW bị từ chối | như trên, mục 3 |
| 5 | `archiving` → revoke ALLOW bị từ chối | như trên, mục 4 |
| 6 | `archived_read_only` → cả bốn bị từ chối | `RC4-R-003 năm học archived_read_only…` (cùng bảng `WRITES`) |
| 7 | `state` vẫn đọc được khi đã lưu trữ | `RC4-R-003 đọc vẫn mở…` — cả bốn vai |
| 8 | `history` vẫn đọc được với Teacher/Admin | như trên; và học sinh vẫn bị từ chối |
| 9 | Thao tác bị từ chối không để lại dấu vết | `policyFootprint()` chụp interval + override + tín hiệu + audit + registrations trước/sau, so bằng `deepEqual`, cộng `assertNoDrift` |
| 10 | Gỡ chốt chặn → ít nhất một test fail | M37 (3 test), M38 (1), M39 (1) |

Mục 9 cố ý chụp **toàn bộ** dấu chân thay vì đếm năm thứ riêng lẻ Sol liệt kê: một
thao tác ghi thứ sáu được thêm vào sau này sẽ tự động nằm trong ảnh chụp.

Mục 2–6 dùng những thao tác sẽ **thành công** nếu không có chốt chặn: `unlock` một
slot đang khoá thật, `revoke_allow` một ngoại lệ đang có hiệu lực thật. Khoảng
khoá và ngoại lệ đó được dựng khi năm học còn `active`, rồi mới đóng băng — nếu
dựng sau, cả bốn thao tác sẽ bị từ chối ngay cả khi lý do là "không có gì để mở",
và test sẽ xanh mà không chứng minh gì.

Và mỗi lần từ chối đều được đối chiếu thông điệp:

```js
assert.match(error.message, /DEVICE_POLICY_YEAR_NOT_ACTIVE/, …)
```

SQLSTATE `42501` là mã chung của mọi lần từ chối trong RPC này, nên nếu chỉ kiểm
mã thì một `teacher_has_class` bị hỏng cũng làm test xanh — đúng kiểu test-đúng-
vì-lý-do-sai mà bốn vòng trước đã dạy.

---

## §9 — truy vấn tiền kiểm trong runbook

Sol đúng: `DEPLOYMENT.md` vẫn kiểm ACL bằng `p.proname like 'device\_use%'`, mà
đó chính là cái mẫu đã để `apply_device_use_policy` lọt ở RC3. Test tự động đã
chuyển sang danh sách tên từ RC4; runbook thì chưa, nên lệnh chạy trên production
kiểm một bất biến yếu hơn lệnh chạy trong harness.

Đã thay bằng đúng danh sách tên đó, và tách làm hai câu: câu (1) đếm số hàm tìm
thấy — phải là **10** — để một danh sách lạc hậu so với migration bị phát hiện
thay vì âm thầm kiểm một tập nhỏ hơn; câu (2) mới đọc ACL. Thêm một câu thứ ba
kiểm chốt chặn năm học có mặt và trả lời đúng trên dữ liệu thật.

Khối rollback cũng đã thêm `device_use_year_is_active`, và danh sách tệp frontend
trong runbook đã được cập nhật cho khớp RC4 (nó còn thiếu `DevicePolicyHistory.vue`,
`AdminDevicePolicy.vue`, `AdminPage.vue` và `useRealtimeInvalidation.ts`).

---

## Frontend

Một dòng, ở `friendlyDevicePolicyError()`: `DEVICE_POLICY_YEAR_NOT_ACTIVE` giờ có
câu tiếng Việt riêng thay vì rơi vào thông điệp chung "Không cập nhật được chính
sách thiết bị điện tử."

Nói rõ giới hạn: hàm đó không được export nên không có unit test nào chạm tới nó,
ở RC5 cũng như ở RC1. Cưỡng chế nằm ở database và được bốn test cùng ba mutation
canh; dòng này chỉ là câu chữ hiển thị.

**Không ẩn nút Lock/Unlock trên trang giáo viên khi năm học đã đóng băng.** Sol
RC4 §7 nói chốt chặn phải ở biên database "không chỉ bằng cách ẩn nút ở UI" — và
nó đang ở đó. Ẩn nút là một cải thiện UX riêng, cần một trường trạng thái năm học
trong payload của `state`, tức là đổi hợp đồng của RPC; RC5 được Sol yêu cầu giữ
hẹp, nên việc đó không thuộc vòng này. Hiện tại giáo viên bấm nút và nhận đúng
một câu giải thích.

---

## Verification

`node scripts/verify-feat010.mjs` — **18/18 PASS, 392 tests, 0 FAIL** (RC4: 388).

| Suite | RC4 | RC5 |
|---|---:|---:|
| FEAT-010 policy SQL | 45 | **49** |
| FEAT-010 frontend | 22 | 22 |
| mọi thứ còn lại | 321 | 321 |
| **Tổng** | **388** | **392** |

Typecheck PASS, production build PASS.

### Mutation testing

**39/39 bị bắt.** Ba cái mới:

| # | Mutation | Test fail |
|---|---|---:|
| M37 | bỏ hẳn chốt chặn năm học — chính là mã RC4 đã gửi | 3 |
| M38 | chỉ chặn `archived_read_only`, thả `archiving` — nửa bản sửa | 1 |
| M39 | đặt chốt chặn trước cả nhánh đọc — năm đã lưu trữ thành không xem được | 1 |

M38 là cái đáng để ý. Bản sửa "hiển nhiên" cho một review nói về năm *đã lưu trữ*
là chặn đúng `archived_read_only`; `archiving` là trạng thái tạm trong lúc gói
lưu trữ đang được dựng, và chính nó mới là lúc một dòng ghi xen vào giữa hai bước
purge sẽ nằm ngoài bản đã xác minh. M39 canh chiều ngược lại: một chốt chặn quá
rộng cũng là một lỗi, và nó sẽ qua được mọi test "phải từ chối".

---

## Tệp đã đổi, RC4 → RC5

| Tệp | Thay đổi |
|---|---|
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | `device_use_year_is_active()`; chốt chặn trong nhánh ghi; hàm mới vào danh sách revoke |
| `tests/feat-010/database.test.mjs` | 4 test R-003; `policyFootprint()`; danh sách hàm ACL thêm một tên |
| `tests/feat-010/mutations.mjs` | M37 → M39 |
| `public/supabase-service.js` | thông điệp cho `DEVICE_POLICY_YEAR_NOT_ACTIVE` |
| `docs/feat-010/DEPLOYMENT.md` | tiền kiểm ACL theo danh sách tên + đếm 10 hàm; kiểm chốt chặn; rollback; danh sách tệp frontend |
| `docs/feat-010/IMPLEMENTATION_REPORT.md` | mục 7, mục 8, số test, số mutation, bảng frontend |
| `docs/feat-010/TEST_MATRIX.md` | ba dòng R-003 và ghi chú "hợp đồng hai chiều" |
| `docs/feat-010/FEAT-010_DECISIONS_UPDATE.md` | DEC-115 → RATIFIED WITH REQUIRED WRITE-FREEZE INTEGRATION |
| `START-HERE-FEAT-010.md` | RC5 |

---

## Không đổi

DEC-114 RATIFIED, DEC-116 ACCEPTED IN CONCEPT. Các cổng kiểm tra khi phát hành ở
Sol RC4 §11 vẫn còn nguyên, gồm test hai kết nối thật, test realtime hai trình
duyệt, bước thêm `device_use_policy_signals` vào publication `supabase_realtime`
chọn lọc, và **FEAT-007 RC6 phải được áp lên production trước khi phát hành
FEAT-010** — production hiện vẫn chạy FEAT-007 RC1.

---

## Gói RC5

| Hiện vật | Mục | SHA-256 |
|---|---:|---|
| `SO-TU-HOC-FEAT-010-RC5-FULL.zip` | 760 (759 dòng manifest) | đi kèm bản giao |
| `SO-TU-HOC-FEAT-010-RC5-FRONTEND.zip` | 166 | đi kèm bản giao |
| `database/upgrade/13-FEAT-010-DEVICE-USE-LOCK.sql` | – | `0e1e7c453d629659cb0a10fb7a25a53d69348b92230be480ffb4110ce34a8f56` |

`sha256sum -c SHA256SUMS.txt` bên trong gói FULL: **759/759 OK, 0 FAILED**.

Hash của hai tệp ZIP **không** nằm trong tài liệu này, và đó là cố ý. Tệp này nằm
trong gói FULL nên hash của gói không thể tự chứa mình — đúng loại lỗi tự tham
chiếu Sol RC1 §2 đã bắt ở manifest. Hash của gói FRONTEND cũng không ghi ở đây:
bước đóng gói chép tệp ra thư mục tạm nên dấu thời gian trong ZIP đổi mỗi lần
chạy, và một con số chỉ đúng cho đúng một lần chạy mà lại nằm trong tài liệu thì
sẽ thành sai ngay lần đóng gói sau. Cả hai hash đi kèm bản giao. Thứ **có** hash
ổn định ở đây là tệp SQL, vì đó là hash nội dung tệp, không phụ thuộc đóng gói —
và đó cũng là tệp cần đối chiếu trước khi dán vào SQL editor.

Số mục tăng từ 721 (RC4) lên 760 vì `scripts/verify-feat010.mjs` chép log của
lần chạy trước vào `docs/feat-010/evidence/previous-<timestamp>/` mỗi lần chạy,
và RC5 chạy verify thêm hai lần. Log của lần chạy mới nhất vẫn nằm thẳng trong
`evidence/`; các thư mục `previous-*` là bản lưu của những lần đã bị thay thế.

