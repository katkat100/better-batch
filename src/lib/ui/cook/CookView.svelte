<!-- src/lib/ui/cook/CookView.svelte -->
<script lang="ts">
  import CookTopBar from './CookTopBar.svelte';
  import CookStartBanner from './CookStartBanner.svelte';
  import CookIngredients from './CookIngredients.svelte';
  import CookStepList from './CookStepList.svelte';
  import CookTimerDock, { type DockTimer } from './CookTimerDock.svelte';
  import { scheduleTimerNotification, cancelTimerNotification } from './cook-notifications';
  import CookQuickNoteFab from './CookQuickNoteFab.svelte';
  import EndCookDialog from './EndCookDialog.svelte';
  import { api } from '../api-client';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { SvelteSet } from 'svelte/reactivity';
  import { onMount, onDestroy } from 'svelte';
  import type { Recipe, Batch } from '$lib/server';
  import type { TimerMatch } from './layout/timer-parse';
  import type { Multiplier } from '../MultiplierToggle.svelte';

  let {
    recipe,
    batch
  }: {
    recipe: Recipe;
    batch: Batch;
  } = $props();

  let multiplier = $state<Multiplier>(1);
  let started = $state(false);
  let startedAt = $state<number | null>(null);
  let elapsedMs = $state(0);
  let checkedSteps = $state(new Set<number>());
  let quickNotes = $state<string[]>([]);
  let timers = $state<DockTimer[]>([]);
  let timersStarted = $state(0);
  let endCookOpen = $state(false);
  let wasFullChecked = $state(false);

  const currentStepIndex = $derived.by(() => {
    for (let i = 0; i < batch.steps.length; i++) {
      if (!checkedSteps.has(i)) return i;
    }
    return -1;
  });

  const activeTimerKeys = $derived(new Set(
    timers.filter(t => !t.finished).map(t => `${t.stepIndex}:${t.startedAt}`)
  ));

  let elapsedTickId: ReturnType<typeof setInterval> | null = null;
  let wakeLock: WakeLockSentinel | null = null;

  onMount(async () => {
    elapsedTickId = setInterval(() => {
      if (started && startedAt !== null) elapsedMs = Date.now() - startedAt;
    }, 5000);
    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      // wake lock unavailable or denied; proceed without it
    }
  });

  onDestroy(() => {
    if (elapsedTickId) clearInterval(elapsedTickId);
    if (wakeLock) wakeLock.release().catch(() => {});
  });

  function handleStart() {
    started = true;
    startedAt = Date.now();
    elapsedMs = 0;
  }

  function handleCheck(i: number, checked: boolean) {
    const next = new SvelteSet(checkedSteps);
    if (checked) next.add(i); else next.delete(i);
    checkedSteps = next;
    if (started && next.size === batch.steps.length && !wasFullChecked) {
      wasFullChecked = true;
      endCookOpen = true;
    }
  }

  function handleStartTimer(stepIndex: number, match: TimerMatch) {
    const id = crypto.randomUUID();
    timers = [...timers, {
      id,
      stepIndex,
      label: match.label,
      durationMs: match.durationMs,
      startedAt: Date.now(),
      pausedAt: null,
      pausedAccumMs: 0,
      finished: false
    }];
    timersStarted++;
    void scheduleTimerNotification(id, match.durationMs, match.label, stepIndex);
  }

  function handlePauseToggle(id: string) {
    const t = timers.find(x => x.id === id);
    if (!t) return;
    const now = Date.now();
    if (t.pausedAt !== null) {
      t.pausedAccumMs += now - t.pausedAt;
      t.pausedAt = null;
      const remaining = t.durationMs - (now - t.startedAt - t.pausedAccumMs);
      if (remaining > 0) {
        void scheduleTimerNotification(t.id, remaining, t.label, t.stepIndex);
      }
    } else {
      t.pausedAt = now;
      void cancelTimerNotification(t.id);
    }
    timers = [...timers];
  }

  function handleRemoveTimer(id: string) {
    void cancelTimerNotification(id);
    timers = timers.filter(t => t.id !== id);
  }

  function handleAddManual(durationMs: number, label: string) {
    const id = crypto.randomUUID();
    timers = [...timers, {
      id,
      stepIndex: -1,
      label,
      durationMs,
      startedAt: Date.now(),
      pausedAt: null,
      pausedAccumMs: 0,
      finished: false
    }];
    timersStarted++;
    void scheduleTimerNotification(id, durationMs, label, -1);
  }

  async function handleEndCookSubmit(input: {
    patch: Partial<Batch>;
    forkAsDraft: boolean;
    forkLabel: string;
  }) {
    let navigateTo = resolve(`/recipes/${recipe.id}?batch=${batch.id}`);

    if (Object.keys(input.patch).length > 0) {
      await api.patchBatch(recipe.id, batch.id, input.patch);
    }

    if (input.forkAsDraft && quickNotes.length > 0) {
      const cloned = structuredClone({
        variables: batch.variables,
        ingredients: batch.ingredients,
        steps: batch.steps
      });
      const description = `Captured during cook:\n${quickNotes.map(n => `• ${n}`).join('\n')}`;
      const newBatch = await api.createBatch(recipe.id, {
        label: input.forkLabel || `improvements from ${batch.label}`,
        parentIds: [batch.id],
        status: 'draft',
        variables: cloned.variables,
        ingredients: cloned.ingredients,
        steps: cloned.steps,
        outcomeNotes: description
      });
      navigateTo = resolve(`/recipes/${recipe.id}?batch=${newBatch.id}`);
    }

    await goto(navigateTo);
  }
</script>

<div class="flex flex-col min-h-screen bg-canvas">
  <CookTopBar
    {recipe}
    {batch}
    {started}
    {elapsedMs}
    onEndCook={() => endCookOpen = true}
  />

  {#if !started}
    <CookStartBanner onStart={handleStart} />
  {/if}

  <CookIngredients
    ingredients={batch.ingredients}
    steps={batch.steps}
    {currentStepIndex}
    {checkedSteps}
    {multiplier}
    onMultiplierChange={(next) => multiplier = next}
  />

  <CookStepList
    steps={batch.steps}
    ingredients={batch.ingredients}
    {checkedSteps}
    {currentStepIndex}
    {activeTimerKeys}
    {multiplier}
    onCheck={handleCheck}
    onStartTimer={handleStartTimer}
  />

  <div class="flex-1"></div>

  <CookQuickNoteFab bind:notes={quickNotes} />

  <CookTimerDock
    {timers}
    onPauseToggle={handlePauseToggle}
    onRemove={handleRemoveTimer}
    onAddManual={handleAddManual}
  />
</div>

<EndCookDialog
  bind:open={endCookOpen}
  {batch}
  startedAt={startedAt ?? Date.now()}
  {elapsedMs}
  {timersStarted}
  stepsChecked={checkedSteps.size}
  stepsTotal={batch.steps.length}
  {quickNotes}
  {multiplier}
  onSubmit={handleEndCookSubmit}
/>
