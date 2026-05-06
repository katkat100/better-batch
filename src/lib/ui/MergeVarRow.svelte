<!-- src/lib/ui/MergeVarRow.svelte -->
<script lang="ts">
  import type { VariableSchemaItem, VariableValue } from '$lib/server';
  import { displayUnit } from '$lib/shared/unit';

  type VarPick = { from: 'a' } | { from: 'b' } | { from: 'custom'; value: VariableValue };

  let {
    item,
    aValue,
    bValue,
    pick = $bindable({ from: 'a' } as VarPick),
    aLabel = 'A',
    bLabel = 'B'
  }: {
    item: VariableSchemaItem;
    aValue: VariableValue;
    bValue: VariableValue;
    pick?: VarPick;
    aLabel?: string;
    bLabel?: string;
  } = $props();

  function format(v: VariableValue): string {
    if (v === null || v === undefined) return '—';
    if (!item.unit) return String(v);
    const u = typeof v === 'number' ? displayUnit(item.unit, v) : item.unit;
    return `${v}${u}`;
  }

  function setCustom(raw: string) {
    if (raw === '') { pick = { from: 'custom', value: null }; return; }
    if (item.type === 'number') {
      const n = parseFloat(raw);
      pick = { from: 'custom', value: Number.isFinite(n) ? n : raw };
    } else {
      pick = { from: 'custom', value: raw };
    }
  }

  const resolved = $derived(
    pick.from === 'a' ? aValue : pick.from === 'b' ? bValue : pick.value
  );
</script>

<div class="grid grid-cols-[110px_1fr_1fr_1fr_auto] gap-3 items-center text-sm py-2 border-b border-drafting/50" data-testid="merge-var-row" data-variable={item.name}>
  <span class="text-[11px] uppercase tracking-wider text-obsidian/70">{item.name}</span>
  <button
    type="button"
    onclick={() => pick = { from: 'a' }}
    class="font-mono text-left {pick.from === 'a' ? 'text-ochre font-bold' : 'text-obsidian/60 hover:text-obsidian'}"
    data-testid="pick-a"
    title={aLabel}
  >{format(aValue)}</button>
  <button
    type="button"
    onclick={() => pick = { from: 'b' }}
    class="font-mono text-left {pick.from === 'b' ? 'text-juniper font-bold' : 'text-obsidian/60 hover:text-obsidian'}"
    data-testid="pick-b"
    title={bLabel}
  >{format(bValue)}</button>
  <span class="font-mono">
    {#if pick.from === 'custom'}
      <input
        type="text"
        inputmode={item.type === 'number' ? 'decimal' : 'text'}
        value={pick.value ?? ''}
        oninput={(e) => setCustom((e.currentTarget as HTMLInputElement).value)}
        class="border border-drafting bg-canvas px-2 py-1 rounded-sm w-full font-mono text-sm"
        data-testid="custom-input"
      />
    {:else}
      <span data-testid="result-value">{format(resolved)}</span>
    {/if}
  </span>
  <button
    type="button"
    onclick={() => pick = { from: 'custom', value: resolved }}
    class="text-[10px] uppercase tracking-wider text-obsidian/50 hover:text-ochre"
    data-testid="pick-custom"
  >custom</button>
</div>
