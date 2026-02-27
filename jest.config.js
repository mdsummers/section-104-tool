/** @type {import('jest').Config} */
const config = {
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.js',
    '!cli.js',
    '!jest.config.js',
    '!tests/**/*.js',
    '!coverage/**/*.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'lcov',
    'text-summary',
  ],
  verbose: true,
  testMatch: [
    '**/tests/**/*.js',
  ],
};

module.exports = config;
