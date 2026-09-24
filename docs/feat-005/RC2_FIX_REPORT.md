# FEAT-005 RC2 — Fix report

Status: READY_FOR_REVIEW. Date: 2026-09-15. Resolves review findings R-001 and R-002 from RC1.

## Changes

**R-001 — resolved.** The Teacher correction panel now compares the current published notice and the submitted revision side by side, stacking on mobile. Each side shows subject, English group, deadline, title and content. Subject/group names come only from the current class payload. Inactive entries remain usable for history; null group explicitly says Không áp dụng. Missing references have an explicit fallback instead of borrowing another name. Closed workflows label the left side Bản hiện tại so it is not misrepresented as an immutable historical snapshot.

**R-002 — resolved.** The editor uses native dialog/showModal, making the background inert. Focus enters the editor on opening, Tab/Shift+Tab wrap inside, Escape/Close return focus to the connected trigger, and focus is restored inside the editor after asynchronous draft-save completion. The existing form fields, submission validation and busy-state rules are preserved.

Application changes relative to RC1 are limited to:

- src/components/homework/HomeworkCorrectionPanel.vue.
- src/pages/HomeworkPage.vue.

Tests updated/added:

- tests/feat-005/ui.test.ts: two regression cases for old/new subject/group, inactive catalog entries, null groups and missing references.
- tests/feat-005/rc2-browser.mjs: real-browser focus entry, keyboard wrapping, Escape/Close return, draft save, mobile editor, subject/group comparison and approval through the existing local AI pipeline.

No migration, permission, ownership, reporter visibility, correction-round, timer, duplicate/AI, System attribution or hard-delete rule changed. No shared theme, font, shell, banner, sidebar/topbar or unrelated page changed.

## TDD and verification

- Before fix: the two new UI tests failed; browser focus assertion failed. See evidence/rc2/tdd-before.txt and browser-before.json.
- After fix: full UI regression **64 PASS**, including the two new cases. Typecheck and build **PASS**.
- RC2 browser: **PASS** for both findings; console/page errors empty. Desktop 1280px and mobile 390px comparison verified without horizontal overflow. Approval actually publishes the validated subject/group revision in the isolated fixture.
- Original browser workflow: rerun after the dialog change; see evidence/browser.json.
- Existing database/AI/static evidence is retained: 13 FEAT-005 DB, 43 legacy DB/AI, 6 FEAT-004 DB and 8 static tests. Those files and application behavior were unchanged by this UI fix and were already revalidated directly from RC1 during review.
- Combined current automated test evidence: **134 PASS** (64 UI + 70 database/AI/static).

During verification, the browser test selector was corrected to target the combobox's accessible role/name. Draft-save focus is checked after the save and reload finish, rather than during an in-flight request. The first pre-fix failure JSON is retained.

## Self-review

- Published and submitted labels are not confused; the current class's complete subject/group data is passed into the panel.
- No new global CSS or third-party package was introduced.
- Native dialog uses the prior editor dimensions/colors, with only modal/backdrop adaptation.
- Keyboard tests run in real Chrome, not only the virtual Vue renderer.
- Source/build are repackaged as RC2; RC1 remains intact for comparison.

## Remaining verification boundaries

NOT RUN: native PostgreSQL simultaneous sessions, live pg_cron worker, staging/production migration, deployed Auth/PostgREST/Deno Edge/Groq and Sol independent review. These are unchanged from the original Implementation Report. No production migration, deployment, push or merge occurred.
