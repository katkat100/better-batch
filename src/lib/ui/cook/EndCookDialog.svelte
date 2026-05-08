<!-- src/lib/ui/cook/EndCookDialog.svelte -->
<script lang="ts">
  import Rating from '../Rating.svelte';
  import { buildEndCookPatch } from './layout/end-cook-patch';
  import type { Batch } from '$lib/server';
  import Dialog from '$lib/ui/primitives/Dialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import Checkbox from '$lib/ui/primitives/Checkbox.svelte';

  let {
    open = $bindable(false),
    batch,
    startedAt,
    elapsedMs,
    timersStarted,
    stepsChecked,
    stepsTotal,
    quickNotes,
    multiplier,
    onSubmit
  }: {
    open?: boolean;
    batch: Batch;
    startedAt: number;
    elapsedMs: number;
    timersStarted: number;
    stepsChecked: number;
    stepsTotal: number;
    quickNotes: string[];
    multiplier: number;
    onSubmit: (input: {
      patch: Partial<Batch>;
      forkAsDraft: boolean;
      forkLabel: string;
    }) => Promise<void>;
  } = $props();

  const mode = $derived<'first-cook' | 're-cook'>(batch.status === 'cooked' ? 're-cook' : 'first-cook');

  let outcomeNotes = $state('');
  let rating = $state<1 | 2 | 3 | 4 | 5 | null>(null);
  let forkAsDraft = $state(false);
  let forkLabel = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (open) {
      outcomeNotes = '';
      rating = batch.rating ?? null;
      forkAsDraft = false;
      forkLabel = `improvements from ${batch.label}`;
      error = null;
    }
  });

  function fmtElapsed(ms: number): string {
    const totalMin = Math.floor(ms / 60_000);
    if (totalMin < 60) return `${totalMin} min`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${h}h ${m}m`;
  }

  function close() { open = false; }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = null;
    try {
      const patch = buildEndCookPatch({
        mode,
        startedAt,
        endedAt: startedAt + elapsedMs,
        outcomeNotes,
        rating,
        existingOutcomeNotes: batch.outcomeNotes,
        multiplier
      });
      await onSubmit({ patch, forkAsDraft, forkLabel: forkLabel.trim() });
      close();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save cook';
    } finally {
      submitting = false;
    }
  }

</script>

<Dialog
  bind:open
  title="{mode === 're-cook' ? 'End Re-cook' : 'End Cook'} · {batch.label}"
  titleId="end-cook-dialog-title"
  onClose={close}
>
  <form onsubmit={submit} data-testid="end-cook-dialog" class="flex flex-col gap-4">
    <div class="grid grid-cols-3 gap-2 text-xs border border-drafting p-2 rounded-sm" data-testid="end-cook-summary">
      <div><span class="block text-[10px] uppercase tracking-wider text-obsidian/50">Elapsed</span><span class="font-mono">{fmtElapsed(elapsedMs)}</span></div>
      <div><span class="block text-[10px] uppercase tracking-wider text-obsidian/50">Steps</span><span class="font-mono">{stepsChecked}/{stepsTotal}</span></div>
      <div><span class="block text-[10px] uppercase tracking-wider text-obsidian/50">Timers</span><span class="font-mono">{timersStarted}</span></div>
    </div>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-wider">{mode === 're-cook' ? 'Notes for this cook' : 'Outcome notes'}</span>
      <textarea
        bind:value={outcomeNotes}
        rows="4"
        placeholder="Crumb, crust, taste, what to change next time…"
        class="border border-drafting bg-canvas px-3 py-2 rounded-sm resize-none"
        data-testid="end-cook-notes"
      ></textarea>
    </label>

    {#if mode === 'first-cook'}
      <div class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Rating</span>
        <Rating value={rating} editable onChange={(v) => rating = v} />
      </div>
    {/if}

    {#if quickNotes.length > 0}
      <div class="flex flex-col gap-2 border border-drafting/60 p-3 rounded-sm" data-testid="quick-notes-recap">
        <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Improvement ideas captured ({quickNotes.length})</span>
        <ul class="text-sm list-disc pl-5 space-y-1">
          {#each quickNotes as note (note)}
            <li>{note}</li>
          {/each}
        </ul>
        <label class="flex items-center gap-2 text-sm">
          <Checkbox bind:checked={forkAsDraft} data-testid="fork-as-draft-checkbox" />
          Carry these ideas into a new batch
        </label>
        {#if forkAsDraft}
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-[10px] uppercase tracking-wider">New batch label</span>
            <input bind:value={forkLabel} class="border border-drafting bg-canvas px-2 py-1 rounded-sm" data-testid="fork-label" />
          </label>
        {/if}
      </div>
    {/if}

    {#if error}
      <p class="text-ochre text-sm">{error}</p>
    {/if}

    <div class="flex justify-end gap-2 pt-2">
      <Button type="button" variant="ghost" onclick={close}>Cancel</Button>
      <Button
        type="submit"
        variant="success"
        disabled={submitting}
        data-testid="end-cook-submit"
      >{submitting ? 'Saving…' : 'Save Cook'}</Button>
    </div>
  </form>
</Dialog>
