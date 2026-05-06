<!-- src/lib/ui/cook/CookStartBanner.svelte -->
<script lang="ts">
  import Button from '$lib/ui/primitives/Button.svelte';

  let { onStart }: { onStart: () => void } = $props();
</script>

<div class="bg-ochre/10 border-b border-ochre/40 text-ochre p-4 flex flex-col gap-2 text-sm" data-testid="cook-start-banner">
  <p class="opacity-90">Press <strong>Start Cooking</strong> when you begin. Timers and notes can run anyway, but elapsed time only tracks once you start.</p>
  <Button
    variant="success"
    size="sm"
    onclick={onStart}
    class="self-start px-4 py-2"
    data-testid="start-cooking-btn"
  >Start Cooking</Button>
</div>
