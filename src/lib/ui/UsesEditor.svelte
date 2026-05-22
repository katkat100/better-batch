<!-- src/lib/ui/UsesEditor.svelte -->
<script lang="ts">
  import type { Ingredient, IngredientUse } from '$lib/server';
  import { SvelteMap } from 'svelte/reactivity';
  import { parseAmount } from './layout/amount-parse';
  import Button from './primitives/Button.svelte';
  import IconButton from '$lib/ui/primitives/IconButton.svelte';
  import Select from './primitives/Select.svelte';
  import TextInput from './primitives/TextInput.svelte';

  let {
    ingredients,
    uses = $bindable([]),
    allUses = [],
    mismatchedIds = new Set<string>()
  }: {
    ingredients: Ingredient[];
    uses?: IngredientUse[];
    allUses?: IngredientUse[];
    mismatchedIds?: Set<string>;
  } = $props();

  // Map ingredientId → master amount (numeric, may be NaN for non-numeric master amounts)
  const masterAmount = $derived(new Map(
    ingredients.map(i => [i.id, parseAmount(i.amount) ?? NaN] as const)
  ));

  // Sum within THIS step, per ingredient
  const allocated = $derived.by(() => {
    const m = new SvelteMap<string, number>();
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
    const amountStr = String(defaultAmount);
    uses = [...uses, { ingredientId: firstAvailable.id, amount: defaultAmount }];
    amountInputs = [...amountInputs, amountStr];
    lastSynced = [...lastSynced, amountStr];
  }

  function removeUse(i: number) {
    uses = uses.filter((_, idx) => idx !== i);
    amountInputs = amountInputs.filter((_, idx) => idx !== i);
    lastSynced = lastSynced.filter((_, idx) => idx !== i);
  }

  // Local input strings so the user can type "1/2" without immediately collapsing to 0.5.
  // Initialized from uses synchronously so bind:value never receives undefined on first render.
  let amountInputs = $state<string[]>(uses.map(u => String(u.amount)));
  // Track what we last programmatically wrote to each amountInputs slot, so we can
  // distinguish "user typed a new value" from "display still shows the old auto-fill".
  let lastSynced = $state<string[]>(uses.map(u => String(u.amount)));

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
    <div
  class="grid grid-cols-[1fr_6rem_2rem_1.5rem] gap-2 items-center text-sm {mismatchedIds.has(use.ingredientId) ? 'border border-ochre rounded-sm p-1 -m-1' : ''}"
  data-testid="use-row"
  data-use-issue={mismatchedIds.has(use.ingredientId) ? 'sum-mismatch' : undefined}
>
      <Select
        value={use.ingredientId}
        onchange={(e: Event) => {
          const newId = (e.currentTarget as HTMLSelectElement).value;
          const currentAmount = uses[i].amount;
          // Auto-fill remaining only when amount is untouched (== 0). Preserve user-typed values.
          const nextAmount = currentAmount === 0 ? remainingFor(newId, i) : currentAmount;
          uses[i] = { ...uses[i], ingredientId: newId, amount: nextAmount };
        }}
        aria-label="Ingredient for use {i + 1}"
        class="min-w-0"
        data-testid="use-ingredient"
      >
        {#each ingredients as candidate (candidate.id)}
          <option value={candidate.id}>{candidate.name}{candidate.section ? ` (${candidate.section})` : ''}</option>
        {/each}
      </Select>
      <TextInput
        bind:value={amountInputs[i]}
        onblur={() => commitAmount(i)}
        placeholder="Amount"
        aria-label="Amount for use {i + 1}"
        class="font-mono"
        data-testid="use-amount"
      />
      <span class="text-xs text-obsidian/50">{ing?.unit ?? ''}</span>
      <IconButton aria-label="Remove use {i + 1}" onclick={() => removeUse(i)} class="justify-self-center">×</IconButton>
    </div>
  {/each}

  <Button
    variant="dashed"
    onclick={addUse}
    disabled={ingredients.length === 0}
    class="text-sm normal-case tracking-normal"
    data-testid="add-use-btn"
  >+ Add ingredient use</Button>

  {#if uses.length > 0 && ingredients.length > 0}
    <div class="text-[10px] text-obsidian/50 mt-1 flex flex-col gap-y-0.5">
      {#each Array.from(allocated.entries()) as [ingId, sum] (ingId)}
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
