# DECISIONS UPDATE — FEAT-007

## DEC-062 — Archive phải VERIFIED trước purge

**STATUS:** ACTIVE

Purge chỉ mở khi archive generation thành công, checksum PASS, Admin đã tải archive, xác nhận đã lưu an toàn và xác nhận hiểu purge là irreversible trên cloud.

Không auto-purge sau archive.

---

## DEC-063 — Archive chứa media độc lập khỏi Cloudflare R2

**STATUS:** ACTIVE

Nếu media ở R2, archive phải tải media vào ZIP và tham chiếu bằng `archive_path`.

Sau purge R2, Archive Viewer vẫn xem được media từ file ZIP local.

---

## DEC-064 — Không lưu ZIP archive thứ hai trên R2 trong V1

**STATUS:** ACTIVE

FEAT-007 V1 không upload archive ZIP trở lại R2 để tránh nhân đôi storage.

Server chỉ giữ archive index nhẹ.

---

## DEC-065 — Bản sao thứ hai là best practice

**STATUS:** ACTIVE

Khuyến nghị Admin giữ ít nhất 2 bản archive ở 2 nơi khác nhau.

Không bắt buộc hệ thống xác minh bản sao thứ hai.

Một archive VERIFIED đã tải xuống + Admin confirmation là hard gate tối thiểu.

---

## DEC-066 — Archive Viewer local và read-only

**STATUS:** ACTIVE

Admin mở ZIP trực tiếp trong app.

Viewer đọc local, không upload lên server và không cho mutation.

---

## DEC-067 — Không restore lên server trong FEAT-007 V1

**STATUS:** ACTIVE

V1 không có restore/import archive trở lại Supabase/R2.

Nếu cần restore cloud, mở task riêng.

---

## DEC-068 — Sau purge chỉ giữ archive index nhẹ

**STATUS:** ACTIVE

Server giữ metadata archive tối thiểu: identity, school year, counts, size, checksum, timestamps, actors, purge status, format version.

Không giữ detail đã purge.

---

## DEC-069 — Archive format phải versioned và có checksum

**STATUS:** ACTIVE

Mỗi archive có `archive_format_version`, manifest và SHA-256 checksums.

Viewer không silently parse version không tương thích.

---

## DEC-070 — Purge là Admin-only và scoped theo school year

**STATUS:** ACTIVE

Purge phải có confirmation + reason + audit, chỉ ảnh hưởng đúng school year, không xóa shared data còn được năm khác dùng, và phải có retry/checkpoint để tránh destructive partial state.
