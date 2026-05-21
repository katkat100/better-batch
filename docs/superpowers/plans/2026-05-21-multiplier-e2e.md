# Multiplier E2E Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Playwright e2e spec that drives the cook-time multiplier round-trip end-to-end — toggle 2x during cook, end cook, assert the `cook-multiplier-badge` appears on BatchDetail with `2X` and the legacy `"Cooked at 2x"` text marker is absent. Plus a 1x control test.

**Architecture:** Single new file `tests/e2e/multiplier.e2e.ts` mirroring the structure of the existing specs. Uses the shared `clearTestData({ page })` helper from `tests/e2e/helpers.ts` for per-test isolation. Pure test addition — no source changes.

**Tech Stack:** Playwright, TypeScript, Bun test runner.

**Spec:** [`docs/superpowers/specs/2026-05-21-multiplier-e2e-design.md`](../specs/2026-05-21-multiplier-e2e-design.md)

---

## Task 1: Add `tests/e2e/multiplier.e2e.ts` with both tests

**Files:**
- Create: `tests/e2e/multiplier.e2e.ts`

- [ ] **Step 1: Create the test file with both scenarios**

Create `tests/e2e/multiplier.e2e.ts`:

```ts
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
```

- [ ] **Step 2: Run the new spec to verify both tests pass**

```bash
~/.bun/bin/bun run e2e tests/e2e/multiplier.e2e.ts
```

Expected: 2 tests pass.

If a test fails because a selector doesn't match the current UI, fix the selector. Common gotchas:
- `data-testid="multiplier-option"` is on EACH option button; selecting `[data-value="2"]` narrows to the 2x button specifically.
- `cook-ing-pill` is rendered per ingredient; filter by text to scope to the flour one.
- `end-cook-submit` exists in the End Cook dialog; if it's a different testid in the current code, inspect `src/lib/ui/cook/EndCookDialog.svelte`.

- [ ] **Step 3: Run the full e2e suite to catch any regressions from selector interaction**

```bash
~/.bun/bin/bun run e2e
```

Expected: 10 tests pass (8 existing + 2 new).

- [ ] **Step 4: Run the full pre-commit pipeline**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: 0 errors. Unit suite stays at 167 tests (no source changes; e2e tests are not counted by `bun test`).

- [ ] **Step 5: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add tests/e2e/multiplier.e2e.ts && git commit -m "$(cat <<'EOF'
test(e2e): cover cook-time multiplier round-trip

Two new Playwright specs. The first drives a full cook session at 2x:
toggle the multiplier, confirm the cook ingredient pills show doubled
amounts, end cook, then verify BatchDetail surfaces a 2X badge while
the legacy "Cooked at 2x" outcomeNotes marker stays absent. The
second is the control case at 1x — no badge.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Push

- [ ] **Step 1: Confirm `git status` is clean and the branch is ahead**

```bash
git status
git log --oneline origin/main..HEAD
```

Expected: working tree clean. Branch ahead by the spec, plan, and new test commits.

- [ ] **Step 2: Push**

```bash
git push
```

Expected: push succeeds.

---

## Notes for the implementer

- **Pre-commit hook** (`lefthook`) runs typecheck/lint/knip/test on commit but NOT e2e. Run `bun run e2e` explicitly before commit; the hook won't catch e2e regressions.
- **Branch policy:** stay on `main`, do not push until Task 2.
- **The test fixture uses the dev server** that Playwright starts automatically (see `playwright.config.ts`). No manual server setup required.
- **`clearTestData({ page })` is the per-test isolation hook.** It wipes the `./tests/e2e/.tmp-data` directory AND the browser's IndexedDB. Without it, recipes leak across tests.
- **If a test flakes once**, re-run the e2e suite. Playwright's auto-wait should handle most timing issues, but Vite dev-server cold-starts can make the first run slow.
- **If `cook-multiplier-badge` selector misses**, double-check `src/lib/ui/BatchDetail.svelte` — the badge only renders when `batch.cookMultiplier > 1`. The persistence path through the data layer must be intact.
