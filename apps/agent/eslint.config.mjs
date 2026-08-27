import tsPlugin from '@typescript-eslint/eslint-plugin';

// Minimal ESLint 9 flat config, matching apps/api/eslint.config.mjs — this
// package had no lint script at all until the exam-live demo plan's final
// review noticed the gap. Not a style gate: formatting isn't enforced here.
export default [
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  ...tsPlugin.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['src/**/*.ts'],
  })),
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
