/** @type {import('jest').Config} */
const config = {
  collectCoverage: true,
  collectCoverageFrom: [
    '**/*.js',
    '!btc-cgt.js',
    '!jest.config.js',
    '!tests/**/*.js',
    '!coverage/**/*.js',
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  testMatch: [
    '**/tests/**/*.js',
  ],
};

module.exports = config;
