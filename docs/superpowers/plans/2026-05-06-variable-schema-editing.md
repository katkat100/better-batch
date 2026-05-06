# Variable Schema Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Add an `Edit Variables` modal launched from the recipe detail header that lets the user add/rename/remove/edit a recipe's variable schema, persisted via the existing `PATCH /api/recipes/{id}` endpoint.

**Architecture:** Backend already supports schema migration (`migrateBatchVariables` runs server-side on PATCH). New work is purely UI: an `EditVariablesDialog.svelte` modal, an `Edit Variables` trigger button on the recipe header, and a `patchRecipe` method in the API client.

**Tech Stack:** Svelte 5 runes · TypeScript · Tailwind v4 · `bun:test` · Playwright

Reference spec: `docs/superpowers/specs/2026-05-06-variable-schema-editing.md`.

---

## File Structure

```
src/lib/ui/
  api-client.ts                     # MODIFIED: add patchRecipe
  EditVariablesDialog.svelte        # NEW: the modal
src/routes/recipes/[id]/
  +page.svelte                      # MODIFIED: trigger button + dialog mount
tests/e2e/
  edit-variables.e2e.ts             # NEW: end-to-end coverage
```

---

## Task 1: `patchRecipe` in API client

**Files:**
- Modify: `src/lib/ui/api-client.ts`

- [ ] **Step 1: Add `patchRecipe` to the `api` object**

In `src/lib/ui/api-client.ts`, immediately after the `deleteRecipe` method (before the closing `}` of the `api` object), add:

```ts
  async patchRecipe(id: string, patch: Partial<Recipe>): Promise<Recipe> {
    return jsonOrThrow(await fetch(`/api/recipes/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    }));
  },
```

(Note: `Recipe` is already imported on line 1.)

- [ ] **Step 2: Verify svelte-check passes**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 3: Commit (controller)**

```bash
git add src/lib/ui/api-client.ts
git commit -m "feat(api-client): patchRecipe"
```

---

## Task 2: `EditVariablesDialog` component

**Files:**
- Create: `src/lib/ui/EditVariablesDialog.svelte`

This dialog edits a working copy of the recipe's variable schema. On Save it issues `PATCH /api/recipes/{id}` and calls `onSaved` so the parent can refresh.

- [ ] **Step 1: Create the component file**

Create `src/lib/ui/EditVariablesDialog.svelte` with this exact content:

```svelte
<!-- src/lib/ui/EditVariablesDialog.svelte -->
<script lang="ts">
  import type { VariableSchemaItem, VariableType } from '$lib/server';
  import { api } from '$lib/ui/api-client';
  import { untrack } from 'svelte';

  let {
    open = $bindable(false),
    recipeId,
    schema,
    onSaved
  }: {
    open?: boolean;
    recipeId: string;
    schema: VariableSchemaItem[];
    onSaved: () => Promise<void> | void;
  } = $props();

  type Row = { name: string; unit: string; type: VariableType; originalType: VariableType | null; confirming: boolean };

  function toRows(s: VariableSchemaItem[]): Row[] {
    return s.map(v => ({ name: v.name, unit: v.unit, type: v.type, originalType: v.type, confirming: false }));
  }

  let rows = $state<Row[]>(untrack(() => toRows(schema)));
  let submitting = $state(false);
  let serverError = $state<string | null>(null);

  $effect(() => {
    if (open) {
      rows = toRows(schema);
      serverError = null;
    }
  });

  const trimmedNames = $derived(rows.map(r => r.name.trim()));
  const emptyNameIdx = $derived(trimmedNames.findIndex(n => n === ''));
  const duplicateNames = $derived.by(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const n of trimmedNames) {
      const key = n.toLowerCase();
      if (key === '') continue;
      if (seen.has(key)) dups.add(key);
      seen.add(key);
    }
    return dups;
  });
  const canSave = $derived(!submitting && emptyNameIdx === -1 && duplicateNames.size === 0);

  function isDuplicate(i: number): boolean {
    const key = trimmedNames[i].toLowerCase();
    if (key === '') return false;
    return duplicateNames.has(key) && trimmedNames.findIndex(n => n.toLowerCase() === key) !== i;
  }

  function addRow() {
    rows = [...rows, { name: '', unit: '', type: 'number', originalType: null, confirming: false }];
  }

  function startRemove(i: number) {
    rows = rows.map((r, idx) => idx === i ? { ...r, confirming: true } : r);
  }
  function cancelRemove(i: number) {
    rows = rows.map((r, idx) => idx === i ? { ...r, confirming: false } : r);
  }
  function confirmRemove(i: number) {
    rows = rows.filter((_, idx) => idx !== i);
  }

  function close() {
    open = false;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!canSave) return;
    submitting = true;
    serverError = null;
    try {
      const next: VariableSchemaItem[] = rows.map(r => ({
        name: r.name.trim(),
        unit: r.unit.trim(),
        type: r.type
      }));
      await api.patchRecipe(recipeId, { variableSchema: next });
      await onSaved();
      close();
    } catch (err) {
      serverError = err instanceof Error ? err.message : 'Failed to save';
    } finally {
      submitting = false;
    }
  }

  function backdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !submitting) close();
  }
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && !submitting && close()} />

{#if open}
  <div
    class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-50"
    onclick={backdropClick}
    onkeydown={(e) => e.key === 'Escape' && !submitting && close()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="edit-variables-dialog-title"
    tabindex="-1"
  >
    <form
      onsubmit={save}
      class="bg-canvas border border-obsidian p-6 w-full max-w-2xl flex flex-col gap-4 rounded-sm max-h-[90vh] overflow-auto"
      data-testid="edit-variables-dialog"
    >
      <div>
        <h2 id="edit-variables-dialog-title" class="font-serif text-xl">Edit Variables</h2>
        <p class="text-sm text-obsidian/60 mt-1">Changes apply to all batches in this recipe.</p>
      </div>

      {#if serverError}
        <p class="text-ochre text-sm" data-testid="edit-variables-error">{serverError}</p>
      {/if}

      <div class="flex flex-col gap-2">
        {#each rows as row, i (i)}
          <div
            class="flex flex-col gap-1 border border-drafting/50 p-2 rounded-sm"
            data-testid="var-edit-row"
          >
            {#if row.confirming}
              <div class="flex items-center justify-between gap-2 text-sm">
                <span>Remove "{row.name.trim() || '(unnamed)'}"?</span>
                <div class="flex gap-2">
                  <button
                    type="button"
                    onclick={() => confirmRemove(i)}
                    class="border border-ochre text-ochre px-2 py-1 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm"
                    data-testid="var-remove-confirm"
                  >Confirm</button>
                  <button
                    type="button"
                    onclick={() => cancelRemove(i)}
                    class="px-2 py-1 text-xs text-obsidian/60 hover:text-obsidian"
                    data-testid="var-remove-cancel"
                  >Cancel</button>
                </div>
              </div>
            {:else}
              <div class="flex gap-2 items-center">
                <input
                  bind:value={row.name}
                  placeholder="Name"
                  class="flex-1 border border-drafting bg-canvas px-2 py-1 rounded-sm text-sm"
                  data-testid="var-name"
                />
                <input
                  bind:value={row.unit}
                  placeholder="Unit"
                  class="w-24 border border-drafting bg-canvas px-2 py-1 rounded-sm text-sm font-mono"
                  data-testid="var-unit"
                />
                <select
                  bind:value={row.type}
                  class="border border-drafting bg-canvas px-2 py-1 rounded-sm text-sm"
                  data-testid="var-type"
                >
                  <option value="number">number</option>
                  <option value="text">text</option>
                </select>
                <button
                  type="button"
                  onclick={() => startRemove(i)}
                  aria-label="Remove variable"
                  class="text-obsidian/50 hover:text-ochre px-2"
                  data-testid="var-remove"
                >×</button>
              </div>
              {#if row.name.trim() === ''}
                <p class="text-ochre text-xs">Name is required.</p>
              {:else if isDuplicate(i)}
                <p class="text-ochre text-xs">Duplicate name.</p>
              {/if}
              {#if row.originalType !== null && row.type !== row.originalType}
                <p class="text-obsidian/60 text-xs">Existing values may not parse cleanly under the new type.</p>
              {/if}
            {/if}
          </div>
        {/each}
      </div>

      <button
        type="button"
        onclick={addRow}
        class="border border-dashed border-drafting text-obsidian/60 hover:text-ochre hover:border-ochre px-3 py-2 text-sm rounded-sm"
        data-testid="add-variable-btn"
      >+ Add Variable</button>

      <div class="flex justify-end gap-2 pt-2 border-t border-drafting">
        <button
          type="button"
          onclick={close}
          disabled={submitting}
          class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian"
          data-testid="edit-variables-cancel"
        >Cancel</button>
        <button
          type="submit"
          disabled={!canSave}
          class="border border-ochre {canSave ? 'bg-ochre text-canvas' : 'text-ochre opacity-50'} px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:cursor-not-allowed rounded-sm"
          data-testid="edit-variables-submit"
        >{submitting ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </form>
  </div>
{/if}
```

- [ ] **Step 2: Verify svelte-check passes**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 3: Commit (controller)**

```bash
git add src/lib/ui/EditVariablesDialog.svelte
git commit -m "feat(ui): EditVariablesDialog component"
```

---

## Task 3: Wire `Edit Variables` button into recipe page

**Files:**
- Modify: `src/routes/recipes/[id]/+page.svelte`

The recipe header currently has a single `Delete Recipe` button. Add an `Edit Variables` button next to it (to the left), and mount the dialog at the bottom of the page.

- [ ] **Step 1: Add the import**

In `src/routes/recipes/[id]/+page.svelte`, find the existing imports near the top of the `<script lang="ts">` block. After the `import ConfirmDeleteDialog from '$lib/ui/ConfirmDeleteDialog.svelte';` line, add:

```ts
  import EditVariablesDialog from '$lib/ui/EditVariablesDialog.svelte';
  import { invalidateAll } from '$app/navigation';
```

- [ ] **Step 2: Add the dialog state**

In the same script block, find `let deleteDialogOpen = $state(false);`. Immediately after that line, add:

```ts
  let editVarsOpen = $state(false);
```

- [ ] **Step 3: Add the trigger button**

Find the Delete Recipe button block in the header:

```svelte
      <button
        type="button"
        onclick={() => deleteDialogOpen = true}
        class="border border-ochre text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm"
        data-testid="delete-recipe-btn"
      >Delete Recipe</button>
```

Insert this button **immediately before** it:

```svelte
      <button
        type="button"
        onclick={() => editVarsOpen = true}
        class="border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-ochre hover:text-ochre rounded-sm"
        data-testid="edit-variables-btn"
      >Edit Variables</button>
```

- [ ] **Step 4: Mount the dialog**

At the bottom of the file, find the existing `<ConfirmDeleteDialog ... />` block. **Immediately before** it, add:

```svelte
<EditVariablesDialog
  bind:open={editVarsOpen}
  recipeId={data.recipe.id}
  schema={data.recipe.variableSchema}
  onSaved={() => invalidateAll()}
/>
```

- [ ] **Step 5: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200, no errors in `/tmp/bb-dev.log`.

- [ ] **Step 6: Run unit suite — confirm no regressions**

Run: `~/.bun/bin/bun test`
Expected: 91 pass.

- [ ] **Step 7: Run svelte-check**

Run: `~/.bun/bin/bun x svelte-check --threshold warning 2>&1 | tail -3`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 8: Commit (controller)**

```bash
git add src/routes/recipes/\[id\]/+page.svelte
git commit -m "feat(ui): Edit Variables trigger and dialog mount on recipe page"
```

---

## Task 4: E2E coverage

**Files:**
- Create: `tests/e2e/edit-variables.e2e.ts`

The test creates a recipe (using the `bread` preset which seeds a known schema), opens the Edit Variables dialog, exercises add/rename/remove, saves, and asserts the recipe page reflects the new schema.

- [ ] **Step 1: Read an existing E2E to copy setup boilerplate**

Run: `~/.bun/bin/bun x ls tests/e2e/`

Expected files include `edit-batch.e2e.ts` and `foundation.e2e.ts`. Read `tests/e2e/edit-batch.e2e.ts` to see the exact boilerplate (test data clearing, recipe creation flow). Reuse it verbatim — the test below assumes the same `clearTestData` helper / `BB_DATA_DIR` setup pattern.

- [ ] **Step 2: Create the test file**

Create `tests/e2e/edit-variables.e2e.ts`. Use the **same imports, `test.beforeEach`, and recipe-creation boilerplate** as `edit-batch.e2e.ts` (so test isolation matches). Below is the *test body* — paste it inside a `test('edit variables: add, rename, remove', async ({ page }) => { ... })` block, after the boilerplate creates a recipe (preset `bread`) and lands on `/recipes/<id>`:

```ts
  // Open the Edit Variables dialog
  await page.getByTestId('edit-variables-btn').click();
  await expect(page.getByTestId('edit-variables-dialog')).toBeVisible();

  // Snapshot current row count
  const rowsBefore = await page.getByTestId('var-edit-row').count();
  expect(rowsBefore).toBeGreaterThan(0);

  // Rename the first variable
  const firstName = page.getByTestId('var-edit-row').nth(0).getByTestId('var-name');
  await firstName.fill('renamed_var');

  // Add a new variable
  await page.getByTestId('add-variable-btn').click();
  const newRow = page.getByTestId('var-edit-row').nth(rowsBefore);
  await newRow.getByTestId('var-name').fill('new_var');
  await newRow.getByTestId('var-unit').fill('g');

  // Remove the second-original variable (index 1) via inline confirm
  await page.getByTestId('var-edit-row').nth(1).getByTestId('var-remove').click();
  await page.getByTestId('var-edit-row').nth(1).getByTestId('var-remove-confirm').click();

  // Save
  await page.getByTestId('edit-variables-submit').click();
  await expect(page.getByTestId('edit-variables-dialog')).toBeHidden();

  // Re-open and assert persisted state: renamed_var present, new_var present, original index-1 gone
  await page.getByTestId('edit-variables-btn').click();
  const names = page.getByTestId('var-name');
  const allNames = await names.evaluateAll(els => (els as HTMLInputElement[]).map(e => e.value));
  expect(allNames).toContain('renamed_var');
  expect(allNames).toContain('new_var');
  expect(allNames.length).toBe(rowsBefore); // -1 removed +1 added = same total
```

```ts
  // Validation: empty name disables save
  await page.getByTestId('var-edit-row').nth(0).getByTestId('var-name').fill('');
  await expect(page.getByTestId('edit-variables-submit')).toBeDisabled();
  await page.getByTestId('var-edit-row').nth(0).getByTestId('var-name').fill('renamed_var');

  // Validation: duplicate name disables save
  await page.getByTestId('var-edit-row').nth(1).getByTestId('var-name').fill('renamed_var');
  await expect(page.getByTestId('edit-variables-submit')).toBeDisabled();

  // Cancel discards changes
  await page.getByTestId('edit-variables-cancel').click();
  await expect(page.getByTestId('edit-variables-dialog')).toBeHidden();
```

- [ ] **Step 3: Run the new E2E test in isolation first**

Run: `~/.bun/bin/bun run e2e -- tests/e2e/edit-variables.e2e.ts`
Expected: 1 passed.

- [ ] **Step 4: Run the full E2E suite — confirm no regressions**

Run: `~/.bun/bin/bun run e2e`
Expected: 6 passed (5 prior + 1 new).

- [ ] **Step 5: Run unit suite**

Run: `~/.bun/bin/bun test`
Expected: 91 pass.

- [ ] **Step 6: Commit (controller)**

```bash
git add tests/e2e/edit-variables.e2e.ts
git commit -m "test(e2e): cover Edit Variables add/rename/remove flow"
```

---

## Self-review notes

**Spec coverage:**
- Spec §3 (trigger) → Task 3 Step 3 (button on recipe header — note: spec said "menu item in `…`"; recipe header has no `…` menu, only a `Delete Recipe` button, so we add a sibling button instead. Same UX outcome.)
- Spec §4 layout (header + body rows + footer with `+ Add Variable` and Cancel/Save) → Task 2 Step 1
- Spec §4 variable row (name, unit, type, ×) → Task 2 Step 1
- Spec §4 remove confirmation (inline `Remove "{name}"? · Confirm · Cancel`) → Task 2 Step 1 `{#if row.confirming}` branch
- Spec §4 type change warning → Task 2 Step 1 (`row.originalType !== null && row.type !== row.originalType`)
- Spec §4 validation (empty + duplicate names disable Save) → Task 2 Step 1 (`canSave` derived)
- Spec §4 save flow (PATCH + close + invalidate) → Task 2 Step 1 `save()` + Task 3 Step 4 `onSaved={() => invalidateAll()}`
- Spec §4 a11y (role="dialog", aria-modal, aria-labelledby, tabindex=-1, Escape, backdrop click) → Task 2 Step 1
- Spec §5 (server already runs `migrateBatchVariables` on PATCH) → no change required, exists at `src/routes/api/recipes/[id]/+server.ts:22-32`
- Spec §6 (out of scope: presets, reorder, bulk) → no tasks
- Spec §7 (E2E for add/rename/remove + cancel discards) → Task 4

**Type consistency:**
- `VariableSchemaItem` shape `{ name: string; unit: string; type: 'number' | 'text' }` matches `src/lib/server/domain/types.ts`
- `api.patchRecipe(id, patch: Partial<Recipe>)` matches existing `Partial<Recipe>` accepted by `PATCH /api/recipes/[id]`
- `data-testid` names referenced in Task 4 (`edit-variables-btn`, `edit-variables-dialog`, `var-edit-row`, `var-name`, `var-unit`, `var-type`, `var-remove`, `var-remove-confirm`, `var-remove-cancel`, `add-variable-btn`, `edit-variables-cancel`, `edit-variables-submit`) all defined in Task 2/3.

**Risks:**
- Bread preset's variable order is assumed stable for the E2E (we rename index 0 and remove index 1). If it changes, update test indices — not a logic risk.
- `invalidateAll()` is the existing project pattern for refreshing server-loaded `data` after a mutation; if a different mechanism is used elsewhere, swap to match.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-06-variable-schema-editing.md`. 4 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Fresh subagent per task, two-stage review.
**2. Inline Execution** — Same session, batched checkpoints.

**Which approach?**
