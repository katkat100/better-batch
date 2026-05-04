<!-- src/lib/ui/BatchDetail.svelte -->
<script lang="ts">
  import VariableTile from './VariableTile.svelte';
  import IngredientList from './IngredientList.svelte';
  import StepsList from './StepsList.svelte';
  import Rating from './Rating.svelte';
  import type { Recipe, Batch } from '$lib/server';

  let {
    recipe,
    batch,
    onMarkCooked = () => {}
  }: {
    recipe: Recipe;
    batch: Batch;
    onMarkCooked?: () => void;
  } = $props();

  const cookedDateLabel = $derived(
    batch.cookedAt ? new Date(batch.cookedAt).toLocaleDateString() : null
  );
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
    <div class="flex gap-2">
      <a
        href="/recipes/{recipe.id}/new-batch?from={batch.id}"
        class="border border-ochre text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm"
        data-testid="new-batch-btn"
      >+ New Batch</a>
      {#if batch.status === 'draft'}
        <button
          type="button"
          onclick={onMarkCooked}
          class="border border-juniper text-juniper px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-juniper hover:text-canvas rounded-sm"
          data-testid="mark-cooked-btn"
        >Mark as Cooked</button>
      {/if}
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
    <StepsList steps={batch.steps} />
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
