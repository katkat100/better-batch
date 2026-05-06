<!-- src/lib/ui/cook/CookQuickNoteFab.svelte -->
<script lang="ts">
  let {
    notes = $bindable([])
  }: {
    notes?: string[];
  } = $props();

  let open = $state(false);
  let draft = $state('');
  let editingIndex = $state<number | null>(null);
  let editDraft = $state('');

  function close() {
    open = false;
    draft = '';
    editingIndex = null;
    editDraft = '';
  }

  function addNote() {
    const t = draft.trim();
    if (!t) return;
    notes = [...notes, t];
    draft = '';
  }

  function startEdit(i: number) {
    editingIndex = i;
    editDraft = notes[i];
  }

  function saveEdit() {
    if (editingIndex === null) return;
    const t = editDraft.trim();
    if (!t) return;
    const next = [...notes];
    next[editingIndex] = t;
    notes = next;
    editingIndex = null;
    editDraft = '';
  }

  function cancelEdit() {
    editingIndex = null;
    editDraft = '';
  }

  function removeNote(i: number) {
    notes = notes.filter((_, idx) => idx !== i);
    if (editingIndex === i) cancelEdit();
  }

  function backdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) close();
  }
</script>

<svelte:window onkeydown={(e) => open && e.key === 'Escape' && close()} />

<button
  type="button"
  onclick={() => open = true}
  class="fixed bottom-20 right-4 z-30 w-12 h-12 bg-ochre text-canvas rounded-full shadow-lg flex items-center justify-center text-lg hover:bg-obsidian"
  aria-label="Notes for next batch ({notes.length} captured)"
  data-testid="quick-note-fab"
>
  📝
  {#if notes.length > 0}
    <span class="absolute -top-1 -right-1 bg-juniper text-canvas text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center" data-testid="quick-note-badge">{notes.length}</span>
  {/if}
</button>

{#if open}
  <div
    class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-40 p-4"
    onclick={backdropClick}
    onkeydown={(e) => e.key === 'Escape' && close()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="quick-note-title"
    tabindex="-1"
  >
    <div
      class="bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm max-h-[90vh] overflow-y-auto"
      data-testid="quick-note-modal"
    >
      <div class="flex items-baseline justify-between">
        <h2 id="quick-note-title" class="font-serif text-lg">Notes for next batch</h2>
        <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{notes.length} captured</span>
      </div>

      {#if notes.length > 0}
        <ul class="flex flex-col gap-2" data-testid="quick-note-list">
          {#each notes as note, i (i)}
            <li class="border border-drafting rounded-sm p-2 flex flex-col gap-2 text-sm" data-testid="quick-note-item">
              {#if editingIndex === i}
                <textarea
                  bind:value={editDraft}
                  rows="3"
                  class="border border-drafting bg-canvas px-2 py-1 rounded-sm resize-none text-sm"
                  aria-label="Edit note {i + 1}"
                ></textarea>
                <div class="flex justify-end gap-2">
                  <button type="button" onclick={cancelEdit} class="text-xs text-obsidian/60 hover:text-obsidian">Cancel</button>
                  <button type="button" onclick={saveEdit} class="border border-juniper text-juniper px-3 py-1 text-xs uppercase tracking-wider hover:bg-juniper hover:text-canvas rounded-sm" data-testid="quick-note-save-edit">Save</button>
                </div>
              {:else}
                <p class="whitespace-pre-wrap">{note}</p>
                <div class="flex justify-end gap-2">
                  <button
                    type="button"
                    onclick={() => removeNote(i)}
                    class="text-[10px] uppercase tracking-wider text-ochre/70 hover:text-ochre"
                    data-testid="quick-note-delete"
                    aria-label="Delete note {i + 1}"
                  >Delete</button>
                  <button
                    type="button"
                    onclick={() => startEdit(i)}
                    class="text-[10px] uppercase tracking-wider text-obsidian/60 hover:text-obsidian"
                    data-testid="quick-note-edit"
                    aria-label="Edit note {i + 1}"
                  >Edit</button>
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      <div class="flex flex-col gap-2 border-t border-drafting pt-3">
        <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Add a new note</span>
        <textarea
          bind:value={draft}
          rows="3"
          placeholder="What would you change next time?"
          class="border border-drafting bg-canvas px-3 py-2 rounded-sm resize-none text-sm"
          data-testid="quick-note-textarea"
        ></textarea>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            onclick={addNote}
            disabled={!draft.trim()}
            class="border border-ochre text-ochre px-3 py-1.5 text-xs uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:opacity-40 disabled:cursor-not-allowed rounded-sm"
            data-testid="quick-note-save"
          >+ Add note</button>
        </div>
      </div>

      <div class="flex justify-end pt-2 border-t border-drafting">
        <button type="button" onclick={close} class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian" data-testid="quick-note-close">Close</button>
      </div>
    </div>
  </div>
{/if}
