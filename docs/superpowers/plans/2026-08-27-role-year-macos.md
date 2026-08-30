# Role, School Year, and macOS Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate Admin/Teacher/Monitor/Student capabilities, make school-year data and calendar management correct, preserve teacher class-week automation/manual overrides, and add macOS-style sidebar magnification.

**Architecture:** Admin owns global structures (`school_years`, `weeks`, classes, teachers, permissions). Teachers own class-level operations (`class_weeks`, deadlines, schedule, approvals, statistics), while learners remain personal/support roles. `class_weeks.manual_status` is nullable: null means automatic lifecycle; `open`/`locked` means teacher override. Global week dates remain Admin-only. Sidebar navigation and router permissions mirror these boundaries.

**Tech Stack:** Vue 3, Pinia, Vue Router, Supabase/PostgreSQL, Supabase Edge Functions, Node test runner.

**Spec:** Approved role matrix and follow-up requirements in the current conversation.

## Global Constraints
- Admin must not receive teacher operational routes or class settings.
- Teacher must not create/activate school years or rename/create classes.
- Teacher retains class deadline, schedule, and manual open/close controls.
- Automatic lifecycle closes after the last self-study session of the current week when no manual override exists.
- Admin can edit global week start/end dates inside the Năm học tab.
- Existing Year + Bubble Menu and Edge ZIP import-layout hotfix must remain intact.
- Reduced-motion must disable sidebar magnification/rotation.

---

### Task 1: Role navigation and router boundaries
- [ ] Add failing role-contract tests.
- [ ] Restrict Admin to `/admin` system administration and redirect Admin root/dashboard to `/admin`.
- [ ] Restrict teacher operational routes to teacher only; keep learner routes unchanged.
- [ ] Verify role tests.

### Task 2: School-year directory correctness and Admin calendar editing
- [ ] Add failing tests for merging legacy school years and Edge directory years.
- [ ] Include global `weeks` in Admin directory response.
- [ ] Add root-admin `update_school_year_week` Edge action and UI controls in Năm học tab.
- [ ] Verify Admin cannot delete years and teacher cannot access these actions.

### Task 3: Teacher class-week manual override + automatic lifecycle
- [ ] Add failing model/source tests for nullable `manual_status`.
- [ ] Add migration column and server helper that honors manual `open/locked`, otherwise computes automatic status from final class self-study session.
- [ ] Map manual status through legacy bridge and add teacher controls: Tự động / Mở thủ công / Đóng thủ công.
- [ ] Remove global calendar rebase UI from teacher Weeks page.
- [ ] Verify registration-open server helper uses effective class-week status.

### Task 4: Admin overview year count and role-specific topbar/settings
- [ ] Add failing tests for active year fallback/merge and role-specific controls.
- [ ] Merge Admin directory school years with context school years by ID.
- [ ] Admin topbar: year + theme + profile only. Teacher: year + class + week. Learners: fixed year + week as appropriate.
- [ ] Teacher settings render class/year as read-only metadata, never editable inputs.

### Task 5: macOS Dock sidebar interaction
- [ ] Add failing tests for magnification classes and neighbor response.
- [ ] Add pointer-driven active index, hovered item scale, neighbor scale, elevation and spring easing.
- [ ] Preserve short conic-gradient spin and reduced-motion fallback.

### Task 6: Release verification
- [ ] Run all Node regression tests.
- [ ] Run frontend/Edge syntax transpile checks.
- [ ] Run release verifier and Edge ZIP import-resolution checks.
- [ ] Package ROOT-FLAT full release plus frontend patch and document DB/Edge/frontend deployment order.
