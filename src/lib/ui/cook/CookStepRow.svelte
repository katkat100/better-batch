<!-- src/lib/ui/cook/CookStepRow.svelte -->
<script lang="ts">
  import type { Step, Ingredient } from '$lib/server';
  import { parseTimers, type TimerMatch } from './layout/timer-parse';

  let {
    step,
    index,
    isCurrent,
    isChecked,
    ingredients,
    activeTimerKeys,
    onCheck,
    onStartTimer
  }: {
    step: Step;
    index: number;
    isCurrent: boolean;
    isChecked: boolean;
    ingredients: Ingredient[];
    activeTimerKeys: Set<string>;
    onCheck: (i: number, checked: boolean) => void;
    onStartTimer: (stepIndex: number, match: TimerMatch) => void;
  } = $props();

  const matches = $derived(parseTimers(step.text));
  const ingById = $derived(new Map(ingredients.map(i => [i.id, i] as const)));

  type Segment = { kind: 'text'; text: string } | { kind: 'timer'; match: TimerMatch; text: string };
  const segments = $derived.by<Segment[]>(() => {
    const out: Segment[] = [];
    let cursor = 0;
    for (const m of matches) {
      if (m.start > cursor) out.push({ kind: 'text', text: step.text.slice(cursor, m.start) });
      out.push({ kind: 'timer', match: m, text: step.text.slice(m.start, m.end) });
      cursor = m.end;
    }
    if (cursor < step.text.length) out.push({ kind: 'text', text: step.text.slice(cursor) });
    return out;
  });

  function timerKey(m: TimerMatch): string {
    return `${index}:${m.start}:${m.end}`;
  }
</script>

<li
  class="border-b border-drafting/50 transition-colors {isCurrent ? 'bg-ochre/5' : ''}"
  class:opacity-50={isChecked}
  data-testid="cook-step-row"
  data-step-index={index}
  data-current={isCurrent}
>
  <label class="flex gap-3 px-4 py-3 cursor-pointer hover:bg-drafting/20">
    <input
      type="checkbox"
      checked={isChecked}
      onchange={(e) => onCheck(index, (e.currentTarget as HTMLInputElement).checked)}
      aria-label="Mark step {index + 1} done"
      class="mt-1.5"
      data-testid="cook-step-checkbox"
    />
    <div class="flex-1 flex flex-col gap-1">
      <p class="text-sm leading-relaxed {isChecked ? 'line-through' : ''} {isCurrent ? 'font-semibold' : ''}">
        <span class="font-mono text-ochre mr-1">{index + 1}.</span>
        {#each segments as seg, si (si)}
          {#if seg.kind === 'text'}
            {seg.text}
          {:else}
            {@const active = activeTimerKeys.has(timerKey(seg.match))}
            <button
              type="button"
              onclick={(e) => { e.preventDefault(); e.stopPropagation(); onStartTimer(index, seg.match); }}
              class="border-b {active ? 'border-solid bg-ochre/15' : 'border-dashed'} border-ochre text-ochre cursor-pointer px-0.5"
              data-testid="timer-trigger"
              data-step={index}
              data-start={seg.match.start}
            >{seg.text}</button>
          {/if}
        {/each}
      </p>
      {#if step.uses.length > 0}
        <div class="flex flex-col gap-0.5 font-mono text-[11px] text-obsidian/60">
          {#each step.uses as use, ui (ui)}
            {@const ing = ingById.get(use.ingredientId)}
            {#if ing}
              <span>{use.amount}{ing.unit ?? ''} {ing.name}</span>
            {/if}
          {/each}
        </div>
      {/if}
    </div>
  </label>
</li>
