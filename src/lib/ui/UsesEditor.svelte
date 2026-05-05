<!-- src/lib/ui/UsesEditor.svelte -->
<script lang="ts">
  import type { Ingredient, IngredientUse } from '$lib/server';
  import { parseAmount } from './layout/amount-parse';

  let {
    ingredients,
    uses = $bindable([])
  }: {
    ingredients: Ingredient[];
    uses?: IngredientUse[];
  } = $props();

  // Map ingredientId → master amount (numeric, may be NaN for non-numeric master amounts)
  const masterAmount = $derived(new Map(
    ingredients.map(i => [i.id, parseAmount(i.amount) ?? NaN] as const)
  ));

  // Sum within THIS step, per ingredient
  const allocated = $derived.by(() => {
    const m = new Map<string, number>();
    for (const u of uses) m.set(u.ingredientId, (m.get(u.ingredientId) ?? 0) + u.amount);
    return m;
  });

  function addUse() {
    const firstAvailable = ingredients[0];
    if (!firstAvailable) return;
    uses = [...uses, { ingredientId: firstAvailable.id, amount: 0 }];
  }

  function removeUse(i: number) {
    uses = uses.filter((_, idx) => idx !== i);
  }

  // Local input strings so the user can type "1/2" without immediately collapsing to 0.5.
  // Sync length to uses.length without reading amountInputs (avoids self-triggering effect).
  let amountInputs = $state<string[]>([]);
  $effect(() => {
    if (amountInputs.length !== uses.length) {
      const next = uses.map((u, i) => amountInputs[i] ?? String(u.amount));
      amountInputs = next;
    }
  });

  function commitAmount(i: number) {
    const parsed = parseAmount(amountInputs[i] ?? '');
    if (parsed !== null) {
      uses[i] = { ...uses[i], amount: parsed };
    }
    // re-sync display
    amountInputs[i] = String(uses[i].amount);
  }

  function ingredientById(id: string): Ingredient | undefined {
    return ingredients.find(i => i.id === id);
  }
</script>

<div class="flex flex-col gap-1.5 ml-6 border-l border-drafting pl-3 mt-1">
  <div class="flex items-center justify-between">
    <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Ingredients used</span>
    <button type="button" onclick={addUse} class="text-xs text-ochre" disabled={ingredients.length === 0} data-testid="add-use-btn">+ Add</button>
  </div>
  {#each uses as use, i (i)}
    {@const ing = ingredientById(use.ingredientId)}
    <div class="flex gap-2 items-center text-sm" data-testid="use-row">
      <select
        value={use.ingredientId}
        onchange={(e) => uses[i] = { ...uses[i], ingredientId: (e.currentTarget as HTMLSelectElement).value }}
        class="border border-drafting bg-canvas px-2 py-1 rounded-sm flex-1"
        data-testid="use-ingredient"
      >
        {#each ingredients as candidate (candidate.id)}
          <option value={candidate.id}>{candidate.name}{candidate.section ? ` (${candidate.section})` : ''}</option>
        {/each}
      </select>
      <input
        type="text"
        bind:value={amountInputs[i]}
        onblur={() => commitAmount(i)}
        placeholder="Amount"
        class="border border-drafting bg-canvas px-2 py-1 rounded-sm w-24 text-sm font-mono"
        data-testid="use-amount"
      />
      <span class="text-xs text-obsidian/50 min-w-[24px]">{ing?.unit ?? ''}</span>
      <button type="button" onclick={() => removeUse(i)} class="text-obsidian/40 hover:text-ochre">×</button>
    </div>
  {/each}

  {#if uses.length > 0 && ingredients.length > 0}
    <div class="text-[10px] text-obsidian/50 mt-1 flex flex-wrap gap-x-3">
      {#each Array.from(allocated.entries()) as [ingId, sum]}
        {@const ing = ingredientById(ingId)}
        {@const master = masterAmount.get(ingId) ?? NaN}
        {#if ing}
          {@const overflowing = !Number.isNaN(master) && sum > master}
          <span class={overflowing ? 'text-ochre' : ''} data-testid="allocation-indicator" data-ingredient={ingId}>
            {sum}/{Number.isNaN(master) ? '?' : master}{ing.unit} {ing.name}
          </span>
        {/if}
      {/each}
    </div>
  {/if}
</div>
