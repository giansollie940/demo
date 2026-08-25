# SỔ TỰ HỌC V8.6.0 — Vue Source CP8

Parallel Vue 3 + TypeScript + Vite frontend for SỔ TỰ HỌC. The vanilla application remains the production rollback until the Vue build and role workflows are fully verified.

## Source coverage

- CP1: Foundation, Auth, Router, Pinia, Vue Query, AppShell, light/dark theme.
- CP2: Weekly Management and Schedule.
- CP3: Registration, emergency registration, AI review and Teacher Approval.
- CP4: Class Tracking with one full-width filtered learner list.
- CP5: Students/Accounts.
- CP6: Root Admin classes, teachers and permission matrix using existing bridge actions.
- CP7: Statistics, History, Teacher Comments and Settings.
- CP8: Wise Owl six-layer mascot, context messages, stable daily quote and non-repeating quote rotation.

No backend schema/RLS/RPC/Auth/Edge Function/AI contract is changed. `public/supabase-service.js` remains the compatibility bridge.

## Required local verification

```bash
npm ci
npm run typecheck
npm test
npm run test:unit
npm run build
```

`public/config.js` is intentionally excluded from source artifacts. Copy only the existing public browser configuration when running/deploying locally; never use service-role secrets in browser configuration.

## GitHub Pages

The project keeps `base: './'` and hash-router history. Verify under a parallel path such as `/tu-hoc/vue/` before any cutover.

## Current checkpoint caveat

The source checkpoint was produced while registry access was unavailable/incomplete, so the new CP3–CP8 source has not yet passed a fresh `vue-tsc`/Vitest/Vite build in that environment. See `../docs/superpowers/checkpoints/V8.6.0-CP8-SOURCE-STATUS.md`.
