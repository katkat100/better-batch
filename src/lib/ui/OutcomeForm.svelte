<!-- src/lib/ui/OutcomeForm.svelte -->
<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { untrack } from 'svelte';
  import { api } from './api-client';
  import Rating from './Rating.svelte';
  import type { Batch } from '$lib/server';
  import Dialog from '$lib/ui/primitives/Dialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';

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

  let outcomeNotes = $state(untrack(() => batch.outcomeNotes ?? ''));
  let rating = $state<1 | 2 | 3 | 4 | 5 | null>(untrack(() => batch.rating ?? null));
  let submitting = $state(false);
  let error = $state<string | null>(null);

  let notesEl = $state<HTMLTextAreaElement | undefined>();
  $effect(() => {
    notesEl?.focus();
  });

  const dialogTitle = $derived(
    mode === 'edit' ? `Edit outcome for ${batch.label}` : `Mark ${batch.label} as cooked`
  );

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = null;
    try {
      // In cook mode flip to cooked; in edit mode keep status as-is
      const patch: Partial<Batch> = { outcomeNotes, rating };
      if (mode === 'cook') {
        patch.status = 'cooked';
        patch.cookedAt = new Date().toISOString();
      }
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

<Dialog
  open={true}
  title={dialogTitle}
  titleId="outcome-form-title"
  onClose={onClose}
>
  <form
    onsubmit={submit}
    class="flex flex-col gap-4"
    data-testid="outcome-form"
  >
    {#if mode === 'cook'}
      <div class="border border-ochre bg-ochre/10 text-ochre p-3 rounded-sm text-sm" data-testid="cook-warning">
        <strong class="block">This will freeze the batch.</strong>
        <span class="opacity-90">Only outcome notes and rating will remain editable. Use Cancel to keep the batch as a draft.</span>
      </div>
    {/if}

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-wider">Outcome notes</span>
      <textarea
        bind:this={notesEl}
        bind:value={outcomeNotes}
        rows="4"
        placeholder="Crumb, crust, taste, what to change next time…"
        class="border border-drafting bg-canvas px-3 py-2 rounded-sm resize-none"
        data-testid="outcome-notes"
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
      <Button type="button" variant="ghost" onclick={onClose}>Cancel</Button>
      <Button
        type="submit"
        variant="success"
        disabled={submitting}
        data-testid="outcome-submit"
      >{submitting ? 'Saving…' : (mode === 'edit' ? 'Save' : 'Archive Batch')}</Button>
    </div>
  </form>
</Dialog>
