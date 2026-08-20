import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Vite's esbuild-based JSX transform defaults to the classic runtime,
  // which needs `React` in scope for every JSX expression — Next's own
  // build pipeline (SWC, automatic runtime) hides this normally. Inject it
  // for test files instead of adding a `@vitejs/plugin-react` dependency
  // just for this.
  esbuild: {
    jsxInject: `import React from 'react'`,
  },
  test: {
    environment: 'jsdom',
    // @testing-library/react only self-registers its automatic
    // post-test `cleanup()` when it finds a global `afterEach` — without
    // this, DOM from one test in a file leaks into the next (e.g. two
    // "Lưu" buttons by the second test in account-form.test.tsx).
    globals: true,
  },
  resolve: {
    // Vitest (unlike Next's own webpack/SWC build) doesn't read tsconfig's
    // `paths` on its own — mirror the `@/*` -> `src/*` alias here so
    // component tests can import through `@/components/ui/*` the same way
    // application code does.
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
