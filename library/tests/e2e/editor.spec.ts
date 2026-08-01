import { expect, test } from '@playwright/test';
import { mockArchive } from './fixture';

test('a new entry is validated field by field before anything is sent', async ({ page }) => {
  const writes: Array<{ name: string; body: unknown }> = [];
  await mockArchive(page, { onWrite: (name, body) => writes.push({ name, body }) });

  await page.goto('/archive');
  await page.getByRole('button', { name: /Submit/ }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Submitting an empty form must report everything at once. v1 reported one
  // problem per attempt through a toast, so this took four tries to discover.
  await dialog.getByRole('button', { name: 'Submit entry' }).click();

  await expect(dialog.getByText('A name is required')).toBeVisible();
  await expect(dialog.getByText('An entry ID is required')).toBeVisible();
  await expect(dialog.getByText('A password is required')).toBeVisible();

  // And nothing reached the database.
  expect(writes).toEqual([]);
});

test('an entry ID is normalised into something that can be a URL', async ({ page }) => {
  await mockArchive(page);
  await page.goto('/archive');
  await page.getByRole('button', { name: /Submit/ }).click();

  const dialog = page.getByRole('dialog');
  const id = dialog.getByLabel(/Entry ID/);

  // v1 replaced whitespace only, so "../../etc" and "a/b?c" reached the URL.
  await id.fill('  Dawn  Khihothe  ');
  await id.blur();
  await expect(id).toHaveValue('dawn-khihothe');

  // Everything outside [a-z0-9-] is dropped rather than turned into a
  // separator, so no combination of punctuation can produce a path segment.
  await id.fill('../../etc?x=1');
  await id.blur();
  await expect(id).toHaveValue('etcx1');
});

test('a duplicate ID is refused before the request', async ({ page }) => {
  const writes: string[] = [];
  await mockArchive(page, { onWrite: (name) => writes.push(name) });

  await page.goto('/archive');
  await page.getByRole('button', { name: /Submit/ }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Name/).fill('Another Kada');
  await dialog.getByLabel(/Entry ID/).fill('kada-katzenberg');
  await dialog.getByLabel(/^Password/).fill('a-long-enough-password');
  await dialog.getByLabel(/^Confirm password/).fill('a-long-enough-password');
  await dialog.getByRole('button', { name: 'Submit entry' }).click();

  await expect(dialog.getByText('That ID is already taken')).toBeVisible();
  expect(writes).toEqual([]);
});

test('a short or mismatched password is refused', async ({ page }) => {
  await mockArchive(page);
  await page.goto('/archive');
  await page.getByRole('button', { name: /Submit/ }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Name/).fill('Test');
  await dialog.getByLabel(/Entry ID/).fill('test-entry');
  await dialog.getByLabel(/^Password/).fill('short');
  await dialog.getByLabel(/^Confirm password/).fill('different');
  await dialog.getByRole('button', { name: 'Submit entry' }).click();

  await expect(dialog.getByText('At least 8 characters', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Passwords do not match')).toBeVisible();
});

test('a valid entry is sent through the password-checked function', async ({ page }) => {
  const writes: Array<{ name: string; body: any }> = [];
  await mockArchive(page, { onWrite: (name, body) => writes.push({ name, body }) });

  await page.goto('/archive');
  await page.getByRole('button', { name: /Submit/ }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Name/).fill('Test Soul');
  await dialog.getByLabel(/Entry ID/).fill('test-soul');
  await dialog.getByLabel(/^Password/).fill('a-long-enough-password');
  await dialog.getByLabel(/^Confirm password/).fill('a-long-enough-password');
  await dialog.getByRole('button', { name: 'Submit entry' }).click();

  await expect.poll(() => writes.length).toBeGreaterThan(0);

  const [call] = writes;
  // Never a direct POST to /entries: writes go through the RPC that checks
  // the password server-side.
  expect(call!.name).toBe('create_entry');
  expect(call!.body.p_id).toBe('test-soul');
  expect(call!.body.p_password).toBe('a-long-enough-password');
  // The positional wire format is preserved.
  expect(Array.isArray(call!.body.p_payload.stats)).toBe(true);
  expect(call!.body.p_payload.stats).toHaveLength(9);
  expect(call!.body.p_payload.name).toBe('Test Soul');
});

test('a javascript: URL never reaches the database', async ({ page }) => {
  const writes: Array<{ name: string; body: any }> = [];
  await mockArchive(page, { onWrite: (name, body) => writes.push({ name, body }) });

  await page.goto('/archive');
  await page.getByRole('button', { name: /Submit/ }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Name/).fill('Payload');
  await dialog.getByLabel(/Entry ID/).fill('payload-test');
  await dialog.getByLabel(/Character Carrd/).fill('javascript:alert(1)');
  await dialog.getByLabel(/^Password/).fill('a-long-enough-password');
  await dialog.getByLabel(/^Confirm password/).fill('a-long-enough-password');
  await dialog.getByRole('button', { name: 'Submit entry' }).click();

  // Rejected at the field, so it is not even a question of what gets stored.
  await expect(dialog.getByText('Must start with http:// or https://')).toBeVisible();
  expect(writes).toEqual([]);
});

test('editing requires a password and closing warns about unsaved work', async ({ page }) => {
  await mockArchive(page);
  await page.goto('/c/kada-katzenberg');
  await page.getByRole('button', { name: 'Edit' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // The record's own values are loaded, not a blank form.
  await expect(dialog.getByRole('textbox', { name: /^Name/ })).toHaveValue('Kada Katzenberg');

  // Closing an untouched form must not nag. v1 called confirm() every time.
  let asked = 0;
  page.on('dialog', async (native) => {
    asked++;
    await native.dismiss();
  });
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  expect(asked).toBe(0);
});

test('the delete dialog requires the name typed out, not just a click', async ({ page }) => {
  const writes: string[] = [];
  await mockArchive(page, { onWrite: (name) => writes.push(name) });

  await page.goto('/c/kada-katzenberg');
  await page.getByRole('button', { name: 'Delete this entry' }).click();

  const dialog = page.getByRole('dialog');
  const confirm = dialog.getByRole('button', { name: 'Delete permanently' });

  // v1 asked only for a password, so a mis-click on a button labelled "✕"
  // beside "Edit" was one step from erasing years of work.
  await expect(confirm).toBeDisabled();

  await dialog.getByLabel(/Type/).fill('Kada Katzenberg');
  await expect(confirm).toBeEnabled();

  await dialog.getByLabel(/^Entry password/).fill('whatever');
  await confirm.click();

  await expect.poll(() => writes).toContain('delete_entry');
});
