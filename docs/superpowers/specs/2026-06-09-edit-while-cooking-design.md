# Edit-while-cooking

**Status:** Design approved 2026-06-09.
**Owner:** Katie.
**Builds on:** [Cook view (2026-05-05)](./2026-05-05-cook-view.md), [Cook multiplier persistence (2026-05-14)](./2026-05-14-cook-multiplier-persistence-design.md), [Background timer notifications (2026-05-21)](./2026-05-21-background-timer-notifications-design.md), [Batch editor mobile (2026-05-07)](./2026-05-07-batch-editor-mobile.md).

## Summary

Let the user edit a recipe **while cooking it**, without losing any cooking
state. The cook view holds a **working copy** of the batch content
(label, variables, ingredients, steps). An **edit-mode toggle** in the top
bar flips the ingredients + steps sections into editable rows; toggling off
returns the clean checklist with checkmarks and timers intact. Edits never
mutate the batch on disk during the cook — they **auto-save to the device**
(survives reload / app-kill) and, at **End Cook**, materialize as a **new
forked draft** (`parentIds: [original]`). The original batch is still
recorded as cooked, with its content unchanged. This is the "always-fork"
model: the batch you cooked stays as the record of what you set out to do,
and your edits become the refined next version.

## Motivation

Today the cook view treats the loaded batch as immutable. The only way to
capture changes is the quick-note FAB, which records free-text ideas that
can later fork into a draft — there's no way to actually fix a wrong amount
or adjust a step *as you discover it mid-cook*. Cooks routinely deviate from
the plan ("that needed 45 min not 40", "I used 12g salt"). Capturing those
as structured edits — while still checking steps and running timers — turns
the cook session itself into the authoring surface for the next version,
which is exactly the lineage model the app is built around.

## Decisions resolved during design

1. **Where edits go — fork, not in place.** Edits author a new draft batch;
   the cooked batch is preserved. (Chosen over editing in place, and over
   the "contextual" model where drafts edit in place.)
2. **Applies uniformly, including first cooks.** Even cooking a brand-new
   draft for the first time, edits land in a *separate* new draft and the
   original draft is recorded as-cooked with its planned content. Faithful
   to the fork model; no special-casing by batch status.
3. **Interaction — an edit-mode toggle**, not inline tap-to-edit and not a
   full-screen editor sheet. Full structural editing, kept inside the cook
   screen, with cook state visibly preserved underneath.
4. **In-progress edits auto-save to the device** and restore on return.
   Nothing reaches the batch list until End Cook.
5. **Reuse over duplication.** The editing UI is extracted from
   `BatchEditor` into shared components so there is one source of truth.

## Behavior

### Working copy

`CookView` gains a working copy of the editable batch content, deep-cloned
from the `batch` prop on init:

```ts
let draft = $state<{
  label: string;
  variables: Record<string, VariableValue>;
  ingredients: Ingredient[];
  steps: Step[];
}>(/* structuredClone of batch fields, or restored session */);
```

All cook rendering reads `draft` instead of `batch`: `CookIngredients` gets
`draft.ingredients`/`draft.steps`, `CookStepList` gets `draft.steps`, and the
derived `currentStepIndex`, `activeTimerKeys`, and End-Cook step counts all
key off `draft.steps`. The `batch` prop stays the immutable original — used
only for dirty-detection and for its own outcome record at End Cook.

`isDirty` is a `$derived` structural comparison of the cleaned working copy
against the original batch's `{label, variables, ingredients, steps}`.

### Edit-mode toggle & scope

`CookTopBar` gains an **Edit** toggle (and a small "● edited" indicator once
`isDirty`). When `editing` is on, the ingredients + steps sections render as
editable rows (the checkboxes and inline timer triggers are replaced by edit
fields); the top bar, timer dock, and quick-note FAB stay available, and any
running timers keep ticking. Toggling off restores the checklist instantly.

**Editable:** the fork's label, variables (values), ingredients
(name / amount / unit / section, add / remove / reorder), steps (text, ingredient
links, add / remove / reorder).
**Not exposed:** batch `status` (the fork is always a draft), recipe
variable *schema* (values only), and Paste Recipe (out of scope for v1).

### Cooking features survive structural edits

Editing step **text** or ingredient **amounts** never disturbs progress.
**Structural** step edits remap cook state so a checkmark stays attached to
its step:

| Operation        | `checkedSteps` (Set\<number\>)            | timers (`stepIndex`)                          |
|------------------|-------------------------------------------|-----------------------------------------------|
| add / insert at `i` | indices `>= i` shift +1; new step unchecked | indices `>= i` shift +1                        |
| remove `i`       | drop `i`; indices `> i` shift −1          | `=== i` → becomes standalone (`-1`); `> i` −1  |
| move `from→to`   | apply the same permutation to each index  | apply the same permutation to `stepIndex`      |

A running timer attached to a deleted step is **not** cancelled — it becomes
a standalone timer (`stepIndex = -1`) so it keeps counting in the dock.
Ingredient highlighting in `CookIngredients` is keyed by ingredient **id**
(stable slug), so amount/name edits and reorders don't disturb it; removing
an ingredient also strips any step `uses` that referenced it (same rule as
`BatchEditor.removeIngredient`).

### Auto-save & restore (device-local)

A new module `src/lib/ui/cook/cook-session.ts` persists the session to
`localStorage` under `bb:cook:v1:<recipeId>:<batchId>`:

- **Saved:** working copy (`label`, `variables`, `ingredients`, `steps`),
  `started`, `startedAt`, `checkedSteps` (as array), `quickNotes`,
  `multiplier`, and `timers` (the full `DockTimer[]`; they're wall-clock
  based off `startedAt`/`pausedAccumMs`, so they restore accurately).
- **When:** a `$effect` in `CookView` writes on any change to the above
  (lightly debounced). `localStorage` is the right home — this is ephemeral
  UI/session state, separate from the recipe data store.
- **Restore:** on mount, if a session exists for this exact `recipeId+batchId`
  it replaces the fresh-from-batch initialization, and notifications are
  re-armed for any still-running timers (re-`scheduleTimerNotification` with
  remaining time). If none exists, the working copy initializes from `batch`.
- **Clear:** on a successful End Cook (after the API writes resolve).

If the underlying batch changed on disk while a session was suspended, the
restored working copy (the user's in-progress edits) wins — we do not
attempt to reconcile against disk.

### End Cook reconciliation

`EndCookDialog` + `handleEndCookSubmit` become dirty-aware:

- **Original batch — always recorded as cooked.** `api.patchBatch(recipe.id,
  batch.id, buildEndCookPatch(...))` exactly as today (status / cookedAt /
  duration / rating / outcome notes / multiplier). Its ingredients and steps
  are untouched.
- **If `isDirty` — create the fork.** `api.createBatch(recipe.id, …)` from
  the **cleaned** working copy: `parentIds: [batch.id]`, `status: 'draft'`,
  the edited `variables`/`ingredients`/`steps`, `label` from the dialog
  (default `improvements from <label>`), and `outcomeNotes` carrying the
  captured quick notes (the same block built today). Navigate to the fork.
- **If not dirty — unchanged from today**, including the optional
  "carry quick notes into a new batch" checkbox path.

The dialog, when `isDirty`, replaces the standalone "carry these ideas"
checkbox with an **"Edits → new version"** panel: a one-line change summary
(e.g. "2 steps changed · 1 ingredient added"), the fork-label field, and a
note that the original is recorded as cooked. Quick notes still ride into
the fork's `outcomeNotes`.

Content cleaning (drop empty-named ingredients, keep only valid `uses`, trim
step text) is the rule already in `BatchEditor.doSave`; it is extracted to a
shared `cleanBatchContent()` so the fork path and the editor use one
implementation. Inconsistencies (sum-mismatch / unreferenced) are computed
silently via the existing `validateBatch` and recorded as the fork's
`inconsistencyNote` following the existing convention — **no blocking
dialog** interrupts the End-Cook flow (the fork is a draft; fix later).

### Shared-editor extraction

To avoid two divergent editors, the heavy editing UI is extracted from
`BatchEditor.svelte` into reusable components, which both `BatchEditor` and
the cook edit panel render:

- `src/lib/ui/IngredientEditor.svelte` — the ingredients fieldset: rows with
  move up/down, name/amount/unit inputs, section select (incl. "+ New
  section" prompt), the stable-id assignment effect, and optional validation
  highlight props (`sumMismatchIds`, `unreferencedIds`,
  `showUnreferencedHighlights`) that default to empty so cook mode can omit
  them.
- `src/lib/ui/StepEditor.svelte` — the steps fieldset: rows with move
  up/down, the text `textarea`, and the existing `UsesEditor` (already
  standalone).

`BatchEditor` is refactored to compose these (its label, status radio, Paste
Recipe, validation/inconsistency dialog, and submit/navigation stay put).
Pure helpers shared by both surfaces move to `src/lib/ui/layout/batch-content.ts`:
`cleanBatchContent()`, `evalVariableExpression()` / `nextVariables()`
(today's `setVariable`/`evalVariableOnBlur` logic), and `isContentDirty()`.
The variables grid + label in cook edit mode are rendered inline by a new
`src/lib/ui/cook/CookEditPanel.svelte` (which also hosts `IngredientEditor`
+ `StepEditor`), reusing those helpers — no logic duplication.

**Refactor safety:** all `data-testid`s and DOM structure in the extracted
markup are preserved verbatim so `BatchEditor`'s existing e2e/unit coverage
(`edit-batch`, `ingredient-inconsistency`, `paste-recipe`, `reorder-rows`,
multiplier) stays green.

## Files touched

**New:**
- `src/lib/ui/IngredientEditor.svelte` — extracted ingredients editor.
- `src/lib/ui/StepEditor.svelte` — extracted steps editor.
- `src/lib/ui/cook/CookEditPanel.svelte` — cook edit-mode panel (label +
  variables grid + `IngredientEditor` + `StepEditor`).
- `src/lib/ui/cook/cook-session.ts` — localStorage save/load/clear +
  Set↔array (de)serialization, keyed by recipe+batch.
- `src/lib/ui/cook/layout/remap-cook-state.ts` — pure functions remapping
  `checkedSteps` and timer `stepIndex` under add/remove/move.
- `src/lib/ui/layout/batch-content.ts` — `cleanBatchContent`,
  `evalVariableExpression`/`nextVariables`, `isContentDirty`.

**Modified:**
- `src/lib/ui/cook/CookView.svelte` — working copy + `editing` state;
  structural-edit handlers calling the remap helper; session autosave/restore
  + notification re-arm; dirty-aware End-Cook submit; pass `draft.*` to
  children.
- `src/lib/ui/cook/CookTopBar.svelte` — Edit toggle + "edited" indicator
  (new props: `editing`, `onToggleEdit`, `isDirty`).
- `src/lib/ui/cook/EndCookDialog.svelte` — dirty-aware "new version" panel,
  fork-label field, change summary; merge with quick-notes recap.
- `src/lib/ui/BatchEditor.svelte` — consume `IngredientEditor` +
  `StepEditor`; use shared `batch-content.ts` helpers.

`end-cook-patch.ts` is unchanged (it still builds only the original's
outcome patch); the fork-input assembly lives in `CookView`/a small helper.

## Testing

**Unit (`bun test`):**
- `tests/ui/cook/remap-cook-state.test.ts` — add/insert, remove (incl.
  removing a checked step and a timer-bearing step), and move, asserting the
  table above for both `checkedSteps` and timer `stepIndex`.
- `tests/ui/cook/cook-session.test.ts` — save → load round-trip, Set↔array,
  version-key isolation, batch-id mismatch returns nothing, clear.
- `tests/ui/cook/batch-content.test.ts` — `cleanBatchContent` (empty-name
  drop, invalid-use drop, step trim), `isContentDirty` true/false cases,
  variable-expression eval.

**e2e (`bun run e2e`):**
- `tests/e2e/cook-edit.e2e.ts` — start cook → toggle Edit → change a step's
  text, add an ingredient, add and reorder a step → toggle off and confirm
  checkmarks track the right steps → reload the page and confirm the session
  restores (edits + checks) → End Cook → assert a new draft fork exists with
  the edits (parent = original) and the original is recorded as cooked with
  its planned content.
- Re-run `edit-batch`, `ingredient-inconsistency`, `paste-recipe`,
  `reorder-rows`, `cook` to verify the `BatchEditor` extraction is a no-op
  for existing behavior.

## Migration

None. No data-model changes — the fork is an ordinary `Batch` created
through the existing `createBatch`/`patchBatch` paths. Cook sessions live
only in `localStorage` under a versioned key (`v1`); a future shape change
bumps the version and silently ignores old blobs.

## Out of scope

- Paste Recipe inside cook edit mode.
- A blocking inconsistency dialog during End Cook (fork is a draft).
- Editing the recipe's variable *schema* or batch `status` mid-cook.
- Cross-device sync of in-progress sessions (device-local only).
- Reconciling a restored session against a batch edited elsewhere on disk.
- The "contextual" model (first-cook edits in place) — explicitly rejected
  in favor of uniform fork.

## Open questions

None at design approval time.
