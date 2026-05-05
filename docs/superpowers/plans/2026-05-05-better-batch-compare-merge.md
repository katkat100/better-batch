# Better Batch — Compare & Merge Implementation Plan (Plan 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Ship the marquee features — comparing two batches by structured variable + diff, and merging two batches into a new child via a three-pane picker. After this plan, the MVP feature set defined in the spec is complete.

**Architecture:** Diff and merge logic live as pure functions in `src/lib/server/domain/diff.ts` and `merge.ts` (mostly already there). New UI components — `VariableDiffTable`, `IngredientDiff`, `StepsDiff`, `CompareView`, `MergePicker` — render the diffs and the merge editor. Two new routes (`/recipes/[id]/compare` and `/recipes/[id]/merge`) wrap the components. Entry-point buttons on `BatchDetail` open a small batch-picker dropdown that lets the user pick the second batch.

**Tech Stack:** SvelteKit (Svelte 5 runes) · Bun · TypeScript · Tailwind v4 · `bun:test` · Playwright

Reference: original spec at `docs/superpowers/specs/2026-05-04-better-batch-design.md` §5.4 (Compare) and §5.5 (Merge). The amendment at `docs/superpowers/specs/2026-05-04-batch-editing-amendment.md` updated the `Step` type to `{ text, uses[] }` and `Ingredient` to include `id`/`section?` — both are accounted for in this plan.

---

## File Structure

Files this plan creates or modifies:

```
src/
  lib/
    server/
      domain/
        diff.ts                       # MODIFIED: add ingredientDiff, stepTextDiff
    ui/
      VariableDiffTable.svelte        # NEW
      IngredientDiff.svelte           # NEW
      StepsDiff.svelte                # NEW
      CompareView.svelte              # NEW: composes Variable + Ingredient + Steps diff
      MergePicker.svelte              # NEW: three-pane variable + whole-list ingredient/steps picker
      BatchPickerDropdown.svelte      # NEW: small popover that lists other batches in the recipe
  routes/
    recipes/[id]/
      compare/
        +page.server.ts               # NEW: load recipe + the two batches
        +page.svelte                  # NEW: wraps CompareView
      merge/
        +page.server.ts               # NEW: load recipe + the two batches
        +page.svelte                  # NEW: wraps MergePicker; submits merge

tests/
  domain/
    diff.test.ts                      # MODIFIED: add ingredientDiff + stepTextDiff tests
  e2e/
    compare-merge.e2e.ts              # NEW: end-to-end compare + merge
```

**MVP simplifications (from the spec):**
- The spec said merge offers per-row picking for ingredients and steps. For MVP we ship **variables per-field** + **ingredients/steps as whole-list radio (A | B)**. This delivers the cross-batch merge workflow without the complexity of per-row ingredient slicing. Users can refine the merged result via the existing edit-batch route afterward.
- The spec mentioned shift-click in `BatchGraph` to enter compare mode. For MVP we ship a "Compare with…" / "Merge with…" button + dropdown; shift-click can come later as polish.

---

## Task 1: Domain — ingredient and step-text diff

**Files:**
- Modify: `src/lib/server/domain/diff.ts`
- Modify: `tests/domain/diff.test.ts`

Two new pure functions:

- `ingredientDiff(a, b)` — matches by `id`, returns `[{op: 'ctx'|'add'|'rem'|'mod', a?, b?}]` rows in stable order.
- `stepTextDiff(a, b)` — applies the existing `textArrayDiff` to `step.text` arrays. (Ingredient uses inside steps are not diffed structurally for MVP; the user sees the full step text contrast.)

- [ ] **Step 1: Write failing tests**

Add to the bottom of `tests/domain/diff.test.ts` (inside the existing top-level `describe`s or as new top-level `describe` blocks):

```ts
import { ingredientDiff, stepTextDiff } from '../../src/lib/server/domain/diff';
import type { Ingredient, Step } from '../../src/lib/server/domain/types';

describe('ingredientDiff', () => {
  const ing = (id: string, name: string, amount: string, unit = 'g'): Ingredient => ({ id, name, amount, unit });

  it('marks identical entries as ctx', () => {
    const rows = ingredientDiff(
      [ing('flour', 'flour', '500')],
      [ing('flour', 'flour', '500')]
    );
    expect(rows).toEqual([{ op: 'ctx', a: ing('flour', 'flour', '500'), b: ing('flour', 'flour', '500') }]);
  });

  it('marks added entries as add', () => {
    const rows = ingredientDiff(
      [],
      [ing('salt', 'salt', '10')]
    );
    expect(rows).toEqual([{ op: 'add', b: ing('salt', 'salt', '10') }]);
  });

  it('marks removed entries as rem', () => {
    const rows = ingredientDiff(
      [ing('salt', 'salt', '10')],
      []
    );
    expect(rows).toEqual([{ op: 'rem', a: ing('salt', 'salt', '10') }]);
  });

  it('marks changed entries as mod', () => {
    const rows = ingredientDiff(
      [ing('flour', 'flour', '500')],
      [ing('flour', 'flour', '550')]
    );
    expect(rows).toEqual([{
      op: 'mod',
      a: ing('flour', 'flour', '500'),
      b: ing('flour', 'flour', '550')
    }]);
  });

  it('preserves order: A entries first in their order, then B-only added at the end', () => {
    const rows = ingredientDiff(
      [ing('flour', 'flour', '500'), ing('water', 'water', '350')],
      [ing('water', 'water', '375'), ing('flour', 'flour', '500'), ing('salt', 'salt', '10')]
    );
    expect(rows.map(r => [r.op, r.a?.id ?? r.b?.id])).toEqual([
      ['ctx', 'flour'],
      ['mod', 'water'],
      ['add', 'salt']
    ]);
  });
});

describe('stepTextDiff', () => {
  const s = (text: string): Step => ({ text, uses: [] });

  it('produces line-level edit script of step texts', () => {
    const ops = stepTextDiff([s('mix'), s('rise'), s('bake')], [s('mix'), s('rise long'), s('bake')]);
    expect(ops).toEqual([
      { op: 'ctx', text: 'mix' },
      { op: 'rem', text: 'rise' },
      { op: 'add', text: 'rise long' },
      { op: 'ctx', text: 'bake' }
    ]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `~/.bun/bin/bun test tests/domain/diff.test.ts`
Expected: failures because `ingredientDiff` and `stepTextDiff` don't exist.

- [ ] **Step 3: Implement**

Append to `src/lib/server/domain/diff.ts`:

```ts
import type { Ingredient, Step } from './types';

export type IngredientDiffOp = 'ctx' | 'add' | 'rem' | 'mod';
export interface IngredientDiffRow {
  op: IngredientDiffOp;
  a?: Ingredient;
  b?: Ingredient;
}

function ingredientsEqual(a: Ingredient, b: Ingredient): boolean {
  return a.name === b.name
    && a.amount === b.amount
    && a.unit === b.unit
    && (a.section ?? '') === (b.section ?? '');
}

export function ingredientDiff(a: Ingredient[], b: Ingredient[]): IngredientDiffRow[] {
  const bById = new Map(b.map(ing => [ing.id, ing] as const));
  const seenInB = new Set<string>();
  const rows: IngredientDiffRow[] = [];
  for (const ai of a) {
    const bi = bById.get(ai.id);
    if (!bi) {
      rows.push({ op: 'rem', a: ai });
    } else {
      seenInB.add(ai.id);
      if (ingredientsEqual(ai, bi)) rows.push({ op: 'ctx', a: ai, b: bi });
      else rows.push({ op: 'mod', a: ai, b: bi });
    }
  }
  for (const bi of b) {
    if (!seenInB.has(bi.id)) rows.push({ op: 'add', b: bi });
  }
  return rows;
}

export function stepTextDiff(a: Step[], b: Step[]): DiffLine[] {
  return textArrayDiff(a.map(s => s.text), b.map(s => s.text));
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Run full unit suite, confirm no regressions**

Run: `~/.bun/bin/bun test`
Expected: 64 pass (58 prior + 6 new).

- [ ] **Step 6: Update server-lib barrel if needed**

`src/lib/server/index.ts` already re-exports `* from './domain/diff'`. No change needed; new exports come along for free. Verify by reading `index.ts`.

- [ ] **Step 7: Commit (controller)**

```bash
git add src/lib/server/domain/diff.ts tests/domain/diff.test.ts
git commit -m "feat(domain): ingredientDiff and stepTextDiff"
```

---

## Task 2: VariableDiffTable component

**Files:**
- Create: `src/lib/ui/VariableDiffTable.svelte`

Renders the variable diff table per spec §5.4: variable name, A value, B value, delta column.

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/VariableDiffTable.svelte -->
<script lang="ts">
  import type { VariableDiffRow } from '$lib/server';

  let {
    rows,
    aLabel = 'A',
    bLabel = 'B'
  }: {
    rows: VariableDiffRow[];
    aLabel?: string;
    bLabel?: string;
  } = $props();

  function formatValue(row: VariableDiffRow, side: 'a' | 'b'): string {
    const v = side === 'a' ? row.a : row.b;
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return row.unit ? `${v}${row.unit}` : `${v}`;
    return String(v);
  }

  function formatDelta(row: VariableDiffRow): string {
    if (row.delta === null || row.delta === 0) return '—';
    const sign = row.delta > 0 ? '+' : '';
    return `${sign}${row.delta}${row.unit}`;
  }

  function deltaColor(row: VariableDiffRow): string {
    if (row.delta === null || row.delta === 0) return 'text-obsidian/40';
    return row.delta > 0 ? 'text-juniper' : 'text-ochre';
  }
</script>

<table class="w-full text-sm border border-drafting rounded-sm" data-testid="variable-diff-table">
  <thead class="bg-drafting/30 text-[10px] uppercase tracking-wider text-obsidian/60">
    <tr>
      <th class="text-left p-2">Variable</th>
      <th class="text-left p-2">{aLabel}</th>
      <th class="text-left p-2">{bLabel}</th>
      <th class="text-left p-2">Δ</th>
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.name)}
      <tr class={row.changed ? '' : 'opacity-60'} data-testid="variable-diff-row" data-variable={row.name}>
        <td class="p-2 text-[11px] uppercase tracking-wider text-obsidian/70">{row.name}</td>
        <td class="p-2 font-mono">{formatValue(row, 'a')}</td>
        <td class="p-2 font-mono">{formatValue(row, 'b')}</td>
        <td class="p-2 font-mono {deltaColor(row)}" data-testid="variable-delta">{formatDelta(row)}</td>
      </tr>
    {/each}
  </tbody>
</table>
```

- [ ] **Step 2: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200 + no errors in log.

- [ ] **Step 3: Commit (controller)**

```bash
git add src/lib/ui/VariableDiffTable.svelte
git commit -m "feat(ui): VariableDiffTable component"
```

---

## Task 3: IngredientDiff and StepsDiff components

**Files:**
- Create: `src/lib/ui/IngredientDiff.svelte`
- Create: `src/lib/ui/StepsDiff.svelte`

- [ ] **Step 1: Implement IngredientDiff**

```svelte
<!-- src/lib/ui/IngredientDiff.svelte -->
<script lang="ts">
  import type { IngredientDiffRow } from '$lib/server';

  let { rows }: { rows: IngredientDiffRow[] } = $props();

  function bgClass(op: IngredientDiffRow['op']): string {
    switch (op) {
      case 'add': return 'bg-juniper/10 text-juniper';
      case 'rem': return 'bg-ochre/10 text-ochre line-through opacity-80';
      case 'mod': return 'bg-drafting/30';
      default: return '';
    }
  }

  function format(ing: { amount: string; unit: string; name: string; section?: string }): string {
    const amt = `${ing.amount}${ing.unit ? ' ' + ing.unit : ''}`;
    const sec = ing.section ? ` [${ing.section}]` : '';
    return `${amt} ${ing.name}${sec}`;
  }
</script>

{#if rows.length === 0}
  <p class="text-sm text-obsidian/40 italic">No ingredients to compare.</p>
{:else}
  <ul class="font-mono text-sm space-y-0.5">
    {#each rows as row, i (i)}
      <li class="px-2 py-1 rounded-sm {bgClass(row.op)}" data-testid="ingredient-diff-row" data-op={row.op}>
        {#if row.op === 'mod' && row.a && row.b}
          <span class="line-through opacity-60 text-ochre">{format(row.a)}</span>
          <span class="mx-1 opacity-40">→</span>
          <span class="text-juniper">{format(row.b)}</span>
        {:else if row.op === 'add' && row.b}
          + {format(row.b)}
        {:else if row.op === 'rem' && row.a}
          − {format(row.a)}
        {:else if row.op === 'ctx' && row.a}
          {format(row.a)}
        {/if}
      </li>
    {/each}
  </ul>
{/if}
```

- [ ] **Step 2: Implement StepsDiff**

```svelte
<!-- src/lib/ui/StepsDiff.svelte -->
<script lang="ts">
  import type { DiffLine } from '$lib/server';
  let { lines }: { lines: DiffLine[] } = $props();

  function bgClass(op: DiffLine['op']): string {
    switch (op) {
      case 'add': return 'bg-juniper/10 text-juniper';
      case 'rem': return 'bg-ochre/10 text-ochre line-through opacity-80';
      default: return '';
    }
  }

  function prefix(op: DiffLine['op']): string {
    if (op === 'add') return '+ ';
    if (op === 'rem') return '− ';
    return '  ';
  }
</script>

{#if lines.length === 0}
  <p class="text-sm text-obsidian/40 italic">No steps to compare.</p>
{:else}
  <ol class="font-mono text-sm space-y-0.5">
    {#each lines as line, i (i)}
      <li class="px-2 py-1 rounded-sm {bgClass(line.op)}" data-testid="step-diff-line" data-op={line.op}>
        <span class="select-none text-obsidian/40">{prefix(line.op)}</span>{line.text}
      </li>
    {/each}
  </ol>
{/if}
```

- [ ] **Step 3: Verify dev server compiles**

Same routine as Task 2 Step 2.

- [ ] **Step 4: Commit (controller)**

```bash
git add src/lib/ui/IngredientDiff.svelte src/lib/ui/StepsDiff.svelte
git commit -m "feat(ui): IngredientDiff and StepsDiff components"
```

---

## Task 4: CompareView component

**Files:**
- Create: `src/lib/ui/CompareView.svelte`

Composes `VariableDiffTable`, `IngredientDiff`, and `StepsDiff` into a single read-only compare layout.

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/CompareView.svelte -->
<script lang="ts">
  import VariableDiffTable from './VariableDiffTable.svelte';
  import IngredientDiff from './IngredientDiff.svelte';
  import StepsDiff from './StepsDiff.svelte';
  import { variableDiff, ingredientDiff, stepTextDiff } from '$lib/server';
  import type { Recipe, Batch } from '$lib/server';

  let {
    recipe,
    a,
    b
  }: {
    recipe: Recipe;
    a: Batch;
    b: Batch;
  } = $props();

  const varRows = $derived(variableDiff(recipe.variableSchema, a.variables, b.variables));
  const ingRows = $derived(ingredientDiff(a.ingredients, b.ingredients));
  const stepLines = $derived(stepTextDiff(a.steps, b.steps));
</script>

<article class="flex flex-col gap-6" data-testid="compare-view">
  <header class="flex items-center gap-3 border-b border-drafting pb-3">
    <h2 class="font-serif text-2xl">Compare</h2>
    <span class="text-sm font-mono px-2 py-0.5 border border-ochre text-ochre rounded-sm">{a.id}</span>
    <span class="text-obsidian/40">↔</span>
    <span class="text-sm font-mono px-2 py-0.5 border border-juniper text-juniper rounded-sm">{b.id}</span>
  </header>

  {#if recipe.variableSchema.length > 0}
    <section class="flex flex-col gap-2">
      <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Variables</h3>
      <VariableDiffTable rows={varRows} aLabel={a.id} bLabel={b.id} />
    </section>
  {/if}

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Ingredients</h3>
    <IngredientDiff rows={ingRows} />
  </section>

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Steps</h3>
    <StepsDiff lines={stepLines} />
  </section>
</article>
```

**IMPORTANT:** This file imports value functions (`variableDiff`, `ingredientDiff`, `stepTextDiff`) from `$lib/server`. Per Plan 2's lessons, that path is server-only in SvelteKit. To make this work in the browser, the imports must be relative or moved.

The existing `BatchEditor.svelte` solves the same problem by importing pure helpers from `$lib/shared/slug`. For diff functions, we need to either:
- Move `diff.ts` to `src/lib/shared/diff.ts` (mirroring slug), OR
- Compute the diffs in `+page.server.ts` (server) and pass the diff rows to the page as data.

The second option is cleaner — diffs are pure data and the loader is the natural place. So `CompareView.svelte` should accept already-computed diff rows as props instead of computing them.

Revise `CompareView.svelte`:

```svelte
<!-- src/lib/ui/CompareView.svelte -->
<script lang="ts">
  import VariableDiffTable from './VariableDiffTable.svelte';
  import IngredientDiff from './IngredientDiff.svelte';
  import StepsDiff from './StepsDiff.svelte';
  import type { Recipe, Batch, VariableDiffRow, IngredientDiffRow, DiffLine } from '$lib/server';

  let {
    recipe,
    a,
    b,
    varRows,
    ingRows,
    stepLines
  }: {
    recipe: Recipe;
    a: Batch;
    b: Batch;
    varRows: VariableDiffRow[];
    ingRows: IngredientDiffRow[];
    stepLines: DiffLine[];
  } = $props();
</script>

<article class="flex flex-col gap-6" data-testid="compare-view">
  <header class="flex items-center gap-3 border-b border-drafting pb-3">
    <h2 class="font-serif text-2xl">Compare</h2>
    <span class="text-sm font-mono px-2 py-0.5 border border-ochre text-ochre rounded-sm">{a.id}</span>
    <span class="text-obsidian/40">↔</span>
    <span class="text-sm font-mono px-2 py-0.5 border border-juniper text-juniper rounded-sm">{b.id}</span>
  </header>

  {#if recipe.variableSchema.length > 0}
    <section class="flex flex-col gap-2">
      <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Variables</h3>
      <VariableDiffTable rows={varRows} aLabel={a.id} bLabel={b.id} />
    </section>
  {/if}

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Ingredients</h3>
    <IngredientDiff rows={ingRows} />
  </section>

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Steps</h3>
    <StepsDiff lines={stepLines} />
  </section>
</article>
```

The types `VariableDiffRow`, `IngredientDiffRow`, `DiffLine` are imported as types only (`import type`), which Vite strips at build time and SvelteKit allows even from `$lib/server`.

- [ ] **Step 2: Verify dev server compiles** (same routine).

- [ ] **Step 3: Commit (controller)**

```bash
git add src/lib/ui/CompareView.svelte
git commit -m "feat(ui): CompareView (variable + ingredient + step diff composer)"
```

---

## Task 5: Compare route

**Files:**
- Create: `src/routes/recipes/[id]/compare/+page.server.ts`
- Create: `src/routes/recipes/[id]/compare/+page.svelte`

Loader reads recipe + both batches, computes diffs, passes to the page.

- [ ] **Step 1: Implement loader**

```ts
// src/routes/recipes/[id]/compare/+page.server.ts
import { error } from '@sveltejs/kit';
import {
  readRecipe, readBatch,
  variableDiff, ingredientDiff, stepTextDiff
} from '../../../../../lib/server/index.js';

export async function load({ params, url }) {
  const aId = url.searchParams.get('a');
  const bId = url.searchParams.get('b');
  if (!aId || !bId) throw error(400, 'compare requires ?a=...&b=...');

  let recipe, a, b;
  try {
    recipe = await readRecipe(params.id);
    a = await readBatch(params.id, aId);
    b = await readBatch(params.id, bId);
  } catch (err: any) {
    if (err.code === 'ENOENT') throw error(404, 'Not found');
    throw err;
  }

  const varRows = variableDiff(recipe.variableSchema, a.variables, b.variables);
  const ingRows = ingredientDiff(a.ingredients, b.ingredients);
  const stepLines = stepTextDiff(a.steps, b.steps);

  return { recipe, a, b, varRows, ingRows, stepLines };
}
```

- [ ] **Step 2: Implement page**

```svelte
<!-- src/routes/recipes/[id]/compare/+page.svelte -->
<script lang="ts">
  import CompareView from '$lib/ui/CompareView.svelte';
  import type { Recipe, Batch, VariableDiffRow, IngredientDiffRow, DiffLine } from '$lib/server';

  let { data }: { data: {
    recipe: Recipe; a: Batch; b: Batch;
    varRows: VariableDiffRow[]; ingRows: IngredientDiffRow[]; stepLines: DiffLine[];
  } } = $props();
</script>

<div class="max-w-5xl mx-auto p-6 flex flex-col gap-4">
  <nav class="flex items-center gap-2 text-sm">
    <a href="/recipes/{data.recipe.id}" class="text-obsidian/60 hover:text-obsidian">← {data.recipe.name}</a>
  </nav>

  <CompareView
    recipe={data.recipe}
    a={data.a}
    b={data.b}
    varRows={data.varRows}
    ingRows={data.ingRows}
    stepLines={data.stepLines}
  />
</div>
```

- [ ] **Step 3: Verify dev server compiles and the route works**

Smoke-test via curl. From a clean state (`rm -rf data/recipes data/index.json`):

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4

# Create a recipe with two batches
curl -s -X POST http://localhost:5173/api/recipes -H 'content-type: application/json' \
  -d '{"name":"CmpTest","preset":"bread","tags":[]}' > /dev/null
curl -s -X POST http://localhost:5173/api/recipes/cmptest/batches -H 'content-type: application/json' \
  -d '{"label":"v1","parentIds":[],"status":"draft","ingredients":[{"id":"flour","name":"flour","amount":"500","unit":"g"}],"variables":{"hydration":70},"steps":[{"text":"mix","uses":[]}]}' > /dev/null
curl -s -X POST http://localhost:5173/api/recipes/cmptest/batches -H 'content-type: application/json' \
  -d '{"label":"v2","parentIds":["v1-v1"],"status":"draft","ingredients":[{"id":"flour","name":"flour","amount":"500","unit":"g"},{"id":"salt","name":"salt","amount":"10","unit":"g"}],"variables":{"hydration":75},"steps":[{"text":"mix","uses":[]},{"text":"bake","uses":[]}]}' > /dev/null

# Hit compare
curl -s -o /tmp/compare.html -w "%{http_code}\n" "http://localhost:5173/recipes/cmptest/compare?a=v1-v1&b=v2-v2"
grep -q 'compare-view' /tmp/compare.html && echo "compare view rendered"

pkill -f 'bun run dev'
rm -rf data/recipes data/index.json
```

Expected: 200 and "compare view rendered".

- [ ] **Step 4: Run unit suite — confirm no regressions**

- [ ] **Step 5: Commit (controller)**

```bash
git add 'src/routes/recipes/[id]/compare'
git commit -m "feat(ui): /recipes/[id]/compare route"
```

---

## Task 6: BatchPickerDropdown + BatchDetail entry points

**Files:**
- Create: `src/lib/ui/BatchPickerDropdown.svelte`
- Modify: `src/lib/ui/BatchDetail.svelte`
- Modify: `src/routes/recipes/[id]/+page.svelte` (pass `batches` prop to `BatchDetail`)

A small popover that shows other batches in the recipe, lets the user pick one, and emits a callback with the picked id. Used for both Compare and Merge entry points.

- [ ] **Step 1: Implement BatchPickerDropdown**

```svelte
<!-- src/lib/ui/BatchPickerDropdown.svelte -->
<script lang="ts">
  import type { Batch } from '$lib/server';

  let {
    label = 'Pick a batch',
    candidates,
    excludeId,
    open = $bindable(false),
    onPick
  }: {
    label?: string;
    candidates: Batch[];
    excludeId: string;
    open?: boolean;
    onPick: (batchId: string) => void;
  } = $props();

  const filtered = $derived(candidates.filter(b => b.id !== excludeId));

  function handleSelect(id: string) {
    onPick(id);
    open = false;
  }
</script>

{#if open}
  <div class="relative">
    <div
      class="absolute right-0 top-full mt-1 w-64 max-h-72 overflow-auto bg-canvas border border-obsidian rounded-sm shadow-lg z-40"
      data-testid="batch-picker"
    >
      <div class="px-3 py-2 text-[10px] uppercase tracking-wider text-obsidian/50 border-b border-drafting">
        {label}
      </div>
      {#if filtered.length === 0}
        <p class="px-3 py-3 text-sm text-obsidian/40 italic">No other batches available.</p>
      {:else}
        <ul>
          {#each filtered as candidate (candidate.id)}
            <li>
              <button
                type="button"
                onclick={() => handleSelect(candidate.id)}
                class="w-full text-left px-3 py-2 text-sm hover:bg-drafting/40 flex items-center gap-2"
                data-testid="batch-pick-option"
                data-batch-id={candidate.id}
              >
                <span class="font-mono text-xs">{candidate.id}</span>
                <span class="text-obsidian/60 truncate">{candidate.label}</span>
                {#if candidate.status === 'cooked'}
                  <span class="ml-auto text-[10px] uppercase text-juniper">cooked</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Modify BatchDetail to add Compare/Merge buttons**

In `src/lib/ui/BatchDetail.svelte`:

1. Add `batches` to the props.
2. Add two new state variables for the two pickers (`compareOpen`, `mergeOpen`).
3. Add two buttons in the header action bar that toggle the pickers.
4. Render `BatchPickerDropdown` for each, navigating to the compare/merge route on pick.

Replace the existing `<header>` block in `BatchDetail.svelte` with:

```svelte
<script lang="ts">
  import VariableTile from './VariableTile.svelte';
  import IngredientList from './IngredientList.svelte';
  import StepsList from './StepsList.svelte';
  import Rating from './Rating.svelte';
  import BatchPickerDropdown from './BatchPickerDropdown.svelte';
  import { goto } from '$app/navigation';
  import type { Recipe, Batch } from '$lib/server';

  let {
    recipe,
    batch,
    batches,
    onMarkCooked = () => {},
    onEditOutcome = () => {}
  }: {
    recipe: Recipe;
    batch: Batch;
    batches: Batch[];
    onMarkCooked?: () => void;
    onEditOutcome?: () => void;
  } = $props();

  const cookedDateLabel = $derived(
    batch.cookedAt ? new Date(batch.cookedAt).toLocaleDateString() : null
  );

  let compareOpen = $state(false);
  let mergeOpen = $state(false);

  function handleCompareWith(otherId: string) {
    goto(`/recipes/${recipe.id}/compare?a=${batch.id}&b=${otherId}`);
  }
  function handleMergeWith(otherId: string) {
    goto(`/recipes/${recipe.id}/merge?a=${batch.id}&b=${otherId}`);
  }
</script>
```

And replace the action bar `<div class="flex gap-2">` block with:

```svelte
<div class="flex gap-2 items-start">
  <a
    href="/recipes/{recipe.id}/new-batch?from={batch.id}"
    class="border border-ochre text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm"
    data-testid="new-batch-btn"
  >+ New Batch</a>

  <div class="relative">
    <button
      type="button"
      onclick={() => { compareOpen = !compareOpen; mergeOpen = false; }}
      class="border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
      data-testid="compare-btn"
    >Compare with…</button>
    <BatchPickerDropdown
      label="Compare with"
      candidates={batches}
      excludeId={batch.id}
      bind:open={compareOpen}
      onPick={handleCompareWith}
    />
  </div>

  <div class="relative">
    <button
      type="button"
      onclick={() => { mergeOpen = !mergeOpen; compareOpen = false; }}
      class="border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
      data-testid="merge-btn"
    >Merge with…</button>
    <BatchPickerDropdown
      label="Merge with"
      candidates={batches}
      excludeId={batch.id}
      bind:open={mergeOpen}
      onPick={handleMergeWith}
    />
  </div>

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
```

- [ ] **Step 3: Pass `batches` to `BatchDetail` from the recipe page**

In `src/routes/recipes/[id]/+page.svelte`, find the `<BatchDetail ...>` line and add the `batches` prop:

```svelte
<BatchDetail
  recipe={data.recipe}
  batch={selected}
  batches={data.batches}
  onMarkCooked={handleMarkCooked}
  onEditOutcome={handleEditOutcome}
/>
```

- [ ] **Step 4: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

- [ ] **Step 5: Run unit suite — confirm no regressions**

- [ ] **Step 6: Commit (controller)**

```bash
git add src/lib/ui/BatchPickerDropdown.svelte src/lib/ui/BatchDetail.svelte 'src/routes/recipes/[id]/+page.svelte'
git commit -m "feat(ui): Compare and Merge entry points with batch picker"
```

---

## Task 7: MergePicker component

**Files:**
- Create: `src/lib/ui/MergePicker.svelte`

Three-pane: parent A (left), result (center), parent B (right). For variables: per-field pick (radio: A | B | custom). For ingredients/steps: whole-list pick (radio: A | B). Result column for variables is editable when "custom" is selected.

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/MergePicker.svelte -->
<script lang="ts">
  import type { Recipe, Batch, VariableValue, VariableSchemaItem } from '$lib/server';

  let {
    recipe,
    a,
    b,
    onSubmit
  }: {
    recipe: Recipe;
    a: Batch;
    b: Batch;
    onSubmit: (input: {
      label: string;
      ingredientsFrom: 'a' | 'b';
      stepsFrom: 'a' | 'b';
      variables: Record<string, VariableValue>;
    }) => Promise<void>;
  } = $props();

  type VarPick = { from: 'a' } | { from: 'b' } | { from: 'custom'; value: VariableValue };

  // Initialize: identical fields auto-pick from a (since they match), differing fields default to 'a'
  function initialPick(item: VariableSchemaItem): VarPick {
    return { from: 'a' };
  }

  let varPicks = $state<Record<string, VarPick>>(
    Object.fromEntries(recipe.variableSchema.map(s => [s.name, initialPick(s)]))
  );
  let ingredientsFrom = $state<'a' | 'b'>('a');
  let stepsFrom = $state<'a' | 'b'>('a');
  let label = $state(`merge of ${a.id} + ${b.id}`);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  function variableValue(item: VariableSchemaItem, side: 'a' | 'b'): VariableValue {
    const v = (side === 'a' ? a.variables : b.variables)[item.name];
    return v ?? null;
  }

  function resolved(item: VariableSchemaItem): VariableValue {
    const pick = varPicks[item.name];
    if (pick.from === 'a') return variableValue(item, 'a');
    if (pick.from === 'b') return variableValue(item, 'b');
    return pick.value;
  }

  function setPick(name: string, pick: VarPick) {
    varPicks = { ...varPicks, [name]: pick };
  }

  function setCustom(name: string, raw: string, type: 'number' | 'text') {
    if (raw === '') { setPick(name, { from: 'custom', value: null }); return; }
    if (type === 'number') {
      const n = parseFloat(raw);
      setPick(name, { from: 'custom', value: Number.isFinite(n) ? n : raw });
    } else {
      setPick(name, { from: 'custom', value: raw });
    }
  }

  function formatValue(v: VariableValue, unit: string): string {
    if (v === null || v === undefined) return '—';
    return unit ? `${v}${unit}` : String(v);
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = null;
    try {
      const variables: Record<string, VariableValue> = {};
      for (const item of recipe.variableSchema) variables[item.name] = resolved(item);
      await onSubmit({ label: label.trim() || `merge of ${a.id} + ${b.id}`, ingredientsFrom, stepsFrom, variables });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to merge';
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-6" data-testid="merge-picker">
  <header class="flex items-center gap-3 border-b border-drafting pb-3">
    <h1 class="font-serif text-2xl">Merge</h1>
    <span class="text-sm font-mono px-2 py-0.5 border border-ochre text-ochre rounded-sm">{a.id}</span>
    <span class="text-obsidian/40">+</span>
    <span class="text-sm font-mono px-2 py-0.5 border border-juniper text-juniper rounded-sm">{b.id}</span>
    <span class="text-obsidian/40">→</span>
    <span class="text-sm font-mono px-2 py-0.5 border border-obsidian rounded-sm">new batch</span>
  </header>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-[11px] uppercase tracking-wider">Label</span>
    <input bind:value={label} required class="border border-drafting bg-canvas px-3 py-2 rounded-sm" data-testid="merge-label" />
  </label>

  {#if recipe.variableSchema.length > 0}
    <section class="flex flex-col gap-2">
      <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Variables</h3>
      <table class="w-full text-sm border border-drafting rounded-sm">
        <thead class="bg-drafting/30 text-[10px] uppercase tracking-wider text-obsidian/60">
          <tr>
            <th class="text-left p-2">Variable</th>
            <th class="text-left p-2">{a.id}</th>
            <th class="text-left p-2">{b.id}</th>
            <th class="text-left p-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {#each recipe.variableSchema as item (item.name)}
            {@const pick = varPicks[item.name]}
            <tr data-testid="merge-variable-row" data-variable={item.name}>
              <td class="p-2 text-[11px] uppercase tracking-wider text-obsidian/70">{item.name}</td>
              <td class="p-2 font-mono">
                <button
                  type="button"
                  onclick={() => setPick(item.name, { from: 'a' })}
                  class="text-left {pick.from === 'a' ? 'text-ochre font-bold' : 'text-obsidian/60 hover:text-obsidian'}"
                  data-testid="pick-a"
                >{formatValue(variableValue(item, 'a'), item.unit)}</button>
              </td>
              <td class="p-2 font-mono">
                <button
                  type="button"
                  onclick={() => setPick(item.name, { from: 'b' })}
                  class="text-left {pick.from === 'b' ? 'text-juniper font-bold' : 'text-obsidian/60 hover:text-obsidian'}"
                  data-testid="pick-b"
                >{formatValue(variableValue(item, 'b'), item.unit)}</button>
              </td>
              <td class="p-2 font-mono">
                {#if pick.from === 'custom'}
                  <input
                    type="text"
                    inputmode={item.type === 'number' ? 'decimal' : 'text'}
                    value={pick.value ?? ''}
                    oninput={(e) => setCustom(item.name, (e.currentTarget as HTMLInputElement).value, item.type)}
                    class="border border-drafting bg-canvas px-2 py-1 rounded-sm w-full font-mono text-sm"
                    data-testid="custom-input"
                  />
                {:else}
                  <span data-testid="result-value">{formatValue(resolved(item), item.unit)}</span>
                {/if}
                <button
                  type="button"
                  onclick={() => setPick(item.name, { from: 'custom', value: resolved(item) })}
                  class="text-[10px] uppercase tracking-wider text-obsidian/50 hover:text-ochre ml-2"
                  data-testid="pick-custom"
                >custom</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Ingredients</h3>
    <div class="flex gap-4">
      <label class="flex items-center gap-2 text-sm">
        <input type="radio" bind:group={ingredientsFrom} value="a" data-testid="ingredients-from-a" />
        From {a.id} ({a.ingredients.length} items)
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="radio" bind:group={ingredientsFrom} value="b" data-testid="ingredients-from-b" />
        From {b.id} ({b.ingredients.length} items)
      </label>
    </div>
  </section>

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Steps</h3>
    <div class="flex gap-4">
      <label class="flex items-center gap-2 text-sm">
        <input type="radio" bind:group={stepsFrom} value="a" data-testid="steps-from-a" />
        From {a.id} ({a.steps.length} steps)
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="radio" bind:group={stepsFrom} value="b" data-testid="steps-from-b" />
        From {b.id} ({b.steps.length} steps)
      </label>
    </div>
  </section>

  {#if error}
    <p class="text-ochre text-sm">{error}</p>
  {/if}

  <div class="flex justify-end gap-2 border-t border-drafting pt-4">
    <a href="/recipes/{recipe.id}" class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</a>
    <button
      type="submit"
      disabled={submitting}
      class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:opacity-50 rounded-sm"
      data-testid="merge-submit"
    >{submitting ? 'Merging…' : 'Record Merge'}</button>
  </div>
</form>
```

- [ ] **Step 2: Verify dev server compiles**

- [ ] **Step 3: Commit (controller)**

```bash
git add src/lib/ui/MergePicker.svelte
git commit -m "feat(ui): MergePicker component (per-field variables, whole-list ingredients/steps)"
```

---

## Task 8: Merge route

**Files:**
- Create: `src/routes/recipes/[id]/merge/+page.server.ts`
- Create: `src/routes/recipes/[id]/merge/+page.svelte`

Loader reads recipe + both batches. Page wires `MergePicker` to the `/api/recipes/:id/batches` POST endpoint, creating a new batch with `parentIds: [aId, bId]`.

- [ ] **Step 1: Implement loader**

```ts
// src/routes/recipes/[id]/merge/+page.server.ts
import { error } from '@sveltejs/kit';
import { readRecipe, readBatch } from '../../../../../lib/server/index.js';

export async function load({ params, url }) {
  const aId = url.searchParams.get('a');
  const bId = url.searchParams.get('b');
  if (!aId || !bId) throw error(400, 'merge requires ?a=...&b=...');

  let recipe, a, b;
  try {
    recipe = await readRecipe(params.id);
    a = await readBatch(params.id, aId);
    b = await readBatch(params.id, bId);
  } catch (err: any) {
    if (err.code === 'ENOENT') throw error(404, 'Not found');
    throw err;
  }

  return { recipe, a, b };
}
```

- [ ] **Step 2: Implement page**

```svelte
<!-- src/routes/recipes/[id]/merge/+page.svelte -->
<script lang="ts">
  import MergePicker from '$lib/ui/MergePicker.svelte';
  import { api } from '$lib/ui/api-client';
  import { goto } from '$app/navigation';
  import type { Recipe, Batch, VariableValue } from '$lib/server';

  let { data }: { data: { recipe: Recipe; a: Batch; b: Batch } } = $props();

  async function handleSubmit(input: {
    label: string;
    ingredientsFrom: 'a' | 'b';
    stepsFrom: 'a' | 'b';
    variables: Record<string, VariableValue>;
  }) {
    const ingredients = input.ingredientsFrom === 'a' ? data.a.ingredients : data.b.ingredients;
    const steps = input.ingredientsFrom === 'b' && input.stepsFrom === 'a'
      // If user picked B's ingredients but A's steps, the steps' uses may reference IDs that don't exist
      // in B's ingredients. We strip those uses to keep referential integrity.
      ? data.a.steps.map(s => ({ text: s.text, uses: s.uses.filter(u => ingredients.some(i => i.id === u.ingredientId)) }))
      : input.stepsFrom === 'a' ? data.a.steps : data.b.steps;
    // Same defensive stripping for the symmetric case
    const finalSteps = (input.ingredientsFrom === 'a' && input.stepsFrom === 'b')
      ? steps.map(s => ({ text: s.text, uses: s.uses.filter(u => ingredients.some(i => i.id === u.ingredientId)) }))
      : steps;

    const batch = await api.createBatch(data.recipe.id, {
      label: input.label,
      parentIds: [data.a.id, data.b.id],
      status: 'draft',
      variables: input.variables,
      ingredients,
      steps: finalSteps
    });
    goto(`/recipes/${data.recipe.id}?batch=${batch.id}`);
  }
</script>

<div class="max-w-5xl mx-auto p-6 flex flex-col gap-4">
  <nav class="flex items-center gap-2 text-sm">
    <a href="/recipes/{data.recipe.id}" class="text-obsidian/60 hover:text-obsidian">← {data.recipe.name}</a>
  </nav>

  <MergePicker recipe={data.recipe} a={data.a} b={data.b} onSubmit={handleSubmit} />
</div>
```

- [ ] **Step 3: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

- [ ] **Step 4: Run unit suite — confirm no regressions**

- [ ] **Step 5: Commit (controller)**

```bash
git add 'src/routes/recipes/[id]/merge'
git commit -m "feat(ui): /recipes/[id]/merge route"
```

---

## Task 9: E2E test — compare and merge flow

**Files:**
- Create: `tests/e2e/compare-merge.e2e.ts`

End-to-end: create recipe + two batches with diverging variables → compare them → merge into a new batch → verify the merged batch has the chosen values.

- [ ] **Step 1: Implement**

```ts
// tests/e2e/compare-merge.e2e.ts
import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async () => { await clearTestData(); });

test('compare two batches and merge them', async ({ page }) => {
  // Create recipe
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Sourdough Cmp');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('bread');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/sourdough-cmp/);

  // Record V1
  await page.getByRole('link', { name: '+ Record V1' }).click();
  await page.getByTestId('batch-label').fill('initial');
  await page.getByTestId('var-hydration').fill('70');
  await page.getByTestId('var-bulk_ferment').fill('5');
  await page.getByTestId('var-bake_temp').fill('475');
  await page.getByTestId('var-yield').fill('2');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Record V2 from V1
  await page.getByTestId('new-batch-btn').click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await page.getByTestId('batch-label').fill('higher hydration');
  // Variables are pre-filled from parent; modify hydration
  await page.getByTestId('var-hydration').fill('75');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // From the recipe page, click Compare with…
  await page.getByTestId('compare-btn').click();
  await expect(page.getByTestId('batch-picker')).toBeVisible();
  // Pick the OTHER batch (not the currently-selected one)
  await page.getByTestId('batch-pick-option').first().click();

  // Compare view renders
  await expect(page.getByTestId('compare-view')).toBeVisible();
  await expect(page.getByTestId('variable-diff-table')).toBeVisible();
  // hydration row should show a delta
  const hydrationRow = page.getByTestId('variable-diff-row').filter({ hasText: 'hydration' });
  await expect(hydrationRow.getByTestId('variable-delta')).toContainText(/[+-]?5/);

  // Go back and merge
  await page.goto('/recipes/sourdough-cmp');
  await page.getByTestId('merge-btn').click();
  await expect(page.getByTestId('batch-picker')).toBeVisible();
  await page.getByTestId('batch-pick-option').first().click();

  await expect(page.getByTestId('merge-picker')).toBeVisible();
  await page.getByTestId('merge-label').fill('merged v3');
  // Default: variables from a, ingredients from a, steps from a — submit and see it create a draft
  await page.getByTestId('merge-submit').click();

  // Lands on the recipe detail with the merged batch selected
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('batch-detail')).toContainText('merged v3');
});
```

- [ ] **Step 2: Run the new test**

Run: `~/.bun/bin/bun run e2e -- compare-merge`
Expected: 1 passed.

If it fails, debug iteratively. Use `~/.bun/bin/bun run e2e:headed -- compare-merge` to watch.

- [ ] **Step 3: Run the full E2E suite**

Run: `~/.bun/bin/bun run e2e`
Expected: 3 passed (foundation + edit-batch + compare-merge).

- [ ] **Step 4: Run the full unit suite**

Run: `~/.bun/bin/bun test`
Expected: all unit tests pass.

- [ ] **Step 5: Commit (controller)**

```bash
git add tests/e2e/compare-merge.e2e.ts
git commit -m "test(e2e): compare and merge flow"
```

---

## Self-review notes

**Spec coverage:**
- Original spec §5.4 (Compare view: variable table with deltas + ingredient/step diff) → Tasks 2, 3, 4, 5
- Original spec §5.5 (Merge view: three-pane picker, write new batch with two parents) → Tasks 7, 8 (with the noted MVP simplification on per-row picking)
- Spec §5.2 entry points (Compare/Merge actions on detail page) → Task 6
- Original spec §9 (E2E for compare and merge) → Task 9

**Type consistency:**
- `IngredientDiffRow`, `DiffLine`, `VariableDiffRow` types are all defined in `diff.ts` and re-exported from `$lib/server`. Components import them as `import type` only.
- `BatchPickerDropdown.candidates` accepts `Batch[]`; the recipe page already loads `data.batches`. Wiring through requires the prop addition in Task 6.
- `MergePicker` `onSubmit` signature matches what the merge page provides; the page constructs the new batch via `api.createBatch` with `parentIds: [a.id, b.id]`.

**Known integration risks:**
- The merge route's "ingredients from B but steps from A" case: A's steps may have `uses` referencing ingredient IDs that don't exist in B's ingredients. The page handler strips those uses defensively; otherwise the API would 400 on the referential-integrity check.
- The `BatchPickerDropdown` is a click-outside-to-close pattern that we haven't implemented. For MVP it closes on selection or when the user toggles the same button. A click outside doesn't dismiss it. Acceptable for MVP; can be polished later.
- `CompareView` and `MergePicker` files are each ~150 lines. If `MergePicker` grows past ~250 during implementation, factor out the variable-row into a small `MergeVariableRow.svelte` — currently it inlines.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-better-batch-compare-merge.md`. 9 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Same pattern as Plans 1, 2, and the amendment.

**2. Inline Execution** — Batch through with checkpoints.

**Which approach?**
