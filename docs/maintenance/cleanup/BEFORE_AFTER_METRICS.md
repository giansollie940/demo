# Before / After Metrics

Metrics below describe the code cleanup before adding maintenance-report documentation and regenerating package manifests.

| Metric | Before | After | Delta |
|---|---:|---:|---:|
| Total files | 892 | 894 | +2 |
| `src/` files | 153 | 153 | 0 |
| `src/` text lines | 15,499 | 15,393 | -106 |
| Test files | 77 | 78 | +1 |
| Test text lines | 9,804 | 9,848 | +44 |
| Runtime dependencies | 7 | 7 | 0 |
| Dev dependencies | 8 | 7 | -1 |
| `package-lock.json` | 102,951 B | 80,019 B | -22,932 B |
| Source bytes | 17,692,612 | 17,664,877 | -27,735 B |

Code-module reachability audit after cleanup found **0 remaining application source modules with no incoming source reference** (entry/declaration semantics accounted for).

A static unused-import audit after cleanup found **0 candidates**.

A repository-wide scan for exported symbols appearing only at their definition found **0 remaining high-confidence candidates** after the cleanup removals.

Build-bundle size is **NOT MEASURED** because this execution environment could not fetch/install the npm dependency tree.
