<!-- src/lib/ui/MergeIngredientRow.svelte -->
<script lang="ts">
  import type { Ingredient, IngredientDiffRow } from '$lib/server';

  type IngAction = 'pick-a' | 'pick-b' | 'skip';

  let {
    row,
    pick = $bindable({ action: 'skip' } as { action: IngAction })
  }: {
    row: IngredientDiffRow;
    pick?: { action: IngAction };
  } = $props();

  function format(ing: Ingredient): string {
    const amt = `${ing.amount}${ing.unit ? ' ' + ing.unit : ''}`;
    const sec = ing.section ? ` [${ing.section}]` : '';
    return `${amt} ${ing.name}${sec}`;
  }

  function set(action: IngAction) { pick = { action }; }

  function btnClass(target: IngAction, color: 'ochre' | 'juniper' | 'obsidian'): string {
    const active = pick.action === target;
    if (active) {
      if (color === 'ochre') return 'bg-ochre text-canvas border-ochre';
      if (color === 'juniper') return 'bg-juniper text-canvas border-juniper';
      return 'bg-obsidian text-canvas border-obsidian';
    }
    return 'bg-canvas text-obsidian/60 border-drafting hover:border-obsidian';
  }
</script>

<div class="flex items-center gap-2 px-2 py-1.5 border border-drafting/60 rounded-sm text-xs font-mono"
     class:bg-drafting={row.op === 'mod'}
     data-testid="merge-ing-row"
     data-op={row.op}>
  {#if row.op === 'ctx'}
    <span class="text-[9px] uppercase tracking-wider text-obsidian/40 w-9">unch</span>
    <span class="flex-1 text-obsidian/60">{format(row.a!)}</span>
    <span class="text-[9px] uppercase tracking-wider text-obsidian/40">in result</span>
  {:else if row.op === 'mod'}
    <span class="text-[9px] uppercase tracking-wider text-ochre w-9">conf</span>
    <span class="flex-1">
      <span class="text-ochre">{format(row.a!)}</span>
      <span class="mx-2 text-obsidian/40">→</span>
      <span class="text-juniper">{format(row.b!)}</span>
    </span>
    <div class="flex gap-1">
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-a', 'ochre')}" onclick={() => set('pick-a')} data-testid="merge-pick-a">A</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-b', 'juniper')}" onclick={() => set('pick-b')} data-testid="merge-pick-b">B</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('skip', 'obsidian')}" onclick={() => set('skip')} data-testid="merge-skip">skip</button>
    </div>
  {:else if row.op === 'rem'}
    <span class="text-[9px] uppercase tracking-wider text-ochre w-9">−A</span>
    <span class="flex-1 text-ochre">{format(row.a!)}</span>
    <div class="flex gap-1">
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-a', 'ochre')}" onclick={() => set('pick-a')} data-testid="merge-keep">keep</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('skip', 'obsidian')}" onclick={() => set('skip')} data-testid="merge-skip">skip</button>
    </div>
  {:else if row.op === 'add'}
    <span class="text-[9px] uppercase tracking-wider text-juniper w-9">+B</span>
    <span class="flex-1 text-juniper">{format(row.b!)}</span>
    <div class="flex gap-1">
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('skip', 'obsidian')}" onclick={() => set('skip')} data-testid="merge-skip">skip</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-b', 'juniper')}" onclick={() => set('pick-b')} data-testid="merge-add">add</button>
    </div>
  {/if}
</div>
