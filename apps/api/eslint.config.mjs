import tsPlugin from '@typescript-eslint/eslint-plugin';

// Minimal ESLint 9 flat config — enough that `pnpm --filter api lint`
// actually parses and checks every TS file under src/ and test/. It's
// deliberately not a style gate: formatting isn't enforced here, and the two
// rules relaxed below are ones Nest's framework types and the test specs
// legitimately trip without indicating a bug.
export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
  // `flat/recommended` ships as an array (base parser/plugin wiring, then the
  // rule sets); scope each entry to TS so this config file itself isn't
  // parsed by the TS parser.
  ...tsPlugin.configs['flat/recommended'].map((config) => ({
    ...config,
    files: ['src/**/*.ts', 'test/**/*.ts'],
  })),
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
