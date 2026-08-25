# V8.6.0 GitHub CI test fix v4

Root cause: two static tests treated optional deployment documentation as required runtime test inputs. GitHub Actions correctly requires only source/build configuration files, so a repository missing the optional Markdown guides failed `npm test` with ENOENT even though the application source and TypeScript check were unaffected.

Fix:
- `tests/github-deploy-source.test.mjs` now verifies the required Supabase secrets directly in `.github/workflows/deploy-pages.yml`.
- `tests/migration-completion-source.test.mjs` now verifies the CP8 source checkpoint and verification scripts directly in `package.json`.
- Optional Markdown documentation remains included in the ZIP but is no longer required for CI success.
