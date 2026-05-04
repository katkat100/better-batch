<script lang="ts">
  import { sparklinePath } from './layout/sparkline-path';

  let { values, width = 80, height = 16, label = '' }: {
    values: (number | null)[];
    width?: number;
    height?: number;
    label?: string;
  } = $props();

  const path = $derived(sparklinePath(values, width, height));
</script>

<svg width={width} height={height} role="img" aria-label={label} class="overflow-visible">
  {#if path}
    <path d={path} fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" />
  {:else}
    <line x1="0" y1={height / 2} x2={width} y2={height / 2} stroke="currentColor" stroke-width="1" stroke-dasharray="2 2" opacity="0.4" />
  {/if}
</svg>
