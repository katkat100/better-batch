<!-- src/lib/ui/EditVariablesDialog.svelte -->
<script lang="ts">
  import type { VariableSchemaItem, VariableType } from '$lib/server';
  import { api } from '$lib/ui/api-client';
  import { untrack } from 'svelte';
  import Dialog from '$lib/ui/primitives/Dialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import TextInput from '$lib/ui/primitives/TextInput.svelte';
  import Select from '$lib/ui/primitives/Select.svelte';

  let {
    open = $bindable(false),
    recipeId,
    schema,
    onSaved
  }: {
    open?: boolean;
    recipeId: string;
    schema: VariableSchemaItem[];
    onSaved: () => Promise<void> | void;
  } = $props();

  type Row = { name: string; unit: string; type: VariableType; originalType: VariableType | null; confirming: boolean };

  function toRows(s: VariableSchemaItem[]): Row[] {
    return s.map(v => ({ name: v.name, unit: v.unit, type: v.type, originalType: v.type, confirming: false }));
  }

  let rows = $state<Row[]>(untrack(() => toRows(schema)));
  let submitting = $state(false);
  let serverError = $state<string | null>(null);

  $effect(() => {
    if (open) {
      rows = toRows(schema);
      serverError = null;
    }
  });

  const trimmedNames = $derived(rows.map(r => r.name.trim()));
  const emptyNameIdx = $derived(trimmedNames.findIndex(n => n === ''));
  const duplicateNames = $derived.by(() => {
    const seen = new Set<string>();
    const dups = new Set<string>();
    for (const n of trimmedNames) {
      const key = n.toLowerCase();
      if (key === '') continue;
      if (seen.has(key)) dups.add(key);
      seen.add(key);
    }
    return dups;
  });
  const canSave = $derived(!submitting && emptyNameIdx === -1 && duplicateNames.size === 0);

  function isDuplicate(i: number): boolean {
    const key = trimmedNames[i].toLowerCase();
    if (key === '') return false;
    return duplicateNames.has(key) && trimmedNames.findIndex(n => n.toLowerCase() === key) !== i;
  }

  function addRow() {
    rows = [...rows, { name: '', unit: '', type: 'number', originalType: null, confirming: false }];
  }

  function startRemove(i: number) {
    rows = rows.map((r, idx) => idx === i ? { ...r, confirming: true } : r);
  }
  function cancelRemove(i: number) {
    rows = rows.map((r, idx) => idx === i ? { ...r, confirming: false } : r);
  }
  function confirmRemove(i: number) {
    rows = rows.filter((_, idx) => idx !== i);
  }

  function close() {
    open = false;
  }

  async function save(e: SubmitEvent) {
    e.preventDefault();
    if (!canSave) return;
    submitting = true;
    serverError = null;
    try {
      const next: VariableSchemaItem[] = rows.map(r => ({
        name: r.name.trim(),
        unit: r.unit.trim(),
        type: r.type
      }));
      await api.patchRecipe(recipeId, { variableSchema: next });
      await onSaved();
      close();
    } catch (err) {
      serverError = err instanceof Error ? err.message : 'Failed to save';
    } finally {
      submitting = false;
    }
  }
</script>

<Dialog
  bind:open
  title="Edit Variables"
  titleId="edit-variables-dialog-title"
  subtitle="Changes apply to all batches in this recipe."
  class="max-w-2xl"
  onClose={() => { if (!submitting) close(); }}
>
  <form
    onsubmit={save}
    class="flex flex-col gap-4"
    data-testid="edit-variables-dialog"
  >
    {#if serverError}
      <p class="text-ochre text-sm" data-testid="edit-variables-error">{serverError}</p>
    {/if}

    <div class="flex flex-col gap-2">
      {#each rows as row, i (i)}
        <div
          class="flex flex-col gap-1 border border-drafting/50 p-2 rounded-sm"
          data-testid="var-edit-row"
        >
          {#if row.confirming}
            <div class="flex items-center justify-between gap-2 text-sm">
              <span>Remove "{row.name.trim() || '(unnamed)'}"?</span>
              <div class="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onclick={() => confirmRemove(i)}
                  data-testid="var-remove-confirm"
                >Confirm</Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onclick={() => cancelRemove(i)}
                  data-testid="var-remove-cancel"
                >Cancel</Button>
              </div>
            </div>
          {:else}
            <div class="flex gap-2 items-center">
              <TextInput
                bind:value={row.name}
                placeholder="Name"
                class="flex-1 px-2 py-1"
                data-testid="var-name"
              />
              <TextInput
                bind:value={row.unit}
                placeholder="Unit"
                class="w-24 px-2 py-1 font-mono"
                data-testid="var-unit"
              />
              <Select
                bind:value={row.type}
                class="px-2 py-1"
                data-testid="var-type"
              >
                <option value="number">number</option>
                <option value="text">text</option>
              </Select>
              <button
                type="button"
                onclick={() => startRemove(i)}
                aria-label="Remove variable"
                class="text-obsidian/50 hover:text-ochre px-2"
                data-testid="var-remove"
              >×</button>
            </div>
            {#if row.name.trim() === ''}
              <p class="text-ochre text-xs">Name is required.</p>
            {:else if isDuplicate(i)}
              <p class="text-ochre text-xs">Duplicate name.</p>
            {/if}
            {#if row.originalType !== null && row.type !== row.originalType}
              <p class="text-obsidian/60 text-xs">Existing values may not parse cleanly under the new type.</p>
            {/if}
          {/if}
        </div>
      {/each}
    </div>

    <Button
      type="button"
      variant="dashed"
      onclick={addRow}
      class="text-sm normal-case tracking-normal"
      data-testid="add-variable-btn"
    >+ Add Variable</Button>

    <div class="flex justify-end gap-2 pt-2 border-t border-drafting">
      <Button
        type="button"
        variant="ghost"
        onclick={close}
        disabled={submitting}
        data-testid="edit-variables-cancel"
      >Cancel</Button>
      <Button
        type="submit"
        variant={canSave ? 'primary' : 'outline'}
        disabled={!canSave}
        data-testid="edit-variables-submit"
      >{submitting ? 'Saving…' : 'Save Changes'}</Button>
    </div>
  </form>
</Dialog>
