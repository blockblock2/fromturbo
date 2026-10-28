module.exports = {
    rules: {
        'no-alert': 'off',
        'require-atomic-updates': 'off',
        'valid-jsdoc': 'off',
        'max-len': ['error', {code: 160}],
        'quote-props': 'off',
        'newline-per-chained-call': 'off',
        'no-use-before-define': ['error', {functions: false, variables: false}]
    }
};
