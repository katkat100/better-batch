# Cook-time Batch Multiplier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 1x / 2x / 3x display multiplier to both the read-only batch detail view and cook view that scales ingredient and step-use amounts at render time without modifying persisted batch data, plus a `Cooked at Nx` marker prepended to outcome notes when a cook session completes at a multiplier ≠ 1.

**Architecture:** A pure `multiplyAmount` helper handles numeric/non-numeric input transparently. A shared `MultiplierToggle` Svelte component renders the segmented 1x/2x/3x buttons. `CookView` and `BatchDetail` each own an independent `multiplier` state — no inheritance between views. `IngredientList`, `StepsList`, `CookIngredients`, `CookStepRow` all accept `multiplier` props and route amounts through the helper at display time. `buildEndCookPatch` accepts an optional multiplier and prepends the marker when ≠ 1.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Bun test, Tailwind 4.

**Spec:** [`docs/superpowers/specs/2026-05-08-batch-multiplier-design.md`](../specs/2026-05-08-batch-multiplier-design.md)

---

## Task 1: `multiplyAmount` pure helper

Build the helper first; everything else depends on it.

**Files:**
- Create: `src/lib/ui/layout/multiply-amount.ts`
- Test: `tests/ui/multiply-amount.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/ui/multiply-amount.test.ts`:

```ts
import { describe, it, expect } from 'bun:test';
import { multiplyAmount } from '../../src/lib/ui/layout/multiply-amount';

describe('multiplyAmount', () => {
  it('returns the input untouched at multiplier 1', () => {
    expect(multiplyAmount('500', 1)).toBe('500');
    expect(multiplyAmount('to taste', 1)).toBe('to taste');
    expect(multiplyAmount('', 1)).toBe('');
  });

  it('scales whole numbers', () => {
    expect(multiplyAmount('500', 2)).toBe('1000');
    expect(multiplyAmount('250', 3)).toBe('750');
  });

  it('scales fractions parsed by parseAmount', () => {
    expect(multiplyAmount('1/2', 2)).toBe('1');
    expect(multiplyAmount('1/4', 3)).toBe('0.75');
  });

  it('avoids float artifacts', () => {
    expect(multiplyAmount('0.1', 3)).toBe('0.3');
  });

  it('returns non-numeric amounts unchanged regardless of multiplier', () => {
    expect(multiplyAmount('to taste', 2)).toBe('to taste');
    expect(multiplyAmount('a pinch', 3)).toBe('a pinch');
  });

  it('returns empty string unchanged', () => {
    expect(multiplyAmount('', 2)).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
~/.bun/bin/bun test tests/ui/multiply-amount.test.ts
```

Expected: every test fails with "Cannot find module '../../src/lib/ui/layout/multiply-amount'" or similar.

- [ ] **Step 3: Implement the helper**

Create `src/lib/ui/layout/multiply-amount.ts`:

```ts
import { parseAmount } from './amount-parse';

/**
 * Display-only scaling for an ingredient master amount.
 * Numeric strings are scaled; non-numeric strings (e.g. "to taste") are
 * returned unchanged. Float-rounding artifacts are mitigated via toFixed(4).
 */
export function multiplyAmount(amount: string, multiplier: number): string {
  if (multiplier === 1) return amount;
  const parsed = parseAmount(amount);
  if (parsed === null) return amount;
  const scaled = parseFloat((parsed * multiplier).toFixed(4));
  return String(scaled);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
~/.bun/bin/bun test tests/ui/multiply-amount.test.ts
```

Expected: all 6 tests pass.

- [ ] **Step 5: Run typecheck and lint**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/layout/multiply-amount.ts tests/ui/multiply-amount.test.ts && git commit -m "$(cat <<'EOF'
feat: add multiplyAmount display helper

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `buildEndCookPatch` accepts multiplier; prepends marker when ≠ 1

Pure function update with comprehensive test coverage. No UI yet.

**Files:**
- Modify: `src/lib/ui/cook/layout/end-cook-patch.ts`
- Modify: `tests/ui/end-cook-patch.test.ts`

- [ ] **Step 1: Add the failing tests**

Add the following test cases to `tests/ui/end-cook-patch.test.ts` (do NOT remove the existing tests; they remain unchanged because the new field is optional):

```ts
  it('first-cook prepends "Cooked at Nx" marker when multiplier > 1', () => {
    const patch = buildEndCookPatch({
      mode: 'first-cook',
      startedAt: 1_000,
      endedAt: 61_000,
      outcomeNotes: 'great crumb',
      rating: 4,
      existingOutcomeNotes: '',
      multiplier: 2,
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch.outcomeNotes).toBe('Cooked at 2x\n\ngreat crumb');
  });

  it('first-cook with no user notes records just the marker at multiplier > 1', () => {
    const patch = buildEndCookPatch({
      mode: 'first-cook',
      startedAt: 0,
      endedAt: 0,
      outcomeNotes: '',
      rating: null,
      existingOutcomeNotes: '',
      multiplier: 3,
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch.outcomeNotes).toBe('Cooked at 3x');
  });

  it('first-cook at multiplier 1 has no marker (existing behavior preserved)', () => {
    const patch = buildEndCookPatch({
      mode: 'first-cook',
      startedAt: 0,
      endedAt: 0,
      outcomeNotes: 'great crumb',
      rating: null,
      existingOutcomeNotes: '',
      multiplier: 1,
      now: new Date('2026-05-15T18:30:00Z')
    });
    expect(patch.outcomeNotes).toBe('great crumb');
  });

  it('re-cook embeds the marker inside the date-headed block', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: 'darker than v1',
      rating: null,
      existingOutcomeNotes: 'first cook: nice',
      multiplier: 2,
      now: new Date('2026-06-01T12:00:00Z')
    });
    expect(patch.outcomeNotes).toBe('first cook: nice\n\n— 2026-06-01:\nCooked at 2x\ndarker than v1');
  });

  it('re-cook with no user notes still records the marker when multiplier > 1', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: '   ',
      rating: null,
      existingOutcomeNotes: 'first cook: nice',
      multiplier: 3,
      now: new Date('2026-06-01T12:00:00Z')
    });
    expect(patch.outcomeNotes).toBe('first cook: nice\n\n— 2026-06-01:\nCooked at 3x');
  });

  it('re-cook at multiplier 1 with no user notes is still a no-op patch', () => {
    const patch = buildEndCookPatch({
      mode: 're-cook',
      startedAt: 0,
      endedAt: 1_000,
      outcomeNotes: '   ',
      rating: null,
      existingOutcomeNotes: 'prior',
      multiplier: 1,
      now: new Date()
    });
    expect(patch).toEqual({});
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
~/.bun/bin/bun test tests/ui/end-cook-patch.test.ts
```

Expected: the 6 new tests fail (because the function doesn't accept `multiplier` yet); the 4 existing tests still pass.

- [ ] **Step 3: Update `buildEndCookPatch`**

Replace the entire contents of `src/lib/ui/cook/layout/end-cook-patch.ts` with:

```ts
import type { Batch } from '$lib/server';

interface EndCookSessionState {
  mode: 'first-cook' | 're-cook';
  startedAt: number;
  endedAt: number;
  outcomeNotes: string;
  rating: 1 | 2 | 3 | 4 | 5 | null;
  existingOutcomeNotes: string;
  multiplier?: number;  // optional for backward compatibility; default 1
  now?: Date;           // injectable for tests
}

function multiplierMarker(multiplier: number | undefined): string {
  if (!multiplier || multiplier === 1) return '';
  return `Cooked at ${multiplier}x`;
}

export function buildEndCookPatch(state: EndCookSessionState): Partial<Batch> {
  const now = state.now ?? new Date();
  const trimmed = state.outcomeNotes.trim();
  const marker = multiplierMarker(state.multiplier);

  if (state.mode === 'first-cook') {
    const outcomeNotes = marker && trimmed
      ? `${marker}\n\n${trimmed}`
      : (marker || trimmed);
    return {
      status: 'cooked',
      cookedAt: now.toISOString(),
      outcomeNotes,
      rating: state.rating,
      cookDurationMs: state.endedAt - state.startedAt
    };
  }

  // re-cook: write a date-headed block when there's anything to record
  // (user notes OR a multiplier marker).
  if (!trimmed && !marker) return {};

  const dateLabel = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const headerBody = marker && trimmed
    ? `${marker}\n${trimmed}`
    : (marker || trimmed);
  const header = `— ${dateLabel}:\n${headerBody}`;
  const next = state.existingOutcomeNotes
    ? `${state.existingOutcomeNotes}\n\n${header}`
    : header;
  return { outcomeNotes: next };
}
```

- [ ] **Step 4: Run tests to verify all pass**

```bash
~/.bun/bin/bun test tests/ui/end-cook-patch.test.ts
```

Expected: all 10 tests pass (4 original + 6 new).

- [ ] **Step 5: Run typecheck and lint**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/cook/layout/end-cook-patch.ts tests/ui/end-cook-patch.test.ts && git commit -m "$(cat <<'EOF'
feat(end-cook): accept multiplier and prepend "Cooked at Nx" marker

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `MultiplierToggle` shared component

Build the segmented 1x / 2x / 3x toggle once. Used by both BatchDetail and CookIngredients.

**Files:**
- Create: `src/lib/ui/MultiplierToggle.svelte`

- [ ] **Step 1: Implement the component**

Create `src/lib/ui/MultiplierToggle.svelte`:

```svelte
<!-- src/lib/ui/MultiplierToggle.svelte -->
<script lang="ts">
  export type Multiplier = 1 | 2 | 3;

  let {
    value,
    onChange,
    class: extraClass = ''
  }: {
    value: Multiplier;
    onChange: (next: Multiplier) => void;
    class?: string;
  } = $props();

  const OPTIONS: Multiplier[] = [1, 2, 3];

  function buttonClass(opt: Multiplier): string {
    const base = 'text-[10px] uppercase tracking-wider px-2 py-0.5 border rounded-sm';
    return opt === value
      ? `${base} bg-ochre/15 border-ochre text-ochre`
      : `${base} border-drafting text-obsidian/60 hover:border-obsidian`;
  }
</script>

<div
  class="inline-flex gap-1 {extraClass}"
  role="group"
  aria-label="Batch multiplier"
  data-testid="multiplier-toggle"
>
  {#each OPTIONS as opt (opt)}
    <button
      type="button"
      class={buttonClass(opt)}
      aria-pressed={opt === value}
      onclick={() => onChange(opt)}
      data-testid="multiplier-option"
      data-value={opt}
    >{opt}x</button>
  {/each}
</div>
```

- [ ] **Step 2: Verify it compiles**

```bash
~/.bun/bin/bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 3: Commit**

The component is not yet imported anywhere, so knip will flag it as unused. Bypass knip just for this commit:

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/MultiplierToggle.svelte && SKIP=knip git commit -m "$(cat <<'EOF'
feat: add MultiplierToggle component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Wire multiplier into cook view

Add `multiplier` state in `CookView`, pass it to `CookIngredients` (toggle + scaled pills) and `CookStepList` → `CookStepRow` (scaled step uses), and into `EndCookDialog` so the marker is recorded.

**Files:**
- Modify: `src/lib/ui/cook/CookView.svelte`
- Modify: `src/lib/ui/cook/CookIngredients.svelte`
- Modify: `src/lib/ui/cook/CookStepList.svelte`
- Modify: `src/lib/ui/cook/CookStepRow.svelte`
- Modify: `src/lib/ui/cook/EndCookDialog.svelte`

- [ ] **Step 1: Add `multiplier` state to `CookView.svelte`**

In `src/lib/ui/cook/CookView.svelte`, add the import at the top of the script block alongside other imports:

```ts
import type { Multiplier } from '../MultiplierToggle.svelte';
```

Then add the state declaration alongside the existing `let started`, `let elapsedMs`, etc. (around line 26):

```ts
let multiplier = $state<Multiplier>(1);
```

- [ ] **Step 2: Pass `multiplier` and `onMultiplierChange` to `CookIngredients`**

Update the `<CookIngredients ... />` element (around line 174 in `CookView.svelte`) to add two new props:

```svelte
<CookIngredients
  ingredients={batch.ingredients}
  steps={batch.steps}
  {currentStepIndex}
  {checkedSteps}
  {multiplier}
  onMultiplierChange={(next) => multiplier = next}
/>
```

- [ ] **Step 3: Pass `multiplier` to `CookStepList`**

Update the `<CookStepList ... />` element (around line 181) to pass `multiplier`:

```svelte
<CookStepList
  steps={batch.steps}
  ingredients={batch.ingredients}
  {checkedSteps}
  {currentStepIndex}
  {activeTimerKeys}
  {multiplier}
  onCheck={handleCheck}
  onStartTimer={handleStartTimer}
/>
```

- [ ] **Step 4: Pass `multiplier` to `EndCookDialog`**

Update the `<EndCookDialog ... />` element (around line 203) to pass `multiplier`:

```svelte
<EndCookDialog
  bind:open={endCookOpen}
  {batch}
  startedAt={startedAt ?? Date.now()}
  {elapsedMs}
  {timersStarted}
  stepsChecked={checkedSteps.size}
  stepsTotal={batch.steps.length}
  {quickNotes}
  {multiplier}
  onSubmit={handleEndCookSubmit}
/>
```

- [ ] **Step 5: Update `CookIngredients.svelte` to accept the new props and render the toggle**

In `src/lib/ui/cook/CookIngredients.svelte`, replace the entire `<script>` block with:

```svelte
<script lang="ts">
  import type { Ingredient, Step } from '$lib/server';
  import { SvelteSet, SvelteMap } from 'svelte/reactivity';
  import MultiplierToggle, { type Multiplier } from '../MultiplierToggle.svelte';
  import { multiplyAmount } from '../layout/multiply-amount';

  let {
    ingredients,
    steps,
    currentStepIndex,
    checkedSteps,
    multiplier,
    onMultiplierChange
  }: {
    ingredients: Ingredient[];
    steps: Step[];
    currentStepIndex: number;
    checkedSteps: Set<number>;
    multiplier: Multiplier;
    onMultiplierChange: (next: Multiplier) => void;
  } = $props();

  const currentIds = $derived(new Set(
    currentStepIndex >= 0 ? steps[currentStepIndex]?.uses.map(u => u.ingredientId) ?? [] : []
  ));

  const usedInCheckedIds = $derived.by(() => {
    const ids = new SvelteSet<string>();
    for (const i of checkedSteps) {
      for (const u of steps[i]?.uses ?? []) ids.add(u.ingredientId);
    }
    return ids;
  });

  type Group = { section: string | null; items: Ingredient[] };
  const groups = $derived.by<Group[]>(() => {
    const order: (string | null)[] = [];
    const map = new SvelteMap<string | null, Ingredient[]>();
    for (const ing of ingredients) {
      const key = ing.section && ing.section.trim() ? ing.section.trim() : null;
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(ing);
    }
    const sorted = [...order].sort((a, b) => {
      if (a === null && b !== null) return -1;
      if (b === null && a !== null) return 1;
      return order.indexOf(a) - order.indexOf(b);
    });
    return sorted.map(section => ({ section, items: map.get(section)! }));
  });

  function pillClass(ing: Ingredient): string {
    if (currentIds.has(ing.id)) return 'bg-ochre/20 border-ochre/40 text-ochre';
    if (usedInCheckedIds.has(ing.id)) return 'border-drafting opacity-50';
    return 'border-drafting';
  }
</script>
```

Then replace the existing `<section>...</section>` block (the one starting `<section class="px-4 py-3 border-b border-drafting bg-canvas/60 ...">`) with:

```svelte
<section class="px-4 py-3 border-b border-drafting bg-canvas/60 flex flex-col gap-2" data-testid="cook-ingredients">
  <div class="flex items-center justify-between">
    <h2 class="text-[10px] uppercase tracking-wider text-obsidian/50">Ingredients</h2>
    {#if ingredients.length > 0}
      <MultiplierToggle value={multiplier} onChange={onMultiplierChange} />
    {/if}
  </div>
  {#each groups as group (group.section ?? '__none__')}
    <div class="flex flex-col gap-1">
      {#if group.section !== null}
        <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{group.section}</span>
      {/if}
      <div class="flex flex-col gap-1.5 text-xs font-mono">
        {#each group.items as ing (ing.id)}
          <span class="border px-2 py-0.5 rounded-sm transition-colors self-start {pillClass(ing)}" data-testid="cook-ing-pill" data-ingredient-id={ing.id}>
            {multiplyAmount(ing.amount, multiplier)}{ing.unit ?? ''} {ing.name}
          </span>
        {/each}
      </div>
    </div>
  {/each}
</section>
```

- [ ] **Step 6: Update `CookStepList.svelte` to passthrough `multiplier`**

In `src/lib/ui/cook/CookStepList.svelte`, add `multiplier` to the props block and pass it to `CookStepRow`. Replace the entire file contents with:

```svelte
<!-- src/lib/ui/cook/CookStepList.svelte -->
<script lang="ts">
  import CookStepRow from './CookStepRow.svelte';
  import type { Step, Ingredient } from '$lib/server';
  import type { TimerMatch } from './layout/timer-parse';
  import type { Multiplier } from '../MultiplierToggle.svelte';

  let {
    steps,
    ingredients,
    checkedSteps,
    currentStepIndex,
    activeTimerKeys,
    multiplier,
    onCheck,
    onStartTimer
  }: {
    steps: Step[];
    ingredients: Ingredient[];
    checkedSteps: Set<number>;
    currentStepIndex: number;
    activeTimerKeys: Set<string>;
    multiplier: Multiplier;
    onCheck: (i: number, checked: boolean) => void;
    onStartTimer: (stepIndex: number, match: TimerMatch) => void;
  } = $props();

  let listEl = $state<HTMLOListElement | undefined>();

  $effect(() => {
    if (currentStepIndex < 0 || !listEl) return;
    const row = listEl.querySelector(`[data-step-index="${currentStepIndex}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
</script>

<section class="flex flex-col">
  <h2 class="text-[10px] uppercase tracking-wider text-obsidian/50 px-4 pt-3">Steps</h2>
  {#if steps.length === 0}
    <p class="px-4 py-3 text-sm text-obsidian/40 italic">No steps recorded.</p>
  {:else}
    <ol class="flex flex-col" bind:this={listEl} data-testid="cook-step-list">
      {#each steps as step, i (i)}
        <CookStepRow
          {step}
          index={i}
          isCurrent={i === currentStepIndex}
          isChecked={checkedSteps.has(i)}
          {ingredients}
          {activeTimerKeys}
          {multiplier}
          {onCheck}
          {onStartTimer}
        />
      {/each}
    </ol>
  {/if}
</section>
```

- [ ] **Step 7: Update `CookStepRow.svelte` to scale step uses**

In `src/lib/ui/cook/CookStepRow.svelte`, add `multiplier` to the props block and apply it to the rendered use line. Replace the script block with:

```svelte
<script lang="ts">
  import type { Step, Ingredient } from '$lib/server';
  import { parseTimers, type TimerMatch } from './layout/timer-parse';
  import Checkbox from '$lib/ui/primitives/Checkbox.svelte';
  import type { Multiplier } from '../MultiplierToggle.svelte';

  let {
    step,
    index,
    isCurrent,
    isChecked,
    ingredients,
    activeTimerKeys,
    multiplier,
    onCheck,
    onStartTimer
  }: {
    step: Step;
    index: number;
    isCurrent: boolean;
    isChecked: boolean;
    ingredients: Ingredient[];
    activeTimerKeys: Set<string>;
    multiplier: Multiplier;
    onCheck: (i: number, checked: boolean) => void;
    onStartTimer: (stepIndex: number, match: TimerMatch) => void;
  } = $props();

  const matches = $derived(parseTimers(step.text));
  const ingById = $derived(new Map(ingredients.map(i => [i.id, i] as const)));

  type Segment = { kind: 'text'; text: string } | { kind: 'timer'; match: TimerMatch; text: string };
  const segments = $derived.by<Segment[]>(() => {
    const out: Segment[] = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.start > cursor) out.push({ kind: 'text', text: step.text.slice(cursor, m.start) });
      out.push({ kind: 'timer', match: m, text: step.text.slice(m.start, m.end) });
      cursor = m.end;
    }
    if (cursor < step.text.length) out.push({ kind: 'text', text: step.text.slice(cursor) });
    return out;
  });

  function timerKey(m: TimerMatch): string {
    return `${index}:${m.start}:${m.end}`;
  }

  function scaledUseAmount(amount: number): number {
    if (multiplier === 1) return amount;
    return parseFloat((amount * multiplier).toFixed(4));
  }
</script>
```

Then replace the inline `<span>{use.amount}{ing.unit ?? ''} {ing.name}</span>` (around line 87) with:

```svelte
<span>{scaledUseAmount(use.amount)}{ing.unit ?? ''} {ing.name}</span>
```

- [ ] **Step 8: Update `EndCookDialog.svelte` to accept `multiplier` and pass to `buildEndCookPatch`**

In `src/lib/ui/cook/EndCookDialog.svelte`, extend the props block. Add `multiplier` to the destructure and the type:

```ts
let {
  open = $bindable(false),
  batch,
  startedAt,
  elapsedMs,
  timersStarted,
  stepsChecked,
  stepsTotal,
  quickNotes,
  multiplier,
  onSubmit
}: {
  open?: boolean;
  batch: Batch;
  startedAt: number;
  elapsedMs: number;
  timersStarted: number;
  stepsChecked: number;
  stepsTotal: number;
  quickNotes: string[];
  multiplier: number;
  onSubmit: (input: {
    patch: Partial<Batch>;
    forkAsDraft: boolean;
    forkLabel: string;
  }) => Promise<void>;
} = $props();
```

Then update the `buildEndCookPatch` call inside `submit()` to pass `multiplier`:

```ts
const patch = buildEndCookPatch({
  mode,
  startedAt,
  endedAt: startedAt + elapsedMs,
  outcomeNotes,
  rating,
  existingOutcomeNotes: batch.outcomeNotes,
  multiplier
});
```

- [ ] **Step 9: Run typecheck**

```bash
~/.bun/bin/bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 10: Run full pre-commit pipeline**

```bash
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: lint clean, knip clean (MultiplierToggle and multiplyAmount are now consumed), all tests pass.

- [ ] **Step 11: Manual smoke check (skip if dev server is hard to reach — note in self-review)**

If feasible:
1. `bun run dev`, open a recipe, click "Start Cooking" on a batch.
2. Verify the 1x / 2x / 3x toggle appears next to the "Ingredients" label.
3. Click 2x → ingredient pills show doubled amounts; step "ingredients used" lists also double.
4. Click 1x → values revert.
5. Set 2x, click End Cook, confirm → batch detail's outcomeNotes contains "Cooked at 2x".

Stop the server when done. Skip if not feasible.

- [ ] **Step 12: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/cook/CookView.svelte src/lib/ui/cook/CookIngredients.svelte src/lib/ui/cook/CookStepList.svelte src/lib/ui/cook/CookStepRow.svelte src/lib/ui/cook/EndCookDialog.svelte && git commit -m "$(cat <<'EOF'
feat(cook): batch multiplier toggle + Cooked at Nx marker

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Wire multiplier into batch detail (read view)

Add an independent `multiplier` state on `BatchDetail` and route it through `IngredientList` and `StepsList`.

**Files:**
- Modify: `src/lib/ui/BatchDetail.svelte`
- Modify: `src/lib/ui/IngredientList.svelte`
- Modify: `src/lib/ui/StepsList.svelte`

- [ ] **Step 1: Update `IngredientList.svelte` to accept and apply `multiplier`**

Replace the contents of `src/lib/ui/IngredientList.svelte` with:

```svelte
<!-- src/lib/ui/IngredientList.svelte -->
<script lang="ts">
  import type { Ingredient } from '$lib/server';
  import { SvelteMap } from 'svelte/reactivity';
  import { multiplyAmount } from './layout/multiply-amount';
  import type { Multiplier } from './MultiplierToggle.svelte';

  let {
    ingredients,
    multiplier = 1
  }: {
    ingredients: Ingredient[];
    multiplier?: Multiplier;
  } = $props();

  type Group = { section: string | null; items: Ingredient[] };

  const groups = $derived.by<Group[]>(() => {
    const order: (string | null)[] = [];
    const map = new SvelteMap<string | null, Ingredient[]>();
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
            <span class="text-ochre min-w-[80px]">{multiplyAmount(ing.amount, multiplier)}{ing.unit ? ` ${ing.unit}` : ''}</span>
            <span>{ing.name}</span>
          </li>
        {/each}
      </ul>
    {/each}
  </div>
{/if}
```

- [ ] **Step 2: Update `StepsList.svelte` to scale `use.amount`**

Replace the contents of `src/lib/ui/StepsList.svelte` with:

```svelte
<!-- src/lib/ui/StepsList.svelte -->
<script lang="ts">
  import type { Step, Ingredient } from '$lib/server';
  import type { Multiplier } from './MultiplierToggle.svelte';

  let {
    steps,
    ingredients,
    multiplier = 1
  }: {
    steps: Step[];
    ingredients: Ingredient[];
    multiplier?: Multiplier;
  } = $props();

  const ingredientById = $derived(new Map(ingredients.map(i => [i.id, i] as const)));

  function scaledAmount(amount: number): number {
    if (multiplier === 1) return amount;
    return parseFloat((amount * multiplier).toFixed(4));
  }
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
            <div class="flex flex-col gap-0.5 text-xs font-mono text-obsidian/60" data-testid="step-uses">
              {#each step.uses as use, ui (ui)}
                {@const ing = ingredientById.get(use.ingredientId)}
                {#if ing}
                  <span>{scaledAmount(use.amount)}{ing.unit ? ing.unit : ''} {ing.name}</span>
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

- [ ] **Step 3: Add multiplier state and toggle to `BatchDetail.svelte`**

In `src/lib/ui/BatchDetail.svelte`, add to the imports near the top of the script block:

```ts
import MultiplierToggle, { type Multiplier } from './MultiplierToggle.svelte';
```

Add the state declaration alongside the other `$state` declarations (e.g. near `popoverOpen`):

```ts
let multiplier = $state<Multiplier>(1);
```

Then update the Ingredients section header (around lines 291–296) from:

```svelte
<section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">
        Ingredients
    </h3>
    <IngredientList ingredients={batch.ingredients} />
</section>
```

to:

```svelte
<section class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
        <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">
            Ingredients
        </h3>
        {#if batch.ingredients.length > 0}
            <MultiplierToggle
                value={multiplier}
                onChange={(next) => multiplier = next}
            />
        {/if}
    </div>
    <IngredientList ingredients={batch.ingredients} {multiplier} />
</section>
```

And update the Steps section (around lines 298–303) from:

```svelte
<StepsList steps={batch.steps} ingredients={batch.ingredients} />
```

to:

```svelte
<StepsList steps={batch.steps} ingredients={batch.ingredients} {multiplier} />
```

- [ ] **Step 4: Run typecheck**

```bash
~/.bun/bin/bun run typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Run lint, knip, tests**

```bash
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: all clean.

- [ ] **Step 6: Manual smoke check (skip if not feasible)**

If feasible:
1. `bun run dev`, open a saved batch.
2. The 1x / 2x / 3x toggle appears next to the "Ingredients" label.
3. Click 2x → ingredient amounts and step-use amounts both double.
4. The toggle is independent of cook view (confirmed by entering cook view at 1x even after BatchDetail was at 2x).

Stop the server when done. Skip if not feasible.

- [ ] **Step 7: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/BatchDetail.svelte src/lib/ui/IngredientList.svelte src/lib/ui/StepsList.svelte && git commit -m "$(cat <<'EOF'
feat(detail): batch multiplier toggle on read view

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Final verification + push

- [ ] **Step 1: Run the full pre-commit pipeline**

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

Expected: working tree clean, branch ahead by 5 commits.

- [ ] **Step 3: Push**

```bash
git push
```

Expected: push succeeds.

---

## Notes for the implementer

- **Pre-commit hook** (`lefthook`) runs typecheck/lint/knip/test on commit. It needs `bun` on PATH; prepend `export PATH="$HOME/.bun/bin:$PATH" &&` to commit commands.
- **Branch policy:** stay on `main`, do not push until Task 6.
- **Task 1 first.** Everything depends on the helper.
- **Task 2 is purely the data-layer change.** No UI; the new tests cover the behavior.
- **Task 3 commit uses `SKIP=knip`** because the new component isn't consumed yet — Tasks 4 and 5 wire it in.
- **`Multiplier` type is exported from `MultiplierToggle.svelte`.** All consumers import it from there to avoid a separate types file.
- **The `multiplier` prop has a default of 1 on `IngredientList` and `StepsList`** so any other consumers (none today, but defensive) keep working.
- **`scaledUseAmount` and `scaledAmount` duplicate the rounding pattern** rather than calling `multiplyAmount` because `IngredientUse.amount` is already a number. Keeping the inline helpers tiny avoids needing a `multiplyNumeric` overload.
