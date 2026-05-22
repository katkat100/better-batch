# In-app Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a welcome panel that auto-shows on an empty home page, plus a sample recipe loader so first-launch users can explore a populated database immediately. A `?` button in the home header re-opens the panel later.

**Architecture:** TDD-first: write the `loadSampleRecipe` test, then implement. Then bundle the WelcomePanel primitive together with the +page.svelte changes so knip accepts the new component (it can't ship unused). Finally land an e2e test.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes, snippets), Tailwind v4, Bun + `bun:test`, Playwright e2e, IndexedDB via `idb`.

**Spec:** [`2026-05-22-in-app-onboarding.md`](../specs/2026-05-22-in-app-onboarding.md)

---

## Notes for implementers

- The bun binary lives at `~/.bun/bin`. Prefix commands with `export PATH="$HOME/.bun/bin:$PATH"`.
- Validation per task: `bun run typecheck && bun run lint && bun test && bun run e2e`. All four stay green.
- E2E may need a pre-built `build/` directory; if e2e fails on the 60s playwright `webServer` timeout, run `bun run build` first, then `bun run e2e`.
- Pre-commit hook (lefthook) runs typecheck / lint / test / knip. Never `--no-verify`. Never push, never amend.
- The bread preset's variable schema lives in `src/lib/data/schema.ts`. Variable names are `hydration`, `bulk_ferment`, `bake_temp` (°F), `yield`. The sample recipe must use these exact names.

---

### Task 1: Failing unit test for `loadSampleRecipe`

**Files:**
- Create: `tests/data/sample.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/data/sample.test.ts` with this content:

```ts
import './setup';
import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { deleteDB } from 'idb';
import { loadSampleRecipe } from '../../src/lib/data/sample';
import { api } from '../../src/lib/ui/api-client';
import { _resetDbForTests, openDb } from '../../src/lib/data/db';

let activeDb: Awaited<ReturnType<typeof openDb>> | null = null;

beforeEach(async () => {
  if (activeDb) { activeDb.close(); activeDb = null; }
  _resetDbForTests();
  await deleteDB('better-batch');
  activeDb = await openDb();
});

afterEach(() => {
  if (activeDb) { activeDb.close(); activeDb = null; }
});

describe('loadSampleRecipe', () => {
  it('creates the Weekly Focaccia recipe with the bread preset schema', async () => {
    const id = await loadSampleRecipe();
    const { recipe } = await api.getRecipe(id);
    expect(recipe.name).toBe('Weekly Focaccia');
    expect(recipe.variableSchema.map(v => v.name).sort()).toEqual(
      ['bake_temp', 'bulk_ferment', 'hydration', 'yield']
    );
  });

  it('creates three batches: 1 draft, 2 cooked', async () => {
    const id = await loadSampleRecipe();
    const { batches } = await api.getRecipe(id);
    expect(batches.length).toBe(3);
    expect(batches.filter(b => b.status === 'cooked').length).toBe(2);
    expect(batches.filter(b => b.status === 'draft').length).toBe(1);
  });

  it('wires up parent/child lineage from Base to the two children', async () => {
    const id = await loadSampleRecipe();
    const { batches } = await api.getRecipe(id);
    const base = batches.find(b => b.label === 'Base')!;
    const base2 = batches.find(b => b.label === 'Base.2')!;
    const variant = batches.find(b => b.label === 'high-hydration variant')!;
    expect(base).toBeDefined();
    expect(base2).toBeDefined();
    expect(variant).toBeDefined();
    expect(base.parentIds).toEqual([]);
    expect(base2.parentIds).toEqual([base.id]);
    expect(variant.parentIds).toEqual([base.id]);
  });

  it('sets a high-hydration water amount on the variant', async () => {
    const id = await loadSampleRecipe();
    const { batches } = await api.getRecipe(id);
    const variant = batches.find(b => b.label === 'high-hydration variant')!;
    const water = variant.ingredients.find(i => i.name === 'water');
    expect(water).toBeDefined();
    expect(water!.amount).toBe('400');
  });
});
```

- [ ] **Step 2: Verify the test fails**

Run: `export PATH="$HOME/.bun/bin:$PATH" && bun test tests/data/sample.test.ts 2>&1 | tail -10`

Expected: the test fails to import `../../src/lib/data/sample` (module not found). That's the red state — proceed to Task 2 to implement.

- [ ] **Step 3: Do NOT commit yet**

The test alone would fail the pre-commit hook (importing a missing module). Bundle with the implementation in Task 2.

---

### Task 2: Implement `loadSampleRecipe`

**Files:**
- Create: `src/lib/data/sample.ts`
- Modify: (the test file from Task 1 stays as-is)

- [ ] **Step 1: Implement the sample loader**

Create `src/lib/data/sample.ts`:

```ts
import { api } from '$lib/ui/api-client';

/**
 * Seeds a curated "Weekly Focaccia" recipe with three batches that
 * demonstrate the recipe → batch → fork lineage. Used by the
 * first-launch welcome panel. Returns the new recipe id.
 */
export async function loadSampleRecipe(): Promise<string> {
  const recipe = await api.createRecipe({
    name: 'Weekly Focaccia',
    preset: 'bread',
    tags: ['focaccia', 'sample'],
    description: 'A sample recipe showing how Better Batch tracks attempts.'
  });

  const baseIngredients = [
    { id: 'flour', name: 'flour', amount: '500', unit: 'g' },
    { id: 'water', name: 'water', amount: '350', unit: 'g' },
    { id: 'salt', name: 'salt', amount: '10', unit: 'g' },
    { id: 'yeast', name: 'yeast', amount: '5', unit: 'g' },
    { id: 'olive-oil', name: 'olive oil', amount: '30', unit: 'g' }
  ];

  const baseSteps = [
    { text: 'Mix flour, water, salt, and yeast in a bowl until shaggy.', uses: [] },
    { text: 'Autolyse for 30 minutes.', uses: [] },
    { text: 'Bulk ferment 4 hours, folding every 30 minutes for the first 2 hours.', uses: [] },
    { text: 'Transfer to oiled pan, dimple with olive oil, rest 45 minutes.', uses: [] },
    { text: 'Bake 25 minutes at 425°F until golden.', uses: [] }
  ];

  const baseVariables = {
    hydration: 70,
    bulk_ferment: 4,
    bake_temp: 425,
    yield: 1
  };

  // Base — draft, no cook
  const base = await api.createBatch(recipe.id, {
    label: 'Base',
    parentIds: [],
    status: 'draft',
    variables: baseVariables,
    ingredients: baseIngredients.map(i => ({ ...i })),
    steps: baseSteps.map(s => ({ ...s, uses: [...s.uses] }))
  });

  // Base.2 — cooked, 3 stars
  const base2 = await api.createBatch(recipe.id, {
    label: 'Base.2',
    parentIds: [base.id],
    status: 'draft',
    variables: { ...baseVariables },
    ingredients: baseIngredients.map(i => ({ ...i })),
    steps: baseSteps.map(s => ({ ...s, uses: [...s.uses] }))
  });
  await api.patchBatch(recipe.id, base2.id, {
    status: 'cooked',
    cookedAt: new Date(Date.now() - 7 * 86_400_000).toISOString(),
    outcomeNotes: 'Good crust. Pan stuck a bit — more olive oil next time.',
    rating: 3
  });

  // high-hydration variant — cooked, 4 stars, 80% hydration
  const variantIngredients = baseIngredients.map(i =>
    i.name === 'water' ? { ...i, amount: '400' } : { ...i }
  );
  const variant = await api.createBatch(recipe.id, {
    label: 'high-hydration variant',
    parentIds: [base.id],
    status: 'draft',
    variables: { ...baseVariables, hydration: 80 },
    ingredients: variantIngredients,
    steps: baseSteps.map(s => ({ ...s, uses: [...s.uses] }))
  });
  await api.patchBatch(recipe.id, variant.id, {
    status: 'cooked',
    cookedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    outcomeNotes: 'Open crumb. Slightly harder to handle.',
    rating: 4
  });

  return recipe.id;
}
```

- [ ] **Step 2: Run the test, expect green**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun test tests/data/sample.test.ts 2>&1 | tail -10
```

Expected: 4 pass / 0 fail.

- [ ] **Step 3: Full pipeline**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3
```

Expected: green. (No e2e needed for this task — no UI changes yet.)

- [ ] **Step 4: Commit (do NOT push)**

```bash
cd /Users/katieWork/Developer/better-batch && export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/data/sample.ts tests/data/sample.test.ts && git commit -m "$(cat <<'EOF'
feat(data): add loadSampleRecipe for first-launch onboarding

Seeds a "Weekly Focaccia" recipe with three batches (Base draft,
cooked Base.2, cooked high-hydration variant) that demonstrate the
recipe → batch → fork lineage. Used by the upcoming welcome panel.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

Knip will accept `sample.ts` because the test file (which is a knip entry per `knip.json`) imports it.

---

### Task 3: WelcomePanel primitive + +page.svelte wire-up

**Files:**
- Create: `src/lib/ui/WelcomePanel.svelte`
- Modify: `src/routes/+page.svelte`

Bundled because WelcomePanel needs an immediate consumer (knip).

- [ ] **Step 1: Create the WelcomePanel component**

Create `src/lib/ui/WelcomePanel.svelte` with this exact content:

```svelte
<!-- src/lib/ui/WelcomePanel.svelte -->
<script lang="ts">
  import Button from '$lib/ui/primitives/Button.svelte';
  import IconButton from '$lib/ui/primitives/IconButton.svelte';
  import SectionHeading from '$lib/ui/primitives/SectionHeading.svelte';
  import FormError from '$lib/ui/primitives/FormError.svelte';

  let {
    onCreateRecipe,
    onLoadSample,
    onDismiss
  }: {
    onCreateRecipe: () => void;
    onLoadSample: () => Promise<void>;
    onDismiss: () => void;
  } = $props();

  let loading = $state(false);
  let error = $state<string | null>(null);

  async function handleLoadSample() {
    loading = true;
    error = null;
    try {
      await onLoadSample();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load sample';
      loading = false;
    }
    // On success: parent handles dismiss + navigation, so we don't reset loading.
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onDismiss()} />

<div
  class="max-w-2xl mx-auto bg-canvas border border-drafting rounded-sm p-6 md:p-8 flex flex-col gap-4 relative"
  data-testid="welcome-panel"
>
  <div class="absolute top-2 right-2">
    <IconButton aria-label="Dismiss welcome guide" onclick={onDismiss} data-testid="welcome-dismiss-btn">×</IconButton>
  </div>

  <SectionHeading text="Welcome to Better Batch" />

  <p class="text-base leading-relaxed">
    Better Batch tracks each cook as a <em>batch</em> under its recipe.
    Fork from your best batch, change one thing, and cook it again — the
    app remembers everything so you can compare attempts side by side.
  </p>

  <div class="flex flex-col md:flex-row gap-2 pt-2">
    <Button
      variant="primary"
      onclick={onCreateRecipe}
      disabled={loading}
      data-testid="welcome-create-btn"
    >+ Create your first recipe</Button>
    <Button
      variant="outline"
      onclick={handleLoadSample}
      disabled={loading}
      data-testid="welcome-load-sample-btn"
    >{loading ? 'Loading sample…' : 'Load sample recipe'}</Button>
  </div>

  <FormError message={error} />
</div>
```

- [ ] **Step 2: Read the current home page**

Run: `cat src/routes/+page.svelte`

Note its structure: header with title + Export/Import/+ New Recipe buttons, Toolbar, then the recipe grid OR an "(no recipes match)" empty paragraph. The `data.index` prop holds the list.

- [ ] **Step 3: Edit `src/routes/+page.svelte`**

Three changes:

a. **Add imports.** At the top of the script block, add:

```ts
import WelcomePanel from '$lib/ui/WelcomePanel.svelte';
import IconButton from '$lib/ui/primitives/IconButton.svelte';
import { loadSampleRecipe } from '$lib/data/sample';
import { goto } from '$app/navigation';
import { resolve } from '$app/paths';
```

(Skip any that are already imported.)

b. **Add welcome state + lifecycle.** After the existing `let dialogOpen = $state(false);` and other state declarations, add:

```ts
let welcomeOpen = $state(false);

$effect(() => {
  if (typeof localStorage === 'undefined') return;
  if (data.index.length > 0) return;
  if (localStorage.getItem('bb_welcome_dismissed') === '1') return;
  welcomeOpen = true;
});

function dismissWelcome() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('bb_welcome_dismissed', '1');
  }
  welcomeOpen = false;
}

function handleWelcomeCreate() {
  dismissWelcome();
  dialogOpen = true;
}

async function handleWelcomeSample() {
  const id = await loadSampleRecipe();
  await invalidateAll();
  dismissWelcome();
  await goto(resolve(`/recipes/${id}`));
}
```

c. **Add the help button to the header.** Inside the existing header `div class="flex items-center gap-3"` containing Export/Import, insert the `?` IconButton BEFORE the `+ New Recipe` button:

```svelte
<IconButton
  aria-label="Show welcome guide"
  onclick={() => welcomeOpen = true}
  data-testid="welcome-help-btn"
>?</IconButton>
```

d. **Render the panel.** Just before the recipe-list block (the `{:else if filtered.length === 0}` "No recipes match." paragraph), insert:

```svelte
{#if welcomeOpen}
  <WelcomePanel
    onCreateRecipe={handleWelcomeCreate}
    onLoadSample={handleWelcomeSample}
    onDismiss={dismissWelcome}
  />
{/if}
```

The panel renders inline at the top of the page body. When the welcome is open AND the list happens to be non-empty (re-show via `?` button), the grid still renders below it — that's intentional.

- [ ] **Step 4: Pipeline**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -10
```

If e2e fails on the 60s webServer timeout, run `bun run build` first then `bun run e2e`. Expected: green. The existing 10 e2e tests should still pass — they all `clearTestData` in `beforeEach` which should also clear localStorage if the helper handles it (verify in Task 4).

- [ ] **Step 5: Verify the welcome panel actually appears manually**

Run `bun run dev`, open `http://localhost:5173/` in a private/incognito window so localStorage is clean. The welcome panel should render. Click `×` — it should disappear; reload — should stay gone. Reset localStorage in dev tools, reload — should re-appear. Click `?` after dismiss — should re-appear.

- [ ] **Step 6: Commit BOTH files together**

```bash
cd /Users/katieWork/Developer/better-batch && export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/WelcomePanel.svelte src/routes/+page.svelte && git commit -m "$(cat <<'EOF'
feat(ui): add WelcomePanel for first-launch onboarding

A centered card on the empty home page explains the recipe → batch →
fork model in three sentences and offers two CTAs: create your first
recipe (opens NewRecipeDialog) or load the sample Weekly Focaccia
recipe. Dismissal persists via localStorage. A new ? button in the
header re-opens the panel any time.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: E2E test for the welcome flow

**Files:**
- Create: `tests/e2e/welcome.e2e.ts`
- (Maybe) Modify: `tests/e2e/helpers.ts` if it needs to clear localStorage too

- [ ] **Step 1: Read the e2e helper to see how state is reset**

Run: `cat tests/e2e/helpers.ts`. Verify whether `clearTestData` already wipes localStorage. If it doesn't (it likely only clears IndexedDB), add a single line:

```ts
await page.evaluate(() => localStorage.clear());
```

inside `clearTestData`. The change should be minimal and won't break other tests (they don't depend on localStorage state).

- [ ] **Step 2: Write the e2e test**

Create `tests/e2e/welcome.e2e.ts`:

```ts
import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async ({ page }) => {
  await clearTestData({ page });
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
```

- [ ] **Step 3: Pipeline**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -10
```

Expected: typecheck/lint/test all green, e2e shows 12 passed (10 existing + 2 new).

- [ ] **Step 4: Commit**

```bash
cd /Users/katieWork/Developer/better-batch && export PATH="$HOME/.bun/bin:$PATH" && git add tests/e2e/welcome.e2e.ts tests/e2e/helpers.ts && git commit -m "$(cat <<'EOF'
test(e2e): cover the welcome-panel first-launch flow

Two flows: load-sample creates the recipe and navigates; dismiss +
re-open via the ? button. Adds localStorage.clear() to the e2e
helper so welcome state resets between tests.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

(If `helpers.ts` didn't need a change, drop it from the `git add` and use a slightly simpler commit message — `test(e2e): cover the welcome-panel first-launch flow`.)

---

### Task 5: Verification sweep

**Files:**
- No edits.

- [ ] **Step 1: Confirm sample data ships**

Run: `grep -rln "loadSampleRecipe" src tests 2>/dev/null`
Expected: at least 3 paths — `src/lib/data/sample.ts`, `src/routes/+page.svelte`, `tests/data/sample.test.ts`.

- [ ] **Step 2: Confirm WelcomePanel has a consumer**

Run: `grep -rln "WelcomePanel" src 2>/dev/null`
Expected: at least 2 paths — `src/lib/ui/WelcomePanel.svelte`, `src/routes/+page.svelte`.

- [ ] **Step 3: Final pipeline**

```bash
export PATH="$HOME/.bun/bin:$PATH" && bun run typecheck 2>&1 | tail -3 && bun run lint 2>&1 | tail -3 && bun test 2>&1 | tail -3 && bun run e2e 2>&1 | tail -5 && bunx knip 2>&1 | tail -5
```

Expected: 0 typecheck errors, lint clean, ALL unit tests pass (180 + 4 new = 184), 12 e2e pass, knip clean.

- [ ] **Step 4: Manual a11y + visual spot checks**

In an incognito browser window (clean localStorage):
1. Open `/`. Welcome panel renders, centered, with focus on the page.
2. Tab into the panel. Focus reaches the `×` button, the "+ Create" button, the "Load sample" button in order. All show the ochre focus ring.
3. Press Escape. Panel dismisses.
4. Reload. Panel stays gone.
5. Click `?` in the header. Panel re-appears.
6. Click "Load sample recipe". Loading state appears briefly, then page navigates to `/recipes/weekly-focaccia` (or similar). The recipe has 3 batches in the graph.
7. Go back to `/`. Recipe shows in grid; panel is gone; `?` button still works to re-open.
8. With a screen reader (VoiceOver: ⌘F5 on macOS), reload `/`. The panel should be announced with the heading "Welcome to Better Batch".

- [ ] **Step 5: Report completion**

Summarize: commits, what's covered, what's deferred (tooltips on inner pages, multi-step modal tour, sample-recipe variations per preset).

