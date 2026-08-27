# VERIFICATION — SỔ TỰ HỌC V8.7.1

Release scope: year/period/week lifecycle, role separation, Admin system management, permanent deletion, audit viewer, vertical macOS Dock displacement and vanilla light background.

## Fresh verification evidence

- Static/regression suite: **144/144 PASS**.
- Frontend TypeScript/SFC syntax transpile: **83 scripts, 0 errors**.
- Edge TypeScript syntax transpile: **17 files, 0 errors**.
- `public/supabase-service.js`: `node --check` PASS.
- `npm run verify:release`: PASS.
- Dashboard Edge packages: **10/10 ZIPs valid** with `source/index.ts` + root `_shared/` layout and resolvable `../_shared/...` imports.
- Release manifest: **200 files hashed** before final archive packaging.
- Obvious Supabase server-secret/Groq-secret scan: PASS.

## Security assertions

- Teacher deletion remains soft and class-scoped.
- Hard-delete is an explicit `mode:"hard"` request and requires Root Admin, confirmation code and exact `XÓA VĨNH VIỄN` phrase.
- Root Admin cannot hard-delete itself or another root admin directly.
- Teacher hard-delete is rejected while any active `class_teachers` assignment exists, regardless of currently selected school year.
- Hard-delete uses Supabase Auth Admin deletion so existing FK/cascade policy controls dependent record removal.
- `audit_logs.actor_id` must remain nullable with `ON DELETE SET NULL`; production DB verifier must return `overall=true` before permanent deletion is enabled.
- Audit list mode is Root-Admin-only and bounded to at most 250 rows per request.

## UI assertions

- Admin has seven direct sidebar functions: Tổng quan, Năm học, Lớp học, Học sinh, Giáo viên, Phân quyền, Nhật ký hệ thống.
- Admin learner directory covers all learner/monitor accounts and supports create/edit/transfer/role/lock-restore/reset-password/hard-delete.
- Admin teacher directory supports edit/lock-restore/reset-password/hard-delete; destructive delete is disabled in UI when assignments remain and rechecked at backend.
- Vertical Dock hover moves to the **right**, creates real vertical margins around the hovered item, shrinks/displaces neighbors, and reserves a 24px brand safe zone.
- Light mode shows the vanilla school image with no multiply/color overlay. Dark mode uses the same image plus a charcoal-plum overlay with the shared 260ms theme transition.

## Environment limitation

The workspace does not contain a complete local `node_modules`, so `vue-tsc`/Vitest/Vite production build are not claimed as locally verified. GitHub Actions remains the authoritative gate for `npm ci`, `npm run test:unit`, `npm run typecheck`, and `npm run build`.
