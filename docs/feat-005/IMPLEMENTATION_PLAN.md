# FEAT-005 implementation plan

Status: IMPLEMENTING. Effort: high (user override). No production changes, push or merge.

Source: supplied BUG-002-BANNER-REVIEW-V2.zip, extracted into tu-hoc-bug-002. The initial workspace had no docs/feat-005, source checkout or commits. The two supplied SYSTEM_ACTOR_RESOLVED documents are copied here byte-for-byte as governing specifications. No earlier FEAT-005 draft was found.

1. Inspect baseline 05–08 migrations, live schema and RPC definitions read-only; record differences and hashes. Reuse existing class lock, author validation, AI/duplicate pipeline and notification store.
2. Write executable database tests on isolated PGlite PostgreSQL. Prove ownership failures against baseline before implementation.
3. Add migration 09: restricted report/correction/revision audit storage, explicit user/system attribution, two-round state transitions, author-only editing and scoped Teacher moderation. Preserve existing tombstones. Use the existing server maintenance entry point for timeout processing.
4. Integrate role-specific Vue UI, correction drafts and resubmission, Teacher report statistics/history and revision decisions, withdrawal/emergency removal and Trash attribution. Preserve class and role cache isolation.
5. Verify migrated populated fixtures, direct API denial, report secrecy, private revisions, deadlines/stale transitions, duplicate/AI gates, hard-delete purge and retained metadata; run existing regressions and browser checks.
6. Self-review, fix and re-test. Produce Implementation Report, AC mapping, source diff/hashes and evidence for Sol independent review. Any unexecuted test is NOT RUN. Business-rule changes require BLOCKED.

No release authorization is requested or implied. Independent review and production validation remain separate from this implementation.
