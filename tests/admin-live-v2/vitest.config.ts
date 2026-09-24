import config from '../feat-005/vitest.config';
export default {...config,test:{...config.test,include:['tests/admin-live-v2/*.test.ts']}};
