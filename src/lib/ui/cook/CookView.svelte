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
  import { saveSession, loadSession, clearSession, type CookSessionV1 } from './cook-session';
  import { api } from '../api-client';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { SvelteSet } from 'svelte/reactivity';
  import { onMount, onDestroy, untrack } from 'svelte';
  import type { Recipe, Batch } from '$lib/server';
  import type { TimerMatch } from './layout/timer-parse';
  import type { Multiplier } from '../MultiplierToggle.svelte';
  import CookEditPanel from './CookEditPanel.svelte';
  import { moveItem } from '$lib/shared/array';
  import { isContentDirty, cleanBatchContent, summarizeEdits } from '../layout/batch-content';
  import { validateBatch } from '$lib/shared/batch-validation';
  import { mapIndexThroughRemove, mapIndexThroughMove, checkedAfterRemove, checkedAfterMove } from './layout/remap-cook-state';

  let {
    recipe,
    batch
  }: {
    recipe: Recipe;
    batch: Batch;
  } = $props();

  // Restore a suspended session for this exact batch, if one exists on the device.
  const restored = untrack(() => loadSession(recipe.id, batch.id));

  // Working copy of the editable batch content. All cook rendering reads this;
  // `batch` stays the immutable original (for the outcome record + dirty checks).
  let draft = $state(
    untrack(() =>
      restored
        ? structuredClone(restored.draft)
        : structuredClone({
            label: batch.label,
            variables: batch.variables,
            ingredients: batch.ingredients,
            steps: batch.steps
          })
    )
  );

  let multiplier = $state<Multiplier>((restored?.multiplier as Multiplier) ?? 1);
  let started = $state(restored?.started ?? false);
  let startedAt = $state<number | null>(restored?.startedAt ?? null);
  let elapsedMs = $state(restored && restored.startedAt !== null ? Date.now() - restored.startedAt : 0);
  let checkedSteps = $state(new Set<number>(restored?.checkedSteps ?? []));
  let quickNotes = $state<string[]>(restored?.quickNotes ?? []);
  let timers = $state<DockTimer[]>(restored?.timers ?? []);
  let timersStarted = $state(0);
  let endCookOpen = $state(false);
  let wasFullChecked = $state(false);
  let editing = $state(false);
  const isDirty = $derived(isContentDirty(draft, batch));

  const currentStepIndex = $derived.by(() => {
    for (let i = 0; i < draft.steps.length; i++) {
      if (!checkedSteps.has(i)) return i;
    }
    return -1;
  });

  const activeTimerKeys = $derived(new Set(
    timers.filter(t => !t.finished).map(t => `${t.stepIndex}:${t.startedAt}`)
  ));

  // Auto-save the whole session on any change. `structuredClone` deep-reads the
  // draft/timers proxies, so this effect re-subscribes on every nested edit
  // (e.g. typing in an ingredient name), not just on array reassignment.
  // localStorage writes are cheap and user-paced, so no debounce is needed.
  $effect(() => {
    const session: CookSessionV1 = {
      v: 1,
      recipeId: recipe.id,
      batchId: batch.id,
      draft: structuredClone({
        label: draft.label,
        variables: draft.variables,
        ingredients: draft.ingredients,
        steps: draft.steps
      }),
      started,
      startedAt,
      checkedSteps: [...checkedSteps],
      quickNotes: [...quickNotes],
      multiplier,
      timers: structuredClone(timers)
    };
    saveSession(session);
  });

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

    if (restored) {
      const now = Date.now();
      for (const t of timers) {
        if (t.finished || t.pausedAt !== null) continue;
        const remaining = t.durationMs - (now - t.startedAt - t.pausedAccumMs);
        if (remaining > 0) void scheduleTimerNotification(t.id, remaining, t.label, t.stepIndex);
      }
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
    if (started && next.size === draft.steps.length && !wasFullChecked) {
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

  function handleAddStep() {
    draft.steps = [...draft.steps, { text: '', uses: [] }];
  }

  function handleRemoveStep(i: number) {
    checkedSteps = checkedAfterRemove(checkedSteps, i);
    timers = timers.map((t) => {
      if (t.stepIndex < 0) return t;
      const m = mapIndexThroughRemove(t.stepIndex, i);
      return { ...t, stepIndex: m === null ? -1 : m };
    });
    draft.steps = draft.steps.filter((_, idx) => idx !== i);
  }

  function handleMoveStep(from: number, to: number) {
    if (to < 0 || to >= draft.steps.length) return;
    checkedSteps = checkedAfterMove(checkedSteps, from, to);
    timers = timers.map((t) => (t.stepIndex < 0 ? t : { ...t, stepIndex: mapIndexThroughMove(t.stepIndex, from, to) }));
    draft.steps = moveItem(draft.steps, from, to);
  }

  function handleRemoveIngredient(removedId: string) {
    draft.steps = draft.steps.map((s) => ({
      ...s,
      uses: s.uses.filter((u) => u.ingredientId !== removedId)
    }));
  }

  async function handleEndCookSubmit(input: {
    patch: Partial<Batch>;
    forkAsDraft: boolean;
    forkLabel: string;
  }) {
    let navigateTo = resolve(`/recipes/${recipe.id}?batch=${batch.id}`);

    // The original batch is always recorded as cooked.
    if (Object.keys(input.patch).length > 0) {
      await api.patchBatch(recipe.id, batch.id, input.patch);
    }

    // A fork is created when the working copy changed, or when the user opted to
    // carry quick notes into a new batch.
    if (input.forkAsDraft) {
      const { ingredients, steps } = cleanBatchContent({
        ingredients: draft.ingredients,
        steps: draft.steps
      });
      const variables = structuredClone(draft.variables);
      const notes = quickNotes.length > 0
        ? `Captured during cook:\n${quickNotes.map((n) => `• ${n}`).join('\n')}`
        : '';
      const issues = validateBatch({
        id: 'fork',
        recipeId: recipe.id,
        label: input.forkLabel || `improvements from ${batch.label}`,
        parentIds: [batch.id],
        status: 'draft',
        cookedAt: null,
        variables,
        ingredients,
        steps,
        outcomeNotes: notes,
        rating: null,
        createdAt: new Date().toISOString()
      });
      const newBatch = await api.createBatch(recipe.id, {
        label: input.forkLabel || `improvements from ${batch.label}`,
        parentIds: [batch.id],
        status: 'draft',
        variables,
        ingredients,
        steps,
        outcomeNotes: notes,
        inconsistencyNote: issues.length > 0 ? ' ' : ''
      });
      navigateTo = resolve(`/recipes/${recipe.id}?batch=${newBatch.id}`);
    }

    clearSession(recipe.id, batch.id);
    await goto(navigateTo);
  }
</script>

<div class="flex flex-col min-h-screen bg-canvas">
  <CookTopBar
    {recipe}
    {batch}
    {started}
    {elapsedMs}
    {editing}
    {isDirty}
    onToggleEdit={() => editing = !editing}
    onEndCook={() => endCookOpen = true}
  />

  {#if !started}
    <CookStartBanner onStart={handleStart} />
  {/if}

  {#if editing}
    <CookEditPanel
      {recipe}
      bind:variables={draft.variables}
      bind:ingredients={draft.ingredients}
      bind:steps={draft.steps}
      onAddStep={handleAddStep}
      onRemoveStep={handleRemoveStep}
      onMoveStep={handleMoveStep}
      onRemoveIngredient={handleRemoveIngredient}
    />
  {:else}
    <CookIngredients
      ingredients={draft.ingredients}
      steps={draft.steps}
      {currentStepIndex}
      {checkedSteps}
      {multiplier}
      onMultiplierChange={(next) => multiplier = next}
    />

    <CookStepList
      steps={draft.steps}
      ingredients={draft.ingredients}
      {checkedSteps}
      {currentStepIndex}
      {activeTimerKeys}
      {multiplier}
      onCheck={handleCheck}
      onStartTimer={handleStartTimer}
    />
  {/if}

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
  stepsTotal={draft.steps.length}
  {quickNotes}
  {multiplier}
  {isDirty}
  changeSummary={summarizeEdits(batch, draft)}
  onSubmit={handleEndCookSubmit}
/>
