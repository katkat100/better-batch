# Reorder Rows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Add up/down arrow buttons to each ingredient and step row in `BatchEditor` so the user can reorder rows.

**Architecture:** Pure-function `moveItem<T>(arr, from, to)` helper in shared lib (TDD). BatchEditor wires arrow buttons per row that call `moveItem` and reassign the underlying state array.

**Tech Stack:** Svelte 5 runes · TypeScript · Tailwind v4 · `bun:test` · Playwright

Reference: spec at `docs/superpowers/specs/2026-05-06-reorder-rows.md`.

---

## File Structure

```
src/lib/shared/
  array.ts                           # NEW: moveItem helper

src/lib/ui/
  BatchEditor.svelte                 # MODIFIED: arrow buttons on each ingredient/step row

tests/shared/
  move-item.test.ts                  # NEW

tests/e2e/
  edit-batch.e2e.ts                  # MODIFIED: assert reorder works
```

---

## Task 1: `moveItem` helper (TDD)

**Files:**
- Create: `src/lib/shared/array.ts`
- Test: `tests/shared/move-item.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// tests/shared/move-item.test.ts
import { describe, it, expect } from 'bun:test';
import { moveItem } from '../../src/lib/shared/array';

describe('moveItem', () => {
  it('moves an element from one index to another', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 1, 2)).toEqual(['a', 'c', 'b', 'd']);
  });

  it('moves to the end', () => {
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a']);
  });

  it('moves to the start', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b']);
  });

  it('returns same array (no-op) when from === to', () => {
    const arr = ['a', 'b'];
    expect(moveItem(arr, 1, 1)).toBe(arr);
  });

  it('returns same array on out-of-bounds indices', () => {
    const arr = ['a', 'b'];
    expect(moveItem(arr, -1, 0)).toBe(arr);
    expect(moveItem(arr, 0, -1)).toBe(arr);
    expect(moveItem(arr, 5, 0)).toBe(arr);
    expect(moveItem(arr, 0, 5)).toBe(arr);
  });

  it('does not mutate the input array', () => {
    const arr = ['a', 'b', 'c'];
    moveItem(arr, 0, 2);
    expect(arr).toEqual(['a', 'b', 'c']);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `~/.bun/bin/bun test tests/shared/move-item.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/shared/array.ts
/**
 * Returns a new array with `arr[from]` moved to position `to`.
 * No-op (returns the original array) for invalid or trivial moves.
 */
export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to) return arr;
  if (from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
```

- [ ] **Step 4: Run, expect PASS**

Expected: 6 pass.

- [ ] **Step 5: Run full suite — confirm no regressions**

Run: `~/.bun/bin/bun test`
Expected: 91 pass (85 prior + 6 new).

- [ ] **Step 6: Commit (controller)**

```bash
git add src/lib/shared/array.ts tests/shared/move-item.test.ts
git commit -m "feat(shared): moveItem helper"
```

---

## Task 2: Reorder arrows in BatchEditor

**Files:**
- Modify: `src/lib/ui/BatchEditor.svelte`

- [ ] **Step 1: Add the import**

In the `<script lang="ts">` block of `src/lib/ui/BatchEditor.svelte`, find the existing imports near the top and add:

```ts
  import { moveItem } from '$lib/shared/array';
```

- [ ] **Step 2: Add the arrow stack to the ingredient row**

Find the ingredient row block (the `{#each ingredients as ing, i (i)}` loop body inside the Ingredients fieldset). It currently looks like:

```svelte
      <div class="flex gap-2 items-center" data-testid="ingredient-edit-row">
        <input bind:value={ing.amount} ...
```

Replace with the row prefixed by an arrow stack:

```svelte
      <div class="flex gap-2 items-center" data-testid="ingredient-edit-row">
        <div class="flex flex-col w-5 shrink-0">
          <button
            type="button"
            onclick={() => ingredients = moveItem(ingredients, i, i - 1)}
            disabled={i === 0}
            aria-label="Move ingredient {i + 1} up"
            class="text-[10px] leading-none text-obsidian/50 hover:text-ochre disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
            data-testid="ingredient-move-up"
          >▲</button>
          <button
            type="button"
            onclick={() => ingredients = moveItem(ingredients, i, i + 1)}
            disabled={i === ingredients.length - 1}
            aria-label="Move ingredient {i + 1} down"
            class="text-[10px] leading-none text-obsidian/50 hover:text-ochre disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
            data-testid="ingredient-move-down"
          >▼</button>
        </div>
        <input bind:value={ing.amount} ...
```

(Keep the rest of the existing row markup — amount/unit/name/section/× — exactly as it is.)

- [ ] **Step 3: Add the arrow stack to the step row**

Find the step row block (the `{#each steps as step, i (i)}` loop inside the Steps fieldset). Each step row currently has a `<div class="flex flex-col gap-2 border border-drafting/50 p-3 rounded-sm" data-testid="step-edit-row">` wrapper containing a `<div class="flex gap-2 items-start">` with the step number, textarea, and × button.

Insert the arrow stack as the first child of the inner `<div class="flex gap-2 items-start">`:

```svelte
        <div class="flex gap-2 items-start">
          <div class="flex flex-col w-5 shrink-0 pt-1">
            <button
              type="button"
              onclick={() => steps = moveItem(steps, i, i - 1)}
              disabled={i === 0}
              aria-label="Move step {i + 1} up"
              class="text-[10px] leading-none text-obsidian/50 hover:text-ochre disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
              data-testid="step-move-up"
            >▲</button>
            <button
              type="button"
              onclick={() => steps = moveItem(steps, i, i + 1)}
              disabled={i === steps.length - 1}
              aria-label="Move step {i + 1} down"
              class="text-[10px] leading-none text-obsidian/50 hover:text-ochre disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
              data-testid="step-move-down"
            >▼</button>
          </div>
          <span class="font-mono text-xs text-obsidian/40 pt-2">{i + 1}.</span>
          <textarea ... />
          <button type="button" onclick={() => removeStep(i)} ...>×</button>
        </div>
```

(Keep the existing number/textarea/× exactly as they are.)

- [ ] **Step 4: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200, no errors in log.

- [ ] **Step 5: Run unit suite — confirm no regressions**

Run: `~/.bun/bin/bun test`
Expected: 91 pass.

- [ ] **Step 6: Run svelte-check — confirm 0 warnings**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 7: Commit (controller)**

```bash
git add src/lib/ui/BatchEditor.svelte
git commit -m "feat(ui): up/down arrow reorder buttons on ingredient and step rows"
```

---

## Task 3: E2E reorder coverage

**Files:**
- Modify: `tests/e2e/edit-batch.e2e.ts`

The existing E2E adds two ingredients (`flour`, `water`) and two steps. We extend it to click the arrow buttons and assert reordering.

- [ ] **Step 1: Read the existing test**

Open `tests/e2e/edit-batch.e2e.ts` and locate the section after both ingredients are added (after the `water` ingredient name input is filled) and before the steps section (before `getByTestId('add-step-btn')` is clicked).

- [ ] **Step 2: Add an ingredient-reorder assertion**

Insert this block right after the second ingredient is added (after `await ingRows.nth(1).locator('input').nth(2).fill('water');`):

```ts
  // Verify reorder: move water up, water becomes index 0
  await ingRows.nth(1).getByTestId('ingredient-move-up').click();
  await expect(ingRows.nth(0).locator('input').nth(2)).toHaveValue('water');
  await expect(ingRows.nth(1).locator('input').nth(2)).toHaveValue('flour');
  // Move water back down to restore order for the rest of the test
  await ingRows.nth(0).getByTestId('ingredient-move-down').click();
  await expect(ingRows.nth(0).locator('input').nth(2)).toHaveValue('flour');
```

- [ ] **Step 3: Add a step-reorder assertion**

After both step rows are added (after the second step's text is filled), but before the `await page.getByTestId('batch-submit').click();` call, insert:

```ts
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
```

- [ ] **Step 4: Run the E2E suite**

Run: `~/.bun/bin/bun run e2e`
Expected: 5 passed (existing tests pass, edit-batch now also exercises reorder).

- [ ] **Step 5: Run unit suite — confirm 91 pass**

- [ ] **Step 6: Commit (controller)**

```bash
git add tests/e2e/edit-batch.e2e.ts
git commit -m "test(e2e): cover ingredient and step reorder arrows"
```

---

## Self-review notes

**Spec coverage:**
- Spec §2 (`moveItem` helper) → Task 1
- Spec §3.1 (ingredient row arrows) → Task 2 Step 2
- Spec §3.2 (step row arrows) → Task 2 Step 3
- Spec §3.3 (layout impact, fixed-width arrow column) → Task 2 (`w-5 shrink-0`)
- Spec §4 (reordering semantics — array position changes, section grouping recomputes) → no code change needed; existing `IngredientList` already groups by first-occurrence in array order.
- Spec §5 (read-only surfaces unchanged) → confirmed by inspection; no other files touched.
- Spec §7 (testing — moveItem unit tests + E2E) → Tasks 1, 3.

**Type consistency:**
- `moveItem<T>(arr: T[], from: number, to: number): T[]` — same signature in spec, helper, and BatchEditor calls.
- `data-testid` names match between component (`ingredient-move-up/down`, `step-move-up/down`) and E2E test.

**Risks (also flagged in spec §8):**
- Mobile horizontal cramping — `w-5` (20px) is tight; if the row breaks on phones, polish pass can move arrows to a different layout. Out of scope for this plan.
- Many-row reorder is tap-by-tap. Drag-and-drop is a future polish; spec §6 already calls this out.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-reorder-rows.md`. 3 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Same pattern as before.
**2. Inline Execution**

**Which approach?**
