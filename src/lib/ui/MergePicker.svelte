<!-- src/lib/ui/MergePicker.svelte -->
<script lang="ts">
  import { untrack } from 'svelte';
  import MergeVarRow from './MergeVarRow.svelte';
  import MergeIngredientRow from './MergeIngredientRow.svelte';
  import MergeStepRow from './MergeStepRow.svelte';
  import Button from './primitives/Button.svelte';
  import { resolve } from '$app/paths';
  import TextInput from './primitives/TextInput.svelte';
  import FormError from '$lib/ui/primitives/FormError.svelte';
  import type {
    Recipe, Batch, Ingredient, Step, VariableValue,
    VariableDiffRow, IngredientDiffRow, StepObjectDiffRow
  } from '$lib/server';

  let {
    recipe,
    a,
    b,
    varRows,
    ingRows,
    stepRows,
    onSubmit
  }: {
    recipe: Recipe;
    a: Batch;
    b: Batch;
    varRows: VariableDiffRow[];
    ingRows: IngredientDiffRow[];
    stepRows: StepObjectDiffRow[];
    onSubmit: (input: {
      label: string;
      variables: Record<string, VariableValue>;
      ingredients: Ingredient[];
      steps: Step[];
    }) => Promise<void>;
  } = $props();

  type VarPick = { from: 'a' } | { from: 'b' } | { from: 'custom'; value: VariableValue };
  type IngPick = { action: 'pick-a' | 'pick-b' | 'skip' };
  type StepPick = { action: 'pick-a' | 'pick-b' | 'skip' };

  // Default: B (newer) wins on conflicts; identical rows pick A by convention.
  let varPicks = $state<VarPick[]>(untrack(() =>
    varRows.map(r => r.changed ? { from: 'b' } : { from: 'a' })
  ));
  let ingPicks = $state<IngPick[]>(untrack(() => ingRows.map(r => {
    if (r.op === 'ctx') return { action: 'pick-a' };
    if (r.op === 'mod') return { action: 'pick-b' };
    if (r.op === 'rem') return { action: 'skip' };
    return { action: 'pick-b' }; // add
  })));
  let stepPicks = $state<StepPick[]>(untrack(() => stepRows.map(r => {
    if (r.op === 'ctx') return { action: 'pick-a' };
    if (r.op === 'mod') return { action: 'pick-b' };
    if (r.op === 'rem') return { action: 'skip' };
    return { action: 'pick-b' }; // add
  })));

  let label = $state(untrack(() => `merge of ${a.label} + ${b.label}`));
  let submitting = $state(false);
  let error = $state<string | null>(null);

  // Resolved arrays
  const resolvedVars = $derived.by<Record<string, VariableValue>>(() => {
    const out: Record<string, VariableValue> = {};
    for (const item of recipe.variableSchema) {
      const idx = varRows.findIndex(r => r.name === item.name);
      const pick = idx >= 0 ? varPicks[idx] : { from: 'a' as const };
      out[item.name] = pick.from === 'a'
        ? (a.variables[item.name] ?? null)
        : pick.from === 'b'
        ? (b.variables[item.name] ?? null)
        : pick.value;
    }
    return out;
  });

  const resolvedIngredients = $derived.by<Ingredient[]>(() => {
    const out: Ingredient[] = [];
    for (let i = 0; i < ingRows.length; i++) {
      const row = ingRows[i];
      const pick = ingPicks[i];
      if (row.op === 'ctx') { if (row.a) out.push(row.a); continue; }
      if (pick.action === 'skip') continue;
      if (pick.action === 'pick-a' && row.a) out.push(row.a);
      else if (pick.action === 'pick-b' && row.b) out.push(row.b);
    }
    return out;
  });

  const resolvedSteps = $derived.by<Step[]>(() => {
    const out: Step[] = [];
    for (let i = 0; i < stepRows.length; i++) {
      const row = stepRows[i];
      const pick = stepPicks[i];
      if (row.op === 'ctx') { out.push(row.step); continue; }
      if (row.op === 'mod') {
        if (pick.action === 'pick-a') out.push(row.a);
        else if (pick.action === 'pick-b') out.push(row.b);
        // skip on mod isn't surfaced in UI for steps, but if it ever is, drop the step.
        continue;
      }
      if (pick.action === 'skip') continue;
      out.push(row.step);
    }
    return out;
  });

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = null;
    try {
      await onSubmit({
        label: label.trim() || `merge of ${a.label} + ${b.label}`,
        variables: resolvedVars,
        ingredients: resolvedIngredients,
        steps: resolvedSteps
      });
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to merge';
    } finally {
      submitting = false;
    }
  }
</script>

<form onsubmit={submit} class="flex flex-col gap-6" data-testid="merge-picker">
  <header class="flex items-center gap-3 border-b border-drafting pb-3">
    <h1 class="font-serif text-2xl">Merge</h1>
    <span class="text-sm px-2 py-0.5 border border-ochre text-ochre rounded-sm">{a.label}</span>
    <span class="text-obsidian/40">+</span>
    <span class="text-sm px-2 py-0.5 border border-juniper text-juniper rounded-sm">{b.label}</span>
    <span class="text-obsidian/40">→</span>
    <span class="text-sm px-2 py-0.5 border border-obsidian rounded-sm">new batch</span>
  </header>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-label">Label</span>
    <TextInput bind:value={label} required data-testid="merge-label" />
  </label>

  {#if recipe.variableSchema.length > 0}
    <section class="flex flex-col gap-1">
      <h3 class="text-caption">Variables</h3>
      <div class="grid grid-cols-[110px_1fr_1fr_1fr_auto] gap-3 text-[10px] uppercase tracking-wider text-obsidian/60 px-0 py-1">
        <span>Variable</span>
        <span>{a.label}</span>
        <span>{b.label}</span>
        <span>Result</span>
        <span></span>
      </div>
      {#each recipe.variableSchema as item (item.name)}
        {@const rowIdx = varRows.findIndex(r => r.name === item.name)}
        {#if rowIdx >= 0}
          <MergeVarRow
            {item}
            aValue={a.variables[item.name] ?? null}
            bValue={b.variables[item.name] ?? null}
            bind:pick={varPicks[rowIdx]}
            aLabel={a.label}
            bLabel={b.label}
          />
        {/if}
      {/each}
    </section>
  {/if}

  <section class="flex flex-col gap-1.5">
    <div class="flex justify-between items-baseline">
      <h3 class="text-caption">Ingredients</h3>
      <span class="text-[10px] text-obsidian/40" data-testid="ingredients-result-count">Result: {resolvedIngredients.length} ingredient{resolvedIngredients.length === 1 ? '' : 's'}</span>
    </div>
    {#each ingRows as row, i (i)}
      <MergeIngredientRow {row} bind:pick={ingPicks[i]} />
    {/each}
  </section>

  <section class="flex flex-col gap-1.5">
    <div class="flex justify-between items-baseline">
      <h3 class="text-caption">Steps</h3>
      <span class="text-[10px] text-obsidian/40" data-testid="steps-result-count">Result: {resolvedSteps.length} step{resolvedSteps.length === 1 ? '' : 's'}</span>
    </div>
    {#each stepRows as row, i (i)}
      <MergeStepRow {row} bind:pick={stepPicks[i]} />
    {/each}
  </section>

  <FormError message={error} />

  <div class="flex justify-end gap-2 border-t border-drafting pt-4">
    <a href={resolve(`/recipes/${recipe.id}`)} class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</a>
    <Button type="submit" variant="outline" disabled={submitting} data-testid="merge-submit">{submitting ? 'Merging…' : 'Record Merge'}</Button>
  </div>
</form>
