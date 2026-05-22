<script lang="ts">
  import Sparkline from './Sparkline.svelte';
  import { resolve } from '$app/paths';
  import type { IndexEntry } from '$lib/server';

  let { entry }: { entry: IndexEntry } = $props();

  const lastCookedLabel = $derived(
    entry.lastCookedAt
      ? new Date(entry.lastCookedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      : 'Never cooked'
  );

  const hasCooked = $derived(entry.lastCookedAt !== null);
</script>

<a
  href={resolve(`/recipes/${entry.id}`)}
  class="notecard block aspect-[4/6] border border-drafting bg-canvas hover:border-obsidian transition-colors p-4 flex flex-col gap-3 rounded-sm"
  data-testid="recipe-card"
  data-recipe-id={entry.id}
>
  <header class="flex flex-col gap-1">
    <h2 class="font-serif text-xl leading-tight">{entry.name}</h2>
    {#if entry.tags.length > 0}
      <div class="flex flex-wrap gap-1 text-[10px] uppercase tracking-wider text-obsidian/60">
        {#each entry.tags as tag (tag)}
          <span>{tag}</span>
        {/each}
      </div>
    {/if}
  </header>

  <div class="flex-1 flex items-center justify-center min-h-0">
    {#if entry.sparklineVariable && entry.sparklineValues.length >= 2}
      <div class="text-ochre flex flex-col items-center gap-1">
        <Sparkline values={entry.sparklineValues} width={120} height={32} label="{entry.sparklineVariable} over time" />
        <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{entry.sparklineVariable}</span>
      </div>
    {:else}
      <div class="text-[10px] uppercase tracking-wider text-obsidian/30">No data yet</div>
    {/if}
  </div>

  <footer class="flex items-end justify-between text-[11px] font-sans border-t border-drafting pt-2">
    <span class="text-obsidian/60">{entry.batchCount} {entry.batchCount === 1 ? 'batch' : 'batches'}</span>
    <span class={hasCooked ? 'text-juniper' : 'text-obsidian/60'}>{lastCookedLabel}</span>
  </footer>
</a>
