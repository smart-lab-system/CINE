import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  workers: 1,
  reporter: [['list']],
  globalSetup: require.resolve('./global-setup.ts'),
  use: {
    baseURL: 'http://localhost:3000',
    storageState: '.auth/teacher.json',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node dist/src/main.js',
      cwd: '../api',
      env: { DOTENV_CONFIG_PATH: '.env.test' },
      url: 'http://localhost:4000/health',
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'pnpm --filter web start',
      cwd: '../..',
      url: 'http://localhost:3000/login',
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
