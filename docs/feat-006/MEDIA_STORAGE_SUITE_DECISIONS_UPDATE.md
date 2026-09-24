# MEDIA & STORAGE SUITE — DECISIONS UPDATE

## DEC-071 — Homework media uses Cloudflare R2
**STATUS:** ACTIVE

Binary media lưu private trên Cloudflare R2. Supabase giữ Auth, permission, metadata và business rules.

---

## DEC-072 — Image compression profile
**STATUS:** ACTIVE

WebP q=0.92, max 1600 px, target 250–450 KB, hard max 500 KB, quality floor khoảng 0.85, giữ aspect ratio, không crop, hỗ trợ HEIC/HEIF conversion.

---

## DEC-073 — One image per notice in V1
**STATUS:** ACTIVE

Tối đa một ảnh cho mỗi notice/revision.

---

## DEC-074 — Pending upload must be recoverable
**STATUS:** ACTIVE

Pending attachment phải recoverable cho đúng author tối đa 24 giờ hoặc được cleanup. Không giữ orphan object không truy xuất được.

---

## DEC-075 — Attachment permission follows notice/revision permission
**STATUS:** ACTIVE

Không có media access rộng hơn container notice/revision access.

---

## DEC-076 — Storage thresholds
**STATUS:** ACTIVE

70% info, 85% warning, 95% critical, tính trên configured provider capacity.

---

## DEC-077 — R2 95% locks new image upload only
**STATUS:** ACTIVE

Text notice vẫn hoạt động; ảnh cũ vẫn đọc nếu provider available; Admin cleanup/archive vẫn hoạt động.

---

## DEC-078 — Supabase DB 95% enables Storage Protection Mode
**STATUS:** ACTIVE

Giữ critical educational/security/archive writes; khóa non-essential writes như reaction mới, image upload và optional analytics/cache. Không tắt audit/security logs.

---

## DEC-079 — Quota pressure never auto-purges school year
**STATUS:** ACTIVE

FEAT-008 chỉ cảnh báo/protect; purge năm học chỉ qua FEAT-007.

---

## DEC-080 — FEAT-007 archive policy remains authoritative
**STATUS:** ACTIVE

DEC-062→DEC-070 vẫn ACTIVE và là nguồn sự thật cho archive/purge.

---

## DEC-081 — Scope của archive VERIFIED gate
**STATUS:** ACTIVE

Điều kiện `archive VERIFIED trước khi purge media` chỉ áp dụng cho **school-year purge của FEAT-007**.

Không áp dụng cho lifecycle cleanup hợp lệ của FEAT-006:

1. pending attachment bị hủy trước khi active;
2. pending attachment hết hạn 24 giờ;
3. superseded/replaced image chỉ khi không còn reference hợp lệ nào cần retention;
4. media của notice đã được Admin hard-delete hợp lệ theo FEAT-002/FEAT-006.

Soft-delete không purge media.

Nếu media vẫn còn được tham chiếu bởi published notice, soft-deleted history, correction revision, restore/history flow hoặc retention rule, media đó không được cleanup.

FEAT-007 archive chỉ đóng gói dữ liệu/media còn thuộc retained dataset tại thời điểm archive.
