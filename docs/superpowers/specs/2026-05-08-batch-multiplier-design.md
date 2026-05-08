# Cook-time batch multiplier (1x / 2x / 3x)

**Status:** Design approved 2026-05-08.
**Owner:** Katie.

## Summary

Let the user scale a batch's ingredient and step-use amounts by toggling
between 1x, 2x, and 3x in both the read-only batch detail view and in
cook view, without modifying the saved recipe or batch values. The
toggle is purely a display transform in both surfaces. When a cook
session in cook view is completed at a multiplier other than 1x,
prepend a one-liner `Cooked at {N}x` to the saved cook outcome notes
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

Two surfaces, two independent toggles, sharing one underlying component
(`MultiplierToggle.svelte`) and one display helper (`multiplyAmount`):

- **Cook view** — inside the `CookIngredients.svelte` section header,
  beside the "Ingredients" label. The user can flip the multiplier
  before, during, or after cooking; whichever value is set when they
  confirm End Cook is the one recorded in the outcome notes.
- **Batch detail view** — inside the `BatchDetail.svelte` ingredients
  section header, in the same visual position. Display-only; does **not**
  drive the cook-notes marker (only the cook-view toggle does that).

The two toggles do not share state. Setting 2x on the batch detail
page and then clicking "Start Cooking" enters cook view at 1x; the
user re-selects in cook view if they want it. (Pre-filling was
considered but rejected — the user's selection in cook view is the one
that becomes the historical record, so requiring an explicit choice
there is the safer default.)

### What gets multiplied

- Ingredient master amounts displayed in the cook ingredient pills.
- Step-use amounts displayed inline within each cook step row's
  "ingredients used" list.

What does **not** change:
- The persisted `Batch.ingredients[].amount` and
  `Batch.steps[].uses[].amount` values. Multiplication is purely a
  display transform on both surfaces.
- `BatchEditor` (the create/edit form). The editor always shows the
  recipe master values 1:1 since editing should not be subject to a
  display scale.
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

Two view-owned states, no sharing:

```ts
// CookView.svelte
let multiplier = $state<1 | 2 | 3>(1);

// BatchDetail.svelte
let multiplier = $state<1 | 2 | 3>(1);
```

`CookView` passes the value down to `CookIngredients` (toggle UI +
ingredient pills) and to `CookStepList` → `CookStepRow` (step uses).
It also passes the value into `EndCookDialog`'s `buildEndCookPatch`
input so the marker is composed at submission time.

`BatchDetail` passes the value down to `IngredientList` (ingredient
amounts) and to `StepsList` (step-use amounts). The toggle UI sits in
the ingredients section header.

The toggles use the same `MultiplierToggle.svelte` component
(`src/lib/ui/MultiplierToggle.svelte`) so the visual + interaction
language is identical across both surfaces. The component takes
`value: 1 | 2 | 3` and `onChange: (next: 1 | 2 | 3) => void`.

### New helper: `multiplyAmount`

Lives at `src/lib/ui/layout/multiply-amount.ts` (shared with the read
view, not cook-specific):

```ts
import { parseAmount } from './amount-parse';

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

`MultiplierToggle.svelte` renders three segmented buttons sharing the
same visual language as the existing dock toggle chips
(`text-[10px] tracking-wider uppercase`, ochre highlight for the active
value, `aria-pressed` reflecting state). Both `CookIngredients` and
`BatchDetail` mount it next to their ingredients section header:

```
[ Ingredients ]                              [ 1x ] [ 2x ] [ 3x ]
```

The toggle hides itself entirely when the batch has zero ingredients
(no point in offering scaling for an empty list).

### Step-use display

`CookStepRow.svelte` (cook view) and `StepsList.svelte` (batch detail
view) both render `step.uses[].amount`. `IngredientUse.amount` is
already a `number`, so it doesn't go through `multiplyAmount`. Both
components apply the same inline rounding pattern at display time:

```ts
const display = parseFloat((use.amount * multiplier).toFixed(4));
```

This keeps float-artifact mitigation consistent with `multiplyAmount`
for ingredient masters.

## Files touched

**New:**
- `src/lib/ui/layout/multiply-amount.ts`
- `src/lib/ui/MultiplierToggle.svelte`
- `tests/ui/multiply-amount.test.ts`

**Modified — cook view:**
- `src/lib/ui/cook/CookView.svelte` — declare `multiplier` state, pass to children and to `EndCookDialog`.
- `src/lib/ui/cook/CookIngredients.svelte` — accept `multiplier` and `onMultiplierChange`, render `MultiplierToggle` in the header, route ingredient amounts through `multiplyAmount`.
- `src/lib/ui/cook/CookStepList.svelte` — pass-through `multiplier` prop.
- `src/lib/ui/cook/CookStepRow.svelte` — accept `multiplier`, scale `step.uses[].amount` for display.
- `src/lib/ui/cook/EndCookDialog.svelte` — accept `multiplier` prop, pass into `buildEndCookPatch`.
- `src/lib/ui/cook/layout/end-cook-patch.ts` — accept `multiplier` on `EndCookSessionState`, prepend the marker when ≠ 1 in both first-cook and re-cook paths.

**Modified — batch detail view:**
- `src/lib/ui/BatchDetail.svelte` — declare its own `multiplier` state, render `MultiplierToggle` next to the ingredients section header, pass `multiplier` to `IngredientList` and `StepsList`.
- `src/lib/ui/IngredientList.svelte` — accept `multiplier` prop, route each row's amount through `multiplyAmount`.
- `src/lib/ui/StepsList.svelte` — accept `multiplier` prop, scale `use.amount` inline at display time.

## Testing

**Unit tests for `multiplyAmount`** (`tests/ui/multiply-amount.test.ts`):

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
