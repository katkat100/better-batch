<!-- src/lib/ui/MergePicker.svelte -->
<script lang="ts">
  import type { Recipe, Batch, VariableValue, VariableSchemaItem } from '$lib/server';

  let {
    recipe,
    a,
    b,
    onSubmit
  }: {
    recipe: Recipe;
    a: Batch;
    b: Batch;
    onSubmit: (input: {
      label: string;
      ingredientsFrom: 'a' | 'b';
      stepsFrom: 'a' | 'b';
      variables: Record<string, VariableValue>;
    }) => Promise<void>;
  } = $props();

  type VarPick = { from: 'a' } | { from: 'b' } | { from: 'custom'; value: VariableValue };

  function initialPick(item: VariableSchemaItem): VarPick {
    return { from: 'a' };
  }

  let varPicks = $state<Record<string, VarPick>>(
    Object.fromEntries(recipe.variableSchema.map(s => [s.name, initialPick(s)]))
  );
  let ingredientsFrom = $state<'a' | 'b'>('a');
  let stepsFrom = $state<'a' | 'b'>('a');
  let label = $state(`merge of ${a.id} + ${b.id}`);
  let submitting = $state(false);
  let error = $state<string | null>(null);

  function variableValue(item: VariableSchemaItem, side: 'a' | 'b'): VariableValue {
    const v = (side === 'a' ? a.variables : b.variables)[item.name];
    return v ?? null;
  }

  function resolved(item: VariableSchemaItem): VariableValue {
    const pick = varPicks[item.name];
    if (pick.from === 'a') return variableValue(item, 'a');
    if (pick.from === 'b') return variableValue(item, 'b');
    return pick.value;
  }

  function setPick(name: string, pick: VarPick) {
    varPicks = { ...varPicks, [name]: pick };
  }

  function setCustom(name: string, raw: string, type: 'number' | 'text') {
    if (raw === '') { setPick(name, { from: 'custom', value: null }); return; }
    if (type === 'number') {
      const n = parseFloat(raw);
      setPick(name, { from: 'custom', value: Number.isFinite(n) ? n : raw });
    } else {
      setPick(name, { from: 'custom', value: raw });
    }
  }

  function formatValue(v: VariableValue, unit: string): string {
    if (v === null || v === undefined) return '—';
    return unit ? `${v}${unit}` : String(v);
  }

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    submitting = true;
    error = null;
    try {
      const variables: Record<string, VariableValue> = {};
      for (const item of recipe.variableSchema) variables[item.name] = resolved(item);
      await onSubmit({ label: label.trim() || `merge of ${a.id} + ${b.id}`, ingredientsFrom, stepsFrom, variables });
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
    <span class="text-sm font-mono px-2 py-0.5 border border-ochre text-ochre rounded-sm">{a.id}</span>
    <span class="text-obsidian/40">+</span>
    <span class="text-sm font-mono px-2 py-0.5 border border-juniper text-juniper rounded-sm">{b.id}</span>
    <span class="text-obsidian/40">→</span>
    <span class="text-sm font-mono px-2 py-0.5 border border-obsidian rounded-sm">new batch</span>
  </header>

  <label class="flex flex-col gap-1 text-sm">
    <span class="text-[11px] uppercase tracking-wider">Label</span>
    <input bind:value={label} required class="border border-drafting bg-canvas px-3 py-2 rounded-sm" data-testid="merge-label" />
  </label>

  {#if recipe.variableSchema.length > 0}
    <section class="flex flex-col gap-2">
      <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Variables</h3>
      <table class="w-full text-sm border border-drafting rounded-sm">
        <thead class="bg-drafting/30 text-[10px] uppercase tracking-wider text-obsidian/60">
          <tr>
            <th class="text-left p-2">Variable</th>
            <th class="text-left p-2">{a.id}</th>
            <th class="text-left p-2">{b.id}</th>
            <th class="text-left p-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {#each recipe.variableSchema as item (item.name)}
            {@const pick = varPicks[item.name]}
            <tr data-testid="merge-variable-row" data-variable={item.name}>
              <td class="p-2 text-[11px] uppercase tracking-wider text-obsidian/70">{item.name}</td>
              <td class="p-2 font-mono">
                <button
                  type="button"
                  onclick={() => setPick(item.name, { from: 'a' })}
                  class="text-left {pick.from === 'a' ? 'text-ochre font-bold' : 'text-obsidian/60 hover:text-obsidian'}"
                  data-testid="pick-a"
                >{formatValue(variableValue(item, 'a'), item.unit)}</button>
              </td>
              <td class="p-2 font-mono">
                <button
                  type="button"
                  onclick={() => setPick(item.name, { from: 'b' })}
                  class="text-left {pick.from === 'b' ? 'text-juniper font-bold' : 'text-obsidian/60 hover:text-obsidian'}"
                  data-testid="pick-b"
                >{formatValue(variableValue(item, 'b'), item.unit)}</button>
              </td>
              <td class="p-2 font-mono">
                {#if pick.from === 'custom'}
                  <input
                    type="text"
                    inputmode={item.type === 'number' ? 'decimal' : 'text'}
                    value={pick.value ?? ''}
                    oninput={(e) => setCustom(item.name, (e.currentTarget as HTMLInputElement).value, item.type)}
                    class="border border-drafting bg-canvas px-2 py-1 rounded-sm w-full font-mono text-sm"
                    data-testid="custom-input"
                  />
                {:else}
                  <span data-testid="result-value">{formatValue(resolved(item), item.unit)}</span>
                {/if}
                <button
                  type="button"
                  onclick={() => setPick(item.name, { from: 'custom', value: resolved(item) })}
                  class="text-[10px] uppercase tracking-wider text-obsidian/50 hover:text-ochre ml-2"
                  data-testid="pick-custom"
                >custom</button>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Ingredients</h3>
    <div class="flex gap-4">
      <label class="flex items-center gap-2 text-sm">
        <input type="radio" bind:group={ingredientsFrom} value="a" data-testid="ingredients-from-a" />
        From {a.id} ({a.ingredients.length} items)
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="radio" bind:group={ingredientsFrom} value="b" data-testid="ingredients-from-b" />
        From {b.id} ({b.ingredients.length} items)
      </label>
    </div>
  </section>

  <section class="flex flex-col gap-2">
    <h3 class="text-[11px] uppercase tracking-wider text-obsidian/50">Steps</h3>
    <div class="flex gap-4">
      <label class="flex items-center gap-2 text-sm">
        <input type="radio" bind:group={stepsFrom} value="a" data-testid="steps-from-a" />
        From {a.id} ({a.steps.length} steps)
      </label>
      <label class="flex items-center gap-2 text-sm">
        <input type="radio" bind:group={stepsFrom} value="b" data-testid="steps-from-b" />
        From {b.id} ({b.steps.length} steps)
      </label>
    </div>
  </section>

  {#if error}
    <p class="text-ochre text-sm">{error}</p>
  {/if}

  <div class="flex justify-end gap-2 border-t border-drafting pt-4">
    <a href="/recipes/{recipe.id}" class="px-4 py-2 text-sm text-obsidian/60 hover:text-obsidian">Cancel</a>
    <button
      type="submit"
      disabled={submitting}
      class="border border-ochre text-ochre px-4 py-2 text-sm uppercase tracking-wider hover:bg-ochre hover:text-canvas disabled:opacity-50 rounded-sm"
      data-testid="merge-submit"
    >{submitting ? 'Merging…' : 'Record Merge'}</button>
  </div>
</form>
