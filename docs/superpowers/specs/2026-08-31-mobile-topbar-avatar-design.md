# Mobile TopBar and Private Avatar Design

## Scope

Implement two approved changes without changing existing role behavior outside settings/profile UX:

1. Prevent the mobile app/TopBar from exceeding the viewport so the profile dropdown and Đăng xuất remain reachable at 320, 360, 390, and 430 px widths.
2. Allow every account role (`student`, `monitor`, `teacher`, `admin`) to manage one private avatar from Tùy chọn cá nhân.

## Mobile TopBar

- At `max-width: 760px`, TopBar becomes a two-row layout.
- Row 1 contains the mobile menu and school-year control.
- Row 2 contains class/week context controls plus theme and avatar/profile menu.
- All mobile flex/grid children use `min-width: 0`; selects may shrink and must not force horizontal overflow.
- The profile dropdown is constrained with `max-width: calc(100dvw - 20px)` and remains inside the viewport.
- No current TopBar function is hidden; only responsive layout changes.

## Avatar UX

- Avatar management is only inside Tùy chọn cá nhân; TopBar only displays the avatar and links to settings.
- All roles can access Tùy chọn cá nhân.
- Teacher keeps existing application settings at `/settings`; teacher personal settings use `/settings?view=personal`, with a visible switch between personal and application settings.
- Avatar card offers Đổi ảnh and Xóa ảnh.
- Accepted source types: JPEG, PNG, WEBP; maximum source size 5 MiB.
- User crops/repositions a square image with zoom before save.
- Save output is 512×512 WebP.
- If no avatar or load fails, render current initials fallback.

## Storage and Security

- Supabase Storage bucket: `avatars`, private.
- Object path: `<auth.uid()>/avatar.webp`.
- Authenticated users may read avatars.
- Only the owner may insert/update/delete their own object path.
- `profiles.avatar_path text null` stores the current path.
- Profile path update is performed by a security-definer RPC that only allows `null` or exactly `<auth.uid()>/avatar.webp`; no broad profile update permission is granted.
- One avatar per user; new upload uses upsert and delete returns to initials.

## Frontend Architecture

- `UserAvatar.vue`: single rendering component for Blob URL + initials fallback.
- `AvatarEditor.vue`: crop dialog; pointer drag + zoom; emits a 512×512 WebP Blob.
- `features/profile/avatar-image.js`: pure validation/crop math helpers with Node tests.
- Auth store owns the current avatar Blob URL so TopBar and Settings do not download duplicates.
- `public/supabase-service.js` owns Storage/RPC operations and maps `avatar_path` into `CurrentUser.avatarPath`.

## Compatibility

- Preserve existing authentication, class/week context behavior, theme switching, Wise Owl settings, role permissions, and logout flow.
- Do not add a crop dependency; use browser Canvas and Pointer Events.
- Respect `prefers-reduced-motion` through existing app behavior; avatar editor itself does not require motion.
