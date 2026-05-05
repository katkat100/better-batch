<!-- src/routes/recipes/[id]/merge/+page.svelte -->
<script lang="ts">
  import MergePicker from '$lib/ui/MergePicker.svelte';
  import { api } from '$lib/ui/api-client';
  import { goto } from '$app/navigation';
  import type { Recipe, Batch, VariableValue } from '$lib/server';

  let { data }: { data: { recipe: Recipe; a: Batch; b: Batch } } = $props();

  async function handleSubmit(input: {
    label: string;
    ingredientsFrom: 'a' | 'b';
    stepsFrom: 'a' | 'b';
    variables: Record<string, VariableValue>;
  }) {
    const ingredients = input.ingredientsFrom === 'a' ? data.a.ingredients : data.b.ingredients;
    const rawSteps = input.stepsFrom === 'a' ? data.a.steps : data.b.steps;
    // Strip step.uses references to ingredients that don't exist in the chosen ingredient set.
    const ingredientIds = new Set(ingredients.map(i => i.id));
    const finalSteps = rawSteps.map(s => ({
      text: s.text,
      uses: s.uses.filter(u => ingredientIds.has(u.ingredientId))
    }));

    const batch = await api.createBatch(data.recipe.id, {
      label: input.label,
      parentIds: [data.a.id, data.b.id],
      status: 'draft',
      variables: input.variables,
      ingredients,
      steps: finalSteps
    });
    goto(`/recipes/${data.recipe.id}?batch=${batch.id}`);
  }
</script>

<div class="max-w-5xl mx-auto p-6 flex flex-col gap-4">
  <nav class="flex items-center gap-2 text-sm">
    <a href="/recipes/{data.recipe.id}" class="text-obsidian/60 hover:text-obsidian">← {data.recipe.name}</a>
  </nav>

  <MergePicker recipe={data.recipe} a={data.a} b={data.b} onSubmit={handleSubmit} />
</div>
