<!-- src/lib/ui/BatchPickerDropdown.svelte -->
<script lang="ts">
  import type { Batch } from '$lib/server';

  let {
    label = 'Pick a batch',
    candidates,
    excludeId,
    open = $bindable(false),
    onPick
  }: {
    label?: string;
    candidates: Batch[];
    excludeId: string;
    open?: boolean;
    onPick: (batchId: string) => void;
  } = $props();

  const filtered = $derived(candidates.filter(b => b.id !== excludeId));

  function handleSelect(id: string) {
    onPick(id);
    open = false;
  }
</script>

{#if open}
  <div class="relative">
    <div
      class="absolute right-0 top-full mt-1 w-64 max-h-72 overflow-auto bg-canvas border border-obsidian rounded-sm shadow-lg z-40"
      data-testid="batch-picker"
    >
      <div class="px-3 py-2 text-[10px] uppercase tracking-wider text-obsidian/50 border-b border-drafting">
        {label}
      </div>
      {#if filtered.length === 0}
        <p class="px-3 py-3 text-sm text-obsidian/40 italic">No other batches available.</p>
      {:else}
        <ul>
          {#each filtered as candidate (candidate.id)}
            <li>
              <button
                type="button"
                onclick={() => handleSelect(candidate.id)}
                class="w-full text-left px-3 py-2 text-sm hover:bg-drafting/40 flex items-center gap-2"
                data-testid="batch-pick-option"
                data-batch-id={candidate.id}
              >
                <span class="truncate">{candidate.label}</span>
                {#if candidate.status === 'cooked'}
                  <span class="ml-auto text-[10px] uppercase text-juniper">cooked</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}
