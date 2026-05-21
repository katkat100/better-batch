<!-- src/lib/ui/ConfirmDeleteDialog.svelte -->
<script lang="ts">
  import Dialog from '$lib/ui/primitives/Dialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import TextInput from '$lib/ui/primitives/TextInput.svelte';

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
</script>

<Dialog
  bind:open
  {title}
  titleId="confirm-delete-dialog-title"
  onClose={close}
>
  {#snippet actions()}
    <Button
      type="button"
      variant="ghost"
      onclick={close}
      data-testid="confirm-delete-cancel"
    >Cancel</Button>
    <Button
      type="submit"
      form="confirm-delete-form"
      variant={canConfirm ? 'primary' : 'outline'}
      disabled={!canConfirm}
      data-testid="confirm-delete-submit"
    >{submitting ? 'Deleting…' : confirmLabel}</Button>
  {/snippet}
  <form
    id="confirm-delete-form"
    onsubmit={submit}
    class="flex flex-col gap-4"
    data-testid="confirm-delete-dialog"
  >
    <p class="text-sm whitespace-pre-wrap">{body}</p>

    {#if mode === 'typed'}
      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Type to confirm</span>
        <TextInput
          bind:element={typedEl}
          bind:value={typedInput}
          class="font-mono"
          data-testid="confirm-delete-input"
        />
      </label>
    {/if}

    {#if error}
      <p class="text-ochre text-sm" data-testid="confirm-delete-error">{error}</p>
    {/if}
  </form>
</Dialog>
