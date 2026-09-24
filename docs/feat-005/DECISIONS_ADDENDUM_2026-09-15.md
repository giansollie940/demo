# FEAT-005 decision addendum — duplicate replacement during correction

Status: ACTIVE. Approved directly by Product Owner in this implementation task on 2026-09-15 (Asia/Ho_Chi_Minh).

The original SYSTEM_ACTOR_RESOLVED documents remain unchanged. This addendum resolves the newly discovered interaction between duplicate replacement and an open correction on the replacement target.

## DEC-FEAT005-REPLACEMENT-GUARD

Product Owner instruction, verbatim:

> Chặn “Thay bài cũ” khi A có correction đang mở; GV phải xử lý correction trước.

When Teacher reviews duplicate B and selects replace_existing targeting A, reject the action while A has an open correction (awaiting_author or awaiting_teacher). Preserve both notices and the correction without mutation. The UI explains the block. Once A's correction has been resolved, the existing duplicate validation and stale-result rules remain authoritative; this guard does not itself authorize replacement or bypass re-check.

This decision adds no third correction round, does not change reporter confidentiality, and does not invent a new correction terminal outcome. It preserves correction deadlines and prevents a notice with an open correction from becoming replaced via this action.

Additional acceptance checks:

- Both open correction states block direct API replacement atomically.
- A denied replacement does not close, reset or extend the target correction.
- keep_existing and keep_both retain their existing rules.
- UI disables Thay bài cũ with an explanation when the target has an open correction.
- The original reproduction remains recorded in evidence/replacement-correction-conflict.json; automated regression proves the approved fix.

Original blocker: RESOLVED by Product Owner. Release authorization remains unchanged: no production migration/deployment, push or merge.
