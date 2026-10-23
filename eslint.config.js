import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules/', 'coverage/', '.vercel/'] },
  js.configs.recommended,
  {
    files: ['api/**/*.js', 'lib/**/*.js', 'test/**/*.js', 'scripts/**/*.js', '*.js'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['public/**/*.js'],
    languageOptions: { globals: globals.browser },
  },
];
