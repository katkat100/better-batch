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

  // Sub-2 values that hide under the ⋯ menu by default.
  const HIDDEN_CANDIDATES = [0.5, 0.75] as const;
  type Hidden = typeof HIDDEN_CANDIDATES[number];

  function isHidden(v: number): v is Hidden {
    return (HIDDEN_CANDIDATES as readonly number[]).includes(v);
  }

  // Slot 1 holds whichever fractional is active, defaulting to 1.
  const slot1 = $derived<number>(isHidden(value) ? value : 1);

  // ⋯ menu lists every value not in Slot 1. When Slot 1 is 1, both
  // fractionals appear; when Slot 1 is 0.5 or 0.75, 1 plus the OTHER
  // fractional appear so the user can switch in either direction.
  const menuValues = $derived<number[]>(
    slot1 === 1
      ? [...HIDDEN_CANDIDATES]
      : [1, ...HIDDEN_CANDIDATES.filter(v => v !== slot1)]
  );

  let menuOpen = $state(false);

  function fmt(v: number): string {
    return `${String(v)}x`;
  }

  function buttonClass(opt: number): string {
    const base = 'text-[10px] uppercase tracking-wider px-2 py-0.5 border rounded-sm';
    return opt === value
      ? `${base} bg-ochre/15 border-ochre text-ochre`
      : `${base} border-drafting text-obsidian/60 hover:border-obsidian`;
  }

  function pick(v: number) {
    onChange(v);
    menuOpen = false;
  }
</script>

<svelte:window onkeydown={(e) => menuOpen && e.key === 'Escape' && (menuOpen = false)} />

<div
  class="inline-flex gap-1 relative {extraClass}"
  role="group"
  aria-label="Batch multiplier"
  data-testid="multiplier-toggle"
>
  <button
    type="button"
    class={buttonClass(slot1)}
    aria-pressed={slot1 === value}
    onclick={() => pick(slot1)}
    data-testid="multiplier-option"
    data-value={slot1}
  >{fmt(slot1)}</button>

  <button
    type="button"
    class={buttonClass(2)}
    aria-pressed={value === 2}
    onclick={() => pick(2)}
    data-testid="multiplier-option"
    data-value={2}
  >2x</button>

  <button
    type="button"
    class={buttonClass(3)}
    aria-pressed={value === 3}
    onclick={() => pick(3)}
    data-testid="multiplier-option"
    data-value={3}
  >3x</button>

  <button
    type="button"
    class="text-[10px] uppercase tracking-wider px-2 py-0.5 border border-drafting text-obsidian/60 hover:border-obsidian rounded-sm"
    aria-label="More multiplier options"
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    aria-controls="multiplier-more-menu"
    onclick={() => menuOpen = !menuOpen}
    data-testid="multiplier-more-btn"
  >⋯</button>

  {#if menuOpen}
    <button
      tabindex="-1"
      aria-hidden="true"
      type="button"
      class="fixed inset-0 z-10 bg-transparent"
      aria-label="close multiplier menu"
      onclick={() => menuOpen = false}
    ></button>
    <div
      id="multiplier-more-menu"
      class="absolute top-full right-0 mt-1 bg-canvas border border-drafting rounded-sm shadow-md z-20 flex flex-col py-1 min-w-[60px]"
      role="menu"
      data-testid="multiplier-more-menu"
    >
      {#each menuValues as v (v)}
        <button
          type="button"
          class="text-[10px] uppercase tracking-wider px-3 py-1 text-left hover:bg-drafting/30 {v === value ? 'text-ochre' : 'text-obsidian/80'}"
          role="menuitem"
          onclick={() => pick(v)}
          data-testid="multiplier-option"
          data-value={v}
        >{fmt(v)}</button>
      {/each}
    </div>
  {/if}
</div>
