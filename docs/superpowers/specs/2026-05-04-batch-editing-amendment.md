# Better Batch — Batch Editing Amendment

**Date:** 2026-05-04
**Status:** Draft, pending implementation plan
**Amends:** `2026-05-04-better-batch-design.md`

## 1. Overview

This amendment introduces four user-requested capabilities:

1. **Edit-in-place** — update a draft batch's contents without forking. Cooked and archived batches remain frozen for ingredients/steps/variables; their `outcomeNotes` and `rating` stay editable.
2. **Step → ingredient links** — under each step, render the specific ingredients (and amounts) that step uses.
3. **Optional ingredient sections** — group ingredients (e.g. "Levain", "Final Dough", "Topping") with no requirement for recipes that don't need it.
4. **Per-step ingredient splitting** — allocate portions of a single master-list ingredient across multiple steps (e.g. "100g flour" total → 50g in step 1, 50g in step 3).

These are tightly linked: #2 and #4 both require associating each step with structured ingredient amounts, so they share a single data model change.

## 2. Domain model changes

### `Ingredient`
Two new fields, one required, one optional:

```ts
export interface Ingredient {
  id: string;          // NEW: stable slug, unique within batch
  name: string;
  amount: string;      // unchanged: free text ("100", "1/2", "to taste")
  unit: string;
  section?: string;    // NEW: optional grouping label
}
```

- `id` is a slug derived from `name` (using existing `slugify`/`uniqueSlug`), unique within the batch's ingredient list.
- `id` is stable: once assigned, it doesn't change when the user renames the ingredient. (UI may offer a "rename ID" affordance later; out of scope for MVP.)
- `section` is a free-text label. Empty / undefined means "no section." Render order in the UI follows first-occurrence order in the array.

### `Step` becomes structured

```ts
export interface IngredientUse {
  ingredientId: string;   // references Ingredient.id within this batch
  amount: number;         // structured numeric (UI parses fractions on input)
}

export interface Step {
  text: string;
  uses: IngredientUse[];  // empty array = no specific allocation
}
```

`Batch.steps` changes from `string[]` to `Step[]`.

- `IngredientUse.amount` is a number. The input field accepts fractions ("1/2", "0.25"), numeric ("50"), or absolute portions of the master amount ("half" — but we *don't* support text portions for MVP; only numeric and fraction). Parsed to a number on blur.
- `IngredientUse` does not carry `unit` — it inherits from the master `Ingredient.unit`.
- Sum-validation is client-side only: the editor displays a soft warning when sum-of-uses exceeds master amount, but never blocks saving.

## 3. Storage migration

Read-time migration in `src/lib/server/storage/batches.ts::readBatch`:

- For each ingredient without an `id`: assign `slugify(name)` with `uniqueSlug` against IDs already assigned in the same ingredient list. Deterministic per file.
- For each ingredient without a `section`: leave undefined.
- For each step that's a string: replace with `{ text: <string>, uses: [] }`.

The migration runs every read (idempotent — re-migrating already-migrated data is a no-op). No batch script. No write-time migration needed; the next save writes the new shape regardless.

`IndexEntry` is unchanged. No index rebuild required for the migration itself.

A unit test must confirm that loading a legacy-shape JSON file (handcrafted in the test) produces a correctly-structured Batch object, and that re-reading after writing produces an identical structure.

## 4. UI changes

### 4.1 BatchEditor

Three additions, all in `src/lib/ui/BatchEditor.svelte`:

**Sections.** Each ingredient row gains a section dropdown plus a "+ New section" affordance that prompts inline for a section name. Visually, ingredients are grouped under section headers (small uppercase Drafting Ink labels with hairline rules). Storage stays a flat array.

**Auto-generated IDs.** When a new ingredient row is added, the editor assigns `id = uniqueSlug(slugify(name))` once — at the moment the user finishes typing the name (input blur, or first time amount is touched, whichever comes first). After that, the ID is permanent for the lifetime of that row. Renaming the ingredient later does not regenerate the ID, ensuring step `uses` references stay valid. Manual ID editing is not exposed in the UI for MVP.

**Per-step ingredient picker.** Each step row gains a sub-section under its text:
- "Ingredients used" header with a "+ Add" affordance.
- Each existing use renders as `[ingredient name dropdown] [amount input] [×]`.
- Add → dropdown lists all batch ingredients, showing `name (section)` and remaining unallocated amount per ingredient.
- Amount input parses fractions on blur ("1/2" + master 100 → store 50). Numeric and decimal inputs are obvious.
- Remove (×) deletes the use and frees the allocation.
- Below the list of all step uses, a per-ingredient summary line: `"50/100g flour, 50/50g water"` summed across every step. Over-allocation rows render in `text-ochre`.

If `BatchEditor.svelte` exceeds ~250 lines, split the per-step picker into a new `UsesEditor.svelte` component.

### 4.2 BatchDetail / IngredientList / StepsList

**`IngredientList.svelte`** renders by section. Uncategorized ingredients first under no header; then each section in first-seen order, headed by a small uppercase label and a hairline rule. Existing row format unchanged.

**`StepsList.svelte`** receives the batch's master `ingredients` array as a prop. For each step:
- Renders the step's text as today.
- If `step.uses.length > 0`, renders a footer line listing each use as `<amount><master.unit> <ingredient.name>`, separated by `·`. Styled `text-xs font-mono text-obsidian/60`.
- If `uses` is empty, no footer rendered.

### 4.3 BatchDetail action bar

On draft batches, the action bar gains an "Edit" outline button next to "Mark as Cooked":
- Border `border-drafting`, text `text-obsidian`, label `Edit`.
- Links to `/recipes/[id]/batches/[batchId]/edit`.
- Hidden on `cooked` and `archived` batches.

On cooked batches, an "Edit outcome" button replaces "Mark as Cooked" (which is no longer applicable). Clicking it re-opens `OutcomeForm` pre-filled with current `outcomeNotes` and `rating`. Reuses the existing component — only the button-entry-point and the form's submit (PATCH `outcomeNotes` + `rating`, leave `status` as-is) need adjusting.

## 5. Edit route + API behavior

### 5.1 New route

**`src/routes/recipes/[id]/batches/[batchId]/edit/`**

- `+page.server.ts` loads the recipe and the specific batch. 404 on either missing. If `batch.status !== 'draft'`, redirect to `/recipes/[id]` (the entry-point button is hidden on non-drafts; the redirect handles hand-typed URLs).
- `+page.svelte` wraps `BatchEditor` in `mode='edit'`.

### 5.2 BatchEditor mode flag

`BatchEditor.svelte` gains a `mode: 'create' | 'edit'` prop:
- `'create'` (default) — POSTs to `/api/recipes/[id]/batches`. (Existing behavior.)
- `'edit'` — PATCHes `/api/recipes/[id]/batches/[batchId]` with the changed fields, then navigates back to the detail page on success.

Page heading changes ("New batch" / "Edit V3"). Form fields and validation are identical between modes.

### 5.3 API: PATCH rules

`PATCH /api/recipes/:id/batches/:batchId` (existing endpoint) gains rules:

- If the existing batch's `status` is `cooked` or `archived`, the patch is rejected with HTTP 403 if it includes any of: `ingredients`, `steps`, `variables`, `label`, `parentIds`. Patches that only modify `outcomeNotes` and/or `rating` (and optionally `status` for archive transitions) are allowed.
- For drafts: every `ingredientId` referenced inside any `step.uses` must exist in the batch's `ingredients` array. Returns 400 with `{ error: "Step N references unknown ingredient 'foo'" }` if not.
- Sum-of-uses against master amount is **not** server-validated. The editor surfaces over-allocation warnings; the server accepts the data either way.

## 6. Out of scope

- Drag-to-reorder steps or ingredients.
- Bulk rename of ingredient sections.
- Auto-suggest amounts from prior batches.
- Inline highlighting of ingredient names in step text (we get structured uses instead).
- Shopping-list export.
- Schema migration of `Step` shape into recipe-level `variableSchema` (variables and ingredients remain separate concepts).

## 7. Testing

- **Unit:** legacy-shape ingestion (no `id`, no `section`, string steps) produces a valid Batch object with deterministic IDs and `{ text, uses: [] }` steps. Round-trip read→write→read is identity.
- **Unit:** PATCH validation — referential integrity check, 403 for cooked-batch ingredient/step changes, 200 for cooked-batch outcome-only patches.
- **Unit:** ingredient-section rendering on `IngredientList` (snapshot-style: given an ingredients array with three sections, the rendered structure has three section headers in correct order).
- **Unit:** per-step uses rendering on `StepsList`.
- **E2E:** new spec at `tests/e2e/edit-batch.e2e.ts`:
  1. Create a recipe, record a draft V1 with two sections, two ingredients per section, three steps with split allocations.
  2. Click Edit on the draft, modify a section name and a step's allocation, save.
  3. Verify changes persist and the detail page re-renders correctly.
  4. Mark the batch as cooked.
  5. Verify the Edit button is now hidden, but the Edit-outcome path works for notes/rating.
- The existing `foundation.e2e.ts` continues to pass unchanged (it never used sections or uses).

## 8. Risks

- **Editor file growth.** `BatchEditor.svelte` is already substantial. If the per-step uses picker pushes it past ~250 lines, split it into `UsesEditor.svelte` during implementation — flagged in the plan, not deferred.
- **Migration on every read.** Cheap (small files, in-memory transforms) but worth a single targeted test for the legacy-shape pathway and an idempotence assertion.
- **PATCH 403 surface.** The frontend won't trigger this in normal flow (Edit button hidden, route redirects), but a hand-typed URL or stale cache could. The error needs a graceful fallback in the editor — show the message and route back.
