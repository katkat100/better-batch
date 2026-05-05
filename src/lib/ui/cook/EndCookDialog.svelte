<!-- src/lib/ui/cook/EndCookDialog.svelte -->
<script lang="ts">
  import Rating from '../Rating.svelte';
  import { buildEndCookPatch } from './layout/end-cook-patch';
  import type { Batch } from '$lib/server';

  let {
    open = $bindable(false),
    batch,
    startedAt,
    elapsedMs,
    timersStarted,
    stepsChecked,
    stepsTotal,
    quickNotes,
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
        existingOutcomeNotes: batch.outcomeNotes
      });
      await onSubmit({ patch, forkAsDraft, forkLabel: forkLabel.trim() });
      close();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save cook';
    } finally {
      submitting = false;
    }
  }

  function backdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <div
    class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-50 p-4"
    onclick={backdropClick}
    onkeydown={(e) => e.key === 'Escape' && close()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="end-cook-dialog-title"
    tabindex="-1"
  >
    <form
      onsubmit={submit}
      class="bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm max-h-[90vh] overflow-y-auto"
      data-testid="end-cook-dialog"
    >
      <h2 id="end-cook-dialog-title" class="font-serif text-xl">
        {mode === 're-cook' ? 'End Re-cook' : 'End Cook'} · {batch.label}
      </h2>

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
            <input type="checkbox" bind:checked={forkAsDraft} data-testid="fork-as-draft-checkbox" />
            Save these as a new draft batch
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
        <button type="button" onclick={close} class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</button>
        <button
          type="submit"
          disabled={submitting}
          class="border border-juniper text-juniper px-4 py-2 text-sm uppercase tracking-wider hover:bg-juniper hover:text-canvas disabled:opacity-50 rounded-sm"
          data-testid="end-cook-submit"
        >{submitting ? 'Saving…' : 'Save Cook'}</button>
      </div>
    </form>
  </div>
{/if}
