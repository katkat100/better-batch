<script lang="ts">
  import BatchEditor from '$lib/ui/BatchEditor.svelte';
  import type { Recipe, Batch } from '$lib/server';
  let { data }: { data: { recipe: Recipe; batch: Batch } } = $props();
</script>

<div class="max-w-4xl mx-auto p-6">
  <BatchEditor recipe={data.recipe} parent={null} mode="edit" existing={data.batch} />
</div>
