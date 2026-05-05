# Better Batch — Delete & Cook-Confirm Amendment

**Date:** 2026-05-05
**Status:** Draft, pending implementation plan
**Amends:** `2026-05-04-better-batch-design.md`, `2026-05-04-batch-editing-amendment.md`

## 1. Overview

Three small enhancements after MVP shipped:

1. **Delete a recipe** — heavyweight, typed-confirmation flow because deleting a recipe wipes all its batches and history.
2. **Delete a batch** — lightweight Yes/Cancel; blocked when the batch has children to keep the version graph intact.
3. **Cook-freeze warning** — banner inside `OutcomeForm` (cook mode only) that explains the batch will be frozen so the user understands the consequence before submitting.

## 2. Delete a recipe

### Entry point
Small destructive button in the recipe detail page header, opposite the recipe title:
- Label: `Delete Recipe`
- Style: `border border-ochre text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm`
- `data-testid="delete-recipe-btn"`

### Confirmation
Modal (`ConfirmDeleteDialog` component, `mode="typed"`):
- Title: `Delete <recipe.name>?`
- Body: "This permanently deletes the recipe and all N batches. This can't be undone. Type the recipe name to confirm."
- Text input. Match is case-sensitive after `trim()`. Submit button disabled until match.
- Buttons: `Cancel` (text), `Delete Recipe` (Ochre filled when match is exact).

### Action
- DELETE `/api/recipes/:id` (existing endpoint).
- On success: `goto('/')`. Home grid auto-rebuilds the index via existing pathways.
- On error: surface inline error in the dialog.

## 3. Delete a batch

### Entry point
Append to `BatchDetail`'s action bar, after existing actions:
- Label: `Delete`
- Style: same as Delete Recipe button
- `data-testid="delete-batch-btn"`
- Disabled when the focused batch has children. Tooltip via `title` attribute: `Delete child batches first ({n} child{ren})`.

### Computing children locally
The recipe page already loads `data.batches`. `BatchDetail` receives `batches: Batch[]`. Children = `batches.filter(b => b.parentIds.includes(batch.id))`. Compute via `$derived`.

### Confirmation
`ConfirmDeleteDialog`, `mode="simple"`:
- Title: `Delete <batch.id>?`
- Body: `Permanently deletes this batch. This can't be undone.`
- Buttons: `Cancel`, `Delete Batch`.

### Action
- DELETE `/api/recipes/:id/batches/:batchId` (existing endpoint, with new server-side child check below).
- On success: call `invalidateAll()`. The recipe page re-fetches, the deleted batch is gone, and `selected` falls back to `data.recipe.currentBatchId ?? data.batches[0]?.id ?? null`. If the deleted batch *was* the current pointer, the storage layer's PATCH below clears it.

### API change

`DELETE /api/recipes/:id/batches/:batchId` (in `src/routes/api/recipes/[id]/batches/[batchId]/+server.ts`):

1. Read all batches in the recipe.
2. If any batch has `params.batchId` in its `parentIds`, return `409 Conflict` with body `{ error: "Cannot delete: <n> child batches reference this one" }`.
3. Otherwise, proceed with delete (existing behavior).
4. After delete, if the parent recipe's `currentBatchId === params.batchId`, PATCH the recipe to set `currentBatchId: null` so the next read doesn't dangle.
5. Rebuild index (existing).

The client never triggers the 409 (button is disabled), but the server enforces it as a backstop — matches the spirit of `parentIds` referential integrity already enforced on POST/PATCH.

## 4. ConfirmDeleteDialog component

`src/lib/ui/ConfirmDeleteDialog.svelte` — single component, two modes.

```ts
interface Props {
  open: boolean;            // bindable
  title: string;
  body: string;
  confirmLabel: string;     // e.g. "Delete Recipe"
  mode: 'simple' | 'typed';
  typedMatch?: string;      // required when mode === 'typed' — exact string user must type
  onConfirm: () => Promise<void> | void;
}
```

Behavior:
- Renders only when `open === true`.
- Backdrop click closes.
- Escape closes.
- In `'typed'` mode: text input + the confirm button stays disabled until `input.trim() === typedMatch`.
- During `onConfirm`'s promise, button shows `Deleting…` and is disabled.
- Errors thrown from `onConfirm` are caught and surfaced as a small Ochre line under the body.

`data-testid` attributes:
- `confirm-delete-dialog` on the form
- `confirm-delete-input` on the typed-mode input
- `confirm-delete-submit` on the confirm button
- `confirm-delete-cancel` on the cancel button

## 5. Cook-freeze banner

Modify `src/lib/ui/OutcomeForm.svelte`. When `mode === 'cook'`, render a banner above the textarea:

```svelte
{#if mode === 'cook'}
  <div class="border border-ochre bg-ochre/10 text-ochre p-3 rounded-sm text-sm" data-testid="cook-warning">
    <strong class="block">This will freeze the batch.</strong>
    <span class="opacity-90">Only outcome notes and rating will remain editable. Use Cancel to keep the batch as a draft.</span>
  </div>
{/if}
```

When `mode === 'edit'` (editing an existing cooked batch's outcome), the banner is hidden — already past the freeze point.

No API change. No new component. No state changes.

## 6. Out of scope

- Toast notifications for successful delete (the destination change *is* the feedback; we have no toast infrastructure yet).
- Soft-delete / undo. Deletes are permanent.
- Bulk delete (e.g. select multiple batches in the graph and delete together).
- Deleting cooked batches has no special treatment beyond the simple confirm — they're already a record of fact, but if the user wants to remove one (typo recipe, accidental cook), they should be able to.
- Archive-as-soft-delete is unaffected — `archived` status is its own thing, separate from delete.

## 7. Testing

- **Unit:** API endpoint returns 409 when a batch has children; succeeds otherwise. Recipe.currentBatchId is cleared if it pointed at the deleted batch.
- **Unit:** No new pure-function tests needed; `ConfirmDeleteDialog` is presentational.
- **E2E (`tests/e2e/delete.e2e.ts`):**
  1. Create a recipe with two batches in a chain (V1 → V2).
  2. Try to delete V1 (parent) — button is disabled, tooltip mentions children.
  3. Delete V2 (leaf) via simple confirm. Lands back on detail page; only V1 remains.
  4. Delete the recipe via typed confirm. Lands on home; recipe is gone from the grid.
- The existing E2E suites continue to pass unchanged.

## 8. Risks

- **Stale `BatchDetail` `batches` prop after delete.** `invalidateAll()` re-runs the loader and re-renders with fresh data; the children-derived state recomputes automatically. Verify in E2E.
- **Server 409 vs client UI mismatch.** The client should never trigger 409 because the button is disabled, but if there's a stale render or race, a 409 surfaces gracefully through the dialog's error line.
- **Delete-during-cook flows.** If a user opens the cook form on a draft, then deletes the batch in another tab, the form's PATCH on submit would 404. Acceptable for a single-user local app — no concurrency model to worry about.
