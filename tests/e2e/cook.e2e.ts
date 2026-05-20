import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async ({ page }) => { await clearTestData({ page }); });

test('cook a draft batch start to finish', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Cook Test');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/cook-test/);

  await page.getByRole('link', { name: '+ Record V1' }).click();
  await page.getByTestId('batch-label').fill('initial');
  await page.getByTestId('add-step-btn').click();
  await page.getByTestId('step-text').nth(0).fill('Rest 5 min');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  await page.getByTestId('cook-btn').click();
  await expect(page).toHaveURL(/\/cook$/);

  await expect(page.getByTestId('cook-start-banner')).toBeVisible();
  await page.getByTestId('start-cooking-btn').click();
  await expect(page.getByTestId('cook-start-banner')).not.toBeVisible();
  await expect(page.getByTestId('cook-elapsed')).toBeVisible();

  await page.getByTestId('timer-trigger').first().click();
  await expect(page.getByTestId('cook-timer-dock')).toBeVisible();

  await page.getByTestId('cook-step-checkbox').nth(0).check();

  await expect(page.getByTestId('end-cook-dialog')).toBeVisible();
  await page.getByTestId('end-cook-notes').fill('Crusty.');
  await page.getByTestId('rating-4').click();
  await page.getByTestId('end-cook-submit').click();

  await expect(page).toHaveURL(/\/recipes\/cook-test/);
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('batch-detail')).toContainText(/Cooked/);
});
