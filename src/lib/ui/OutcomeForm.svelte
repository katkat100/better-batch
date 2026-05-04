<!-- src/lib/ui/OutcomeForm.svelte -->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { api } from './api-client';
  import Rating from './Rating.svelte';
  import type { Batch } from '$lib/server';

  let {
    batch,
    recipeId,
    onClose
  }: {
    batch: Batch;
    recipeId: string;
    onClose: () => void;
  } = $props();

  let outcomeNotes = $state(batch.outcomeNotes ?? '');
  let rating = $state<1 | 2 | 3 | 4 | 5 | null>(batch.rating ?? null);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = null;
    try {
      await api.patchBatch(recipeId, batch.id, {
        status: 'cooked',
        outcomeNotes,
        rating
      });
      await invalidateAll();
      onClose();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save';
    } finally {
      submitting = false;
    }
  }
</script>

<div
  class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-50"
  onclick={onClose}
  onkeydown={(e) => e.key === 'Escape' && onClose()}
  role="presentation"
>
  <form
    onsubmit={submit}
    onclick={(e) => e.stopPropagation()}
    class="bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm"
    data-testid="outcome-form"
  >
    <h2 class="font-serif text-xl">Mark {batch.id} as cooked</h2>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-wider">Outcome notes</span>
      <textarea
        bind:value={outcomeNotes}
        rows="4"
        placeholder="Crumb, crust, taste, what to change next time…"
        class="border border-drafting bg-canvas px-3 py-2 rounded-sm resize-none"
        data-testid="outcome-notes"
        autofocus
      ></textarea>
    </label>

    <div class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-wider">Rating</span>
      <Rating value={rating} editable onChange={(v) => rating = v} />
    </div>

    {#if error}
      <p class="text-ochre text-sm">{error}</p>
    {/if}

    <div class="flex justify-end gap-2 pt-2">
      <button type="button" onclick={onClose} class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</button>
      <button
        type="submit"
        disabled={submitting}
        class="border border-juniper text-juniper px-4 py-2 text-sm uppercase tracking-wider hover:bg-juniper hover:text-canvas disabled:opacity-50 rounded-sm"
        data-testid="outcome-submit"
      >{submitting ? 'Saving…' : 'Archive Batch'}</button>
    </div>
  </form>
</div>
