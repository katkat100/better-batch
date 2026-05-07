# Ingredient consistency checks for batches

**Status:** Design approved 2026-05-07.
**Owner:** Katie.

## Summary

Catch three classes of ingredient inconsistency in a batch and surface them
inline while editing, gate them at save time with an override-and-explain
dialog, and badge any saved batch that was overridden so the note is visible
on its detail view.

## Motivation

A batch's ingredient list and step uses are entered separately and easy to
get out of sync — an ingredient gets added but never referenced in a step,
or step uses don't sum to the declared master amount. Today the editor only
warns on per-step over-allocation; whole-batch consistency goes uncaught
until cooking, when it's too late to know whether the recipe was off or the
data entry was. We want to catch these mistakes before save, while still
letting the user record legitimate cases (e.g. dusting with a garnish whose
math can't quite balance) with a note future-them will understand.

## The three checks

For each ingredient on the batch:

1. **Referenced in steps.** The ingredient must appear in at least one
   `step.uses` entry. Use rows with `amount === 0` count as referenced.
2. **Total adds up (under-allocation).** When the master amount parses as a
   number, the sum of `step.uses[].amount` across all steps must equal that
   number. `sum < master` fails this check.
3. **Total adds up (over-allocation).** Same numeric-master condition as
   #2, but `sum > master`. Surfaced with the same severity and visual as
   #2 — both collapse to a single `sum-mismatch` issue kind.

Master amounts that don't parse as a number (e.g. "to taste", "1/2 cup") skip
checks #2 and #3 entirely; only check #1 applies. A garnish/0-amount use
counts toward the sum like any other amount, so a recipe with `100g
snowflake crisp` mastered and a single `0` use will fail check #2 — the user
is expected to override with a note explaining why ("dusts the top").

Out of scope (considered, deliberately excluded):

- Empty/zero-amount uses as a flag (handled implicitly by leaving the 0).
- Step uses referencing deleted ingredients (still silently filtered on save
  as today).
- Duplicate references to one ingredient inside a single step.
- Visual markers on `BatchGraph` nodes.
- A separate gate when marking cooked — cooking goes through save, which
  already gates.

## Architecture

### Validator (pure function)

A new module `src/lib/shared/batch-validation.ts` exports:

```ts
export type IngredientIssueKind = 'unreferenced' | 'sum-mismatch';

export interface IngredientIssue {
  kind: IngredientIssueKind;
  ingredientId: string;
  ingredientName: string;
  sum?: number;     // present for sum-mismatch
  master?: number;  // present for sum-mismatch
  unit?: string;    // present for sum-mismatch
}

export function validateBatch(batch: Batch): IngredientIssue[];
```

Algorithm: walk `batch.ingredients` once, accumulating `sum` and reference
count from `batch.steps[].uses` per ingredient id. Emit one
`unreferenced` issue when reference count is zero. Emit one `sum-mismatch`
issue when the master parses to a number and `sum !== master`. Issues are
returned in ingredient-list order; if a single ingredient has both kinds,
`unreferenced` comes first. Step uses whose `ingredientId` doesn't match
any current ingredient on the batch are ignored by the validator (they
get silently filtered on save by existing code).

The validator lives in `shared/` so the server can call it later if we want
to enforce a structural check on save; the UI is the only consumer for now.

### Data model

One optional field added to `Batch`:

```ts
interface Batch {
  // ... existing fields ...
  inconsistencyNote?: string;
}
```

- `undefined` → batch is clean or was last saved clean. No badge.
- `''` (empty string) → user overrode at save time but didn't write a note.
  Badge appears; tooltip shows only the current live issues.
- Non-empty string → user's explanation, shown in the tooltip alongside
  current live issues.

The field is optional so the storage layer needs no migration — older batch
files simply lack it. Server-side `BatchInput` schema accepts it as an
optional string.

**Auto-clear on save.** Every save call ends with: if
`validateBatch(updatedBatch).length === 0`, drop `inconsistencyNote` from
the persisted record. A user who overrides today and fixes the math
tomorrow gets a clean batch with no leftover note.

### Editor flow

`BatchEditor.svelte` adds:

```ts
const issues = $derived(validateBatch(currentBatchSnapshot));
const issuesByIngredient = $derived(/* Map<id, IngredientIssue[]> */);
let showUnreferencedHighlights = $state(false);
```

**Live highlights (always on, regardless of `showUnreferencedHighlights`):**

- For each ingredient with a `sum-mismatch` issue, the ingredient row in
  the editor's main list gets a `border-ochre` class and a small
  `⚠ used N/M unit` chip near the name.
- In `UsesEditor`, every use row whose ingredient has a `sum-mismatch`
  issue gets the same `border-ochre` on the ingredient `<Select>` and the
  amount `<TextInput>`. The existing per-step allocation chip is extended
  to color ochre on `sum !== master` (currently only `sum > master`).

**Gated highlight (turns on after first save attempt):**

- For each ingredient with an `unreferenced` issue, the editor main-list
  row gets a `border-ochre` and `⚠ never used` chip — but only when
  `showUnreferencedHighlights` is true. This keeps the editor quiet while
  the user is still typing in ingredients before getting to the steps.

**Save flow.** When the user clicks Save (or Mark Cooked, which routes
through save):

1. Compute `issues = validateBatch(snapshot)`.
2. If `issues.length === 0` → save normally; persist
   `inconsistencyNote: undefined` (drop the field).
3. Otherwise → open `InconsistencyDialog` (new component) with the issue
   list. The dialog has two paths:
   - **Fix it** → close dialog, set `showUnreferencedHighlights = true`,
     no save. The user returns to the editor with all highlights now
     visible and continues editing.
   - **Save anyway** → reveals a textarea ("Optional note: why are these
     intentional?") and a confirm button. On confirm, save with
     `inconsistencyNote = textarea.value` (empty string allowed).

**`InconsistencyDialog.svelte`** is a small new component in `src/lib/ui/`
following the same modal pattern as `PasteRecipeDialog`. Inputs:
`issues: IngredientIssue[]` and callbacks `onFix()` /
`onSaveAnyway(note: string)`.

### Read-side (BatchDetail / BatchView)

`BatchDetail.svelte` recomputes `validateBatch(batch)` on render. The badge
shows when `issues.length > 0 || batch.inconsistencyNote !== undefined`.

The badge is a small `⚠` next to the batch label/header. On hover/click, a
popover lists:

- Each current live issue (so a viewer sees what's actually wrong now).
- The saved `inconsistencyNote` underneath, if non-empty, prefixed with
  "Note:".

If the underlying batch has been edited since override and is now clean,
the auto-clear from the data-model section will have already dropped the
note and the badge disappears.

## Issue copy

| Kind | Format |
|------|--------|
| `unreferenced` | `<name>: never referenced in any step` |
| `sum-mismatch` (under) | `<name>: used <sum><unit> of <master><unit>` |
| `sum-mismatch` (over) | `<name>: used <sum><unit>, more than the <master><unit> listed` |

Live editor chips are abbreviated: `⚠ never used` and
`⚠ used N/M unit`.

## Testing

**Validator unit tests** in `tests/shared/batch-validation.test.ts`:

- Empty batch → no issues.
- One ingredient, no steps → one `unreferenced` issue.
- Numeric master, single use, `sum === master` → no issues.
- Numeric master, `sum < master` → one `sum-mismatch` (under).
- Numeric master, `sum > master` → one `sum-mismatch` (over).
- Non-numeric master, no uses → one `unreferenced`, no math.
- Non-numeric master, with a use → no issues.
- Ingredient referenced from two steps, sums correctly aggregate.
- Garnish-style use of 0 against numeric master > 0 → `sum-mismatch`
  (under) and not `unreferenced`.
- Single ingredient that is both unreferenced and has a numeric master >
  0 → returns both kinds, `unreferenced` first.

**End-to-end** in `tests/e2e/`: one Playwright spec covering save →
dialog → "Save anyway" + note → reload → badge + tooltip visible on
`BatchDetail`. Skip exhaustive UI assertions; the validator is the trust
boundary, the dialog wiring is the only thing the e2e needs to prove.

## Files touched

New:

- `src/lib/shared/batch-validation.ts`
- `src/lib/ui/InconsistencyDialog.svelte`
- `tests/shared/batch-validation.test.ts`
- One new e2e spec under `tests/e2e/`.

Modified:

- `src/lib/server/domain/types.ts` — add optional `inconsistencyNote`.
- `src/lib/server/storage/batches.ts` — pass through the optional field.
- `src/lib/server/index.ts` — add `inconsistencyNote` as an optional
  string to whatever batch-write schema this file exposes (keep parity
  with the new field on `Batch`).
- `src/lib/ui/BatchEditor.svelte` — issue derivation, highlights, dialog,
  save flow.
- `src/lib/ui/UsesEditor.svelte` — extend allocation-chip coloring to
  cover under-allocation; apply ochre border to use rows with
  sum-mismatch issues.
- `src/lib/ui/BatchDetail.svelte` — badge + tooltip.

## Open questions

None at design approval time. Implementation plan to follow.
