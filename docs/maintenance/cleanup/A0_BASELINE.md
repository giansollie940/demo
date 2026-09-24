# MAINT-CLEANUP-001 — A0 Baseline

## Canonical sources

- GitHub deploy repository: `giansollie940/demo`
- Canonical branch: `main`
- Baseline main commit: `0e2281ae595597f32661977168f341f696e437d7` (`demo 63`)
- Full maintenance/development source package: `SO-TU-HOC-ADMIN-LIVE-V2-FULL(1).zip`
- Baseline full package integrity: **PASS — 891 source files, flat root, every SHA-256 verified** using `scripts/build-feat-next-package.py --verify-zip`.

The GitHub repository is intentionally the minimal GitHub Pages deploy subset. `scripts/package-github-pages-minimal.mjs` explicitly allowlists root build files plus `.github/workflows/deploy-pages.yml`, `src/`, and `public/`, while excluding tests, database, Supabase, docs, and maintenance scripts. Shared application files inspected between the full package and GitHub main matched their Git blob content. Therefore this is **not** a canonical-source conflict: the full package is the maintenance source and GitHub main is the generated deploy subset.

## Environment

- Project-required Node version from `.nvmrc`: `24`
- Available local Node version in this execution environment: `v22.16.0`
- npm registry access in this execution environment: unavailable (`EAI_AGAIN` / DNS resolution failure)
- Production deployment: **NOT AUTHORIZED**
- Database / RLS / RPC change: **NOT AUTHORIZED**

## Baseline inventory

| Metric | Baseline |
|---|---:|
| Total files | 892 |
| `src/` files | 153 |
| `src/` text lines | 15,499 |
| Test files | 77 |
| Test text lines | 9,804 |
| `scripts/` files | 20 |
| `docs/` files | 510 |
| `database/` files | 39 |
| `supabase/` files | 28 |
| Runtime dependencies | 7 |
| Dev dependencies | 8 |
| `package-lock.json` size | 102,951 bytes |
| Total source bytes | 17,692,612 bytes |

## Protected backend fingerprints

The cleanup baseline and cleaned tree are required to remain identical for these protected backend areas:

- `database/` tree SHA-256: `b1568da3f4dd25eb58b0be29c72e9fd0e42f22ebab820661808d384dacdccd77`
- `supabase/` tree SHA-256: `e085c03bd8e233bc0e9eb7ef23c2dbd72b196fc639e39c42b32858839973a536`
- `public/supabase-service.js` SHA-256: `ab8d46455faf5f295515f42742dd793ccd3ade32f1b5db09e286c11a428bc72e`

These values are rechecked in the cleanup report.
