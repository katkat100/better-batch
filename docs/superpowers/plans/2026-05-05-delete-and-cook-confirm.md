# Delete & Cook-Confirm Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **User preference:** No auto-commits. Implementer subagents leave changes unstaged; the controller commits after spec review with explicit user approval.

**Goal:** Add UI flows for deleting recipes and batches (with appropriate friction for each) and add a freeze warning banner to the cook-form so users understand what marking-as-cooked means.

**Architecture:** Server-side: DELETE batch endpoint gains a referential-integrity check (block when children exist) and clears the recipe's `currentBatchId` if it pointed at the deleted batch. UI side: one new `ConfirmDeleteDialog` component covers both delete flows via a `mode: 'simple' | 'typed'` prop. The cook banner is a small presentational addition inside `OutcomeForm`.

**Tech Stack:** SvelteKit (Svelte 5 runes) · Bun · TypeScript · Tailwind v4 · `bun:test` · Playwright

Reference: spec at `docs/superpowers/specs/2026-05-05-delete-and-cook-confirm.md`.

---

## File Structure

```
src/
  lib/
    ui/
      api-client.ts                                       # MODIFIED: add deleteRecipe, deleteBatch
      ConfirmDeleteDialog.svelte                          # NEW: simple + typed modes
      BatchDetail.svelte                                  # MODIFIED: Delete button + dialog wiring
      OutcomeForm.svelte                                  # MODIFIED: cook-freeze banner
  routes/
    api/recipes/[id]/batches/[batchId]/+server.ts         # MODIFIED: DELETE checks children + clears currentBatchId
    recipes/[id]/+page.svelte                              # MODIFIED: Delete Recipe button + dialog

tests/
  api/
    batches.test.ts                                       # MODIFIED: add 409-on-children + currentBatchId-cleared tests
  e2e/
    delete.e2e.ts                                         # NEW
```

---

## Task 1: API DELETE batch — block on children, clear currentBatchId

**Files:**
- Modify: `src/routes/api/recipes/[id]/batches/[batchId]/+server.ts`
- Modify: `tests/api/batches.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the bottom of the existing `describe('batches api', () => { ... })` block in `tests/api/batches.test.ts`:

```ts
  it('rejects DELETE when batch has children (409)', async () => {
    await recipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) } as any);
    const v1 = await (await listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) } as any)).json();
    await listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'tweak', parentIds: [v1.id], status: 'draft' }) } as any);

    const { DELETE: oneDELETE } = await import('../../src/routes/api/recipes/[id]/batches/[batchId]/+server');
    await expect(
      oneDELETE({ params: { id: 'a', batchId: v1.id } } as any)
    ).rejects.toMatchObject({ status: 409 });
  });

  it('clears recipe.currentBatchId when the deleted batch was current', async () => {
    await recipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) } as any);
    const v1 = await (await listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'initial', parentIds: [], status: 'draft' }) } as any)).json();

    const { readRecipe } = await import('../../src/lib/server/storage/recipes');
    const before = await readRecipe('a');
    expect(before.currentBatchId).toBe(v1.id); // POST batch sets currentBatchId

    const { DELETE: oneDELETE } = await import('../../src/routes/api/recipes/[id]/batches/[batchId]/+server');
    await oneDELETE({ params: { id: 'a', batchId: v1.id } } as any);

    const after = await readRecipe('a');
    expect(after.currentBatchId).toBe(null);
  });

  it('preserves currentBatchId when deleting a different batch', async () => {
    await recipesPOST({ request: reqJSON({ name: 'A', preset: 'custom', tags: [] }) } as any);
    const v1 = await (await listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'one', parentIds: [], status: 'draft' }) } as any)).json();
    const v2 = await (await listPOST({ params: { id: 'a' }, request: reqJSON({ label: 'two', parentIds: [], status: 'draft' }) } as any)).json();
    // v2 was just created; recipe.currentBatchId should now be v2.id
    const { readRecipe } = await import('../../src/lib/server/storage/recipes');
    expect((await readRecipe('a')).currentBatchId).toBe(v2.id);

    const { DELETE: oneDELETE } = await import('../../src/routes/api/recipes/[id]/batches/[batchId]/+server');
    await oneDELETE({ params: { id: 'a', batchId: v1.id } } as any);

    expect((await readRecipe('a')).currentBatchId).toBe(v2.id);
  });
```

- [ ] **Step 2: Run, expect FAIL**

Run: `~/.bun/bin/bun test tests/api/batches.test.ts`
Expected: at least the first new test fails (DELETE doesn't currently 409 on children); the second may or may not fail depending on prior state, the third should pass already if currentBatchId logic is unchanged.

- [ ] **Step 3: Implement**

Replace the `DELETE` function in `src/routes/api/recipes/[id]/batches/[batchId]/+server.ts`. Find the existing `DELETE` near the bottom of the file and replace it with:

```ts
export async function DELETE({ params }) {
  const all = await listBatches(params.id);
  const hasChildren = all.some(b => b.parentIds.includes(params.batchId));
  if (hasChildren) {
    const n = all.filter(b => b.parentIds.includes(params.batchId)).length;
    throw error(409, `Cannot delete: ${n} child batch${n === 1 ? '' : 'es'} reference this one`);
  }

  await deleteBatch(params.id, params.batchId);

  // Clear currentBatchId if it pointed at the deleted batch
  try {
    const recipe = await readRecipe(params.id);
    if (recipe.currentBatchId === params.batchId) {
      await updateRecipe(params.id, { currentBatchId: null });
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') throw err; // recipe might already be gone in some edge case; ignore
  }

  await rebuildIndex();
  return new Response(null, { status: 204 });
}
```

This requires importing `listBatches`, `readRecipe`, `updateRecipe` at the top of the file. Open the file and ensure these imports exist. The current import list (`readBatch, updateBatch, deleteBatch, rebuildIndex`) needs to add the new ones:

```ts
import { readBatch, updateBatch, deleteBatch, rebuildIndex, listBatches, readRecipe, updateRecipe } from '../../../../../../lib/server/index.js';
```

- [ ] **Step 4: Run, expect PASS**

Run: `~/.bun/bin/bun test tests/api/batches.test.ts`
Expected: all batches API tests pass (existing 6 + 3 new = 9).

- [ ] **Step 5: Run full unit suite, confirm no regressions**

Run: `~/.bun/bin/bun test`
Expected: 67 pass (64 prior + 3 new).

- [ ] **Step 6: Commit (controller)**

```bash
git add 'src/routes/api/recipes/[id]/batches/[batchId]/+server.ts' tests/api/batches.test.ts
git commit -m "feat(api): DELETE batch blocks on children and clears currentBatchId"
```

---

## Task 2: API client wrappers for delete

**Files:**
- Modify: `src/lib/ui/api-client.ts`

- [ ] **Step 1: Add wrappers**

Open `src/lib/ui/api-client.ts`. Add two new methods to the exported `api` object:

```ts
  async deleteRecipe(id: string): Promise<void> {
    const res = await fetch(`/api/recipes/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
  },

  async deleteBatch(recipeId: string, batchId: string): Promise<void> {
    const res = await fetch(`/api/recipes/${recipeId}/batches/${batchId}`, { method: 'DELETE' });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`${res.status} ${res.statusText}: ${body}`);
    }
  }
```

These follow the existing `jsonOrThrow` pattern but adapted for 204 No Content (no body to parse).

- [ ] **Step 2: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

Expected: 200 + no errors in log.

- [ ] **Step 3: Run unit suite — confirm no regressions**

- [ ] **Step 4: Commit (controller)**

```bash
git add src/lib/ui/api-client.ts
git commit -m "feat(ui): api-client wrappers for deleteRecipe and deleteBatch"
```

---

## Task 3: ConfirmDeleteDialog component

**Files:**
- Create: `src/lib/ui/ConfirmDeleteDialog.svelte`

Single component, two modes (`simple` | `typed`). Used by both delete flows.

- [ ] **Step 1: Implement**

```svelte
<!-- src/lib/ui/ConfirmDeleteDialog.svelte -->
<script lang="ts">
  let {
    open = $bindable(false),
    title,
    body,
    confirmLabel,
    mode = 'simple',
    typedMatch = '',
    onConfirm
  }: {
    open?: boolean;
    title: string;
    body: string;
    confirmLabel: string;
    mode?: 'simple' | 'typed';
    typedMatch?: string;
    onConfirm: () => Promise<void> | void;
  } = $props();

  let typedInput = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  const canConfirm = $derived(
    !submitting && (mode === 'simple' || typedInput.trim() === typedMatch)
  );

  function close() {
    open = false;
    typedInput = '';
    error = null;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    submitting = true;
    error = null;
    try {
      await onConfirm();
      close();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete';
    } finally {
      submitting = false;
    }
  }
</script>

{#if open}
  <div
    class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-50"
    onclick={close}
    onkeydown={(e) => e.key === 'Escape' && close()}
    role="presentation"
  >
    <form
      onsubmit={submit}
      onclick={(e) => e.stopPropagation()}
      class="bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm"
      data-testid="confirm-delete-dialog"
    >
      <h2 class="font-serif text-xl">{title}</h2>
      <p class="text-sm whitespace-pre-wrap">{body}</p>

      {#if mode === 'typed'}
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-[11px] uppercase tracking-wider">Type to confirm</span>
          <input
            bind:value={typedInput}
            class="border border-drafting bg-canvas px-3 py-2 rounded-sm font-mono"
            data-testid="confirm-delete-input"
            autofocus
          />
        </label>
      {/if}

      {#if error}
        <p class="text-ochre text-sm" data-testid="confirm-delete-error">{error}</p>
      {/if}

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onclick={close}
          class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian"
          data-testid="confirm-delete-cancel"
        >Cancel</button>
        <button
          type="submit"
          disabled={!canConfirm}
          class="border border-ochre {canConfirm ? 'bg-ochre text-canvas' : 'text-ochre opacity-50'} px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:cursor-not-allowed rounded-sm"
          data-testid="confirm-delete-submit"
        >{submitting ? 'Deleting…' : confirmLabel}</button>
      </div>
    </form>
  </div>
{/if}
```

- [ ] **Step 2: Verify dev server compiles**

(Component is unreferenced; just confirm it parses.)

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

- [ ] **Step 3: Run unit suite**

- [ ] **Step 4: Commit (controller)**

```bash
git add src/lib/ui/ConfirmDeleteDialog.svelte
git commit -m "feat(ui): ConfirmDeleteDialog component (simple + typed modes)"
```

---

## Task 4: Delete Recipe button + flow

**Files:**
- Modify: `src/routes/recipes/[id]/+page.svelte`

Add a `Delete Recipe` button in the recipe header opposite the title; wire it through `ConfirmDeleteDialog` in typed mode.

- [ ] **Step 1: Update recipe page**

Read the current `src/routes/recipes/[id]/+page.svelte`. The script section currently imports `BatchGraph`, `BatchDetail`, `OutcomeForm`, types. Add imports + state + handler:

In the `<script>` block, add at the top with other imports:

```ts
import ConfirmDeleteDialog from '$lib/ui/ConfirmDeleteDialog.svelte';
import { api } from '$lib/ui/api-client';
```

(Keep the existing `goto` import; if not present, add `import { goto } from '$app/navigation';`.)

Add state and handler near the bottom of the script (after existing state declarations):

```ts
let deleteDialogOpen = $state(false);

async function handleDeleteRecipe() {
  await api.deleteRecipe(data.recipe.id);
  goto('/');
}
```

In the template, find the existing `<header class="flex items-end justify-between border-b border-drafting pb-3">` block. The right side currently shows tags. Replace the tags-only `{#if data.recipe.tags.length}` block with a flex container that holds tags AND the delete button:

```svelte
<header class="flex items-end justify-between border-b border-drafting pb-3">
  <div>
    <h1 class="font-serif text-3xl">{data.recipe.name}</h1>
    {#if data.recipe.description}
      <p class="text-sm text-obsidian/60 mt-1">{data.recipe.description}</p>
    {/if}
  </div>
  <div class="flex items-end gap-3">
    {#if data.recipe.tags.length}
      <div class="flex gap-1.5 text-[10px] uppercase tracking-wider text-obsidian/60">
        {#each data.recipe.tags as t}<span class="border border-drafting px-2 py-0.5 rounded-sm">{t}</span>{/each}
      </div>
    {/if}
    <button
      type="button"
      onclick={() => deleteDialogOpen = true}
      class="border border-ochre text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm"
      data-testid="delete-recipe-btn"
    >Delete Recipe</button>
  </div>
</header>
```

At the bottom of the file, after the existing `OutcomeForm` conditionals, add the dialog:

```svelte
<ConfirmDeleteDialog
  bind:open={deleteDialogOpen}
  title="Delete {data.recipe.name}?"
  body="This permanently deletes the recipe and all {data.batches.length} batch{data.batches.length === 1 ? '' : 'es'}. This can't be undone. Type the recipe name to confirm."
  confirmLabel="Delete Recipe"
  mode="typed"
  typedMatch={data.recipe.name}
  onConfirm={handleDeleteRecipe}
/>
```

- [ ] **Step 2: Verify dev server compiles + smoke test**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4

# Create a recipe and load its detail page
curl -s -X POST http://localhost:5173/api/recipes -H 'content-type: application/json' \
  -d '{"name":"DelTest","preset":"custom","tags":[]}' > /dev/null
curl -s -o /tmp/recipe.html -w "%{http_code}\n" http://localhost:5173/recipes/deltest
grep -q 'delete-recipe-btn' /tmp/recipe.html && echo "delete recipe button rendered"

pkill -f 'bun run dev'
rm -rf data/recipes data/index.json
```

Expected: 200 + "delete recipe button rendered".

- [ ] **Step 3: Run unit suite — confirm no regressions**

- [ ] **Step 4: Commit (controller)**

```bash
git add 'src/routes/recipes/[id]/+page.svelte'
git commit -m "feat(ui): Delete Recipe button with typed-confirmation dialog"
```

---

## Task 5: Delete Batch button + disabled-when-children logic

**Files:**
- Modify: `src/lib/ui/BatchDetail.svelte`

Add a `Delete` button in the action bar; show disabled state when the batch has children; wire to the simple `ConfirmDeleteDialog`.

- [ ] **Step 1: Update BatchDetail**

Open `src/lib/ui/BatchDetail.svelte`. Add imports near the top of the script:

```ts
import ConfirmDeleteDialog from './ConfirmDeleteDialog.svelte';
import { api } from './api-client';
import { invalidateAll } from '$app/navigation';
```

(`goto` is already imported.)

After the existing `let cookedDateLabel = ...` line, add:

```ts
const childCount = $derived(batches.filter(b => b.parentIds.includes(batch.id)).length);
const canDelete = $derived(childCount === 0);

let deleteOpen = $state(false);

async function handleDelete() {
  await api.deleteBatch(recipe.id, batch.id);
  await invalidateAll();
}
```

In the action bar (the `<div class="flex gap-2 items-start">`), append a new button after the existing ones — specifically, after the `{:else if batch.status === 'cooked'}` block but inside the same `<div>`:

```svelte
<button
  type="button"
  onclick={() => deleteOpen = true}
  disabled={!canDelete}
  title={canDelete ? '' : `Delete child batches first (${childCount} child${childCount === 1 ? '' : 'ren'})`}
  class="border border-ochre text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:opacity-40 disabled:cursor-not-allowed rounded-sm"
  data-testid="delete-batch-btn"
>Delete</button>
```

After the closing `</article>` tag (at the very end of the file), add the dialog:

```svelte
<ConfirmDeleteDialog
  bind:open={deleteOpen}
  title="Delete {batch.id}?"
  body="Permanently deletes this batch. This can't be undone."
  confirmLabel="Delete Batch"
  mode="simple"
  onConfirm={handleDelete}
/>
```

- [ ] **Step 2: Verify dev server compiles**

```bash
~/.bun/bin/bun run dev > /tmp/bb-dev.log 2>&1 &
sleep 4
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:5173/
pkill -f 'bun run dev'
```

- [ ] **Step 3: Run unit suite — confirm no regressions**

- [ ] **Step 4: Commit (controller)**

```bash
git add src/lib/ui/BatchDetail.svelte
git commit -m "feat(ui): Delete batch button with children check"
```

---

## Task 6: Cook-freeze banner

**Files:**
- Modify: `src/lib/ui/OutcomeForm.svelte`

Render an Ochre-bordered banner at the top of the form when `mode === 'cook'`.

- [ ] **Step 1: Add the banner**

Open `src/lib/ui/OutcomeForm.svelte`. Find the form element. The current structure has `<h2>` followed by the textarea label. Insert a banner between them, conditional on cook mode:

```svelte
<h2 class="font-serif text-xl">
  {mode === 'edit' ? `Edit outcome for ${batch.id}` : `Mark ${batch.id} as cooked`}
</h2>

{#if mode === 'cook'}
  <div class="border border-ochre bg-ochre/10 text-ochre p-3 rounded-sm text-sm" data-testid="cook-warning">
    <strong class="block">This will freeze the batch.</strong>
    <span class="opacity-90">Only outcome notes and rating will remain editable. Use Cancel to keep the batch as a draft.</span>
  </div>
{/if}

<label class="flex flex-col gap-1 text-sm">
  …
```

(Keep all existing form content unchanged; only insert the `{#if mode === 'cook'}` block.)

- [ ] **Step 2: Verify dev server compiles**

- [ ] **Step 3: Run unit suite**

- [ ] **Step 4: Commit (controller)**

```bash
git add src/lib/ui/OutcomeForm.svelte
git commit -m "feat(ui): cook-freeze warning banner in OutcomeForm"
```

---

## Task 7: E2E test for delete flows

**Files:**
- Create: `tests/e2e/delete.e2e.ts`

End-to-end:
1. Create a recipe with two batches in a parent-child chain.
2. Delete-batch button on the parent should be disabled (has children).
3. Delete the leaf via simple confirm.
4. Delete the recipe via typed confirm.

- [ ] **Step 1: Implement**

```ts
// tests/e2e/delete.e2e.ts
import { test, expect } from '@playwright/test';
import { clearTestData } from './helpers';

test.beforeEach(async () => { await clearTestData(); });

test('delete batch (with children check) and delete recipe (typed confirm)', async ({ page }) => {
  // Create recipe
  await page.goto('/');
  await page.getByTestId('new-recipe-btn').click();
  await page.getByTestId('new-recipe-name').fill('Delete Me');
  await page.getByTestId('new-recipe-dialog').locator('select').first().selectOption('custom');
  await page.getByTestId('new-recipe-submit').click();
  await expect(page).toHaveURL(/\/recipes\/delete-me/);

  // Record V1
  await page.getByRole('link', { name: '+ Record V1' }).click();
  await page.getByTestId('batch-label').fill('initial');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Record V2 from V1
  await page.getByTestId('new-batch-btn').click();
  await page.getByTestId('batch-label').fill('tweak');
  await page.getByTestId('batch-submit').click();
  await expect(page.getByTestId('batch-detail')).toBeVisible();

  // Select V1 (has a child) and verify Delete is disabled
  // Click the V1 node in the SVG graph
  await page.locator('[data-batch-id^="v1-"]').first().click();
  await expect(page.getByTestId('delete-batch-btn')).toBeDisabled();

  // Select V2 (the leaf)
  await page.locator('[data-batch-id^="v2-"]').first().click();
  await expect(page.getByTestId('delete-batch-btn')).toBeEnabled();

  // Delete V2 via simple confirm
  await page.getByTestId('delete-batch-btn').click();
  await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible();
  await page.getByTestId('confirm-delete-submit').click();
  await expect(page.getByTestId('confirm-delete-dialog')).not.toBeVisible();

  // V1 is now the only batch — and Delete should be enabled
  await expect(page.locator('[data-batch-id^="v1-"]').first()).toBeVisible();
  await expect(page.locator('[data-batch-id^="v2-"]')).toHaveCount(0);

  // Delete the recipe via typed confirm
  await page.getByTestId('delete-recipe-btn').click();
  await expect(page.getByTestId('confirm-delete-dialog')).toBeVisible();
  // Submit should be disabled until we type the recipe name
  await expect(page.getByTestId('confirm-delete-submit')).toBeDisabled();
  await page.getByTestId('confirm-delete-input').fill('Delete Me');
  await expect(page.getByTestId('confirm-delete-submit')).toBeEnabled();
  await page.getByTestId('confirm-delete-submit').click();

  // Lands on home, recipe is gone
  await expect(page).toHaveURL(/^http:\/\/localhost:4173\/?$/);
  await expect(page.locator('[data-recipe-id="delete-me"]')).toHaveCount(0);
});
```

- [ ] **Step 2: Run the new test**

Run: `~/.bun/bin/bun run e2e -- delete`
Expected: 1 passed.

If it fails, debug iteratively. Use `~/.bun/bin/bun run e2e:headed -- delete` to watch (only useful with a display).

- [ ] **Step 3: Run the full E2E suite**

Run: `~/.bun/bin/bun run e2e`
Expected: 4 passed (foundation + edit-batch + compare-merge + delete).

- [ ] **Step 4: Run the full unit suite**

Run: `~/.bun/bin/bun test`
Expected: 67 pass.

- [ ] **Step 5: Commit (controller)**

```bash
git add tests/e2e/delete.e2e.ts
git commit -m "test(e2e): delete batch (children check) and recipe (typed confirm)"
```

---

## Self-review notes

**Spec coverage:**
- Spec §2 (Delete recipe — entry point + typed confirmation + DELETE call + navigate home) → Tasks 2, 3, 4
- Spec §3 (Delete batch — entry point + disabled-on-children + simple confirm + clear currentBatchId) → Tasks 1, 2, 3, 5
- Spec §3 API change (409 on children, clear currentBatchId server-side) → Task 1
- Spec §4 (ConfirmDeleteDialog component, both modes) → Task 3
- Spec §5 (Cook-freeze banner) → Task 6
- Spec §7 (Testing) → Tasks 1, 7

**Type consistency:**
- `mode: 'simple' | 'typed'` on `ConfirmDeleteDialog` matches the prop signature in Task 3 and the usage sites in Tasks 4 and 5.
- `api.deleteRecipe(id)` and `api.deleteBatch(recipeId, batchId)` are referenced in Tasks 4 and 5; defined in Task 2.

**Known integration risks:**
- Child detection is computed client-side from the loaded `batches` array. If the array is stale (e.g., another tab created a child after this tab loaded), the disabled state is wrong. The server's 409 backstop catches this.
- `invalidateAll()` after delete-batch refreshes the page's data. The old `selectedId` may have pointed at the just-deleted batch — the recipe-page script falls back to `data.batches[0]?.id ?? null`. Re-rendering picks a new selection automatically. Verify in E2E.
- Test 1's "ENOENT might happen if recipe is gone" branch in the DELETE handler — currently can only happen if the recipe folder was deleted between the deleteBatch call and the readRecipe call, which is impossible in a single-user local app. We catch and ignore for safety. No test for this rare path.

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-05-delete-and-cook-confirm.md`. 7 tasks.**

Two execution options:

**1. Subagent-Driven (recommended)** — Same pattern as before.
**2. Inline Execution**

**Which approach?**
