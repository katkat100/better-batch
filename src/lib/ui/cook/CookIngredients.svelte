<!-- src/lib/ui/cook/CookIngredients.svelte -->
<script lang="ts">
  import type { Ingredient, Step } from '$lib/server';

  let {
    ingredients,
    steps,
    currentStepIndex,
    checkedSteps
  }: {
    ingredients: Ingredient[];
    steps: Step[];
    currentStepIndex: number;
    checkedSteps: Set<number>;
  } = $props();

  const currentIds = $derived(new Set(
    currentStepIndex >= 0 ? steps[currentStepIndex]?.uses.map(u => u.ingredientId) ?? [] : []
  ));

  const usedInCheckedIds = $derived.by(() => {
    const ids = new Set<string>();
    for (const i of checkedSteps) {
      for (const u of steps[i]?.uses ?? []) ids.add(u.ingredientId);
    }
    return ids;
  });

  type Group = { section: string | null; items: Ingredient[] };
  const groups = $derived.by<Group[]>(() => {
    const order: (string | null)[] = [];
    const map = new Map<string | null, Ingredient[]>();
    for (const ing of ingredients) {
      const key = ing.section && ing.section.trim() ? ing.section.trim() : null;
      if (!map.has(key)) { map.set(key, []); order.push(key); }
      map.get(key)!.push(ing);
    }
    const sorted = [...order].sort((a, b) => {
      if (a === null && b !== null) return -1;
      if (b === null && a !== null) return 1;
      return order.indexOf(a) - order.indexOf(b);
    });
    return sorted.map(section => ({ section, items: map.get(section)! }));
  });

  function pillClass(ing: Ingredient): string {
    if (currentIds.has(ing.id)) return 'bg-ochre/20 border-ochre/40 text-ochre';
    if (usedInCheckedIds.has(ing.id)) return 'border-drafting opacity-50';
    return 'border-drafting';
  }
</script>

<section class="px-4 py-3 border-b border-drafting bg-canvas/60 flex flex-col gap-2" data-testid="cook-ingredients">
  <h2 class="text-[10px] uppercase tracking-wider text-obsidian/50">Ingredients</h2>
  {#each groups as group (group.section ?? '__none__')}
    <div class="flex flex-col gap-1">
      {#if group.section !== null}
        <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{group.section}</span>
      {/if}
      <div class="flex flex-wrap gap-x-2 gap-y-1.5 text-xs font-mono items-center">
        {#each group.items as ing (ing.id)}
          <span class="border px-2 py-0.5 rounded-sm transition-colors {pillClass(ing)}" data-testid="cook-ing-pill" data-ingredient-id={ing.id}>
            {ing.amount}{ing.unit ?? ''} {ing.name}
          </span>
        {/each}
      </div>
    </div>
  {/each}
</section>
