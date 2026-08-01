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
  /**
   * Five full open-and-close cycles, each one a complete WebGL init and
   * teardown through a software rasteriser. It is comfortably the slowest test
   * here, and it shares its workers with the density checks, which saturate the
   * CPU for two minutes at a time — so it needs headroom that has nothing to do
   * with the code under test.
   */
  test.setTimeout(150_000);
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

/**
 * The names, which are the difference between an archive and a scatter plot.
 *
 * They regressed twice. Once because the WebGL rewrite simply did not draw
 * them, and once because the visibility gate was written against absolute zoom
 * — at the scale the map opens at, every threshold rejected every node, so the
 * layer ran and painted nothing. Asserting "some pixels are lit" is what
 * catches both, and neither was visible in a passing suite before.
 */
test('the star map names its stars', async ({ page }) => {
  await mockArchive(page);
  await page.goto('/map');
  await expect(page.locator('.starmap__status')).toHaveCount(0, { timeout: 30_000 });

  const labels = page.locator('.starmap__labels');
  await expect(labels).toBeAttached();

  // Give the settle and the first few frames a moment.
  await page.waitForTimeout(1500);

  const painted = await labels.evaluate((canvas) => {
    const element = canvas as HTMLCanvasElement;
    const ctx = element.getContext('2d');
    if (!ctx) return -1;
    const { data } = ctx.getImageData(0, 0, element.width, element.height);
    let lit = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]! > 8) lit++;
    return lit;
  });

  expect(painted).toBeGreaterThan(200);
});

/**
 * Portraits inside the stars, the other half of what v1 showed. The atlas is
 * uploaded tile by tile as images arrive, so this asserts that at least one
 * made the trip rather than that all of them did.
 */
test('the star map puts faces on the stars it has portraits for', async ({ page }) => {
  await mockArchive(page);
  await page.goto('/map');
  await expect(page.locator('.starmap__status')).toHaveCount(0, { timeout: 30_000 });
  await page.waitForTimeout(2500);

  const tiles = await page.evaluate(() => {
    // The atlas is internal, so infer from what it exists to do: a portrait
    // request that resolved means a tile was painted and uploaded.
    return performance
      .getEntriesByType('resource')
      .filter((entry) => entry.name.includes('/storage/v1/object/public/portraits/')).length;
  });

  expect(tiles).toBeGreaterThan(0);
});

/**
 * Edges have to survive a high-DPR screen.
 *
 * They were drawn with `gl.LINES`, and every WebGL implementation clamps
 * `lineWidth` to 1 — a *device* pixel. At dpr 1 that is a visible hairline; at
 * dpr 2 it is half a CSS pixel, and the relationships simply disappeared. The
 * first attempt at fixing this raised the alpha, which cannot help: the
 * problem was geometry, not opacity, and the bug was invisible in a dpr 1
 * test run.
 *
 * So this counts lit pixels at both ratios. Edges are now quads whose width is
 * given in CSS pixels, which means the *proportion* of the frame they cover is
 * ratio-independent. Under `gl.LINES` the dpr 2 frame covered roughly half as
 * much of itself as the dpr 1 frame did.
 */
test.describe('edges survive a retina screen', () => {
  async function litFraction(page: import('@playwright/test').Page) {
    await mockArchive(page);
    await page.goto('/map');
    await expect(page.locator('.starmap__status')).toHaveCount(0, { timeout: 30_000 });
    await page.waitForTimeout(2000);

    const shot = await page.locator('.starmap__canvas').screenshot();
    // Decode in the browser, which has an image decoder and we do not.
    return page.evaluate(async (bytes) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // The band an edge occupies: clearly above the nebula ground, well below
      // a star's core. Stars and background are both excluded.
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) {
        const sum = data[i]! + data[i + 1]! + data[i + 2]!;
        if (sum > 190 && sum < 560) lit++;
      }
      return lit / (canvas.width * canvas.height);
    }, Array.from(shot));
  }

  test('at device pixel ratio 1', async ({ page }) => {
    expect(await litFraction(page)).toBeGreaterThan(0.002);
  });

  test.describe('on a retina screen', () => {
    // test.use rather than a hand-built context: a context created with
    // browser.newContext() inherits none of the project config, including
    // baseURL, so every goto in it silently hangs.
    test.use({ deviceScaleFactor: 2 });

    test('at device pixel ratio 2', async ({ page }) => {
      // Four times the pixels through a software rasteriser. On real hardware
      // this is a frame; here it is most of a minute, and that is the harness
      // rather than the map.
      test.setTimeout(180_000);
      expect(await litFraction(page)).toBeGreaterThan(0.002);
    });
  });
});

/**
 * The whole archive, at the size it actually is.
 *
 * Every legibility failure in this map — no names, then names on top of each
 * other, then lines swallowed by the glow — got through because it was checked
 * against twelve sparse nodes. Three hundred clustered ones is a different
 * picture, and this is the test that makes the difference visible to CI rather
 * than to the person who has to look at it.
 */
test.describe('at the archive\'s real size', () => {
  test('names the stars without printing them on top of each other', async ({ page }) => {
    // Desktop only. These are density checks, not layout checks, and each
    // costs a couple of minutes on a software rasteriser — running them at
    // every viewport would treble that for no extra information.
    test.skip(test.info().project.name !== 'desktop-1440', 'checked once, at one viewport');

    // 150 rather than the real 304: this runs on a software rasteriser, where
    // every frame is most of a second, and 150 clustered nodes already produce
    // the crowding that twelve never could.
    test.setTimeout(180_000);
    await mockArchive(page, { scale: 150 });
    await page.goto('/map');
    await expect(page.locator('.starmap__status')).toHaveCount(0, { timeout: 60_000 });
    await page.waitForTimeout(3000);

    const ink = await page.locator('.starmap__labels').evaluate((canvas) => {
      const element = canvas as HTMLCanvasElement;
      const ctx = element.getContext('2d')!;
      const { data } = ctx.getImageData(0, 0, element.width, element.height);
      let lit = 0;
      for (let i = 3; i < data.length; i += 4) if (data[i]! > 8) lit++;
      return lit / (element.width * element.height);
    });

    // Below the floor is the "eight labels on a scatter plot" failure. Above
    // the ceiling is the "grey mat of overprinted serif" failure. Collision
    // culling is what keeps it between the two at any density.
    expect(ink).toBeGreaterThan(0.004);
    expect(ink).toBeLessThan(0.06);
  });

  test('draws a connection web dense enough to read', async ({ page }) => {
    // Desktop only. These are density checks, not layout checks, and each
    // costs a couple of minutes on a software rasteriser — running them at
    // every viewport would treble that for no extra information.
    test.skip(test.info().project.name !== 'desktop-1440', 'checked once, at one viewport');

    // 150 rather than the real 304: this runs on a software rasteriser, where
    // every frame is most of a second, and 150 clustered nodes already produce
    // the crowding that twelve never could.
    test.setTimeout(180_000);
    await mockArchive(page, { scale: 150 });
    await page.goto('/map');
    await expect(page.locator('.starmap__status')).toHaveCount(0, { timeout: 60_000 });
    await page.waitForTimeout(3000);

    const shot = await page.locator('.starmap__canvas').screenshot();
    const litFraction = await page.evaluate(async (bytes) => {
      const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(bitmap, 0, 0);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      for (let i = 0; i < data.length; i += 4) {
        const sum = data[i]! + data[i + 1]! + data[i + 2]!;
        if (sum > 190 && sum < 560) lit++;
      }
      return lit / (canvas.width * canvas.height);
    }, Array.from(shot));

    expect(litFraction).toBeGreaterThan(0.02);
  });
});
