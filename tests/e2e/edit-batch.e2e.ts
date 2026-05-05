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
  await ingRows.nth(0).locator('input').nth(0).fill('500');
  await ingRows.nth(0).locator('input').nth(1).fill('g');
  await ingRows.nth(0).locator('input').nth(2).fill('flour');
  await ingRows.nth(0).locator('input').nth(2).blur();

  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(1).locator('input').nth(0).fill('100');
  await ingRows.nth(1).locator('input').nth(1).fill('g');
  await ingRows.nth(1).locator('input').nth(2).fill('water');
  await ingRows.nth(1).locator('input').nth(2).blur();

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

  await page.getByTestId('batch-submit').click();

  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('step-uses').nth(0)).toContainText('250');
  await expect(page.getByTestId('step-uses').nth(0)).toContainText('flour');

  await page.getByTestId('edit-batch-btn').click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await expect(page.getByTestId('batch-label')).toHaveValue('initial');
  await page.getByTestId('batch-label').fill('initial revised');
  await page.getByTestId('batch-submit').click();

  await expect(page.getByTestId('batch-detail')).toContainText('initial revised');

  await page.getByTestId('mark-cooked-btn').click();
  await page.getByTestId('outcome-notes').fill('Crusty.');
  await page.getByTestId('rating-3').click();
  await page.getByTestId('outcome-submit').click();

  await expect(page.getByTestId('edit-batch-btn')).not.toBeVisible();
  await expect(page.getByTestId('edit-outcome-btn')).toBeVisible();

  await page.getByTestId('edit-outcome-btn').click();
  await page.getByTestId('outcome-notes').fill('Crusty and dense.');
  await page.getByTestId('outcome-submit').click();

  await expect(page.getByText('Crusty and dense.')).toBeVisible();
});
