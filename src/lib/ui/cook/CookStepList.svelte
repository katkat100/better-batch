<!-- src/lib/ui/cook/CookStepList.svelte -->
<script lang="ts">
  import CookStepRow from './CookStepRow.svelte';
  import type { Step, Ingredient } from '$lib/server';
  import type { TimerMatch } from './layout/timer-parse';

  let {
    steps,
    ingredients,
    checkedSteps,
    currentStepIndex,
    activeTimerKeys,
    onCheck,
    onStartTimer
  }: {
    steps: Step[];
    ingredients: Ingredient[];
    checkedSteps: Set<number>;
    currentStepIndex: number;
    activeTimerKeys: Set<string>;
    onCheck: (i: number, checked: boolean) => void;
    onStartTimer: (stepIndex: number, match: TimerMatch) => void;
  } = $props();

  let listEl = $state<HTMLOListElement | undefined>();

  $effect(() => {
    if (currentStepIndex < 0 || !listEl) return;
    const row = listEl.querySelector(`[data-step-index="${currentStepIndex}"]`);
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
</script>

<section class="flex flex-col">
  <h2 class="text-[10px] uppercase tracking-wider text-obsidian/50 px-4 pt-3">Steps</h2>
  {#if steps.length === 0}
    <p class="px-4 py-3 text-sm text-obsidian/40 italic">No steps recorded.</p>
  {:else}
    <ol class="flex flex-col" bind:this={listEl} data-testid="cook-step-list">
      {#each steps as step, i (i)}
        <CookStepRow
          {step}
          index={i}
          isCurrent={i === currentStepIndex}
          isChecked={checkedSteps.has(i)}
          {ingredients}
          {activeTimerKeys}
          {onCheck}
          {onStartTimer}
        />
      {/each}
    </ol>
  {/if}
</section>
