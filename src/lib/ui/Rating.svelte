<!-- src/lib/ui/Rating.svelte -->
<script lang="ts">
  let {
    value,
    editable = false,
    onChange = () => {}
  }: {
    value: 1 | 2 | 3 | 4 | 5 | null;
    editable?: boolean;
    onChange?: (v: 1 | 2 | 3 | 4 | 5) => void;
  } = $props();
</script>

<div class="flex gap-1" data-testid="rating">
  {#each [1, 2, 3, 4, 5] as n}
    {@const filled = value !== null && n <= value}
    {#if editable}
      <button
        type="button"
        onclick={() => onChange(n as 1 | 2 | 3 | 4 | 5)}
        class="text-xl leading-none {filled ? 'text-ochre' : 'text-drafting'} hover:text-ochre"
        aria-label="Rate {n}"
        data-testid="rating-{n}"
      >★</button>
    {:else}
      <span class="text-xl leading-none {filled ? 'text-ochre' : 'text-drafting'}">★</span>
    {/if}
  {/each}
</div>
