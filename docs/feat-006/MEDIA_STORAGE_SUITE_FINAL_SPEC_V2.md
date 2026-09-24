# MEDIA & STORAGE SUITE — FINAL SPEC

## Suite
**Suite ID:** `MEDIA-STORAGE-SUITE`  
**Status:** `FINAL`  
**Spec Owner:** GPT-5.6 Sol High  
**Implementation Model:** GPT-6 Astra

### Included Tasks
1. `FEAT-006 — Ảnh trong Báo bài`
2. `FEAT-008 — Admin Storage Health / cảnh báo dung lượng`
3. `FEAT-007 — Đóng gói dữ liệu cuối năm học`

### Mandatory implementation order
`FEAT-006 → FEAT-008 → FEAT-007`

FEAT-008 phụ thuộc storage/attachment model của FEAT-006.  
FEAT-007 phụ thuộc media lifecycle và quota model đã ổn định.

---

# 1. Architecture

- **Vue/TypeScript**: UI + client-side image processing.
- **Supabase**: Auth, PostgreSQL, RLS/RPC, business rules, audit, attachment metadata.
- **Cloudflare R2**: binary homework images/media.
- R2 không phải authorization source.
- Không để R2 API key/secret trong frontend.
- Không lưu signed URL lâu dài trong database.
- Không yêu cầu Go.

---

# 2. FEAT-006 — Ảnh trong Báo bài

## Task
**Task ID:** `FEAT-006`  
**Status:** `FINAL`  
**ASTRA_EFFORT:** `MEDIUM`

## Objective
Cho phép mỗi Báo bài có tối đa một ảnh dung lượng nhẹ, lưu trên private Cloudflare R2 nhưng phân quyền bằng Supabase.

## Required Behavior

### F6-RB-001 — One image per notice
V1 chỉ hỗ trợ tối đa `1 ảnh / notice hoặc revision`.

### F6-RB-002 — Input formats
Hỗ trợ:
- JPEG/JPG
- PNG
- WebP
- HEIC/HEIF

HEIC/HEIF phải convert sang WebP nếu browser/library decode được. Nếu không decode an toàn, không upload file gốc; báo user chọn/chuyển định dạng.

### F6-RB-003 — Preserve image shape
- giữ nguyên aspect ratio;
- không crop nội dung;
- xử lý EXIF orientation;
- ảnh chi tiết dùng `object-fit: contain`;
- thumbnail có thể crop bằng CSS nhưng không thay đổi file gốc.

### F6-RB-004 — Compression profile
- output: WebP;
- quality mặc định: `0.92`;
- cạnh dài tối đa: `1600 px`;
- target: `250–450 KB`;
- hard limit: `500 KB`;
- nếu >500 KB: giảm dimension trước, sau đó mới giảm quality;
- quality floor khoảng `0.85`;
- nếu vẫn >500 KB: reject ảnh.

### F6-RB-005 — Client-side compression
Resize/convert/nén trước khi upload. Không upload ảnh gốc nhiều MB chỉ để server nén.

### F6-RB-006 — Local draft
Khi user chỉ chọn ảnh nhưng chưa submit:
- ảnh lưu local;
- chưa tạo object R2;
- nên dùng IndexedDB/local persistence phù hợp để có thể recover khi reload.

### F6-RB-007 — Upload on submit
Khi user bấm `Đăng Báo bài`:
1. backend xác thực Supabase JWT;
2. kiểm class/role/ownership;
3. tạo pending attachment + object key;
4. cấp signed PUT URL;
5. browser upload trực tiếp R2;
6. finalize notice + attachment metadata.

### F6-RB-008 — Pending recovery
Nếu upload R2 thành công nhưng finalize notice thất bại:
- attachment = `pending`;
- chỉ đúng author được reuse;
- retry submit không cần upload lại;
- pending tồn tại tối đa 24 giờ;
- user hủy → cleanup ngay;
- quá 24 giờ → cleanup job xóa object + metadata.

Không tồn tại orphan object không truy xuất được từ app.

### F6-RB-009 — Metadata
Supabase lưu tối thiểu:
- attachment_id
- notice_id / revision_id
- owner_id
- class_id
- object_key
- mime_type
- size_bytes
- width / height
- checksum
- status
- created_at / finalized_at / expires_at

Không lưu signed URL.

### F6-RB-010 — Read permission
Quyền xem attachment không bao giờ rộng hơn quyền xem notice/revision chứa nó.

- Published notice: Student/Monitor đúng class + English-group scope; Teacher assigned class; Admin read-only oversight.
- Draft/pending: chỉ author.
- Correction revision: author + Teacher assigned.
- Soft-deleted history: theo quyền history/trash.
- Hard-deleted: media phải purge.

### F6-RB-011 — Signed GET
Backend kiểm quyền rồi cấp signed GET URL ngắn hạn. Homework media bucket/object access không public.

### F6-RB-012 — Soft-delete / restore
Soft-delete không xóa media. Restore reuse object cũ.

### F6-RB-013 — Replace image
Upload/finalize ảnh mới trước; chỉ khi thành công mới đổi reference và cleanup ảnh cũ theo lifecycle.

### F6-RB-014 — Hard-delete
Admin hard-delete notice phải purge media R2. Không được báo hard-delete thành công nếu media purge thất bại mà chưa có cơ chế retry/outbox an toàn.

### F6-RB-015 — Archive
Media chỉ được purge cuối năm sau khi FEAT-007 archive VERIFIED + Admin confirmation.

## Permissions

| Action | Admin | Teacher | Monitor | Student |
|---|:---:|:---:|:---:|:---:|
| Upload/thay ảnh bài mình | ❌ | ✅ | ✅ | ✅ |
| Thay ảnh người khác | ❌ | ❌ | ❌ | ❌ |
| Xem published image đúng scope | ✅ oversight | ✅ assigned | ✅ | ✅ |
| Xem revision image chờ duyệt | ❌ daily flow | ✅ assigned | nếu là author | nếu là author |
| Hard-delete media | qua hard-delete notice | ❌ | ❌ | ❌ |

## Acceptance Criteria
- `AC6-01` JPEG/PNG/WebP/HEIC/HEIF được xử lý đúng.
- `AC6-02` HEIC/HEIF convert WebP, giữ aspect ratio/orientation.
- `AC6-03` Không crop nội dung gốc.
- `AC6-04` Output mặc định WebP q=0.92, max 1600 px.
- `AC6-05` File >500 KB không upload.
- `AC6-06` Draft chưa submit không tạo object R2.
- `AC6-07` Finalize lỗi → author reuse pending attachment.
- `AC6-08` Pending >24h cleanup.
- `AC6-09` Cross-class/English-group access bị chặn backend-side.
- `AC6-10` Revision image không public trước approval.
- `AC6-11` Hard-delete purge media đúng lifecycle.
- `AC6-12` Không secret R2 trong frontend.
- `AC6-13` Signed URL không persist DB.
- `AC6-14` R2 lỗi/quota không làm text notice ngừng hoạt động.

---

# 3. FEAT-008 — Admin Storage Health

## Task
**Task ID:** `FEAT-008`  
**Status:** `FINAL`  
**ASTRA_EFFORT:** `MEDIUM`

## Objective
Cho Admin theo dõi dung lượng Supabase DB và R2, cảnh báo sớm và tự động chuyển hệ thống sang chế độ bảo vệ khi gần đầy.

## Capacity model
Không hard-code quota provider như business constant.

Deployment phải có `configured_capacity` cho:
- Supabase DB;
- Cloudflare R2;
- storage provider khác nếu có.

Giá trị được xác nhận theo plan đang dùng tại deployment.

## Admin dashboard
Hiển thị tối thiểu:

### Database
- current DB size;
- configured capacity;
- percent used;
- trend nếu có.

### R2
- total bytes;
- active media bytes;
- pending/temp bytes;
- media count;
- percent used.

### Archive candidates
- dung lượng theo school year;
- năm học cũ chưa archive/purge;
- dung lượng ước tính có thể reclaim.

## Thresholds

### 70% — INFO
Thông tin cho Admin, chưa khóa chức năng.

### 85% — WARNING
Banner cảnh báo + đề xuất archive/cleanup.

### 95% — CRITICAL

#### R2 >=95%
- khóa upload ảnh mới;
- text notice vẫn hoạt động;
- ảnh cũ vẫn xem nếu provider còn phục vụ;
- Admin archive/cleanup vẫn hoạt động.

#### Supabase DB >=95%
Bật `STORAGE_PROTECTION_MODE`.

## STORAGE_PROTECTION_MODE

### F8-RB-001 — Critical writes vẫn hoạt động
Giữ:
- tạo/sửa Báo bài dạng text;
- correction/report quan trọng;
- audit/security logs bắt buộc;
- archive/cleanup/admin maintenance;
- operations cần để giải phóng dung lượng.

### F8-RB-002 — Non-essential writes tạm khóa
Tạm khóa:
- reaction/heart mới;
- upload ảnh mới;
- optional analytics/cache/telemetry không liên quan security/audit.

Không được tắt:
- security audit;
- correction/report audit;
- archive/purge audit.

### F8-RB-003 — Reads tiếp tục
Notice/history/oversight/storage health/ảnh cũ vẫn đọc nếu provider còn hoạt động.

### F8-RB-004 — Clear UI feedback
Action bị protection mode chặn phải hiển thị rõ `Hệ thống đang ở chế độ bảo vệ dung lượng`, không giả thành permission error.

### F8-RB-005 — Admin controls
Chỉ Admin thấy storage dashboard và được:
- refresh usage;
- xem recommendation;
- mở archive flow;
- cleanup pending media;
- xem protection status.

Không cho tắt protection mode thủ công khi usage vẫn >=95% trong V1.

## Measurement
Astra khảo sát provider API/schema và chọn cách đo phù hợp:
- PostgreSQL size cho DB;
- R2 usage từ API/inventory/metadata aggregation;
- cache snapshot để tránh đo nặng liên tục;
- scheduled refresh + manual Admin refresh.

## Acceptance Criteria
- `AC8-01` Admin thấy DB/R2 usage + percent.
- `AC8-02` Non-Admin không truy cập storage health.
- `AC8-03` 70% info, 85% warning đúng.
- `AC8-04` R2 >=95% khóa ảnh mới nhưng text notice vẫn hoạt động.
- `AC8-05` DB >=95% bật protection mode.
- `AC8-06` Critical writes vẫn hoạt động.
- `AC8-07` Reaction mới/image upload bị khóa trong DB protection mode.
- `AC8-08` Security/audit logs không bị tắt.
- `AC8-09` Archive/cleanup vẫn hoạt động.
- `AC8-10` UI hiển thị lý do chặn rõ ràng.
- `AC8-11` Usage measurement không lộ credential.
- `AC8-12` FEAT-001→007 regression PASS.

---

# 4. FEAT-007 — School Year Archive & Purge

## Task
**Task ID:** `FEAT-007`  
**Status:** `FINAL`  
**ASTRA_EFFORT:** `HIGH`

## Objective
Đóng gói dữ liệu năm học thành ZIP độc lập, có checksum, Archive Viewer local/read-only và purge có kiểm soát để giải phóng quota.

## Required Behavior summary

### F7-RB-001 — Preflight
Admin thấy counts/dung lượng:
- classes;
- students/profiles;
- notices;
- reactions;
- reports;
- corrections/revisions;
- audit;
- subjects;
- English groups;
- media count/bytes;
- estimated archive size;
- inconsistencies.

### F7-RB-002 — Archive package
ZIP chứa:
- manifest;
- JSON/data files;
- audit;
- media;
- checksums.

### F7-RB-003 — Media independent from R2
Media tải từ R2 vào `/media/`, data tham chiếu bằng `archive_path`, không signed URL.

### F7-RB-004 — Integrity
SHA-256 tối thiểu. Thiếu một media/data bắt buộc → không VERIFIED.

### F7-RB-005 — Purge gate
Purge chỉ khi:
1. archive generation thành công;
2. checksum PASS;
3. Admin tải ZIP;
4. Admin xác nhận lưu an toàn;
5. Admin xác nhận purge irreversible.

### F7-RB-006 — Second copy policy
Hai bản sao là khuyến nghị mạnh, không phải hard gate.

### F7-RB-007 — Archive index
Sau purge chỉ giữ metadata nhẹ: identity, school year, counts, archive size, checksum, timestamps, actors, purge status, format version.

### F7-RB-008 — ARCHIVED_READ_ONLY
Sau VERIFIED, năm học có thể khóa read-only trước purge.

### F7-RB-009 — Purge
Admin-only, confirmation + reason + audit, scoped theo school year, không xóa shared data, có retry/checkpoint.

### F7-RB-010 — Archive Viewer
Admin mở ZIP local trong app:
- validate manifest/version/checksum;
- không upload server;
- banner `DỮ LIỆU LƯU TRỮ — CHỈ XEM`;
- xem/tìm/lọc/ảnh/audit;
- không mutation.

### F7-RB-011 — Local media viewer
Đọc media từ ZIP, tạo Blob/Object URL tạm, revoke khi không dùng.

### F7-RB-012 — No restore in V1
Không import/restore archive lên Supabase/R2 trong V1.

### F7-RB-013 — No duplicate archive ZIP on R2
Không upload một bản ZIP archive thứ hai lên R2 trong V1.

## Acceptance Criteria
Giữ toàn bộ `AC-701 → AC-730` trong `FEAT-007_FINAL_SPEC.md` đã được chốt trước đó.

---

# 5. Cross-feature rules

`CR-001` — Supabase là authority cho Auth/permission/business rules.  
`CR-002` — Homework media không public bucket.  
`CR-003` — R2 failure/quota không làm text Báo bài ngừng hoạt động.  
`CR-004` — DB critical mode ưu tiên educational critical writes + security/audit + archive/cleanup.  
`CR-005` — Storage pressure không tự động purge năm học.  
`CR-006` — **Archive VERIFIED gate chỉ áp dụng cho purge dữ liệu/media của năm học theo FEAT-007.**

Không áp dụng gate này cho lifecycle cleanup hợp lệ của FEAT-006, gồm:

- pending upload bị user hủy trước khi trở thành attachment active;
- pending upload hết hạn 24 giờ;
- ảnh cũ sau replace chỉ khi đã xác nhận **không còn bất kỳ reference hợp lệ nào** từ notice, soft-deleted history, correction revision, restore/history flow hoặc retention rule;
- media của một notice được Admin hard-delete hợp lệ theo FEAT-002/FEAT-006.

Soft-delete notice **không** được purge media.

Một media đang còn được tham chiếu bởi dữ liệu cần giữ lại không được coi là cleanup candidate chỉ vì có ảnh mới thay thế.  
`CR-007` — Suite không yêu cầu Go.

---

# 6. Decisions

## DEC-071 — Homework media uses Cloudflare R2
Binary media lưu private trên R2; Supabase giữ Auth, permission, metadata và business rules.

## DEC-072 — Image compression profile
WebP q=0.92, max 1600 px, target 250–450 KB, hard max 500 KB, quality floor ~0.85, giữ aspect ratio, không crop, hỗ trợ HEIC/HEIF conversion.

## DEC-073 — One image per notice in V1
Tối đa một ảnh cho mỗi notice/revision.

## DEC-074 — Pending upload must be recoverable
Pending attachment phải recoverable cho đúng author tối đa 24 giờ hoặc cleanup; không giữ orphan object.

## DEC-075 — Attachment permission follows notice/revision permission
Không có media access rộng hơn container access.

## DEC-076 — Storage thresholds
70% info, 85% warning, 95% critical, tính trên configured provider capacity.

## DEC-077 — R2 95% locks new image upload only
Text notice vẫn hoạt động; ảnh cũ đọc được nếu provider available; Admin cleanup/archive vẫn hoạt động.

## DEC-078 — Supabase DB 95% enables Storage Protection Mode
Giữ critical educational/security/archive writes; khóa non-essential writes như reaction mới, image upload, optional analytics/cache. Không tắt audit/security logs.

## DEC-079 — Quota pressure never auto-purges school year
FEAT-008 chỉ cảnh báo/protect; purge chỉ qua FEAT-007.

## DEC-080 — FEAT-007 archive policy remains authoritative
DEC-062→DEC-070 vẫn ACTIVE và là nguồn sự thật cho archive/purge.

---


## DEC-081 — Scope của archive VERIFIED gate

**STATUS:** ACTIVE

Điều kiện `archive VERIFIED trước khi purge media` chỉ áp dụng cho **school-year purge của FEAT-007**.

Không áp dụng cho các lifecycle cleanup hợp lệ của FEAT-006:

1. pending attachment bị hủy trước khi active;
2. pending attachment hết hạn 24 giờ;
3. superseded/replaced image chỉ khi không còn reference hợp lệ nào cần retention;
4. media của notice đã được Admin hard-delete hợp lệ theo FEAT-002/FEAT-006.

Soft-delete không purge media.

Nếu media vẫn còn được tham chiếu bởi published notice, soft-deleted history, correction revision, restore/history flow hoặc retention rule, media đó **không được cleanup**.

FEAT-007 archive chỉ đóng gói dữ liệu/media còn thuộc retained dataset tại thời điểm archive.

# 7. Implementation and review gates

## Phase 1 — FEAT-006
Astra triển khai R2 integration, image pipeline, pending recovery, permission/lifecycle, tests.  
→ Sol independent review.

## Phase 2 — FEAT-008
Chỉ sau FEAT-006 APPROVED.  
Astra triển khai usage measurement, thresholds, protection mode, Admin dashboard.  
→ Sol independent review.

## Phase 3 — FEAT-007
Chỉ sau FEAT-006 + FEAT-008 APPROVED.  
Astra triển khai archive, checksum, viewer, purge, large-file tests.  
→ Sol independent review.

Production release cuối cùng thuộc Product Owner.

---

# 8. Final Status

```text
MEDIA-STORAGE-SUITE: FINAL

FEAT-006: FINAL — ASTRA_EFFORT MEDIUM
FEAT-008: FINAL — ASTRA_EFFORT MEDIUM
FEAT-007: FINAL — ASTRA_EFFORT HIGH
```
