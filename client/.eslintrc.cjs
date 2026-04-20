/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  env: { browser: true, es2022: true },
  extends: ['eslint:recommended', 'plugin:react/recommended', 'plugin:react-hooks/recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  settings: { react: { version: 'detect' } },
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    // Codebase có nhiều state/handler dự phòng; bật dần khi refactor.
    'no-unused-vars': 'off',
    'react-hooks/exhaustive-deps': 'off',
    // Regex kiểm tra ký tự điều khiển trong URL/file — cố ý.
    'no-control-regex': 'off',
  },
  overrides: [
    {
      files: ['src/services/**/*.{js,jsx}', 'src/hooks/**/*.{js,jsx}'],
      rules: {
        'no-unused-vars': [
          'error',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
          },
        ],
      },
    },
  ],
};
