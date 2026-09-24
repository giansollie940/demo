import config from './vitest.config';
export default {...config,test:{...config.test,include:['tests/feat-005/*.test.ts','tests/feat-004/*.test.ts','tests/feat-003/*.test.ts','tests/bug-001/*.test.ts','tests/homework/warning.test.ts']}};
