<!-- src/lib/ui/MultiplierToggle.svelte -->
<script lang="ts">
  export type Multiplier = number;

  let {
    value,
    onChange,
    class: extraClass = ''
  }: {
    value: Multiplier;
    onChange: (next: Multiplier) => void;
    class?: string;
  } = $props();

  const OPTIONS: number[] = [1, 2, 3];

  function buttonClass(opt: Multiplier): string {
    const base = 'text-[10px] uppercase tracking-wider px-2 py-0.5 border rounded-sm';
    return opt === value
      ? `${base} bg-ochre/15 border-ochre text-ochre`
      : `${base} border-drafting text-obsidian/60 hover:border-obsidian`;
  }
</script>

<div
  class="inline-flex gap-1 {extraClass}"
  role="group"
  aria-label="Batch multiplier"
  data-testid="multiplier-toggle"
>
  {#each OPTIONS as opt (opt)}
    <button
      type="button"
      class={buttonClass(opt)}
      aria-pressed={opt === value}
      onclick={() => onChange(opt)}
      data-testid="multiplier-option"
      data-value={opt}
    >{opt}x</button>
  {/each}
</div>
