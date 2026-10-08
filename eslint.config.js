import globals from 'globals';
import pluginJs from '@eslint/js';

export default [
  { ignores: ['.vscode/*', '.wolf/**', 'sinav-web-app/**', 'sinav-landing-app/**', 'design/**', 'docs/**', '**/dist/**', 'packages/*/dist/**'] },
  { languageOptions: { globals: { ...globals.node } } },
  pluginJs.configs.recommended,
  { rules: { 'no-unused-vars': 'off', 'no-undef': 'off' } },
];
