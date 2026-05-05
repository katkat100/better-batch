<!-- src/lib/ui/VariableDiffTable.svelte -->
<script lang="ts">
  import type { VariableDiffRow } from '$lib/server';

  let {
    rows,
    aLabel = 'A',
    bLabel = 'B'
  }: {
    rows: VariableDiffRow[];
    aLabel?: string;
    bLabel?: string;
  } = $props();

  function formatValue(row: VariableDiffRow, side: 'a' | 'b'): string {
    const v = side === 'a' ? row.a : row.b;
    if (v === null || v === undefined) return '—';
    if (typeof v === 'number') return row.unit ? `${v}${row.unit}` : `${v}`;
    return String(v);
  }

  function formatDelta(row: VariableDiffRow): string {
    if (row.delta === null || row.delta === 0) return '—';
    const sign = row.delta > 0 ? '+' : '';
    return `${sign}${row.delta}${row.unit}`;
  }

  function deltaColor(row: VariableDiffRow): string {
    if (row.delta === null || row.delta === 0) return 'text-obsidian/40';
    return row.delta > 0 ? 'text-juniper' : 'text-ochre';
  }
</script>

<table class="w-full text-sm border border-drafting rounded-sm" data-testid="variable-diff-table">
  <thead class="bg-drafting/30 text-[10px] uppercase tracking-wider text-obsidian/60">
    <tr>
      <th class="text-left p-2">Variable</th>
      <th class="text-left p-2">{aLabel}</th>
      <th class="text-left p-2">{bLabel}</th>
      <th class="text-left p-2">Δ</th>
    </tr>
  </thead>
  <tbody>
    {#each rows as row (row.name)}
      <tr class={row.changed ? '' : 'opacity-60'} data-testid="variable-diff-row" data-variable={row.name}>
        <td class="p-2 text-[11px] uppercase tracking-wider text-obsidian/70">{row.name}</td>
        <td class="p-2 font-mono">{formatValue(row, 'a')}</td>
        <td class="p-2 font-mono">{formatValue(row, 'b')}</td>
        <td class="p-2 font-mono {deltaColor(row)}" data-testid="variable-delta">{formatDelta(row)}</td>
      </tr>
    {/each}
  </tbody>
</table>
