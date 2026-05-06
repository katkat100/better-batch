<!-- src/lib/ui/EditVariablesDialog.svelte -->
<script lang="ts">
  import type { VariableSchemaItem, VariableType } from '$lib/server';
  import { api } from '$lib/ui/api-client';
  import { untrack } from 'svelte';

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

  function backdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget && !submitting) close();
  }
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && !submitting && close()} />

{#if open}
  <div
    class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-50"
    onclick={backdropClick}
    onkeydown={(e) => e.key === 'Escape' && !submitting && close()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="edit-variables-dialog-title"
    tabindex="-1"
  >
    <form
      onsubmit={save}
      class="bg-canvas border border-obsidian p-6 w-full max-w-2xl flex flex-col gap-4 rounded-sm max-h-[90vh] overflow-auto"
      data-testid="edit-variables-dialog"
    >
      <div>
        <h2 id="edit-variables-dialog-title" class="font-serif text-xl">Edit Variables</h2>
        <p class="text-sm text-obsidian/60 mt-1">Changes apply to all batches in this recipe.</p>
      </div>

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
                  <button
                    type="button"
                    onclick={() => confirmRemove(i)}
                    class="border border-ochre text-ochre px-2 py-1 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm"
                    data-testid="var-remove-confirm"
                  >Confirm</button>
                  <button
                    type="button"
                    onclick={() => cancelRemove(i)}
                    class="px-2 py-1 text-xs text-obsidian/60 hover:text-obsidian"
                    data-testid="var-remove-cancel"
                  >Cancel</button>
                </div>
              </div>
            {:else}
              <div class="flex gap-2 items-center">
                <input
                  bind:value={row.name}
                  placeholder="Name"
                  class="flex-1 border border-drafting bg-canvas px-2 py-1 rounded-sm text-sm"
                  data-testid="var-name"
                />
                <input
                  bind:value={row.unit}
                  placeholder="Unit"
                  class="w-24 border border-drafting bg-canvas px-2 py-1 rounded-sm text-sm font-mono"
                  data-testid="var-unit"
                />
                <select
                  bind:value={row.type}
                  class="border border-drafting bg-canvas px-2 py-1 rounded-sm text-sm"
                  data-testid="var-type"
                >
                  <option value="number">number</option>
                  <option value="text">text</option>
                </select>
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

      <button
        type="button"
        onclick={addRow}
        class="border border-dashed border-drafting text-obsidian/60 hover:text-ochre hover:border-ochre px-3 py-2 text-sm rounded-sm"
        data-testid="add-variable-btn"
      >+ Add Variable</button>

      <div class="flex justify-end gap-2 pt-2 border-t border-drafting">
        <button
          type="button"
          onclick={close}
          disabled={submitting}
          class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian"
          data-testid="edit-variables-cancel"
        >Cancel</button>
        <button
          type="submit"
          disabled={!canSave}
          class="border border-ochre {canSave ? 'bg-ochre text-canvas' : 'text-ochre opacity-50'} px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:cursor-not-allowed rounded-sm"
          data-testid="edit-variables-submit"
        >{submitting ? 'Saving…' : 'Save Changes'}</button>
      </div>
    </form>
  </div>
{/if}
