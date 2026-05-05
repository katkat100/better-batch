<!-- src/lib/ui/cook/CookStartBanner.svelte -->
<script lang="ts">
  let { onStart }: { onStart: () => void } = $props();
</script>

<div class="bg-ochre/10 border-b border-ochre/40 text-ochre p-4 flex flex-col gap-2 text-sm" data-testid="cook-start-banner">
  <p class="opacity-90">Press <strong>Start Cooking</strong> when you begin. Timers and notes can run anyway, but elapsed time only tracks once you start.</p>
  <button
    type="button"
    onclick={onStart}
    class="self-start border border-juniper text-juniper bg-canvas px-4 py-2 text-xs uppercase tracking-wider hover:bg-juniper hover:text-canvas rounded-sm"
    data-testid="start-cooking-btn"
  >Start Cooking</button>
</div>
