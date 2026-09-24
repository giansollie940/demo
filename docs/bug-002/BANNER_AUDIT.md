# BUG-002 — Banner audit

Baseline: FEAT-004-MULTICLASS-REVIEW.zip, source feat-004-work.
Audit: all src/**/*.vue via Vue template AST; manual review of page headers and shared/local CSS.

| Page/header | Before | After |
|---|---|---|
| HomeworkAdminOversight | Bare header, no banner background | page-banner + PageBannerArt + PageArtwork name="homework" in page-head-lead; original text/filters/tabs retained |
| SchedulePage | Layout only, explicitly excluded from shared CSS | page-banner + PageBannerArt lilac; existing controls/layout retained |
| SettingsPage personal-header | Clipping only, missing padding/border/background/shadow | page-banner; existing artwork/content retained |
| SettingsPage legacy settings header | Full treatment through manual selector | page-banner; violet/coral palette retained |
| RegistrationPage | Shared + local mint background | page-banner; local mint background retained |
| HistoryPage | Shared mint/peach | page-banner; mint/peach retained |
| CommentsPage | Shared mint/peach | page-banner; mint/peach retained |
| ApprovalPage | Shared peach/violet | page-banner; palette retained |
| TrackingPage | Shared peach/violet | page-banner; palette retained |
| WeeksPage | Shared peach/violet | page-banner; palette retained |
| StudentsPage | Shared sun/peach | page-banner; palette retained |
| StatisticsPage | Shared sun/peach | page-banner; palette retained |
| AdminPage | Shared violet/coral | page-banner; palette retained |
| IssuesPage | Deliberate local warning treatment, shared clipping | Local design retained; positioning/clipping declared locally |
| HomeworkPage operational board | Deliberate local sun banner | Unchanged; local regression assertion |
| DashboardPage | Deliberate two-column hero | Unchanged; local regression assertion |

Excluded intentionally: Login brand-row (authentication branding, not signed-in page banner); DashboardWithPeoplePage delegates rendering; section/card headers (issue rows, tracking details, dialogs) are not page banners. No styling changes to these.

Source-level findings: 3 incomplete banner treatments repaired. Existing shared banner pages now opt in at markup; manual selector lists only select established palettes, not whether a background exists. Local designs remain local and are checked for explicit background/padding/rounding/clipping.

Regression guard: tests/banner-pattern.test.mjs scans all Vue files, not a fixed page list. Artwork, page-header, and h1 inside header require shared treatment or an explicit reviewed local exception. Negative fixtures prove new unstyled headers are rejected. New local exceptions require CSS assertions. This guard is not a browser rendering test and does not detect arbitrary computed visual defects.

Visual audit: NOT RUN because Cloud Browser cannot open the local development server (ERR_BLOCKED_BY_CLIENT). In particular, pixel output, contrast, mobile/tablet wrapping and all UI interactions remain unverified.
