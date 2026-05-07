# Better Batch — Core UI Implementation Plan (Plan 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Stand up the Better Batch UI for everything except compare and merge — notecard grid home, recipe detail with SVG DAG sidebar, new-batch flow, and mark-as-cooked. After this plan, you can use the site end-to-end for everyday recipe iteration.

**Architecture:** Svelte 5 components in `src/lib/ui/`, organized by responsibility. A pure-function graph layout module (`graph-layout.ts`) computes 2D positions for the DAG; the `BatchGraph.svelte` component consumes its output to render SVG. Routes load data via `+page.server.ts` against the existing storage/API layer (Plan 1) and post mutations to the API endpoints. Tailwind v4 theme tokens (`bg-canvas`, `text-obsidian`, `border-drafting`, `text-ochre`, `text-juniper`, `font-serif`, `font-sans`, `rounded-sm`) drive all styling — no raw hex anywhere.

**Tech Stack:** SvelteKit (Svelte 5 with runes — `$props`, `$state`, `$derived`) · Bun · TypeScript · Tailwind CSS v4 · `bun:test` · Playwright (added in Task 11)

Reference: spec at `docs/superpowers/specs/2026-05-04-better-batch-design.md`. Foundation plan at `docs/superpowers/plans/2026-05-04-better-batch-foundation.md`.

---

## File Structure

Files this plan creates or modifies:

```
better-batch/
  src/
    lib/
      ui/
        Sparkline.svelte              # SVG sparkline for the home cards
        NotecardCard.svelte           # One recipe card
        Toolbar.svelte                # Home page search/filter/sort bar
        NewRecipeDialog.svelte        # Modal for creating a recipe
        BatchGraph.svelte             # SVG DAG of batches in a recipe
        BatchDetail.svelte            # Right-pane content of recipe page
        VariableTile.svelte           # One stat tile in the variable strip
        IngredientList.svelte         # Read-only ingredient display
        StepsList.svelte              # Read-only steps display
        Rating.svelte                 # 1–5 star display/picker
        OutcomeForm.svelte            # Inline form for cooked notes + rating
        BatchEditor.svelte            # Form for creating a new batch
        layout/
          graph-layout.ts             # Pure function: batches → 2D positions + edges
        api-client.ts                 # Tiny typed fetch wrappers for /api
    routes/
      +page.server.ts                 # Home loader (reads index)
      +page.svelte                    # Home page (replaces placeholder)
      recipes/[id]/
        +page.server.ts               # Recipe detail loader
        +page.svelte                  # Recipe detail (DAG + detail pane)
        new-batch/
          +page.server.ts             # Load recipe + parent batch
          +page.svelte                # BatchEditor wiring
        batches/[batchId]/
          cook/
            +page.svelte              # Outcome form (could also be inline modal)
  tests/
    ui/
      graph-layout.test.ts            # TDD for the layout algorithm
      sparkline.test.ts               # Smoke test on Sparkline path output
    e2e/
      foundation.spec.ts              # Playwright: create recipe → add batch → mark cooked
  playwright.config.ts                # Playwright config (Task 11)
```

Each Svelte component stays focused (target <150 lines). The graph layout is the only file with non-trivial pure logic; everything else is wiring.

---

## Task 1: Sparkline component

**Files:**
- Create: `src/lib/ui/Sparkline.svelte`
- Create: `src/lib/ui/layout/sparkline-path.ts` (pure path-string builder)
- Test: `tests/ui/sparkline.test.ts`

The sparkline is used on each recipe card to show how the first numeric variable evolved. We split the SVG path-string generation into a pure function so we can unit-test it.

- [ ] **Step 1: Write failing tests for `sparklinePath`**

```ts
// tests/ui/sparkline.test.ts
import { describe, it, expect } from 'bun:test';
import { sparklinePath } from '../../src/lib/ui/layout/sparkline-path';

describe('sparklinePath', () => {
  it('returns empty string for fewer than 2 points', () => {
    expect(sparklinePath([], 100, 20)).toBe('');
    expect(sparklinePath([5], 100, 20)).toBe('');
  });

  it('renders a flat horizontal line at y-mid for constant values', () => {
    const path = sparklinePath([5, 5, 5], 100, 20);
    // 3 points → x: 0, 50, 100; y: midline (10) for all
    expect(path).toBe('M 0 10 L 50 10 L 100 10');
  });

  it('maps min to bottom (y=height) and max to top (y=0) with 1px inset', () => {
    const path = sparklinePath([0, 10], 100, 20);
    // inset = 1 → max y = 1, min y = 19
    expect(path).toBe('M 0 19 L 100 1');
  });

  it('skips null points by drawing line through gaps', () => {
    const path = sparklinePath([1, null, 3], 100, 20);
    // null skipped: 2 valid points at x=0 and x=100
    expect(path).toBe('M 0 19 L 100 1');
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `~/.bun/bin/bun test tests/ui/sparkline.test.ts`

- [ ] **Step 3: Implement the path builder**

```ts
// src/lib/ui/layout/sparkline-path.ts
export function sparklinePath(values: (number | null)[], width: number, height: number): string {
  const points = values
    .map((v, i) => ({ v, i }))
    .filter(p => typeof p.v === 'number') as { v: number; i: number }[];
  if (points.length < 2) return '';

  const xs = points.map(p => p.i);
  const ys = points.map(p => p.v);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = xMax - xMin || 1;
  const yRange = yMax - yMin || 1;
  const inset = 1;

  const coords = points.map(p => {
    const x = ((p.i - xMin) / xRange) * width;
    const y = yMax === yMin
      ? height / 2
      : (1 - (p.v - yMin) / yRange) * (height - 2 * inset) + inset;
    return `${x} ${y}`;
  });
  return `M ${coords[0]} ` + coords.slice(1).map(c => `L ${c}`).join(' ');
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Implement Sparkline.svelte**

```svelte
<!-- src/lib/ui/Sparkline.svelte -->
<script lang="ts">
  import { sparklinePath } from './layout/sparkline-path';

  let { values, width = 80, height = 16, label = '' }: {
    values: (number | null)[];
    width?: number;
    height?: number;
    label?: string;
  } = $props();

  const path = $derived(sparklinePath(values, width, height));
</script>

<svg width={width} height={height} role="img" aria-label={label} class="overflow-visible">
  {#if path}
    <path d={path} fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
  {:else}
    <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" stroke-width="1" stroke-dasharray="2 2" opacity="0.4" />
  {/if}
</svg>
```

- [ ] **Step 6: Run full suite, expect PASS**

Run: `~/.bun/bin/bun test`

- [ ] **Step 7: Commit (controller)**

```bash
git add src/lib/ui/Sparkline.svelte src/lib/ui/layout/sparkline-path.ts tests/ui/sparkline.test.ts
git commit -m "feat(ui): Sparkline component with pure path builder"
```

---

## Task 2: API client helpers

**Files:**
- Create: `src/lib/ui/api-client.ts`

Tiny typed wrappers around `fetch` for the routes that page components call. Centralizes URL construction and JSON parsing.

- [ ] **Step 1: Implement**

```ts
// src/lib/ui/api-client.ts
import type { Recipe, Batch, IndexEntry, RecipePreset, BatchStatus, VariableValue, Ingredient } from '$lib/server';

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  async listRecipes(): Promise<IndexEntry[]> {
    return jsonOrThrow(await fetch('/api/recipes'));
  },

  async createRecipe(input: { name: string; preset: RecipePreset; tags: string[]; description?: string }): Promise<Recipe> {
    return jsonOrThrow(await fetch('/api/recipes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    }));
  },

  async getRecipe(id: string): Promise<{ recipe: Recipe; batches: Batch[] }> {
    return jsonOrThrow(await fetch(`/api/recipes/${id}`));
  },

  async createBatch(recipeId: string, input: {
    label: string;
    parentIds: string[];
    status: BatchStatus;
    variables: Record<string, VariableValue>;
    ingredients: Ingredient[];
    steps: string[];
    outcomeNotes?: string;
    rating?: 1 | 2 | 3 | 4 | 5 | null;
  }): Promise<Batch> {
    return jsonOrThrow(await fetch(`/api/recipes/${recipeId}/batches`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    }));
  },

  async patchBatch(recipeId: string, batchId: string, patch: Partial<Batch>): Promise<Batch> {
    return jsonOrThrow(await fetch(`/api/recipes/${recipeId}/batches/${batchId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    }));
  }
};
```

**Note on `$lib/server` imports:** This file lives in `src/lib/ui/` and imports types from `$lib/server`. SvelteKit resolves `$lib` at the bundler level (Vite), so this works at runtime. The Bun test runner can't resolve `$lib`, but this file isn't tested by Bun — it's only imported from Svelte components which run through Vite.

- [ ] **Step 2: Verify TypeScript**

Run: `~/.bun/bin/bun x svelte-kit sync && ~/.bun/bin/bun x tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit (controller)**

```bash
git add src/lib/ui/api-client.ts
git commit -m "feat(ui): typed API client wrappers"
```

---

## Task 3: NotecardCard component

**Files:**
- Create: `src/lib/ui/NotecardCard.svelte`

The recipe card on the home page. 4×6 portrait proportion, hairline border, no rounded corners beyond `rounded-sm`.

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/NotecardCard.svelte -->
<script lang="ts">
  import Sparkline from './Sparkline.svelte';
  import type { IndexEntry } from '$lib/server';

  let { entry }: { entry: IndexEntry } = $props();

  const lastCookedLabel = $derived(
    entry.lastCookedAt
      ? new Date(entry.lastCookedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Never cooked'
  );

  const hasCooked = $derived(entry.lastCookedAt !== null);
</script>

<a
  href="/recipes/{entry.id}"
  class="notecard block aspect-[4/6] border border-drafting bg-canvas hover:border-obsidian transition-colors p-4 flex flex-col gap-3 rounded-sm"
  data-testid="recipe-card"
  data-recipe-id={entry.id}
>
  <header class="flex flex-col gap-1">
    <h2 class="font-serif text-xl leading-tight">{entry.name}</h2>
    {#if entry.tags.length > 0}
      <div class="flex flex-wrap gap-1 text-[10px] uppercase tracking-wider text-obsidian/60">
        {#each entry.tags as tag}
          <span>{tag}</span>
        {/each}
      </div>
    {/if}
  </header>

  <div class="flex-1 flex items-center justify-center min-h-0">
    {#if entry.sparklineVariable && entry.sparklineValues.length >= 2}
      <div class="text-ochre flex flex-col items-center gap-1">
        <Sparkline values={entry.sparklineValues} width={120} height={32} label="{entry.sparklineVariable} over time" />
        <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{entry.sparklineVariable}</span>
      </div>
    {:else}
      <div class="text-[10px] uppercase tracking-wider text-obsidian/30">No data yet</div>
    {/if}
  </div>

  <footer class="flex items-end justify-between text-[11px] font-sans border-t border-drafting pt-2">
    <span class="text-obsidian/60">{entry.batchCount} {entry.batchCount === 1 ? 'batch' : 'batches'}</span>
    <span class={hasCooked ? 'text-juniper' : 'text-obsidian/40'}>{lastCookedLabel}</span>
  </footer>
</a>
```

- [ ] **Step 2: Commit (controller)**

```bash
git add src/lib/ui/NotecardCard.svelte
git commit -m "feat(ui): NotecardCard component"
```

---

## Task 4: Home page with toolbar (load + render + filter + sort)

**Files:**
- Create: `src/routes/+page.server.ts`
- Modify: `src/routes/+page.svelte` (replaces placeholder)
- Create: `src/lib/ui/Toolbar.svelte`

- [ ] **Step 1: Implement Toolbar**

```svelte
<!-- src/lib/ui/Toolbar.svelte -->
<script lang="ts">
  let {
    search = $bindable(''),
    tag = $bindable(''),
    status = $bindable('all'),
    sort = $bindable('last_cooked'),
    allTags = []
  }: {
    search?: string;
    tag?: string;
    status?: 'all' | 'has_cooked' | 'drafts_only';
    sort?: 'last_cooked' | 'name' | 'batch_count';
    allTags?: string[];
  } = $props();
</script>

<div class="flex flex-wrap items-center gap-3 border-b border-drafting pb-3 text-sm">
  <input
    type="search"
    bind:value={search}
    placeholder="Search recipes"
    class="flex-1 min-w-[200px] border border-drafting bg-canvas px-3 py-1.5 rounded-sm focus:outline-none focus:border-obsidian"
    data-testid="search"
  />

  <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider">
    Tag
    <select bind:value={tag} class="border border-drafting bg-canvas px-2 py-1 rounded-sm">
      <option value="">All</option>
      {#each allTags as t}
        <option value={t}>{t}</option>
      {/each}
    </select>
  </label>

  <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider">
    Status
    <select bind:value={status} class="border border-drafting bg-canvas px-2 py-1 rounded-sm">
      <option value="all">All</option>
      <option value="has_cooked">Cooked</option>
      <option value="drafts_only">Drafts only</option>
    </select>
  </label>

  <label class="flex items-center gap-2 text-[11px] uppercase tracking-wider">
    Sort
    <select bind:value={sort} class="border border-drafting bg-canvas px-2 py-1 rounded-sm">
      <option value="last_cooked">Last cooked</option>
      <option value="name">Name</option>
      <option value="batch_count">Batch count</option>
    </select>
  </label>
</div>
```

- [ ] **Step 2: Implement page loader**

```ts
// src/routes/+page.server.ts
import { readIndex, rebuildIndex } from '../lib/server';

export async function load() {
  let index = await readIndex();
  if (index.length === 0) index = await rebuildIndex();
  return { index };
}
```

- [ ] **Step 3: Implement home page**

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  import NotecardCard from '$lib/ui/NotecardCard.svelte';
  import Toolbar from '$lib/ui/Toolbar.svelte';
  import NewRecipeDialog from '$lib/ui/NewRecipeDialog.svelte';
  import type { IndexEntry } from '$lib/server';

  let { data }: { data: { index: IndexEntry[] } } = $props();

  let search = $state('');
  let tag = $state('');
  let status = $state<'all' | 'has_cooked' | 'drafts_only'>('all');
  let sort = $state<'last_cooked' | 'name' | 'batch_count'>('last_cooked');
  let dialogOpen = $state(false);

  const allTags = $derived([...new Set(data.index.flatMap(e => e.tags))].sort());

  const filtered = $derived.by(() => {
    let out = data.index;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(e => e.name.toLowerCase().includes(q));
    }
    if (tag) out = out.filter(e => e.tags.includes(tag));
    if (status === 'has_cooked') out = out.filter(e => e.lastCookedAt !== null);
    else if (status === 'drafts_only') out = out.filter(e => e.lastCookedAt === null);

    const sorted = [...out];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'batch_count') sorted.sort((a, b) => b.batchCount - a.batchCount);
    else sorted.sort((a, b) => (b.lastCookedAt ?? '').localeCompare(a.lastCookedAt ?? ''));
    return sorted;
  });
</script>

<div class="max-w-6xl mx-auto p-8 flex flex-col gap-6">
  <header class="flex items-end justify-between">
    <div>
      <h1 class="font-serif text-4xl">Better Batch</h1>
      <p class="text-sm text-obsidian/60 font-sans">Record. Analyze. Refine. Archive.</p>
    </div>
    <button
      onclick={() => dialogOpen = true}
      class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas transition-colors rounded-sm"
      data-testid="new-recipe-btn"
    >+ New Recipe</button>
  </header>

  <Toolbar bind:search bind:tag bind:status bind:sort {allTags} />

  {#if filtered.length === 0}
    <p class="text-sm text-obsidian/50 py-12 text-center">No recipes match.</p>
  {:else}
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="recipe-grid">
      {#each filtered as entry (entry.id)}
        <NotecardCard {entry} />
      {/each}
    </div>
  {/if}
</div>

<NewRecipeDialog bind:open={dialogOpen} />
```

- [ ] **Step 4: Manually verify**

Run `~/.bun/bin/bun run dev`, open http://localhost:5173. Empty state should render "No recipes match." with the toolbar and "+ New Recipe" button visible. (`NewRecipeDialog` is the next task — page won't compile until it exists. Either stub it as a no-op component first, or do Task 5 immediately after.)

- [ ] **Step 5: Commit (controller, after Task 5)**

Wait until Task 5 is done so the page compiles, then:

```bash
git add src/lib/ui/Toolbar.svelte src/routes/+page.server.ts src/routes/+page.svelte
git commit -m "feat(ui): home page with toolbar (search/tag/status/sort)"
```

---

## Task 5: New Recipe modal

**Files:**
- Create: `src/lib/ui/NewRecipeDialog.svelte`

A dialog with the recipe creation form. Posts via the `api-client` and navigates to the new recipe on success.

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/NewRecipeDialog.svelte -->
<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { api } from './api-client';
  import type { RecipePreset } from '$lib/server';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let name = $state('');
  let description = $state('');
  let preset = $state<RecipePreset>('custom');
  let tagsInput = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) { error = 'Name required'; return; }
    submitting = true;
    error = null;
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const recipe = await api.createRecipe({ name: name.trim(), preset, tags, description: description.trim() });
      await invalidateAll();
      open = false;
      name = ''; description = ''; preset = 'custom'; tagsInput = '';
      goto(`/recipes/${recipe.id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create recipe';
    } finally {
      submitting = false;
    }
  }

  function close() { open = false; error = null; }
</script>

{#if open}
  <div
    class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-50"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
    role="presentation"
  >
    <form
      onsubmit={submit}
      onclick={(e) => e.stopPropagation()}
      class="bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm"
      data-testid="new-recipe-dialog"
    >
      <h2 class="font-serif text-2xl">New Recipe</h2>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Name</span>
        <input
          bind:value={name}
          required
          autofocus
          class="border border-drafting bg-canvas px-3 py-2 rounded-sm focus:outline-none focus:border-obsidian"
          data-testid="new-recipe-name"
        />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Preset</span>
        <select bind:value={preset} class="border border-drafting bg-canvas px-3 py-2 rounded-sm">
          <option value="custom">Custom (no preset variables)</option>
          <option value="bread">Bread (hydration, bulk, bake temp, yield)</option>
          <option value="sauce">Sauce (simmer time, yield)</option>
          <option value="braise">Braise (braise time, oven temp)</option>
        </select>
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Tags (comma-separated)</span>
        <input bind:value={tagsInput} class="border border-drafting bg-canvas px-3 py-2 rounded-sm" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Description</span>
        <textarea bind:value={description} rows="2" class="border border-drafting bg-canvas px-3 py-2 rounded-sm resize-none"></textarea>
      </label>

      {#if error}
        <p class="text-ochre text-sm">{error}</p>
      {/if}

      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick={close} class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</button>
        <button
          type="submit"
          disabled={submitting}
          class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:opacity-50 rounded-sm"
          data-testid="new-recipe-submit"
        >{submitting ? 'Creating…' : 'Record Recipe'}</button>
      </div>
    </form>
  </div>
{/if}
```

- [ ] **Step 2: Verify dev server compiles**

Run `~/.bun/bin/bun run dev` and confirm the home page loads, the "+ New Recipe" button opens the dialog, submitting creates a recipe and navigates to `/recipes/<slug>` (the recipe page won't render yet — Task 8 — but the URL will change and the data is on disk).

- [ ] **Step 3: Commit Task 4 + Task 5 together (controller)**

```bash
git add src/lib/ui/Toolbar.svelte src/lib/ui/NewRecipeDialog.svelte src/routes/+page.server.ts src/routes/+page.svelte
git commit -m "feat(ui): home page + new recipe dialog"
```

---

## Task 6: Graph layout algorithm

**Files:**
- Create: `src/lib/ui/layout/graph-layout.ts`
- Test: `tests/ui/graph-layout.test.ts`

Pure function that turns a list of `Batch` objects into a 2D layout: each node gets `(x, y)` and each parent→child relationship becomes an edge. Top-down: depth = row, siblings spread horizontally.

- [ ] **Step 1: Write failing tests**

```ts
// tests/ui/graph-layout.test.ts
import { describe, it, expect } from 'bun:test';
import { layoutGraph } from '../../src/lib/ui/layout/graph-layout';
import type { Batch } from '../../src/lib/server/domain/types';

const mk = (id: string, parentIds: string[], createdAt = '2026-01-01T00:00:00Z'): Batch => ({
  id, recipeId: 'r', label: id, parentIds,
  status: 'draft', cookedAt: null, variables: {}, ingredients: [], steps: [],
  outcomeNotes: '', rating: null, createdAt
});

describe('layoutGraph', () => {
  it('returns empty layout for empty input', () => {
    const out = layoutGraph([]);
    expect(out.nodes).toEqual([]);
    expect(out.edges).toEqual([]);
    expect(out.width).toBe(0);
    expect(out.height).toBe(0);
  });

  it('places single root at column 0, row 0', () => {
    const out = layoutGraph([mk('v1', [])]);
    expect(out.nodes).toEqual([{ id: 'v1', col: 0, row: 0, x: 0, y: 0 }]);
    expect(out.edges).toEqual([]);
  });

  it('linear chain stacks vertically', () => {
    const out = layoutGraph([mk('v1', []), mk('v2', ['v1']), mk('v3', ['v2'])]);
    expect(out.nodes.map(n => [n.id, n.row])).toEqual([['v1', 0], ['v2', 1], ['v3', 2]]);
    expect(out.nodes.every(n => n.col === 0)).toBe(true);
    expect(out.edges).toEqual([
      { from: 'v1', to: 'v2' },
      { from: 'v2', to: 'v3' }
    ]);
  });

  it('siblings get separate columns', () => {
    const out = layoutGraph([
      mk('v1', []),
      mk('v2a', ['v1'], '2026-01-02T00:00:00Z'),
      mk('v2b', ['v1'], '2026-01-03T00:00:00Z')
    ]);
    const cols = Object.fromEntries(out.nodes.map(n => [n.id, n.col]));
    expect(cols.v2a).not.toBe(cols.v2b);
    expect(out.nodes.find(n => n.id === 'v1')!.row).toBe(0);
    expect(out.nodes.find(n => n.id === 'v2a')!.row).toBe(1);
    expect(out.nodes.find(n => n.id === 'v2b')!.row).toBe(1);
  });

  it('merge node has both parent edges and depth = max(parent depth) + 1', () => {
    const batches = [
      mk('v1', []),
      mk('v2a', ['v1']),
      mk('v2b', ['v1']),
      mk('v3', ['v2a', 'v2b'])
    ];
    const out = layoutGraph(batches);
    const v3 = out.nodes.find(n => n.id === 'v3')!;
    expect(v3.row).toBe(2);
    expect(out.edges).toContainEqual({ from: 'v2a', to: 'v3' });
    expect(out.edges).toContainEqual({ from: 'v2b', to: 'v3' });
  });

  it('returns total width and height in pixels', () => {
    const out = layoutGraph([mk('v1', []), mk('v2', ['v1'])], { colWidth: 60, rowHeight: 50 });
    expect(out.height).toBe(50); // 2 rows → height = (rows - 1) * rowHeight
    expect(out.width).toBe(0); // 1 column → width = (cols - 1) * colWidth
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement**

```ts
// src/lib/ui/layout/graph-layout.ts
import type { Batch } from '../../server/domain/types';

export interface LayoutNode { id: string; col: number; row: number; x: number; y: number; }
export interface LayoutEdge { from: string; to: string; }
export interface Layout { nodes: LayoutNode[]; edges: LayoutEdge[]; width: number; height: number; }

export interface LayoutOptions { colWidth?: number; rowHeight?: number; }

export function layoutGraph(batches: Batch[], opts: LayoutOptions = {}): Layout {
  if (batches.length === 0) return { nodes: [], edges: [], width: 0, height: 0 };
  const colWidth = opts.colWidth ?? 60;
  const rowHeight = opts.rowHeight ?? 50;

  const byId = new Map(batches.map(b => [b.id, b] as const));

  // Compute depth (longest path from any root)
  const depth = new Map<string, number>();
  function computeDepth(id: string, stack = new Set<string>()): number {
    if (depth.has(id)) return depth.get(id)!;
    if (stack.has(id)) return 0; // cycle guard (shouldn't happen)
    stack.add(id);
    const b = byId.get(id);
    if (!b || b.parentIds.length === 0) { depth.set(id, 0); return 0; }
    const d = 1 + Math.max(...b.parentIds.map(p => computeDepth(p, stack)));
    depth.set(id, d);
    return d;
  }
  batches.forEach(b => computeDepth(b.id));

  // Group by row, sort each row by createdAt for deterministic columns
  const byRow = new Map<number, Batch[]>();
  for (const b of batches) {
    const r = depth.get(b.id)!;
    if (!byRow.has(r)) byRow.set(r, []);
    byRow.get(r)!.push(b);
  }
  for (const list of byRow.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  // Assign columns: simple sequential within each row
  const colOf = new Map<string, number>();
  for (const [, list] of byRow) {
    list.forEach((b, i) => colOf.set(b.id, i));
  }

  const nodes: LayoutNode[] = batches.map(b => {
    const col = colOf.get(b.id)!;
    const row = depth.get(b.id)!;
    return { id: b.id, col, row, x: col * colWidth, y: row * rowHeight };
  });

  const edges: LayoutEdge[] = batches.flatMap(b => b.parentIds.map(p => ({ from: p, to: b.id })));

  const maxCol = Math.max(...nodes.map(n => n.col));
  const maxRow = Math.max(...nodes.map(n => n.row));
  return {
    nodes, edges,
    width: maxCol * colWidth,
    height: maxRow * rowHeight
  };
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Run full suite, expect no regressions**

- [ ] **Step 6: Commit (controller)**

```bash
git add src/lib/ui/layout/graph-layout.ts tests/ui/graph-layout.test.ts
git commit -m "feat(ui): graph layout algorithm"
```

---

## Task 7: BatchGraph SVG component

**Files:**
- Create: `src/lib/ui/BatchGraph.svelte`

Renders the layout output as SVG. Circles for nodes, hairline curves for edges. Status drives fill: `cooked` → Juniper, `draft` → hollow, `archived` → dimmed. Selection ring is Ochre.

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/BatchGraph.svelte -->
<script lang="ts">
  import { layoutGraph, type Layout } from './layout/graph-layout';
  import type { Batch } from '$lib/server';

  let {
    batches,
    selectedId = null,
    onSelect = () => {}
  }: {
    batches: Batch[];
    selectedId?: string | null;
    onSelect?: (id: string) => void;
  } = $props();

  const COL_WIDTH = 60;
  const ROW_HEIGHT = 56;
  const NODE_R = 9;
  const PAD = 24;

  const layout = $derived<Layout>(layoutGraph(batches, { colWidth: COL_WIDTH, rowHeight: ROW_HEIGHT }));
  const byId = $derived(new Map(batches.map(b => [b.id, b] as const)));
  const nodeById = $derived(new Map(layout.nodes.map(n => [n.id, n] as const)));

  const svgWidth = $derived(layout.width + PAD * 2);
  const svgHeight = $derived(layout.height + PAD * 2);

  function curve(fromX: number, fromY: number, toX: number, toY: number): string {
    const midY = (fromY + toY) / 2;
    return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
  }

  function fill(status: Batch['status'], isSelected: boolean): string {
    if (status === 'cooked') return 'var(--color-juniper)';
    if (status === 'archived') return 'var(--color-drafting)';
    return 'var(--color-canvas)'; // draft = hollow
  }

  function stroke(status: Batch['status']): string {
    if (status === 'archived') return 'var(--color-drafting)';
    if (status === 'cooked') return 'var(--color-juniper)';
    return 'var(--color-obsidian)';
  }
</script>

<svg width={svgWidth} height={svgHeight} viewBox="0 0 {svgWidth} {svgHeight}" class="block">
  <!-- edges -->
  {#each layout.edges as e}
    {@const from = nodeById.get(e.from)}
    {@const to = nodeById.get(e.to)}
    {#if from && to}
      <path
        d={curve(from.x + PAD, from.y + PAD, to.x + PAD, to.y + PAD)}
        fill="none"
        stroke="var(--color-drafting)"
        stroke-width="1"
      />
    {/if}
  {/each}

  <!-- nodes -->
  {#each layout.nodes as n}
    {@const batch = byId.get(n.id)!}
    {@const isSelected = n.id === selectedId}
    <g
      transform="translate({n.x + PAD},{n.y + PAD})"
      class="cursor-pointer"
      role="button"
      tabindex="0"
      onclick={() => onSelect(n.id)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(n.id)}
      data-testid="batch-node"
      data-batch-id={n.id}
    >
      {#if isSelected}
        <circle r={NODE_R + 4} fill="none" stroke="var(--color-ochre)" stroke-width="1.5" />
      {/if}
      <circle
        r={NODE_R}
        fill={fill(batch.status, isSelected)}
        stroke={stroke(batch.status)}
        stroke-width="1.5"
      />
      <text
        x={NODE_R + 6}
        y="4"
        font-family="var(--font-sans)"
        font-size="11"
        fill="var(--color-obsidian)"
      >{batch.id}</text>
    </g>
  {/each}
</svg>
```

- [ ] **Step 2: Commit (controller)**

```bash
git add src/lib/ui/BatchGraph.svelte
git commit -m "feat(ui): BatchGraph SVG component"
```

---

## Task 8: BatchDetail components and recipe page

**Files:**
- Create: `src/lib/ui/VariableTile.svelte`, `src/lib/ui/IngredientList.svelte`, `src/lib/ui/StepsList.svelte`, `src/lib/ui/Rating.svelte`, `src/lib/ui/BatchDetail.svelte`
- Create: `src/routes/recipes/[id]/+page.server.ts`
- Create: `src/routes/recipes/[id]/+page.svelte`

- [ ] **Step 1: Implement VariableTile**

```svelte
<!-- src/lib/ui/VariableTile.svelte -->
<script lang="ts">
  import type { VariableSchemaItem, VariableValue } from '$lib/server';
  let { schema, value }: { schema: VariableSchemaItem; value: VariableValue } = $props();

  const display = $derived(
    value === null || value === undefined ? '—'
      : schema.unit ? `${value}${schema.unit}` : `${value}`
  );
</script>

<div class="border border-drafting bg-canvas p-3 flex flex-col gap-1 rounded-sm min-w-[80px]">
  <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{schema.name}</span>
  <span class="font-serif text-xl">{display}</span>
</div>
```

- [ ] **Step 2: Implement IngredientList**

```svelte
<!-- src/lib/ui/IngredientList.svelte -->
<script lang="ts">
  import type { Ingredient } from '$lib/server';
  let { ingredients }: { ingredients: Ingredient[] } = $props();
</script>

{#if ingredients.length === 0}
  <p class="text-sm text-obsidian/40 italic">No ingredients recorded.</p>
{:else}
  <ul class="font-mono text-sm space-y-1">
    {#each ingredients as ing}
      <li class="flex gap-3 border-b border-drafting/50 pb-1">
        <span class="text-ochre min-w-[80px]">{ing.amount}{ing.unit ? ` ${ing.unit}` : ''}</span>
        <span>{ing.name}</span>
      </li>
    {/each}
  </ul>
{/if}
```

- [ ] **Step 3: Implement StepsList**

```svelte
<!-- src/lib/ui/StepsList.svelte -->
<script lang="ts">
  let { steps }: { steps: string[] } = $props();
</script>

{#if steps.length === 0}
  <p class="text-sm text-obsidian/40 italic">No steps recorded.</p>
{:else}
  <ol class="space-y-2 text-sm">
    {#each steps as step, i}
      <li class="flex gap-3">
        <span class="font-mono text-ochre min-w-[24px]">{i + 1}.</span>
        <span class="flex-1">{step}</span>
      </li>
    {/each}
  </ol>
{/if}
```

- [ ] **Step 4: Implement Rating**

```svelte
<!-- src/lib/ui/Rating.svelte -->
<script lang="ts">
  let {
    value,
    editable = false,
    onChange = () => {}
  }: {
    value: 1 | 2 | 3 | 4 | 5 | null;
    editable?: boolean;
    onChange?: (v: 1 | 2 | 3 | 4 | 5) => void;
  } = $props();
</script>

<div class="flex gap-1" data-testid="rating">
  {#each [1, 2, 3, 4, 5] as n}
    {@const filled = value !== null && n <= value}
    {#if editable}
      <button
        type="button"
        onclick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}
        class="text-xl leading-none {filled ? 'text-ochre' : 'text-drafting'} hover:text-ochre"
        aria-label="Rate {n}"
        data-testid="rating-{n}"
      >★</button>
    {:else}
      <span class="text-xl leading-none {filled ? 'text-ochre' : 'text-drafting'}">★</span>
    {/if}
  {/each}
</div>
```

- [ ] **Step 5: Implement BatchDetail**

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
    onMarkCooked = () => {}
  }: {
    recipe: Recipe;
    batch: Batch;
    onMarkCooked?: () => void;
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
        <button
          type="button"
          onclick={onMarkCooked}
          class="border border-juniper text-juniper px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-juniper hover:text-canvas rounded-sm"
          data-testid="mark-cooked-btn"
        >Mark as Cooked</button>
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
    <StepsList steps={batch.steps} />
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

- [ ] **Step 6: Implement loader**

```ts
// src/routes/recipes/[id]/+page.server.ts
import { error } from '@sveltejs/kit';
import { readRecipe, listBatches } from '../../../lib/server';

export async function load({ params }) {
  try {
    const recipe = await readRecipe(params.id);
    const batches = await listBatches(params.id);
    return { recipe, batches };
  } catch (err: any) {
    if (err.code === 'ENOENT') throw error(404, 'Recipe not found');
    throw err;
  }
}
```

- [ ] **Step 7: Implement recipe detail page**

```svelte
<!-- src/routes/recipes/[id]/+page.svelte -->
<script lang="ts">
  import BatchGraph from '$lib/ui/BatchGraph.svelte';
  import BatchDetail from '$lib/ui/BatchDetail.svelte';
  import OutcomeForm from '$lib/ui/OutcomeForm.svelte';
  import type { Recipe, Batch } from '$lib/server';

  let { data }: { data: { recipe: Recipe; batches: Batch[] } } = $props();

  let selectedId = $state<string | null>(data.recipe.currentBatchId ?? data.batches[0]?.id ?? null);
  let cooking = $state<Batch | null>(null);

  const selected = $derived(data.batches.find(b => b.id === selectedId) ?? null);

  function handleMarkCooked() {
    if (selected && selected.status === 'draft') cooking = selected;
  }
</script>

<div class="max-w-7xl mx-auto p-6 flex flex-col gap-4 min-h-screen">
  <nav class="flex items-center gap-2 text-sm">
    <a href="/" class="text-obsidian/60 hover:text-obsidian">← All recipes</a>
  </nav>

  <header class="flex items-end justify-between border-b border-drafting pb-3">
    <div>
      <h1 class="font-serif text-3xl">{data.recipe.name}</h1>
      {#if data.recipe.description}
        <p class="text-sm text-obsidian/60 mt-1">{data.recipe.description}</p>
      {/if}
    </div>
    {#if data.recipe.tags.length}
      <div class="flex gap-1.5 text-[10px] uppercase tracking-wider text-obsidian/60">
        {#each data.recipe.tags as t}<span class="border border-drafting px-2 py-0.5 rounded-sm">{t}</span>{/each}
      </div>
    {/if}
  </header>

  {#if data.batches.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center gap-4 text-center">
      <p class="text-sm text-obsidian/60">No batches yet. Record your first one to get started.</p>
      <a href="/recipes/{data.recipe.id}/new-batch" class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm">+ Record V1</a>
    </div>
  {:else}
    <div class="flex-1 grid grid-cols-[300px_1fr] gap-6 min-h-0">
      <aside class="border-r border-drafting pr-6 overflow-auto">
        <h2 class="text-[11px] uppercase tracking-wider text-obsidian/50 mb-3">Batches ({data.batches.length})</h2>
        <BatchGraph batches={data.batches} {selectedId} onSelect={(id) => selectedId = id} />
      </aside>
      <section class="">
        {#if selected}
          <BatchDetail recipe={data.recipe} batch={selected} onMarkCooked={handleMarkCooked} />
        {:else}
          <p class="text-sm text-obsidian/40">Select a batch to view details.</p>
        {/if}
      </section>
    </div>
  {/if}
</div>

{#if cooking}
  <OutcomeForm batch={cooking} recipeId={data.recipe.id} onClose={() => cooking = null} />
{/if}
```

- [ ] **Step 8: Verify dev server compiles**

(`OutcomeForm` is Task 10. Either stub it or hold the commit until both Task 9 and Task 10 are complete.)

- [ ] **Step 9: Commit (controller, after Task 10)**

```bash
git add src/lib/ui/VariableTile.svelte src/lib/ui/IngredientList.svelte src/lib/ui/StepsList.svelte src/lib/ui/Rating.svelte src/lib/ui/BatchDetail.svelte src/routes/recipes/[id]/+page.server.ts src/routes/recipes/[id]/+page.svelte
git commit -m "feat(ui): recipe detail page with DAG sidebar"
```

---

## Task 9: BatchEditor and new-batch route

**Files:**
- Create: `src/lib/ui/BatchEditor.svelte`
- Create: `src/routes/recipes/[id]/new-batch/+page.server.ts`
- Create: `src/routes/recipes/[id]/new-batch/+page.svelte`

- [ ] **Step 1: Implement BatchEditor**

```svelte
<!-- src/lib/ui/BatchEditor.svelte -->
<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from './api-client';
  import type { Recipe, Batch, Ingredient, VariableValue, BatchStatus } from '$lib/server';

  let {
    recipe,
    parent
  }: {
    recipe: Recipe;
    parent: Batch | null;
  } = $props();

  // Pre-fill from parent (or empty if root V1)
  let label = $state(parent ? `from ${parent.id}` : 'initial');
  let status = $state<BatchStatus>('draft');
  let variables = $state<Record<string, VariableValue>>(
    Object.fromEntries(recipe.variableSchema.map(s => [s.name, parent?.variables[s.name] ?? null]))
  );
  let ingredients = $state<Ingredient[]>(
    parent ? parent.ingredients.map(i => ({ ...i })) : []
  );
  let steps = $state<string[]>(parent ? [...parent.steps] : []);

  let submitting = $state(false);
  let error = $state<string | null>(null);

  function addIngredient() { ingredients = [...ingredients, { name: '', amount: '', unit: '' }]; }
  function removeIngredient(i: number) { ingredients = ingredients.filter((_, idx) => idx !== i); }
  function addStep() { steps = [...steps, '']; }
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
      const batch = await api.createBatch(recipe.id, {
        label: label.trim(),
        parentIds: parent ? [parent.id] : [],
        status,
        variables,
        ingredients: ingredients.filter(i => i.name.trim()),
        steps: steps.filter(s => s.trim())
      });
      goto(`/recipes/${recipe.id}?batch=${batch.id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create batch';
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-6 max-w-3xl" data-testid="batch-editor">
  <header class="flex flex-col gap-1">
    <h1 class="font-serif text-2xl">
      {parent ? `New batch from ${parent.id}` : 'Record V1'}
    </h1>
    <p class="text-sm text-obsidian/60">{recipe.name}</p>
  </header>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-[11px] uppercase tracking-wider">Label</span>
    <input bind:value={label} required class="border border-drafting bg-canvas px-3 py-2 rounded-sm" data-testid="batch-label" />
  </label>

  <fieldset class="flex flex-col gap-1 text-sm">
    <legend class="text-[11px] uppercase tracking-wider mb-2">Status</legend>
    <div class="flex gap-4">
      <label class="flex items-center gap-2"><input type="radio" bind:group={status} value="draft" /> Draft</label>
      <label class="flex items-center gap-2"><input type="radio" bind:group={status} value="cooked" /> Cooked</label>
    </div>
  </fieldset>

  {#if recipe.variableSchema.length > 0}
    <fieldset class="flex flex-col gap-3">
      <legend class="text-[11px] uppercase tracking-wider mb-1">Variables</legend>
      <div class="grid grid-cols-2 gap-3">
        {#each recipe.variableSchema as schema}
          {@const current = variables[schema.name]}
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{schema.name} {schema.unit && `(${schema.unit})`}</span>
            <input
              type={schema.type === 'number' ? 'number' : 'text'}
              step={schema.type === 'number' ? 'any' : undefined}
              value={current ?? ''}
              oninput={(e) => setVariable(schema.name, (e.currentTarget as HTMLInputElement).value, schema.type)}
              class="border border-drafting bg-canvas px-3 py-2 rounded-sm"
              data-testid="var-{schema.name}"
            />
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}

  <fieldset class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <legend class="text-[11px] uppercase tracking-wider">Ingredients</legend>
      <button type="button" onclick={addIngredient} class="text-xs text-ochre">+ Add</button>
    </div>
    {#each ingredients as ing, i}
      <div class="flex gap-2 items-center">
        <input bind:value={ing.amount} placeholder="Amount" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm w-24 text-sm" />
        <input bind:value={ing.unit} placeholder="Unit" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm w-20 text-sm" />
        <input bind:value={ing.name} placeholder="Ingredient" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm" />
        <button type="button" onclick={() => removeIngredient(i)} class="text-obsidian/40 hover:text-ochre">×</button>
      </div>
    {/each}
  </fieldset>

  <fieldset class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <legend class="text-[11px] uppercase tracking-wider">Steps</legend>
      <button type="button" onclick={addStep} class="text-xs text-ochre">+ Add</button>
    </div>
    {#each steps as _, i}
      <div class="flex gap-2 items-start">
        <span class="font-mono text-xs text-obsidian/40 pt-2">{i + 1}.</span>
        <textarea bind:value={steps[i]} rows="2" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm resize-none"></textarea>
        <button type="button" onclick={() => removeStep(i)} class="text-obsidian/40 hover:text-ochre pt-2">×</button>
      </div>
    {/each}
  </fieldset>

  {#if error}
    <p class="text-ochre text-sm">{error}</p>
  {/if}

  <div class="flex justify-end gap-2 border-t border-drafting pt-4">
    <a href="/recipes/{recipe.id}" class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</a>
    <button
      type="submit"
      disabled={submitting}
      class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:opacity-50 rounded-sm"
      data-testid="batch-submit"
    >{submitting ? 'Recording…' : 'Record Batch'}</button>
  </div>
</form>
```

- [ ] **Step 2: Implement loader**

```ts
// src/routes/recipes/[id]/new-batch/+page.server.ts
import { error } from '@sveltejs/kit';
import { readRecipe, listBatches } from '../../../../lib/server';

export async function load({ params, url }) {
  try {
    const recipe = await readRecipe(params.id);
    const batches = await listBatches(params.id);
    const fromId = url.searchParams.get('from');
    const parent = fromId ? batches.find(b => b.id === fromId) ?? null : (batches[0] ?? null);
    return { recipe, parent };
  } catch (err: any) {
    if (err.code === 'ENOENT') throw error(404, 'Recipe not found');
    throw err;
  }
}
```

- [ ] **Step 3: Implement page**

```svelte
<!-- src/routes/recipes/[id]/new-batch/+page.svelte -->
<script lang="ts">
  import BatchEditor from '$lib/ui/BatchEditor.svelte';
  import type { Recipe, Batch } from '$lib/server';
  let { data }: { data: { recipe: Recipe; parent: Batch | null } } = $props();
</script>

<div class="max-w-4xl mx-auto p-6">
  <BatchEditor recipe={data.recipe} parent={data.parent} />
</div>
```

- [ ] **Step 4: Commit (controller)**

```bash
git add src/lib/ui/BatchEditor.svelte src/routes/recipes/[id]/new-batch
git commit -m "feat(ui): new batch editor with parent pre-fill"
```

---

## Task 10: OutcomeForm (mark as cooked)

**Files:**
- Create: `src/lib/ui/OutcomeForm.svelte`

Inline modal form. PATCHes the batch with `status: 'cooked'`, `outcomeNotes`, `rating`. Server auto-stamps `cookedAt`.

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/OutcomeForm.svelte -->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { api } from './api-client';
  import Rating from './Rating.svelte';
  import type { Batch } from '$lib/server';

  let {
    batch,
    recipeId,
    onClose
  }: {
    batch: Batch;
    recipeId: string;
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
      await api.patchBatch(recipeId, batch.id, {
        status: 'cooked',
        outcomeNotes,
        rating
      });
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
    <h2 class="font-serif text-xl">Mark {batch.id} as cooked</h2>

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
      >{submitting ? 'Saving…' : 'Archive Batch'}</button>
    </div>
  </form>
</div>
```

- [ ] **Step 2: Verify dev server compiles end-to-end**

Run `~/.bun/bin/bun run dev`. From a clean `data/` directory:
1. Click "+ New Recipe", create a Sourdough.
2. Land on the recipe page; click "+ Record V1".
3. Fill the editor, save with status "draft". Land back on recipe page with the batch in the graph.
4. Click "Mark as Cooked". Form opens. Add notes + rating. Submit.
5. Detail pane now shows "Cooked …" header with notes and stars.

Stop the dev server.

- [ ] **Step 3: Commit (controller)**

This commit lands the recipe-detail page (Task 8 hold), OutcomeForm, and any glue:

```bash
git add src/lib/ui/VariableTile.svelte src/lib/ui/IngredientList.svelte src/lib/ui/StepsList.svelte src/lib/ui/Rating.svelte src/lib/ui/BatchDetail.svelte src/lib/ui/OutcomeForm.svelte src/routes/recipes/[id]/+page.server.ts src/routes/recipes/[id]/+page.svelte
git commit -m "feat(ui): recipe detail page + mark-as-cooked flow"
```

---

## Task 11: Playwright setup

**Files:**
- Create: `playwright.config.ts`
- Modify: `package.json` (add scripts + dev dep)
- Create: `tests/e2e/.gitkeep`

- [ ] **Step 1: Install Playwright**

```bash
~/.bun/bin/bun add -D @playwright/test
~/.bun/bin/bunx playwright install chromium
```

- [ ] **Step 2: Add config**

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
    trace: 'on-first-retry'
  },
  webServer: {
    command: '~/.bun/bin/bun run build && ~/.bun/bin/bun run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    env: { BB_DATA_DIR: './tests/e2e/.tmp-data' }
  }
});
```

- [ ] **Step 3: Add scripts to `package.json`**

In `package.json`'s `"scripts"` section, add:

```json
"e2e": "playwright test",
"e2e:headed": "playwright test --headed"
```

- [ ] **Step 4: Update `.gitignore`**

Add to `.gitignore`:

```
test-results/
playwright-report/
tests/e2e/.tmp-data/
```

- [ ] **Step 5: Commit (controller)**

```bash
git add playwright.config.ts package.json bun.lock .gitignore tests/e2e/.gitkeep
git commit -m "chore: Playwright setup"
```

---

## Task 12: E2E foundation smoke test

**Files:**
- Create: `tests/e2e/foundation.spec.ts`
- Create: `tests/e2e/helpers.ts`

End-to-end: home → create recipe → land on detail page → record V1 → mark as cooked → verify outcome appears.

- [ ] **Step 1: Implement helpers**

```ts
// tests/e2e/helpers.ts
import { rm } from 'node:fs/promises';

export async function clearTestData() {
  await rm('./tests/e2e/.tmp-data', { recursive: true, force: true });
}
```

- [ ] **Step 2: Implement the smoke test**

```ts
// tests/e2e/foundation.spec.ts
import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async () => {
  await clearTestData();
});

test('create recipe, record V1, mark as cooked', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Better Batch')).toBeVisible();

  // Create a recipe
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Sourdough Test Loaf');
  await page.getByTestId('new-recipe-submit').click();

  // Lands on the detail page
  await expect(page).toHaveURL(/\/recipes\/sourdough-test-loaf/);
  await expect(page.getByRole('heading', { name: 'Sourdough Test Loaf' })).toBeVisible();

  // Record V1
  await page.getByRole('link', { name: '+ Record V1' }).click();
  await expect(page.getByTestId('batch-editor')).toBeVisible();
  await page.getByTestId('batch-label').fill('initial bake');
  await page.getByTestId('var-hydration').fill('72');
  await page.getByTestId('var-bulk_ferment').fill('5');
  await page.getByTestId('var-bake_temp').fill('475');
  await page.getByTestId('var-yield').fill('2');
  await page.getByTestId('batch-submit').click();

  // Back on detail page with the batch selected
  await expect(page).toHaveURL(/\/recipes\/sourdough-test-loaf/);
  await expect(page.getByTestId('batch-detail')).toBeVisible();
  await expect(page.getByTestId('variable-strip')).toContainText('72%');

  // Mark as cooked
  await page.getByTestId('mark-cooked-btn').click();
  await page.getByTestId('outcome-notes').fill('Open crumb, dark crust. Try +5% hydration next.');
  await page.getByTestId('rating-4').click();
  await page.getByTestId('outcome-submit').click();

  // Cooked status visible
  await expect(page.getByText(/Cooked/i)).toBeVisible();
  await expect(page.getByText('Open crumb, dark crust. Try +5% hydration next.')).toBeVisible();
});
```

- [ ] **Step 3: Run the test**

Run: `~/.bun/bin/bun run e2e`
Expected: 1 passed.

If it fails, debug iteratively. Common issues:
- Test data not cleared → check `clearTestData` is called.
- Build/preview server not starting → check `BB_DATA_DIR` reaches the storage layer (paths.ts reads it).
- Selector mismatch → use `~/.bun/bin/bun run e2e:headed` to watch.

- [ ] **Step 4: Run full unit suite**

Run: `~/.bun/bin/bun test`
Expected: all unit tests still pass (no regressions).

- [ ] **Step 5: Commit (controller)**

```bash
git add tests/e2e/foundation.spec.ts tests/e2e/helpers.ts
git commit -m "test(e2e): foundation smoke — create, record, cook"
```

---

## Self-review notes

**Spec coverage:**
- Spec §5.1 (Home — notecard grid) → Tasks 3, 4
- Spec §5.2 (Recipe detail — DAG sidebar + detail pane) → Tasks 6, 7, 8
- Spec §5.3 (New batch flow) → Task 9
- Spec §5.6 (Mark as cooked + outcome notes + rating) → Task 10
- Spec §6 (Visual + voice guardrails) → applied throughout (theme tokens only, Fraunces/Inter, Ochre/Juniper accents, no hex)
- Spec §9 (E2E test) → Task 12
- Spec §5.4 (Compare) and §5.5 (Merge) → **explicitly Plan 3, not this plan**

**Type consistency:** All component prop types match the foundation's `Recipe`, `Batch`, `IndexEntry`, `VariableSchemaItem`, `Ingredient` shapes. The `api-client.ts` re-uses those types from `$lib/server`.

**Known integration risks:**
- Tasks 4 + 5 form a unit (home page references `NewRecipeDialog`); Tasks 8 + 9 + 10 form a unit (recipe page references `OutcomeForm`). Implementer subagents should be told to expect this and not panic at compile errors mid-task — controller commits pairs together.
- The `data-testid` attributes are deliberately non-semantic and stable; the E2E test depends on them.
- `BB_DATA_DIR` env var must be honored by `paths.ts` from Plan 1 — it already is (`if (override) { cachedRoot = resolve(override); ... }`).

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-04-better-batch-core-ui.md`. 12 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, spec-review, controller-commit pattern (same as Plan 1).

**2. Inline Execution** — Batch through tasks with checkpoints.

**Which approach?**
