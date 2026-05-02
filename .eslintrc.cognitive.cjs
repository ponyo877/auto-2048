/* eslint-env node */
/**
 * Minimal config used ONLY for the cognitive-complexity gate.
 * Run via: npm run lint:complexity
 * Also invoked by .claude/hooks/check-complexity.sh on every Edit/Write.
 */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: { ecmaVersion: 2022, sourceType: 'module', ecmaFeatures: { jsx: true } },
  plugins: ['sonarjs'],
  rules: {
    'sonarjs/cognitive-complexity': ['error', 20],
  },
  ignorePatterns: ['dist', 'node_modules', 'public/solver.js', 'core/third_party'],
};
