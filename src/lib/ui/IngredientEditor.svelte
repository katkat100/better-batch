<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { moveItem } from '$lib/shared/array';
  import { slugify, uniqueSlug } from '$lib/shared/slug';
  import { evalVariableExpression } from '$lib/ui/layout/batch-content';
  import IconButton from '$lib/ui/primitives/IconButton.svelte';
  import TextInput from '$lib/ui/primitives/TextInput.svelte';
  import Button from './primitives/Button.svelte';
  import type { Ingredient } from '$lib/server';
  import type { IngredientIssue } from '$lib/shared/batch-validation';

  let {
    ingredients = $bindable([]),
    issues = [],
    showUnreferencedHighlights = false,
    onRemoveIngredient
  }: {
    ingredients?: Ingredient[];
    issues?: IngredientIssue[];
    showUnreferencedHighlights?: boolean;
    onRemoveIngredient?: (id: string) => void;
  } = $props();

  const sumMismatchIds = $derived(
    new Set(issues.filter((i) => i.kind === 'sum-mismatch').map((i) => i.ingredientId))
  );
  const unreferencedIds = $derived(
    new Set(issues.filter((i) => i.kind === 'unreferenced').map((i) => i.ingredientId))
  );

  const sectionOptions = $derived.by<string[]>(() => {
    const set = new SvelteSet<string>();
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

  // Assign a stable id to any ingredient that has a name but no id yet.
  $effect(() => {
    for (let i = 0; i < ingredients.length; i++) {
      const ing = ingredients[i];
      if (!ing.id && ing.name && ing.name.trim()) {
        const taken = new Set(ingredients.map((x) => x.id).filter(Boolean));
        ingredients[i].id = uniqueSlug(slugify(ing.name), taken);
      }
    }
  });

  function addIngredient() {
    ingredients = [...ingredients, { id: '', name: '', amount: '', unit: '' }];
  }
  function removeIngredient(i: number) {
    const removedId = ingredients[i].id;
    ingredients = ingredients.filter((_, idx) => idx !== i);
    onRemoveIngredient?.(removedId);
  }
  function evalIngredientAmountOnBlur(i: number) {
    const evaluated = evalVariableExpression(ingredients[i].amount);
    if (evaluated !== null && String(evaluated) !== ingredients[i].amount.trim()) {
      ingredients[i].amount = String(evaluated);
    }
  }
</script>

<fieldset class="flex flex-col gap-2">
  <legend class="text-label">Ingredients</legend>
  {#each ingredients as ing, i (i)}
    <div
      class="flex gap-2 items-start md:items-center {sumMismatchIds.has(ing.id) ||
      (showUnreferencedHighlights && unreferencedIds.has(ing.id))
        ? 'border border-ochre rounded-sm p-1 -m-1'
        : ''}"
      data-testid="ingredient-edit-row"
      data-ingredient-issue={sumMismatchIds.has(ing.id)
        ? 'sum-mismatch'
        : showUnreferencedHighlights && unreferencedIds.has(ing.id)
          ? 'unreferenced'
          : undefined}
    >
      <div class="flex flex-col w-5 shrink-0 pt-1 md:pt-0">
        <IconButton
          aria-label="Move ingredient {i + 1} up"
          onclick={() => { ingredients = moveItem(ingredients, i, i - 1); }}
          disabled={i === 0}
          class="text-[10px]"
          data-testid="ingredient-move-up">▲</IconButton
        >
        <IconButton
          aria-label="Move ingredient {i + 1} down"
          onclick={() => { ingredients = moveItem(ingredients, i, i + 1); }}
          disabled={i === ingredients.length - 1}
          class="text-[10px]"
          data-testid="ingredient-move-down">▼</IconButton
        >
      </div>

      <div class="flex-1 min-w-0 flex flex-col gap-2 md:flex-row md:items-center md:gap-2">
        <TextInput
          bind:value={ing.name}
          placeholder="Ingredient"
          aria-label="Ingredient {i + 1} name"
          class="px-2 py-1.5 md:flex-1"
        />
        <div class="flex gap-2 min-w-0 md:contents">
          <TextInput
            bind:value={ing.amount}
            onblur={() => evalIngredientAmountOnBlur(i)}
            placeholder="Amount"
            aria-label="Ingredient {i + 1} amount"
            class="flex-1 md:flex-none w-1/2 flex md:w-24 px-2 py-1.5"
          />
          <TextInput
            bind:value={ing.unit}
            placeholder="Unit"
            aria-label="Ingredient {i + 1} unit"
            class="flex-1 md:flex-none w-1/2 flex md:w-20 px-2 py-1.5"
            autocapitalize="none"
          />
        </div>
        <select
          value={ing.section ?? '__none__'}
          onchange={(e) => {
            const val = (e.currentTarget as HTMLSelectElement).value;
            ing.section = val === '__none__' ? undefined : val;
          }}
          aria-label="Ingredient {i + 1} section"
          class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm text-sm w-full md:w-32"
          data-testid="ingredient-section"
        >
          <option value="__none__">(no section)</option>
          {#each sectionOptions as sec (sec)}
            <option value={sec}>{sec}</option>
          {/each}
          <option value="__new__">+ New section…</option>
        </select>
        {#if sumMismatchIds.has(ing.id)}
          {@const issue = issues.find((x) => x.kind === 'sum-mismatch' && x.ingredientId === ing.id)!}
          <span
            class="text-[10px] text-ochre whitespace-nowrap md:self-center"
            data-testid="ingredient-sum-warning"
            data-ingredient-id={ing.id}
            >⚠ used {issue.sum}/{issue.master}{issue.unit ?? ''}</span
          >
        {/if}
        {#if showUnreferencedHighlights && unreferencedIds.has(ing.id) && !sumMismatchIds.has(ing.id)}
          <span
            class="text-[10px] text-ochre whitespace-nowrap md:self-center"
            data-testid="ingredient-unreferenced-warning"
            data-ingredient-id={ing.id}>⚠ never used</span
          >
        {/if}
      </div>

      <IconButton
        aria-label="Remove ingredient {i + 1}"
        onclick={() => removeIngredient(i)}
        class="pt-2 md:pt-0">×</IconButton
      >
    </div>
  {/each}
  <Button
    type="button"
    onclick={addIngredient}
    variant="dashed"
    class="text-sm normal-case tracking-normal"
    data-testid="add-ingredient-btn">+ Add ingredient</Button
  >
</fieldset>
