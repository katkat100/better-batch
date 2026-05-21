# Orphan-use Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the batch validator to emit an `orphan-use` issue when a step's `use` references a non-existent ingredient, and surface those issues in the inconsistency dialog and BatchDetail popover.

**Architecture:** Three changes. First the validator gets the new issue kind + emit logic with TDD coverage. Then the dialog's `describe()` and the BatchDetail popover template gain matching branches and key-tuple updates (the existing `{#each}` keys use `ingredientId+kind` which collides if a ghost id appears in two steps — add `stepIndex`). Finally a verification pass + push.

**Tech Stack:** TypeScript, Bun test, Svelte 5 runes, Playwright e2e (no new e2e — the new kind doesn't appear in app flow).

**Spec:** [`docs/superpowers/specs/2026-05-21-orphan-use-validator-design.md`](../specs/2026-05-21-orphan-use-validator-design.md)

---

## Task 1: Validator change + tests

**Files:**
- Modify: `src/lib/shared/batch-validation.ts`
- Modify: `tests/shared/batch-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Open `tests/shared/batch-validation.test.ts` and add these tests inside the existing `describe('validateBatch', ...)` block. Append them after the existing tests (file already has 12 tests; we add 4 more):

```ts
  it('flags an orphan-use when a step references an unknown ingredientId', () => {
    const issues = validateBatch(mk({
      ingredients: [],
      steps: [{ text: 'Mix', uses: [{ ingredientId: 'ghost', amount: 100 }] }]
    }));
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'orphan-use', ingredientId: 'ghost', stepIndex: 0 })
    ]);
  });

  it('multiple orphan uses in one step produce one issue per use', () => {
    const issues = validateBatch(mk({
      ingredients: [],
      steps: [{ text: 'Mix', uses: [
        { ingredientId: 'ghost-a', amount: 100 },
        { ingredientId: 'ghost-b', amount: 200 }
      ] }]
    }));
    expect(issues.length).toBe(2);
    expect(issues[0]).toEqual(expect.objectContaining({ kind: 'orphan-use', ingredientId: 'ghost-a', stepIndex: 0 }));
    expect(issues[1]).toEqual(expect.objectContaining({ kind: 'orphan-use', ingredientId: 'ghost-b', stepIndex: 0 }));
  });

  it('orphan-use issues appear after per-ingredient issues in return order', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [
        { ingredientId: 'flour', amount: 300 },
        { ingredientId: 'ghost', amount: 200 }
      ] }]
    }));
    // Expect: sum-mismatch for flour (sum=300/master=500), then orphan-use for ghost.
    expect(issues.map(i => i.kind)).toEqual(['sum-mismatch', 'orphan-use']);
  });

  it('orphan use amount does not contribute to any ingredient sum tally', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [
        { ingredientId: 'flour', amount: 300 },
        { ingredientId: 'ghost', amount: 200 }
      ] }]
    }));
    const mismatch = issues.find(i => i.kind === 'sum-mismatch')!;
    // The orphan's 200 must NOT be added to flour's sum. Sum should be 300, not 500.
    expect(mismatch.sum).toBe(300);
    expect(mismatch.master).toBe(500);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
~/.bun/bin/bun test tests/shared/batch-validation.test.ts
```

Expected: the 4 new tests fail because:
- `orphan-use` is not a valid kind yet (the existing function's `continue` skips orphans silently).
- The existing tests (12 of them) still pass.

- [ ] **Step 3: Update `IngredientIssue` and `validateBatch`**

Replace the contents of `src/lib/shared/batch-validation.ts` with:

```ts
import type { Batch } from '../data/types';
import { parseAmount } from '../ui/layout/amount-parse';

export interface IngredientIssue {
  kind: 'unreferenced' | 'sum-mismatch' | 'orphan-use';
  ingredientId: string;
  ingredientName: string;
  sum?: number;
  master?: number;
  unit?: string;
  stepIndex?: number;  // populated only for orphan-use
}

export function validateBatch(batch: Batch): IngredientIssue[] {
  const ingredientIndex = new Map(batch.ingredients.map((ing, idx) => [ing.id, idx]));
  const sums = new Map<string, number>();
  const refCounts = new Map<string, number>();
  const orphanIssues: IngredientIssue[] = [];

  for (let stepIdx = 0; stepIdx < batch.steps.length; stepIdx++) {
    const step = batch.steps[stepIdx];
    for (const use of step.uses) {
      if (!ingredientIndex.has(use.ingredientId)) {
        orphanIssues.push({
          kind: 'orphan-use',
          ingredientId: use.ingredientId,
          ingredientName: '',
          stepIndex: stepIdx
        });
        continue;
      }
      sums.set(use.ingredientId, (sums.get(use.ingredientId) ?? 0) + use.amount);
      refCounts.set(use.ingredientId, (refCounts.get(use.ingredientId) ?? 0) + 1);
    }
  }

  const ingredientIssues: IngredientIssue[] = [];
  for (const ing of batch.ingredients) {
    const refs = refCounts.get(ing.id) ?? 0;
    if (refs === 0) {
      ingredientIssues.push({ kind: 'unreferenced', ingredientId: ing.id, ingredientName: ing.name });
    }
    const master = parseAmount(ing.amount);
    if (master !== null) {
      const sum = sums.get(ing.id) ?? 0;
      if (sum !== master) {
        ingredientIssues.push({
          kind: 'sum-mismatch',
          ingredientId: ing.id,
          ingredientName: ing.name,
          sum,
          master,
          unit: ing.unit
        });
      }
    }
  }

  return [...ingredientIssues, ...orphanIssues];
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
~/.bun/bin/bun test tests/shared/batch-validation.test.ts
```

Expected: all 16 tests pass (12 existing + 4 new).

- [ ] **Step 5: Run full pipeline**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: 0 errors. Full unit suite goes from 170 → 174.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/shared/batch-validation.ts tests/shared/batch-validation.test.ts && git commit -m "$(cat <<'EOF'
feat(validator): detect orphan-use ingredient references

validateBatch now emits an `orphan-use` IngredientIssue when a step's
use references an ingredientId that doesn't exist on the batch.
Issues are emitted in step iteration order and appear after per-
ingredient issues in the return array. The orphan use's amount does
NOT contribute to any ingredient's sum tally, so a real ingredient's
sum-mismatch report stays accurate when orphans coexist.

No UI surface yet — that lands in the next task.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Dialog + popover copy (and key fix)

The existing `{#each}` keys are `ingredientId + ':' + kind`, which collide if two orphan uses share a ghost id across steps. Add `stepIndex` to the key.

**Files:**
- Modify: `src/lib/ui/InconsistencyDialog.svelte`
- Modify: `src/lib/ui/BatchDetail.svelte`

- [ ] **Step 1: Add the orphan-use branch to InconsistencyDialog's `describe()`**

In `src/lib/ui/InconsistencyDialog.svelte`, find the `describe` function (around line 29) and update it to:

```ts
  function describe(issue: IngredientIssue): string {
    if (issue.kind === 'unreferenced') {
      return `${issue.ingredientName}: never referenced in any step`;
    }
    if (issue.kind === 'orphan-use') {
      return `Step ${(issue.stepIndex ?? 0) + 1}: references a deleted ingredient`;
    }
    const sum = issue.sum ?? 0;
    const master = issue.master ?? 0;
    const unit = issue.unit ?? '';
    if (sum > master) {
      return `${issue.ingredientName}: used ${sum}${unit}, more than the ${master}${unit} listed`;
    }
    return `${issue.ingredientName}: used ${sum}${unit} of ${master}${unit}`;
  }
```

- [ ] **Step 2: Update the {#each} key in InconsistencyDialog**

Find the `{#each issues as issue ...}` line (around line 49). Change the key to include `stepIndex` so multiple orphans with the same ghost id don't collide:

```svelte
{#each issues as issue (issue.ingredientId + ':' + issue.kind + ':' + (issue.stepIndex ?? ''))}
```

- [ ] **Step 3: Add the orphan-use branch to BatchDetail popover template**

In `src/lib/ui/BatchDetail.svelte`, find the popover's `{#each detailIssues}` block (around line 108) and update the `{#if/:else if}` chain inside the `<li>` to add the orphan-use branch. The new chain reads:

```svelte
{#each detailIssues as issue (issue.ingredientId + ':' + issue.kind + ':' + (issue.stepIndex ?? ''))}
    <li class="text-ochre">
        {#if issue.kind === 'unreferenced'}
            ⚠ {issue.ingredientName}: never referenced in any step
        {:else if issue.kind === 'orphan-use'}
            ⚠ Step {(issue.stepIndex ?? 0) + 1}: references a deleted ingredient
        {:else if (issue.sum ?? 0) > (issue.master ?? 0)}
            ⚠ {issue.ingredientName}: used {issue.sum}{issue.unit ?? ''}, more than the {issue.master}{issue.unit ?? ''} listed
        {:else}
            ⚠ {issue.ingredientName}: used {issue.sum}{issue.unit ?? ''} of {issue.master}{issue.unit ?? ''}
        {/if}
    </li>
{/each}
```

The `:else if issue.kind === 'orphan-use'` branch goes BEFORE the sum-mismatch `:else if` so orphan-use issues don't fall through into the bogus "used g of g" path (orphans have neither `sum` nor `master`).

- [ ] **Step 4: Run typecheck + lint + tests**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: 0 errors. 174 unit tests still pass (no test changes in this task).

- [ ] **Step 5: Run e2e**

```bash
~/.bun/bin/bun run e2e
```

Expected: 10 e2e tests pass. No new e2e in this task; existing ones drive the dialog flow but with valid data, so the orphan-use branch is unexercised end-to-end (intentionally — covered by unit tests).

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/InconsistencyDialog.svelte src/lib/ui/BatchDetail.svelte && git commit -m "$(cat <<'EOF'
feat(ui): surface orphan-use issues in dialog and BatchDetail popover

InconsistencyDialog's describe() and BatchDetail's popover template
both gain an orphan-use branch:

  ⚠ Step N: references a deleted ingredient

Updated the {#each} keys in both places from
ingredientId+kind to ingredientId+kind+stepIndex so two orphan uses
with the same ghost id in different steps don't collide.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Final verification + push

- [ ] **Step 1: Full pipeline**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
~/.bun/bin/bun run e2e
```

Expected: all green. 174 unit tests, 10 e2e tests.

- [ ] **Step 2: Confirm `git status` is clean and the branch is ahead**

```bash
git status
git log --oneline origin/main..HEAD
```

Expected: working tree clean. Branch ahead by the spec, plan, and two feature commits.

- [ ] **Step 3: Push**

```bash
git push
```

Expected: push succeeds.

---

## Notes for the implementer

- **Pre-commit hook** (`lefthook`) runs typecheck/lint/knip/test on commit but NOT e2e. Run e2e explicitly before committing Task 2. Use `export PATH="$HOME/.bun/bin:$PATH" &&` before commits.
- **Branch policy:** stay on `main`, do not push until Task 3 Step 3.
- **The new `orphan-use` branch must come BEFORE the sum-mismatch fall-through** in both the dialog `describe()` and the BatchDetail template. If you put it last, orphan-use issues will fall through into the `sum > master` check (false for orphans because sum/master are undefined) and then into the "used X of Y" else, rendering "used undefined of undefined" or "used g of g."
- **Don't add e2e coverage for orphan-use.** It doesn't surface in normal app flow; testing it via Playwright would require manually injecting an orphan via `page.evaluate(() => indexedDB...)`, which is brittle and low-value. The unit tests are the contract.
- **The {#each} key change** is purely defensive — without orphan-use the existing key was unique, but the new kind can produce duplicates with the same `ingredientId + kind`. Including `stepIndex` makes the key unique across all three kinds.
