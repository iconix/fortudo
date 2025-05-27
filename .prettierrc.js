module.exports = {
    // Basic formatting
    semi: true,
    trailingComma: 'none',
    singleQuote: true,
    printWidth: 100,
    tabWidth: 4,
    useTabs: false,

    // JavaScript specific
    arrowParens: 'always',
    bracketSpacing: true,
    bracketSameLine: false,

    // File types
    overrides: [
        {
            files: '*.json',
            options: {
                tabWidth: 2
            }
        },
        {
            files: '*.md',
            options: {
                tabWidth: 2,
                printWidth: 80
            }
        }
    ]
};
