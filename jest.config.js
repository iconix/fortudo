module.exports = {
    testEnvironment: 'jsdom',
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    moduleFileExtensions: ['js'],
    // TODO: remove ignoring all tests (also remove --passWithNoTests in package.json)
    testPathIgnorePatterns: ['.*/'],
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
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70
        }
    }
};
