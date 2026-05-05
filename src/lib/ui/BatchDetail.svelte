<!-- src/lib/ui/BatchDetail.svelte -->
<script lang="ts">
  import VariableTile from './VariableTile.svelte';
  import IngredientList from './IngredientList.svelte';
  import StepsList from './StepsList.svelte';
  import Rating from './Rating.svelte';
  import BatchPickerDropdown from './BatchPickerDropdown.svelte';
  import { goto, invalidateAll } from '$app/navigation';
  import ConfirmDeleteDialog from './ConfirmDeleteDialog.svelte';
  import { api } from './api-client';
  import type { Recipe, Batch } from '$lib/server';

  let {
    recipe,
    batch,
    batches,
    onMarkCooked = () => {},
    onEditOutcome = () => {}
  }: {
    recipe: Recipe;
    batch: Batch;
    batches: Batch[];
    onMarkCooked?: () => void;
    onEditOutcome?: () => void;
  } = $props();

  const cookedDateLabel = $derived(
    batch.cookedAt ? new Date(batch.cookedAt).toLocaleDateString() : null
  );

  const childCount = $derived(batches.filter(b => b.parentIds.includes(batch.id)).length);
  const canDelete = $derived(childCount === 0);

  let deleteOpen = $state(false);

  async function handleDelete() {
    await api.deleteBatch(recipe.id, batch.id);
    await invalidateAll();
  }

  let compareOpen = $state(false);
  let mergeOpen = $state(false);

  function handleCompareWith(otherId: string) {
    goto(`/recipes/${recipe.id}/compare?a=${batch.id}&b=${otherId}`);
  }
  function handleMergeWith(otherId: string) {
    goto(`/recipes/${recipe.id}/merge?a=${batch.id}&b=${otherId}`);
  }
</script>

<article class="flex flex-col gap-5" data-testid="batch-detail" data-batch-id={batch.id}>
  <header class="flex items-start justify-between border-b border-drafting pb-3">
    <div>
      <h2 class="font-serif text-2xl">{batch.id}</h2>
      <p class="text-sm text-obsidian/60">{batch.label}</p>
      {#if batch.status === 'cooked' && cookedDateLabel}
        <p class="text-[11px] uppercase tracking-wider text-juniper mt-1">Cooked {cookedDateLabel}</p>
      {:else if batch.status === 'draft'}
        <p class="text-[11px] uppercase tracking-wider text-ochre mt-1">Draft</p>
      {:else}
        <p class="text-[11px] uppercase tracking-wider text-obsidian/40 mt-1">Archived</p>
      {/if}
    </div>
    <div class="flex gap-2 items-start">
      <a
        href="/recipes/{recipe.id}/new-batch?from={batch.id}"
        class="border border-ochre text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm"
        data-testid="new-batch-btn"
      >+ New Batch</a>

      <div class="relative">
        <button
          type="button"
          onclick={() => { compareOpen = !compareOpen; mergeOpen = false; }}
          class="border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
          data-testid="compare-btn"
        >Compare with…</button>
        <BatchPickerDropdown
          label="Compare with"
          candidates={batches}
          excludeId={batch.id}
          bind:open={compareOpen}
          onPick={handleCompareWith}
        />
      </div>

      <div class="relative">
        <button
          type="button"
          onclick={() => { mergeOpen = !mergeOpen; compareOpen = false; }}
          class="border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
          data-testid="merge-btn"
        >Merge with…</button>
        <BatchPickerDropdown
          label="Merge with"
          candidates={batches}
          excludeId={batch.id}
          bind:open={mergeOpen}
          onPick={handleMergeWith}
        />
      </div>

      {#if batch.status === 'draft'}
        <a
          href="/recipes/{recipe.id}/batches/{batch.id}/edit"
          class="border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
          data-testid="edit-batch-btn"
        >Edit</a>
        <button
          type="button"
          onclick={onMarkCooked}
          class="border border-juniper text-juniper px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-juniper hover:text-canvas rounded-sm"
          data-testid="mark-cooked-btn"
        >Mark as Cooked</button>
      {:else if batch.status === 'cooked'}
        <button
          type="button"
          onclick={onEditOutcome}
          class="border border-drafting text-obsidian px-3 py-1.5 text-xs uppercase tracking-wider hover:border-obsidian rounded-sm"
          data-testid="edit-outcome-btn"
        >Edit Outcome</button>
      {/if}
      <button
        type="button"
        onclick={() => deleteOpen = true}
        disabled={!canDelete}
        title={canDelete ? '' : `Delete child batches first (${childCount} child${childCount === 1 ? '' : 'ren'})`}
        class="border border-ochre text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:opacity-40 disabled:cursor-not-allowed rounded-sm"
        data-testid="delete-batch-btn"
      >Delete</button>
    </div>
  </header>

  {#if recipe.variableSchema.length > 0}
    <section class="flex flex-wrap gap-2" data-testid="variable-strip">
      {#each recipe.variableSchema as schema}
        <VariableTile {schema} value={batch.variables[schema.name] ?? null} />
      {/each}
    </section>
  {/if}

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Ingredients</h3>
    <IngredientList ingredients={batch.ingredients} />
  </section>

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Steps</h3>
    <StepsList steps={batch.steps} ingredients={batch.ingredients} />
  </section>

  {#if batch.status === 'cooked'}
    <section class="flex flex-col gap-2 border-t border-drafting pt-4">
      <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Outcome</h3>
      {#if batch.outcomeNotes}
        <p class="text-sm whitespace-pre-wrap">{batch.outcomeNotes}</p>
      {:else}
        <p class="text-sm text-obsidian/40 italic">No notes recorded.</p>
      {/if}
      <Rating value={batch.rating} />
    </section>
  {/if}
</article>

<ConfirmDeleteDialog
  bind:open={deleteOpen}
  title="Delete {batch.id}?"
  body="Permanently deletes this batch. This can't be undone."
  confirmLabel="Delete Batch"
  mode="simple"
  onConfirm={handleDelete}
/>
