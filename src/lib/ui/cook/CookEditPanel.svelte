<!-- src/lib/ui/cook/CookEditPanel.svelte -->
<script lang="ts">
  import type { Recipe, VariableValue, Ingredient, Step } from '$lib/server';
  import TextInput from '$lib/ui/primitives/TextInput.svelte';
  import IngredientEditor from '$lib/ui/IngredientEditor.svelte';
  import StepEditor from '$lib/ui/StepEditor.svelte';
  import { nextVariables, evalVariableExpression } from '$lib/ui/layout/batch-content';

  // The fork's *label* is named in the End-Cook dialog (Task 9), not here — this
  // panel edits the batch content (variables, ingredients, steps).
  let {
    recipe,
    variables = $bindable({}),
    ingredients = $bindable([]),
    steps = $bindable([]),
    onAddStep,
    onRemoveStep,
    onMoveStep,
    onRemoveIngredient
  }: {
    recipe: Recipe;
    variables?: Record<string, VariableValue>;
    ingredients?: Ingredient[];
    steps?: Step[];
    onAddStep: () => void;
    onRemoveStep: (i: number) => void;
    onMoveStep: (from: number, to: number) => void;
    onRemoveIngredient: (id: string) => void;
  } = $props();

  function setVar(name: string, raw: string, type: 'number' | 'text') {
    variables = nextVariables(variables, name, raw, type);
  }
  function evalVarOnBlur(name: string, type: 'number' | 'text', el: HTMLInputElement) {
    if (type !== 'number') return;
    const v = evalVariableExpression(el.value);
    if (v !== null && String(v) !== el.value.trim()) {
      el.value = String(v);
      variables = { ...variables, [name]: v };
    }
  }
</script>

<div class="flex flex-col gap-6 px-4 py-4" data-testid="cook-edit-panel">
  {#if recipe.variableSchema.length > 0}
    <fieldset class="flex flex-col gap-3">
      <legend class="text-label mb-1">Variables</legend>
      <div class="grid grid-cols-2 gap-3">
        {#each recipe.variableSchema as schema (schema.name)}
          {@const current = variables[schema.name]}
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-kicker">{schema.name} {schema.unit && `(${schema.unit})`}</span>
            <TextInput
              type="text"
              inputmode={schema.type === 'number' ? 'decimal' : 'text'}
              value={String(current ?? '')}
              oninput={(e) => setVar(schema.name, (e.currentTarget as HTMLInputElement).value, schema.type)}
              onblur={(e) => evalVarOnBlur(schema.name, schema.type, e.currentTarget as HTMLInputElement)}
              data-testid="var-{schema.name}"
            />
          </label>
        {/each}
      </div>
    </fieldset>
  {/if}

  <IngredientEditor bind:ingredients {onRemoveIngredient} />

  <StepEditor bind:steps {ingredients} {onAddStep} {onRemoveStep} {onMoveStep} />
</div>
