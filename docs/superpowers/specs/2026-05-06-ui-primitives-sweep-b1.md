# UI Primitives Sweep — Plan B-1: NewRecipeDialog + Forms + Page chrome

**Date:** 2026-05-06
**Status:** Draft, pending implementation plan
**Builds on:** `2026-05-06-ui-primitives.md` (Plan A — primitives layer + 5 dialog migrations)

## 1. Overview

Sweep hand-rolled `<button>`/`<input>`/`<select>` elements in non-dialog and one-missed-dialog files to use the existing `Button` / `TextInput` / `Select` / `Dialog` primitives at `src/lib/ui/primitives/`. No new primitives, no new variants — purely a mechanical migration following the rules established in Plan A.

This spec covers **Plan B-1**: `NewRecipeDialog`, forms (`BatchEditor`, `UsesEditor`), and page chrome (`BatchDetail`, `Toolbar`, home route, recipe route). **Plan B-2** (cook view + compare/merge surfaces) is deferred to a separate spec.

## 2. Files in scope

### Dialog
- `src/lib/ui/NewRecipeDialog.svelte` — missed in Plan A's dialog list. Migrate it the same way (Dialog + Button + TextInput + Select).

### Forms / editors
- `src/lib/ui/BatchEditor.svelte` — heaviest file (~18 form elements). Variable-value inputs, ingredient rows (amount/unit/name/section), step rows (text via textarea — leave raw), `+ Add` buttons, `× Remove`, reorder `▲▼`, section selects.
- `src/lib/ui/UsesEditor.svelte` — per-step ingredient-use selector and amount input.

### Page chrome
- `src/lib/ui/BatchDetail.svelte` — recipe-level batch detail: overflow `…` menu (button + items), Compare/Merge action buttons, Mark Cooked/Edit Outcome triggers.
- `src/lib/ui/Toolbar.svelte` — home-page tag and sort filter chrome.
- `src/routes/+page.svelte` — home page `+ New Recipe` trigger.
- `src/routes/recipes/[id]/+page.svelte` — recipe header `Edit Variables` / `Delete Recipe` buttons (added in earlier work).

### Out of scope for B-1
- `src/lib/ui/NotecardCard.svelte` — pure display, no form elements.
- All cook view files (`src/lib/ui/cook/*` not already migrated) — Plan B-2.
- All compare/merge files (`CompareView`, `MergePicker`, `MergeIngredientRow`, `MergeStepRow`, `MergeVarRow`) — Plan B-2.
- `VariableTile`, `VariableDiffTable` — read-only, no interactive elements that need migration.

## 3. Migration rules (restated from Plan A)

1. **Replace** plain `<input type="text">` (and similar text inputs) with `<TextInput>`. Pass `bind:value`, `placeholder`, `disabled`, `inputmode`, etc. through. Use the `class` prop to layer extra utility classes.
2. **Replace** `<select>` with `<Select>`. Keep `<option>` children verbatim.
3. **Replace** `<button>` with `<Button>` per variant table:
   - `border border-ochre bg-ochre text-canvas hover:...` → `variant="primary"`
   - `border border-ochre text-ochre hover:bg-ochre hover:text-canvas` → `variant="outline"`
   - `border border-juniper text-juniper hover:bg-juniper ...` → `variant="success"`
   - `text-obsidian/60 hover:text-obsidian` (no border) → `variant="ghost"`
   - `border border-dashed border-drafting ...` → `variant="dashed"`
4. **Leave raw:**
   - `<textarea>` (out of scope of primitives layer per Plan A spec §10).
   - Icon-only buttons (`×`, `▲`, `▼`, `+` glyphs) — Button primitive is sized for text labels.
   - `<input type="checkbox">`, `<input type="radio">`, `<input type="number">` if used for narrow widget purposes (e.g., quantity steppers) — not text-style fields.
   - Unique-shape buttons (FAB, circular, ribbon dots) — none expected in B-1's file list, but if discovered, leave raw and report.
5. **Preserve every `data-testid`, `aria-label`, `id`, `for`, `name` attribute exactly.** The E2E suite anchors on these.
6. **Don't touch unrelated logic.** Only swap the visual primitives. Validation, state, callbacks, layout containers stay as-is.

## 4. Sizing the work

Element count per file (existing `<button>`/`<input>`/`<select>`/`<textarea>` count, including those that will stay raw):

- `NewRecipeDialog.svelte` — 6
- `BatchEditor.svelte` — 18
- `UsesEditor.svelte` — 4
- `BatchDetail.svelte` — 8
- `Toolbar.svelte` — 4
- `+page.svelte` (home) — 1
- `recipes/[id]/+page.svelte` — 2

Total: 43 elements across 7 files. The plan should produce one task per file.

## 5. Task ordering

Recommend this order in the plan:

1. `NewRecipeDialog.svelte` — warm-up, reuses the proven dialog pattern.
2. `+page.svelte` (home) — single button, trivial.
3. `recipes/[id]/+page.svelte` — two buttons, trivial.
4. `Toolbar.svelte` — small.
5. `UsesEditor.svelte` — small.
6. `BatchDetail.svelte` — medium.
7. `BatchEditor.svelte` — largest, last so all variant decisions are validated by earlier work.

This order is small-first to build confidence and surface variant-classification questions early.

## 6. Testing

- **No new tests written.** The existing E2E suite (`tests/e2e/`) covers every interactive surface in scope: home page navigation, new-recipe flow, batch creation/editing (ingredients + steps + uses + reorder), batch detail menu actions, edit-variables, mark-cooked. After each task: full E2E + svelte-check + unit must stay green.
- **Manual visual check after each task.** Open the affected page, click through the migrated buttons, confirm no visual regression.
- **Stable test counts:** 91 unit, 6 E2E, 0/0 svelte-check throughout.

## 7. Out of scope

- Plan B-2 (cook view + compare/merge).
- New primitives (no `Textarea`, `IconButton`, `Checkbox`).
- New variants — `success`/`primary`/`outline`/`ghost`/`dashed`/`danger` cover everything in B-1.
- Visual redesign — output should look identical to current state.
- Any non-migration refactor (don't restructure components, don't extract sub-components, don't change file boundaries).

## 8. Risks

- **`BatchEditor` complexity:** 18 elements with custom width/padding overrides (`flex-1`, `w-24`, `px-2 py-1`). Class-prop overrides need to compose cleanly with primitive defaults. Mitigation: migrate `BatchEditor` last, test each row type (ingredient, step, variable) in the browser, and lean on the existing `edit-batch.e2e.ts` flow which exercises every row type.
- **Variant misclassification:** if a hand-rolled button doesn't match any variant cleanly (rare in B-1's files, but possible), leave it raw and explicitly flag it in the task report. Don't force a near-match.
- **Overflow menu items in `BatchDetail`:** the `…` menu items are `<button>` elements with ghost-like styling. They likely fit `variant="ghost"` cleanly, but if the menu has hover/focus styles the variant doesn't capture, leave them raw and document.
