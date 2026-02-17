/** @type {import('jest').Config} */
const config = {
  collectCoverage: true,
  coverageDirectory: 'coverage',
  verbose: true,
  testMatch: [
    '**/tests/**/*.js',
  ],
};

module.exports = config;
