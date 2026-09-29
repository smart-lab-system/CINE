import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';

export default async function globalSetup(config: FullConfig) {
  execSync('npx ts-node -r tsconfig-paths/register test/ui-e2e/seed.ts', {
    cwd: path.resolve(__dirname, '../api'),
    env: { ...process.env, DOTENV_CONFIG_PATH: '.env.test' },
    stdio: 'inherit',
  });
  const seed = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../api/test/ui-e2e/seed-output.json'), 'utf8'),
  );
  fs.mkdirSync(path.resolve(__dirname, '.auth'), { recursive: true });
  fs.writeFileSync(path.resolve(__dirname, '.auth/seed.json'), JSON.stringify(seed));

  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:3000';
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto('/login');
  await page.fill('#email', seed.email);
  await page.fill('#password', seed.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.waitForURL('**/teacher/dashboard');
  await page.context().storageState({ path: path.resolve(__dirname, '.auth/teacher.json') });
  await browser.close();
}
