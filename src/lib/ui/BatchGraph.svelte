<script lang="ts">
  import { layoutGraph, type Layout } from './layout/graph-layout';
  import type { Batch } from '$lib/server';

  let {
    batches,
    selectedId = null,
    onSelect = () => {}
  }: {
    batches: Batch[];
    selectedId?: string | null;
    onSelect?: (id: string) => void;
  } = $props();

  const COL_WIDTH = 60;
  const ROW_HEIGHT = 56;
  const NODE_R = 9;
  const PAD = 24;

  const layout = $derived<Layout>(layoutGraph(batches, { colWidth: COL_WIDTH, rowHeight: ROW_HEIGHT }));
  const byId = $derived(new Map(batches.map(b => [b.id, b] as const)));
  const nodeById = $derived(new Map(layout.nodes.map(n => [n.id, n] as const)));

  const svgWidth = $derived(layout.width + PAD * 2);
  const svgHeight = $derived(layout.height + PAD * 2);

  function curve(fromX: number, fromY: number, toX: number, toY: number): string {
    const midY = (fromY + toY) / 2;
    return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
  }

  function fill(status: Batch['status'], isSelected: boolean): string {
    if (status === 'cooked') return 'var(--color-juniper)';
    if (status === 'archived') return 'var(--color-drafting)';
    return 'var(--color-canvas)'; // draft = hollow
  }

  function stroke(status: Batch['status']): string {
    if (status === 'archived') return 'var(--color-drafting)';
    if (status === 'cooked') return 'var(--color-juniper)';
    return 'var(--color-obsidian)';
  }
</script>

<svg width={svgWidth} height={svgHeight} viewBox="0 0 {svgWidth} {svgHeight}" class="block">
  <!-- edges -->
  {#each layout.edges as e}
    {@const from = nodeById.get(e.from)}
    {@const to = nodeById.get(e.to)}
    {#if from && to}
      <path
        d={curve(from.x + PAD, from.y + PAD, to.x + PAD, to.y + PAD)}
        fill="none"
        stroke="var(--color-drafting)"
        stroke-width="1"
      />
    {/if}
  {/each}

  <!-- nodes -->
  {#each layout.nodes as n}
    {@const batch = byId.get(n.id)!}
    {@const isSelected = n.id === selectedId}
    <g
      transform="translate({n.x + PAD},{n.y + PAD})"
      class="cursor-pointer"
      role="button"
      tabindex="0"
      onclick={() => onSelect(n.id)}
      onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && onSelect(n.id)}
      data-testid="batch-node"
      data-batch-id={n.id}
    >
      {#if isSelected}
        <circle r={NODE_R + 4} fill="none" stroke="var(--color-ochre)" stroke-width="1.5" />
      {/if}
      <circle
        r={NODE_R}
        fill={fill(batch.status, isSelected)}
        stroke={stroke(batch.status)}
        stroke-width="1.5"
      />
      <text
        x={NODE_R + 6}
        y="4"
        font-family="var(--font-sans)"
        font-size="11"
        fill="var(--color-obsidian)"
      >{batch.id}</text>
    </g>
  {/each}
</svg>
