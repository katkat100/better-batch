# Better Batch — Row-Level Merge Amendment

**Date:** 2026-05-05
**Status:** Draft, pending implementation plan
**Amends:** `2026-05-04-better-batch-design.md` §5.5 (Merge view)

## 1. Overview

The current merge picker resolves variables per-field but treats ingredients and steps as whole-list radios ("from A" or "from B"). This amendment moves ingredients and steps to per-row conflict resolution, like a git merge tool: matching rows are auto-included, divergent rows surface as conflicts with explicit pick-A / pick-B / skip controls.

The user reaches Merge via the same `/recipes/[id]/merge?a=…&b=…` route. The page header, label input, and submit button are unchanged. Only the body of `MergePicker` is reworked.

## 2. Diff inputs

The merge page loader computes three diffs (in addition to loading recipe + both batches):

- `varRows: VariableDiffRow[]` — already used by Compare; pulled from `variableDiff(recipe.variableSchema, a.variables, b.variables)`.
- `ingRows: IngredientDiffRow[]` — already used by Compare; pulled from `ingredientDiff(a.ingredients, b.ingredients)`. Op is `ctx | mod | add | rem`. Matching is by stable `Ingredient.id`.
- `stepRows: StepObjectDiffRow[]` — **new**. Pulled from a new `stepObjectDiff(a.steps, b.steps)` helper that returns `{op: 'ctx' | 'add' | 'rem', step: Step}[]`. Same LCS algorithm as `stepTextDiff` but emits Step objects (preserving `uses`) instead of text strings.

`stepTextDiff` stays as-is. Compare continues to use it (text-only display); Merge uses the new `stepObjectDiff`.

## 3. Conflict resolution model

For each section, MergePicker holds a state array of `Pick` objects, one per diff row, indexed by row position.

### 3.1 Variables — `VarPick`
Unchanged shape: `{ from: 'a' | 'b' | 'custom'; value?: VariableValue }`.

Defaults:
- `changed === false` (identical in A and B): `{ from: 'a' }` (any side; result is identical).
- `changed === true`: `{ from: 'b' }` (newer batch wins by default per Q4).

### 3.2 Ingredients — `IngPick` (new)
`{ action: 'pick-a' | 'pick-b' | 'skip' }`.

Defaults by op:
- `ctx` → `pick-a`. Auto-included; UI shows no controls.
- `mod` → `pick-b` (newer wins).
- `rem` (only in A) → `skip` (newer effectively removed it).
- `add` (only in B) → `pick-b` (newer added it; default include).

### 3.3 Steps — `StepPick` (new)
Same shape as `IngPick`.

Defaults by op:
- `ctx` → `pick-a`. Auto-included; UI shows no controls.
- `rem` (only in A) → `skip`.
- `add` (only in B) → `pick-b`.

(LCS produces no `mod` op for steps — text equality only.)

### 3.4 Result computation
Resolved values are derived reactively from `(rows, picks)`:

- **Variables:** loop `recipe.variableSchema`. For each schema item, look up the pick: `from='a'` → `a.variables[name]`, `from='b'` → `b.variables[name]`, `from='custom'` → `pick.value`.
- **Ingredients:** walk `ingRows`. For each row, if pick is `pick-a` and row has `a` → emit `row.a`. If `pick-b` and row has `b` → emit `row.b`. `skip` emits nothing. `ctx` rows always emit `row.a` (identical to `row.b`). Output is `Ingredient[]`.
- **Steps:** walk `stepRows`. Same logic; output is `Step[]`. `ctx` rows emit the step from A (text identical, `uses` may differ; we keep A's `uses` by convention since the step text is the same).

## 4. UI layout

`MergePicker.svelte` keeps its existing header (label input, A/B/result chips) and footer (Cancel + Record Merge button). The body changes from radio sections to three single-column row lists.

### 4.1 Variables section
A vertical list of rows, one per schema item. Same data shown as today's table but rendered as flex rows for visual consistency with the new sections.

Each row shows:
- Variable name (uppercase tracking-wider, ~110px column)
- A's value (Ochre when active selection; default style otherwise)
- B's value (Juniper when active selection)
- Result column: shows resolved value, with a small `custom` toggle button. When `custom` is active, the result column shows an editable input (number or text per `schema.type`).

Identical rows greyed.

### 4.2 Ingredients section
A vertical list of rows, one per `IngredientDiffRow`. Each row contains:

- **Op badge** (left, ~36px wide, uppercase 9px text):
  - `ctx` → "unch" (Drafting Ink color, faded)
  - `mod` → "conf" (Ochre)
  - `rem` → "−A" (Ochre)
  - `add` → "+B" (Juniper)
- **Content** (flex-1, font-mono):
  - `ctx`: `100g salt` (faded)
  - `mod`: `[A] 500g flour → [B] 550g flour` (A in Ochre, B in Juniper, arrow in faded grey)
  - `rem`: `500g sugar` (Ochre)
  - `add`: `5g vinegar` (Juniper)
- **Pick controls** (right, small buttons):
  - `ctx`: small "in result" chip; no buttons
  - `mod`: `[A] [B] [skip]` — default highlighted = B
  - `rem`: `[keep] [skip]` — default = skip
  - `add`: `[skip] [add]` — default = add

Active button uses Ochre (for A) or Juniper (for B) fill; inactive is bordered Drafting Ink. `skip` active uses Obsidian fill.

`data-testid` attributes:
- `merge-ing-row` on the row container
- `data-op="ctx|mod|add|rem"` on the row
- `merge-pick-a`, `merge-pick-b`, `merge-skip`, `merge-keep`, `merge-add` on the buttons (per applicable op)

### 4.3 Steps section
Same row pattern as ingredients. Content shows step text (truncated to ~80 chars + "…", full text in `<title>` tooltip). Pick controls match the available ops for that row (no `mod` button since steps have no mod op).

`data-testid`: `merge-step-row` on the row, same button-level testids as ingredients.

### 4.4 Section footer
Each section has a small derived summary line at the bottom (e.g. `Result: 4 ingredients` or `Result: 6 steps`). Optional confidence cue.

### 4.5 Removed
The existing "Ingredients" and "Steps" radio sections (`From A (N items) / From B (N items)`) are deleted. Their `ingredientsFrom` / `stepsFrom` state goes away.

## 5. Component breakdown

The current `MergePicker.svelte` is ~210 lines. Adding three sections inline would push it well past the 250-line guideline. Split into:

- `MergePicker.svelte` — orchestrates state, computes resolved values, calls `onSubmit`. ~150 lines.
- `MergeVarRow.svelte` — one variable row with the four-cell flex layout and the custom-toggle. ~70 lines.
- `MergeIngredientRow.svelte` — one ingredient diff row with op badge, content rendering per op, and pick buttons. ~80 lines.
- `MergeStepRow.svelte` — one step diff row. ~60 lines.

Each row component is purely presentational: receives the row data and the pick state, emits a callback when the user picks. State lives entirely in `MergePicker`.

## 6. Submit flow

The existing `MergePicker.onSubmit` callback currently receives `{ label, ingredientsFrom, stepsFrom, variables }`. New signature:

```ts
onSubmit({
  label: string;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
})
```

The page (`src/routes/recipes/[id]/merge/+page.svelte`) updates accordingly. The defensive step-uses stripping (drop `step.uses` referencing ingredient ids that aren't in the chosen ingredient set) **stays** — even with row-level picking, a user can pick step from A while skipping an ingredient from A that step references. We keep the strip as a backstop; the submit still succeeds.

`api.createBatch` call is unchanged: `parentIds: [a.id, b.id]`, `status: 'draft'`, plus the resolved variables/ingredients/steps.

## 7. API impact

None. The PATCH/POST endpoints already validate that every `step.uses[].ingredientId` exists in the batch's ingredients (added in the batch-editing amendment). The merge page's defensive strip means we never trigger that 400.

## 8. Testing

- **Unit:** add `stepObjectDiff` tests to `tests/domain/diff.test.ts` covering ctx/add/rem ops and the preserved `step.uses` payload.
- **Unit:** no changes to existing `variableDiff`, `ingredientDiff`, `stepTextDiff` tests.
- **E2E:** `tests/e2e/compare-merge.e2e.ts` currently fills `merge-label` and clicks `merge-submit`. With defaults set to "newer wins", the test should still produce a valid merged batch. Update only if a specific assertion changes; the existing `await expect(page.getByTestId('batch-detail')).toContainText('merged v3')` checks only the label of the resulting batch, which is independent of pick decisions. **Verify on first run.**
- **E2E (optional addition):** a focused test that opens merge with two diverging batches, picks an ingredient from A explicitly, picks a step from B explicitly, submits, then asserts the new batch contains exactly those values. Optional — adds confidence but isn't strictly required.

## 9. Out of scope

- **Custom edit for ingredient/step conflicts.** Variables get a `custom` option; ingredients and steps don't. If the user wants a value that's neither A nor B, they pick one side and edit the merged batch via the existing edit-batch flow.
- **Reorder merged steps.** Step order follows the LCS-aligned diff. User can reorder via edit afterward.
- **"Pick all from A" / "Pick all from B" bulk buttons.** Convenient but adds UI surface; user can flip rows individually for now.
- **Conflict markers in `step.uses`.** If A and B both have the same step text but different `uses`, today's `stepObjectDiff` (LCS on text) marks it as `ctx` and we keep A's `uses`. We don't surface this as a conflict. Acceptable for MVP because step `uses` are usually consistent when step text is consistent.
- **Auto-detect "rename" conflicts.** Today an ingredient renamed in B (different `name`, same `id`) shows as `mod` (correct). An ingredient deleted in A and re-added with a different id in B shows as `rem` + `add` (the user must resolve both). No fancy rename detection.

## 10. Migration

No data migration. Existing merged batches stay valid; the change is purely UI + the `onSubmit` payload shape. The merge page never persists pick state — it builds the result on submit and discards the picks.
