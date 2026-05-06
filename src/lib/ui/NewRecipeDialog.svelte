<script lang="ts">
  import { goto, invalidateAll } from '$app/navigation';
  import { api } from './api-client';
  import type { RecipePreset } from '$lib/server';
  import Dialog from '$lib/ui/primitives/Dialog.svelte';
  import Button from '$lib/ui/primitives/Button.svelte';
  import TextInput from '$lib/ui/primitives/TextInput.svelte';
  import Select from '$lib/ui/primitives/Select.svelte';

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
</script>

<Dialog
  bind:open
  title="New Recipe"
  titleId="new-recipe-dialog-title"
  onClose={close}
>
  <form
    onsubmit={submit}
    class="flex flex-col gap-4"
    data-testid="new-recipe-dialog"
  >
    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-wider">Name</span>
      <TextInput
        bind:element={nameEl}
        bind:value={name}
        required
        data-testid="new-recipe-name"
      />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-wider">Preset</span>
      <Select bind:value={preset}>
        <option value="custom">Custom (no preset variables)</option>
        <option value="bread">Bread (hydration, bulk, bake temp, yield)</option>
        <option value="sauce">Sauce (simmer time, yield)</option>
        <option value="braise">Braise (braise time, oven temp)</option>
      </Select>
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-wider">Tags (comma-separated)</span>
      <TextInput bind:value={tagsInput} />
    </label>

    <label class="flex flex-col gap-1 text-sm">
      <span class="text-[11px] uppercase tracking-wider">Description</span>
      <textarea bind:value={description} rows="2" class="border border-drafting bg-canvas px-3 py-2 rounded-sm resize-none text-sm"></textarea>
    </label>

    {#if error}
      <p class="text-ochre text-sm">{error}</p>
    {/if}

    <div class="flex justify-end gap-2 pt-2">
      <Button type="button" variant="ghost" onclick={close}>Cancel</Button>
      <Button
        type="submit"
        variant="outline"
        disabled={submitting}
        data-testid="new-recipe-submit"
      >{submitting ? 'Creating…' : 'Record Recipe'}</Button>
    </div>
  </form>
</Dialog>
