import config from '../feat-005/vitest.config';
export default { ...config, test: { ...config.test, include: ['tests/feat-007/*.test.ts'] } };
