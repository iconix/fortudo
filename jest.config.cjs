module.exports = {
  // Use jsdom environment for DOM testing
  testEnvironment: 'jsdom',

  // Transform files using babel-jest
  transform: {
    '^.+\\.jsx?$': 'babel-jest'
  },

  // Handle ES modules
  transformIgnorePatterns: [
    'node_modules/(?!(module-that-needs-to-be-transformed)/)'
  ],

  // Setup files to run before tests
  setupFiles: ['<rootDir>/__tests__/test-utils.js'],

  // Module name mapper for any non-JS imports
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },

  // Test file patterns
  testMatch: ['**/__tests__/**/*.test.js'],

  // Coverage configuration
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'public/js/**/*.js',
    '!**/node_modules/**'
  ]
};