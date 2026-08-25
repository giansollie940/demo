# Deployment verification — V8.6.0 GitHub Upload Ready v3

## Root/typecheck fixes included
- `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` are at repository root.
- GitHub Actions has a root-file guard before `npm ci`/typecheck.
- `CommentsPage.vue` and `HistoryPage.vue` map `draft` badge tone to `neutral` (supported by `AppBadge`).
- Regression test protects this AppBadge tone contract.

## Local packaging verification
- `npm test`: run on source before packaging; all static tests passed.
- ZIP is re-extracted and tested again before handoff.
- `npm run typecheck` cannot run in the packaging container without installed dependencies (`vue-tsc` unavailable); GitHub Actions remains the authoritative typecheck/build gate.
