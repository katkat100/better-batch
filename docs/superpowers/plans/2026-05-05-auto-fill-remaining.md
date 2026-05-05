# Auto-fill Remaining Amount Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** When the user adds an ingredient use to a step, auto-fill the amount with the remaining unallocated amount across all steps (master − sum-of-other-uses), so the common "split flour across two steps" workflow stops at one click.

**Architecture:** Reintroduce an `allUses` prop on `UsesEditor` (separately from the local per-step indicator) so the editor can compute remaining-across-all-steps. On `addUse` and on ingredient-dropdown change (when current amount is 0), default the amount to the remaining for that ingredient. If the master amount isn't numeric (e.g. "to taste"), default to 0 — no auto-fill.

**Tech Stack:** SvelteKit (Svelte 5 runes) · TypeScript · Tailwind v4

Reference: design discussion in conversation; no separate spec doc since the change is a single small UX tweak. Conceptually amends `2026-05-04-batch-editing-amendment.md` §4.1.

---

## Task 1: Auto-fill remaining on ingredient add/change

**Files:**
- Modify: `src/lib/ui/UsesEditor.svelte`
- Modify: `src/lib/ui/BatchEditor.svelte`

The change is bounded to UsesEditor's `addUse` and dropdown-change handler. BatchEditor needs to thread `allUses` (already-computed) back through.

- [ ] **Step 1: Update BatchEditor to pass `allUses`**

Open `src/lib/ui/BatchEditor.svelte`. Restore the derived `allUses` (it was removed when the per-step indicator was localized). Find the line that defines step helpers and add right after the `removeStep` function:

```ts
const allUses = $derived(steps.flatMap(s => s.uses));
```

In the template, find the `<UsesEditor>` invocation and add the prop:

```svelte
<UsesEditor
  bind:uses={step.uses}
  ingredients={ingredients.filter(ing => ing.id && ing.name)}
  allUses={allUses}
/>
```

- [ ] **Step 2: Update UsesEditor to accept and use `allUses`**

Open `src/lib/ui/UsesEditor.svelte`. Add `allUses` back to the props (separate from the local-indicator computation, which still uses `uses`):

Replace the existing `let { ingredients, uses = $bindable([]) }` block with:

```ts
let {
  ingredients,
  uses = $bindable([]),
  allUses = []
}: {
  ingredients: Ingredient[];
  uses?: IngredientUse[];
  allUses?: IngredientUse[];
} = $props();
```

Add a helper after `masterAmount` is defined and before `allocated`:

```ts
function remainingFor(ingredientId: string, excludeIndex: number = -1): number {
  const master = masterAmount.get(ingredientId) ?? NaN;
  if (Number.isNaN(master)) return 0;
  let usedElsewhere = 0;
  for (const u of allUses) usedElsewhere += u.amount;
  // We want master - allUses-of-this-ingredient. allUses includes ALL steps' uses,
  // but not the row we're about to set (which doesn't exist yet for addUse, or is
  // identified by excludeIndex for change-handler).
  let usedOfThis = 0;
  for (const u of allUses) {
    if (u.ingredientId === ingredientId) usedOfThis += u.amount;
  }
  // Subtract the local row's existing contribution if we're updating an existing row
  if (excludeIndex >= 0 && uses[excludeIndex] && uses[excludeIndex].ingredientId === ingredientId) {
    usedOfThis -= uses[excludeIndex].amount;
  }
  return Math.max(0, master - usedOfThis);
}
```

(Note: the first `usedElsewhere` accumulator above is unused; remove it. Keeping the function logic clean. Replace with the version below.)

Use this cleaner version instead:

```ts
function remainingFor(ingredientId: string, excludeIndex: number = -1): number {
  const master = masterAmount.get(ingredientId) ?? NaN;
  if (Number.isNaN(master)) return 0;
  let usedOfThis = 0;
  for (const u of allUses) {
    if (u.ingredientId === ingredientId) usedOfThis += u.amount;
  }
  // If we're updating an existing row, exclude its current contribution
  if (excludeIndex >= 0 && uses[excludeIndex] && uses[excludeIndex].ingredientId === ingredientId) {
    usedOfThis -= uses[excludeIndex].amount;
  }
  return Math.max(0, master - usedOfThis);
}
```

Update `addUse()`:

```ts
function addUse() {
  const firstAvailable = ingredients[0];
  if (!firstAvailable) return;
  const defaultAmount = remainingFor(firstAvailable.id);
  uses = [...uses, { ingredientId: firstAvailable.id, amount: defaultAmount }];
}
```

Update the dropdown's `onchange` handler. Find:

```svelte
<select
  value={use.ingredientId}
  onchange={(e) => uses[i] = { ...uses[i], ingredientId: (e.currentTarget as HTMLSelectElement).value }}
  …
>
```

Replace with:

```svelte
<select
  value={use.ingredientId}
  onchange={(e) => {
    const newId = (e.currentTarget as HTMLSelectElement).value;
    const currentAmount = uses[i].amount;
    // Auto-fill remaining only when amount is untouched (== 0). Preserve user-typed values.
    const nextAmount = currentAmount === 0 ? remainingFor(newId, i) : currentAmount;
    uses[i] = { ...uses[i], ingredientId: newId, amount: nextAmount };
  }}
  …
>
```

- [ ] **Step 3: Sync the displayed `amountInputs` after auto-fill**

`UsesEditor` keeps `amountInputs` separately from `uses` for fraction-tolerant input. After auto-fill, the displayed input should reflect the new amount. The existing `$effect` only updates `amountInputs.length` when uses count changes; we also need it to update the displayed string when an entry's amount was just set programmatically.

Replace the existing effect:

```ts
$effect(() => {
  if (amountInputs.length !== uses.length) {
    const next = uses.map((u, i) => amountInputs[i] ?? String(u.amount));
    amountInputs = next;
  }
});
```

With:

```ts
$effect(() => {
  if (amountInputs.length !== uses.length) {
    const next = uses.map((u, i) => amountInputs[i] ?? String(u.amount));
    amountInputs = next;
  }
});

// When uses[i].amount changes programmatically (e.g. addUse / onchange auto-fill),
// re-sync the displayed input. Skips if the user has typed something that parses
// to the same number (avoids clobbering "1/2" → "0.5" → "1/2").
$effect(() => {
  for (let i = 0; i < uses.length; i++) {
    const expected = String(uses[i].amount);
    const current = amountInputs[i];
    if (current === undefined) continue;
    // If current is empty or a literal number that doesn't match, sync.
    if (current === '' || /^\d*\.?\d+$/.test(current)) {
      if (current !== expected && parseFloat(current) !== uses[i].amount) {
        amountInputs[i] = expected;
      }
    }
  }
});
```

- [ ] **Step 4: Manually smoke-test**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4

# Create recipe + batch with master 100g flour
curl -s -X POST http://localhost:5173/api/recipes -H 'content-type: application/json' \
  -d '{"name":"FillTest","preset":"custom","tags":[]}' > /dev/null

# Open the recipe in browser at http://localhost:5173/recipes/filltest, click + Record V1,
# add ingredient "flour" with amount "100", add a step, click Add inside the uses editor,
# verify amount auto-fills to "100" (master, since nothing else allocated).
# Then add a second step, add a use, verify amount auto-fills to "100 - whatever step 1 used".

# Inspect dev log for errors:
grep -ic error /tmp/bb-dev.log

pkill -f 'bun run dev'
```

(Manual UI verification — the controller will do this.)

- [ ] **Step 5: Run the existing edit-batch E2E to confirm no regression**

```bash
~/.bun/bin/bun run e2e
```

Expected: 4 passed.

The existing `edit-batch.e2e.ts` test fills `use-amount` explicitly with "250", which overrides any auto-fill. So the test should keep passing without changes. If it doesn't, the auto-fill is interfering with the override path — investigate.

- [ ] **Step 6: Run unit suite**

```bash
~/.bun/bin/bun test
```

Expected: 67 pass.

- [ ] **Step 7: Commit (controller)**

```bash
git add src/lib/ui/BatchEditor.svelte src/lib/ui/UsesEditor.svelte
git commit -m "feat(ui): auto-fill remaining amount on ingredient pick in UsesEditor"
```

---

## Self-review notes

**Coverage:**
- "Auto-fill remaining unallocated when picking an ingredient" → addUse defaults to `remainingFor(firstAvailable.id)`.
- "When user changes the dropdown" → dropdown onchange auto-fills only if amount was 0 (untouched), preserving user-typed values.
- "Master with non-numeric amount (e.g. 'to taste')" → `remainingFor` returns 0 (no auto-fill, user types it).

**Edge cases:**
- Master fully allocated elsewhere → remaining is 0, defaults to 0. User has to type the amount manually. Acceptable.
- Master is non-numeric → 0 default. Same as today. Acceptable.
- User clears the amount to 0 then changes the dropdown → counts as untouched, auto-fills again. That's the desired behavior — re-derive on intent change.

**Risks:**
- The two `$effect` blocks in Step 3 both touch `amountInputs`. Svelte 5 typically deduplicates concurrent reactive updates, but if a self-trigger loop appears, simplify to a single effect that handles both cases.
- The arithmetic-eval on blur (`commitAmount`) calls `parseAmount(amountInputs[i])`. If the auto-fill set `amountInputs[i] = "100"` and the user blurs without changing it, `parseAmount("100")` returns 100, no-op. Safe.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-auto-fill-remaining.md`. 1 task, 7 steps.**

Two execution options:

**1. Subagent-Driven (recommended)** — same pattern as before.
**2. Inline Execution**

**Which approach?**
