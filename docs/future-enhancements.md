# Future Enhancements

Items deliberately excluded from the MVP. Captured here so they don't get lost.

## From the original design spec (`specs/2026-05-04-better-batch-design.md` §10)

- **Photos per batch.** File handling subsystem; storage layout already supports an optional `photos/` folder per batch.
- **Export / import.** Manual folder copy works today; a UI flow for share/import would be nice.
- **Multi-user, auth, sync.** Local-only is the spec; cloud comes later.
- **Cloud DB.** Same.
- **Named branches as moving pointers.** Today, batch labels and the DAG cover the use case. Named branches like git would add a "rename / delete branch" surface.
- **Variable history charts beyond the home-page sparkline.** A per-recipe chart panel showing how each variable evolved across cooked batches.
- **Public sharing / publish view.** Read-only public URL per recipe.
- **Real `git init` integration of the data folder.** The flat-file storage layout is already friendly to this; we just don't ship the integration.
- **Mobile-specific layouts.** Desktop-first today; the layouts shouldn't break on tablet but no phone optimization.

## From the batch-editing amendment (`specs/2026-05-04-batch-editing-amendment.md` §6)

- **Drag-to-reorder steps or ingredients.** Use add/remove for now.
- **Bulk rename of ingredient sections.** Edit each ingredient's section field directly today.
- **Auto-suggest amounts from prior batches.** When linking an ingredient to a step, pre-fill the amount from how previous batches used it.
- **Inline highlight of ingredient names in step text.** We get structured uses instead — better signal-to-noise — but the visual cue could still be useful.
- **Shopping-list export.** Aggregate all ingredients from a batch (or selected batches) into a printable list.

## From compare & merge (`plans/2026-05-05-better-batch-compare-merge.md`)

- **Per-row ingredient merging in the merge picker.** Today: whole-list radio (A | B). The original spec wanted clickable rows where you pick individual ingredients/steps from either parent. The user can refine via the existing edit-batch flow afterward, but a true per-row picker would be a nice upgrade.
- **Shift-click two nodes in `BatchGraph` to enter compare/merge mode.** Today: "Compare with…" / "Merge with…" dropdown buttons. Shift-click would be a faster gesture for power users.
- **Cross-step over-allocation warning.** Removed when we made the per-step allocation indicator local to its own step. A panel at the top of the steps fieldset that shows global over-allocation across all steps would catch the "100g flour, 60g in step 1, 60g in step 3" mistake.
- **Click-outside-to-dismiss on `BatchPickerDropdown`.** Today the popover closes only on selection or by toggling the same button.

## Polish backlog

- **Auto-ID rename affordance for ingredients.** Ingredient IDs are stable for the lifetime of the row. If a user wants to rename an ID (e.g. they typo'd "bread-folour"), there's no UI for it; they'd have to delete and re-add (which loses step.uses references).
- **Better diff resilience for renamed ingredients.** `ingredientDiff` matches by `id`. If a user renames an ingredient row in batch B (changing its `id`), the diff sees it as `rem` + `add` rather than `mod`. Acceptable today; revisit if it becomes annoying.
- **Variable schema editing UI.** Today schemas are set at recipe creation by the preset and aren't editable via the UI (the API supports PATCH with migration; we just don't surface it). Add a small "edit schema" panel on the recipe page.
- **Empty-state polish.** Some empty states are bare (e.g. "No ingredients recorded.") and could be more inviting.
