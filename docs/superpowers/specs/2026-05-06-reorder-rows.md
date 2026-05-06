# Reorder Ingredient & Step Rows

**Date:** 2026-05-06
**Status:** Draft, pending implementation plan
**Amends:** `2026-05-04-batch-editing-amendment.md` §6 (was: "Drag-to-reorder steps or ingredients" was out of scope)

## 1. Overview

Lets the user reorder ingredient rows and step rows in `BatchEditor` via per-row up/down arrow buttons. No drag-and-drop in this iteration — arrows only — to keep parity across desktop and touch and avoid pulling in a DnD library.

The existing read-only surfaces (`IngredientList` on `BatchDetail`, `StepsList`, cook view) already render in array order, so no rendering changes are needed beyond editing.

## 2. Pure helper

New file `src/lib/shared/array.ts` exports a single function:

```ts
export function moveItem<T>(arr: T[], from: number, to: number): T[];
```

Returns a new array with `arr[from]` moved to position `to`. Returns the original array (no-op) when:
- `from === to`
- Either index is negative
- Either index is `>= arr.length`

Pure, immutable, TDD-able.

## 3. BatchEditor changes

### Ingredient row
Prepend a vertical two-button stack to each row, positioned before the amount input. Buttons:
- `▲` — `aria-label="Move ingredient {i+1} up"`. `disabled` when `i === 0`.
- `▼` — `aria-label="Move ingredient {i+1} down"`. `disabled` when `i === ingredients.length - 1`.

Click handlers: `ingredients = moveItem(ingredients, i, i - 1)` / `i + 1`.

Style: small thin buttons (~14px tall × 18px wide), Drafting Ink stroke, Ochre on hover. Use `▲`/`▼` glyphs at small font-size so they read as chevrons, not bulky triangles. Disabled state: `opacity-30 cursor-not-allowed`.

### Step row
Same pattern. Same testid namespace (`reorder-up-btn` / `reorder-down-btn`) but scoped via the `step-edit-row` parent.

### Layout impact
Both row containers gain an extra small column on the left. Use a fixed-width wrapper (`w-5`) so the arrow stack doesn't flex, and the rest of the row layout is preserved.

## 4. Reordering semantics

**Ingredients:** position in the master array changes. Section grouping is still computed by first-occurrence (existing logic in `IngredientList`), so:
- Moving a row within its section group: trivial reorder.
- Moving a row across section boundaries: may shift the order in which section groups render (the section's first-occurrence position changes). This is predictable and desired — if the user wants the "Topping" section to render before "Final Dough", they move a Topping ingredient above all Final Dough ones.

**Steps:** purely positional. `step.uses` reference ingredients by id, so reordering doesn't break the use links. Step indices in cook view (`step 1`, `step 2`, ...) reflect the new positions.

## 5. Surfaces unchanged

- `IngredientList.svelte` (BatchDetail's read-only display) — no change. Renders in array order.
- `StepsList.svelte` — no change.
- `CookIngredients.svelte`, `CookStepList.svelte`, `CookStepRow.svelte` — no change. They already iterate in array order.
- API and storage — no change. Order has always been preserved as-stored.

## 6. Out of scope

- Drag-and-drop reorder
- Reorder UI in cook view (cook is read-only)
- Reorder of `step.uses` rows inside a step (i.e., within `UsesEditor`) — only step-level and ingredient-level reorder. Sub-row reorder is rarely needed and YAGNI.
- Bulk move / select-multiple-then-move
- Keyboard shortcut (e.g., Cmd+↑/↓) — keyboard tabs to the buttons; that's enough.

## 7. Testing

- **Unit (`tests/shared/move-item.test.ts`):** moveItem(arr, from, to) — same position no-op, out-of-bounds, normal moves, first→last, last→first.
- **E2E (extend `tests/e2e/edit-batch.e2e.ts`):** add a few rows, click the arrow on a middle ingredient row to move it up; assert the order in `data-testid="ingredient-edit-row"` reflects the move. Same for a step row.

## 8. Risks

- **Mobile horizontal space:** arrow column eats ~22px of row width. Existing inputs (amount/unit/name) are already cramped. Mitigation: use thin glyphs and tight column. If it's still too cramped, polish pass can move arrows to the right side or collapse them into a pop-out menu.
- **Many-row cases:** 30+ ingredient rows make tap-by-tap reorder tedious. This is the trade-off vs. drag. Acceptable for MVP; drag is a future polish.
