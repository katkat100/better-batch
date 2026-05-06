import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async () => {
  await clearTestData();
});

test('create recipe, record V1, mark as cooked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Better Batch')).toBeVisible();

  // Create a recipe
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Sourdough Test Loaf');
  await page.getByTestId('new-recipe-dialog').locator('select').selectOption('bread');
  await page.getByTestId('new-recipe-submit').click();

  // Lands on the detail page
  await expect(page).toHaveURL(/\/recipes\/sourdough-test-loaf/);
  await expect(page.getByRole('heading', { name: 'Sourdough Test Loaf' })).toBeVisible();

  // Record V1
  await page.getByRole('link', { name: '+ Record V1' }).click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await page.getByTestId('batch-label').fill('initial bake');
  await page.getByTestId('var-hydration').fill('72');
  await page.getByTestId('var-bulk_ferment').fill('5');
  await page.getByTestId('var-bake_temp').fill('475');
  await page.getByTestId('var-yield').fill('2');
  await page.getByTestId('batch-submit').click();

  // Back on detail page with the batch selected
  await expect(page).toHaveURL(/\/recipes\/sourdough-test-loaf/);
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('variable-strip')).toContainText('72%');

  // Mark as cooked
  await page.getByTestId('more-actions-btn').click();
  await page.getByTestId('mark-cooked-btn').click();
  await page.getByTestId('outcome-notes').fill('Open crumb, dark crust. Try +5% hydration next.');
  await page.getByTestId('rating-4').click();
  await page.getByTestId('outcome-submit').click();

  // Cooked status visible
  await expect(page.getByTestId('batch-detail').getByText(/Cooked/i)).toBeVisible();
  await expect(page.getByText('Open crumb, dark crust. Try +5% hydration next.')).toBeVisible();
});
