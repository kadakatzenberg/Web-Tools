import { expect, test } from '@playwright/test';
import { collectProblems, mockArchive } from './fixture';

test.beforeEach(async ({ page }) => {
  await mockArchive(page);
});

test('the map opens, renders through WebGL, and settles', async ({ page }) => {
  const problems = collectProblems(page);

  await page.goto('/map');

  const canvas = page.locator('.starmap__canvas');
  await expect(canvas).toBeVisible();

  // The layout worker reports when it has settled; the status disappears.
  await expect(page.locator('.starmap__status')).toHaveCount(0, { timeout: 30_000 });

  // A context that failed to start shows the fallback instead.
  await expect(page.locator('.starmap__failure')).toHaveCount(0);

  /**
   * Something was actually drawn.
   *
   * Reading the pixels directly is not available here. The context is created
   * with `preserveDrawingBuffer: false` — correct for production, since
   * preserving costs a full copy every frame — so `readPixels` outside the
   * draw call returns an empty buffer, and `drawImage` off the canvas comes
   * back black under headless SwiftShader for the same reason.
   *
   * So measure what a viewer would actually see: screenshot the canvas and
   * look at how well it compresses. PNG is lossless, so a uniform black frame
   * collapses to a handful of kilobytes at any resolution, while a starfield
   * with nebulae, bloom and per-pixel grain cannot. Measured on this scene the
   * two are three orders of magnitude apart — roughly 5KB against 1.4MB — so
   * the threshold is not delicately placed.
   */
  const frame = await canvas.screenshot();
  expect(frame.byteLength).toBeGreaterThan(120_000);

  expect(problems.filter((p) => !/WebGL|SwiftShader|GroupMarker/i.test(p))).toEqual([]);
});

test('the map is reachable and leaveable without a mouse', async ({ page }) => {
  await page.goto('/map');
  await expect(page.locator('.starmap__status')).toHaveCount(0, { timeout: 30_000 });

  // Every node is also a real button in an off-screen index, so a keyboard
  // user can reach the same graph the canvas shows. It is parked off-screen
  // until something inside it takes focus, so focus is what reveals it —
  // which is exactly the path a keyboard user takes.
  const index = page.locator('.starmap__index button');
  await expect(index).toHaveCount(12);
  await expect(index.first()).toContainText('connection');

  const target = index.filter({ hasText: 'Kada Katzenberg' });
  await target.focus();
  await expect(page.locator('.starmap__index')).toBeInViewport();
  await target.press('Enter');
  await expect(page.locator('.starmap__panel')).toBeVisible();
  await expect(page.locator('.starmap__panel-name')).toHaveText('Kada Katzenberg');

  await page.getByRole('button', { name: 'Open' }).click();
  await expect(page).toHaveURL(/\/c\/kada-katzenberg$/);
});

test('escape clears a selection, then leaves the map', async ({ page }) => {
  await page.goto('/archive');
  await page.getByRole('button', { name: /Star Map/ }).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(page.locator('.starmap__status')).toHaveCount(0, { timeout: 30_000 });

  const first = page.locator('.starmap__index button').first();
  await first.focus();
  await first.press('Enter');
  await expect(page.locator('.starmap__panel')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.locator('.starmap__panel')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await expect(page).toHaveURL(/\/archive$/);
});

test('the legend counts every world the archive holds', async ({ page }) => {
  await page.goto('/map');
  await expect(page.locator('.starmap__status')).toHaveCount(0, { timeout: 30_000 });

  const legend = page.locator('.starmap__legend li');
  await expect(legend).toHaveCount(9);
  await expect(legend.filter({ hasText: 'The Source' })).toContainText('3');
});

test('leaving the map releases the WebGL context', async ({ page }) => {
  await page.goto('/map');
  await expect(page.locator('.starmap__status')).toHaveCount(0, { timeout: 30_000 });

  await page.getByRole('button', { name: 'Close the star map' }).click();
  await expect(page.locator('.starmap')).toHaveCount(0);

  // Browsers cap live contexts at around sixteen. Without the explicit
  // loseContext() in dispose(), reopening the map this many times exhausts
  // them and the last one silently fails to acquire a context.
  for (let i = 0; i < 4; i++) {
    await page.goto('/map');
    await expect(page.locator('.starmap__canvas')).toBeVisible();
    await page.goto('/archive');
    await expect(page.locator('.starmap')).toHaveCount(0);
  }

  await page.goto('/map');
  await expect(page.locator('.starmap__canvas')).toBeVisible();
  await expect(page.locator('.starmap__failure')).toHaveCount(0);
});
