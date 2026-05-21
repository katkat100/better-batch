# Expand Multiplier Options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 0.5x and 0.75x to the multiplier toggle behind a ⋯ menu without growing the visible four-slot row, with full persistence and badge support so halved-batch cooks are first-class.

**Architecture:** Three changes in lock-step order. First the data layer accepts fractional persistence (drop rule narrows from `<= 1` to exactly `1`, badge gate widens, Multiplier type widens to `number`). Then the toggle UI grows a Slot-1 swap + ⋯ menu popover that emits 0.5 and 0.75. Final verification + push.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, IndexedDB via `idb`, Bun test, Playwright e2e.

**Spec:** [`docs/superpowers/specs/2026-05-21-expand-multiplier-options-design.md`](../specs/2026-05-21-expand-multiplier-options-design.md)

---

## Task 1: Data layer — drop rule, badge gate, type widening

Order matters: storage must accept 0.5 and 0.75 before the toggle starts emitting them, otherwise picks would silently drop on save.

**Files:**
- Modify: `src/lib/data/batches.ts`
- Modify: `src/lib/ui/MultiplierToggle.svelte` (type only — `Multiplier` widens to `number`)
- Modify: `src/lib/ui/BatchDetail.svelte` (badge gate widens)
- Modify: `tests/data/batches.test.ts`

- [ ] **Step 1: Update the two existing drop-rule tests in `tests/data/batches.test.ts`**

Find the test named "does not persist cookMultiplier when input is <= 1" (around line 75) and rename + tighten it to be specific to exactly 1:

```ts
  it('does not persist cookMultiplier when input is 1', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 1
    });
    expect(b.cookMultiplier).toBeUndefined();
  });
```

Find the test named "updateBatch drops cookMultiplier on patch value <= 1" (around line 99) and rename + tighten:

```ts
  it('updateBatch drops cookMultiplier on patch value 1', async () => {
    const created = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 2
    });
    const updated = await updateBatch('r1', created.id, { cookMultiplier: 1 });
    expect(updated.cookMultiplier).toBeUndefined();
  });
```

- [ ] **Step 2: Add two new tests for fractional persistence**

Inside the same `describe('batches data layer', ...)` block, add:

```ts
  it('persists cookMultiplier when input is 0.5', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 0.5
    });
    expect(b.cookMultiplier).toBe(0.5);
  });

  it('persists cookMultiplier when input is 0.75', async () => {
    const b = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 0.75
    });
    expect(b.cookMultiplier).toBe(0.75);
  });

  it('updateBatch persists cookMultiplier when patch value is 0.5', async () => {
    const created = await createBatch('r1', {
      label: 'x', parentIds: [], status: 'draft', variables: {}, ingredients: [], steps: [],
      cookMultiplier: 2
    });
    const updated = await updateBatch('r1', created.id, { cookMultiplier: 0.5 });
    expect(updated.cookMultiplier).toBe(0.5);
  });
```

- [ ] **Step 3: Run the new + renamed tests to verify they fail**

```bash
~/.bun/bin/bun test tests/data/batches.test.ts
```

Expected: the three new 0.5 / 0.75 / patch-to-0.5 tests fail (the current drop rule discards anything `<= 1`). The renamed `=== 1` tests pass (they already worked under the broader `<= 1`).

- [ ] **Step 4: Tighten the drop rules in `src/lib/data/batches.ts`**

Find the `createBatch` body (around line 53) and change the spread guard:

```ts
// Before:
...(input.cookMultiplier && input.cookMultiplier > 1 ? { cookMultiplier: input.cookMultiplier } : {}),

// After:
...(input.cookMultiplier && input.cookMultiplier !== 1 ? { cookMultiplier: input.cookMultiplier } : {}),
```

Find the `updateBatch` body (around line 95) and change the drop condition:

```ts
// Before:
if ('cookMultiplier' in patch && (!patch.cookMultiplier || patch.cookMultiplier <= 1)) {
  delete (next as Partial<Batch>).cookMultiplier;
}

// After:
if ('cookMultiplier' in patch && (!patch.cookMultiplier || patch.cookMultiplier === 1)) {
  delete (next as Partial<Batch>).cookMultiplier;
}
```

- [ ] **Step 5: Run tests to verify all pass**

```bash
~/.bun/bin/bun test tests/data/batches.test.ts
```

Expected: all batches tests pass (the renamed two + the three new ones + every other batch test).

- [ ] **Step 6: Widen the `Multiplier` type in `src/lib/ui/MultiplierToggle.svelte`**

Find the type definition (line 3):

```ts
// Before:
export type Multiplier = 1 | 2 | 3;

// After:
export type Multiplier = number;
```

Also remove the `Multiplier[]` annotation on `OPTIONS` (line 15) since the array no longer needs to be constrained to the union — make it plain:

```ts
// Before:
const OPTIONS: Multiplier[] = [1, 2, 3];

// After:
const OPTIONS: number[] = [1, 2, 3];
```

(Task 3 will replace this whole array structure with Slot-1 logic. For now we're just typing it cleanly so the file compiles after the type change.)

- [ ] **Step 7: Widen the badge gate in `src/lib/ui/BatchDetail.svelte`**

Find the badge conditional (around line 148):

```svelte
<!-- Before: -->
{#if batch.cookMultiplier && batch.cookMultiplier > 1}

<!-- After: -->
{#if batch.cookMultiplier !== undefined && batch.cookMultiplier !== 1}
```

- [ ] **Step 8: Run full pipeline**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: 0 errors. Unit suite goes from 167 → 170 (3 new batches tests).

- [ ] **Step 9: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/data/batches.ts src/lib/ui/MultiplierToggle.svelte src/lib/ui/BatchDetail.svelte tests/data/batches.test.ts && git commit -m "$(cat <<'EOF'
feat(data): accept fractional cookMultiplier values

Drop rules in createBatch and updateBatch now drop only on exactly 1
(or falsy) so 0.5 and 0.75 persist. BatchDetail badge gate widens
from > 1 to !== 1 so halved-batch cooks also surface a badge. The
Multiplier type widens to number — the toggle UI still emits only
1/2/3 today but the next task will add 0.5 and 0.75.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: MultiplierToggle UI — Slot 1 swap + ⋯ menu

Replace the static 3-button row with the Slot-1 + ⋯ menu structure. The component still emits the same prop/callback shape, so all four consuming surfaces (CookIngredients, BatchDetail, CookStepList → CookStepRow, StepsList, IngredientList) work without changes.

**Files:**
- Modify: `src/lib/ui/MultiplierToggle.svelte`

- [ ] **Step 1: Replace the toggle internals**

Replace the entire contents of `src/lib/ui/MultiplierToggle.svelte` with:

```svelte
<!-- src/lib/ui/MultiplierToggle.svelte -->
<script lang="ts">
  export type Multiplier = number;

  let {
    value,
    onChange,
    class: extraClass = ''
  }: {
    value: Multiplier;
    onChange: (next: Multiplier) => void;
    class?: string;
  } = $props();

  // Sub-2 values that hide under the ⋯ menu by default.
  const HIDDEN_CANDIDATES = [0.5, 0.75] as const;
  type Hidden = typeof HIDDEN_CANDIDATES[number];

  function isHidden(v: number): v is Hidden {
    return (HIDDEN_CANDIDATES as readonly number[]).includes(v);
  }

  // Slot 1 holds whichever fractional is active, defaulting to 1.
  const slot1 = $derived<number>(isHidden(value) ? value : 1);

  // ⋯ menu lists every value not in Slot 1. When Slot 1 is 1, both
  // fractionals appear; when Slot 1 is 0.5 or 0.75, 1 plus the OTHER
  // fractional appear so the user can switch in either direction.
  const menuValues = $derived<number[]>(
    slot1 === 1
      ? [...HIDDEN_CANDIDATES]
      : [1, ...HIDDEN_CANDIDATES.filter(v => v !== slot1)]
  );

  let menuOpen = $state(false);

  function fmt(v: number): string {
    return `${String(v)}x`;
  }

  function buttonClass(opt: number): string {
    const base = 'text-[10px] uppercase tracking-wider px-2 py-0.5 border rounded-sm';
    return opt === value
      ? `${base} bg-ochre/15 border-ochre text-ochre`
      : `${base} border-drafting text-obsidian/60 hover:border-obsidian`;
  }

  function pick(v: number) {
    onChange(v);
    menuOpen = false;
  }
</script>

<div
  class="inline-flex gap-1 relative {extraClass}"
  role="group"
  aria-label="Batch multiplier"
  data-testid="multiplier-toggle"
>
  <button
    type="button"
    class={buttonClass(slot1)}
    aria-pressed={slot1 === value}
    onclick={() => pick(slot1)}
    data-testid="multiplier-option"
    data-value={slot1}
  >{fmt(slot1)}</button>

  <button
    type="button"
    class={buttonClass(2)}
    aria-pressed={value === 2}
    onclick={() => pick(2)}
    data-testid="multiplier-option"
    data-value={2}
  >2x</button>

  <button
    type="button"
    class={buttonClass(3)}
    aria-pressed={value === 3}
    onclick={() => pick(3)}
    data-testid="multiplier-option"
    data-value={3}
  >3x</button>

  <button
    type="button"
    class="text-[10px] uppercase tracking-wider px-2 py-0.5 border border-drafting text-obsidian/60 hover:border-obsidian rounded-sm"
    aria-label="More multiplier options"
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    onclick={() => menuOpen = !menuOpen}
    data-testid="multiplier-more-btn"
  >⋯</button>

  {#if menuOpen}
    <button
      type="button"
      class="fixed inset-0 z-10 bg-transparent"
      aria-label="close multiplier menu"
      onclick={() => menuOpen = false}
    ></button>
    <div
      class="absolute top-full right-0 mt-1 bg-canvas border border-drafting rounded-sm shadow-md z-20 flex flex-col py-1 min-w-[60px]"
      role="menu"
      data-testid="multiplier-more-menu"
    >
      {#each menuValues as v (v)}
        <button
          type="button"
          class="text-[10px] uppercase tracking-wider px-3 py-1 text-left hover:bg-drafting/30 {v === value ? 'text-ochre' : 'text-obsidian/80'}"
          role="menuitem"
          aria-pressed={v === value}
          onclick={() => pick(v)}
          data-testid="multiplier-option"
          data-value={v}
        >{fmt(v)}</button>
      {/each}
    </div>
  {/if}
</div>
```

- [ ] **Step 2: Run typecheck + lint + tests**

```bash
~/.bun/bin/bun run typecheck
~/.bun/bin/bun run lint
~/.bun/bin/bun run knip
~/.bun/bin/bun test
```

Expected: 0 errors. All 170 unit tests still pass (no test changes in this task; the toggle has no business-logic test file).

- [ ] **Step 3: Run e2e to confirm existing multiplier tests still pass**

```bash
~/.bun/bin/bun run e2e
```

Expected: all 10 e2e tests pass. The existing `multiplier.e2e.ts` exercises 2x and 1x via `[data-testid="multiplier-option"][data-value="2"]` — both selectors still resolve in the new template.

- [ ] **Step 4: Manual smoke check (optional but recommended)**

```bash
~/.bun/bin/bun run dev
```

In a browser:
1. Open a recipe with a saved batch, navigate to BatchDetail.
2. The multiplier toggle shows `[1x] [2x] [3x] [⋯]`.
3. Tap each visible button — ingredient list scales correctly.
4. Tap ⋯ — a small popover opens listing `0.5x` and `0.75x`.
5. Tap `0.5x` — popover closes. Toggle now shows `[0.5x] [2x] [3x] [⋯]`. Ingredient list scales to half.
6. Tap ⋯ again — popover now lists `1x` and `0.75x`. Tap `0.75x` — toggle becomes `[0.75x] [2x] [3x] [⋯]`.
7. Tap ⋯ → `1x` — toggle returns to default.
8. Click outside the popover — it dismisses.

Same flow on the CookIngredients toggle inside a cook session.

Stop the server when done.

- [ ] **Step 5: Commit**

```bash
export PATH="$HOME/.bun/bin:$PATH" && git add src/lib/ui/MultiplierToggle.svelte && git commit -m "$(cat <<'EOF'
feat(ui): add 0.5x and 0.75x to MultiplierToggle via ⋯ menu

Visible row stays four slots: [Slot 1] [2x] [3x] [⋯]. Slot 1 holds
whichever fractional is active (0.5x or 0.75x) and defaults to 1x.
The ⋯ menu lists whichever sub-2 values aren't currently in Slot 1,
so the user can always switch back to 1x or across to the other
fractional.

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

Expected: all green. 170 unit tests, 10 e2e tests.

- [ ] **Step 2: Confirm `git status` is clean and the branch is ahead**

```bash
git status
git log --oneline origin/main..HEAD
```

Expected: working tree clean. Branch ahead by the spec + plan + two feature commits (Task 1 and Task 2).

- [ ] **Step 3: Push**

```bash
git push
```

Expected: push succeeds.

---

## Notes for the implementer

- **Pre-commit hook** (`lefthook`) runs typecheck/lint/knip/test on commit but NOT e2e. Run `bun run e2e` explicitly before the Task 2 commit; the hook won't catch e2e regressions there. Use `export PATH="$HOME/.bun/bin:$PATH" &&` before commits.
- **Branch policy:** stay on `main`, do not push until Task 3 Step 3.
- **Type widening order matters.** Task 1 widens `Multiplier` to `number` before Task 2 starts emitting fractionals. If you reorder, the typed `1 | 2 | 3` constraint will reject the new values and the toggle won't compile.
- **The `Multiplier` type is imported in `BatchDetail.svelte`, `StepsList.svelte`, `IngredientList.svelte`, `CookStepRow.svelte`, `CookStepList.svelte`, and `CookIngredients.svelte`.** Widening from `1 | 2 | 3` to `number` is purely a relaxation — no consumer needs to change because `number` is a supertype.
- **The new `data-testid="multiplier-option"` items inside the ⋯ menu use the same testid as the visible buttons.** The existing e2e selector `[data-testid="multiplier-option"][data-value="2"]` continues to resolve to the visible `2x` button (the menu doesn't contain it). If a future e2e wants to select a menu option, it can use the same selector with `data-value="0.5"` after first clicking the `multiplier-more-btn` to open the menu.
- **The ⋯ menu close-on-click-outside** uses the same backdrop-button pattern as `BatchDetail.svelte`'s more-actions menu. Don't reinvent it.
