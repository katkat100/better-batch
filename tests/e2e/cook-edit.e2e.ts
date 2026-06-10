import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async ({ page }) => { await clearTestData({ page }); });

test('edit while cooking: progress survives, session restores, edits fork a new draft', async ({ page }) => {
  // Create a recipe and a V1 draft with two steps and no ingredients (so the
  // editor saves cleanly without tripping the inconsistency dialog).
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Edit While Cook');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/edit-while-cook/);

  await page.getByRole('link', { name: '+ Record V1' }).click();
  await page.getByTestId('batch-label').fill('v1');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(0).fill('Mix');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(1).fill('Rest 5 min');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Start cooking and check the first step.
  await page.getByTestId('cook-btn').click();
  await expect(page).toHaveURL(/\/cook$/);
  await page.getByTestId('start-cooking-btn').click();
  await expect(page.getByTestId('cook-elapsed')).toBeVisible();
  await page.getByTestId('cook-step-checkbox').nth(0).check();
  await expect(page.getByTestId('cook-step-checkbox').nth(0)).toBeChecked();

  // Toggle edit mode and make structural edits: change step 2, add an ingredient, add a step.
  await page.getByTestId('cook-edit-toggle').click();
  await expect(page.getByTestId('cook-edit-panel')).toBeVisible();
  await page.getByTestId('step-text').nth(1).fill('Rest 10 min');
  await page.getByTestId('add-ingredient-btn').click();
  await page.getByTestId('ingredient-edit-row').nth(0).getByLabel(/^Ingredient 1 name$/).fill('water');
  await page.getByTestId('ingredient-edit-row').nth(0).getByLabel(/^Ingredient 1 amount$/).fill('350');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(2).fill('Bake 40 min');
  await expect(page.getByTestId('cook-edited-indicator')).toBeVisible();

  // Back to cook mode: the step-1 checkmark must still be set, edits visible in the checklist.
  await page.getByTestId('cook-edit-toggle').click();
  await expect(page.getByTestId('cook-edit-panel')).toHaveCount(0);
  await expect(page.getByTestId('cook-step-checkbox').nth(0)).toBeChecked();
  await expect(page.getByTestId('cook-step-list')).toContainText('Rest 10 min');
  await expect(page.getByTestId('cook-step-list')).toContainText('Bake 40 min');

  // Reload: the session restores (cooking already started, step 1 still checked, edits intact).
  await page.reload();
  await expect(page.getByTestId('cook-elapsed')).toBeVisible();
  await expect(page.getByTestId('cook-step-checkbox').nth(0)).toBeChecked();
  await expect(page.getByTestId('cook-step-list')).toContainText('Bake 40 min');

  // End Cook → the dirty "new version" panel appears; name and save the new version.
  await page.getByTestId('end-cook-btn').click();
  await expect(page.getByTestId('cook-new-version-panel')).toBeVisible();
  await page.getByTestId('cook-fork-label').fill('v2 with water');
  await page.getByTestId('end-cook-submit').click();

  // We land on the forked draft, which carries the edits.
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('batch-detail')).toContainText('v2 with water');
  await expect(page.getByTestId('batch-detail')).toContainText('Draft');
  await expect(page.getByTestId('batch-detail')).toContainText('Bake 40 min');
  await expect(page.getByTestId('batch-detail')).toContainText('water');

  // Switch to the original v1 via its batch-graph node (buttons carry
  // aria-label "Select batch <label> (<status>)"). It is preserved and recorded
  // as cooked, with its ORIGINAL steps untouched (no "Bake 40 min").
  await page.getByRole('button', { name: 'Select batch v1 (cooked)' }).click();
  await expect(page.getByTestId('batch-detail')).toContainText('Cooked');
  await expect(page.getByTestId('batch-detail')).toContainText('Rest 5 min');
  await expect(page.getByTestId('batch-detail')).not.toContainText('Bake 40 min');
});
