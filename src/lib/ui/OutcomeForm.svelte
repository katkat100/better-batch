<!-- src/lib/ui/OutcomeForm.svelte -->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { api } from './api-client';
  import Rating from './Rating.svelte';
  import type { Batch } from '$lib/server';

  let {
    batch,
    recipeId,
    mode = 'cook',
    onClose
  }: {
    batch: Batch;
    recipeId: string;
    mode?: 'cook' | 'edit';
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
      // In cook mode flip to cooked; in edit mode keep status as-is
      const patch: Partial<Batch> = { outcomeNotes, rating };
      if (mode === 'cook') patch.status = 'cooked';
      await api.patchBatch(recipeId, batch.id, patch);
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
    <h2 class="font-serif text-xl">
      {mode === 'edit' ? `Edit outcome for ${batch.id}` : `Mark ${batch.id} as cooked`}
    </h2>

    {#if mode === 'cook'}
      <div class="border border-ochre bg-ochre/10 text-ochre p-3 rounded-sm text-sm" data-testid="cook-warning">
        <strong class="block">This will freeze the batch.</strong>
        <span class="opacity-90">Only outcome notes and rating will remain editable. Use Cancel to keep the batch as a draft.</span>
      </div>
    {/if}

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
      >{submitting ? 'Saving…' : (mode === 'edit' ? 'Save' : 'Archive Batch')}</button>
    </div>
  </form>
</div>
