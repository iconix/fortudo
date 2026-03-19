module.exports = {
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    moduleFileExtensions: ['js'],
    testPathIgnorePatterns: ['/node_modules/'],
    transformIgnorePatterns: ['/node_modules/(?!(pouchdb|pouchdb-adapter-memory|uuid)/)'],
    setupFilesAfterEnv: ['<rootDir>/__tests__/test-utils.js'],

    // Code coverage configuration
    collectCoverage: false, // Set to false by default, enable via CLI flag
    collectCoverageFrom: [
        'public/**/*.js',
        '!public/**/node_modules/**',
        '!public/**/*.test.js',
        '!**/vendor/**'
    ],
    coverageDirectory: 'coverage',
    coverageReporters: [
        'text', // Shows coverage in terminal
        'text-summary', // Shows brief summary in terminal
        'html', // Generates HTML report
        'lcov' // Generates lcov report (useful for CI/CD)
    ],
    coverageThreshold: {
        global: {
            branches: 79,
            functions: 90,
            lines: 90,
            statements: 90
        }
    }
};
