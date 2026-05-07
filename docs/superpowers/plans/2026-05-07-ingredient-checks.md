# Ingredient Consistency Checks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Catch three ingredient inconsistencies in a batch (unreferenced, sum under, sum over), highlight them inline in the editor, gate save behind a confirm-with-note dialog when issues exist, and badge any saved batch that was overridden so the note is visible on its detail view.

**Architecture:** A pure validator in `src/lib/shared/batch-validation.ts` returns structured issues from a `Batch`. `BatchEditor` derives issues reactively, paints live highlights for math errors (always) and unreferenced (after first save attempt), and routes save through a new `InconsistencyDialog` when issues exist. The user can fix or override-with-note; the override note persists on `Batch.inconsistencyNote` and auto-clears on any clean save. `BatchDetail` recomputes issues on render and shows a `⚠` badge with a popover that lists current issues plus the saved note.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Bun test, Playwright.

**Spec:** [`docs/superpowers/specs/2026-05-07-ingredient-checks-design.md`](../specs/2026-05-07-ingredient-checks-design.md)

---

## Task 1: Validator pure function

Build the validator first; everything else depends on it.

**Files:**
- Create: `src/lib/shared/batch-validation.ts`
- Test: `tests/shared/batch-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/batch-validation.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { validateBatch } from '../../src/lib/shared/batch-validation';
import type { Batch } from '../../src/lib/server/domain/types';

const mk = (over: Partial<Batch> = {}): Batch => ({
  id: 'b1', recipeId: 'r1', label: 'b1', parentIds: [],
  status: 'draft', cookedAt: null, variables: {},
  ingredients: [], steps: [], outcomeNotes: '', rating: null,
  createdAt: '2026-05-07T00:00:00Z',
  ...over
});

describe('validateBatch', () => {
  it('empty batch has no issues', () => {
    expect(validateBatch(mk())).toEqual([]);
  });

  it('flags an ingredient that is not referenced in any step', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [] }]
    }));
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'unreferenced', ingredientId: 'flour', ingredientName: 'Flour' })
    ]);
  });

  it('passes when sum of uses equals numeric master', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [{ ingredientId: 'flour', amount: 500 }] }]
    }));
    expect(issues).toEqual([]);
  });

  it('flags sum-mismatch when sum < master (under-allocation)', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [{ ingredientId: 'flour', amount: 480 }] }]
    }));
    expect(issues).toEqual([
      expect.objectContaining({
        kind: 'sum-mismatch', ingredientId: 'flour', sum: 480, master: 500, unit: 'g'
      })
    ]);
  });

  it('flags sum-mismatch when sum > master (over-allocation)', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [{ ingredientId: 'flour', amount: 520 }] }]
    }));
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'sum-mismatch', sum: 520, master: 500 })
    ]);
  });

  it('skips math check when master is non-numeric', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'salt', name: 'Salt', amount: 'to taste', unit: '' }],
      steps: [{ text: 'Season', uses: [{ ingredientId: 'salt', amount: 0 }] }]
    }));
    expect(issues).toEqual([]);
  });

  it('still flags unreferenced when master is non-numeric', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'salt', name: 'Salt', amount: 'to taste', unit: '' }],
      steps: [{ text: 'Mix', uses: [] }]
    }));
    expect(issues).toEqual([
      expect.objectContaining({ kind: 'unreferenced', ingredientId: 'salt' })
    ]);
  });

  it('aggregates uses across multiple steps', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [
        { text: 'Pre-ferment', uses: [{ ingredientId: 'flour', amount: 100 }] },
        { text: 'Final dough', uses: [{ ingredientId: 'flour', amount: 400 }] }
      ]
    }));
    expect(issues).toEqual([]);
  });

  it('garnish-style 0 use against numeric master fires sum-mismatch but not unreferenced', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'crisp', name: 'Snowflake crisp', amount: '100', unit: 'g' }],
      steps: [{ text: 'Dust', uses: [{ ingredientId: 'crisp', amount: 0 }] }]
    }));
    expect(issues.map(i => i.kind)).toEqual(['sum-mismatch']);
  });

  it('returns both kinds for one ingredient with unreferenced first', () => {
    // unreferenced AND has numeric master >0, so we expect: unreferenced, sum-mismatch (sum=0, master=500)
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [] }]
    }));
    expect(issues.map(i => i.kind)).toEqual(['unreferenced', 'sum-mismatch']);
  });

  it('ignores step uses whose ingredientId no longer matches any ingredient', () => {
    const issues = validateBatch(mk({
      ingredients: [{ id: 'flour', name: 'Flour', amount: '500', unit: 'g' }],
      steps: [{ text: 'Mix', uses: [
        { ingredientId: 'flour', amount: 500 },
        { ingredientId: 'ghost', amount: 999 }
      ] }]
    }));
    expect(issues).toEqual([]);
  });

  it('orders issues by ingredient list order', () => {
    const issues = validateBatch(mk({
      ingredients: [
        { id: 'a', name: 'A', amount: '100', unit: 'g' },
        { id: 'b', name: 'B', amount: '100', unit: 'g' }
      ],
      steps: [{ text: 'Mix', uses: [
        { ingredientId: 'b', amount: 50 },
        { ingredientId: 'a', amount: 50 }
      ] }]
    }));
    // Both have sum-mismatch (50/100). Order should follow ingredients[].
    expect(issues.map(i => i.ingredientId)).toEqual(['a', 'b']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
~/.bun/bin/bun test tests/shared/batch-validation.test.ts
```

Expected: every test fails with "Cannot find module '../../src/lib/shared/batch-validation'" or similar.

- [ ] **Step 3: Implement the validator**

Create `src/lib/shared/batch-validation.ts`:

```ts
import type { Batch } from '../server/domain/types';
import { parseAmount } from '../ui/layout/amount-parse';

export type IngredientIssueKind = 'unreferenced' | 'sum-mismatch';

export interface IngredientIssue {
  kind: IngredientIssueKind;
  ingredientId: string;
  ingredientName: string;
  sum?: number;
  master?: number;
  unit?: string;
}

export function validateBatch(batch: Batch): IngredientIssue[] {
  const ingredientIndex = new Map(batch.ingredients.map((ing, idx) => [ing.id, idx]));
  const sums = new Map<string, number>();
  const refCounts = new Map<string, number>();

  for (const step of batch.steps) {
    for (const use of step.uses) {
      if (!ingredientIndex.has(use.ingredientId)) continue;
      sums.set(use.ingredientId, (sums.get(use.ingredientId) ?? 0) + use.amount);
      refCounts.set(use.ingredientId, (refCounts.get(use.ingredientId) ?? 0) + 1);
    }
  }

  const issues: IngredientIssue[] = [];
  for (const ing of batch.ingredients) {
    const refs = refCounts.get(ing.id) ?? 0;
    if (refs === 0) {
      issues.push({ kind: 'unreferenced', ingredientId: ing.id, ingredientName: ing.name });
    }
    const master = parseAmount(ing.amount);
    if (master !== null) {
      const sum = sums.get(ing.id) ?? 0;
      if (sum !== master) {
        issues.push({
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
  return issues;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
~/.bun/bin/bun test tests/shared/batch-validation.test.ts
```

Expected: all 11 tests pass.

- [ ] **Step 5: Run typecheck and lint**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
```

Expected: 0 errors, 0 warnings on both.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/batch-validation.ts tests/shared/batch-validation.test.ts
git commit -m "feat: add batch ingredient validator"
```

---

## Task 2: Add `inconsistencyNote` field through the data layer

Thread the optional field through types, storage, API route, and api-client. No UI yet.

**Files:**
- Modify: `src/lib/server/domain/types.ts:45-59` (Batch interface)
- Modify: `src/lib/server/storage/batches.ts:7-17` (CreateBatchInput)
- Modify: `src/lib/server/storage/batches.ts:38-60` (createBatch)
- Modify: `src/routes/api/recipes/[id]/batches/+server.ts:27-32` (POST body wiring)
- Modify: `src/lib/ui/api-client.ts:28-43` (createBatch input type)

- [ ] **Step 1: Add the optional field to `Batch`**

In `src/lib/server/domain/types.ts`, add `inconsistencyNote?: string;` to the `Batch` interface. Place it after `rating` and before `createdAt`:

```ts
export interface Batch {
  id: string;
  recipeId: string;
  label: string;
  parentIds: string[];
  status: BatchStatus;
  cookedAt: string | null;
  cookDurationMs?: number;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
  outcomeNotes: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  inconsistencyNote?: string;
  createdAt: string;
}
```

- [ ] **Step 2: Add the field to `CreateBatchInput` and pass it through `createBatch`**

In `src/lib/server/storage/batches.ts`, update the interface and the build of `batch`:

```ts
interface CreateBatchInput {
  label: string;
  parentIds: string[];
  status: BatchStatus;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
  outcomeNotes?: string;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  cookedAt?: string | null;
  inconsistencyNote?: string;
}
```

In `createBatch`, add the field to the constructed `batch` object only when **truthy** (so empty string / undefined never persists — see the storage convention note below):

```ts
const batch: Batch = {
  id, recipeId,
  label: input.label,
  parentIds: input.parentIds,
  status: input.status,
  cookedAt: input.cookedAt ?? null,
  variables: input.variables,
  ingredients: input.ingredients,
  steps: input.steps,
  outcomeNotes: input.outcomeNotes ?? '',
  rating: input.rating ?? null,
  ...(input.inconsistencyNote ? { inconsistencyNote: input.inconsistencyNote } : {}),
  createdAt: now
};
```

**Storage convention (used by both `createBatch` and `updateBatch` once Task 5 lands):** falsy `inconsistencyNote` (empty string or undefined) means *don't persist the field*. Truthy means *persist*. The editor in Task 5 will send `''` on a clean save (clears any prior value via `updateBatch`) and a single space `' '` when the user overrides with an empty note (so the badge still shows).

- [ ] **Step 3: Wire the field through the POST handler**

In `src/routes/api/recipes/[id]/batches/+server.ts`, add to the `createBatch` call:

```ts
const batch = await createBatch(params.id, {
  label: body.label, parentIds: body.parentIds, status: body.status,
  variables: body.variables ?? {}, ingredients: body.ingredients ?? [], steps: body.steps ?? [],
  outcomeNotes: body.outcomeNotes, rating: body.rating ?? null,
  cookedAt: body.status === 'cooked' ? (body.cookedAt ?? new Date().toISOString()) : null,
  inconsistencyNote: typeof body.inconsistencyNote === 'string' ? body.inconsistencyNote : undefined
});
```

- [ ] **Step 4: Add the field to the api-client `createBatch` input**

In `src/lib/ui/api-client.ts`, extend the `createBatch` input type:

```ts
async createBatch(recipeId: string, input: {
  label: string;
  parentIds: string[];
  status: BatchStatus;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
  outcomeNotes?: string;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  inconsistencyNote?: string;
}): Promise<Batch> {
```

`patchBatch` already takes `Partial<Batch>` so it accepts `inconsistencyNote` automatically — no change needed.

- [ ] **Step 5: Run typecheck**

```bash
~/.bun/bin/bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Run the existing test suite**

```bash
~/.bun/bin/bun test
```

Expected: 109+ tests pass (the 108 existing plus the 11 new validator tests from Task 1). No failures.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/domain/types.ts src/lib/server/storage/batches.ts src/routes/api/recipes/\[id\]/batches/+server.ts src/lib/ui/api-client.ts
git commit -m "feat(types): add optional Batch.inconsistencyNote field"
```

---

## Task 3: Live editor highlights for sum-mismatch issues

Wire the validator into `BatchEditor` and paint math-error highlights on the ingredient list and use rows. Unreferenced highlights stay dark in this task — those are gated by a flag added in Task 5.

**Files:**
- Modify: `src/lib/ui/BatchEditor.svelte` (add issue derivation; pass to ingredient row + UsesEditor)
- Modify: `src/lib/ui/UsesEditor.svelte` (extend chip color + accept ochre-row hint)

- [ ] **Step 1: Import the validator in `BatchEditor.svelte`**

At the top of the `<script>` block in `src/lib/ui/BatchEditor.svelte`, alongside other imports:

```ts
import { validateBatch, type IngredientIssue } from '$lib/shared/batch-validation';
```

- [ ] **Step 2: Derive issues reactively in `BatchEditor.svelte`**

Add this near the other `$derived` declarations (around the existing `sectionOptions`-style derivations):

```ts
const liveIssues = $derived<IngredientIssue[]>(validateBatch({
  id: existing?.id ?? 'draft',
  recipeId: recipe.id,
  label: label.trim() || 'draft',
  parentIds: existing?.parentIds ?? (parent ? [parent.id] : []),
  status,
  cookedAt: existing?.cookedAt ?? null,
  variables,
  ingredients,
  steps,
  outcomeNotes: existing?.outcomeNotes ?? '',
  rating: existing?.rating ?? null,
  createdAt: existing?.createdAt ?? new Date().toISOString()
}));

const sumMismatchIds = $derived(new Set(
  liveIssues.filter(i => i.kind === 'sum-mismatch').map(i => i.ingredientId)
));
const unreferencedIds = $derived(new Set(
  liveIssues.filter(i => i.kind === 'unreferenced').map(i => i.ingredientId)
));
```

- [ ] **Step 3: Apply ochre border to ingredient rows with sum-mismatch**

In the existing ingredient `{#each ingredients as ing, i (i)}` block (around line 258 of the file), add a class binding to the row's outer `<div>`:

```svelte
<div
  class="flex gap-2 items-start md:items-center {sumMismatchIds.has(ing.id) ? 'border border-ochre rounded-sm p-1 -m-1' : ''}"
  data-testid="ingredient-edit-row"
  data-ingredient-issue={sumMismatchIds.has(ing.id) ? 'sum-mismatch' : undefined}
>
```

- [ ] **Step 4: Show a `⚠ used N/M unit` chip next to a flagged ingredient name**

Inside the same row, after the Name `<TextInput>` (so it appears beside the name on desktop, beneath on mobile), insert a small `{#if}`:

```svelte
{#if sumMismatchIds.has(ing.id)}
  {@const issue = liveIssues.find(x => x.kind === 'sum-mismatch' && x.ingredientId === ing.id)!}
  <span
    class="text-[10px] text-ochre whitespace-nowrap order-4 md:order-none md:self-center"
    data-testid="ingredient-sum-warning"
    data-ingredient-id={ing.id}
  >⚠ used {issue.sum}/{issue.master}{issue.unit ?? ''}</span>
{/if}
```

- [ ] **Step 5: Pass the mismatch set into `UsesEditor`**

Where `UsesEditor` is rendered (around line 369 of `BatchEditor.svelte`), add the `mismatchedIds` prop:

```svelte
<UsesEditor
  bind:uses={steps[i].uses}
  ingredients={ingredients.filter(ing => ing.id && ing.name)}
  allUses={allUsesAcross(i)}
  mismatchedIds={sumMismatchIds}
/>
```

(Keep whatever existing props are passed; just add `mismatchedIds`.)

- [ ] **Step 6: Accept the prop and apply ochre border in `UsesEditor.svelte`**

In `src/lib/ui/UsesEditor.svelte`, extend the props block:

```ts
let {
  ingredients,
  uses = $bindable([]),
  allUses = [],
  mismatchedIds = new Set<string>()
}: {
  ingredients: Ingredient[];
  uses?: IngredientUse[];
  allUses?: IngredientUse[];
  mismatchedIds?: Set<string>;
} = $props();
```

Apply the border to each use row's grid container (around the existing `<div class="grid grid-cols-...`):

```svelte
<div
  class="grid grid-cols-[1fr_6rem_2rem_1.5rem] gap-2 items-center text-sm {mismatchedIds.has(use.ingredientId) ? 'border border-ochre rounded-sm p-1 -m-1' : ''}"
  data-testid="use-row"
  data-use-issue={mismatchedIds.has(use.ingredientId) ? 'sum-mismatch' : undefined}
>
```

- [ ] **Step 7: Extend the per-step allocation chip to color on any mismatch (not just overflow)**

In `UsesEditor.svelte`, find the existing per-ingredient summary chips:

```svelte
{@const overflowing = !Number.isNaN(master) && sum > master}
<span class={overflowing ? 'text-ochre' : ''} data-testid="allocation-indicator" data-ingredient={ingId}>
```

Replace the `overflowing` line and the class with a more general mismatch flag (keeping `overflowing` for backwards-compatible tests if any):

```svelte
{@const mismatched = !Number.isNaN(master) && sum !== master}
<span class={mismatched ? 'text-ochre' : ''} data-testid="allocation-indicator" data-ingredient={ingId}>
```

- [ ] **Step 8: Run typecheck**

```bash
~/.bun/bin/bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 9: Run test suite**

```bash
~/.bun/bin/bun test
```

Expected: all existing tests still pass.

- [ ] **Step 10: Manual smoke check**

Start the dev server and confirm:
1. Editing a batch with `flour 500g` and a step using `flour 480g` → flour ingredient row + use row both show ochre border, chip says `⚠ used 480/500g`.
2. Editing a clean batch shows no ochre anywhere.

```bash
~/.bun/bin/bun run dev
```

Open the recipes page, edit a batch, verify the highlight appears/disappears as you change use amounts. Stop the server when done.

- [ ] **Step 11: Commit**

```bash
git add src/lib/ui/BatchEditor.svelte src/lib/ui/UsesEditor.svelte
git commit -m "feat(editor): live highlights for ingredient math mismatch"
```

---

## Task 4: `InconsistencyDialog` component

Build the modal in isolation. Wire-up to the editor happens in Task 5.

**Files:**
- Create: `src/lib/ui/InconsistencyDialog.svelte`

- [ ] **Step 1: Implement the dialog**

Create `src/lib/ui/InconsistencyDialog.svelte`:

```svelte
<!-- src/lib/ui/InconsistencyDialog.svelte -->
<script lang="ts">
  import Dialog from './primitives/Dialog.svelte';
  import Button from './primitives/Button.svelte';
  import type { IngredientIssue } from '$lib/shared/batch-validation';

  let {
    open = $bindable(false),
    issues,
    onFix,
    onSaveAnyway
  }: {
    open?: boolean;
    issues: IngredientIssue[];
    onFix: () => void;
    onSaveAnyway: (note: string) => void;
  } = $props();

  let confirming = $state(false);
  let note = $state('');

  $effect(() => {
    if (open) {
      confirming = false;
      note = '';
    }
  });

  function describe(issue: IngredientIssue): string {
    if (issue.kind === 'unreferenced') {
      return `${issue.ingredientName}: never referenced in any step`;
    }
    const sum = issue.sum ?? 0;
    const master = issue.master ?? 0;
    const unit = issue.unit ?? '';
    if (sum > master) {
      return `${issue.ingredientName}: used ${sum}${unit}, more than the ${master}${unit} listed`;
    }
    return `${issue.ingredientName}: used ${sum}${unit} of ${master}${unit}`;
  }
</script>

<Dialog bind:open title="Ingredient inconsistencies" onClose={onFix}>
  <div class="flex flex-col gap-4" data-testid="inconsistency-dialog">
    <p class="text-sm text-obsidian/70">
      Some ingredients don't add up. You can fix them, or save anyway and add a note explaining why.
    </p>
    <ul class="font-mono text-sm space-y-1" data-testid="inconsistency-list">
      {#each issues as issue (issue.ingredientId + ':' + issue.kind)}
        <li class="text-ochre">⚠ {describe(issue)}</li>
      {/each}
    </ul>

    {#if confirming}
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Optional note (why is this intentional?)</span>
        <textarea
          bind:value={note}
          rows="3"
          class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm font-mono text-sm"
          data-testid="inconsistency-note"
        ></textarea>
      </label>
      <div class="flex gap-2 justify-end">
        <Button type="button" variant="dashed" onclick={() => confirming = false}>Back</Button>
        <Button type="button" onclick={() => onSaveAnyway(note.trim())} data-testid="inconsistency-confirm-save">
          Save anyway
        </Button>
      </div>
    {:else}
      <div class="flex gap-2 justify-end">
        <Button type="button" variant="dashed" onclick={onFix} data-testid="inconsistency-fix">
          Fix it
        </Button>
        <Button type="button" onclick={() => confirming = true} data-testid="inconsistency-save-anyway">
          Save anyway
        </Button>
      </div>
    {/if}
  </div>
</Dialog>
```

- [ ] **Step 2: Verify it compiles**

```bash
~/.bun/bin/bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ui/InconsistencyDialog.svelte
git commit -m "feat: add InconsistencyDialog component"
```

---

## Task 5: Wire dialog into save flow + override-note persistence + unreferenced highlight gate

Replace `BatchEditor.svelte`'s direct save with a gate, persist the note, auto-clear on clean save, and turn on unreferenced highlights after the first save attempt.

**Files:**
- Modify: `src/lib/ui/BatchEditor.svelte` (submit flow, dialog state, unreferenced flag, unreferenced highlight render)

- [ ] **Step 1: Import the dialog and add state**

In `src/lib/ui/BatchEditor.svelte`, add to imports:

```ts
import InconsistencyDialog from './InconsistencyDialog.svelte';
```

Add to component-state declarations (near the existing `error`, `submitting` state):

```ts
let showUnreferencedHighlights = $state(false);
let inconsistencyDialogOpen = $state(false);
let pendingSubmit = $state<((note: string | null) => Promise<void>) | null>(null);
```

- [ ] **Step 2: Refactor `submit` to gate on issues**

Replace the existing `async function submit(e: SubmitEvent)` (around line 152) with the following. Key convention: `finalNote` is computed exactly once, and the values follow the storage rule from Task 2 — empty string clears, single space means "overridden with no user note," real string is the note.

```ts
async function submit(e: SubmitEvent) {
  e.preventDefault();
  if (!label.trim()) { error = 'Label required'; return; }

  if (liveIssues.length > 0) {
    pendingSubmit = (note: string) => doSave(note);
    inconsistencyDialogOpen = true;
    return;
  }
  await doSave(null);
}

async function doSave(noteOverride: string | null): Promise<void> {
  submitting = true;
  error = null;
  try {
    const cleanIngredients = ingredients.filter(i => i.name.trim());
    const validIds = new Set(cleanIngredients.map(i => i.id));
    const cleanSteps: Step[] = steps
      .filter(s => s.text.trim())
      .map(s => ({ text: s.text.trim(), uses: s.uses.filter(u => validIds.has(u.ingredientId)) }));

    // Recompute against the cleaned data we're actually about to save.
    const cleanedSnapshot = {
      id: existing?.id ?? 'draft',
      recipeId: recipe.id,
      label: label.trim(),
      parentIds: existing?.parentIds ?? (parent ? [parent.id] : []),
      status,
      cookedAt: existing?.cookedAt ?? null,
      variables,
      ingredients: cleanIngredients,
      steps: cleanSteps,
      outcomeNotes: existing?.outcomeNotes ?? '',
      rating: existing?.rating ?? null,
      createdAt: existing?.createdAt ?? new Date().toISOString()
    };
    const cleanedIssues = validateBatch(cleanedSnapshot);

    // finalNote convention (matches storage rule from Task 2):
    //   '' (empty)        → clear any prior note (auto-clear on clean save)
    //   ' ' (single space) → user overrode with no note text (badge still shows)
    //   real string        → user's note
    let finalNote: string;
    if (cleanedIssues.length === 0) {
      finalNote = '';
    } else {
      finalNote = (noteOverride ?? '').trim() || ' ';
    }

    let result: Batch;
    if (mode === 'edit' && existing) {
      result = await api.patchBatch(recipe.id, existing.id, {
        label: label.trim(),
        status,
        variables,
        ingredients: cleanIngredients,
        steps: cleanSteps,
        inconsistencyNote: finalNote
      });
    } else {
      result = await api.createBatch(recipe.id, {
        label: label.trim(),
        parentIds: parent ? [parent.id] : [],
        status,
        variables,
        ingredients: cleanIngredients,
        steps: cleanSteps,
        inconsistencyNote: finalNote
      });
    }
    goto(resolve(`/recipes/${recipe.id}?batch=${result.id}`));
  } catch (err) {
    error = err instanceof Error ? err.message : 'Failed to save batch';
  } finally {
    submitting = false;
    inconsistencyDialogOpen = false;
    pendingSubmit = null;
  }
}

function handleFixIt() {
  showUnreferencedHighlights = true;
  inconsistencyDialogOpen = false;
  pendingSubmit = null;
}

async function handleSaveAnyway(note: string) {
  showUnreferencedHighlights = true;
  if (pendingSubmit) await pendingSubmit(note);
}
```

- [ ] **Step 3: Update `updateBatch` storage to drop falsy `inconsistencyNote`**

In `src/lib/server/storage/batches.ts`, update `updateBatch` (around line 100) to enforce the same falsy-means-drop rule that `createBatch` got in Task 2:

```ts
export async function updateBatch(recipeId: string, batchId: string, patch: Partial<Batch>): Promise<Batch> {
  const current = await readBatch(recipeId, batchId);
  const next: Batch = { ...current, ...patch, id: current.id, recipeId: current.recipeId, createdAt: current.createdAt };
  if ('inconsistencyNote' in patch && !patch.inconsistencyNote) {
    delete (next as Partial<Batch>).inconsistencyNote;
  }
  await writeFileAtomic(await batchFile(recipeId, batchId), JSON.stringify(next, null, 2));
  return next;
}
```

This handles two cases together:
- The editor sent `inconsistencyNote: ''` because there are no issues → field gets dropped, badge disappears on next read.
- A user clears the field via some future tool that sends `null` (falsy) → also dropped.

Truthy strings (including the single-space sentinel `' '` from an override-with-no-note) pass through unchanged.

Also verify the PATCH endpoint passes `inconsistencyNote` through to `updateBatch`. Check the file:

```bash
grep -n "patch\|inconsistency\|updateBatch" src/routes/api/recipes/\[id\]/batches/\[batchId\]/+server.ts
```

If the endpoint passes `body` directly into `updateBatch` (or spreads everything), no change needed. If it allowlists fields, add `inconsistencyNote` to the allowed set so the field is forwarded to storage.

- [ ] **Step 4: Render the dialog and apply the unreferenced highlight gate**

At the bottom of `BatchEditor.svelte`'s template, after the form, render:

```svelte
<InconsistencyDialog
  bind:open={inconsistencyDialogOpen}
  issues={liveIssues}
  onFix={handleFixIt}
  onSaveAnyway={handleSaveAnyway}
/>
```

Update the ingredient row's class binding from Task 3 Step 3 to also color when unreferenced AND the gate is open:

```svelte
<div
  class="flex gap-2 items-start md:items-center {sumMismatchIds.has(ing.id) || (showUnreferencedHighlights && unreferencedIds.has(ing.id)) ? 'border border-ochre rounded-sm p-1 -m-1' : ''}"
  data-testid="ingredient-edit-row"
  data-ingredient-issue={
    sumMismatchIds.has(ing.id) ? 'sum-mismatch'
    : (showUnreferencedHighlights && unreferencedIds.has(ing.id)) ? 'unreferenced'
    : undefined
  }
>
```

After the existing `⚠ used N/M unit` chip (Task 3 Step 4), add an alternative chip for unreferenced when the gate is open:

```svelte
{#if showUnreferencedHighlights && unreferencedIds.has(ing.id) && !sumMismatchIds.has(ing.id)}
  <span
    class="text-[10px] text-ochre whitespace-nowrap order-4 md:order-none md:self-center"
    data-testid="ingredient-unreferenced-warning"
    data-ingredient-id={ing.id}
  >⚠ never used</span>
{/if}
```

- [ ] **Step 5: Run typecheck**

```bash
~/.bun/bin/bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Run the full test suite**

```bash
~/.bun/bin/bun test
```

Expected: all tests pass.

- [ ] **Step 7: Manual smoke check**

```bash
~/.bun/bin/bun run dev
```

1. Edit a batch, leave one ingredient unused, click Save → dialog appears listing the issue.
2. Click "Fix it" → dialog closes, unreferenced ingredient now shows ⚠ never used.
3. Edit again to fix everything, Save → no dialog, save proceeds.
4. Edit a batch with math wrong, Save → dialog → "Save anyway" → enter note "garnish" → confirm → batch saves.

Stop the server when done.

- [ ] **Step 8: Commit**

```bash
git add src/lib/ui/BatchEditor.svelte src/lib/server/storage/batches.ts
git commit -m "feat(editor): gate save on ingredient inconsistencies with override note"
```

---

## Task 6: BatchDetail badge and tooltip

Surface saved-batch inconsistencies on the read-side view.

**Files:**
- Modify: `src/lib/ui/BatchDetail.svelte` (header, badge, popover)

- [ ] **Step 1: Import the validator in `BatchDetail.svelte`**

Near the top of the `<script>` block:

```ts
import { validateBatch, type IngredientIssue } from '$lib/shared/batch-validation';
```

- [ ] **Step 2: Derive issues and badge visibility**

Add inside the `<script>` block (alongside other derivations):

```ts
const detailIssues = $derived<IngredientIssue[]>(validateBatch(batch));
const hasInconsistency = $derived(
  detailIssues.length > 0 || (batch.inconsistencyNote !== undefined && batch.inconsistencyNote !== '')
);
let popoverOpen = $state(false);
```

- [ ] **Step 3: Add the badge inside the existing header `<div>`**

In `src/lib/ui/BatchDetail.svelte` around line 82, add the badge directly after the `<h2>`:

```svelte
<h2 class="font-serif text-2xl">{batch.label}</h2>
{#if hasInconsistency}
  <button
    type="button"
    class="text-ochre text-sm align-middle ml-1 relative"
    aria-label="Show ingredient inconsistencies"
    onclick={() => popoverOpen = !popoverOpen}
    data-testid="inconsistency-badge"
  >⚠
    {#if popoverOpen}
      <span
        role="dialog"
        class="absolute left-0 top-full mt-1 z-10 w-72 bg-canvas border border-drafting rounded-sm shadow-md p-3 text-left"
        data-testid="inconsistency-popover"
      >
        {#if detailIssues.length > 0}
          <ul class="font-mono text-xs space-y-1">
            {#each detailIssues as issue (issue.ingredientId + ':' + issue.kind)}
              <li class="text-ochre">
                {#if issue.kind === 'unreferenced'}
                  ⚠ {issue.ingredientName}: never referenced in any step
                {:else if (issue.sum ?? 0) > (issue.master ?? 0)}
                  ⚠ {issue.ingredientName}: used {issue.sum}{issue.unit ?? ''}, more than the {issue.master}{issue.unit ?? ''} listed
                {:else}
                  ⚠ {issue.ingredientName}: used {issue.sum}{issue.unit ?? ''} of {issue.master}{issue.unit ?? ''}
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
        {#if batch.inconsistencyNote && batch.inconsistencyNote.trim()}
          <p class="text-xs text-obsidian/70 whitespace-pre-wrap mt-2 pt-2 border-t border-drafting">
            <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Note:</span>
            {batch.inconsistencyNote}
          </p>
        {/if}
      </span>
    {/if}
  </button>
{/if}
```

- [ ] **Step 4: Run typecheck and lint**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Manual smoke check**

```bash
~/.bun/bin/bun run dev
```

1. Open a saved batch that was overridden in the previous task → ⚠ badge appears next to the label.
2. Click the badge → popover lists current issues + the saved note.
3. Open a clean batch → no badge.

Stop the server when done.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ui/BatchDetail.svelte
git commit -m "feat(detail): badge saved batches with ingredient inconsistencies"
```

---

## Task 7: End-to-end Playwright spec

One e2e test covering the save → dialog → "Save anyway" → reload → badge round-trip.

**Files:**
- Create: `tests/e2e/ingredient-inconsistency.e2e.ts`

- [ ] **Step 1: Look at an existing e2e spec for the boilerplate pattern**

```bash
ls tests/e2e/
head -40 tests/e2e/*.e2e.ts | head -80
```

Note the project's pattern for `test()`, `expect()`, page setup, and any test helpers (e.g. seeding a recipe). Use the same imports and structure.

- [ ] **Step 2: Write the failing e2e test**

Create `tests/e2e/ingredient-inconsistency.e2e.ts` modeled on the discovered pattern. The body must cover:

```ts
import { test, expect } from '@playwright/test';

test('saving with an unused ingredient prompts override-with-note and surfaces a badge', async ({ page }) => {
  // 1. Create a recipe and start a new batch using whatever flow other e2e tests use.
  //    (Reuse helpers if any exist; otherwise navigate via the UI.)
  // 2. Add an ingredient ("Flour", amount "500", unit "g").
  // 3. Add a step with text "Mix" and NO uses of flour.
  // 4. Click the save button (data-testid="batch-submit").
  // 5. Expect data-testid="inconsistency-dialog" to be visible and to list "Flour: never referenced in any step".
  // 6. Click data-testid="inconsistency-save-anyway".
  // 7. Fill data-testid="inconsistency-note" with "intentional, scaffold batch".
  // 8. Click data-testid="inconsistency-confirm-save".
  // 9. Expect navigation to the batch detail; data-testid="inconsistency-badge" is visible.
  // 10. Click the badge; expect data-testid="inconsistency-popover" containing
  //     "never referenced in any step" and the note text.
});

test('clean batch saves without dialog and shows no badge', async ({ page }) => {
  // 1. Create a recipe + batch with one ingredient ("Salt", "1", "tsp") and one step
  //    using all of it (uses: salt amount 1).
  // 2. Click save.
  // 3. Expect no dialog (data-testid="inconsistency-dialog" not visible) and direct navigation to detail.
  // 4. Expect no badge (data-testid="inconsistency-badge" not visible).
});
```

(Fill in the actual UI navigation steps using existing test-id selectors. Reference selectors already in the codebase: `data-testid="batch-label"`, `data-testid="add-ingredient-btn"`, `data-testid="ingredient-edit-row"` per row, `data-testid="add-step-btn"`, `data-testid="step-text"`, `data-testid="add-use-btn"`, `data-testid="use-ingredient"`, `data-testid="use-amount"`, `data-testid="batch-submit"`.)

- [ ] **Step 3: Run the e2e suite**

```bash
~/.bun/bin/bun run e2e
```

Expected: the new tests pass alongside existing ones.

- [ ] **Step 4: If any e2e fails, debug**

If selectors or flow differ from your assumptions, inspect the page, fix selectors, rerun. Don't add `waitForTimeout` — use Playwright's auto-waiting `expect(...).toBeVisible()` etc.

- [ ] **Step 5: Run the full pre-commit pipeline**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun test
~/.bun/bin/bun run e2e
```

Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e/ingredient-inconsistency.e2e.ts
git commit -m "test(e2e): cover ingredient inconsistency save flow"
```

---

## Task 8: Final verification + push

- [ ] **Step 1: Run the full pre-commit pipeline one last time**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
~/.bun/bin/bun run e2e
```

Expected: all green.

- [ ] **Step 2: Confirm `git status` is clean**

```bash
git status
```

Expected: working tree clean, branch ahead by 7 commits (one per Task 1-7).

- [ ] **Step 3: Push**

```bash
git push
```

Expected: push succeeds.

---

## Notes for the implementer

- **Do not skip the failing-test step in Task 1.** The test file is the contract.
- **Task 2 is purely structural** — the field is plumbed through but unused by UI yet. Don't try to wire UI in this task.
- **The note-string convention is consistent across Tasks 2 and 5:** truthy persists, falsy (empty or undefined) drops. The single-space sentinel `' '` represents "user overrode with no note text" and intentionally counts as truthy so the badge survives. This avoids adding a separate `inconsistencyAcknowledged` boolean — if you find yourself reaching for one, stop and re-read.
- **Task 7 e2e** must follow the established pattern in the existing `tests/e2e/` directory. If the pattern differs from this plan's pseudocode (e.g., different recipe-seeding helper), use the existing pattern.
- **Auto-clear** of the inconsistencyNote happens in two places: the editor sends `inconsistencyNote: ''` on clean save, and the storage layer drops the field on empty-string PATCH. Both must be in place for the round-trip "override → fix → clean badge" flow to work.
