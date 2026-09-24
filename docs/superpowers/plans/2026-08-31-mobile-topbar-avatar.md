# Mobile TopBar and Private Avatar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the TopBar fully usable on phone widths and add private, crop-before-save avatars for every user role.

**Architecture:** Keep responsive layout changes localized to `TopBar.vue`. Add a shared avatar renderer/editor and pure image math helpers; extend the legacy Supabase browser service with private Storage + RPC operations, and centralize the resulting Blob URL in the auth store so all avatar consumers stay synchronized.

**Tech Stack:** Vue 3, TypeScript, Pinia, Supabase JS v2 browser client, Supabase Storage/PostgreSQL RLS/RPC, Canvas 2D, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-31-mobile-topbar-avatar-design.md`

## Global Constraints

- All four roles can manage avatars.
- Avatar management lives in Tùy chọn cá nhân, not as separate TopBar actions.
- Teacher application settings remain available at `/settings`; personal settings use `?view=personal`.
- Accepted source files: JPEG, PNG, WEBP, maximum 5 MiB.
- Saved avatar: 512×512 WebP.
- Storage bucket is private; object path is `<auth.uid()>/avatar.webp`.
- Existing authentication, role, context selector, theme, logout, and Wise Owl behavior must remain intact.
- No new crop dependency.

---

### Task 1: Add failing contracts for mobile TopBar and avatar domain

**Files:**
- Create: `tests/v880-mobile-avatar.test.mjs`
- Create: `tests/unit/avatar-image.test.mjs`

**Interfaces:**
- Consumes: current `TopBar.vue`, `SettingsPage.vue`, `public/supabase-service.js`, database SQL.
- Produces: regression contracts for all later tasks.

- [ ] **Step 1: Write failing source-contract tests** for two-row mobile TopBar, `100dvw` dropdown containment, all-role personal settings, private bucket/RPC, and avatar service methods.
- [ ] **Step 2: Write failing pure unit tests** importing `validateAvatarFile`, `normalizeAvatarTransform`, and `avatarSourceRect` from `src/features/profile/avatar-image.js`.
- [ ] **Step 3: Run both tests and verify failure is due to missing avatar implementation/mobile contract.**

### Task 2: Implement mobile TopBar containment

**Files:**
- Modify: `src/components/layout/TopBar.vue`

**Interfaces:**
- Consumes: existing context/auth/preferences stores.
- Produces: mobile two-row TopBar; all-role personal-settings link.

- [ ] **Step 1: Change the personal-settings RouterLink** so all authenticated roles see it; teacher target is `{path:'/settings',query:{view:'personal'}}`.
- [ ] **Step 2: Add mobile layout CSS** using a one-column TopBar with two width-constrained rows, shrinkable school-year/select controls, and compact profile chip.
- [ ] **Step 3: Constrain dropdown** with dynamic viewport width and fixed mobile positioning where required.
- [ ] **Step 4: Run the focused mobile source-contract test and verify green for TopBar assertions.**

### Task 3: Implement avatar image math and crop editor

**Files:**
- Create: `src/features/profile/avatar-image.js`
- Create: `src/features/profile/avatar-image.d.ts`
- Create: `src/components/profile/AvatarEditor.vue`
- Create: `src/components/profile/UserAvatar.vue`

**Interfaces:**
- Produces:
  - `validateAvatarFile(file: {type:string,size:number}): {ok:true}|{ok:false;message:string}`
  - `normalizeAvatarTransform(input): {scale:number,panX:number,panY:number,renderedWidth:number,renderedHeight:number}`
  - `avatarSourceRect(input): {sx:number,sy:number,sWidth:number,sHeight:number}`
  - `AvatarEditor` emits `save(blob: Blob)` and `cancel`.
  - `UserAvatar` props: `src?: string|null`, `name?: string`, `code?: string`, `size?: 'sm'|'md'|'lg'`.

- [ ] **Step 1: Implement pure helpers minimally to satisfy unit tests.**
- [ ] **Step 2: Run avatar image unit tests and verify green.**
- [ ] **Step 3: Implement `UserAvatar.vue` fallback rendering.**
- [ ] **Step 4: Implement `AvatarEditor.vue`** with file image load, drag, zoom, clamped transform, Canvas 512×512 WebP output, cancel/save states, and cleanup of temporary object URLs.
- [ ] **Step 5: Run static contracts again.**

### Task 4: Implement Supabase avatar persistence and auth-store synchronization

**Files:**
- Modify: `src/types/legacy.ts`
- Modify: `public/supabase-service.js`
- Modify: `src/stores/auth.ts`
- Create: `database/upgrade/02-UPGRADE-V8.8.0-PRIVATE-AVATARS.sql`
- Create: `database/verify/VERIFY-V8.8.0-PRIVATE-AVATARS.sql`

**Interfaces:**
- `CurrentUser.avatarPath?: string|null`.
- `LegacySupabaseService.downloadAvatar(path): Promise<Blob|null>`.
- `LegacySupabaseService.uploadOwnAvatar(blob): Promise<{avatarPath:string}>`.
- `LegacySupabaseService.deleteOwnAvatar(): Promise<{avatarPath:null}>`.
- Auth store exposes `avatarUrl`, `avatarBusy`, `refreshAvatar`, `uploadAvatar`, `deleteAvatar`.

- [ ] **Step 1: Add `avatar_path` to profile selects and `mapProfile`.**
- [ ] **Step 2: Add service download/upload/delete methods** using private bucket `avatars`, path `<uid>/avatar.webp`, upsert, and `set_own_avatar_path` RPC.
- [ ] **Step 3: Add database migration** for `profiles.avatar_path`, private bucket, authenticated read policy, owner write/delete policies, and restrictive security-definer RPC.
- [ ] **Step 4: Add database verifier** checking column, bucket privacy, policies, and RPC.
- [ ] **Step 5: Add auth-store Blob URL lifecycle** with URL revocation on replacement/logout and synchronized current-user path.
- [ ] **Step 6: Run source-contract tests.**

### Task 5: Integrate avatar into TopBar and personal settings for all roles

**Files:**
- Modify: `src/components/layout/TopBar.vue`
- Modify: `src/pages/SettingsPage.vue`

**Interfaces:**
- Consumes: `auth.avatarUrl`, `auth.uploadAvatar`, `auth.deleteAvatar`, `UserAvatar`, `AvatarEditor`.
- Produces: visible avatar in TopBar and avatar management card in personal settings.

- [ ] **Step 1: Replace initials spans in TopBar** with `UserAvatar` while preserving current dimensions/hover behavior.
- [ ] **Step 2: Make teacher personal-settings mode query-driven** and add teacher switch links between personal/application settings.
- [ ] **Step 3: Add avatar card to personal settings** with current image, file chooser, validation, editor dialog, save feedback, and conditional delete action.
- [ ] **Step 4: Keep password/appearance/owl flows unchanged.**
- [ ] **Step 5: Run focused avatar/mobile tests and typecheck.**

### Task 6: Release verification and packaging

**Files:**
- Modify only if required by verification: relevant stale source-contract tests that intentionally encoded the superseded teacher-settings behavior.
- Create: `SO-TU-HOC-V8.8.0-R6.10-MOBILE-PRIVATE-AVATAR-HOTFIX-OVERLAY.zip`
- Create: `SO-TU-HOC-V8.8.0-R6.10-MOBILE-PRIVATE-AVATAR-FULL-SOURCE.zip`

**Interfaces:**
- Produces deployable full-source and overlay artifacts.

- [ ] **Step 1: Run focused Node tests.**
- [ ] **Step 2: Run `npm ci` if dependencies are not already installed, then `npm run typecheck`.**
- [ ] **Step 3: Run `npm run build:pages`.**
- [ ] **Step 4: Run the full static suite and distinguish pre-existing stale-baseline failures from new regressions.**
- [ ] **Step 5: Package an overlay containing changed frontend/service/database files and a full-source archive.**
- [ ] **Step 6: Verify ZIP integrity and generate SHA-256 checksums.**
