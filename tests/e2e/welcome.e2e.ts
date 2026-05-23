import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearTestData({ page });
  // clearTestData installs an init script setting bb_welcome_dismissed=1 by default;
  // append a later init script that removes it so the welcome panel shows.
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('bb_welcome_dismissed');
    } catch {
      // Ignore — localStorage may not be available in some contexts.
    }
  });
});

test('first-launch welcome panel loads sample recipe and dismisses', async ({ page }) => {
  await page.goto('/');

  // Welcome panel auto-shows on empty index with clean localStorage
  await expect(page.getByTestId('welcome-panel')).toBeVisible();

  // Click "Load sample recipe"
  await page.getByTestId('welcome-load-sample-btn').click();

  // Lands on the new recipe's detail page
  await expect(page).toHaveURL(/\/recipes\/[^/]+$/);
  await expect(page.getByRole('heading', { name: 'Weekly Focaccia' })).toBeVisible();

  // Returning home: panel is gone, recipe shows in grid
  await page.goto('/');
  await expect(page.getByTestId('welcome-panel')).toHaveCount(0);
  await expect(page.getByText('Weekly Focaccia')).toBeVisible();
});

test('help button re-opens the welcome panel after dismissal', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('welcome-panel')).toBeVisible();

  // Dismiss
  await page.getByTestId('welcome-dismiss-btn').click();
  await expect(page.getByTestId('welcome-panel')).toHaveCount(0);

  // Click the ? button
  await page.getByTestId('welcome-help-btn').click();
  await expect(page.getByTestId('welcome-panel')).toBeVisible();
});
