# Repository Inventory

## Repository roles

### Full source package

The full package is used for maintenance, verification, packaging, database history, Supabase sources, tests, evidence, and release documentation. It contains:

- `.github/`
- `database/`
- `deploy/`
- `docs/`
- `public/`
- `scripts/`
- `src/`
- `supabase/`
- `tests/`
- package/build configuration and integrity manifests

### GitHub Pages deploy repository

`giansollie940/demo` is intentionally a minimal deploy subset containing the application and Pages workflow rather than the full maintenance history. The cleanup does not attempt to upload database/test/evidence directories into that deploy repository.

## High-risk / protected areas

| Area | Disposition | Reason |
|---|---|---|
| `database/` | KEEP / immutable in this task | Migration and upgrade history; DB changes prohibited |
| `supabase/` | KEEP / immutable in this task | Edge Functions, migrations, RLS/RPC source; backend changes prohibited |
| `public/supabase-service.js` | KEEP / immutable in this task | High-risk auth/data/Realtime compatibility surface |
| FEAT-010 RC9 frozen evidence | KEEP | Required regression/release evidence |
| VERIFY-002 evidence | KEEP | Existing runtime gates remain open |
| `docs/feat-*` historical evidence | KEEP | Traceability |
| GitHub Pages workflow | KEEP | Required deployment path; no production deployment performed |

## Primary cleanup candidates identified

- Missing repository `.gitignore` policy in the full source package.
- Two Vue components with no incoming source/test/script references.
- One unused Lucide icon import.
- Exact duplicate `formatBytes()` implementations.
- Exact duplicate `addDaysISO()` implementations.
- Several exported functions/types/constants with no caller anywhere in `src/`, `tests/`, `scripts/`, or `public/`.
- `@vue/test-utils` declared as a direct devDependency with no import/reference in source, tests, or scripts.
- Minimal GitHub Pages packager did not carry `.gitignore` into generated deploy-source packages.

## Deliberately deferred structural candidates

Large files such as `HomeworkPage.vue`, `AdminPage.vue`, `DashboardPage.vue`, `SettingsPage.vue`, `AdminStorageHealth.vue`, and `public/supabase-service.js` were audited as refactor candidates but **not aggressively split in this task**. The available environment cannot install the project dependency tree to run a full post-refactor typecheck/build, and these files sit on behavior-sensitive paths. Behavior preservation takes priority over line-count reduction.
