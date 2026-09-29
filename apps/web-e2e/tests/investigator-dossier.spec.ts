import * as fs from 'node:fs';
import * as path from 'node:path';
import { test, expect } from '@playwright/test';

const seed = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../.auth/seed.json'), 'utf8'),
) as {
  sessionId: string;
  results: { flaggedUnpriced: string; autoApproved: string; ungradableSystem: string; ungradableSubmission: string };
};

test('placeholder — filled in Task 10', async ({ page }) => {
  await page.goto(`/teacher/grading/${seed.results.autoApproved}?sessionId=${seed.sessionId}`);
  await expect(page.locator('h1')).toBeVisible();
});
