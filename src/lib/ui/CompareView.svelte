<!-- src/lib/ui/CompareView.svelte -->
<script lang="ts">
  import VariableDiffTable from './VariableDiffTable.svelte';
  import IngredientDiff from './IngredientDiff.svelte';
  import StepsDiff from './StepsDiff.svelte';
  import type { Recipe, Batch, VariableDiffRow, IngredientDiffRow, DiffLine } from '$lib/server';

  let {
    recipe,
    a,
    b,
    varRows,
    ingRows,
    stepLines
  }: {
    recipe: Recipe;
    a: Batch;
    b: Batch;
    varRows: VariableDiffRow[];
    ingRows: IngredientDiffRow[];
    stepLines: DiffLine[];
  } = $props();
</script>

<article class="flex flex-col gap-6" data-testid="compare-view">
  <header class="flex items-center gap-3 border-b border-drafting pb-3">
    <h2 class="font-serif text-2xl">Compare</h2>
    <span class="text-sm px-2 py-0.5 border border-ochre text-ochre rounded-sm">{a.label}</span>
    <span class="text-obsidian/40">↔</span>
    <span class="text-sm px-2 py-0.5 border border-juniper text-juniper rounded-sm">{b.label}</span>
  </header>

  {#if recipe.variableSchema.length > 0}
    <section class="flex flex-col gap-2">
      <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Variables</h3>
      <VariableDiffTable rows={varRows} aLabel={a.label} bLabel={b.label} />
    </section>
  {/if}

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Ingredients</h3>
    <IngredientDiff rows={ingRows} />
  </section>

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Steps</h3>
    <StepsDiff lines={stepLines} />
  </section>
</article>
