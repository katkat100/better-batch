<script lang="ts">
  import { goto } from '$app/navigation';
  import { api } from './api-client';
  import type { Recipe, Batch, Ingredient, VariableValue, BatchStatus } from '$lib/server';

  let {
    recipe,
    parent
  }: {
    recipe: Recipe;
    parent: Batch | null;
  } = $props();

  // Pre-fill from parent (or empty if root V1)
  let label = $state(parent ? `from ${parent.id}` : 'initial');
  let status = $state<BatchStatus>('draft');
  let variables = $state<Record<string, VariableValue>>(
    Object.fromEntries(recipe.variableSchema.map(s => [s.name, parent?.variables[s.name] ?? null]))
  );
  let ingredients = $state<Ingredient[]>(
    parent ? parent.ingredients.map(i => ({ ...i })) : []
  );
  let steps = $state<string[]>(parent ? [...parent.steps] : []);

  let submitting = $state(false);
  let error = $state<string | null>(null);

  function addIngredient() { ingredients = [...ingredients, { name: '', amount: '', unit: '' }]; }
  function removeIngredient(i: number) { ingredients = ingredients.filter((_, idx) => idx !== i); }
  function addStep() { steps = [...steps, '']; }
  function removeStep(i: number) { steps = steps.filter((_, idx) => idx !== i); }

  function setVariable(name: string, raw: string, type: 'number' | 'text') {
    if (raw === '') { variables = { ...variables, [name]: null }; return; }
    if (type === 'number') {
      const n = parseFloat(raw);
      variables = { ...variables, [name]: Number.isFinite(n) ? n : raw };
    } else {
      variables = { ...variables, [name]: raw };
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!label.trim()) { error = 'Label required'; return; }
    submitting = true;
    error = null;
    try {
      const batch = await api.createBatch(recipe.id, {
        label: label.trim(),
        parentIds: parent ? [parent.id] : [],
        status,
        variables,
        ingredients: ingredients.filter(i => i.name.trim()),
        steps: steps.filter(s => s.trim())
      });
      goto(`/recipes/${recipe.id}?batch=${batch.id}`);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to create batch';
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-6 max-w-3xl" data-testid="batch-editor">
  <header class="flex flex-col gap-1">
    <h1 class="font-serif text-2xl">
      {parent ? `New batch from ${parent.id}` : 'Record V1'}
    </h1>
    <p class="text-sm text-obsidian/60">{recipe.name}</p>
  </header>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-[11px] uppercase tracking-wider">Label</span>
    <input bind:value={label} required class="border border-drafting bg-canvas px-3 py-2 rounded-sm" data-testid="batch-label" />
  </label>

  <fieldset class="flex flex-col gap-1 text-sm">
    <legend class="text-[11px] uppercase tracking-wider mb-2">Status</legend>
    <div class="flex gap-4">
      <label class="flex items-center gap-2"><input type="radio" bind:group={status} value="draft" /> Draft</label>
      <label class="flex items-center gap-2"><input type="radio" bind:group={status} value="cooked" /> Cooked</label>
    </div>
  </fieldset>

  {#if recipe.variableSchema.length > 0}
    <fieldset class="flex flex-col gap-3">
      <legend class="text-[11px] uppercase tracking-wider mb-1">Variables</legend>
      <div class="grid grid-cols-2 gap-3">
        {#each recipe.variableSchema as schema}
          {@const current = variables[schema.name]}
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{schema.name} {schema.unit && `(${schema.unit})`}</span>
            <input
              type={schema.type === 'number' ? 'number' : 'text'}
              step={schema.type === 'number' ? 'any' : undefined}
              value={current ?? ''}
              oninput={(e) => setVariable(schema.name, (e.currentTarget as HTMLInputElement).value, schema.type)}
              class="border border-drafting bg-canvas px-3 py-2 rounded-sm"
              data-testid="var-{schema.name}"
            />
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}

  <fieldset class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <legend class="text-[11px] uppercase tracking-wider">Ingredients</legend>
      <button type="button" onclick={addIngredient} class="text-xs text-ochre">+ Add</button>
    </div>
    {#each ingredients as ing, i}
      <div class="flex gap-2 items-center">
        <input bind:value={ing.amount} placeholder="Amount" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm w-24 text-sm" />
        <input bind:value={ing.unit} placeholder="Unit" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm w-20 text-sm" />
        <input bind:value={ing.name} placeholder="Ingredient" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm" />
        <button type="button" onclick={() => removeIngredient(i)} class="text-obsidian/40 hover:text-ochre">×</button>
      </div>
    {/each}
  </fieldset>

  <fieldset class="flex flex-col gap-2">
    <div class="flex items-center justify-between">
      <legend class="text-[11px] uppercase tracking-wider">Steps</legend>
      <button type="button" onclick={addStep} class="text-xs text-ochre">+ Add</button>
    </div>
    {#each steps as _, i}
      <div class="flex gap-2 items-start">
        <span class="font-mono text-xs text-obsidian/40 pt-2">{i + 1}.</span>
        <textarea bind:value={steps[i]} rows="2" class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm resize-none"></textarea>
        <button type="button" onclick={() => removeStep(i)} class="text-obsidian/40 hover:text-ochre pt-2">×</button>
      </div>
    {/each}
  </fieldset>

  {#if error}
    <p class="text-ochre text-sm">{error}</p>
  {/if}

  <div class="flex justify-end gap-2 border-t border-drafting pt-4">
    <a href="/recipes/{recipe.id}" class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</a>
    <button
      type="submit"
      disabled={submitting}
      class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:opacity-50 rounded-sm"
      data-testid="batch-submit"
    >{submitting ? 'Recording…' : 'Record Batch'}</button>
  </div>
</form>
