<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { api } from './api-client';
  import type { RecipePreset } from '$lib/server';

  let { open = $bindable(false) }: { open?: boolean } = $props();

  let name = $state('');
  let description = $state('');
  let preset = $state<RecipePreset>('custom');
  let tagsInput = $state('');
  let submitting = $state(false);
  let error = $state<string | null>(null);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!name.trim()) { error = 'Name required'; return; }
    submitting = true;
    error = null;
    try {
      const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean);
      const recipe = await api.createRecipe({ name: name.trim(), preset, tags, description: description.trim() });
      await invalidateAll();
      open = false;
      name = ''; description = ''; preset = 'custom'; tagsInput = '';
      goto(`/recipes/${recipe.id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create recipe';
    } finally {
      submitting = false;
    }
  }

  function close() { open = false; error = null; }

  let nameEl = $state<HTMLInputElement | undefined>();
  $effect(() => {
    if (open) nameEl?.focus();
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
    role="presentation"
  >
    <form
      onsubmit={submit}
      class="bg-canvas border border-obsidian p-6 w-full max-w-md flex flex-col gap-4 rounded-sm"
      data-testid="new-recipe-dialog"
    >
      <h2 class="font-serif text-2xl">New Recipe</h2>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Name</span>
        <input
          bind:this={nameEl}
          bind:value={name}
          required
          class="border border-drafting bg-canvas px-3 py-2 rounded-sm focus:outline-none focus:border-obsidian"
          data-testid="new-recipe-name"
        />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Preset</span>
        <select bind:value={preset} class="border border-drafting bg-canvas px-3 py-2 rounded-sm">
          <option value="custom">Custom (no preset variables)</option>
          <option value="bread">Bread (hydration, bulk, bake temp, yield)</option>
          <option value="sauce">Sauce (simmer time, yield)</option>
          <option value="braise">Braise (braise time, oven temp)</option>
        </select>
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Tags (comma-separated)</span>
        <input bind:value={tagsInput} class="border border-drafting bg-canvas px-3 py-2 rounded-sm" />
      </label>

      <label class="flex flex-col gap-1 text-sm">
        <span class="text-[11px] uppercase tracking-wider">Description</span>
        <textarea bind:value={description} rows="2" class="border border-drafting bg-canvas px-3 py-2 rounded-sm resize-none"></textarea>
      </label>

      {#if error}
        <p class="text-ochre text-sm">{error}</p>
      {/if}

      <div class="flex justify-end gap-2 pt-2">
        <button type="button" onclick={close} class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</button>
        <button
          type="submit"
          disabled={submitting}
          class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:opacity-50 rounded-sm"
          data-testid="new-recipe-submit"
        >{submitting ? 'Creating…' : 'Record Recipe'}</button>
      </div>
    </form>
  </div>
{/if}
