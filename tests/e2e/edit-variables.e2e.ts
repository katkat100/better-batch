import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async () => { await clearTestData(); });

test('edit variables: add, rename, remove, validate', async ({ page }) => {
  // Create a bread recipe (seeds 4 known variables)
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Sourdough');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('bread');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/sourdough/);

  // Open the Edit Variables dialog
  await page.getByTestId('edit-variables-btn').click();
  await expect(page.getByTestId('edit-variables-dialog')).toBeVisible();

  // Snapshot current row count (bread = 4)
  const rowsBefore = await page.getByTestId('var-edit-row').count();
  expect(rowsBefore).toBe(4);

  // Rename the first variable (hydration -> renamed_var)
  const firstName = page.getByTestId('var-edit-row').nth(0).getByTestId('var-name');
  await firstName.fill('renamed_var');

  // Add a new variable
  await page.getByTestId('add-variable-btn').click();
  const newRow = page.getByTestId('var-edit-row').nth(rowsBefore);
  await newRow.getByTestId('var-name').fill('new_var');
  await newRow.getByTestId('var-unit').fill('g');

  // Remove the second-original variable (index 1 = bulk_ferment) via inline confirm
  await page.getByTestId('var-edit-row').nth(1).getByTestId('var-remove').click();
  await page.getByTestId('var-edit-row').nth(1).getByTestId('var-remove-confirm').click();

  // Save
  await page.getByTestId('edit-variables-submit').click();
  await expect(page.getByTestId('edit-variables-dialog')).toBeHidden();

  // Re-open and assert persisted state: renamed_var present, new_var present, bulk_ferment gone
  await page.getByTestId('edit-variables-btn').click();
  const names = page.getByTestId('var-name');
  const allNames = await names.evaluateAll(els => (els as HTMLInputElement[]).map(e => e.value));
  expect(allNames).toContain('renamed_var');
  expect(allNames).toContain('new_var');
  expect(allNames).not.toContain('bulk_ferment');
  expect(allNames.length).toBe(rowsBefore); // -1 removed +1 added = same total

  // Validation: empty name disables save
  await page.getByTestId('var-edit-row').nth(0).getByTestId('var-name').fill('');
  await expect(page.getByTestId('edit-variables-submit')).toBeDisabled();
  await page.getByTestId('var-edit-row').nth(0).getByTestId('var-name').fill('renamed_var');

  // Validation: duplicate name disables save
  await page.getByTestId('var-edit-row').nth(1).getByTestId('var-name').fill('renamed_var');
  await expect(page.getByTestId('edit-variables-submit')).toBeDisabled();

  // Cancel discards changes
  await page.getByTestId('edit-variables-cancel').click();
  await expect(page.getByTestId('edit-variables-dialog')).toBeHidden();
});
