<script lang="ts">
  import NotecardCard from '$lib/ui/NotecardCard.svelte';
  import Toolbar from '$lib/ui/Toolbar.svelte';
  import NewRecipeDialog from '$lib/ui/NewRecipeDialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import type { IndexEntry } from '$lib/server';

  let { data }: { data: { index: IndexEntry[] } } = $props();

  let search = $state('');
  let tag = $state('');
  let status = $state<'all' | 'has_cooked' | 'drafts_only'>('all');
  let sort = $state<'last_cooked' | 'name' | 'batch_count'>('last_cooked');
  let dialogOpen = $state(false);

  const allTags = $derived([...new Set(data.index.flatMap(e => e.tags))].sort());

  const filtered = $derived.by(() => {
    let out = data.index;
    if (search) {
      const q = search.toLowerCase();
      out = out.filter(e => e.name.toLowerCase().includes(q));
    }
    if (tag) out = out.filter(e => e.tags.includes(tag));
    if (status === 'has_cooked') out = out.filter(e => e.lastCookedAt !== null);
    else if (status === 'drafts_only') out = out.filter(e => e.lastCookedAt === null);

    const sorted = [...out];
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === 'batch_count') sorted.sort((a, b) => b.batchCount - a.batchCount);
    else sorted.sort((a, b) => (b.lastCookedAt ?? '').localeCompare(a.lastCookedAt ?? ''));
    return sorted;
  });
</script>

<div class="max-w-6xl mx-auto p-8 flex flex-col gap-6">
  <header class="flex items-end justify-between">
    <div>
      <h1 class="font-serif text-4xl">Better Batch</h1>
      <p class="text-sm text-obsidian/60 font-sans">Record. Analyze. Refine. Archive.</p>
    </div>
    <Button
      variant="outline"
      onclick={() => dialogOpen = true}
      data-testid="new-recipe-btn"
    >+ New Recipe</Button>
  </header>

  <Toolbar bind:search bind:tag bind:status bind:sort {allTags} />

  {#if filtered.length === 0}
    <p class="text-sm text-obsidian/50 py-12 text-center">No recipes match.</p>
  {:else}
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4" data-testid="recipe-grid">
      {#each filtered as entry (entry.id)}
        <NotecardCard {entry} />
      {/each}
    </div>
  {/if}
</div>

<NewRecipeDialog bind:open={dialogOpen} />
