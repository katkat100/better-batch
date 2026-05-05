<!-- src/lib/ui/ConfirmDeleteDialog.svelte -->
<script lang="ts">
  let {
    open = $bindable(false),
    title,
    body,
    confirmLabel,
    mode = 'simple',
    typedMatch = '',
    onConfirm
  }: {
    open?: boolean;
    title: string;
    body: string;
    confirmLabel: string;
    mode?: 'simple' | 'typed';
    typedMatch?: string;
    onConfirm: () => Promise<void> | void;
  } = $props();

  let typedInput = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  const canConfirm = $derived(
    !submitting && (mode === 'simple' || typedInput.trim() === typedMatch)
  );

  function close() {
    open = false;
    typedInput = '';
    error = null;
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!canConfirm) return;
    submitting = true;
    error = null;
    try {
      await onConfirm();
      close();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to delete';
    } finally {
      submitting = false;
    }
  }

  let typedEl = $state<HTMLInputElement | undefined>();
  $effect(() => {
    if (open && mode === 'typed') typedEl?.focus();
  });

  function backdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

{#if open}
  <div
    class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-50"
    onclick={backdropClick}
    onkeydown={(e) => e.key === 'Escape' && close()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="confirm-delete-dialog-title"
    tabindex="-1"
  >
    <form
      onsubmit={submit}
      class="bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm"
      data-testid="confirm-delete-dialog"
    >
      <h2 id="confirm-delete-dialog-title" class="font-serif text-xl">{title}</h2>
      <p class="text-sm whitespace-pre-wrap">{body}</p>

      {#if mode === 'typed'}
        <label class="flex flex-col gap-1 text-sm">
          <span class="text-[11px] uppercase tracking-wider">Type to confirm</span>
          <input
            bind:this={typedEl}
            bind:value={typedInput}
            class="border border-drafting bg-canvas px-3 py-2 rounded-sm font-mono"
            data-testid="confirm-delete-input"
          />
        </label>
      {/if}

      {#if error}
        <p class="text-ochre text-sm" data-testid="confirm-delete-error">{error}</p>
      {/if}

      <div class="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onclick={close}
          class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian"
          data-testid="confirm-delete-cancel"
        >Cancel</button>
        <button
          type="submit"
          disabled={!canConfirm}
          class="border border-ochre {canConfirm ? 'bg-ochre text-canvas' : 'text-ochre opacity-50'} px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:cursor-not-allowed rounded-sm"
          data-testid="confirm-delete-submit"
        >{submitting ? 'Deleting…' : confirmLabel}</button>
      </div>
    </form>
  </div>
{/if}
