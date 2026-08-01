/**
 * Not part of the suite — run explicitly to refresh docs/ screenshots:
 *   npx playwright test --config=playwright.config.ts tools/capture.spec.ts --project=desktop-1440
 */
import { test } from '@playwright/test';
import { mockArchive } from '../tests/e2e/fixture';

const SHOTS = 'shots';

test('capture', async ({ page }) => {
  await mockArchive(page);

  await page.goto('/');
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/home.png` });

  await page.goto('/archive');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/archive.png` });

  await page.goto('/c/kada-katzenberg');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/entry.png` });

  await page.goto('/map');
  await page.waitForTimeout(9000);
  await page.screenshot({ path: `${SHOTS}/map.png` });

  // The other half of the art direction.
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('heimao.library.mode', 'astral'));
  await page.reload();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/home-astral.png` });

  await page.goto('/archive');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/archive-astral.png` });
});
