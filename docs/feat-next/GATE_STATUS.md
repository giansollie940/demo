# Gate Status — FEAT-011/012/009 package correction

Date: 2026-09-23. These are observations from this workspace, not a production approval.

| Gate | Result | Evidence / missing prerequisite |
|---|---|---|
| Package root and integrity | PASS after RC3 repackaging | Flat `package.json` at ZIP root. Both `SOURCE_MANIFEST.json` and legacy `SHA256SUMS.txt` are regenerated from the same packaged bytes; verification checks both inventories and individual SHA-256 values. The legacy file excludes itself and `SOURCE_MANIFEST.json` to avoid a checksum cycle. |
| FEAT-012 new behavior | PASS in component unit tests | `tests/feat-008/dashboard.test.ts` checks initial load; 45-second visible refresh; hidden tab pause; focus refresh; no automatic provider measurement; no duplicate in-flight load; retaining protection state during a failed fetch; recovery at the next tick; no poll after logout/unmount; immediate refetch after cleanup. |
| Authenticated browser UI | OPEN / NOT RUN | Opening the locally served integrated bundle from the cloud browser returned `net::ERR_BLOCKED_BY_CLIENT` for `127.0.0.1:4173`. A browser-accessible staging URL carrying this exact package and authenticated Teacher/Admin test sessions is needed. |
| V-011 Device Policy × registration | OPEN / NOT RUN | No disposable PostgreSQL/Supabase instance with actual migrations and two independent sessions was available. One connected project named `tu-hoc` was visible; this gate was not attempted against it. Requires both transaction orders and raw lock/final-state evidence. |
| V-012 Device Policy × homework_archive('begin') | OPEN / NOT RUN | Same staging database prerequisite. Requires actual business RPCs, archive freeze result, and fixture cleanup evidence. |
| V-013 two-browser realtime | OPEN / NOT RUN | Needs the staging URL, two authenticated sessions and a cross-class negative control. Source tests and publication membership are insufficient. |

No production SQL mutation, policy change, deployment, or release was performed. The prior RC9 mutation report remains prior evidence only.
