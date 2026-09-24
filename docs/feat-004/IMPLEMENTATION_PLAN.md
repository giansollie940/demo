# FEAT-004 implementation plan
Effort HIGH, FINAL grade-resolved spec. No production deployment.
1. AC-412/413/420/421–424: transactional preflight, explicit UUID mapping, immutable grade, exact catalog metadata mapping preserving IDs.
2. AC-405–409/414/415/417: catalog + class-subject RPC, private legacy dispatcher, role/class checks and default-deny tables. Test forged payloads, inactive catalogs and unassignment.
3. AC-401–404/410/416/418: scoped Admin oversight queries, preserve tombstone/hard-delete and per-class ranking via existing implementation.
4. AC-411: Teacher context from backend assignment; clear forms and guard responses on scope changes. Admin filters and catalog UI; mandatory grade in existing create-class Edge/UI.
5. AC-419: regression suites, typecheck/build, self-review and retest. Record actual evidence and NOT RUN limits; package source/spec/report for independent review.
