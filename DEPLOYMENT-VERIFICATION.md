# Deployment verification — V8.6.0 GitHub Upload Ready v4

This package is intended to be extracted and its CONTENTS uploaded to the repository root.

Required root build files:
- package.json
- package-lock.json
- tsconfig.json
- tsconfig.app.json
- tsconfig.node.json
- vite.config.ts
- index.html
- .github/workflows/deploy-pages.yml

CI v4 fix:
- Static tests no longer require optional Markdown deployment/status files.
- Supabase secret requirements are verified from the workflow itself.
- CP8 checkpoint/build scripts are verified from package.json.

Production source was not changed by the v4 CI-test fix.
