# Cleanup Test Report

## Post-cleanup tests actually executed

### Cleanup-specific static guard

```text
node --test tests/maint-cleanup.test.mjs
PASS — 4/4
```

Checks:

- dead components absent
- unused icon import absent
- exact duplicate helpers consolidated through shared modules
- public import paths for `formatBytes` preserved
- dead exports/functions removed
- `@vue/test-utils` removed
- minimal Pages packager now includes `.gitignore`

### VERIFY-002 static suite

```text
node --test tests/verify-002/*.test.mjs
PASS — 5/5
```

This is static verification only. It does **not** close V-011, V-012, or V-013.

### Targeted existing regression tests

```text
node --test tests/immediate-watcher-tdz.test.mjs tests/v9-banner-artwork-regression.test.mjs
PASS — 5/5
```

### Shared helper behavior check

Executed directly with Node type stripping:

- `formatBytes(null)` → `—`
- `formatBytes(0)` → `0 B`
- `formatBytes(1024)` → `1.0 KB`
- `formatBytes(1536)` → `1.5 KB`
- `addDaysISO('2026-09-23', 1)` → `2026-09-24`

Result: **PASS**.

## Verification unavailable in this execution environment

The project requires Node 24; the available local runtime is Node 22.16.0. More importantly, npm registry DNS/network access failed with `EAI_AGAIN`, so a clean `npm ci` could not complete. A throwaway attempt left only partial dependencies; it was discarded and is not part of the cleaned package.

Therefore the following are **NOT CLAIMED AS POST-CLEANUP PASS**:

- `npm ci`
- `npm run typecheck`
- `npm run build`
- `npm run test`
- `npm run test:unit`
- `npm run verify:quality`
- `npm run verify:release`
- full FEAT-010 integrated regression/mutation run

Historical pre-cleanup reports are not substituted for a fresh post-cleanup run.

## Required continuation before merge/release

Run the commands above in a Node 24 environment with npm dependencies available. If any fail, treat the cleanup as requiring changes before merge.

## Minimal GitHub Pages source-package verification

```text
node scripts/package-github-pages-minimal.mjs <temp-output>
PASS — 174 deploy files packaged
```

Verified:

- `.gitignore` is included;
- `tests/`, `database/`, `supabase/`, `docs/`, and `scripts/` do not leak into the minimal deploy package;
- `public/config.js` is absent and remains runtime-generated from GitHub Secrets.

## Full source package integrity

The cleaned source was packaged with the repository's canonical source-package builder and then verified again from the resulting ZIP:

```text
python3 scripts/build-feat-next-package.py --output <cleanup-full.zip>
PASS — 910 source files

python3 scripts/build-feat-next-package.py --verify-zip <cleanup-full.zip>
PASS — 910 source files; flat root; every SHA-256 verified
```

`SOURCE_MANIFEST.json` and `SHA256SUMS.txt` are both regenerated from the cleaned tree and agree with the packaged bytes.
