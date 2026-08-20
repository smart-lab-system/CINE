import tsPlugin from '@typescript-eslint/eslint-plugin';

// Minimal ESLint 9 flat config, matching apps/api's. Scoped to src/ so the
// generated .next/ output and Next's own type shims aren't linted. No
// React/Next plugin rules yet — `next lint` needed a config that didn't
// exist, so this replaces it with something that runs; adding
// eslint-plugin-react-hooks is a reasonable follow-up, not a prerequisite.
export default [
  {
    ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'],
  },
  ...tsPlugin.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['src/**/*.ts', 'src/**/*.tsx'],
  })),
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
