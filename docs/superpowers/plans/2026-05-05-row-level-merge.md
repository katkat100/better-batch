# Row-Level Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Replace the merge picker's whole-list ingredient/step radios with per-row conflict resolution (pick A / pick B / skip) so users can mix and match like a git merge tool.

**Architecture:** Add a parallel `stepObjectDiff` helper to the domain layer that emits Step objects (not just text). Compute three diff arrays in the merge route's `+page.server.ts` loader. Rebuild `MergePicker.svelte` as three single-column lists driven by the diffs and per-row pick state, factoring each row type into a small presentational component (`MergeVarRow`, `MergeIngredientRow`, `MergeStepRow`). Update the page's `onSubmit` to receive resolved arrays instead of A/B selectors.

**Tech Stack:** SvelteKit (Svelte 5 runes) · Bun · TypeScript · Tailwind v4 · `bun:test` · Playwright

Reference: spec at `docs/superpowers/specs/2026-05-05-row-level-merge.md`.

---

## File Structure

```
src/
  lib/
    server/
      domain/
        diff.ts                                 # MODIFIED: add stepObjectDiff
    ui/
      MergePicker.svelte                        # REWRITTEN: three single-column sections; new state + submit signature
      MergeVarRow.svelte                        # NEW: one variable row
      MergeIngredientRow.svelte                 # NEW: one ingredient diff row
      MergeStepRow.svelte                       # NEW: one step diff row
  routes/
    recipes/[id]/merge/
      +page.server.ts                           # MODIFIED: compute varRows / ingRows / stepRows
      +page.svelte                              # MODIFIED: new onSubmit shape

tests/
  domain/
    diff.test.ts                                # MODIFIED: add stepObjectDiff tests
```

The existing `MergePicker.svelte` is ~210 lines. After this rework it stays the orchestrator at ~150 lines, with each row component ~60–80 lines. Net split for readability and isolated reasoning per row type.

---

## Task 1: Domain — `stepObjectDiff`

**Files:**
- Modify: `src/lib/server/domain/diff.ts`
- Modify: `tests/domain/diff.test.ts`

Same LCS algorithm as `stepTextDiff` but emits the full `Step` object (preserving `uses`).

- [ ] **Step 1: Write failing tests**

Append to `tests/domain/diff.test.ts`:

```ts
import { stepObjectDiff } from '../../src/lib/server/domain/diff';

describe('stepObjectDiff', () => {
  const s = (text: string, uses: { ingredientId: string; amount: number }[] = []): Step => ({ text, uses });

  it('marks identical steps as ctx and preserves uses', () => {
    const a = [s('mix', [{ ingredientId: 'flour', amount: 100 }])];
    const b = [s('mix', [{ ingredientId: 'flour', amount: 100 }])];
    const rows = stepObjectDiff(a, b);
    expect(rows).toEqual([{ op: 'ctx', step: a[0] }]);
  });

  it('marks A-only steps as rem with full step object', () => {
    const a = [s('one', [{ ingredientId: 'flour', amount: 50 }])];
    const b: Step[] = [];
    const rows = stepObjectDiff(a, b);
    expect(rows).toEqual([{ op: 'rem', step: a[0] }]);
  });

  it('marks B-only steps as add with full step object', () => {
    const a: Step[] = [];
    const b = [s('two', [{ ingredientId: 'salt', amount: 5 }])];
    const rows = stepObjectDiff(a, b);
    expect(rows).toEqual([{ op: 'add', step: b[0] }]);
  });

  it('aligns inserted steps in B without misaligning later ones', () => {
    const a = [s('mix'), s('bake')];
    const b = [s('mix'), s('rise'), s('bake')];
    const rows = stepObjectDiff(a, b);
    expect(rows.map(r => [r.op, r.step.text])).toEqual([
      ['ctx', 'mix'],
      ['add', 'rise'],
      ['ctx', 'bake']
    ]);
  });

  it('different uses with same text are still ctx (text-only matching)', () => {
    const a = [s('mix', [{ ingredientId: 'flour', amount: 100 }])];
    const b = [s('mix', [{ ingredientId: 'flour', amount: 50 }])];
    const rows = stepObjectDiff(a, b);
    expect(rows).toEqual([{ op: 'ctx', step: a[0] }]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `~/.bun/bin/bun test tests/domain/diff.test.ts`

Expected: failures because `stepObjectDiff` doesn't exist.

- [ ] **Step 3: Implement**

Append to `src/lib/server/domain/diff.ts`:

```ts
export type StepObjectDiffOp = 'ctx' | 'add' | 'rem';
export interface StepObjectDiffRow {
  op: StepObjectDiffOp;
  step: Step;
}

export function stepObjectDiff(a: Step[], b: Step[]): StepObjectDiffRow[] {
  // LCS on step.text (same as textArrayDiff), then emit Step objects.
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      dp[i][j] = a[i - 1].text === b[j - 1].text
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const out: StepObjectDiffRow[] = [];
  let i = n, j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1].text === b[j - 1].text) { out.push({ op: 'ctx', step: a[i - 1] }); i--; j--; }
    else if (dp[i - 1][j] > dp[i][j - 1]) { out.push({ op: 'rem', step: a[i - 1] }); i--; }
    else { out.push({ op: 'add', step: b[j - 1] }); j--; }
  }
  while (i > 0) { out.push({ op: 'rem', step: a[i - 1] }); i--; }
  while (j > 0) { out.push({ op: 'add', step: b[j - 1] }); j--; }
  return out.reverse();
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `~/.bun/bin/bun test tests/domain/diff.test.ts`
Expected: 14 pass (9 prior + 5 new).

- [ ] **Step 5: Run full unit suite**

Run: `~/.bun/bin/bun test`
Expected: 72 pass (67 prior + 5 new).

- [ ] **Step 6: Commit (controller)**

```bash
git add src/lib/server/domain/diff.ts tests/domain/diff.test.ts
git commit -m "feat(domain): stepObjectDiff (LCS-aligned step matching with full step payload)"
```

---

## Task 2: Merge loader computes diffs

**Files:**
- Modify: `src/routes/recipes/[id]/merge/+page.server.ts`

Adds three diffs to the loader return so the page can pass them to `MergePicker`.

- [ ] **Step 1: Update the loader**

Replace `src/routes/recipes/[id]/merge/+page.server.ts` with:

```ts
// src/routes/recipes/[id]/merge/+page.server.ts
import { error } from '@sveltejs/kit';
import {
  readRecipe, readBatch,
  variableDiff, ingredientDiff, stepObjectDiff
} from '$lib/server';

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

  const varRows = variableDiff(recipe.variableSchema, a.variables, b.variables);
  const ingRows = ingredientDiff(a.ingredients, b.ingredients);
  const stepRows = stepObjectDiff(a.steps, b.steps);

  return { recipe, a, b, varRows, ingRows, stepRows };
}
```

- [ ] **Step 2: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200, no errors in log.

- [ ] **Step 3: Run unit suite — confirm no regressions**

- [ ] **Step 4: Commit (controller)**

```bash
git add 'src/routes/recipes/[id]/merge/+page.server.ts'
git commit -m "feat(merge): loader computes varRows/ingRows/stepRows"
```

---

## Task 3: MergeVarRow component

**Files:**
- Create: `src/lib/ui/MergeVarRow.svelte`

Extracts one variable row (today inline in MergePicker) into a focused component. Keeps the existing three-way A/B/custom UX, just rendered as a flex row instead of a table cell.

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/MergeVarRow.svelte -->
<script lang="ts">
  import type { VariableSchemaItem, VariableValue } from '$lib/server';

  type VarPick = { from: 'a' } | { from: 'b' } | { from: 'custom'; value: VariableValue };

  let {
    item,
    aValue,
    bValue,
    pick = $bindable({ from: 'a' } as VarPick),
    aLabel = 'A',
    bLabel = 'B'
  }: {
    item: VariableSchemaItem;
    aValue: VariableValue;
    bValue: VariableValue;
    pick?: VarPick;
    aLabel?: string;
    bLabel?: string;
  } = $props();

  function format(v: VariableValue): string {
    if (v === null || v === undefined) return '—';
    return item.unit ? `${v}${item.unit}` : String(v);
  }

  function setCustom(raw: string) {
    if (raw === '') { pick = { from: 'custom', value: null }; return; }
    if (item.type === 'number') {
      const n = parseFloat(raw);
      pick = { from: 'custom', value: Number.isFinite(n) ? n : raw };
    } else {
      pick = { from: 'custom', value: raw };
    }
  }

  const resolved = $derived(
    pick.from === 'a' ? aValue : pick.from === 'b' ? bValue : pick.value
  );
</script>

<div class="grid grid-cols-[110px_1fr_1fr_1fr_auto] gap-3 items-center text-sm py-2 border-b border-drafting/50" data-testid="merge-var-row" data-variable={item.name}>
  <span class="text-[11px] uppercase tracking-wider text-obsidian/70">{item.name}</span>
  <button
    type="button"
    onclick={() => pick = { from: 'a' }}
    class="font-mono text-left {pick.from === 'a' ? 'text-ochre font-bold' : 'text-obsidian/60 hover:text-obsidian'}"
    data-testid="pick-a"
    title={aLabel}
  >{format(aValue)}</button>
  <button
    type="button"
    onclick={() => pick = { from: 'b' }}
    class="font-mono text-left {pick.from === 'b' ? 'text-juniper font-bold' : 'text-obsidian/60 hover:text-obsidian'}"
    data-testid="pick-b"
    title={bLabel}
  >{format(bValue)}</button>
  <span class="font-mono">
    {#if pick.from === 'custom'}
      <input
        type="text"
        inputmode={item.type === 'number' ? 'decimal' : 'text'}
        value={pick.value ?? ''}
        oninput={(e) => setCustom((e.currentTarget as HTMLInputElement).value)}
        class="border border-drafting bg-canvas px-2 py-1 rounded-sm w-full font-mono text-sm"
        data-testid="custom-input"
      />
    {:else}
      <span data-testid="result-value">{format(resolved)}</span>
    {/if}
  </span>
  <button
    type="button"
    onclick={() => pick = { from: 'custom', value: resolved }}
    class="text-[10px] uppercase tracking-wider text-obsidian/50 hover:text-ochre"
    data-testid="pick-custom"
  >custom</button>
</div>
```

- [ ] **Step 2: Verify dev server compiles**

(Component is unreferenced; just confirm parse.)

- [ ] **Step 3: Commit (controller)**

```bash
git add src/lib/ui/MergeVarRow.svelte
git commit -m "feat(ui): MergeVarRow component (extracted from MergePicker)"
```

---

## Task 4: MergeIngredientRow component

**Files:**
- Create: `src/lib/ui/MergeIngredientRow.svelte`

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/MergeIngredientRow.svelte -->
<script lang="ts">
  import type { Ingredient, IngredientDiffRow } from '$lib/server';

  type IngAction = 'pick-a' | 'pick-b' | 'skip';

  let {
    row,
    pick = $bindable({ action: 'skip' } as { action: IngAction })
  }: {
    row: IngredientDiffRow;
    pick?: { action: IngAction };
  } = $props();

  function format(ing: Ingredient): string {
    const amt = `${ing.amount}${ing.unit ? ' ' + ing.unit : ''}`;
    const sec = ing.section ? ` [${ing.section}]` : '';
    return `${amt} ${ing.name}${sec}`;
  }

  function set(action: IngAction) { pick = { action }; }

  function btnClass(target: IngAction, color: 'ochre' | 'juniper' | 'obsidian'): string {
    const active = pick.action === target;
    if (active) {
      if (color === 'ochre') return 'bg-ochre text-canvas border-ochre';
      if (color === 'juniper') return 'bg-juniper text-canvas border-juniper';
      return 'bg-obsidian text-canvas border-obsidian';
    }
    return 'bg-canvas text-obsidian/60 border-drafting hover:border-obsidian';
  }
</script>

<div class="flex items-center gap-2 px-2 py-1.5 border border-drafting/60 rounded-sm text-xs font-mono"
     class:bg-drafting={row.op === 'mod'}
     data-testid="merge-ing-row"
     data-op={row.op}>
  {#if row.op === 'ctx'}
    <span class="text-[9px] uppercase tracking-wider text-obsidian/40 w-9">unch</span>
    <span class="flex-1 text-obsidian/60">{format(row.a!)}</span>
    <span class="text-[9px] uppercase tracking-wider text-obsidian/40">in result</span>
  {:else if row.op === 'mod'}
    <span class="text-[9px] uppercase tracking-wider text-ochre w-9">conf</span>
    <span class="flex-1">
      <span class="text-ochre">{format(row.a!)}</span>
      <span class="mx-2 text-obsidian/40">→</span>
      <span class="text-juniper">{format(row.b!)}</span>
    </span>
    <div class="flex gap-1">
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-a', 'ochre')}" onclick={() => set('pick-a')} data-testid="merge-pick-a">A</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-b', 'juniper')}" onclick={() => set('pick-b')} data-testid="merge-pick-b">B</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('skip', 'obsidian')}" onclick={() => set('skip')} data-testid="merge-skip">skip</button>
    </div>
  {:else if row.op === 'rem'}
    <span class="text-[9px] uppercase tracking-wider text-ochre w-9">−A</span>
    <span class="flex-1 text-ochre">{format(row.a!)}</span>
    <div class="flex gap-1">
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-a', 'ochre')}" onclick={() => set('pick-a')} data-testid="merge-keep">keep</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('skip', 'obsidian')}" onclick={() => set('skip')} data-testid="merge-skip">skip</button>
    </div>
  {:else if row.op === 'add'}
    <span class="text-[9px] uppercase tracking-wider text-juniper w-9">+B</span>
    <span class="flex-1 text-juniper">{format(row.b!)}</span>
    <div class="flex gap-1">
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('skip', 'obsidian')}" onclick={() => set('skip')} data-testid="merge-skip">skip</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-b', 'juniper')}" onclick={() => set('pick-b')} data-testid="merge-add">add</button>
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Verify dev server compiles**

- [ ] **Step 3: Commit (controller)**

```bash
git add src/lib/ui/MergeIngredientRow.svelte
git commit -m "feat(ui): MergeIngredientRow component"
```

---

## Task 5: MergeStepRow component

**Files:**
- Create: `src/lib/ui/MergeStepRow.svelte`

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/MergeStepRow.svelte -->
<script lang="ts">
  import type { StepObjectDiffRow } from '$lib/server';

  type StepAction = 'pick-a' | 'pick-b' | 'skip';

  let {
    row,
    pick = $bindable({ action: 'skip' } as { action: StepAction })
  }: {
    row: StepObjectDiffRow;
    pick?: { action: StepAction };
  } = $props();

  function truncate(text: string, max = 80): string {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function set(action: StepAction) { pick = { action }; }

  function btnClass(target: StepAction, color: 'ochre' | 'juniper' | 'obsidian'): string {
    const active = pick.action === target;
    if (active) {
      if (color === 'ochre') return 'bg-ochre text-canvas border-ochre';
      if (color === 'juniper') return 'bg-juniper text-canvas border-juniper';
      return 'bg-obsidian text-canvas border-obsidian';
    }
    return 'bg-canvas text-obsidian/60 border-drafting hover:border-obsidian';
  }
</script>

<div class="flex items-center gap-2 px-2 py-1.5 border border-drafting/60 rounded-sm text-xs font-mono"
     data-testid="merge-step-row"
     data-op={row.op}>
  {#if row.op === 'ctx'}
    <span class="text-[9px] uppercase tracking-wider text-obsidian/40 w-9">unch</span>
    <span class="flex-1 text-obsidian/60" title={row.step.text}>{truncate(row.step.text)}</span>
    <span class="text-[9px] uppercase tracking-wider text-obsidian/40">in result</span>
  {:else if row.op === 'rem'}
    <span class="text-[9px] uppercase tracking-wider text-ochre w-9">−A</span>
    <span class="flex-1 text-ochre" title={row.step.text}>{truncate(row.step.text)}</span>
    <div class="flex gap-1">
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-a', 'ochre')}" onclick={() => set('pick-a')} data-testid="merge-keep">keep</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('skip', 'obsidian')}" onclick={() => set('skip')} data-testid="merge-skip">skip</button>
    </div>
  {:else if row.op === 'add'}
    <span class="text-[9px] uppercase tracking-wider text-juniper w-9">+B</span>
    <span class="flex-1 text-juniper" title={row.step.text}>{truncate(row.step.text)}</span>
    <div class="flex gap-1">
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('skip', 'obsidian')}" onclick={() => set('skip')} data-testid="merge-skip">skip</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-b', 'juniper')}" onclick={() => set('pick-b')} data-testid="merge-add">add</button>
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Verify dev server compiles**

- [ ] **Step 3: Commit (controller)**

```bash
git add src/lib/ui/MergeStepRow.svelte
git commit -m "feat(ui): MergeStepRow component"
```

---

## Task 6: Rewrite MergePicker

**Files:**
- Modify: `src/lib/ui/MergePicker.svelte`

Drop the table and the radio sections; consume the three diff arrays via row components; new state shape; new submit signature.

- [ ] **Step 1: Replace MergePicker.svelte**

```svelte
<!-- src/lib/ui/MergePicker.svelte -->
<script lang="ts">
  import MergeVarRow from './MergeVarRow.svelte';
  import MergeIngredientRow from './MergeIngredientRow.svelte';
  import MergeStepRow from './MergeStepRow.svelte';
  import type {
    Recipe, Batch, Ingredient, Step, VariableValue,
    VariableDiffRow, IngredientDiffRow, StepObjectDiffRow
  } from '$lib/server';

  let {
    recipe,
    a,
    b,
    varRows,
    ingRows,
    stepRows,
    onSubmit
  }: {
    recipe: Recipe;
    a: Batch;
    b: Batch;
    varRows: VariableDiffRow[];
    ingRows: IngredientDiffRow[];
    stepRows: StepObjectDiffRow[];
    onSubmit: (input: {
      label: string;
      variables: Record<string, VariableValue>;
      ingredients: Ingredient[];
      steps: Step[];
    }) => Promise<void>;
  } = $props();

  type VarPick = { from: 'a' } | { from: 'b' } | { from: 'custom'; value: VariableValue };
  type IngPick = { action: 'pick-a' | 'pick-b' | 'skip' };
  type StepPick = { action: 'pick-a' | 'pick-b' | 'skip' };

  // Default: B (newer) wins on conflicts; identical rows pick A by convention.
  let varPicks = $state<VarPick[]>(varRows.map(r => r.changed ? { from: 'b' } : { from: 'a' }));
  let ingPicks = $state<IngPick[]>(ingRows.map(r => {
    if (r.op === 'ctx') return { action: 'pick-a' };
    if (r.op === 'mod') return { action: 'pick-b' };
    if (r.op === 'rem') return { action: 'skip' };
    return { action: 'pick-b' }; // add
  }));
  let stepPicks = $state<StepPick[]>(stepRows.map(r => {
    if (r.op === 'ctx') return { action: 'pick-a' };
    if (r.op === 'rem') return { action: 'skip' };
    return { action: 'pick-b' }; // add
  }));

  let label = $state(`merge of ${a.label} + ${b.label}`);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  // Resolved arrays
  const resolvedVars = $derived.by<Record<string, VariableValue>>(() => {
    const out: Record<string, VariableValue> = {};
    for (const item of recipe.variableSchema) {
      const idx = varRows.findIndex(r => r.name === item.name);
      const pick = idx >= 0 ? varPicks[idx] : { from: 'a' as const };
      out[item.name] = pick.from === 'a'
        ? (a.variables[item.name] ?? null)
        : pick.from === 'b'
        ? (b.variables[item.name] ?? null)
        : pick.value;
    }
    return out;
  });

  const resolvedIngredients = $derived.by<Ingredient[]>(() => {
    const out: Ingredient[] = [];
    for (let i = 0; i < ingRows.length; i++) {
      const row = ingRows[i];
      const pick = ingPicks[i];
      if (row.op === 'ctx') { if (row.a) out.push(row.a); continue; }
      if (pick.action === 'skip') continue;
      if (pick.action === 'pick-a' && row.a) out.push(row.a);
      else if (pick.action === 'pick-b' && row.b) out.push(row.b);
    }
    return out;
  });

  const resolvedSteps = $derived.by<Step[]>(() => {
    const out: Step[] = [];
    for (let i = 0; i < stepRows.length; i++) {
      const row = stepRows[i];
      const pick = stepPicks[i];
      if (row.op === 'ctx') { out.push(row.step); continue; }
      if (pick.action === 'skip') continue;
      // For rem, pick.action === 'pick-a' means keep; for add, 'pick-b' means add.
      out.push(row.step);
    }
    return out;
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = null;
    try {
      await onSubmit({
        label: label.trim() || `merge of ${a.label} + ${b.label}`,
        variables: resolvedVars,
        ingredients: resolvedIngredients,
        steps: resolvedSteps
      });
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
    <span class="text-sm px-2 py-0.5 border border-ochre text-ochre rounded-sm">{a.label}</span>
    <span class="text-obsidian/40">+</span>
    <span class="text-sm px-2 py-0.5 border border-juniper text-juniper rounded-sm">{b.label}</span>
    <span class="text-obsidian/40">→</span>
    <span class="text-sm px-2 py-0.5 border border-obsidian rounded-sm">new batch</span>
  </header>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-[11px] uppercase tracking-wider">Label</span>
    <input bind:value={label} required class="border border-drafting bg-canvas px-3 py-2 rounded-sm" data-testid="merge-label" />
  </label>

  {#if recipe.variableSchema.length > 0}
    <section class="flex flex-col gap-1">
      <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Variables</h3>
      <div class="grid grid-cols-[110px_1fr_1fr_1fr_auto] gap-3 text-[10px] uppercase tracking-wider text-obsidian/60 px-0 py-1">
        <span>Variable</span>
        <span>{a.label}</span>
        <span>{b.label}</span>
        <span>Result</span>
        <span></span>
      </div>
      {#each recipe.variableSchema as item, i (item.name)}
        {@const rowIdx = varRows.findIndex(r => r.name === item.name)}
        {#if rowIdx >= 0}
          <MergeVarRow
            {item}
            aValue={a.variables[item.name] ?? null}
            bValue={b.variables[item.name] ?? null}
            bind:pick={varPicks[rowIdx]}
            aLabel={a.label}
            bLabel={b.label}
          />
        {/if}
      {/each}
    </section>
  {/if}

  <section class="flex flex-col gap-1.5">
    <div class="flex justify-between items-baseline">
      <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Ingredients</h3>
      <span class="text-[10px] text-obsidian/40" data-testid="ingredients-result-count">Result: {resolvedIngredients.length} ingredient{resolvedIngredients.length === 1 ? '' : 's'}</span>
    </div>
    {#each ingRows as row, i (i)}
      <MergeIngredientRow {row} bind:pick={ingPicks[i]} />
    {/each}
  </section>

  <section class="flex flex-col gap-1.5">
    <div class="flex justify-between items-baseline">
      <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Steps</h3>
      <span class="text-[10px] text-obsidian/40" data-testid="steps-result-count">Result: {resolvedSteps.length} step{resolvedSteps.length === 1 ? '' : 's'}</span>
    </div>
    {#each stepRows as row, i (i)}
      <MergeStepRow {row} bind:pick={stepPicks[i]} />
    {/each}
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

- [ ] **Step 3: Run unit suite**

- [ ] **Step 4: Commit (controller)**

```bash
git add src/lib/ui/MergePicker.svelte
git commit -m "feat(ui): MergePicker rewritten as row-level conflict resolution"
```

---

## Task 7: Update merge page submit signature

**Files:**
- Modify: `src/routes/recipes/[id]/merge/+page.svelte`

The page consumed the old `{label, ingredientsFrom, stepsFrom, variables}` shape. Update to consume the new `{label, variables, ingredients, steps}` shape. The defensive step-uses strip stays.

- [ ] **Step 1: Update the page**

Replace `src/routes/recipes/[id]/merge/+page.svelte`:

```svelte
<!-- src/routes/recipes/[id]/merge/+page.svelte -->
<script lang="ts">
  import MergePicker from '$lib/ui/MergePicker.svelte';
  import { api } from '$lib/ui/api-client';
  import { goto } from '$app/navigation';
  import type {
    Recipe, Batch, VariableValue, Ingredient, Step,
    VariableDiffRow, IngredientDiffRow, StepObjectDiffRow
  } from '$lib/server';

  let { data }: { data: {
    recipe: Recipe; a: Batch; b: Batch;
    varRows: VariableDiffRow[]; ingRows: IngredientDiffRow[]; stepRows: StepObjectDiffRow[];
  } } = $props();

  async function handleSubmit(input: {
    label: string;
    variables: Record<string, VariableValue>;
    ingredients: Ingredient[];
    steps: Step[];
  }) {
    // Defensive: strip step.uses references to ingredients absent from the chosen set.
    const ingredientIds = new Set(input.ingredients.map(i => i.id));
    const finalSteps = input.steps.map(s => ({
      text: s.text,
      uses: s.uses.filter(u => ingredientIds.has(u.ingredientId))
    }));

    const batch = await api.createBatch(data.recipe.id, {
      label: input.label,
      parentIds: [data.a.id, data.b.id],
      status: 'draft',
      variables: input.variables,
      ingredients: input.ingredients,
      steps: finalSteps
    });
    goto(`/recipes/${data.recipe.id}?batch=${batch.id}`);
  }
</script>

<div class="max-w-5xl mx-auto p-6 flex flex-col gap-4">
  <nav class="flex items-center gap-2 text-sm">
    <a href="/recipes/{data.recipe.id}" class="text-obsidian/60 hover:text-obsidian">← {data.recipe.name}</a>
  </nav>

  <MergePicker
    recipe={data.recipe}
    a={data.a}
    b={data.b}
    varRows={data.varRows}
    ingRows={data.ingRows}
    stepRows={data.stepRows}
    onSubmit={handleSubmit}
  />
</div>
```

- [ ] **Step 2: Verify dev server compiles + smoke**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200, no errors in log.

- [ ] **Step 3: Run unit suite**

- [ ] **Step 4: Commit (controller)**

```bash
git add 'src/routes/recipes/[id]/merge/+page.svelte'
git commit -m "feat(ui): merge page passes resolved arrays to api.createBatch"
```

---

## Task 8: E2E verification

**Files:**
- Possibly modify: `tests/e2e/compare-merge.e2e.ts` (only if needed)

The existing test fills `merge-label` and clicks `merge-submit`. With defaults set to "newer wins", the test should still produce a valid merged batch and the assertion `await expect(page.getByTestId('batch-detail')).toContainText('merged v3')` should pass since it only checks the resulting batch label.

- [ ] **Step 1: Run full E2E suite**

Run: `~/.bun/bin/bun run e2e`
Expected: 4 passed.

- [ ] **Step 2: If any test fails, debug**

Common failure modes:
- Old testids removed (e.g. `ingredients-from-a` no longer exists). The current test doesn't reference these, so should be fine. If the test does reference them, update to use the new testids (`merge-ing-row`, `merge-pick-a`, etc.) or remove the assertion.
- Defaults produce different result label. The test only asserts on label `merged v3`, which is independent of pick decisions. Should pass.

If a real test failure surfaces, report BLOCKED to the controller with the verbatim error.

- [ ] **Step 3: Run full unit suite — confirm no regressions**

Run: `~/.bun/bin/bun test`
Expected: 72 pass.

- [ ] **Step 4: Commit (controller, only if e2e file was modified)**

If the e2e file was edited:

```bash
git add tests/e2e/compare-merge.e2e.ts
git commit -m "test(e2e): update merge flow for row-level UI"
```

---

## Self-review notes

**Spec coverage:**
- Spec §2 (diff inputs: varRows/ingRows/stepRows) → Tasks 1, 2
- Spec §3.1 (VarPick model with B-default on changed) → Task 6 (state init)
- Spec §3.2 (IngPick model with op-aware defaults) → Task 6 (state init)
- Spec §3.3 (StepPick model) → Task 6
- Spec §3.4 (resolved arrays computed reactively) → Task 6 (`$derived.by`)
- Spec §4 (single-column UI per section) → Tasks 3, 4, 5, 6
- Spec §5 (component breakdown) → Tasks 3, 4, 5, 6
- Spec §6 (submit flow with new shape + defensive strip) → Task 7
- Spec §7 (no API impact) → confirmed; existing endpoints handle the payload
- Spec §8 (testing — stepObjectDiff unit tests + E2E verify) → Tasks 1, 8

**Type consistency:**
- `IngPick = { action: 'pick-a' | 'pick-b' | 'skip' }` defined in Tasks 4 and 6, identical shape.
- `StepPick = { action: 'pick-a' | 'pick-b' | 'skip' }` ditto in Tasks 5 and 6.
- `VarPick = { from: 'a' } | { from: 'b' } | { from: 'custom'; value: VariableValue }` in Tasks 3 and 6.
- `StepObjectDiffRow` defined in Task 1, imported in Tasks 5, 6, 7.

**Known integration risks:**
- The `bind:pick={varPicks[rowIdx]}` in Task 6's MergePicker needs Svelte 5 to support binding to array elements. Svelte 5 does support this with `$bindable()` props. Verified by the existing UsesEditor pattern (`bind:uses={step.uses}` in BatchEditor).
- `varRows.findIndex(r => r.name === item.name)` runs on every $derived recompute. For tiny variable schemas (~5 items) this is fine; if a recipe ever has 50+ variables, switch to a Map. YAGNI for now.
- The defensive step-uses strip in Task 7 silently drops references. We don't surface a warning. Acceptable per spec §9.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-row-level-merge.md`. 8 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — same pattern as before.
**2. Inline Execution**

**Which approach?**
