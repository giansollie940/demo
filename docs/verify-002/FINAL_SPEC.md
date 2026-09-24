# FINAL SPEC — VERIFY-002-FINAL

STATUS: FINAL
ASTRA_EFFORT: MEDIUM

## Objective

Close the remaining VERIFY-002 runtime/release evidence against current main without changing application business rules.

## Scope

1. Re-run the full FEAT-010 integrated verification suite on Node from .nvmrc.
2. Re-run the complete FEAT-010 mutation suite.
3. Re-run static/unit/typecheck/build gates.
4. Run a real Chromium smoke against the production-build artifact.
5. Re-check production read-only Realtime/database prerequisites.
6. Close authenticated role/browser gates only with real evidence; do not infer PASS from source or in-memory fixtures.

## Required gates

- Full integrated verifier: PASS
- Full mutation gate: PASS
- Static tests: PASS
- Unit tests: PASS
- Typecheck: PASS
- Production Pages build: PASS
- Browser smoke: root renders non-empty app/login, no page errors, no failed critical requests
- Production database prerequisites: PASS
- device_use_policy_signals remains in supabase_realtime
- device_use_slot_key search_path remains pg_catalog, public
- RC9 freeze guard/triggers remain installed

## Authenticated browser/UAT

Required evidence targets:

- Student core navigation
- Teacher Device Policy and relevant admin/teacher controls
- Admin storage/device-policy surfaces
- two independent authenticated browser sessions receiving the expected Realtime invalidation

If reusable non-production test credentials are not available in the execution environment, these gates remain BLOCKED and must not be marked PASS.

Do not create/reset production users or passwords solely to satisfy UAT.

## Safety

No database mutation.
No auth-user mutation.
No migration.
No production data mutation.
No deploy caused by this verification branch.
No business-rule change.

## Result

Final review can be APPROVED only if all mandatory gates are evidenced.
If authenticated runtime evidence cannot be executed safely, result is BLOCKED with the exact missing prerequisite.
