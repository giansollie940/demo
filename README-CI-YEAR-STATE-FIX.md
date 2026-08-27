# V8.7.1 CI Year-State Fix

Ghi đè các file trong patch vào đúng đường dẫn tương ứng ở repo root.

Lỗi được sửa: `src/stores/context.ts` cũ chưa quản lý `selectedSchoolYearId` / `schoolYears`, khiến test Year + Bubble Menu thất bại dù `auth.ts` và Admin tab đã mới.

Sau khi ghi đè, chạy:

```bash
npm test
```

Kỳ vọng: 119/119 tests PASS.
