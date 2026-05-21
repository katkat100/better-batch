# Orphan-use detection in batch validator

**Status:** Design approved 2026-05-21.
**Owner:** Katie.

## Summary

Teach `validateBatch` to emit a new `orphan-use` issue kind when a
step's `use` references an ingredient ID that doesn't exist on the
batch. Surface those issues in `InconsistencyDialog` (save-time gate)
and the `BatchDetail` ⚠ popover (read view). The editor's existing
`×`-removes-uses-immediately behavior stays unchanged — this is
defense-in-depth against orphans that arrive via imports or
non-editor code paths.

## Motivation

The validator at `src/lib/shared/batch-validation.ts:21` currently
does `if (!ingredientIndex.has(use.ingredientId)) continue;` —
silently skipping any orphan. The editor's save flow then filters
those uses out with `s.uses.filter(u => validIds.has(...))`. If
orphans exist in a batch — for instance, after the user imports a
JSON snapshot from another machine, or after a future code path
mutates ingredients without cleaning uses — they vanish without a
trace, and the user has no way to know what was lost.

Adding an `orphan-use` issue kind closes that visibility gap. In
practice, in-app editing rarely produces orphans because removing
an ingredient also strips its uses in the same tick. The new
detection is mostly for imported data and future code-path drift.

## Behavior

### Validator

`IngredientIssue` gains a third `kind` and an optional `stepIndex`:

```ts
export interface IngredientIssue {
  kind: 'unreferenced' | 'sum-mismatch' | 'orphan-use';
  ingredientId: string;
  ingredientName: string;
  sum?: number;
  master?: number;
  unit?: string;
  stepIndex?: number;  // populated only for orphan-use
}
```

`validateBatch` emits one `orphan-use` issue per orphan use found,
in step iteration order. `ingredientName` is `''` (we don't have
the name — the ingredient is gone). `stepIndex` is the index in
`batch.steps`. Multiple orphan uses in one step produce one issue
per use.

Orphan uses do NOT contribute to sum tallies. If an ingredient with
master `500g` is used at amount `300` and a separate step has an
orphan use at amount `200`, the sum-mismatch for the real ingredient
correctly reports `sum=300` (not `500`).

Return order: per-ingredient issues (unreferenced, sum-mismatch) come
first in ingredient list order. Orphan-use issues come last in step
iteration order. Within a step, orphan uses appear in the order they
were declared on the step.

### Dialog and popover copy

`InconsistencyDialog.svelte`'s `describe()` gains an `orphan-use`
branch:

```ts
if (issue.kind === 'orphan-use') {
  return `Step ${(issue.stepIndex ?? 0) + 1}: references a deleted ingredient`;
}
```

`BatchDetail.svelte`'s popover template gains the parallel branch
in its `{#each detailIssues}` block:

```svelte
{#else if issue.kind === 'orphan-use'}
  ⚠ Step {(issue.stepIndex ?? 0) + 1}: references a deleted ingredient
```

Each orphan use becomes one item in the list. The list scrolls if
many issues accumulate; no grouping or summarization.

### Save behavior (unchanged)

The editor's existing save pipeline in `BatchEditor.svelte`'s
`doSave`:

```ts
const cleanSteps: Step[] = steps
  .filter(s => s.text.trim())
  .map(s => ({ text: s.text.trim(), uses: s.uses.filter(u => validIds.has(u.ingredientId)) }));
```

already filters orphan uses. The dialog warns the user before this
happens. Clicking "Save Anyway" lets the cleanup proceed silently.
Clicking "Fix it" returns to the editor — but the user has nothing
to fix in the normal in-app flow because orphans don't naturally
appear during editing (the `×` purges uses with the ingredient).
For imported batches with orphans, the user can re-save (which
cleans them) or just leave them visible via the badge.

### Hasn't-inconsistency badge gate (unchanged)

`BatchDetail.svelte`'s gate is already `detailIssues.length > 0 ||
batch.inconsistencyNote !== ''`. The new `orphan-use` issues count
toward `detailIssues.length` automatically — the badge shows for
batches with imported orphans even when the structured
`inconsistencyNote` is absent.

## Architecture

### Validator logic shape

```ts
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
  // ... existing per-ingredient unreferenced + sum-mismatch loop, unchanged ...

  return [...ingredientIssues, ...orphanIssues];
}
```

The split into two arrays keeps the existing per-ingredient ordering
intact and appends orphans cleanly at the end.

## Files touched

**Modified:**
- `src/lib/shared/batch-validation.ts` — new kind, stepIndex field, validator emit.
- `tests/shared/batch-validation.test.ts` — add 3 new tests covering orphan emission, ordering, and the orphan-doesn't-count-toward-sum-mismatch guarantee.
- `src/lib/ui/InconsistencyDialog.svelte` — `describe()` gets the orphan-use branch.
- `src/lib/ui/BatchDetail.svelte` — popover template gets the parallel branch.

**No editor changes.** `removeIngredient` keeps purging uses in the same tick. The dialog flow's "Fix it" path is a no-op for orphans (the user can just Save Anyway to let cleanup proceed).

**No e2e.** Native in-app flow doesn't produce orphans, so an e2e would require manually inserting one via `await page.evaluate(...)` to mutate IDB. Low value vs. cost.

## Testing

**Unit tests** in `tests/shared/batch-validation.test.ts` (added,
not replacing existing tests):

- `flags an orphan-use when a step references an unknown ingredientId` — set up a batch with `steps[0].uses[0].ingredientId = 'ghost'` and an empty `ingredients` array. Expect one `orphan-use` issue with `stepIndex: 0`.

- `multiple orphan uses in one step produce one issue per use` — `steps[0].uses` has two ghost ids. Expect two issues with `stepIndex: 0`.

- `orphan-use issues appear after per-ingredient issues in return order` — set up a batch with one numeric ingredient that's used at less than master (sum-mismatch) plus one orphan use. Expect the sum-mismatch issue at index 0 and orphan-use at index 1.

- `orphan use amount does not contribute to sum tally` — ingredient `flour` master `500`. Step uses `flour` at `300` and a ghost at `200`. Expect sum-mismatch with `sum: 300`, plus orphan-use. The orphan's `200` is uncounted.

**No new tests for the UI surfaces.** The dialog's `describe()` and
the BatchDetail popover's template both just render text from the
issue. The branching is straight string-format work; existing tests
for the dialog (none — it's pure rendering) don't cover this and
adding component tests just for one `{#else if}` branch is overkill.

## Out of scope

- Editor live-highlighting of orphan uses (orphans don't appear during normal editing).
- Auto-cleanup of orphans on validator detection (already happens on save via the editor's existing filter).
- Changing the editor's `removeIngredient` behavior (status quo: removes ingredient + uses immediately, prevents orphans).
- A dedicated "Fix orphans" UI affordance in the dialog ("Save Anyway" already triggers cleanup).
- Surfacing orphan-use issues live in the editor's ingredient list as a row highlight (orphans aren't tied to a visible ingredient row — they're step-side).

## Open questions

None at design approval time.
