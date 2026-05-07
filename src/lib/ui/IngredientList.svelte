<!-- src/lib/ui/IngredientList.svelte -->
<script lang="ts">
  import type { Ingredient } from '$lib/server';
  import { SvelteMap } from 'svelte/reactivity';
  let { ingredients }: { ingredients: Ingredient[] } = $props();

  type Group = { section: string | null; items: Ingredient[] };

  const groups = $derived.by<Group[]>(() => {
    const order: (string | null)[] = [];
    const map = new SvelteMap<string | null, Ingredient[]>();
    for (const ing of ingredients) {
      const key = ing.section && ing.section.trim() ? ing.section.trim() : null;
      if (!map.has(key)) {
        map.set(key, []);
        order.push(key);
      }
      map.get(key)!.push(ing);
    }
    // Uncategorized (null) renders first regardless of when it appeared
    const sorted = [...order].sort((a, b) => {
      if (a === null && b !== null) return -1;
      if (b === null && a !== null) return 1;
      return order.indexOf(a) - order.indexOf(b);
    });
    return sorted.map(section => ({ section, items: map.get(section)! }));
  });
</script>

{#if ingredients.length === 0}
  <p class="text-sm text-obsidian/40 italic">No ingredients recorded.</p>
{:else}
  <div class="flex flex-col gap-3">
    {#each groups as group (group.section ?? '__none__')}
      {#if group.section !== null}
        <div class="text-[10px] uppercase tracking-wider text-obsidian/50 border-b border-drafting pb-1">
          {group.section}
        </div>
      {/if}
      <ul class="font-mono text-sm space-y-1">
        {#each group.items as ing (ing.id)}
          <li class="flex gap-3 border-b border-drafting/50 pb-1" data-testid="ingredient-row" data-ingredient-id={ing.id}>
            <span class="text-ochre min-w-[80px]">{ing.amount}{ing.unit ? ` ${ing.unit}` : ''}</span>
            <span>{ing.name}</span>
          </li>
        {/each}
      </ul>
    {/each}
  </div>
{/if}
