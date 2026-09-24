# FINAL SPEC — REPOSITORY & CODEBASE CLEANUP

**Epic:** `MAINT-CLEANUP-001`  
**Spec Owner:** GPT-5.6 Sol High  
**Implementation:** GPT-6 Astra  
**Overall status:** `FINAL`  
**Production release:** `NOT AUTHORIZED`

Thực hiện theo thứ tự:

```text
MAINT-REPO-CLEANUP-001
        ↓
verification
        ↓
MAINT-CODE-CLEANUP-001
        ↓
full regression
        ↓
ASTRA SELF REVIEW
        ↓
SOL INDEPENDENT REVIEW
```

---

# TASK A — `MAINT-REPO-CLEANUP-001`

**Title:** Repository Hygiene & Source Consolidation  
**STATUS:** `FINAL`  
**ASTRA_EFFORT:** `MEDIUM`

## 1. Objective

Làm cho repository:

```text
dễ hiểu
dễ build
dễ deploy
không chứa rác
không chứa artifact không cần thiết
không có nhiều nguồn sự thật cho cùng một file
```

nhưng **không thay đổi code behavior**.

Task này tập trung repository/file structure. Không refactor business logic sâu.

## 2. Baseline bắt buộc

Trước khi xóa hoặc di chuyển bất kỳ file nào, Astra phải xác định chính xác:

```text
Repository:
giansollie940/demo

Canonical branch:
main

Baseline commit SHA:
<ghi SHA thực tế>

Current package version:
<ghi thực tế>

Node version:
đọc từ .nvmrc

Source tree:
ghi inventory thực tế
```

Astra phải kiểm tra cả:

```text
GitHub main branch
+
FULL integrated source package gần nhất
```

Nếu hai nguồn **không giống nhau** về các file quan trọng như:

```text
src/
public/
database/
supabase/
tests/
scripts/
docs/
package.json
```

thì **không tự chọn một bên**.

Phải báo:

```text
BLOCKED — CANONICAL SOURCE CONFLICT
```

và liệt kê khác biệt.

## 3. Phase A0 — Safety Snapshot

Trước cleanup:

```bash
git status
git branch -a
git log -1 --oneline
node --version
npm --version
```

Ghi vào:

```text
docs/maintenance/cleanup/A0_BASELINE.md
```

Phải ghi:

```text
commit SHA
branch
Node
npm
package version
file count
src file count
tests count
migration count
Edge Function count
```

Không cleanup trước bước này.

## 4. Phase A1 — Branch Audit

Astra phải chia branch thành:

```text
KEEP
SAFE_TO_DELETE
REVIEW_REQUIRED
```

Không được dựa chỉ vào tuổi branch.

Phải compare:

```text
branch → main
```

Nếu branch đã hoàn toàn nằm trong `main`:

```text
SAFE_TO_DELETE
```

Nếu còn commit không có trong main:

```text
REVIEW_REQUIRED
```

Theo audit hiện tại, các branch từng được xác định là fully contained gồm:

```text
feat/animated-gif-avatars-r613
fix/avatar-rpc-anon-r6131
fix/collapsed-sidebar-centering-r615
fix/profile-entrypoints-r612
```

Các branch từng còn divergent:

```text
feat/avatar-visibility-r614
fix/avatar-gif-infinite-loop
fix/personal-settings-r611
```

Astra phải **kiểm lại ở thời điểm implementation**, không dùng kết quả cũ như bằng chứng cuối cùng.

### BR-A01
Không xóa branch có commit chưa nằm trong `main`.

### BR-A02
Không force-delete branch chỉ để repository nhìn gọn hơn.

## 5. Phase A2 — Root Repository Cleanup

Astra phải audit root.

Các file hợp lệ ở root thường gồm:

```text
package.json
package-lock.json
index.html
vite.config.ts
tsconfig*.json
.nvmrc
.gitignore
README.md
.github/
```

Không áp dụng danh sách này máy móc; file có lý do hợp lệ vẫn được giữ.

Astra phải tìm:

```text
*.zip
*.bak
*.tmp
*.old
*.log
temp/
dist/
coverage/
node_modules/
backup files
duplicate SQL
old handoff
generated manifest
local evidence
```

và phân loại.

## 6. `.gitignore`

Nếu thiếu, Astra được phép tạo.

Tối thiểu xem xét:

```gitignore
node_modules/
dist/
coverage/
.vite/
*.log
.env
.env.*
!.env.example
.DS_Store
Thumbs.db
playwright-report/
test-results/
```

Không ignore file thực sự cần commit.

## 7. Secrets

Astra phải scan repository tìm:

```text
SUPABASE_SERVICE_ROLE
service_role
R2 secret
Cloudflare secret
MEDIA_MAINTENANCE_SECRET
password
private token
JWT secret
API private key
```

### BR-A03
Không được đưa secret thật vào report.

Nếu phát hiện:

```text
path
type of credential
severity
```

và redact giá trị.

Nếu secret production đã commit:

```text
BLOCKED_SECURITY
```

để người dùng rotate credential.

## 8. Generated files

Không commit các file có thể tái tạo dễ dàng trừ khi architecture hiện tại yêu cầu.

Ví dụ:

```text
dist/
node_modules/
coverage/
temporary screenshots
playwright-report/
local build metadata
```

## 9. Documentation Cleanup

Không xóa tài liệu lịch sử quan trọng.

Phân loại:

```text
ACTIVE
RELEASE_EVIDENCE
HISTORICAL
SUPERSEDED
TEMPORARY
```

File cũ nhưng cần truy vết nên chuyển:

```text
docs/archive/
```

thay vì delete.

## 10. Protected Evidence

Không được tự ý xóa:

```text
VERIFY-002 evidence
FEAT-010 RC9 frozen evidence
mutation evidence
security verification
production verification
release gate evidence
```

## 11. Migration Protection

### BR-A04
**Không xóa migration đã từng chạy production.**

Không:

```text
rename migration
renumber migration
merge migration history
rewrite migration file
```

nếu đã liên quan production.

### BR-A05
Không chạy lại các migration lịch sử chỉ vì cleanup.

## 12. Edge Functions

Mỗi Edge Function phải được phân loại:

```text
ACTIVE_DEPLOYED
ACTIVE_NOT_DEPLOYED
LEGACY
UNKNOWN
```

Không xóa `UNKNOWN`.

Phải tìm caller từ:

```text
frontend
scripts
database
cron
Edge Function
deployment docs
```

## 13. Package Scripts

Astra phải audit nhưng **không xóa script chỉ vì không dùng hằng ngày**.

Script liên quan release/evidence vẫn phải giữ.

## 14. Repository Cleanup Output

Tạo:

```text
docs/maintenance/cleanup/
├── A0_BASELINE.md
├── REPO_INVENTORY.md
├── BRANCH_AUDIT.md
├── FILE_DISPOSITION.md
├── SECURITY_SCAN.md
└── REPO_CLEANUP_REPORT.md
```

`FILE_DISPOSITION.md` phải ghi từng candidate:

| Path | Action | Reason | Evidence |
|---|---|---|---|
| file | KEEP | ... | ... |
| file | DELETE | ... | caller scan |
| file | MOVE | ... | archive |
| file | REVIEW | ... | uncertain |

Không được có hàng `DELETE` chỉ với lý do:

```text
looks unused
old
probably unnecessary
```

---

# TASK B — `MAINT-CODE-CLEANUP-001`

**Title:** Full Code Cleanup & Behavior-Preserving Refactor  
**STATUS:** `FINAL`  
**ASTRA_EFFORT:** `MEDIUM`

## 15. Core Principle

Sau cleanup:

```text
Behavior before == Behavior after
```

Ngoại trừ:

```text
dead code removed
duplicates consolidated
structure clearer
types improved
maintenance improved
```

Không thêm tính năng.

Không đổi business rule.

Không redesign giao diện.

## 16. Phase B0 — Baseline Verification

Trước code change phải chạy các command thực sự tồn tại trong `package.json`.

Hiện baseline có:

```bash
npm ci

npm run typecheck
npm run build
npm run test
npm run test:unit
npm run verify:quality
npm run verify:release
```

Feature suites phù hợp phải chạy riêng.

Với FEAT-010:

```bash
node scripts/verify-feat010.mjs
```

nếu script tồn tại trong canonical source.

VERIFY-002:

```bash
node --test tests/verify-002/*.test.mjs
```

nếu canonical source có suite này.

Nếu repo GitHub hiện tại thiếu `tests/` hoặc `scripts/` nhưng FULL source có chúng:

```text
BLOCKED — SOURCE CONSOLIDATION REQUIRED
```

không được bỏ test chỉ vì GitHub branch không chứa test.

## 17. Code Inventory

Tạo:

```text
CODE_CLEANUP_INVENTORY.md
```

Mỗi code unit phải phân loại:

```text
KEEP
DELETE_DEAD
CONSOLIDATE
MOVE
REFACTOR
DEFER
BLOCKED
```

Audit:

```text
src/
public/
scripts/
Edge Functions
tests/
```

## 18. Dead Code Detection

Astra phải tìm:

```text
unused component
unused composable
unused function
unused export
unused constant
unused type
unused route
unused CSS
unused asset
unused compatibility wrapper
unused API wrapper
```

Không được chỉ dùng grep.

Phải kiểm:

```text
static import
dynamic import
Vue templates
router
window global
Supabase RPC names
Edge Function names
tests
scripts
string-based references
```

### BR-B01
Chỉ xóa khi có bằng chứng không còn caller.

Nếu chưa chắc:

```text
DEFER
```

## 19. Vue Page Cleanup

Các page nên tập trung vào:

```text
composition
layout
orchestration
```

Astra audit đặc biệt:

```text
AdminPage.vue
HomeworkPage.vue
SchedulePage.vue
DevicePolicyPage.vue
SettingsPage.vue
RegistrationPage.vue
```

Không bắt buộc tách chỉ vì file dài.

Chỉ tách khi có **responsibility boundary thực sự**.

## 20. Component Cleanup

Component nên:

```text
nhận props
emit event
render UI
delegate business logic
```

Không duplicate logic giữa Teacher/Admin nếu rule giống nhau.

### BR-B02
Không gộp Admin và Teacher chỉ vì UI giống.

## 21. Feature Structure

Ưu tiên cấu trúc:

```text
src/features/<feature>/
    api.ts
    model.ts
    types.ts
    validation.ts
    helpers.ts
```

Không bắt buộc mọi feature phải có tất cả file này.

Chỉ tạo file khi có responsibility thực sự.

## 22. Services

`src/services/` dùng cho:

```text
backend/client integration
shared external services
generic infrastructure
```

Không đặt UI-specific logic vào service.

## 23. Stores

Pinia store nên chủ yếu quản lý:

```text
state
derived state
orchestration
```

## 24. `public/supabase-service.js`

Đây là **HIGH-RISK LEGACY AREA**.

Astra phải audit nhưng task này **không cho phép rewrite toàn bộ**.

Được phép:

```text
remove proven dead helper
remove duplicate helper
extract pure utility if safe
rename internal variable locally
improve comments
reduce repeated mapping
```

Không được:

```text
change auth storage
change login semantics
change RPC names
change query filters
change RLS assumptions
change Supabase table contracts
change registration synchronization semantics
change Realtime behavior
rewrite global service architecture
```

Nếu muốn chuyển file này sang TypeScript/module:

```text
DEFER_TO_ARCH_TASK
```

## 25. API Cleanup

Tìm duplicate:

```text
Supabase queries
Edge Function invoke
RPC wrapper
storage call
error parser
class lookup
week lookup
profile lookup
```

Không tạo abstraction chỉ để giảm số dòng.

## 26. Error Handling

Không được có pattern:

```ts
try {
  ...
} catch {
}
```

đối với lỗi quan trọng nếu không có lý do.

Các lỗi sau không được swallow:

```text
authentication
authorization
RLS
database write
archive/purge
storage protection
device policy
registration
AI approval
```

## 27. Types

Audit:

```text
any
unknown
as any
@ts-ignore
duplicate interface
duplicate enums
magic strings
```

Ưu tiên:

```text
shared types
literal unions
typed API boundaries
explicit nullable values
```

Không dùng type assertion để che runtime bug.

## 28. Magic Values

Astra tìm:

```text
role strings
route strings
tab names
thresholds
cooldowns
statuses
storage thresholds
device policy states
```

Chỉ centralize nếu cùng business meaning.

## 29. Permission Cleanup

Nếu thấy nhiều đoạn:

```ts
role === 'teacher'
role === 'admin'
```

có thể tạo helper **chỉ khi semantics giống nhau**.

Không được biến:

```text
Teacher OR Admin
```

thành rule chung nếu SPEC cũ cố tình phân biệt.

## 30. Device Policy Protection

Không được thay logic:

```text
lock
unlock
override
future sessions
started sessions
year freeze
advisory lock
Realtime signal
Teacher permission
Admin read-only behavior
```

Không sửa migrations 15/16 trong cleanup.

Không đổi `device_use_slot_key()`.

## 31. Storage Protection

Không thay:

```text
70% INFO
85% WARNING
95% CRITICAL
```

Không thay:

```text
provider snapshot
metadata safety floor
R2 upload protection
DB protection
no auto purge
```

Cleanup chỉ được restructure code.

## 32. Owl V2

Không thay behavior FEAT-009.

Giữ:

```text
feature flag
Admin pilot
old Owl fallback
pointer coordinates local only
queue/cooldown
reduced motion
```

Không biến pilot thành global rollout.

## 33. Homework

Không thay:

```text
duplicate rules
English group scope
reminder limit
report incorrect information
moderation
image lifecycle
archive/purge
heart/scoring logic
```

## 34. Registration

Không thay:

```text
deadline rules
AI review
revision rules
emergency registration
device-use effective state
student ownership
teacher review
```

## 35. Realtime

Audit duplicate invalidation/subscription code.

Nhưng không:

```text
remove table subscriptions
broaden accessible payload
change class filtering
change permission
```

## 36. CSS Cleanup

Được phép:

```text
remove unused rules
merge exact duplicates
reuse token
remove obsolete class
reduce inline duplication
```

Không được:

```text
redesign
change page hierarchy
change responsive behavior intentionally
```

## 37. Assets

Mỗi ảnh/font/icon candidate phải kiểm:

```text
source reference
CSS reference
dynamic path
manifest
HTML
Vue
test
```

Không xóa asset chỉ vì IDE báo unused nếu runtime dùng string path.

## 38. Dependencies

Một dependency chỉ được remove khi:

```text
0 runtime import
0 build usage
0 script usage
0 test usage
0 dynamic usage
```

Sau remove:

```bash
npm install
npm run typecheck
npm run build
full tests
```

`package-lock.json` phải cập nhật tương ứng.

## 39. Dependency Addition

Cleanup **không nên thêm dependency mới**.

Nếu muốn thêm ESLint/Knip/depcheck chỉ để scan:
- được dùng local/tooling;
- không bắt buộc commit dependency.

Nếu muốn commit dependency mới:

```text
DEFER / justify explicitly
```

## 40. Duplicate Code Policy

Không đặt mục tiêu “DRY bằng mọi giá”.

Refactor duplicate chỉ khi:

```text
same responsibility
same business rule
same lifecycle
same permission semantics
```

Nếu khác một trong các yếu tố trên:

```text
KEEP SEPARATE
```

## 41. Function Size

Không có luật:

```text
function > X lines = phải tách
```

Tách dựa trên responsibility.

## 42. Naming Cleanup

Được sửa tên internal:

```text
ambiguous variables
misleading helper name
duplicate suffix
legacy naming
```

Nhưng không rename public contract:

```text
RPC
DB table
DB column
Edge Function
route
query parameter
local-storage key
event contract
```

trừ khi có compatibility layer.

## 43. Comments

Xóa comment:

```text
obvious
obsolete
wrong
temporary debugging
```

Giữ comment giải thích:

```text
business rationale
security reason
race-condition handling
non-obvious compatibility
production constraints
```

## 44. Logging

Xóa:

```text
console.log debug
temporary tracing
sensitive payload logging
```

Không xóa:

```text
meaningful error diagnostics
security/audit logging
operational warnings
```

## 45. Tests

Không được “cleanup tests” bằng cách giảm coverage.

Phân loại:

```text
ACTIVE
REGRESSION
FROZEN
SUPERSEDED
```

### BR-B03
Frozen RC9 files không được sửa chỉ để làm test pass.

### BR-B04
Nếu xóa test:

Implementation Report phải nêu:

```text
test deleted
reason
replacement test
equivalent coverage
```

## 46. Mutation Tests

Mutation test evidence lịch sử không được coi là mutation run mới.

Nếu code cleanup chạm area FEAT-010 mà mutation runner tồn tại:

```bash
node scripts/mutate-feat010.mjs
```

phải chạy lại nếu khả thi.

Nếu không chạy:

```text
NOT RUN
```

không được ghi PASS dựa vào evidence cũ.

## 47. Database

Mặc định:

```text
Database changes: NONE
Migration: NONE
RLS changes: NONE
RPC changes: NONE
```

Nếu cleanup “cần” DB migration:

```text
BLOCKED
```

trả về Sol.

## 48. Security

Astra phải đặc biệt kiểm:

```text
auth bootstrap
sessionStorage
role checks
RLS callers
SECURITY DEFINER assumptions
Edge Function privilege
service role secrecy
direct API access
```

Không được giảm security để đơn giản hóa code.

## 49. Performance

Cleanup được phép cải thiện performance nếu behavior-equivalent.

Ví dụ:

```text
remove duplicate request
memoize pure computation
avoid duplicate listeners
unsubscribe correctly
```

Nhưng performance optimization phức tạp nên `DEFER`.

## 50. Timers / Event Listeners

Audit:

```text
setInterval
setTimeout
window.addEventListener
document.addEventListener
Realtime subscriptions
Vue watchers
```

Phải có lifecycle cleanup phù hợp.

Đặc biệt FEAT-012 Storage auto-refresh phải không bị timer leak.

## 51. Browser Compatibility

Không introduce browser-only API nếu chưa kiểm target browsers.

GitHub Pages production build vẫn phải chạy.

## 52. GitHub Pages

Cleanup không được phá:

```text
vite base
GitHub Actions Pages build
public/config.js generation
public/supabase-service.js copying
dist artifact upload
```

Không commit `dist` chỉ để tránh lỗi deploy.

Deploy phải tiếp tục từ GitHub Actions artifact.

## 53. Incremental Implementation

Astra không làm một commit khổng lồ.

Khuyến nghị chia thành:

```text
Commit 1 — repo hygiene
Commit 2 — dead code
Commit 3 — shared utilities
Commit 4 — component/page cleanup
Commit 5 — types/CSS/assets
Commit 6 — tests/docs
```

Sau mỗi nhóm:

```text
typecheck
relevant tests
```

Nếu regression xuất hiện, sửa trước khi tiếp tục.

## 54. Stop Conditions

Astra phải STOP và trả `BLOCKED` nếu gặp:

```text
canonical source conflict
unknown production migration
business rule ambiguity
permission behavior ambiguity
secret exposed
refactor requires schema change
refactor requires RPC contract change
behavior cannot be preserved confidently
```

Không đoán.

## 55. Must Not Break

```text
Authentication
Login/logout/session refresh
Student registration
Registration deadline
AI approval/revision
Teacher review
Notifications
Student history
Class membership
Admin/Teacher separation
Homework
Homework image/media
Archive/purge
Storage protection
Device Policy
Realtime
Avatar/profile
GitHub Pages deployment
Existing production data
```

## 56. Acceptance Criteria

| ID | Requirement |
|---|---|
| AC-001 | Canonical baseline SHA được ghi lại trước cleanup |
| AC-002 | Có repository inventory trước khi delete |
| AC-003 | Không xóa branch divergent |
| AC-004 | Không xóa production migration |
| AC-005 | Không mất release/security evidence bắt buộc |
| AC-006 | Không secret mới trong repo |
| AC-007 | Generated artifacts không cần thiết được loại khỏi source |
| AC-008 | `.gitignore` bảo vệ artifact/local secrets phù hợp |
| AC-009 | Dead code chỉ xóa khi có evidence |
| AC-010 | Không có unused import mới |
| AC-011 | Không có dependency bị remove mà vẫn còn caller |
| AC-012 | Duplicate code giảm ở các area thực sự cùng semantics |
| AC-013 | Admin/Teacher permission behavior không thay đổi |
| AC-014 | Student permission behavior không thay đổi |
| AC-015 | Supabase contracts không đổi |
| AC-016 | RLS/RPC/schema không đổi |
| AC-017 | Device Policy behavior không đổi |
| AC-018 | Storage protection behavior không đổi |
| AC-019 | Owl pilot behavior không đổi |
| AC-020 | Homework behavior không đổi |
| AC-021 | Registration behavior không đổi |
| AC-022 | Realtime subscriptions không regression |
| AC-023 | `npm run typecheck` PASS |
| AC-024 | `npm run build` PASS |
| AC-025 | `npm run test` PASS |
| AC-026 | `npm run test:unit` PASS |
| AC-027 | feature regression suites PASS |
| AC-028 | FEAT-010 verification PASS nếu canonical suite tồn tại |
| AC-029 | VERIFY-002 static PASS nếu canonical suite tồn tại |
| AC-030 | Browser smoke test PASS |
| AC-031 | GitHub Pages production build artifact hợp lệ |
| AC-032 | Không có console error mới |
| AC-033 | Package manifest/checksum PASS nếu package được tạo |
| AC-034 | Có before/after metrics |
| AC-035 | Có danh sách tất cả file DELETE/MOVE/REFACTOR |
| AC-036 | Không thay business rule |
| AC-037 | Không thay production data |
| AC-038 | Không đóng giả các gate chưa chạy |

## 57. Browser Smoke Matrix

| Actor | Flow |
|---|---|
| Student | Login |
| Student | Dashboard |
| Student | Đăng ký tự học |
| Student | Sửa đăng ký |
| Student | Lịch sử |
| Student | Homework |
| Teacher | Login |
| Teacher | Dashboard |
| Teacher | Student tracking |
| Teacher | TKB |
| Teacher | Thiết bị điện tử |
| Teacher | Lock / Unlock / Override |
| Teacher | Homework |
| Teacher | Notifications |
| Admin | Login |
| Admin | Dashboard |
| Admin | User/class management |
| Admin | TKB / Device Policy read-only |
| Admin | Storage Health |
| Admin | Archive |
| Admin | Recycle Bin |
| All | Profile/avatar |
| All | Logout/login again |

Không cần tạo dữ liệu production phá hủy chỉ để smoke test.

## 58. Mobile Smoke

Kiểm:

```text
sidebar/navigation
Teacher TKB
Device Policy
Homework
Admin Storage
dialogs
profile
```

Không cần pixel-perfect screenshot tất cả trang.

## 59. Before/After Metrics

Implementation Report phải có:

```text
files before / after
source lines before / after
dependencies before / after
dead files removed
dead exports removed
duplicate blocks consolidated
largest files before / after
test count before / after
build size before / after
```

Không đặt mục tiêu giảm LOC bằng mọi giá.

## 60. Mandatory Artifacts

Astra phải bàn giao:

```text
docs/maintenance/cleanup/
├── A0_BASELINE.md
├── REPO_INVENTORY.md
├── BRANCH_AUDIT.md
├── FILE_DISPOSITION.md
├── CODE_CLEANUP_INVENTORY.md
├── DEPENDENCY_AUDIT.md
├── SECURITY_SCAN.md
├── BEFORE_AFTER_METRICS.md
├── TEST_REPORT.md
├── BROWSER_SMOKE_REPORT.md
├── REPO_CLEANUP_REPORT.md
└── CODE_CLEANUP_REPORT.md
```

Ngoài ra:

```text
CHANGED_FILES.txt
DELETED_FILES.txt
MOVED_FILES.txt
```

## 61. Implementation Report Format

Astra phải kết thúc bằng:

```text
TASK:
MAINT-REPO-CLEANUP-001
MAINT-CODE-CLEANUP-001

STATUS:
READY_FOR_SOL_REVIEW
```

Sau đó:

```text
Baseline commit:
...

Final commit:
...

Files created:
...

Files modified:
...

Files deleted:
...

Files moved:
...

Dependencies removed:
...

Dependencies added:
NONE / ...

Database changes:
NONE

Migration changes:
NONE

RLS changes:
NONE

RPC changes:
NONE

Business-rule changes:
NONE
```

Verification:

```text
npm ci: PASS/FAIL
typecheck: PASS/FAIL
build: PASS/FAIL
test: PASS/FAIL
unit: PASS/FAIL
FEAT-010: PASS/FAIL/NOT RUN
VERIFY-002: PASS/FAIL/NOT RUN
mutation: PASS/FAIL/NOT RUN
browser desktop: PASS/FAIL/NOT RUN
browser mobile: PASS/FAIL/NOT RUN
GitHub Pages build: PASS/FAIL
```

## 62. Astra Self Review

Trước handoff, Astra tự kiểm:

```text
Có xóa nhầm file không?
Có thay business rule không?
Có thay permission không?
Có thay RPC/query contract không?
Có giảm coverage không?
Có làm test xanh bằng cách sửa test sai không?
Có mất migration không?
Có mất evidence không?
Có console error không?
Có listener/timer leak không?
Có secret không?
Có dead code mới do refactor không?
```

Nếu phát hiện lỗi:

```text
FIX
→ RETEST
→ SELF REVIEW AGAIN
```

## 63. Out of Scope

```text
rewrite toàn bộ Supabase architecture
rewrite public/supabase-service.js sang TypeScript
database normalization
new RLS design
new authentication model
new UI design
new navigation design
new business feature
performance rewrite lớn
Vue major upgrade
Vite major upgrade
dependency upgrade campaign
new test framework
new deployment platform
```

Các việc đó cần task riêng.

## 64. Release Gate

Astra hoàn thành **không có nghĩa là được deploy production**.

Workflow:

```text
ASTRA READY_FOR_SOL_REVIEW
       ↓
SOL INDEPENDENT REVIEW
       ↓
APPROVED / REQUEST_CHANGES / BLOCKED
       ↓
USER quyết định release
```

# FINAL

```text
MAINT-REPO-CLEANUP-001
STATUS: FINAL
ASTRA_EFFORT: MEDIUM

MAINT-CODE-CLEANUP-001
STATUS: FINAL
ASTRA_EFFORT: MEDIUM

DATABASE CHANGE: NOT AUTHORIZED
RLS CHANGE: NOT AUTHORIZED
BUSINESS RULE CHANGE: NOT AUTHORIZED
PRODUCTION DEPLOY: NOT AUTHORIZED

IMPLEMENTATION AUTHORIZED
```
