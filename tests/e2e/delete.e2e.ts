// tests/e2e/delete.e2e.ts
import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async () => { await clearTestData(); });

test('delete batch (with children check) and delete recipe (typed confirm)', async ({ page }) => {
  // Create recipe
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Delete Me');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/delete-me/);

  // Record V1
  await page.getByRole('link', { name: '+ Record V1' }).click();
  await page.getByTestId('batch-label').fill('initial');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Record V2 from V1
  await page.getByTestId('new-batch-btn').click();
  await page.getByTestId('batch-label').fill('tweak');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Select V1 (has a child) — open the … menu and verify Delete is disabled.
  await page.locator('[data-batch-id^="v1-"]').first().dispatchEvent('click');
  await page.getByTestId('more-actions-btn').click();
  await expect(page.getByTestId('delete-batch-btn')).toBeDisabled();
  // Close the menu (clicking the … button again toggles closed)
  await page.getByTestId('more-actions-btn').click();

  // Select V2 (the leaf) and confirm Delete is now enabled
  await page.locator('[data-batch-id^="v2-"]').first().dispatchEvent('click');
  await page.getByTestId('more-actions-btn').click();
  await expect(page.getByTestId('delete-batch-btn')).toBeEnabled();

  // Delete V2 via simple confirm
  await page.getByTestId('delete-batch-btn').click();
  await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible();
  await page.getByTestId('confirm-delete-submit').click();
  await expect(page.getByTestId('confirm-delete-dialog')).not.toBeVisible();

  // V1 is now the only batch
  await expect(page.locator('[data-batch-id^="v1-"]').first()).toBeVisible();
  await expect(page.locator('[data-batch-id^="v2-"]')).toHaveCount(0);

  // Delete the recipe via typed confirm
  await page.getByTestId('delete-recipe-btn').click();
  await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible();
  await expect(page.getByTestId('confirm-delete-submit')).toBeDisabled();
  await page.getByTestId('confirm-delete-input').fill('Delete Me');
  await expect(page.getByTestId('confirm-delete-submit')).toBeEnabled();
  await page.getByTestId('confirm-delete-submit').click();

  // Lands on home, recipe is gone
  await expect(page).toHaveURL(/^http:\/\/localhost:4173\/?$/);
  await expect(page.locator('[data-recipe-id="delete-me"]')).toHaveCount(0);
});
