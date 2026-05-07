<!-- src/routes/recipes/[id]/+page.svelte -->
<script lang="ts">
  import BatchGraph from '$lib/ui/BatchGraph.svelte';
  import BatchDetail from '$lib/ui/BatchDetail.svelte';
  import OutcomeForm from '$lib/ui/OutcomeForm.svelte';
  import ConfirmDeleteDialog from '$lib/ui/ConfirmDeleteDialog.svelte';
  import EditVariablesDialog from '$lib/ui/EditVariablesDialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import { api } from '$lib/ui/api-client';
  import { goto, invalidateAll } from '$app/navigation';
  import { untrack } from 'svelte';
  import type { Recipe, Batch } from '$lib/server';

  let { data }: { data: { recipe: Recipe; batches: Batch[] } } = $props();

  let selectedId = $state<string | null>(untrack(() => data.recipe.currentBatchId ?? data.batches[0]?.id ?? null));
  let cooking = $state<Batch | null>(null);
  let editingOutcome = $state<Batch | null>(null);

  const selected = $derived(data.batches.find(b => b.id === selectedId) ?? null);

  function handleMarkCooked() {
    if (selected && selected.status === 'draft') cooking = selected;
  }
  function handleEditOutcome() {
    if (selected && selected.status === 'cooked') editingOutcome = selected;
  }

  let deleteDialogOpen = $state(false);
  let editVarsOpen = $state(false);

  type MobileTab = 'batches' | 'detail';
  let mobileTab = $state<MobileTab>('detail');

  async function handleDeleteRecipe() {
    await api.deleteRecipe(data.recipe.id);
    goto('/');
  }
</script>

<div class="max-w-7xl mx-auto p-6 flex flex-col gap-4 min-h-screen">
  <nav class="flex items-center gap-2 text-sm">
    <a href="/" class="text-obsidian/60 hover:text-obsidian">← All recipes</a>
  </nav>

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
          {#each data.recipe.tags as t (t)}<span class="border border-drafting px-2 py-0.5 rounded-sm">{t}</span>{/each}
        </div>
      {/if}
      <Button variant="ghost" size="sm" class="border border-drafting hover:border-ochre" onclick={() => editVarsOpen = true} data-testid="edit-variables-btn">Edit Variables</Button>
      <Button variant="outline" size="sm" onclick={() => deleteDialogOpen = true} data-testid="delete-recipe-btn">Delete Recipe</Button>
    </div>
  </header>

  {#if data.batches.length === 0}
    <div class="flex-1 flex flex-col items-center justify-center gap-4 text-center">
      <p class="text-sm text-obsidian/60">No batches yet. Record your first one to get started.</p>
      <a href="/recipes/{data.recipe.id}/new-batch" class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm">+ Record V1</a>
    </div>
  {:else}
    <div class="flex-1 flex flex-col lg:grid lg:grid-cols-[340px_1fr] lg:gap-6 min-h-0">
      <!-- Mobile-only tab bar -->
      <div class="border-b border-drafting flex lg:hidden">
        <button
          type="button"
          onclick={() => mobileTab = 'batches'}
          class="flex-1 px-4 py-3 text-xs uppercase tracking-wider text-center {
            mobileTab === 'batches'
              ? 'text-ochre border-b-2 border-ochre -mb-px font-bold'
              : 'text-obsidian/60 hover:text-obsidian'
          }"
          data-testid="mobile-tab-batches"
        >Batches ({data.batches.length})</button>
        <button
          type="button"
          onclick={() => mobileTab = 'detail'}
          class="flex-1 px-4 py-3 text-xs uppercase tracking-wider text-center truncate {
            mobileTab === 'detail'
              ? 'text-ochre border-b-2 border-ochre -mb-px font-bold'
              : 'text-obsidian/60 hover:text-obsidian'
          }"
          data-testid="mobile-tab-detail"
        >{selected?.label ?? 'Detail'}</button>
      </div>

      <aside
        class="overflow-auto flex flex-col items-center lg:items-stretch lg:border-r lg:border-drafting lg:pr-6 {mobileTab === 'batches' ? '' : 'hidden'} lg:block"
      >
        <h2 class="text-[11px] uppercase tracking-wider text-obsidian/50 mb-3 hidden lg:block">Batches ({data.batches.length})</h2>
        <BatchGraph batches={data.batches} {selectedId} onSelect={(id) => { selectedId = id; mobileTab = 'detail'; }} />
      </aside>
      <section class="overflow-auto {mobileTab === 'detail' ? '' : 'hidden'} lg:block">
        {#if selected}
          <BatchDetail
              recipe={data.recipe}
              batch={selected}
              batches={data.batches}
              onMarkCooked={handleMarkCooked}
              onEditOutcome={handleEditOutcome}
              onSelectBatch={(id) => selectedId = id}
            />
        {:else}
          <p class="text-sm text-obsidian/40">Select a batch to view details.</p>
        {/if}
      </section>
    </div>
  {/if}
</div>

{#if cooking}
  <OutcomeForm batch={cooking} recipeId={data.recipe.id} mode="cook" onClose={() => cooking = null} />
{/if}
{#if editingOutcome}
  <OutcomeForm batch={editingOutcome} recipeId={data.recipe.id} mode="edit" onClose={() => editingOutcome = null} />
{/if}

<EditVariablesDialog
  bind:open={editVarsOpen}
  recipeId={data.recipe.id}
  schema={data.recipe.variableSchema}
  onSaved={() => invalidateAll()}
/>

<ConfirmDeleteDialog
  bind:open={deleteDialogOpen}
  title="Delete {data.recipe.name}?"
  body="This permanently deletes the recipe and all {data.batches.length} batch{data.batches.length === 1 ? '' : 'es'}. This can't be undone. Type the recipe name to confirm."
  confirmLabel="Delete Recipe"
  mode="typed"
  typedMatch={data.recipe.name}
  onConfirm={handleDeleteRecipe}
/>
