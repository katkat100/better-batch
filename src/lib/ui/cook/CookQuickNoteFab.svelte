<!-- src/lib/ui/cook/CookQuickNoteFab.svelte -->
<script lang="ts">
  let {
    notes = $bindable([])
  }: {
    notes?: string[];
  } = $props();

  let open = $state(false);
  let draft = $state('');

  function close() { open = false; draft = ''; }

  function save() {
    const t = draft.trim();
    if (t) notes = [...notes, t];
    close();
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
  aria-label="Add note for next batch ({notes.length} captured)"
  data-testid="quick-note-fab"
>
  📝
  {#if notes.length > 0}
    <span class="absolute -top-1 -right-1 bg-juniper text-canvas text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center" data-testid="quick-note-badge">{notes.length}</span>
  {/if}
</button>

{#if open}
  <div
    class="fixed inset-0 bg-obsidian/40 flex items-center justify-center z-40"
    onclick={backdropClick}
    onkeydown={(e) => e.key === 'Escape' && close()}
    role="dialog"
    aria-modal="true"
    aria-labelledby="quick-note-title"
    tabindex="-1"
  >
    <form
      onsubmit={(e) => { e.preventDefault(); save(); }}
      class="bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm"
      data-testid="quick-note-modal"
    >
      <h2 id="quick-note-title" class="font-serif text-lg">Note for next batch</h2>
      <textarea
        bind:value={draft}
        rows="4"
        placeholder="What would you change next time?"
        class="border border-drafting bg-canvas px-3 py-2 rounded-sm resize-none"
        data-testid="quick-note-textarea"
      ></textarea>
      <div class="flex justify-end gap-2">
        <button type="button" onclick={close} class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</button>
        <button type="submit" class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas rounded-sm" data-testid="quick-note-save">Save</button>
      </div>
    </form>
  </div>
{/if}
