<script lang="ts">
  import { layoutGraph, type Layout } from './layout/graph-layout';
  import { validateBatch } from '$lib/shared/batch-validation';
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

  const COL_WIDTH = 110;
  const ROW_HEIGHT = 80;
  const NODE_R = 9;
  const PAD = 60;        // left/right pad large enough to fit centered labels at the edge cols
  const LABEL_MAX = 14;
  const LABEL_OFFSET_Y = NODE_R + 16;

  const layout = $derived<Layout>(layoutGraph(batches, { colWidth: COL_WIDTH, rowHeight: ROW_HEIGHT }));
  const byId = $derived(new Map(batches.map(b => [b.id, b] as const)));
  const nodeById = $derived(new Map(layout.nodes.map(n => [n.id, n] as const)));

  function inconsistencyTitle(batch: Batch): string | null {
    const issues = validateBatch(batch);
    const noteText = batch.inconsistencyNote?.trim() ?? '';
    if (issues.length === 0 && noteText === '') return null;
    const parts: string[] = [];
    if (issues.length > 0) parts.push(`${issues.length} ingredient issue${issues.length === 1 ? '' : 's'}`);
    if (noteText !== '') parts.push('has note');
    return parts.join(' · ');
  }

  const svgWidth = $derived(layout.width + PAD * 2);
  const svgHeight = $derived(layout.height + PAD + LABEL_OFFSET_Y);

  function truncate(text: string, max = LABEL_MAX): string {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function curve(fromX: number, fromY: number, toX: number, toY: number): string {
    const midY = (fromY + toY) / 2;
    return `M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`;
  }

  function fill(status: Batch['status']): string {
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

<svg width={svgWidth} height={svgHeight} viewBox="0 0 {svgWidth} {svgHeight}" class="block overflow-visible">
  <!-- edges -->
  {#each layout.edges as e (`${e.from}->${e.to}`)}
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
  {#each layout.nodes as n (n.id)}
    {@const batch = byId.get(n.id)!}
    {@const isSelected = n.id === selectedId}
    {@const warnTitle = inconsistencyTitle(batch)}
    <g transform="translate({n.x + PAD},{n.y + PAD})">
      <foreignObject
        x={-NODE_R - 4}
        y={-NODE_R - 4}
        width={(NODE_R + 4) * 2}
        height={(NODE_R + 4) * 2}
      >
        <button
          type="button"
          aria-label="Select batch {batch.label} ({batch.status})"
          aria-pressed={isSelected}
          onclick={() => onSelect(n.id)}
          class="w-full h-full bg-transparent border-0 p-0 cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ochre"
          data-testid="batch-node"
          data-batch-id={n.id}
        ></button>
      </foreignObject>
      {#if isSelected}
        <circle r={NODE_R + 4} fill="none" stroke="var(--color-ochre)" stroke-width="1.5" pointer-events="none" />
      {/if}
      <circle
        r={NODE_R}
        fill={fill(batch.status)}
        stroke={stroke(batch.status)}
        stroke-width="1.5"
        pointer-events="none"
      />
      <text
        x="0"
        y={LABEL_OFFSET_Y}
        text-anchor="middle"
        font-family="var(--font-sans)"
        font-size="11"
        fill="var(--color-obsidian)"
        pointer-events="none"
      >{truncate(batch.label)}<title>{batch.label}</title></text>
      {#if warnTitle}
        <text
          x={NODE_R + 4}
          y={-NODE_R + 2}
          font-size="12"
          fill="var(--color-ochre)"
          data-testid="batch-node-warning"
          pointer-events="none"
        >⚠<title>{warnTitle}</title></text>
      {/if}
    </g>
  {/each}
</svg>
