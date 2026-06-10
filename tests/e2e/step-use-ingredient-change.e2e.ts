import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async ({ page }) => { await clearTestData({ page }); });

// Reproduces the bug where switching a freshly-added use row to a different
// ingredient kept the first ingredient's auto-filled amount, producing a
// sum-mismatch ("used 1 of 3"). The amount should re-default to the newly
// selected ingredient's remaining quantity.
test('switching a fresh use row to another ingredient re-defaults the amount', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Use Ingredient Change Recipe');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/use-ingredient-change-recipe/);

  await page.getByRole('link', { name: '+ Record V1' }).click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await page.getByTestId('batch-label').fill('switch ingredient');

  // Ingredient 1: Sugar, 1 cup. Ingredient 2: Vanilla Extract, 3 tsp.
  const ingRows = page.getByTestId('ingredient-edit-row');
  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(0).getByLabel(/^Ingredient 1 amount$/).fill('1');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 unit$/).fill('cup');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).fill('Sugar');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).blur();

  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(1).getByLabel(/^Ingredient 2 amount$/).fill('3');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 unit$/).fill('tsp');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 name$/).fill('Vanilla Extract');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 name$/).blur();

  // Add a step and a use row — the row auto-fills the first ingredient (Sugar, 1).
  const stepRows = page.getByTestId('step-edit-row');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(0).fill('Add vanilla');
  await stepRows.nth(0).getByTestId('add-use-btn').click();
  await expect(stepRows.nth(0).getByTestId('use-amount').nth(0)).toHaveValue('1');

  // Switch the use to Vanilla Extract (3 tsp). The amount should follow.
  await stepRows.nth(0).getByTestId('use-ingredient').nth(0).selectOption({ label: 'Vanilla Extract' });

  await expect(stepRows.nth(0).getByTestId('use-amount').nth(0)).toHaveValue('3');
  await expect(stepRows.nth(0).getByTestId('allocation-indicator')).toContainText('3/3tsp Vanilla Extract');
});

// Guards the documented intent: a user-typed amount must NOT be clobbered when
// the ingredient is subsequently changed.
test('switching a use row preserves a user-typed amount', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Preserve Typed Amount Recipe');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/preserve-typed-amount-recipe/);

  await page.getByRole('link', { name: '+ Record V1' }).click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await page.getByTestId('batch-label').fill('preserve amount');

  const ingRows = page.getByTestId('ingredient-edit-row');
  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(0).getByLabel(/^Ingredient 1 amount$/).fill('1');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 unit$/).fill('cup');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).fill('Sugar');
  await ingRows.nth(0).getByLabel(/^Ingredient 1 name$/).blur();

  await page.getByTestId('add-ingredient-btn').click();
  await ingRows.nth(1).getByLabel(/^Ingredient 2 amount$/).fill('3');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 unit$/).fill('tsp');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 name$/).fill('Vanilla Extract');
  await ingRows.nth(1).getByLabel(/^Ingredient 2 name$/).blur();

  const stepRows = page.getByTestId('step-edit-row');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(0).fill('Add vanilla');
  await stepRows.nth(0).getByTestId('add-use-btn').click();

  // User types a deliberate amount before changing the ingredient.
  await stepRows.nth(0).getByTestId('use-amount').nth(0).fill('2');
  await stepRows.nth(0).getByTestId('use-amount').nth(0).blur();

  await stepRows.nth(0).getByTestId('use-ingredient').nth(0).selectOption({ label: 'Vanilla Extract' });

  await expect(stepRows.nth(0).getByTestId('use-amount').nth(0)).toHaveValue('2');
});
