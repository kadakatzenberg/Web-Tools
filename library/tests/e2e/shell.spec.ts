import { expect, test } from '@playwright/test';
import { collectProblems, mockArchive } from './fixture';

test.beforeEach(async ({ page }) => {
  await mockArchive(page);
});

const ROUTES = ['/', '/archive', '/c/kada-katzenberg', '/archive?world=The%20First'];

/**
 * The assertion v1 could not have passed: its masthead was `position: fixed`
 * with a hardcoded 98px height and the page was offset by `margin-top: 98px`.
 * Below about 900px the masthead's actions wrapped to a second line, grew past
 * 98px, and covered the top of the content — permanently, on every page.
 */
for (const route of ROUTES) {
  test(`nothing overflows horizontally on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForTimeout(600);

    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return {
        scroll: doc.scrollWidth,
        client: doc.clientWidth,
        // Whatever is actually sticking out, so a failure names the culprit.
        culprits: [...document.querySelectorAll<HTMLElement>('body *')]
          .filter((node) => node.getBoundingClientRect().right > doc.clientWidth + 1)
          .slice(0, 5)
          .map((node) => `${node.tagName}.${node.className}`.slice(0, 90)),
      };
    });

    expect(overflow.culprits).toEqual([]);
    expect(overflow.scroll - overflow.client).toBeLessThanOrEqual(1);
  });
}

test('the masthead never covers the content beneath it', async ({ page }) => {
  await page.goto('/archive');
  const masthead = await page.locator('.masthead').boundingBox();
  const heading = await page.locator('.archive__head').boundingBox();
  expect(masthead).not.toBeNull();
  expect(heading).not.toBeNull();
  expect(heading!.y).toBeGreaterThanOrEqual(masthead!.y + masthead!.height - 1);
});

test('every interactive control is a real target', async ({ page }) => {
  await page.goto('/archive');
  await page.waitForTimeout(400);

  // v1's buttons were `padding:.4rem .85rem` around 6px text — about 22px tall,
  // against a 24px minimum for WCAG 2.2 target size and 44px for comfort.
  const undersized = await page.evaluate(() => {
    const results: string[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('button, a[href], input, select')) {
      if (node.closest('.starmap__index')) continue; // parked off-screen by design
      const box = node.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      if (box.height < 24 || box.width < 24) {
        results.push(`${node.tagName}.${node.className} ${Math.round(box.width)}×${Math.round(box.height)}`);
      }
    }
    return results;
  });

  expect(undersized).toEqual([]);
});

test('no visible text is smaller than eleven pixels', async ({ page }) => {
  await page.goto('/c/kada-katzenberg');
  await page.waitForTimeout(400);

  // v1 set forty labels at clamp(.34rem,.55vw,.4rem) — five to six pixels.
  const tiny = await page.evaluate(() => {
    const results: string[] = [];
    for (const node of document.querySelectorAll<HTMLElement>('body *')) {
      if (!node.textContent?.trim()) continue;
      if (node.children.length > 0) continue;
      const box = node.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const size = Number.parseFloat(getComputedStyle(node).fontSize);
      if (size < 11) results.push(`${node.tagName}.${node.className} @ ${size}px`);
    }
    return results;
  });

  expect(tiny).toEqual([]);
});

test('the page is navigable and operable from the keyboard alone', async ({ page }) => {
  await page.goto('/archive');
  await page.waitForTimeout(400);

  // The skip link is the first stop.
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();

  // "/" focuses search from anywhere, as every archive people already use does.
  await page.keyboard.press('Escape');
  await page.locator('body').click({ position: { x: 5, y: 400 } });
  await page.keyboard.press('/');
  await expect(page.getByRole('searchbox')).toBeFocused();

  await page.keyboard.type('kada');
  await expect(page).toHaveURL(/q=kada/);

  // A card is a real link, so Enter opens it.
  await page.keyboard.press('Escape');
  await page.locator('.card__hit').first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/c\//);
});

test('a card reads as one labelled link rather than a pile of fragments', async ({ page }) => {
  await page.goto('/archive');
  const link = page.locator('.card__hit').first();
  // v1 bound click to a div: no role, no name, unreachable by keyboard.
  await expect(link).toHaveAttribute('href', /\/c\//);
  const name = await link.evaluate((node) => node.textContent?.trim() ?? '');
  expect(name.length).toBeGreaterThan(3);
});

test('the mode toggle switches the whole art direction and is remembered', async ({ page }) => {
  await page.goto('/');
  const root = page.locator('html');

  const startingMode = await root.getAttribute('data-mode');
  await page.getByRole('button', { name: /Switch to the/ }).click();
  await expect(root).not.toHaveAttribute('data-mode', startingMode!);

  const switched = await root.getAttribute('data-mode');
  await page.reload();
  // Applied before first paint, so there is no flash of the other mode.
  await expect(root).toHaveAttribute('data-mode', switched!);
});

test('reduced motion is honoured rather than ignored', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const problems = collectProblems(page);

  await page.goto('/');
  await page.waitForTimeout(800);

  const moving = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('body *')].filter((node) => {
      const style = getComputedStyle(node);
      const duration = Number.parseFloat(style.animationDuration);
      return style.animationName !== 'none' && duration > 0.05;
    }).length,
  );

  expect(moving).toBe(0);
  expect(problems).toEqual([]);
});

test('the archive still works with the rail closed on a narrow screen', async ({ page, viewport }) => {
  test.skip((viewport?.width ?? 0) > 1080, 'the rail is a permanent column above 1080');

  await page.goto('/archive');
  await expect(page.locator('.rail')).not.toBeInViewport();

  await page.getByRole('button', { name: 'Show worlds' }).click();
  await expect(page.locator('.rail')).toBeInViewport();

  // The world headings are <summary> elements, which do not expose a button
  // role, so they are addressed by class rather than by role.
  await page.locator('.rail__world').filter({ hasText: 'The Source' }).click();
  await page.locator('.rail').getByRole('button', { name: 'Everything here' }).click();

  await expect(page).toHaveURL(/world=The\+Source|world=The%20Source/);
  // Choosing a filter closes the overlay, or the results are behind it.
  await expect(page.locator('.rail')).not.toBeInViewport();
});
