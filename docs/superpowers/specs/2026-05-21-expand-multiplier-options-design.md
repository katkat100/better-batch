# Expand multiplier options (halving / three-quarter)

**Status:** Design approved 2026-05-21.
**Owner:** Katie.

## Summary

Add 0.5x and 0.75x to the multiplier toggle without growing the
visible button row. The four visible slots stay
`[Slot 1] [2x] [3x] [⋯]`. Slot 1 defaults to 1x; picking 0.5x or
0.75x from the ⋯ menu swaps Slot 1 to that value. The ⋯ menu always
shows whichever sub-2 values aren't currently in Slot 1.

The storage drop rule for `cookMultiplier` tightens from `<= 1` to
exactly `1`, so 0.5x and 0.75x persist on cooked batches and the
BatchDetail badge shows them.

## Motivation

Cooking smaller batches is a common case — making half a sauce
recipe to test changes, scaling down for one person, etc. The
current toggle is hard-wired to 1/2/3 with no path to less than 1x.
The user has already opted into expanding the options but wants the
visible row to stay compact (no 5- or 6-button row), so the new
values live in a small drop-down menu behind a `⋯` button.

## Behavior

### The toggle UI

The toggle is always four slots wide. The first slot ("Slot 1")
holds either 1x by default, or 0.5x / 0.75x when one of those was
selected from the menu:

| Active multiplier | Visible row |
|---|---|
| 1x | `[1x] [2x] [3x] [⋯]` |
| 2x | `[1x] [2x*] [3x] [⋯]` |
| 3x | `[1x] [2x] [3x*] [⋯]` |
| 0.5x | `[0.5x*] [2x] [3x] [⋯]` |
| 0.75x | `[0.75x*] [2x] [3x] [⋯]` |

*highlighted = active.* The `⋯` button never holds the active
highlight — it's purely an opener for the menu.

The `⋯` menu is a small popover that opens below the button. It
always lists whichever sub-2 values aren't currently in Slot 1:

| Slot 1 shows | Menu contents |
|---|---|
| 1x | `[0.5x] [0.75x]` |
| 0.5x | `[1x] [0.75x]` |
| 0.75x | `[1x] [0.5x]` |

Selecting a value from the menu closes the popover and updates the
multiplier. Slot 1 mutates if needed (e.g., picking 0.5x from the
menu replaces the 1x slot).

The user can return to 1x by picking 1x from the menu (only present
when 0.5x or 0.75x is active).

### Behavior on both surfaces

The same `MultiplierToggle` component renders on:

- `CookIngredients.svelte` — drives the cook-time multiplier that
  scales ingredient pills and persists to `cookMultiplier` at end
  cook.
- `BatchDetail.svelte` — display-only preview multiplier on the
  read view.

Both gain the new options automatically; no per-surface differences.

### Type widening

`Multiplier` becomes `number` (was `1 | 2 | 3`). At runtime the
toggle component enforces the allowed set (1, 2, 3, 0.5, 0.75) by
only emitting those values via its `onChange`. Persisted batches
written by future versions could carry other numbers and we'll
display them correctly; that's a graceful-degradation property.

### Storage drop-rule tightening

`src/lib/data/batches.ts`'s `createBatch` and `updateBatch` today
drop `cookMultiplier` from the persisted record when the value is
`<= 1`. With 0.5x and 0.75x now valid, the rule changes to **drop
only when the value is exactly `1`** (or any other falsy value
caller might pass through, like `0` or `NaN`).

After the change:

| Value | Persisted? |
|---|---|
| `undefined` / `null` / `0` / `NaN` | No |
| `1` | No (no-op default) |
| `0.5`, `0.75`, `1.5`, `2`, `3`, etc. | Yes |

Negative values and zero are theoretically possible if a future
caller passes them, but the toggle UI never produces them. The drop
rule treats them as falsy → not persisted, which is fine.

### Badge gate widening

`BatchDetail.svelte` today shows the `cook-multiplier-badge` only
when `batch.cookMultiplier > 1`. After this change it shows when
`batch.cookMultiplier !== undefined && batch.cookMultiplier !== 1`.

Result: 0.5x-cooked batches get a `0.5X` badge. 1x-cooked batches
(which never persist `cookMultiplier` anyway thanks to the drop
rule) stay un-badged. 2x and 3x behave as today.

### Marker text and `multiplyAmount`

No changes needed:

- `buildEndCookPatch`'s `multiplierMarker` already returns `''` when
  `multiplier === 1` and `Cooked at {N}x` otherwise. So `Cooked at
  0.5x` and `Cooked at 0.75x` fall out for free.
- `multiplyAmount` already accepts any number and uses
  `parseAmount` + `toFixed(4)`. Math works for 0.5 just like 2.

## Architecture

### MultiplierToggle internals

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

  // Slot 1 shows whichever sub-2 value is active, defaulting to 1.
  const HIDDEN_CANDIDATES = [0.5, 0.75] as const;
  const slot1 = $derived(
    HIDDEN_CANDIDATES.includes(value as 0.5 | 0.75) ? value : 1
  );
  const menuValues = $derived(
    // Show 1x in the menu if Slot 1 holds a fractional; otherwise show both fractionals.
    slot1 === 1 ? [...HIDDEN_CANDIDATES] : [1, ...HIDDEN_CANDIDATES.filter(v => v !== slot1)]
  );

  let menuOpen = $state(false);

  function fmt(v: number): string {
    // Render 0.5 → "0.5x", 1 → "1x", etc. Avoid trailing zeros via String.
    return `${String(v)}x`;
  }

  function pick(v: number) {
    onChange(v);
    menuOpen = false;
  }
  // ...
</script>
```

The template renders 4 always-present elements: Slot 1, 2x, 3x, ⋯.
Each visible button uses the same class helper as today, with
`aria-pressed={v === value}`. The ⋯ button toggles `menuOpen`. The
popover is a small `<div>` with `role="menu"` positioned absolutely
below the button, listing `menuValues` as menu items.

A click outside the popover (or `Escape`) closes it. We can use a
backdrop `<button>` covering the rest of the page (same pattern as
`BatchDetail`'s more-actions popover) for click-outside dismissal.

### Storage drop rule

In `src/lib/data/batches.ts`:

```ts
// before
if ('cookMultiplier' in patch && (!patch.cookMultiplier || patch.cookMultiplier <= 1)) {
  delete (next as Partial<Batch>).cookMultiplier;
}

// after
if ('cookMultiplier' in patch && (!patch.cookMultiplier || patch.cookMultiplier === 1)) {
  delete (next as Partial<Batch>).cookMultiplier;
}
```

And the parallel rule in `createBatch`:

```ts
// before
...(input.cookMultiplier && input.cookMultiplier > 1
  ? { cookMultiplier: input.cookMultiplier }
  : {})

// after
...(input.cookMultiplier && input.cookMultiplier !== 1
  ? { cookMultiplier: input.cookMultiplier }
  : {})
```

### Badge gate

In `src/lib/ui/BatchDetail.svelte`:

```svelte
<!-- before -->
{#if batch.cookMultiplier && batch.cookMultiplier > 1}

<!-- after -->
{#if batch.cookMultiplier !== undefined && batch.cookMultiplier !== 1}
```

## Files touched

**Modified:**
- `src/lib/ui/MultiplierToggle.svelte` — Slot 1 logic, ⋯ menu, type widening, format helper.
- `src/lib/data/batches.ts` — drop rule changes from `<= 1` to `=== 1` in two places.
- `src/lib/ui/BatchDetail.svelte` — badge gate change.
- `tests/data/batches.test.ts` — update the two existing `<= 1` drop tests to be more specific; add coverage for 0.5x persists and a 1 → 0.5 patch persists 0.5.

**No e2e changes.** The existing `multiplier.e2e.ts` exercises 2x and 1x flows which are unaffected by this change.

## Testing

**Unit tests** (additions/changes to `tests/data/batches.test.ts`):

- "persists cookMultiplier when input is 0.5" — `createBatch({...,
  cookMultiplier: 0.5})` returns a batch with `cookMultiplier:
  0.5`. (New.)
- "persists cookMultiplier when input is 0.75" — same. (New.)
- "drops cookMultiplier on patch value 1" — already exists. Confirm
  it still expresses the right intent. (Adjust wording if needed.)
- "persists cookMultiplier on patch value 0.5 after a prior 2 was
  set" — `updateBatch(..., { cookMultiplier: 0.5 })` after a
  batch was created at 2x returns a batch with `cookMultiplier:
  0.5`. (New.)

No new tests for `MultiplierToggle.svelte` — it's a UI component
without business logic worth unit-testing. The user-facing behavior
is covered by manual verification.

**Manual verification:**

- Cook view: each option in the visible row + ⋯ menu produces the
  expected ingredient pill scaling. Switching from a hidden value
  back to 1x via the menu correctly resets the slot.
- BatchDetail: same toggle works for display-only preview.
- After cooking at 0.5x: the badge shows `0.5X` and the outcome notes
  do NOT contain the legacy text marker (the new structured field
  is the source of truth).
- After cooking at 1x: no badge, no marker — unchanged from today.

## Out of scope

- Arbitrary number input (was considered earlier, rejected in favor
  of presets + ⋯ menu).
- Additional fractional values (1.5x, 2.5x, etc) — easy to add to
  `HIDDEN_CANDIDATES` later if needed.
- Updating the cook-notes marker to use fractions like "½" instead
  of "0.5" — readability nicety, defer.
- Updating the badge to show "½x" instead of "0.5x" — same.
- An e2e for the 0.5x flow — the existing 2x e2e covers the
  round-trip mechanics; adding a 0.5x duplicate is low-value.

## Open questions

None at design approval time.
