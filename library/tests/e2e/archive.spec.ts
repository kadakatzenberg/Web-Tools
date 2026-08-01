import { expect, test } from '@playwright/test';
import { collectProblems, mockArchive } from './fixture';

test.beforeEach(async ({ page }) => {
  await mockArchive(page);
});

test('the front matter loads, counts the archive, and throws nothing', async ({ page }) => {
  const problems = collectProblems(page);

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Hei Mao', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'All Characters' }).first()).toBeVisible();

  // The worlds index is derived from the data, including the world the
  // taxonomy only learned about by reading the data itself.
  await expect(page.getByRole('button', { name: /The Seven Hells/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Uncharted/ })).toBeVisible();

  expect(problems).toEqual([]);
});

test('an entry can be reached, read, and returned from with the back button', async ({ page }) => {
  await page.goto('/archive');

  await page.getByRole('link', { name: /Kada Katzenberg/ }).first().click();
  await expect(page).toHaveURL(/\/c\/kada-katzenberg$/);
  await expect(page.getByRole('heading', { name: 'Kada Katzenberg', level: 1 })).toBeVisible();

  // Full-record fields that only arrive on the detail fetch.
  await expect(page.getByText('Sit down. Eat something.')).toBeVisible();
  await expect(page.getByText('The Debt')).toBeVisible();
  await expect(page.getByText('Cannot whistle.')).toBeVisible();

  // The thing v1 could not do at all: go back.
  await page.goBack();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(page.getByRole('heading', { name: 'All Characters' })).toBeVisible();
});

test('a legacy ?id= link still resolves and is rewritten', async ({ page }) => {
  // These are sitting in Discord scrollback and will be clicked for years.
  await page.goto('/?id=dawn-khihothe');
  await expect(page.getByRole('heading', { name: 'Dawn Khihothe', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/c\/dawn-khihothe$/);
});

test('search finds a name through its apostrophe and ranks it first', async ({ page }) => {
  await page.goto('/archive');

  await page.getByRole('searchbox').fill('kahkujol');
  await expect(page).toHaveURL(/q=kahkujol/);

  const cards = page.locator('.card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText('Ayer');
});

test('a search matching nothing says so rather than showing an empty grid', async ({ page }) => {
  await page.goto('/archive');
  await page.getByRole('searchbox').fill('zzzznothing');
  await expect(page.getByText('No entries found')).toBeVisible();
  await expect(page.locator('.placeholder').getByRole('button', { name: 'All Characters' })).toBeVisible();
});

test('filters are in the URL, survive a reload, and can be removed', async ({ page }) => {
  await page.goto('/archive?world=The%20Source&era=7A');

  await expect(page.getByRole('heading', { name: '7th Astral Era' })).toBeVisible();
  await expect(page.locator('.card')).toHaveCount(1);

  await page.reload();
  await expect(page.locator('.card')).toHaveCount(1);

  // Dropping the world drops its era too — an era alone is not a place.
  await page.getByRole('button', { name: /World.*The Source/ }).click();
  await expect(page).toHaveURL(/\/archive$/);
  await expect(page.locator('.card')).toHaveCount(12);
});

test('an era stored as prose is displayed rather than dropped', async ({ page }) => {
  // Two live rows store "5th Astral Era" where every other row stores a code.
  // Scoped to the record: the rail also lists it, inside a collapsed
  // <details>, and an unscoped match finds that hidden copy first.
  await page.goto('/c/fifth-astral-relic');
  await expect(page.getByRole('heading', { name: 'Ythirn Vaelor' })).toBeVisible();

  const record = page.locator('.record');
  await expect(record.getByRole('button', { name: '5th Astral Era' }).first()).toBeVisible();
});

test('a linked relationship navigates and an unlinked one does not pretend to', async ({ page }) => {
  await page.goto('/c/kada-katzenberg');

  await expect(page.getByRole('button', { name: /Ayer Kahjaa/ })).toBeVisible();
  // No link, so it must not be a control.
  await expect(page.getByRole('button', { name: /Someone Unrecorded/ })).toHaveCount(0);
  await expect(page.getByText('Someone Unrecorded')).toBeVisible();

  await page.getByRole('button', { name: /Ayer Kahjaa/ }).click();
  await expect(page).toHaveURL(/\/c\/ayer-kahjaa$/);
});

test('an entry with no portrait draws its own sigil instead of a broken image', async ({ page }) => {
  await page.goto('/c/ayer-kahjaa');
  const portrait = page.locator('.record__portrait');
  await expect(portrait).toHaveClass(/portrait--sigil/);
  await expect(portrait.locator('svg')).toBeVisible();
});

test('a missing entry says so instead of failing silently', async ({ page }) => {
  await page.goto('/c/there-is-no-such-soul');
  await expect(page.getByText('Entry not found')).toBeVisible();
  await expect(
    page.locator('.placeholder').getByRole('button', { name: 'Back to the archive' }),
  ).toBeVisible();
});

test('a failing archive reports the failure and offers a retry', async ({ page }) => {
  await mockArchive(page, { failList: true });
  await page.goto('/');
  await expect(page.getByText('The archive is unreachable')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('the document title tracks the route', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Hei Mao — Character Library/);

  await page.goto('/c/kada-katzenberg');
  await expect(page).toHaveTitle(/Kada Katzenberg/);
});
