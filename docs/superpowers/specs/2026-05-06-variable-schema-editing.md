# Variable Schema Editing

**Date:** 2026-05-06
**Status:** Draft, pending implementation plan

## 1. Overview

Lets the user add, rename, remove, and edit variables on an existing recipe via an `Edit Variables` modal launched from the recipe detail page's `…` overflow menu. Changes are saved by `PATCH /api/recipes/{id}` with a new `variableSchema`; the server already runs `migrateBatchVariables` to carry values forward across all batches.

This addresses the limitation that presets were previously the only source of a recipe's schema and were read-only after creation.

## 2. Background

The backend already supports schema editing:
- `PATCH /api/recipes/[id]` accepts `variableSchema` in the body and runs `migrateBatchVariables` on every batch.
- `migrateBatchVariables` (in `src/lib/server/domain/schema.ts`) handles add (new fields default to null), remove (drops the value), and rename (detected by index-pairing — same position, different name carries the value).

Only the UI is missing.

## 3. Trigger

A new item in the existing `…` overflow menu on the recipe detail header (`BatchDetail.svelte` or wherever the menu lives on the recipe page):

- Label: `Edit Variables`
- `data-testid="edit-variables-btn"`
- Click closes the menu and opens `EditVariablesDialog`.

## 4. Modal — `EditVariablesDialog.svelte`

### Layout

- Backdrop (fixed, black/40, click-outside-to-cancel) wrapping a centered card.
- Card structure:
  - **Header:** `Edit Variables` title + subtitle `Changes apply to all batches in this recipe.`
  - **Body:** a vertical list of variable rows.
  - **Footer:** `+ Add Variable` (dashed-ghost button, full-width), then a right-aligned `Cancel` / `Save Changes` pair.

### Variable row

A horizontal row per variable:
- **Name** input (text). `data-testid="var-name"`.
- **Unit** input (text, optional). `data-testid="var-unit"`.
- **Type** select (`number` | `text`). `data-testid="var-type"`.
- **Remove** button (`×` glyph). `data-testid="var-remove"`.

`data-testid="var-edit-row"` on the row wrapper.

Reorder is **out of scope** for this iteration — variables stay in their original order; new ones append.

### Remove confirmation

When the user clicks `×` on a row, the row enters an inline confirm state: the row contents are replaced (or overlaid) with `Remove "{name}"? · Confirm · Cancel`. Clicking `Confirm` deletes the row from the working list; `Cancel` returns to edit state. No nested modal.

### Type change warning

If the user changes a row's type from `number` → `text` (or vice versa) on an existing variable, show an inline note under the row: `Existing values may not parse cleanly under the new type.` The change is still allowed; this is informational only.

### Validation (client-side, blocks Save)

- Names must be non-empty after trimming.
- Names must be unique within the schema.

If invalid, show an inline error on the offending row(s) and disable `Save Changes`.

### Save flow

1. Working state is a copy of the recipe's current `variableSchema`.
2. `Save Changes` issues `PATCH /api/recipes/{id}` with `{ variableSchema: <working list> }`.
3. On success, close the modal and refresh the page state (existing pattern: `invalidateAll()` or equivalent the page already uses for recipe edits).
4. On error, surface the server message at the top of the modal body and keep it open.

### A11y / keyboard

Follow the project's existing dialog pattern (matching `ConfirmDeleteDialog.svelte`):
- `role="dialog"` + `aria-modal="true"` + `aria-labelledby` on the outer wrapper.
- `tabindex="-1"` and `onkeydown` on the wrapper to handle `Escape` → cancel.
- Backdrop click (only when `e.target === e.currentTarget`) cancels.
- Initial focus moves to the first name input (or `+ Add Variable` if the list is empty).

## 5. Server behavior (existing — confirm, don't change)

- `PATCH /api/recipes/[id]` with `variableSchema` triggers `migrateBatchVariables` over every batch.
- Rename detection is **index-based**: index `i` keeps its value when the name at index `i` changes. This is why the UI must not reorder rows during edit — reordering would be misread as multiple renames.

## 6. Out of scope

- **Feature B — saved/reusable presets** (custom user templates). Tracked separately.
- Reordering variable rows in the editor.
- Bulk operations (multi-select, copy from another recipe).
- Per-batch schema overrides — schema remains a recipe-level concept.
- Editing schema during recipe creation flow (creation already uses preset selection; this dialog is for *existing* recipes).

## 7. Testing

- **Unit:** none new — `migrateBatchVariables` is already covered. Validation logic (duplicate-name, empty-name) is small and exercised via E2E.
- **E2E (`tests/e2e/edit-batch.e2e.ts` or new `tests/e2e/edit-variables.e2e.ts`):**
  - Open recipe detail, click `…` menu, click `Edit Variables`.
  - Add a variable, save, assert it shows in the batch editor's variable inputs and on the variable tiles.
  - Rename a variable; assert existing batch's value carried over (still rendered in the tile under the new name).
  - Remove a variable; assert it disappears from tiles and editor.
  - Cancel button discards changes.

## 8. Risks

- **Index-based rename ambiguity:** if the user removes a row *and* renames another in one save, the index pairing may misattribute. Mitigation: the UI saves the entire schema atomically — `migrateBatchVariables` already handles the (remove, rename) combo by walking new indices and matching by name first, falling back to position. This was validated when the migration helper was written; no new logic needed.
- **Type change data corruption:** changing `number` → `text` is harmless (numbers stringify fine). `text` → `number` may leave non-numeric strings that won't parse — variables that don't parse are kept as-is and surface as strings in the UI. The inline warning is sufficient; no auto-coercion.
- **Concurrent edits:** single-user app; not a concern.
