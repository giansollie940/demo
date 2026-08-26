# Sổ Tự Học V8.7.1 Full Stack Design

## Goal
Create one authoritative V8.7.1 source package that contains the current Vue frontend plus the complete Supabase backend source, database upgrade/install paths, verification SQL, deployable Edge Function packages, and release documentation.

## Baselines
- Frontend: `SO-TU-HOC-V8.7.1-MINIMAL-GITHUB-REPO.zip`.
- Backend authority: `SO-TU-HOC-V8.4.0-FINAL.zip` for the complete database/RLS/RPC/10 Edge Function source.
- Post-V8.4.0 database changes: V8.4.1 daily quote cache, V8.4.2 registration revision RPC, V8.4.2 revision-overdue notification fix, V8.4.2c audit actor FK fix.
- AI Edge Function: V8.7.1 source replaces the V8.4.0 `ai-review-registration` function while retaining the same shared helper contracts.

## Database paths
Database installation and upgrade are mutually exclusive.

### Compatible-baseline install
`database/fresh-install/01-INSTALL-V8.7.1-FROM-COMPATIBLE-BASELINE.sql`

This is the V8.4.0 consolidated migration plus all reusable post-V8.4.0 database patches. It intentionally preserves the V8.4.0 preflight requirement for existing core Sổ Tự Học tables (`profiles`, `weeks`, `registrations`, `periods`). It is not falsely labeled as an empty-project bootstrap.

### Current-system upgrade
`database/upgrade/01-UPGRADE-CURRENT-TO-V8.7.1.sql`

This is an idempotent, guarded patch for a database already on the V8.4.x backend family. It must not replay the one-time `10A1 -> 7A9` repair. It applies only reusable current-state changes: `daily_quotes`, `request_registration_revision`, the corrected teacher-notification trigger, the `audit_logs.actor_id ON DELETE SET NULL` FK, and schema reload.

### Verification
- `database/verify/VERIFY-V8.7.1.sql`: read-only structural and contract checks.
- `database/verify/VERIFY-AI-COMPLETED-ROUTING-V8.7.1.sql`: read-only inspection of AI decision/state mismatches.

### Maintenance
- `database/maintenance/BOOTSTRAP-ROOT-ADMIN-BY-EMAIL.sql`
- `database/maintenance/TRANSFER-ROOT-ADMIN-BY-EMAIL.sql`

## Backend source
`supabase/functions/` contains exactly 10 Edge Functions plus `_shared` helpers. Nine functions are inherited from the verified V8.4.0 backend, with `admin-manage-classes` completed for the later frontend bridge contract. `ai-review-registration` is replaced by the V8.7.1 source.

`admin-manage-classes` must support:
- list with `learnerCount`, `profileCount`, `registrationCount`, `canDelete`, `deleteBlockers`;
- create/update classes;
- assign/unassign teachers;
- transfer student/monitor while synchronizing `class_id` and legacy `class_name`;
- guarded `delete_class` that returns `CLASS_NOT_EMPTY` when business history or users block deletion.

## Frontend
The V8.7.1 Vue source remains authoritative and is not rewritten. `public/supabase-service.js` stays the browser bridge. No service-role key, Groq key, real `config.js`, or other server secret is added.

## Deploy artifacts
- `deploy/edge-functions/*.zip`: 10 standalone Supabase Dashboard-compatible Edge Function ZIPs containing `source/index.ts` plus exact shared dependencies.
- Root source ZIP: complete source without `node_modules`, `dist`, secrets, or `.git`.
- GitHub-ready ZIP: frontend repository plus backend/source/deployment directories; no real `config.js`.
- Deploy-only ZIP: built frontend only if a verified build is available, otherwise source deployment instructions plus Edge ZIPs and database scripts. A package must never claim a frontend build passed when dependencies could not be installed.

## Verification gates
1. Existing V8.7.1 static frontend regression suite passes.
2. New full-stack contract tests fail before backend/database packaging and pass after implementation.
3. JavaScript syntax checks pass.
4. Edge Function source/static import contract passes and all 10 deploy ZIPs are structurally valid.
5. SQL static checks confirm alternate install/upgrade paths, read-only verification files, required preflights, balanced transactions where applicable, no one-time class repair in the generic upgrade, and no embedded secrets.
6. Frontend `typecheck`/`build` run only after dependencies install successfully; failure caused solely by unavailable dependency installation is documented rather than misreported as application failure.
7. ZIP integrity and SHA-256 manifest pass.
