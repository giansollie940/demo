# Dependency Audit

## Runtime dependencies

No runtime dependency was removed or upgraded.

Existing runtime dependencies remain:

- `@tanstack/vue-query`
- `@vueuse/core`
- `fflate`
- `lucide-vue-next`
- `pinia`
- `vue`
- `vue-router`

## Dev dependencies

Removed:

- `@vue/test-utils`

Evidence:

- no `@vue/test-utils` string/import reference in `src/`
- no reference in `tests/`
- no reference in `scripts/`
- no build/package script references it

The lockfile was regenerated with npm's offline lockfile mode. Direct devDependency count changed from **8 → 7** and `package-lock.json` changed from **102,951 → 80,019 bytes**.

## Version policy

No dependency version was intentionally upgraded as part of cleanup.
