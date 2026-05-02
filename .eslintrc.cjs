/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'sonarjs'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  settings: { react: { version: '18.3' } },
  rules: {
    // === HARD GATE: cognitive complexity must never exceed 20 ===
    'sonarjs/cognitive-complexity': ['error', 20],

    // Adjacent quality rules from sonarjs
    'sonarjs/no-duplicate-string': ['warn', { threshold: 5 }],
    'sonarjs/no-identical-functions': 'warn',
    'sonarjs/no-collapsible-if': 'warn',

    // React 18 doesn't need React in scope for JSX
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',

    // TS hygiene
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
  },
  ignorePatterns: [
    'dist',
    'node_modules',
    'public/solver.js',
    'core/third_party',
    '*.config.cjs',
    '*.config.ts',
    'scripts',
  ],
};
