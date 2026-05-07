<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { untrack } from 'svelte';
  import { api } from './api-client';
  import { slugify, uniqueSlug } from '$lib/shared/slug';
  import { moveItem } from '$lib/shared/array';
  import { parseAmount } from './layout/amount-parse';
  import UsesEditor from './UsesEditor.svelte';
  import Button from './primitives/Button.svelte';
  import RadioGroup from './primitives/RadioGroup.svelte';
  import TextInput from './primitives/TextInput.svelte';
  import type { Recipe, Batch, Ingredient, VariableValue, BatchStatus, Step } from '$lib/server';

  let {
    recipe,
    parent,
    mode = 'create',
    existing = null
  }: {
    recipe: Recipe;
    parent: Batch | null;
    mode?: 'create' | 'edit';
    existing?: Batch | null;
  } = $props();

  let label = $state(untrack(() =>
    mode === 'edit' && existing
      ? existing.label
      : (parent ? `from ${parent.label}` : 'initial')
  ));
  let status = $state<BatchStatus>(untrack(() =>
    mode === 'edit' && existing ? existing.status : 'draft'
  ));
  let variables = $state<Record<string, VariableValue>>(untrack(() =>
    mode === 'edit' && existing
      ? { ...existing.variables }
      : Object.fromEntries(recipe.variableSchema.map(s => [s.name, parent?.variables[s.name] ?? null]))
  ));
  let ingredients = $state<Ingredient[]>(untrack(() =>
    mode === 'edit' && existing
      ? existing.ingredients.map(i => ({ ...i }))
      : (parent ? parent.ingredients.map(i => ({ ...i })) : [])
  ));
  let steps = $state<Step[]>(untrack(() =>
    mode === 'edit' && existing
      ? existing.steps.map(s => ({ text: s.text, uses: s.uses.map(u => ({ ...u })) }))
      : (parent ? parent.steps.map(s => ({ text: s.text, uses: s.uses.map(u => ({ ...u })) })) : [])
  ));

  let submitting = $state(false);
  let error = $state<string | null>(null);

  const sectionOptions = $derived.by<string[]>(() => {
    const set = new Set<string>();
    for (const ing of ingredients) {
      if (ing.section && ing.section.trim()) set.add(ing.section.trim());
    }
    return [...set];
  });

  // When user picks "+ New section…", prompt for a name and apply it.
  $effect(() => {
    for (let i = 0; i < ingredients.length; i++) {
      if (ingredients[i].section === '__new__') {
        const name = window.prompt('New section name:');
        ingredients[i].section = name && name.trim() ? name.trim() : undefined;
      }
    }
  });

  // Reactively assign a stable id to any ingredient that has a name but no id yet.
  // Once assigned, the id is permanent for that row (renaming the ingredient does not change it).
  $effect(() => {
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.id && ing.name && ing.name.trim()) {
        const taken = new Set(ingredients.map(x => x.id).filter(Boolean));
        ingredients[i].id = uniqueSlug(slugify(ing.name), taken);
      }
    }
  });

  const allUses = $derived(steps.flatMap(s => s.uses));

  function addIngredient() { ingredients = [...ingredients, { id: '', name: '', amount: '', unit: '' }]; }
  function removeIngredient(i: number) {
    const removedId = ingredients[i].id;
    ingredients = ingredients.filter((_, idx) => idx !== i);
    // Drop any uses that referenced the removed ingredient
    steps = steps.map(s => ({ ...s, uses: s.uses.filter(u => u.ingredientId !== removedId) }));
  }
  function addStep() { steps = [...steps, { text: '', uses: [] }]; }
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

  // On blur of a number-type variable, eval arithmetic expressions and replace input.
  function evalVariableOnBlur(name: string, type: 'number' | 'text', el: HTMLInputElement) {
    if (type !== 'number') return;
    const evaluated = parseAmount(el.value);
    if (evaluated !== null && String(evaluated) !== el.value.trim()) {
      el.value = String(evaluated);
      variables = { ...variables, [name]: evaluated };
    }
  }

  // On blur of an ingredient amount input, eval arithmetic expressions and update.
  function evalIngredientAmountOnBlur(i: number) {
    const evaluated = parseAmount(ingredients[i].amount);
    if (evaluated !== null && String(evaluated) !== ingredients[i].amount.trim()) {
      ingredients[i].amount = String(evaluated);
    }
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!label.trim()) { error = 'Label required'; return; }
    submitting = true;
    error = null;
    try {
      // Drop ingredient rows with empty names; renumber and rebuild use refs
      const cleanIngredients = ingredients.filter(i => i.name.trim());
      const validIds = new Set(cleanIngredients.map(i => i.id));
      const cleanSteps: Step[] = steps
        .filter(s => s.text.trim())
        .map(s => ({ text: s.text.trim(), uses: s.uses.filter(u => validIds.has(u.ingredientId)) }));

      let result: Batch;
      if (mode === 'edit' && existing) {
        result = await api.patchBatch(recipe.id, existing.id, {
          label: label.trim(),
          status,
          variables,
          ingredients: cleanIngredients,
          steps: cleanSteps
        });
      } else {
        result = await api.createBatch(recipe.id, {
          label: label.trim(),
          parentIds: parent ? [parent.id] : [],
          status,
          variables,
          ingredients: cleanIngredients,
          steps: cleanSteps
        });
      }
      goto(resolve(`/recipes/${recipe.id}?batch=${result.id}`));
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to save batch';
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-6 max-w-3xl" data-testid="batch-editor">
  <header class="flex flex-col gap-1">
    <h1 class="font-serif text-2xl">
      {#if mode === 'edit'}
        Edit {existing?.label}
      {:else if parent}
        New batch from {parent.label}
      {:else}
        Record V1
      {/if}
    </h1>
    <p class="text-sm text-obsidian/60">{recipe.name}</p>
  </header>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-[11px] uppercase tracking-wider">Label</span>
    <TextInput bind:value={label} required data-testid="batch-label" />
  </label>

  <fieldset class="flex flex-col gap-1 text-sm">
    <legend class="text-[11px] uppercase tracking-wider mb-2">Status</legend>
    <RadioGroup
      bind:value={status}
      options={[
        { value: 'draft', label: 'Draft' },
        { value: 'cooked', label: 'Cooked' }
      ]}
      name="status"
    />
  </fieldset>

  {#if recipe.variableSchema.length > 0}
    <fieldset class="flex flex-col gap-3">
      <legend class="text-[11px] uppercase tracking-wider mb-1">Variables</legend>
      <div class="grid grid-cols-2 gap-3">
        {#each recipe.variableSchema as schema (schema.name)}
          {@const current = variables[schema.name]}
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-[10px] uppercase tracking-wider text-obsidian/50">{schema.name} {schema.unit && `(${schema.unit})`}</span>
            <TextInput
              type="text"
              inputmode={schema.type === 'number' ? 'decimal' : 'text'}
              value={String(current ?? '')}
              oninput={(e) => setVariable(schema.name, (e.currentTarget as HTMLInputElement).value, schema.type)}
              onblur={(e) => evalVariableOnBlur(schema.name, schema.type, e.currentTarget as HTMLInputElement)}
              data-testid="var-{schema.name}"
            />
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}

  <fieldset class="flex flex-col gap-2">
    <legend class="text-[11px] uppercase tracking-wider">Ingredients</legend>
    {#each ingredients as ing, i (i)}
      <div class="flex gap-2 items-start md:items-center" data-testid="ingredient-edit-row">
        <div class="flex flex-col w-5 shrink-0 pt-1 md:pt-0">
          <button
            type="button"
            onclick={() => ingredients = moveItem(ingredients, i, i - 1)}
            disabled={i === 0}
            aria-label="Move ingredient {i + 1} up"
            class="text-[10px] leading-none text-obsidian/50 hover:text-ochre disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
            data-testid="ingredient-move-up"
          >▲</button>
          <button
            type="button"
            onclick={() => ingredients = moveItem(ingredients, i, i + 1)}
            disabled={i === ingredients.length - 1}
            aria-label="Move ingredient {i + 1} down"
            class="text-[10px] leading-none text-obsidian/50 hover:text-ochre disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
            data-testid="ingredient-move-down"
          >▼</button>
        </div>

        <div class="flex-1 flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
          <TextInput
            bind:value={ing.name}
            placeholder="Ingredient"
            aria-label="Ingredient {i + 1} name"
            class="px-2 py-1.5 md:flex-1 md:order-3"
          />
          <div class="flex gap-2 md:contents">
            <TextInput
              bind:value={ing.amount}
              onblur={() => evalIngredientAmountOnBlur(i)}
              placeholder="Amount"
              aria-label="Ingredient {i + 1} amount"
              class="flex-1 md:flex-none md:w-24 md:order-1 px-2 py-1.5"
            />
            <TextInput
              bind:value={ing.unit}
              placeholder="Unit"
              aria-label="Ingredient {i + 1} unit"
              class="flex-1 md:flex-none md:w-20 md:order-2 px-2 py-1.5"
            />
          </div>
          <select
            value={ing.section ?? '__none__'}
            onchange={(e) => {
              const val = (e.currentTarget as HTMLSelectElement).value;
              ing.section = val === '__none__' ? undefined : val;
            }}
            aria-label="Ingredient {i + 1} section"
            class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm text-sm md:w-32 md:order-4"
            data-testid="ingredient-section"
          >
            <option value="__none__">(no section)</option>
            {#each sectionOptions as sec (sec)}
              <option value={sec}>{sec}</option>
            {/each}
            <option value="__new__">+ New section…</option>
          </select>
        </div>

        <button
          type="button"
          onclick={() => removeIngredient(i)}
          aria-label="Remove ingredient {i + 1}"
          class="text-obsidian/40 hover:text-ochre pt-2 md:pt-0"
        >×</button>
      </div>
    {/each}
    <Button
      type="button"
      onclick={addIngredient}
      variant="dashed"
      class="text-sm normal-case tracking-normal"
      data-testid="add-ingredient-btn"
    >+ Add ingredient</Button>
  </fieldset>

  <fieldset class="flex flex-col gap-3">
    <legend class="text-[11px] uppercase tracking-wider">Steps</legend>
    {#each steps as step, i (i)}
      <div class="flex flex-col gap-2 border border-drafting/50 p-3 rounded-sm" data-testid="step-edit-row">
        <div class="flex gap-2 items-start">
          <div class="flex flex-col w-5 shrink-0 pt-1">
            <button
              type="button"
              onclick={() => steps = moveItem(steps, i, i - 1)}
              disabled={i === 0}
              aria-label="Move step {i + 1} up"
              class="text-[10px] leading-none text-obsidian/50 hover:text-ochre disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
              data-testid="step-move-up"
            >▲</button>
            <button
              type="button"
              onclick={() => steps = moveItem(steps, i, i + 1)}
              disabled={i === steps.length - 1}
              aria-label="Move step {i + 1} down"
              class="text-[10px] leading-none text-obsidian/50 hover:text-ochre disabled:opacity-30 disabled:cursor-not-allowed py-0.5"
              data-testid="step-move-down"
            >▼</button>
          </div>
          <span class="font-mono text-xs text-obsidian/40 pt-2">{i + 1}.</span>
          <textarea
            bind:value={step.text}
            rows="2"
            aria-label="Step {i + 1} text"
            class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm resize-none"
            data-testid="step-text"
          ></textarea>
          <button type="button" onclick={() => removeStep(i)} aria-label="Remove step {i + 1}" class="text-obsidian/40 hover:text-ochre pt-2">×</button>
        </div>
        <UsesEditor
          bind:uses={step.uses}
          ingredients={ingredients.filter(ing => ing.id && ing.name)}
          allUses={allUses}
        />
      </div>
    {/each}
    <Button
      type="button"
      onclick={addStep}
      variant="dashed"
      class="text-sm normal-case tracking-normal"
      data-testid="add-step-btn"
    >+ Add step</Button>
  </fieldset>

  {#if error}
    <p class="text-ochre text-sm">{error}</p>
  {/if}

  <div class="flex justify-end gap-2 border-t border-drafting pt-4">
    <a href={resolve(`/recipes/${recipe.id}`)} class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</a>
    <Button
      type="submit"
      variant="outline"
      disabled={submitting}
      data-testid="batch-submit"
    >{submitting ? 'Saving…' : (mode === 'edit' ? 'Save Changes' : 'Record Batch')}</Button>
  </div>
</form>
