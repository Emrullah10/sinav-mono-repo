import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist', 'dist-e2e'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 2024, globals: { ...globals.browser, __APP_VERSION__: 'readonly' }, parserOptions: { ecmaFeatures: { jsx: true } }, sourceType: 'module' },
    settings: { react: { version: '19.0' } },
    plugins: { react, 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/prop-types': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  { files: ['vite.config.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
];
