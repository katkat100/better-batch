import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async ({ page }) => { await clearTestData({ page }); });

test('saving with an unused ingredient prompts override-with-note and surfaces a badge', async ({ page }) => {
  // Create a recipe
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Inconsistency Test Recipe');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/inconsistency-test-recipe/);

  // Navigate to new batch
  await page.getByRole('link', { name: '+ Record V1' }).click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await page.getByTestId('batch-label').fill('flour unused batch');

  // Add an ingredient: Flour, 500, g
  const ingRows = page.getByTestId('ingredient-edit-row');
  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(0).getByLabel(/^Ingredient 1 amount$/).fill('500');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 unit$/).fill('g');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).fill('Flour');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).blur();

  // Add a step with text but NO uses of flour
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(0).fill('Mix');
  // Do NOT add any ingredient uses — flour remains unreferenced

  // Click save
  await page.getByTestId('batch-submit').click();

  // Expect the inconsistency dialog to appear, listing flour as never referenced
  const dialog = page.getByTestId('inconsistency-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Flour: never referenced in any step');

  // Click "Save anyway" (stage 1: reveals textarea)
  await page.getByTestId('inconsistency-save-anyway').click();

  // Fill in the override note
  await page.getByTestId('inconsistency-note').fill('intentional, scaffold batch');

  // Click confirm save (stage 2)
  await page.getByTestId('inconsistency-confirm-save').click();

  // Expect navigation to the batch detail
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Expect the inconsistency badge to be visible
  await expect(page.getByTestId('inconsistency-badge')).toBeVisible();

  // Click the badge and expect the popover with issue details and note
  await page.getByTestId('inconsistency-badge').click();
  const popover = page.getByTestId('inconsistency-popover');
  await expect(popover).toBeVisible();
  await expect(popover).toContainText('never referenced in any step');
  await expect(popover).toContainText('intentional, scaffold batch');
});

test('clean batch saves without dialog and shows no badge', async ({ page }) => {
  // Create a recipe
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Clean Batch Recipe');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/clean-batch-recipe/);

  // Navigate to new batch
  await page.getByRole('link', { name: '+ Record V1' }).click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await page.getByTestId('batch-label').fill('clean batch');

  // Add an ingredient: Salt, 1, tsp
  const ingRows = page.getByTestId('ingredient-edit-row');
  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(0).getByLabel(/^Ingredient 1 amount$/).fill('1');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 unit$/).fill('tsp');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).fill('Salt');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).blur();

  // Add a step that uses all of salt (amount 1)
  const stepRows = page.getByTestId('step-edit-row');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(0).fill('Add salt and mix');
  await stepRows.nth(0).getByTestId('add-use-btn').click();
  await stepRows.nth(0).getByTestId('use-amount').nth(0).fill('1');
  await stepRows.nth(0).getByTestId('use-amount').nth(0).blur();

  // Click save
  await page.getByTestId('batch-submit').click();

  // Expect no dialog (direct navigation to batch detail)
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('inconsistency-dialog')).not.toBeVisible();

  // Expect no inconsistency badge
  await expect(page.getByTestId('inconsistency-badge')).not.toBeVisible();
});
