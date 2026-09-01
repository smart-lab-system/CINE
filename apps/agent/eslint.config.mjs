import tsPlugin from '@typescript-eslint/eslint-plugin';

// Minimal ESLint 9 flat config, matching apps/api/eslint.config.mjs — this
// package had no lint script at all until the exam-live demo plan's final
// review noticed the gap. Not a style gate: formatting isn't enforced here.
//
// `electron/**` added alongside `src/**` for the Electron app (design spec
// 2026-09-01-student-agent-electron-design.md) — same scope-widening apps/
// web already flagged as "a reasonable follow-up, not a prerequisite" for
// itself: no React/JSX-specific plugin (eslint-plugin-react-hooks) yet.
const SOURCE_GLOBS = ['src/**/*.ts', 'electron/**/*.ts', 'electron/**/*.tsx'];

export default [
  {
    ignores: ['dist/**', 'out/**', 'node_modules/**'],
  },
  ...tsPlugin.configs['flat/recommended'].map((config) => ({
    ...config,
    files: SOURCE_GLOBS,
  })),
  {
    files: SOURCE_GLOBS,
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
