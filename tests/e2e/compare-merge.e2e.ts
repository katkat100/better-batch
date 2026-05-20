import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async ({ page }) => { await clearTestData({ page }); });

test('compare two batches and merge them', async ({ page }) => {
  // Create recipe
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Sourdough Cmp');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('bread');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/sourdough-cmp/);

  // Record V1
  await page.getByRole('link', { name: '+ Record V1' }).click();
  await page.getByTestId('batch-label').fill('initial');
  await page.getByTestId('var-hydration').fill('70');
  await page.getByTestId('var-bulk_ferment').fill('5');
  await page.getByTestId('var-bake_temp').fill('475');
  await page.getByTestId('var-yield').fill('2');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Record V2 from V1
  await page.getByTestId('new-batch-btn').click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await page.getByTestId('batch-label').fill('higher hydration');
  await page.getByTestId('var-hydration').fill('75');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // From the recipe page, open the … menu and click Compare with…
  await page.getByTestId('more-actions-btn').click();
  await page.getByTestId('compare-btn').click();
  await expect(page.getByTestId('batch-picker')).toBeVisible();
  await page.getByTestId('batch-pick-option').first().click();

  // Compare view renders
  await expect(page.getByTestId('compare-view')).toBeVisible();
  await expect(page.getByTestId('variable-diff-table')).toBeVisible();
  const hydrationRow = page.getByTestId('variable-diff-row').filter({ hasText: 'hydration' });
  await expect(hydrationRow.getByTestId('variable-delta')).toContainText(/[+-]?5/);

  // Go back and merge
  await page.goto('/recipes/sourdough-cmp');
  await page.getByTestId('more-actions-btn').click();
  await page.getByTestId('merge-btn').click();
  await expect(page.getByTestId('batch-picker')).toBeVisible();
  await page.getByTestId('batch-pick-option').first().click();

  await expect(page.getByTestId('merge-picker')).toBeVisible();
  await page.getByTestId('merge-label').fill('merged v3');
  await page.getByTestId('merge-submit').click();

  // Lands on the recipe detail with the merged batch selected
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('batch-detail')).toContainText('merged v3');
});
