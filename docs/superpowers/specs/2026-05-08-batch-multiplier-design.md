# Cook-time batch multiplier (1x / 2x / 3x)

**Status:** Design approved 2026-05-08.
**Owner:** Katie.

## Summary

Let the user scale a batch's ingredient and step-use amounts during cook
by toggling between 1x, 2x, and 3x without modifying the saved recipe or
batch values. When a cook session is completed at a multiplier other than
1x, prepend a one-liner `Cooked at {N}x` to the saved cook outcome notes
so the cook history reflects the actual size that was made.

## Motivation

The recipe master amounts are written for one batch size. Today, a user
who wants to make a double or triple batch has to do mental arithmetic
on every ingredient line and use, with no record after the fact of what
size they actually made. A discrete multiplier control reduces that to
one click and stamps the size onto the cook notes so the next person
reading the batch detail knows whether the timing/outcome notes were
based on a 1x or a multi-batch run.

## Behavior

### Multiplier values

Three discrete options: 1x (default), 2x, 3x. Implemented as a
two-or-three-button segmented toggle. Out-of-scope for v1: arbitrary
fractional or larger multipliers (0.5x, 4x, etc.). Easy to revisit
later if the user wants them.

### Where the control lives

Inside the existing `CookIngredients.svelte` section header, beside the
"Ingredients" label. Visible the entire time cook view is open, so the
user can flip the multiplier before, during, or after cooking; whichever
value is set when they confirm End Cook is the one recorded.

### What gets multiplied

- Ingredient master amounts displayed in the cook ingredient pills.
- Step-use amounts displayed inline within each cook step row's
  "ingredients used" list.

What does **not** change:
- The persisted `Batch.ingredients[].amount` and
  `Batch.steps[].uses[].amount` values. Multiplication is purely a
  display transform.
- The non-cook editor view (`BatchEditor`) and the read-only
  `BatchDetail` view. They continue to show the recipe at 1x.
- The ingredient consistency validator. The validator still operates on
  the underlying batch state, not on multiplied display values.

### Numeric vs. non-numeric amounts

The shared `parseAmount` helper distinguishes numeric ingredient
amounts (`"500"`, `"1/2"`) from non-numeric ones (`"to taste"`,
`"pinch"`). The multiplier:

- Numeric → `String(parseFloat((value * multiplier).toFixed(4)))`.
  The `.toFixed(4)` round-trip prevents floating-point artifacts like
  `0.30000000000004`. The trailing zeros are stripped by the parseFloat.
- Non-numeric → returned as-is. We will not display
  `"2x to taste"` or invent units that aren't there.
- Step uses (`IngredientUse.amount` is already numeric) →
  `value * multiplier` directly, with the same `toFixed(4)` cleanup
  applied at format time.

### Cook notes marker

`buildEndCookPatch` (in `src/lib/ui/cook/layout/end-cook-patch.ts`) gains
a `multiplier: number` field on its session-state argument. When
`multiplier !== 1`:

- **First-cook path:** the saved `outcomeNotes` becomes
  `"Cooked at {N}x\n\n{userNotes}"`. If the user typed no notes, the
  saved value is just `"Cooked at {N}x"` (no trailing whitespace).
- **Re-cook path:** the appended date-headed block becomes
  `"— {date}:\nCooked at {N}x\n{userNotes}"`, or just
  `"— {date}:\nCooked at {N}x"` if the user typed nothing. The marker
  lives inside that cook session's block so future re-cooks at different
  sizes get their own correctly attributed markers.

The existing re-cook short-circuit ("return `{}` when the user didn't
type notes") is loosened to "return `{}` when the user didn't type
notes **AND** multiplier is 1." A re-cook at 2x with no user notes
still patches `outcomeNotes` so the marker is recorded.

When `multiplier === 1`, `buildEndCookPatch` behaves exactly as today —
no marker, no behavior change.

The marker is plain text inside `outcomeNotes`. We are not adding a
structured `cookMultiplier` field to the `Batch` type. If we later want
a badge on `BatchDetail` for "this batch was cooked at 2x", the
plain-text marker is parseable enough; we can revisit then.

## Architecture

### State

`CookView.svelte` owns the multiplier:

```ts
let multiplier = $state<1 | 2 | 3>(1);
```

It passes the value as a prop down two paths:

1. To `CookIngredients` for both the toggle UI and ingredient-pill
   display.
2. To `CookStepList` → `CookStepRow` for step-use display.

It also passes the value into `EndCookDialog`'s `buildEndCookPatch`
input, so the marker is composed at submission time using whatever the
multiplier is at that moment.

### New helper: `multiplyAmount`

`src/lib/ui/cook/layout/multiply-amount.ts`:

```ts
import { parseAmount } from '../../layout/amount-parse';

export function multiplyAmount(amount: string, multiplier: number): string {
  if (multiplier === 1) return amount;
  const parsed = parseAmount(amount);
  if (parsed === null) return amount;
  const scaled = parseFloat((parsed * multiplier).toFixed(4));
  return String(scaled);
}
```

This is the single point of truth for "how should this displayed amount
look at multiplier N?" — used by both the ingredient pills and the
step-use inline display.

### Toggle UI

Inside `CookIngredients.svelte`, the section header changes from a flat
`<h2>Ingredients</h2>` to a flex row:

```
[ Ingredients ]                              [ 1x ] [ 2x ] [ 3x ]
```

The buttons are the same visual language as the existing dock toggle
buttons (small uppercase `text-[10px] tracking-wider`, ochre highlight
for the active value). Aria-pressed reflects the active state.

### Step-use display

`CookStepRow.svelte` already renders `step.uses[].amount` in a per-step
"ingredients used" list. `IngredientUse.amount` is already a `number`,
so it doesn't go through `multiplyAmount`. Instead, the format helper
inside `CookStepRow` applies the same rounding pattern inline:

```ts
const display = parseFloat((use.amount * multiplier).toFixed(4));
```

This keeps the float-artifact mitigation consistent with `multiplyAmount`
for ingredient masters.

## Files touched

**New:**
- `src/lib/ui/cook/layout/multiply-amount.ts`
- `tests/ui/cook/multiply-amount.test.ts`

**Modified:**
- `src/lib/ui/cook/CookView.svelte` — declare `multiplier` state, pass to children and to `EndCookDialog`.
- `src/lib/ui/cook/CookIngredients.svelte` — accept `multiplier` prop and `onMultiplierChange` callback, render the segmented toggle in the header, route ingredient amounts through `multiplyAmount`.
- `src/lib/ui/cook/CookStepList.svelte` — pass-through `multiplier` prop.
- `src/lib/ui/cook/CookStepRow.svelte` — accept `multiplier`, scale `step.uses[].amount` for display.
- `src/lib/ui/cook/EndCookDialog.svelte` — accept `multiplier` prop, pass into `buildEndCookPatch`.
- `src/lib/ui/cook/layout/end-cook-patch.ts` — accept `multiplier` on `EndCookSessionState`, prepend the marker when ≠ 1 in both first-cook and re-cook paths.

## Testing

**Unit tests for `multiplyAmount`** (`tests/ui/cook/multiply-amount.test.ts`):

- `multiplyAmount('500', 1)` → `'500'` (passthrough at 1x).
- `multiplyAmount('500', 2)` → `'1000'`.
- `multiplyAmount('1/2', 2)` → `'1'` (fraction handling via parseAmount).
- `multiplyAmount('0.1', 3)` → `'0.3'` (no float artifact).
- `multiplyAmount('to taste', 2)` → `'to taste'` (non-numeric passthrough).
- `multiplyAmount('', 2)` → `''` (empty passthrough).

**Unit tests for `buildEndCookPatch`** (extending the existing test
file at `tests/ui/cook/end-cook-patch.test.ts`):

- First-cook + multiplier 1, with notes → `outcomeNotes` is just the
  user's notes (no marker).
- First-cook + multiplier 2, with notes → `outcomeNotes` is
  `"Cooked at 2x\n\n{notes}"`.
- First-cook + multiplier 3, no user notes → `outcomeNotes` is
  exactly `"Cooked at 3x"`.
- Re-cook + multiplier 2 + user notes → appended block is
  `"\n\n— {date}:\nCooked at 2x\n{notes}"`.
- Re-cook + multiplier 2 + no user notes → patch sets
  `outcomeNotes` to `"— {date}:\nCooked at 2x"` (loosened short-circuit).
- Re-cook + multiplier 1 + no user notes → patch is `{}` (existing
  behavior, unchanged).
- Re-cook + multiplier 1 + user notes → existing behavior unchanged.

**E2E:** skipped. The feature is small and the unit tests cover the
arithmetic and the note composition (the two places it could go wrong).
A manual smoke test before merge confirms the cook view UI works.

## Out of scope

- Persisting a structured `cookMultiplier` field on `Batch` (not needed
  yet; YAGNI).
- Showing a "2x" badge on `BatchDetail` (could revisit if useful;
  the plain-text marker is enough for now).
- Multipliers other than 1x/2x/3x (not requested; easy to add later
  by widening the union type and the toggle UI).
- Halving (0.5x) recipes (same — not requested).
- Auto-adjusting timer durations based on multiplier (a doubled batch
  may take longer to cook, but how is recipe-specific; out of scope).
