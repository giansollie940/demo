V8.7.1 CI 2-TEST FIX

Overwrite these paths at the repository root:
- src/stores/auth.ts
- src/pages/AdminPage.vue
- tests/v871-school-year-bubble-menu.test.mjs

Required contracts:
1) auth.reload(preferredClassId:string|null=null, preferredSchoolYearId:string|null=null)
   calls legacyApi.loadState(preferredClassId, preferredSchoolYearId)
2) AdminPage tabs include {id:'years',label:'Năm học'} and render tab==='years'.

After overwrite, run npm test.
