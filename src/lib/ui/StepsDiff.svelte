<!-- src/lib/ui/StepsDiff.svelte -->
<script lang="ts">
  import type { DiffLine } from '$lib/server';
  let { lines }: { lines: DiffLine[] } = $props();

  function bgClass(op: DiffLine['op']): string {
    switch (op) {
      case 'add': return 'bg-juniper/10 text-juniper';
      case 'rem': return 'bg-ochre/10 text-ochre line-through opacity-80';
      default: return '';
    }
  }

  function prefix(op: DiffLine['op']): string {
    if (op === 'add') return '+ ';
    if (op === 'rem') return '− ';
    return '  ';
  }
</script>

{#if lines.length === 0}
  <p class="text-placeholder">No steps to compare.</p>
{:else}
  <ol class="font-mono text-sm space-y-0.5">
    {#each lines as line, i (i)}
      <li class="px-2 py-1 rounded-sm {bgClass(line.op)}" data-testid="step-diff-line" data-op={line.op}>
        <span class="select-none text-obsidian/40">{prefix(line.op)}</span>{line.text}
      </li>
    {/each}
  </ol>
{/if}
