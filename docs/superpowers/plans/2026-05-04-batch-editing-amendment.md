# Batch Editing Amendment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Implement the four batch-editing changes from `docs/superpowers/specs/2026-05-04-batch-editing-amendment.md`: edit drafts in place, group ingredients into optional sections, link ingredients to specific steps, and split single ingredients across multiple steps.

**Architecture:** Backwards-compatible read-time migration in storage; pure-function helpers (slug generation, fraction parsing, allocation summing) covered by TDD; UI changes split across focused Svelte components. The per-step ingredient picker is extracted into its own `UsesEditor.svelte` so `BatchEditor.svelte` stays manageable.

**Tech Stack:** SvelteKit (Svelte 5 runes) · Bun · TypeScript · Tailwind v4 · `bun:test` · Playwright

Reference: spec at `docs/superpowers/specs/2026-05-04-batch-editing-amendment.md`. Foundation context in `docs/superpowers/specs/2026-05-04-better-batch-design.md`.

---

## File Structure

Files this plan creates or modifies:

```
src/
  lib/
    server/
      domain/
        types.ts                                # MODIFIED: Ingredient.id, .section, Step type
      storage/
        batches.ts                              # MODIFIED: legacy-shape migration in readBatch
    ui/
      IngredientList.svelte                     # MODIFIED: render by section
      StepsList.svelte                          # MODIFIED: render uses per step, take ingredients prop
      BatchDetail.svelte                        # MODIFIED: pass ingredients to StepsList; Edit + Edit-outcome buttons
      BatchEditor.svelte                        # MODIFIED: mode flag, sections, auto-IDs, UsesEditor integration
      UsesEditor.svelte                         # NEW: per-step ingredient picker
      OutcomeForm.svelte                        # MODIFIED: edit-outcome mode
      layout/
        amount-parse.ts                         # NEW: parseAmount("1/2") -> 0.5
  routes/
    api/recipes/[id]/batches/[batchId]/+server.ts  # MODIFIED: PATCH validation
    recipes/[id]/batches/[batchId]/edit/
      +page.server.ts                           # NEW: load + draft check
      +page.svelte                              # NEW: BatchEditor in edit mode

tests/
  domain/
    amount-parse.test.ts                        # NEW
  storage/
    batches.test.ts                             # MODIFIED: add legacy-shape migration tests
  api/
    batches.test.ts                             # MODIFIED: add PATCH validation tests
  e2e/
    edit-batch.e2e.ts                           # NEW: end-to-end edit flow
```

---

## Task 1: Domain types + storage migration

**Files:**
- Modify: `src/lib/server/domain/types.ts`
- Modify: `src/lib/server/storage/batches.ts`
- Test: `tests/storage/batches.test.ts` (add new tests; do not remove existing ones)

- [ ] **Step 1: Update types**

Edit `src/lib/server/domain/types.ts`. Replace the `Ingredient` interface and add `IngredientUse` + `Step`:

```ts
export interface Ingredient {
  id: string;
  name: string;
  amount: string;
  unit: string;
  section?: string;
}

export interface IngredientUse {
  ingredientId: string;
  amount: number;
}

export interface Step {
  text: string;
  uses: IngredientUse[];
}
```

In the `Batch` interface, change `steps: string[]` to `steps: Step[]`.

- [ ] **Step 2: Write the failing migration tests**

Add the following tests to the bottom of `tests/storage/batches.test.ts` (inside the existing `describe('batch storage', () => { ... })` block, before its closing brace):

```ts
  it('migrates legacy ingredients (no id, no section) on read', async () => {
    const r = await createRecipe({ name: 'Legacy', preset: 'custom', tags: [] });
    // Hand-write a legacy-shape batch file
    const { writeFileAtomic } = await import('../../src/lib/server/storage/atomic');
    const { batchFile, batchesDir } = await import('../../src/lib/server/storage/paths');
    const { mkdir } = await import('node:fs/promises');
    await mkdir(await batchesDir(r.id), { recursive: true });
    const legacy = {
      id: 'v1-legacy', recipeId: r.id, label: 'legacy', parentIds: [],
      status: 'draft', cookedAt: null,
      variables: {},
      ingredients: [
        { name: 'Flour', amount: '500', unit: 'g' },
        { name: 'Flour', amount: '100', unit: 'g' }, // duplicate name
        { name: 'Salt', amount: '10', unit: 'g' }
      ],
      steps: ['Mix flour and water', 'Bake'],
      outcomeNotes: '', rating: null,
      createdAt: '2026-01-01T00:00:00Z'
    };
    await writeFileAtomic(await batchFile(r.id, 'v1-legacy'), JSON.stringify(legacy, null, 2));

    const { readBatch } = await import('../../src/lib/server/storage/batches');
    const back = await readBatch(r.id, 'v1-legacy');

    // Ingredients have stable, unique ids
    expect(back.ingredients[0].id).toBe('flour');
    expect(back.ingredients[1].id).toBe('flour-2');
    expect(back.ingredients[2].id).toBe('salt');
    // Section is undefined when missing
    expect(back.ingredients[0].section).toBeUndefined();
    // Steps migrated to objects
    expect(back.steps).toEqual([
      { text: 'Mix flour and water', uses: [] },
      { text: 'Bake', uses: [] }
    ]);
  });

  it('migration is idempotent (read → write → read produces identical structure)', async () => {
    const r = await createRecipe({ name: 'Idempotent', preset: 'custom', tags: [] });
    const b = await createBatch(r.id, {
      label: 'v1',
      parentIds: [],
      status: 'draft',
      variables: {},
      ingredients: [
        { id: 'flour', name: 'Flour', amount: '500', unit: 'g', section: 'Final Dough' }
      ],
      steps: [{ text: 'Mix', uses: [{ ingredientId: 'flour', amount: 250 }] }],
    });
    const first = await readBatch(r.id, b.id);
    await updateBatch(r.id, b.id, {});
    const second = await readBatch(r.id, b.id);
    expect(second).toEqual(first);
  });
```

Note the existing tests in this file pass `steps: []` and `ingredients: []` which still work post-migration (empty arrays don't need migration). They should continue to pass.

- [ ] **Step 3: Update `CreateBatchInput` and `Batch` callers**

`src/lib/server/storage/batches.ts` exports `CreateBatchInput`. Update the type to accept the new shapes:

```ts
import type { Batch, BatchStatus, Ingredient, VariableValue, Step } from '../domain/types';

export interface CreateBatchInput {
  label: string;
  parentIds: string[];
  status: BatchStatus;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
  outcomeNotes?: string;
  rating?: 1 | 2 | 3 | 4 | 5 | null;
  cookedAt?: string | null;
}
```

(`Ingredient` already requires `id` per Step 1; existing callers will need to update — see Step 6.)

- [ ] **Step 4: Implement migration in `readBatch`**

In `src/lib/server/storage/batches.ts`, add migration helper and use it inside `readBatch`. Replace the existing `readBatch` function:

```ts
import { slugify, uniqueSlug } from '../domain/slug';

interface LegacyIngredient { id?: string; name: string; amount: string; unit: string; section?: string; }
type RawStep = string | { text: string; uses?: IngredientUse[] };

function migrateBatchOnRead(raw: any): Batch {
  // Ingredients: ensure id, leave section as-is (undefined if absent)
  const taken = new Set<string>();
  const ingredients: Ingredient[] = (raw.ingredients ?? []).map((ing: LegacyIngredient) => {
    let id = ing.id;
    if (!id) {
      id = uniqueSlug(slugify(ing.name || 'ingredient'), taken);
    }
    taken.add(id);
    return { id, name: ing.name, amount: ing.amount, unit: ing.unit, section: ing.section };
  });

  // Steps: string → { text, uses: [] }; object passes through (with empty uses default)
  const steps: Step[] = (raw.steps ?? []).map((s: RawStep) => {
    if (typeof s === 'string') return { text: s, uses: [] };
    return { text: s.text, uses: s.uses ?? [] };
  });

  return {
    ...raw,
    ingredients,
    steps
  } as Batch;
}

export async function readBatch(recipeId: string, batchId: string): Promise<Batch> {
  const raw = JSON.parse(await readFile(await batchFile(recipeId, batchId), 'utf8'));
  return migrateBatchOnRead(raw);
}
```

Make sure `IngredientUse` and `Step` are imported from `../domain/types` at the top of the file.

- [ ] **Step 5: Run, expect FAIL initially then PASS**

Run: `~/.bun/bin/bun test tests/storage/batches.test.ts`

Expected: 6 pass (4 existing + 2 new). If existing tests fail because they pass legacy `Ingredient` shape (without `id`) into `createBatch`, update them to include an explicit `id`. The existing tests pass `ingredients: []` and `steps: []` so they should be fine.

- [ ] **Step 6: Update any existing test fixtures that don't include `id`**

Search the codebase for places that construct `Ingredient` or `Step` literals:

```bash
grep -rn "ingredients:" tests/ src/lib/server/ src/routes/api/
grep -rn "steps:" tests/ src/lib/server/ src/routes/api/
```

For each fixture missing `id`, add it (e.g. `{ id: 'flour', name: 'flour', amount: '500', unit: 'g' }`). For each step that's a string literal, wrap as `{ text: 'Mix', uses: [] }`.

`tests/domain/merge.test.ts` and `tests/domain/diff.test.ts` are likely affected — check carefully.

- [ ] **Step 7: Run full suite**

Run: `~/.bun/bin/bun test`
Expected: 49 pass, 0 fail (47 prior + 2 new).

- [ ] **Step 8: Commit (controller)**

```bash
git add src/lib/server/domain/types.ts src/lib/server/storage/batches.ts tests/
git commit -m "feat(domain): Ingredient.id+section, structured Step, read-time migration"
```

---

## Task 2: Amount parsing helper

**Files:**
- Create: `src/lib/ui/layout/amount-parse.ts`
- Test: `tests/domain/amount-parse.test.ts`

Pure function for parsing the per-step amount input ("1/2", "0.5", "50") into a number. Used by `UsesEditor`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/domain/amount-parse.test.ts
import { describe, it, expect } from 'bun:test';
import { parseAmount } from '../../src/lib/ui/layout/amount-parse';

describe('parseAmount', () => {
  it('parses plain numbers', () => {
    expect(parseAmount('50')).toBe(50);
    expect(parseAmount('0.5')).toBe(0.5);
    expect(parseAmount('100.25')).toBe(100.25);
  });

  it('parses simple fractions', () => {
    expect(parseAmount('1/2')).toBe(0.5);
    expect(parseAmount('3/4')).toBe(0.75);
    expect(parseAmount('1/3')).toBeCloseTo(0.333, 3);
  });

  it('parses mixed numbers', () => {
    expect(parseAmount('1 1/2')).toBe(1.5);
    expect(parseAmount('2 3/4')).toBe(2.75);
  });

  it('trims whitespace', () => {
    expect(parseAmount('  50  ')).toBe(50);
    expect(parseAmount(' 1/2 ')).toBe(0.5);
  });

  it('returns null for invalid input', () => {
    expect(parseAmount('')).toBe(null);
    expect(parseAmount('abc')).toBe(null);
    expect(parseAmount('1/0')).toBe(null);
    expect(parseAmount('1/')).toBe(null);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `~/.bun/bin/bun test tests/domain/amount-parse.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/lib/ui/layout/amount-parse.ts
export function parseAmount(input: string): number | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Mixed number: "1 1/2"
  const mixed = trimmed.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) {
    const whole = parseInt(mixed[1], 10);
    const num = parseInt(mixed[2], 10);
    const den = parseInt(mixed[3], 10);
    if (den === 0) return null;
    return whole + (num / den) * (whole < 0 ? -1 : 1);
  }

  // Simple fraction: "1/2"
  const frac = trimmed.match(/^(-?\d+)\/(\d+)$/);
  if (frac) {
    const num = parseInt(frac[1], 10);
    const den = parseInt(frac[2], 10);
    if (den === 0) return null;
    return num / den;
  }

  // Plain number: "50", "0.5"
  const n = parseFloat(trimmed);
  if (Number.isFinite(n) && /^-?\d*\.?\d+$/.test(trimmed)) return n;
  return null;
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Run full suite — confirm no regressions**

- [ ] **Step 6: Commit (controller)**

```bash
git add src/lib/ui/layout/amount-parse.ts tests/domain/amount-parse.test.ts
git commit -m "feat(ui): amount-parse helper for fractions and mixed numbers"
```

---

## Task 3: API PATCH validation

**Files:**
- Modify: `src/routes/api/recipes/[id]/batches/[batchId]/+server.ts`
- Test: `tests/api/batches.test.ts` (add new tests, keep existing)

Per spec §5.3:
- Cooked / archived batches accept patches that *only* touch `outcomeNotes`, `rating`, or `status`. Reject patches that include `ingredients`, `steps`, `variables`, `label`, or `parentIds` with HTTP 403.
- Drafts accept anything, but step `uses` must reference ingredient IDs that exist in the batch's ingredients. Otherwise 400.

- [ ] **Step 1: Write the failing tests**

Add to `tests/api/batches.test.ts` inside the existing `describe('batches api', () => { ... })`:

```ts
  it('rejects ingredient changes on a cooked batch (403)', async () => {
    await recipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) } as any);
    const v1 = await (await listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) } as any)).json();
    await onePATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'cooked' }), headers: { 'content-type': 'application/json' } }) } as any);

    await expect(
      onePATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ ingredients: [{ id: 'salt', name: 'salt', amount: '5', unit: 'g' }] }), headers: { 'content-type': 'application/json' } }) } as any)
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows outcomeNotes/rating patch on a cooked batch', async () => {
    await recipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) } as any);
    const v1 = await (await listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) } as any)).json();
    await onePATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ status: 'cooked' }), headers: { 'content-type': 'application/json' } }) } as any);

    const updated = await (await onePATCH({ params: { id: 'a', batchId: v1.id }, request: new Request('http://x', { method: 'PATCH', body: JSON.stringify({ outcomeNotes: 'great', rating: 5 }), headers: { 'content-type': 'application/json' } }) } as any)).json();
    expect(updated.outcomeNotes).toBe('great');
    expect(updated.rating).toBe(5);
  });

  it('rejects step.uses with unknown ingredientId (400)', async () => {
    await recipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) } as any);
    const v1 = await (await listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) } as any)).json();

    await expect(
      onePATCH({
        params: { id: 'a', batchId: v1.id },
        request: new Request('http://x', {
          method: 'PATCH',
          body: JSON.stringify({
            ingredients: [{ id: 'flour', name: 'flour', amount: '500', unit: 'g' }],
            steps: [{ text: 'mix', uses: [{ ingredientId: 'ghost', amount: 100 }] }]
          }),
          headers: { 'content-type': 'application/json' }
        })
      } as any)
    ).rejects.toMatchObject({ status: 400 });
  });
```

- [ ] **Step 2: Run, expect FAIL**

Run: `~/.bun/bin/bun test tests/api/batches.test.ts`

- [ ] **Step 3: Update PATCH handler**

Replace the PATCH function in `src/routes/api/recipes/[id]/batches/[batchId]/+server.ts`:

```ts
import { json, error } from '@sveltejs/kit';
import { readBatch, updateBatch, deleteBatch, rebuildIndex } from '../../../../../../lib/server/index.js';
import type { Batch, IngredientUse, Step } from '../../../../../../lib/server/index.js';

const FROZEN_FIELDS = new Set(['ingredients', 'steps', 'variables', 'label', 'parentIds']);

export async function GET({ params }) {
  try { return json(await readBatch(params.id, params.batchId)); }
  catch (err: any) { if (err.code === 'ENOENT') throw error(404, 'batch not found'); throw err; }
}

export async function PATCH({ params, request }) {
  const patch = await request.json();
  let current: Batch;
  try { current = await readBatch(params.id, params.batchId); }
  catch (err: any) { if (err.code === 'ENOENT') throw error(404, 'batch not found'); throw err; }

  // Frozen-field check for cooked/archived batches
  if (current.status === 'cooked' || current.status === 'archived') {
    const touchedFrozen = Object.keys(patch).filter(k => FROZEN_FIELDS.has(k));
    if (touchedFrozen.length > 0) {
      throw error(403, `Cannot edit ${touchedFrozen.join(', ')} on a ${current.status} batch`);
    }
  }

  // Auto-stamp cookedAt when flipping to cooked
  if (patch.status === 'cooked' && !patch.cookedAt) patch.cookedAt = new Date().toISOString();

  // Referential integrity for step.uses
  const ingredients = (patch.ingredients ?? current.ingredients) as Batch['ingredients'];
  const ingredientIds = new Set(ingredients.map(i => i.id));
  const steps = (patch.steps ?? current.steps) as Step[];
  for (let i = 0; i < steps.length; i++) {
    for (const use of steps[i].uses ?? []) {
      if (!ingredientIds.has(use.ingredientId)) {
        throw error(400, `Step ${i + 1} references unknown ingredient '${use.ingredientId}'`);
      }
    }
  }

  const next = await updateBatch(params.id, params.batchId, patch);
  await rebuildIndex();
  return json(next);
}

export async function DELETE({ params }) {
  await deleteBatch(params.id, params.batchId);
  await rebuildIndex();
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `~/.bun/bin/bun test tests/api/batches.test.ts`
Expected: 6 pass (3 existing + 3 new).

- [ ] **Step 5: Run full suite**

- [ ] **Step 6: Commit (controller)**

```bash
git add 'src/routes/api/recipes/[id]/batches/[batchId]/+server.ts' tests/api/batches.test.ts
git commit -m "feat(api): PATCH validation for frozen cooked-batch fields and step.uses references"
```

---

## Task 4: IngredientList renders by section

**Files:**
- Modify: `src/lib/ui/IngredientList.svelte`

Per spec §4.2: render ingredients grouped by `section`, with uncategorized ones first, then named sections in first-occurrence order.

- [ ] **Step 1: Replace the file**

```svelte
<!-- src/lib/ui/IngredientList.svelte -->
<script lang="ts">
  import type { Ingredient } from '$lib/server';
  let { ingredients }: { ingredients: Ingredient[] } = $props();

  type Group = { section: string | null; items: Ingredient[] };

  const groups = $derived.by<Group[]>(() => {
    const order: (string | null)[] = [];
    const map = new Map<string | null, Ingredient[]>();
    for (const ing of ingredients) {
      const key = ing.section && ing.section.trim() ? ing.section.trim() : null;
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(ing);
    }
    // Uncategorized (null) renders first regardless of when it appeared
    const sorted = [...order].sort((a, b) => {
      if (a === null && b !== null) return -1;
      if (b === null && a !== null) return 1;
      return order.indexOf(a) - order.indexOf(b);
    });
    return sorted.map(section => ({ section, items: map.get(section)! }));
  });
</script>

{#if ingredients.length === 0}
  <p class="text-sm text-obsidian/40 italic">No ingredients recorded.</p>
{:else}
  <div class="flex flex-col gap-3">
    {#each groups as group (group.section ?? '__none__')}
      {#if group.section !== null}
        <div class="text-[10px] uppercase tracking-wider text-obsidian/50 border-b border-drafting pb-1">
          {group.section}
        </div>
      {/if}
      <ul class="font-mono text-sm space-y-1">
        {#each group.items as ing (ing.id)}
          <li class="flex gap-3 border-b border-drafting/50 pb-1" data-testid="ingredient-row" data-ingredient-id={ing.id}>
            <span class="text-ochre min-w-[80px]">{ing.amount}{ing.unit ? ` ${ing.unit}` : ''}</span>
            <span>{ing.name}</span>
          </li>
        {/each}
      </ul>
    {/each}
  </div>
{/if}
```

- [ ] **Step 2: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200 response and no errors in `/tmp/bb-dev.log`.

- [ ] **Step 3: Run unit suite**

Expected: no regressions.

- [ ] **Step 4: Commit (controller)**

```bash
git add src/lib/ui/IngredientList.svelte
git commit -m "feat(ui): IngredientList grouped by optional section"
```

---

## Task 5: StepsList renders uses per step

**Files:**
- Modify: `src/lib/ui/StepsList.svelte`

Per spec §4.2: each step's text gets a "uses" footer line listing the ingredients with their amounts.

- [ ] **Step 1: Replace the file**

```svelte
<!-- src/lib/ui/StepsList.svelte -->
<script lang="ts">
  import type { Step, Ingredient } from '$lib/server';

  let { steps, ingredients }: { steps: Step[]; ingredients: Ingredient[] } = $props();

  const ingredientById = $derived(new Map(ingredients.map(i => [i.id, i] as const)));
</script>

{#if steps.length === 0}
  <p class="text-sm text-obsidian/40 italic">No steps recorded.</p>
{:else}
  <ol class="space-y-3 text-sm">
    {#each steps as step, i (i)}
      <li class="flex gap-3" data-testid="step-row" data-step-index={i}>
        <span class="font-mono text-ochre min-w-[24px]">{i + 1}.</span>
        <div class="flex-1 flex flex-col gap-1">
          <span>{step.text}</span>
          {#if step.uses.length > 0}
            <div class="text-xs font-mono text-obsidian/60" data-testid="step-uses">
              {#each step.uses as use, ui (ui)}
                {@const ing = ingredientById.get(use.ingredientId)}
                {#if ing}
                  <span>{use.amount}{ing.unit ? ing.unit : ''} {ing.name}</span>{#if ui < step.uses.length - 1}<span class="text-drafting"> · </span>{/if}
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
{/if}
```

- [ ] **Step 2: Verify dev server compiles** (same as Task 4 Step 2)

- [ ] **Step 3: Run unit suite — confirm no regressions**

- [ ] **Step 4: Commit (controller)**

```bash
git add src/lib/ui/StepsList.svelte
git commit -m "feat(ui): StepsList renders ingredient uses per step"
```

---

## Task 6: BatchDetail action bar updates

**Files:**
- Modify: `src/lib/ui/BatchDetail.svelte`

Pass `batch.ingredients` into `StepsList`; add Edit + Edit-outcome buttons.

- [ ] **Step 1: Update the file**

Replace `src/lib/ui/BatchDetail.svelte` (delta from current):
- The `<StepsList steps={batch.steps} />` call needs `ingredients={batch.ingredients}`.
- Add `onEditOutcome` callback prop.
- In the action bar header: when `batch.status === 'draft'`, show an `Edit` link in addition to `Mark as Cooked`. When `batch.status === 'cooked'`, show an `Edit Outcome` button.

```svelte
<!-- src/lib/ui/BatchDetail.svelte -->
<script lang="ts">
  import VariableTile from './VariableTile.svelte';
  import IngredientList from './IngredientList.svelte';
  import StepsList from './StepsList.svelte';
  import Rating from './Rating.svelte';
  import type { Recipe, Batch } from '$lib/server';

  let {
    recipe,
    batch,
    onMarkCooked = () => {},
    onEditOutcome = () => {}
  }: {
    recipe: Recipe;
    batch: Batch;
    onMarkCooked?: () => void;
    onEditOutcome?: () => void;
  } = $props();

  const cookedDateLabel = $derived(
    batch.cookedAt ? new Date(batch.cookedAt).toLocaleDateString() : null
  );
</script>

<article class="flex flex-col gap-5" data-testid="batch-detail" data-batch-id={batch.id}>
  <header class="flex items-start justify-between border-b border-drafting pb-3">
    <div>
      <h2 class="font-serif text-2xl">{batch.id}</h2>
      <p class="text-sm text-obsidian/60">{batch.label}</p>
      {#if batch.status === 'cooked' && cookedDateLabel}
        <p class="text-[11px] uppercase tracking-wider text-juniper mt-1">Cooked {cookedDateLabel}</p>
      {:else if batch.status === 'draft'}
        <p class="text-[11px] uppercase tracking-wider text-ochre mt-1">Draft</p>
      {:else}
        <p class="text-[11px] uppercase tracking-wider text-obsidian/40 mt-1">Archived</p>
      {/if}
    </div>
    <div class="flex gap-2">
      <a
        href="/recipes/{recipe.id}/new-batch?from={batch.id}"
        class="border border-ochre text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm"
        data-testid="new-batch-btn"
      >+ New Batch</a>
      {#if batch.status === 'draft'}
        <a
          href="/recipes/{recipe.id}/batches/{batch.id}/edit"
          class="border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
          data-testid="edit-batch-btn"
        >Edit</a>
        <button
          type="button"
          onclick={onMarkCooked}
          class="border border-juniper text-juniper px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-juniper hover:text-canvas rounded-sm"
          data-testid="mark-cooked-btn"
        >Mark as Cooked</button>
      {:else if batch.status === 'cooked'}
        <button
          type="button"
          onclick={onEditOutcome}
          class="border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
          data-testid="edit-outcome-btn"
        >Edit Outcome</button>
      {/if}
    </div>
  </header>

  {#if recipe.variableSchema.length > 0}
    <section class="flex flex-wrap gap-2" data-testid="variable-strip">
      {#each recipe.variableSchema as schema}
        <VariableTile {schema} value={batch.variables[schema.name] ?? null} />
      {/each}
    </section>
  {/if}

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Ingredients</h3>
    <IngredientList ingredients={batch.ingredients} />
  </section>

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Steps</h3>
    <StepsList steps={batch.steps} ingredients={batch.ingredients} />
  </section>

  {#if batch.status === 'cooked'}
    <section class="flex flex-col gap-2 border-t border-drafting pt-4">
      <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Outcome</h3>
      {#if batch.outcomeNotes}
        <p class="text-sm whitespace-pre-wrap">{batch.outcomeNotes}</p>
      {:else}
        <p class="text-sm text-obsidian/40 italic">No notes recorded.</p>
      {/if}
      <Rating value={batch.rating} />
    </section>
  {/if}
</article>
```

- [ ] **Step 2: Wire `onEditOutcome` in the recipe page**

Modify `src/routes/recipes/[id]/+page.svelte` script section:
- Add a separate state for editing outcome: `let editingOutcome = $state<Batch | null>(null);`
- Add a handler: `function handleEditOutcome() { if (selected && selected.status === 'cooked') editingOutcome = selected; }`
- Pass `onEditOutcome={handleEditOutcome}` into `<BatchDetail>`.
- Render OutcomeForm in two cases: when `cooking` is set (mark-as-cooked path) OR when `editingOutcome` is set (edit-outcome path). For the second, pass a new prop `mode="edit"` (added in Task 9).

Replace the relevant block:

```svelte
<script lang="ts">
  import BatchGraph from '$lib/ui/BatchGraph.svelte';
  import BatchDetail from '$lib/ui/BatchDetail.svelte';
  import OutcomeForm from '$lib/ui/OutcomeForm.svelte';
  import type { Recipe, Batch } from '$lib/server';

  let { data }: { data: { recipe: Recipe; batches: Batch[] } } = $props();

  let selectedId = $state<string | null>(data.recipe.currentBatchId ?? data.batches[0]?.id ?? null);
  let cooking = $state<Batch | null>(null);
  let editingOutcome = $state<Batch | null>(null);

  const selected = $derived(data.batches.find(b => b.id === selectedId) ?? null);

  function handleMarkCooked() {
    if (selected && selected.status === 'draft') cooking = selected;
  }
  function handleEditOutcome() {
    if (selected && selected.status === 'cooked') editingOutcome = selected;
  }
</script>
```

And below the main layout block:

```svelte
{#if cooking}
  <OutcomeForm batch={cooking} recipeId={data.recipe.id} mode="cook" onClose={() => cooking = null} />
{/if}
{#if editingOutcome}
  <OutcomeForm batch={editingOutcome} recipeId={data.recipe.id} mode="edit" onClose={() => editingOutcome = null} />
{/if}
```

(`mode` prop on `OutcomeForm` is added in Task 9. Until that lands, the second invocation will be a no-op or show the same form — that's acceptable; we'll fix in Task 9.)

- [ ] **Step 3: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

- [ ] **Step 4: Run unit suite**

- [ ] **Step 5: Commit (controller)**

```bash
git add src/lib/ui/BatchDetail.svelte src/routes/recipes/[id]/+page.svelte
git commit -m "feat(ui): BatchDetail Edit + Edit-outcome buttons"
```

---

## Task 7: Edit route + BatchEditor mode flag

**Files:**
- Create: `src/routes/recipes/[id]/batches/[batchId]/edit/+page.server.ts`
- Create: `src/routes/recipes/[id]/batches/[batchId]/edit/+page.svelte`
- Modify: `src/lib/ui/BatchEditor.svelte`

- [ ] **Step 1: Create the edit page loader**

```ts
// src/routes/recipes/[id]/batches/[batchId]/edit/+page.server.ts
import { error, redirect } from '@sveltejs/kit';
import { readRecipe, readBatch } from '../../../../../../lib/server/index.js';

export async function load({ params }) {
  let recipe, batch;
  try {
    recipe = await readRecipe(params.id);
    batch = await readBatch(params.id, params.batchId);
  } catch (err: any) {
    if (err.code === 'ENOENT') throw error(404, 'Not found');
    throw err;
  }
  if (batch.status !== 'draft') {
    throw redirect(303, `/recipes/${params.id}`);
  }
  return { recipe, batch };
}
```

- [ ] **Step 2: Create the edit page**

```svelte
<!-- src/routes/recipes/[id]/batches/[batchId]/edit/+page.svelte -->
<script lang="ts">
  import BatchEditor from '$lib/ui/BatchEditor.svelte';
  import type { Recipe, Batch } from '$lib/server';
  let { data }: { data: { recipe: Recipe; batch: Batch } } = $props();
</script>

<div class="max-w-4xl mx-auto p-6">
  <BatchEditor recipe={data.recipe} parent={null} mode="edit" existing={data.batch} />
</div>
```

- [ ] **Step 3: Update BatchEditor to support edit mode**

Replace `src/lib/ui/BatchEditor.svelte` (the script section and the form heading; rest of the form body unchanged for now — sections + uses come in Tasks 8/9/10):

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from './api-client';
  import type { Recipe, Batch, Ingredient, VariableValue, BatchStatus, Step } from '$lib/server';

  let {
    recipe,
    parent,
    mode = 'create',
    existing = null
  }: {
    recipe: Recipe;
    parent: Batch | null;
    mode?: 'create' | 'edit';
    existing?: Batch | null;
  } = $props();

  // Source object — either the parent (create mode) or the batch being edited
  const source = $derived(mode === 'edit' ? existing : parent);

  let label = $state(
    mode === 'edit' && existing
      ? existing.label
      : (parent ? `from ${parent.id}` : 'initial')
  );
  let status = $state<BatchStatus>(
    mode === 'edit' && existing ? existing.status : 'draft'
  );
  let variables = $state<Record<string, VariableValue>>(
    mode === 'edit' && existing
      ? { ...existing.variables }
      : Object.fromEntries(recipe.variableSchema.map(s => [s.name, parent?.variables[s.name] ?? null]))
  );
  let ingredients = $state<Ingredient[]>(
    mode === 'edit' && existing
      ? existing.ingredients.map(i => ({ ...i }))
      : (parent ? parent.ingredients.map(i => ({ ...i })) : [])
  );
  let steps = $state<Step[]>(
    mode === 'edit' && existing
      ? existing.steps.map(s => ({ text: s.text, uses: s.uses.map(u => ({ ...u })) }))
      : (parent ? parent.steps.map(s => ({ text: s.text, uses: s.uses.map(u => ({ ...u })) })) : [])
  );

  let submitting = $state(false);
  let error = $state<string | null>(null);

  function addIngredient() { ingredients = [...ingredients, { id: '', name: '', amount: '', unit: '' }]; }
  function removeIngredient(i: number) {
    const removedId = ingredients[i].id;
    ingredients = ingredients.filter((_, idx) => idx !== i);
    // Drop any uses that referenced the removed ingredient
    steps = steps.map(s => ({ ...s, uses: s.uses.filter(u => u.ingredientId !== removedId) }));
  }
  function addStep() { steps = [...steps, { text: '', uses: [] }]; }
  function removeStep(i: number) { steps = steps.filter((_, idx) => idx !== i); }

  function setVariable(name: string, raw: string, type: 'number' | 'text') {
    if (raw === '') { variables = { ...variables, [name]: null }; return; }
    if (type === 'number') {
      const n = parseFloat(raw);
      variables = { ...variables, [name]: Number.isFinite(n) ? n : raw };
    } else {
      variables = { ...variables, [name]: raw };
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!label.trim()) { error = 'Label required'; return; }
    submitting = true;
    error = null;
    try {
      // Drop ingredient rows with empty names; renumber and rebuild use refs
      const cleanIngredients = ingredients.filter(i => i.name.trim());
      const validIds = new Set(cleanIngredients.map(i => i.id));
      const cleanSteps: Step[] = steps
        .filter(s => s.text.trim())
        .map(s => ({ text: s.text.trim(), uses: s.uses.filter(u => validIds.has(u.ingredientId)) }));

      let result: Batch;
      if (mode === 'edit' && existing) {
        result = await api.patchBatch(recipe.id, existing.id, {
          label: label.trim(),
          status,
          variables,
          ingredients: cleanIngredients,
          steps: cleanSteps
        });
      } else {
        result = await api.createBatch(recipe.id, {
          label: label.trim(),
          parentIds: parent ? [parent.id] : [],
          status,
          variables,
          ingredients: cleanIngredients,
          steps: cleanSteps
        });
      }
      goto(`/recipes/${recipe.id}?batch=${result.id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save batch';
    } finally {
      submitting = false;
    }
  }
</script>
```

Update the heading in the form template:

```svelte
<header class="flex flex-col gap-1">
  <h1 class="font-serif text-2xl">
    {#if mode === 'edit'}
      Edit {existing?.id}
    {:else if parent}
      New batch from {parent.id}
    {:else}
      Record V1
    {/if}
  </h1>
  <p class="text-sm text-obsidian/60">{recipe.name}</p>
</header>
```

The submit button label also adapts:

```svelte
<button
  type="submit"
  disabled={submitting}
  class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:opacity-50 rounded-sm"
  data-testid="batch-submit"
>{submitting ? 'Saving…' : (mode === 'edit' ? 'Save Changes' : 'Record Batch')}</button>
```

The rest of the form template (variables, ingredients, steps, error display) stays as-is for now — sections + uses-editor are added in Tasks 8/9/10.

- [ ] **Step 4: Update API client**

`src/lib/ui/api-client.ts`'s `patchBatch` signature already takes `Partial<Batch>`. No changes required, but verify it handles the new fields. Read the file and confirm.

- [ ] **Step 5: Verify dev server compiles**

Same routine as prior tasks.

- [ ] **Step 6: Run unit suite — no regressions**

- [ ] **Step 7: Commit (controller)**

```bash
git add 'src/routes/recipes/[id]/batches/[batchId]/edit' src/lib/ui/BatchEditor.svelte
git commit -m "feat(ui): edit-batch route and BatchEditor mode flag"
```

---

## Task 8: Ingredient sections in BatchEditor

**Files:**
- Modify: `src/lib/ui/BatchEditor.svelte`

Add a section dropdown to each ingredient row plus an inline "+ New section" affordance. Persist `section?` on each ingredient.

- [ ] **Step 1: Update the ingredient fieldset**

Find the ingredients fieldset in `BatchEditor.svelte` (the block starting `<fieldset class="flex flex-col gap-2">` containing the "Ingredients" legend). Replace it with:

```svelte
<fieldset class="flex flex-col gap-2">
  <div class="flex items-center justify-between">
    <legend class="text-[11px] uppercase tracking-wider">Ingredients</legend>
    <button type="button" onclick={addIngredient} class="text-xs text-ochre">+ Add</button>
  </div>
  {#each ingredients as ing, i (i)}
    <div class="flex gap-2 items-center" data-testid="ingredient-edit-row">
      <input bind:value={ing.amount} placeholder="Amount" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm w-24 text-sm" />
      <input bind:value={ing.unit} placeholder="Unit" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm w-20 text-sm" />
      <input bind:value={ing.name} placeholder="Ingredient" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm" />
      <select
        bind:value={ing.section}
        class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm text-sm w-32"
        data-testid="ingredient-section"
      >
        <option value={undefined}>(no section)</option>
        {#each sectionOptions as sec}
          <option value={sec}>{sec}</option>
        {/each}
        <option value="__new__">+ New section…</option>
      </select>
      <button type="button" onclick={() => removeIngredient(i)} class="text-obsidian/40 hover:text-ochre">×</button>
    </div>
  {/each}
</fieldset>
```

- [ ] **Step 2: Add section management to the script**

Inside the `<script lang="ts">` block, add (after the existing state declarations):

```ts
const sectionOptions = $derived.by<string[]>(() => {
  const set = new Set<string>();
  for (const ing of ingredients) {
    if (ing.section && ing.section.trim()) set.add(ing.section.trim());
  }
  return [...set];
});

// When user picks "+ New section…", prompt for a name and apply it.
// Use an effect to watch each ingredient's section value.
$effect(() => {
  for (let i = 0; i < ingredients.length; i++) {
    if (ingredients[i].section === '__new__') {
      const name = window.prompt('New section name:');
      ingredients[i].section = name && name.trim() ? name.trim() : undefined;
    }
  }
});
```

- [ ] **Step 3: Verify dev server compiles**

Same routine as prior tasks.

- [ ] **Step 4: Run unit suite**

- [ ] **Step 5: Commit (controller)**

```bash
git add src/lib/ui/BatchEditor.svelte
git commit -m "feat(ui): ingredient sections in BatchEditor"
```

---

## Task 9: Auto-ID generation + OutcomeForm edit mode

**Files:**
- Modify: `src/lib/ui/BatchEditor.svelte`
- Modify: `src/lib/ui/OutcomeForm.svelte`

Two small additions in one task.

- [ ] **Step 1: Add auto-ID generation to BatchEditor**

In the script section of `BatchEditor.svelte`, add:

```ts
import { slugify, uniqueSlug } from '$lib/server';

// Assign a stable id to any ingredient that doesn't have one.
// Triggered when name input loses focus, or when an ingredient is added without a name yet.
function ensureIngredientId(i: number) {
  const ing = ingredients[i];
  if (ing.id) return; // already has one — keep it permanent
  const taken = new Set(ingredients.map(x => x.id).filter(Boolean));
  const base = slugify(ing.name || 'ingredient');
  ingredients[i].id = uniqueSlug(base, taken);
}
```

In the ingredient row template (from Task 8), add `onblur` to the name input:

```svelte
<input
  bind:value={ing.name}
  onblur={() => ensureIngredientId(i)}
  placeholder="Ingredient"
  class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm"
/>
```

`slugify` and `uniqueSlug` are already exported from `$lib/server` (verified in Plan 1's barrel).

- [ ] **Step 2: Add edit-mode to OutcomeForm**

Replace `src/lib/ui/OutcomeForm.svelte`:

```svelte
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { api } from './api-client';
  import Rating from './Rating.svelte';
  import type { Batch } from '$lib/server';

  let {
    batch,
    recipeId,
    mode = 'cook',
    onClose
  }: {
    batch: Batch;
    recipeId: string;
    mode?: 'cook' | 'edit';
    onClose: () => void;
  } = $props();

  let outcomeNotes = $state(batch.outcomeNotes ?? '');
  let rating = $state<1 | 2 | 3 | 4 | 5 | null>(batch.rating ?? null);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = null;
    try {
      // In cook mode flip to cooked; in edit mode keep status as-is
      const patch: Partial<Batch> = { outcomeNotes, rating };
      if (mode === 'cook') patch.status = 'cooked';
      await api.patchBatch(recipeId, batch.id, patch);
      await invalidateAll();
      onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save';
    } finally {
      submitting = false;
    }
  }
</script>

<div
  class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-50"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="presentation"
>
  <form
    onsubmit={submit}
    onclick={(e) => e.stopPropagation()}
    class="bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm"
    data-testid="outcome-form"
  >
    <h2 class="font-serif text-xl">
      {mode === 'edit' ? `Edit outcome for ${batch.id}` : `Mark ${batch.id} as cooked`}
    </h2>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-wider">Outcome notes</span>
      <textarea
        bind:value={outcomeNotes}
        rows="4"
        placeholder="Crumb, crust, taste, what to change next time…"
        class="border border-drafting bg-canvas px-3 py-2 rounded-sm resize-none"
        data-testid="outcome-notes"
        autofocus
      ></textarea>
    </label>

    <div class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-wider">Rating</span>
      <Rating value={rating} editable onChange={(v) => rating = v} />
    </div>

    {#if error}
      <p class="text-ochre text-sm">{error}</p>
    {/if}

    <div class="flex justify-end gap-2 pt-2">
      <button type="button" onclick={onClose} class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="border border-juniper text-juniper px-4 py-2 text-sm uppercase tracking-wider hover:bg-juniper hover:text-canvas disabled:opacity-50 rounded-sm"
        data-testid="outcome-submit"
      >{submitting ? 'Saving…' : (mode === 'edit' ? 'Save' : 'Archive Batch')}</button>
    </div>
  </form>
</div>
```

- [ ] **Step 3: Verify dev server compiles**

- [ ] **Step 4: Run unit suite — no regressions**

- [ ] **Step 5: Commit (controller)**

```bash
git add src/lib/ui/BatchEditor.svelte src/lib/ui/OutcomeForm.svelte
git commit -m "feat(ui): auto-ID generation in BatchEditor; OutcomeForm edit mode"
```

---

## Task 10: UsesEditor component

**Files:**
- Create: `src/lib/ui/UsesEditor.svelte`

Per-step ingredient picker. Takes the master `ingredients` and the current `step.uses`, exposes a callback that emits the updated uses array.

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/UsesEditor.svelte -->
<script lang="ts">
  import type { Ingredient, IngredientUse } from '$lib/server';
  import { parseAmount } from './layout/amount-parse';

  let {
    ingredients,
    uses = $bindable([]),
    allUses = []
  }: {
    ingredients: Ingredient[];
    uses?: IngredientUse[];
    allUses?: IngredientUse[];      // sum across ALL steps, used for the live allocation indicator
  } = $props();

  // Map ingredientId → master amount (numeric, may be NaN for non-numeric master amounts)
  const masterAmount = $derived(new Map(
    ingredients.map(i => [i.id, parseAmount(i.amount) ?? NaN] as const)
  ));

  // Sum across all steps (passed in as allUses) for the live indicator
  const allocated = $derived.by(() => {
    const m = new Map<string, number>();
    for (const u of allUses) m.set(u.ingredientId, (m.get(u.ingredientId) ?? 0) + u.amount);
    return m;
  });

  function addUse() {
    const firstAvailable = ingredients[0];
    if (!firstAvailable) return;
    uses = [...uses, { ingredientId: firstAvailable.id, amount: 0 }];
  }

  function removeUse(i: number) {
    uses = uses.filter((_, idx) => idx !== i);
  }

  // Local input strings so the user can type "1/2" without immediately collapsing to 0.5
  let amountInputs = $state<string[]>([]);
  $effect(() => {
    amountInputs = uses.map((u, i) => amountInputs[i] ?? String(u.amount));
  });

  function commitAmount(i: number) {
    const parsed = parseAmount(amountInputs[i] ?? '');
    if (parsed !== null) {
      uses[i] = { ...uses[i], amount: parsed };
    }
    // re-sync display
    amountInputs[i] = String(uses[i].amount);
  }

  function ingredientById(id: string): Ingredient | undefined {
    return ingredients.find(i => i.id === id);
  }
</script>

<div class="flex flex-col gap-1.5 ml-6 border-l border-drafting pl-3 mt-1">
  <div class="flex items-center justify-between">
    <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Ingredients used</span>
    <button type="button" onclick={addUse} class="text-xs text-ochre" disabled={ingredients.length === 0}>+ Add</button>
  </div>
  {#each uses as use, i (i)}
    {@const ing = ingredientById(use.ingredientId)}
    <div class="flex gap-2 items-center text-sm" data-testid="use-row">
      <select
        value={use.ingredientId}
        onchange={(e) => uses[i] = { ...uses[i], ingredientId: (e.currentTarget as HTMLSelectElement).value }}
        class="border border-drafting bg-canvas px-2 py-1 rounded-sm flex-1"
        data-testid="use-ingredient"
      >
        {#each ingredients as candidate (candidate.id)}
          <option value={candidate.id}>{candidate.name}{candidate.section ? ` (${candidate.section})` : ''}</option>
        {/each}
      </select>
      <input
        type="text"
        bind:value={amountInputs[i]}
        onblur={() => commitAmount(i)}
        placeholder="Amount"
        class="border border-drafting bg-canvas px-2 py-1 rounded-sm w-24 text-sm font-mono"
        data-testid="use-amount"
      />
      <span class="text-xs text-obsidian/50 min-w-[24px]">{ing?.unit ?? ''}</span>
      <button type="button" onclick={() => removeUse(i)} class="text-obsidian/40 hover:text-ochre">×</button>
    </div>
  {/each}

  {#if uses.length > 0 && ingredients.length > 0}
    <div class="text-[10px] text-obsidian/50 mt-1 flex flex-wrap gap-x-3">
      {#each Array.from(allocated.entries()) as [ingId, sum]}
        {@const ing = ingredientById(ingId)}
        {@const master = masterAmount.get(ingId) ?? NaN}
        {#if ing}
          {@const overflowing = !Number.isNaN(master) && sum > master}
          <span class={overflowing ? 'text-ochre' : ''} data-testid="allocation-indicator" data-ingredient={ingId}>
            {sum}/{Number.isNaN(master) ? '?' : master}{ing.unit} {ing.name}
          </span>
        {/if}
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Verify dev server compiles**

(Component isn't referenced yet — Task 11 wires it in. Compile success means it parses.)

- [ ] **Step 3: Commit (controller)**

```bash
git add src/lib/ui/UsesEditor.svelte
git commit -m "feat(ui): UsesEditor component with fraction parsing and allocation indicator"
```

---

## Task 11: Wire UsesEditor into BatchEditor

**Files:**
- Modify: `src/lib/ui/BatchEditor.svelte`

Mount `UsesEditor` under each step row. Pass the current step's uses with two-way binding, and the all-step uses array for the allocation indicator.

- [ ] **Step 1: Import and use the component**

In the script of `BatchEditor.svelte`, add at the top of imports:

```ts
import UsesEditor from './UsesEditor.svelte';
```

Add a derived `allUses` that flattens uses across all steps (used to compute the live allocation indicator):

```ts
const allUses = $derived(steps.flatMap(s => s.uses));
```

- [ ] **Step 2: Update the steps fieldset**

Find the steps fieldset (the block with the "Steps" legend and the `{#each steps as _, i}` loop). Replace its body:

```svelte
<fieldset class="flex flex-col gap-3">
  <div class="flex items-center justify-between">
    <legend class="text-[11px] uppercase tracking-wider">Steps</legend>
    <button type="button" onclick={addStep} class="text-xs text-ochre">+ Add</button>
  </div>
  {#each steps as step, i (i)}
    <div class="flex flex-col gap-2 border border-drafting/50 p-3 rounded-sm" data-testid="step-edit-row">
      <div class="flex gap-2 items-start">
        <span class="font-mono text-xs text-obsidian/40 pt-2">{i + 1}.</span>
        <textarea
          bind:value={step.text}
          rows="2"
          class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm resize-none"
          data-testid="step-text"
        ></textarea>
        <button type="button" onclick={() => removeStep(i)} class="text-obsidian/40 hover:text-ochre pt-2">×</button>
      </div>
      <UsesEditor
        bind:uses={step.uses}
        ingredients={ingredients.filter(ing => ing.id && ing.name)}
        allUses={allUses}
      />
    </div>
  {/each}
</fieldset>
```

- [ ] **Step 3: Verify dev server compiles**

- [ ] **Step 4: Manually smoke-test**

Run `~/.bun/bin/bun run dev`. From a clean state:
1. Create a recipe (custom preset)
2. Click "+ Record V1"
3. Add 2 ingredients (give them names so IDs generate on blur)
4. Add 2 steps
5. Under each step, add a "use" via the picker, set an amount
6. Save (should succeed)
7. Detail page should render — check that ingredients-per-step appear under each step
8. Click "Edit" on the draft, modify a use's amount, save
9. Detail page reflects the change

Stop the server.

- [ ] **Step 5: Run unit suite — no regressions**

- [ ] **Step 6: Commit (controller)**

```bash
git add src/lib/ui/BatchEditor.svelte
git commit -m "feat(ui): per-step uses picker integrated into BatchEditor"
```

---

## Task 12: E2E test for edit-batch flow

**Files:**
- Create: `tests/e2e/edit-batch.e2e.ts`

End-to-end: create recipe → record draft with sections + step uses → edit it → mark as cooked → edit outcome → verify all states.

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/edit-batch.e2e.ts
import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async () => { await clearTestData(); });

test('edit a draft batch with sections and step uses', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Sectioned Loaf');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();

  await expect(page).toHaveURL(/\/recipes\/sectioned-loaf/);
  await page.getByRole('link', { name: '+ Record V1' }).click();

  await page.getByTestId('batch-label').fill('initial');

  // Add 2 ingredients and assign sections
  const ingRows = page.getByTestId('ingredient-edit-row');
  // Use the existing "+ Add" buttons in the editor (find the first + Add inside the ingredients fieldset)
  await page.getByRole('button', { name: '+ Add' }).first().click();
  await ingRows.nth(0).locator('input').nth(0).fill('500');   // amount
  await ingRows.nth(0).locator('input').nth(1).fill('g');     // unit
  await ingRows.nth(0).locator('input').nth(2).fill('flour'); // name
  await ingRows.nth(0).locator('input').nth(2).blur();        // trigger ID generation

  await page.getByRole('button', { name: '+ Add' }).first().click();
  await ingRows.nth(1).locator('input').nth(0).fill('100');
  await ingRows.nth(1).locator('input').nth(1).fill('g');
  await ingRows.nth(1).locator('input').nth(2).fill('water');
  await ingRows.nth(1).locator('input').nth(2).blur();

  // Add 2 steps and link ingredients
  // Find the Steps "+ Add" — second instance of "+ Add" overall (first is ingredients)
  await page.getByRole('button', { name: '+ Add' }).nth(1).click();
  await page.getByTestId('step-text').nth(0).fill('Mix half the flour and all the water');
  // Add a use under step 0
  const stepRows = page.getByTestId('step-edit-row');
  await stepRows.nth(0).getByRole('button', { name: '+ Add' }).click();
  await stepRows.nth(0).getByTestId('use-amount').nth(0).fill('250');
  await stepRows.nth(0).getByTestId('use-amount').nth(0).blur();

  // Add step 2 with the second half of flour
  await page.getByRole('button', { name: '+ Add' }).nth(1).click();
  await page.getByTestId('step-text').nth(1).fill('Mix in the rest of the flour and bake');
  await stepRows.nth(1).getByRole('button', { name: '+ Add' }).click();
  await stepRows.nth(1).getByTestId('use-amount').nth(0).fill('250');
  await stepRows.nth(1).getByTestId('use-amount').nth(0).blur();

  await page.getByTestId('batch-submit').click();

  // Detail page renders ingredients and per-step uses
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('step-uses').nth(0)).toContainText('250');
  await expect(page.getByTestId('step-uses').nth(0)).toContainText('flour');

  // Click Edit, change something, save
  await page.getByTestId('edit-batch-btn').click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await expect(page.getByTestId('batch-label')).toHaveValue('initial');
  await page.getByTestId('batch-label').fill('initial revised');
  await page.getByTestId('batch-submit').click();

  // Detail re-renders with new label
  await expect(page.getByTestId('batch-detail')).toContainText('initial revised');

  // Mark as cooked
  await page.getByTestId('mark-cooked-btn').click();
  await page.getByTestId('outcome-notes').fill('Crusty.');
  await page.getByTestId('rating-3').click();
  await page.getByTestId('outcome-submit').click();

  // Edit button is gone, Edit-outcome present
  await expect(page.getByTestId('edit-batch-btn')).not.toBeVisible();
  await expect(page.getByTestId('edit-outcome-btn')).toBeVisible();

  // Edit outcome
  await page.getByTestId('edit-outcome-btn').click();
  await page.getByTestId('outcome-notes').fill('Crusty and dense.');
  await page.getByTestId('outcome-submit').click();

  await expect(page.getByText('Crusty and dense.')).toBeVisible();
});
```

- [ ] **Step 2: Run the new test**

Run: `~/.bun/bin/bun run e2e -- edit-batch`
Expected: 1 passed.

If it fails, debug iteratively. Use `~/.bun/bin/bun run e2e:headed -- edit-batch` to watch.

- [ ] **Step 3: Run the full E2E suite**

Run: `~/.bun/bin/bun run e2e`
Expected: 2 passed (foundation + edit-batch).

- [ ] **Step 4: Run the full unit suite**

Run: `~/.bun/bin/bun test`
Expected: all unit tests still pass.

- [ ] **Step 5: Commit (controller)**

```bash
git add tests/e2e/edit-batch.e2e.ts
git commit -m "test(e2e): edit-batch flow with sections and step uses"
```

---

## Self-review notes

**Spec coverage:**
- Spec §2 (`Ingredient.id`, `.section`, structured `Step`) → Task 1
- Spec §3 (read-time migration) → Task 1
- Spec §4.1 (BatchEditor: sections + auto-ID + UsesEditor) → Tasks 8, 9, 10, 11
- Spec §4.2 (`IngredientList` by section, `StepsList` uses) → Tasks 4, 5
- Spec §4.3 (Edit + Edit-outcome buttons) → Task 6
- Spec §5.1 (edit route + draft check redirect) → Task 7
- Spec §5.2 (BatchEditor mode flag) → Task 7
- Spec §5.3 (PATCH validation: frozen fields + step.uses references) → Task 3
- Spec §6 (out of scope — drag-reorder, bulk rename, etc.) → not implemented, as intended
- Spec §7 (testing — legacy migration, idempotence, PATCH, section rendering, E2E) → Tasks 1, 3, 12 (section/uses rendering verified end-to-end via E2E rather than separate component snapshots; that's acceptable trade-off)

**Type consistency:**
- `Ingredient.id`, `Ingredient.section?`, `IngredientUse`, `Step` shapes used consistently across types.ts, batches.ts, BatchEditor, BatchDetail, IngredientList, StepsList, UsesEditor, +server.ts, edit page server.
- `parseAmount` returns `number | null` consistently in tests and component.
- `mode: 'create' | 'edit'` on BatchEditor, `mode: 'cook' | 'edit'` on OutcomeForm — different unions, names match their context.

**Risk: BatchEditor file size.** Tasks 7 + 8 + 9 + 11 all add to BatchEditor.svelte. After Task 11 it should be under 250 lines because step rendering is only ~10 lines (delegated to UsesEditor) and ingredient rows gained one select. If it crosses 250, factor out `IngredientList.svelte` from the editor as well — but this is unlikely.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-04-batch-editing-amendment.md`. 12 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Same pattern as Plans 1 and 2: implementer per task, controller commits.

**2. Inline Execution** — Batch through with checkpoints.

**Which approach?**
