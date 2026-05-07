import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async () => { await clearTestData(); });

test('edit a draft batch with sections and step uses', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Sectioned Loaf');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();

  await expect(page).toHaveURL(/\/recipes\/sectioned-loaf/);
  await page.getByRole('link', { name: '+ Record V1' }).click();

  await page.getByTestId('batch-label').fill('initial');

  const ingRows = page.getByTestId('ingredient-edit-row');
  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(0).getByLabel(/^Ingredient 1 amount$/).fill('500');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 unit$/).fill('g');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).fill('flour');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).blur();

  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(1).getByLabel(/^Ingredient 2 amount$/).fill('100');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 unit$/).fill('g');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 name$/).fill('water');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 name$/).blur();

  // Verify reorder: move water up, water becomes index 0
  await ingRows.nth(1).getByTestId('ingredient-move-up').click();
  await expect(ingRows.nth(0).getByLabel(/name$/)).toHaveValue('water');
  await expect(ingRows.nth(1).getByLabel(/name$/)).toHaveValue('flour');
  // Move water back down to restore order for the rest of the test
  await ingRows.nth(0).getByTestId('ingredient-move-down').click();
  await expect(ingRows.nth(0).getByLabel(/name$/)).toHaveValue('flour');

  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(0).fill('Mix half the flour and all the water');
  const stepRows = page.getByTestId('step-edit-row');
  await stepRows.nth(0).getByTestId('add-use-btn').click();
  await stepRows.nth(0).getByTestId('use-amount').nth(0).fill('250');
  await stepRows.nth(0).getByTestId('use-amount').nth(0).blur();

  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(1).fill('Mix in the rest of the flour and bake');
  await stepRows.nth(1).getByTestId('add-use-btn').click();
  await stepRows.nth(1).getByTestId('use-amount').nth(0).fill('250');
  await stepRows.nth(1).getByTestId('use-amount').nth(0).blur();

  // Verify step reorder: move step 2 up, swapping with step 1
  const stepTextLocator = page.getByTestId('step-text');
  const text1 = await stepTextLocator.nth(0).inputValue();
  const text2 = await stepTextLocator.nth(1).inputValue();
  await stepRows.nth(1).getByTestId('step-move-up').click();
  await expect(stepTextLocator.nth(0)).toHaveValue(text2);
  await expect(stepTextLocator.nth(1)).toHaveValue(text1);
  // Move back to restore for the submit step
  await stepRows.nth(0).getByTestId('step-move-down').click();
  await expect(stepTextLocator.nth(0)).toHaveValue(text1);

  // Reference water in step 1 so it isn't flagged as unreferenced by the inconsistency check
  await stepRows.nth(0).getByTestId('add-use-btn').click();
  await stepRows.nth(0).getByTestId('use-ingredient').last().selectOption({ label: 'water' });
  await stepRows.nth(0).getByTestId('use-amount').last().fill('100');
  await stepRows.nth(0).getByTestId('use-amount').last().blur();

  await page.getByTestId('batch-submit').click();

  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('step-uses').nth(0)).toContainText('250');
  await expect(page.getByTestId('step-uses').nth(0)).toContainText('flour');

  await page.getByTestId('more-actions-btn').click();
  await page.getByTestId('edit-batch-btn').click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await expect(page.getByTestId('batch-label')).toHaveValue('initial');
  await page.getByTestId('batch-label').fill('initial revised');
  await page.getByTestId('batch-submit').click();

  await expect(page.getByTestId('batch-detail')).toContainText('initial revised');

  await page.getByTestId('more-actions-btn').click();
  await page.getByTestId('mark-cooked-btn').click();
  await page.getByTestId('outcome-notes').fill('Crusty.');
  await page.getByTestId('rating-3').click();
  await page.getByTestId('outcome-submit').click();

  // Edit-batch-btn is gated by status='draft' inside the … menu; cooked batches don't show it.
  // Edit-outcome-btn is always visible on cooked batches (not in the menu).
  await expect(page.getByTestId('edit-outcome-btn')).toBeVisible();

  await page.getByTestId('edit-outcome-btn').click();
  await page.getByTestId('outcome-notes').fill('Crusty and dense.');
  await page.getByTestId('outcome-submit').click();

  await expect(page.getByText('Crusty and dense.')).toBeVisible();
});
