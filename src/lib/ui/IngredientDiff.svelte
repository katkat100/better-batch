<!-- src/lib/ui/IngredientDiff.svelte -->
<script lang="ts">
  import type { IngredientDiffRow } from '$lib/server';

  let { rows }: { rows: IngredientDiffRow[] } = $props();

  function bgClass(op: IngredientDiffRow['op']): string {
    switch (op) {
      case 'add': return 'bg-juniper/10 text-juniper';
      case 'rem': return 'bg-ochre/10 text-ochre line-through opacity-80';
      case 'mod': return 'bg-drafting/30';
      default: return '';
    }
  }

  function format(ing: { amount: string; unit: string; name: string; section?: string }): string {
    const amt = `${ing.amount}${ing.unit ? ' ' + ing.unit : ''}`;
    const sec = ing.section ? ` [${ing.section}]` : '';
    return `${amt} ${ing.name}${sec}`;
  }
</script>

{#if rows.length === 0}
  <p class="text-placeholder">No ingredients to compare.</p>
{:else}
  <ul class="font-mono text-sm space-y-0.5">
    {#each rows as row, i (i)}
      <li class="px-2 py-1 rounded-sm {bgClass(row.op)}" data-testid="ingredient-diff-row" data-op={row.op}>
        {#if row.op === 'mod' && row.a && row.b}
          <span class="line-through opacity-60 text-ochre">{format(row.a)}</span>
          <span class="mx-1 opacity-40">→</span>
          <span class="text-juniper">{format(row.b)}</span>
        {:else if row.op === 'add' && row.b}
          + {format(row.b)}
        {:else if row.op === 'rem' && row.a}
          − {format(row.a)}
        {:else if row.op === 'ctx' && row.a}
          {format(row.a)}
        {/if}
      </li>
    {/each}
  </ul>
{/if}
