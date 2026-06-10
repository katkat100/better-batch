<!-- src/lib/ui/StepEditor.svelte -->
<script lang="ts">
  import IconButton from '$lib/ui/primitives/IconButton.svelte';
  import Button from './primitives/Button.svelte';
  import UsesEditor from './UsesEditor.svelte';
  import type { Ingredient, Step } from '$lib/server';

  let {
    steps = $bindable([]),
    ingredients,
    mismatchedIds = new Set<string>(),
    onAddStep,
    onRemoveStep,
    onMoveStep
  }: {
    steps?: Step[];
    ingredients: Ingredient[];
    mismatchedIds?: Set<string>;
    onAddStep: () => void;
    onRemoveStep: (i: number) => void;
    onMoveStep: (from: number, to: number) => void;
  } = $props();

  const allUses = $derived(steps.flatMap((s) => s.uses));
  const usableIngredients = $derived(ingredients.filter((ing) => ing.id && ing.name));
</script>

<fieldset class="flex flex-col gap-3">
  <legend class="text-label">Steps</legend>
  {#each steps as step, i (i)}
    <div class="flex flex-col gap-2 border border-drafting/50 p-3 rounded-sm" data-testid="step-edit-row">
      <div class="flex gap-2 items-start">
        <div class="flex flex-col w-5 shrink-0 pt-1">
          <IconButton
            aria-label="Move step {i + 1} up"
            onclick={() => onMoveStep(i, i - 1)}
            disabled={i === 0}
            class="text-[10px]"
            data-testid="step-move-up">▲</IconButton
          >
          <IconButton
            aria-label="Move step {i + 1} down"
            onclick={() => onMoveStep(i, i + 1)}
            disabled={i === steps.length - 1}
            class="text-[10px]"
            data-testid="step-move-down">▼</IconButton
          >
        </div>
        <span class="font-mono text-xs text-obsidian/60 pt-2">{i + 1}.</span>
        <textarea
          bind:value={step.text}
          rows="2"
          aria-label="Step {i + 1} text"
          class="border border-drafting bg-canvas px-2 py-1.5 rounded-sm flex-1 text-sm resize-none outline-none focus:border-ochre focus:ring-1 focus:ring-ochre"
          data-testid="step-text"
        ></textarea>
        <IconButton aria-label="Remove step {i + 1}" onclick={() => onRemoveStep(i)} class="pt-2">×</IconButton>
      </div>
      <UsesEditor
        bind:uses={step.uses}
        ingredients={usableIngredients}
        {allUses}
        {mismatchedIds}
      />
    </div>
  {/each}
  <Button
    type="button"
    onclick={onAddStep}
    variant="dashed"
    class="text-sm normal-case tracking-normal"
    data-testid="add-step-btn">+ Add step</Button
  >
</fieldset>
