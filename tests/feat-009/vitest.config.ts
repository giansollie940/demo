import config from '../feat-005/vitest.config';
export default { ...config, test: { ...config.test, include: ['tests/feat-009/*.test.ts'] } };
