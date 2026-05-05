<!-- src/lib/ui/UsesEditor.svelte -->
<script lang="ts">
  import type { Ingredient, IngredientUse } from '$lib/server';
  import { parseAmount } from './layout/amount-parse';

  let {
    ingredients,
    uses = $bindable([]),
    allUses = []
  }: {
    ingredients: Ingredient[];
    uses?: IngredientUse[];
    allUses?: IngredientUse[];
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

  function remainingFor(ingredientId: string, excludeIndex: number = -1): number {
    const master = masterAmount.get(ingredientId) ?? NaN;
    if (Number.isNaN(master)) return 0;
    let usedOfThis = 0;
    for (const u of allUses) {
      if (u.ingredientId === ingredientId) usedOfThis += u.amount;
    }
    // If we're updating an existing row, exclude its current contribution
    if (excludeIndex >= 0 && uses[excludeIndex] && uses[excludeIndex].ingredientId === ingredientId) {
      usedOfThis -= uses[excludeIndex].amount;
    }
    return Math.max(0, master - usedOfThis);
  }

  function addUse() {
    const firstAvailable = ingredients[0];
    if (!firstAvailable) return;
    const defaultAmount = remainingFor(firstAvailable.id);
    uses = [...uses, { ingredientId: firstAvailable.id, amount: defaultAmount }];
  }

  function removeUse(i: number) {
    uses = uses.filter((_, idx) => idx !== i);
  }

  // Local input strings so the user can type "1/2" without immediately collapsing to 0.5.
  // Sync length to uses.length without reading amountInputs (avoids self-triggering effect).
  let amountInputs = $state<string[]>([]);
  // Track what we last programmatically wrote to each amountInputs slot, so we can
  // distinguish "user typed a new value" from "display still shows the old auto-fill".
  let lastSynced = $state<string[]>([]);
  $effect(() => {
    if (amountInputs.length !== uses.length) {
      const next = uses.map((u, i) => amountInputs[i] ?? String(u.amount));
      amountInputs = next;
      // Reset lastSynced to match; new entries get their amount as the "our write" baseline.
      lastSynced = uses.map((u, i) => lastSynced[i] ?? String(u.amount));
    }
  });

  // When uses[i].amount changes programmatically (e.g. addUse / onchange auto-fill),
  // re-sync the displayed input only if the user hasn't overridden it since we last synced.
  $effect(() => {
    for (let i = 0; i < uses.length; i++) {
      const expected = String(uses[i].amount);
      const current = amountInputs[i];
      if (current === undefined) continue;
      // Only overwrite if display still matches what we last wrote (user hasn't typed a new value).
      const wasOurWrite = lastSynced[i] === undefined || current === lastSynced[i];
      if (wasOurWrite && current !== expected) {
        amountInputs[i] = expected;
        lastSynced[i] = expected;
      }
    }
  });

  function commitAmount(i: number) {
    const parsed = parseAmount(amountInputs[i] ?? '');
    if (parsed !== null) {
      uses[i] = { ...uses[i], amount: parsed };
    }
    // re-sync display and mark so second $effect doesn't overwrite user-committed value
    const synced = String(uses[i].amount);
    amountInputs[i] = synced;
    lastSynced[i] = synced;
  }

  function ingredientById(id: string): Ingredient | undefined {
    return ingredients.find(i => i.id === id);
  }
</script>

<div class="flex flex-col gap-1.5 ml-6 border-l border-drafting pl-3 mt-1">
  <span class="text-[10px] uppercase tracking-wider text-obsidian/50">Ingredients used</span>
  {#each uses as use, i (i)}
    {@const ing = ingredientById(use.ingredientId)}
    <div class="flex gap-2 items-center text-sm" data-testid="use-row">
      <select
        value={use.ingredientId}
        onchange={(e) => {
          const newId = (e.currentTarget as HTMLSelectElement).value;
          const currentAmount = uses[i].amount;
          // Auto-fill remaining only when amount is untouched (== 0). Preserve user-typed values.
          const nextAmount = currentAmount === 0 ? remainingFor(newId, i) : currentAmount;
          uses[i] = { ...uses[i], ingredientId: newId, amount: nextAmount };
        }}
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

  <button
    type="button"
    onclick={addUse}
    disabled={ingredients.length === 0}
    class="border border-dashed border-drafting hover:border-ochre text-ochre text-[10px] uppercase tracking-wider py-1.5 rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
    data-testid="add-use-btn"
  >+ Add Ingredient Use</button>

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
