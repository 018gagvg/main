const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  globalSetup: '<rootDir>/utils/setup-tests.ts',
  ...baseConfig,
  testMatch: ['**/test.ts'],
  testTimeout: 10000,
};
