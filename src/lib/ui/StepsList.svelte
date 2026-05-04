<!-- src/lib/ui/StepsList.svelte -->
<script lang="ts">
  let { steps }: { steps: string[] } = $props();
</script>

{#if steps.length === 0}
  <p class="text-sm text-obsidian/40 italic">No steps recorded.</p>
{:else}
  <ol class="space-y-2 text-sm">
    {#each steps as step, i}
      <li class="flex gap-3">
        <span class="font-mono text-ochre min-w-[24px]">{i + 1}.</span>
        <span class="flex-1">{step}</span>
      </li>
    {/each}
  </ol>
{/if}
