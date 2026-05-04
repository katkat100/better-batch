<!-- src/lib/ui/IngredientList.svelte -->
<script lang="ts">
  import type { Ingredient } from '$lib/server';
  let { ingredients }: { ingredients: Ingredient[] } = $props();
</script>

{#if ingredients.length === 0}
  <p class="text-sm text-obsidian/40 italic">No ingredients recorded.</p>
{:else}
  <ul class="font-mono text-sm space-y-1">
    {#each ingredients as ing}
      <li class="flex gap-3 border-b border-drafting/50 pb-1">
        <span class="text-ochre min-w-[80px]">{ing.amount}{ing.unit ? ` ${ing.unit}` : ''}</span>
        <span>{ing.name}</span>
      </li>
    {/each}
  </ul>
{/if}
