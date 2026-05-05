<!-- src/lib/ui/StepsList.svelte -->
<script lang="ts">
  import type { Step, Ingredient } from '$lib/server';

  let { steps, ingredients }: { steps: Step[]; ingredients: Ingredient[] } = $props();

  const ingredientById = $derived(new Map(ingredients.map(i => [i.id, i] as const)));
</script>

{#if steps.length === 0}
  <p class="text-sm text-obsidian/40 italic">No steps recorded.</p>
{:else}
  <ol class="space-y-3 text-sm">
    {#each steps as step, i (i)}
      <li class="flex gap-3" data-testid="step-row" data-step-index={i}>
        <span class="font-mono text-ochre min-w-[24px]">{i + 1}.</span>
        <div class="flex-1 flex flex-col gap-1">
          <span>{step.text}</span>
          {#if step.uses.length > 0}
            <div class="text-xs font-mono text-obsidian/60" data-testid="step-uses">
              {#each step.uses as use, ui (ui)}
                {@const ing = ingredientById.get(use.ingredientId)}
                {#if ing}
                  <span>{use.amount}{ing.unit ? ing.unit : ''} {ing.name}</span>{#if ui < step.uses.length - 1}<span class="text-drafting"> · </span>{/if}
                {/if}
              {/each}
            </div>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
{/if}
