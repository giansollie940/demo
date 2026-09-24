# V8.7.1 School Year Selector + Bubble Menu Design

## Goal
Add first-class school-year management and selection without duplicating class identity in the topbar, and restyle the flat sidebar as compact bubble items with a short rotating gradient ring on hover.

## Approved UX
- Remove duplicated class `7A9` from the left side of the topbar.
- Left topbar becomes a school-year bubble. Admin can choose every school year. Teachers can choose years available through their permitted classes. Students/monitors see their year but do not freely switch years.
- Right topbar keeps Class, Week, Theme and Profile bubbles.
- Selecting a school year reloads the class list for that year, chooses a valid class, loads that year's weeks, and refreshes pages from the selected context.
- Admin page gains `Năm học` before `Lớp học`.
- Admin can create a school year with name, first-week start date, end date, and optional activation. Creating a year also creates its base week rows.
- Admin can activate an existing year. Only one school year is active after the operation.
- Do not hard-delete school years from the UI.
- Sidebar stays a flat menu (no group headers), but each item becomes a soft bubble. Collapsed mode is a rail of circular icon bubbles.
- Hover uses a short conic-gradient ring animation around the icon bubble; active items do not spin continuously. Reduced-motion disables the spin.

## Data and Backend
- `LegacyState` adds `availableSchoolYears` and `selectedSchoolYearId`; `activeSchoolYearId` remains the globally active year for compatibility.
- `loadState(preferredClassId, preferredSchoolYearId)` resolves the selected year separately from the globally active year.
- Admin management response includes school years.
- New database RPCs perform school-year creation and activation atomically:
  - `public.admin_create_school_year(uuid,text,date,date,boolean) returns uuid`
  - `public.admin_set_active_school_year(uuid,uuid) returns void`
- Creation generates base weeks from week 1 start date through the school-year end date, using Monday-Friday-style week end (`start + 4 days`, capped at year end), `per_session_20`, and lifecycle status based on current date.
- Edge `admin-manage-classes` remains the only browser-facing admin write surface and calls these RPCs after root-admin authorization.

## Safety and Compatibility
- Existing class, AI, registration, reminder and historical-week behavior must remain unchanged.
- No service-role or secret values in browser source.
- New SQL is appended to both compatible-baseline install and current upgrade paths and verified read-only by the existing verifier conventions.
- No school-year delete action is exposed.
