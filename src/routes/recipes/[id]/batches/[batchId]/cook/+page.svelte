<!-- src/routes/recipes/[id]/batches/[batchId]/cook/+page.svelte -->
<script lang="ts">
  import CookView from '$lib/ui/cook/CookView.svelte';
  import type { Recipe, Batch } from '$lib/server';
  let { data }: { data: { recipe: Recipe; batch: Batch } } = $props();
</script>

<CookView recipe={data.recipe} batch={data.batch} />
