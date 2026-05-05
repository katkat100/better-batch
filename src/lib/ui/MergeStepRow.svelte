<!-- src/lib/ui/MergeStepRow.svelte -->
<script lang="ts">
  import type { StepObjectDiffRow } from '$lib/server';

  type StepAction = 'pick-a' | 'pick-b' | 'skip';

  let {
    row,
    pick = $bindable({ action: 'skip' } as { action: StepAction })
  }: {
    row: StepObjectDiffRow;
    pick?: { action: StepAction };
  } = $props();

  function truncate(text: string, max = 80): string {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  function set(action: StepAction) { pick = { action }; }

  function btnClass(target: StepAction, color: 'ochre' | 'juniper' | 'obsidian'): string {
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
     data-testid="merge-step-row"
     data-op={row.op}>
  {#if row.op === 'ctx'}
    <span class="text-[9px] uppercase tracking-wider text-obsidian/40 w-9">unch</span>
    <span class="flex-1 text-obsidian/60" title={row.step.text}>{truncate(row.step.text)}</span>
    <span class="text-[9px] uppercase tracking-wider text-obsidian/40">in result</span>
  {:else if row.op === 'rem'}
    <span class="text-[9px] uppercase tracking-wider text-ochre w-9">−A</span>
    <span class="flex-1 text-ochre" title={row.step.text}>{truncate(row.step.text)}</span>
    <div class="flex gap-1">
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-a', 'ochre')}" onclick={() => set('pick-a')} data-testid="merge-keep">keep</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('skip', 'obsidian')}" onclick={() => set('skip')} data-testid="merge-skip">skip</button>
    </div>
  {:else if row.op === 'add'}
    <span class="text-[9px] uppercase tracking-wider text-juniper w-9">+B</span>
    <span class="flex-1 text-juniper" title={row.step.text}>{truncate(row.step.text)}</span>
    <div class="flex gap-1">
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('skip', 'obsidian')}" onclick={() => set('skip')} data-testid="merge-skip">skip</button>
      <button type="button" class="border px-2 py-0.5 rounded-sm {btnClass('pick-b', 'juniper')}" onclick={() => set('pick-b')} data-testid="merge-add">add</button>
    </div>
  {/if}
</div>
