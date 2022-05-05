const baseConfig = require('../../jest/jest.config.js');

module.exports = {
  ...baseConfig,
  setupFiles: ['<rootDir>/test/setEnvVars.ts'],
  testEnvironment: 'jsdom',
};
