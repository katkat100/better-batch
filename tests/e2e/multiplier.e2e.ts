import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async ({ page }) => { await clearTestData({ page }); });

test('cooking at 2x scales display, sets badge, no text marker', async ({ page }) => {
  // Create a recipe
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Multiplier Test Recipe');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/multiplier-test-recipe/);

  // Record V1 with one ingredient (Flour 500g) and one step that uses 500g of flour
  await page.getByRole('link', { name: '+ Record V1' }).click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await page.getByTestId('batch-label').fill('initial');

  const ingRows = page.getByTestId('ingredient-edit-row');
  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(0).getByLabel(/^Ingredient 1 amount$/).fill('500');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 unit$/).fill('g');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).fill('Flour');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).blur();

  const stepRows = page.getByTestId('step-edit-row');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(0).fill('Mix everything');
  await stepRows.nth(0).getByTestId('add-use-btn').click();
  await stepRows.nth(0).getByTestId('use-amount').nth(0).fill('500');
  await stepRows.nth(0).getByTestId('use-amount').nth(0).blur();

  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Enter cook view
  await page.getByTestId('cook-btn').click();
  await expect(page).toHaveURL(/\/cook$/);
  await page.getByTestId('start-cooking-btn').click();
  await expect(page.getByTestId('cook-start-banner')).not.toBeVisible();

  // Toggle 2x on the multiplier
  await page.locator('[data-testid="multiplier-option"][data-value="2"]').click();

  // The cook ingredient pill should now show 1000g (doubled)
  const flourPill = page.getByTestId('cook-ing-pill').filter({ hasText: 'Flour' });
  await expect(flourPill).toContainText('1000');

  // Check the only step → End Cook dialog opens
  await page.getByTestId('cook-step-checkbox').nth(0).check();
  await expect(page.getByTestId('end-cook-dialog')).toBeVisible();

  // Submit with no notes
  await page.getByTestId('end-cook-submit').click();

  // Back on BatchDetail: badge should be visible with 2X
  await expect(page).toHaveURL(/\/recipes\/multiplier-test-recipe/);
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('cook-multiplier-badge')).toBeVisible();
  await expect(page.getByTestId('cook-multiplier-badge')).toContainText(/2X/i);

  // The first-cook text marker should NOT be present anywhere on the page
  await expect(page.getByTestId('batch-detail')).not.toContainText('Cooked at 2x');
});

test('cooking at 1x leaves no badge', async ({ page }) => {
  // Same recipe + batch setup
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('No Multiplier Recipe');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/no-multiplier-recipe/);

  await page.getByRole('link', { name: '+ Record V1' }).click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await page.getByTestId('batch-label').fill('initial');

  const ingRows = page.getByTestId('ingredient-edit-row');
  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(0).getByLabel(/^Ingredient 1 amount$/).fill('500');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 unit$/).fill('g');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).fill('Flour');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).blur();

  const stepRows = page.getByTestId('step-edit-row');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(0).fill('Mix everything');
  await stepRows.nth(0).getByTestId('add-use-btn').click();
  await stepRows.nth(0).getByTestId('use-amount').nth(0).fill('500');
  await stepRows.nth(0).getByTestId('use-amount').nth(0).blur();

  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Enter cook view, leave multiplier at 1x (default)
  await page.getByTestId('cook-btn').click();
  await expect(page).toHaveURL(/\/cook$/);
  await page.getByTestId('start-cooking-btn').click();
  await expect(page.getByTestId('cook-start-banner')).not.toBeVisible();

  // Don't touch the multiplier — stays at 1x
  await page.getByTestId('cook-step-checkbox').nth(0).check();
  await expect(page.getByTestId('end-cook-dialog')).toBeVisible();
  await page.getByTestId('end-cook-submit').click();

  // BatchDetail: no badge
  await expect(page).toHaveURL(/\/recipes\/no-multiplier-recipe/);
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('cook-multiplier-badge')).not.toBeVisible();
});
