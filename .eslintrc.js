module.exports = {
    env: {
        browser: true,
        es2021: true,
        node: true,
        jest: true
    },
    extends: [
        'eslint:recommended',
        'prettier' // Disables ESLint rules that conflict with Prettier
    ],
    plugins: ['prettier'],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    rules: {
        // Prettier integration
        'prettier/prettier': 'error',

        // Code quality
        'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        'no-console': ['warn', { allow: ['error', 'warn', 'info', 'debug'] }],
        'prefer-const': 'error',
        'no-var': 'error',

        // Best practices
        eqeqeq: ['error', 'always'],
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
        'no-duplicate-imports': 'error',
        'no-unreachable': 'error',

        // Modern JavaScript
        'prefer-arrow-callback': 'warn',
        'prefer-template': 'warn',
        'object-shorthand': 'warn',

        // JSDoc comments (since you're using them)
        'valid-jsdoc': 'off', // Disabled as it's deprecated
        'require-jsdoc': 'off'
    },
    ignorePatterns: ['node_modules/', 'coverage/', '*.min.js', 'dist/', 'build/']
};
