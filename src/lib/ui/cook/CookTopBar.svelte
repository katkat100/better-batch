<!-- src/lib/ui/cook/CookTopBar.svelte -->
<script lang="ts">
  import type { Recipe, Batch } from '$lib/server';
  import Button from '$lib/ui/primitives/Button.svelte';
  import { resolve } from '$app/paths';

  let {
    recipe,
    batch,
    started,
    elapsedMs,
    onEndCook
  }: {
    recipe: Recipe;
    batch: Batch;
    started: boolean;
    elapsedMs: number;
    onEndCook: () => void;
  } = $props();

  const modeTag = $derived(batch.status === 'cooked' ? 'Re-cook' : 'Cooking');

  function fmtElapsed(ms: number): string {
    const totalMin = Math.floor(ms / 60_000);
    if (totalMin < 60) return `${totalMin} min`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  }
</script>

<header class="sticky top-0 z-20 bg-canvas border-b border-drafting flex items-center gap-3 px-4 py-2 text-sm">
  <a href={resolve(`/recipes/${recipe.id}`)} class="text-obsidian/60 hover:text-obsidian text-xs whitespace-nowrap" aria-label="Back to recipe">
    ← {recipe.name}
  </a>
  <span class="text-obsidian/40">·</span>
  <span class="font-serif font-semibold truncate">{batch.label}</span>
  <span class="text-[10px] uppercase tracking-wider {batch.status === 'cooked' ? 'text-juniper' : 'text-ochre'}">{modeTag}</span>
  <span class="ml-auto flex items-center gap-2">
    {#if started}
      <span class="text-[11px] font-mono text-obsidian/60" data-testid="cook-elapsed">{fmtElapsed(elapsedMs)}</span>
      <Button
        variant="success"
        size="sm"
        onclick={onEndCook}
        class="py-1"
        data-testid="end-cook-btn"
      >End Cook</Button>
    {/if}
  </span>
</header>
