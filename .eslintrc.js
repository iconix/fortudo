module.exports = {
    root: true,
    env: {
        browser: true,
        es2021: true,
        node: true,
        jest: true
    },
    extends: ['eslint:recommended', 'prettier'],
    plugins: ['prettier'],
    parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module'
    },
    rules: {
        'prettier/prettier': 'error',

        'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        'no-console': ['warn', { allow: ['error', 'warn', 'info', 'debug'] }],
        'prefer-const': 'error',
        'no-var': 'error',

        eqeqeq: ['error', 'always'],
        'no-eval': 'error',
        'no-implied-eval': 'error',
        'no-new-func': 'error',
        'no-duplicate-imports': 'error',
        'no-unreachable': 'error',

        'prefer-arrow-callback': 'warn',
        'prefer-template': 'warn',
        'object-shorthand': 'warn',

        'valid-jsdoc': 'off',
        'require-jsdoc': 'off'
    },
    overrides: [
        {
            files: ['public/js/**/room-*.js'],
            rules: {
                'no-restricted-properties': [
                    'error',
                    ...['innerHTML', 'outerHTML', 'insertAdjacentHTML'].map((property) => ({
                        property,
                        message:
                            'Build room controls with DOM nodes. Use textContent for labels and dataset.room for room codes.'
                    }))
                ]
            }
        }
    ],
    ignorePatterns: ['node_modules/', 'coverage/', '*.min.js', 'dist/', 'build/']
};
